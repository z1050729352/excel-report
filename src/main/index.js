import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import XLSX from 'xlsx'
import { analyzeData } from './analyzer.js'
import { generateExecutiveSummary, generateInsights, askAboutData, generateReportPlan } from './aiAnalyzer.js'
import { getTemplateList, getTemplate } from './reportTemplates.js'

let mainWindow = null
let reportWindow = null

// 主进程缓存：原始 workbook + 当前分析结果
let cachedWorkbook = null
let cachedFilePath = null
let cachedAnalysisData = null

// ─── 主窗口 ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 18 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createReportWindow() {
  reportWindow = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { sandbox: false, contextIsolation: false, nodeIntegration: false }
  })
  return reportWindow
}

// ─── 工具：从 sheet 按起止行提取数据 ──────────────────────────────────────────
function extractRowsFromSheet(sheet, { startRow = 1, endRow = null, headerRow = null }) {
  // 用 sheet_to_json 的 header: 1 模式（返回二维数组），然后手动裁剪
  const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false })
  if (rawMatrix.length === 0) return { headers: [], rows: [] }

  // 行号从 1 开始更符合用户习惯
  const headerIdx = (headerRow ? headerRow : startRow) - 1
  const dataStartIdx = headerRow ? headerRow : startRow  // 如果指定了 headerRow，数据从下一行开始
  const dataEndIdx = endRow ? endRow : rawMatrix.length

  const headerArr = rawMatrix[headerIdx] || []
  // 生成 headers（空值用列字母代替）
  const headers = headerArr.map((h, i) => {
    if (h !== null && h !== undefined && String(h).trim() !== '') return String(h).trim()
    return `列${i + 1}`
  })

  // 去重 headers（相同名称加后缀）
  const seen = new Map()
  const finalHeaders = headers.map(h => {
    const count = seen.get(h) || 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h}_${count + 1}`
  })

  const rows = []
  for (let i = dataStartIdx; i < dataEndIdx && i < rawMatrix.length; i++) {
    const row = rawMatrix[i]
    if (!row) continue
    // 过滤全空行
    const allEmpty = row.every(v => v === null || v === undefined || v === '')
    if (allEmpty) continue
    // 过滤明显是"小计/总计"的行
    const firstCell = String(row[0] || '').trim()
    if (/^(小计|合计|总计|Total|Subtotal|Sum)/i.test(firstCell)) continue

    const obj = {}
    finalHeaders.forEach((h, j) => { obj[h] = row[j] ?? null })
    rows.push(obj)
  }

  return { headers: finalHeaders, rows }
}

// ─── IPC: 打开 Excel（第一步：只读取 sheet 信息供选择）──────────────────────────
ipcMain.handle('open-excel', async (_e, filePath) => {
  try {
    const buffer = readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    cachedWorkbook = workbook
    cachedFilePath = filePath

    // 为每个 sheet 生成预览（前 20 行 × 前 20 列）
    const sheets = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name]
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false })
      const totalRows = matrix.length
      const totalCols = matrix.reduce((max, row) => Math.max(max, (row || []).length), 0)
      const preview = matrix.slice(0, 30).map(row => (row || []).slice(0, 20))
      return { name, totalRows, totalCols, preview }
    })

    const fileName = filePath.split(/[\\/]/).pop()
    return { success: true, fileName, sheets }
  } catch (err) {
    console.error('[open-excel] 错误:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 分析（指定 sheet 和起止行）──────────────────────────────────────────
ipcMain.handle('analyze-excel', async (_e, { sheetName, startRow, endRow, headerRow }) => {
  const send = (message, percent) => mainWindow?.webContents.send('progress', { message, percent })
  try {
    if (!cachedWorkbook) return { success: false, error: '未加载文件' }
    send('正在解析工作表…', 20)

    const sheet = cachedWorkbook.Sheets[sheetName] || cachedWorkbook.Sheets[cachedWorkbook.SheetNames[0]]
    if (!sheet) return { success: false, error: '工作表不存在' }

    const { headers, rows } = extractRowsFromSheet(sheet, { startRow, endRow, headerRow })
    if (rows.length === 0) return { success: false, error: '未提取到有效数据行，请检查起止行设置' }

    send('正在执行统计分析…', 60)
    const fileName = cachedFilePath.split(/[\\/]/).pop()
    const result = analyzeData(rows, headers, fileName)
    cachedAnalysisData = result

    send('分析完成', 100)
    return { success: true, data: result }
  } catch (err) {
    console.error('[analyze-excel] 错误:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: AI 执行摘要 ────────────────────────────────────────────────────────
ipcMain.handle('ai-summary', async (_e, { apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: '没有分析数据' }
  mainWindow?.webContents.send('progress', { message: 'AI 正在撰写执行摘要…', percent: 40 })
  const result = await generateExecutiveSummary(cachedAnalysisData, { apiKey })
  mainWindow?.webContents.send('progress', { message: result.success ? '摘要生成完成' : '摘要生成失败', percent: 100 })
  return result
})

// ─── IPC: AI 深度洞察 ────────────────────────────────────────────────────────
ipcMain.handle('ai-insights', async (_e, { apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: '没有分析数据' }
  mainWindow?.webContents.send('progress', { message: 'AI 正在生成深度洞察…', percent: 40 })
  const result = await generateInsights(cachedAnalysisData, { apiKey })
  if (result.success && cachedAnalysisData) {
    // 把 AI 洞察合并进缓存数据
    cachedAnalysisData.aiInsights = result.insights
  }
  mainWindow?.webContents.send('progress', { message: result.success ? '洞察生成完成' : '洞察生成失败', percent: 100 })
  return result
})

// ─── IPC: AI 问答 ────────────────────────────────────────────────────────────
ipcMain.handle('ai-ask', async (_e, { question, apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: '没有分析数据' }
  return askAboutData(cachedAnalysisData, question, { apiKey })
})

// ─── IPC: 保存 AI 摘要到缓存（供 PDF 使用）────────────────────────────────────
ipcMain.handle('save-ai-summary', async (_e, { summary }) => {
  if (cachedAnalysisData) cachedAnalysisData.aiSummary = summary || ''
  return { success: true }
})

// ─── IPC: 获取报告模板列表 ────────────────────────────────────────────────────
ipcMain.handle('get-report-templates', async () => {
  return { success: true, templates: getTemplateList() }
})

// ─── IPC: AI 生成报告规划 ────────────────────────────────────────────────────
ipcMain.handle('ai-report-plan', async (_e, { userRequest, apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: '没有分析数据' }
  mainWindow?.webContents.send('progress', { message: 'AI 正在规划报告…', percent: 30 })
  const result = await generateReportPlan(cachedAnalysisData, userRequest, { apiKey })
  mainWindow?.webContents.send('progress', { message: result.success ? '报告规划完成' : '规划失败', percent: 100 })
  return result
})

// ─── IPC: 生成 PDF（支持模板选择）─────────────────────────────────────────────
ipcMain.handle('generate-pdf', async (_e, { templateId, customPlan } = {}) => {
  const send = (message, percent) => mainWindow?.webContents.send('progress', { message, percent })
  const analysisData = cachedAnalysisData
  if (!analysisData) return { success: false, error: '没有可用的分析数据' }

  try {
    send('正在准备报告…', 15)

    // 确定报告配置
    let reportConfig
    if (customPlan) {
      // AI 定制模式：customPlan 包含 reportTitle 和 sections（AI 生成的文字内容）
      reportConfig = { mode: 'ai', ...customPlan }
      console.log('[generate-pdf] 使用 AI 定制方案:', reportConfig.reportTitle, '章节:', JSON.stringify(reportConfig.sections?.map(s => s.title)))
    } else {
      // 预设模板模式
      reportConfig = { mode: 'template', ...(getTemplate(templateId || 'detailed')) }
      console.log('[generate-pdf] 使用预设模板:', reportConfig.id)
    }

    // 注入报告配置到数据中
    const reportData = { ...analysisData, __reportConfig__: reportConfig }

    // 根据模式选择模板文件
    let html
    if (reportConfig.mode === 'ai' && reportConfig.html) {
      // AI 模式：直接使用 AI 生成的 HTML
      html = reportConfig.html
      console.log('[generate-pdf] 使用 AI 生成的 HTML，长度:', html.length)
    } else {
      // 预设模板模式：根据模板 ID 选择对应文件
      const templateMap = {
        detailed: 'report-template.html',
        executive: 'report-executive.html',
        dashboard: 'report-dashboard.html',
        minimal: 'report-minimal.html'
      }
      const templateFile = templateMap[reportConfig.id] || 'report-template.html'
      const templatePath = is.dev
        ? join(process.cwd(), 'src/renderer/src', templateFile)
        : join(__dirname, '../renderer', templateFile)
      console.log('[generate-pdf] 使用模板:', templateFile)
      html = readFileSync(templatePath, 'utf-8')
      html = html.replace('</head>', `<script>window.__REPORT_DATA__ = ${JSON.stringify(reportData)};</script>\n</head>`)
    }

    // 内联 ECharts
    const echartsPath = join(process.cwd(), 'node_modules/echarts/dist/echarts.min.js')
    try {
      const echartsCode = readFileSync(echartsPath, 'utf-8')
      html = html.replace(
        '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>',
        `<script>${echartsCode}</script>`
      )
    } catch (e) {
      console.warn('[generate-pdf] 无法内联 ECharts:', e.message)
    }

    send('正在打开渲染窗口…', 35)

    // 强制重建窗口，避免缓存
    if (reportWindow && !reportWindow.isDestroyed()) {
      reportWindow.destroy()
    }
    createReportWindow()

    await Promise.race([
      new Promise((resolve, reject) => {
        reportWindow.webContents.once('did-finish-load', resolve)
        reportWindow.webContents.once('did-fail-load', (_ev, _code, desc) => reject(new Error(desc)))
        reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('页面加载超时（10s）')), 10000))
    ])

    send('正在渲染图表（约3秒）…', 55)
    await new Promise(r => setTimeout(r, 1000))
    send('正在渲染图表…', 68)
    await new Promise(r => setTimeout(r, 1500))

    send('正在导出 PDF…', 80)

    const pdfBuffer = await Promise.race([
      reportWindow.webContents.printToPDF({
        printBackground: true, pageSize: 'A4', landscape: false,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF 导出超时（30s）')), 30000))
    ])

    send('请选择保存位置…', 90)

    const defaultName = `分析报告_${analysisData.fileName?.replace(/\.[^.]+$/, '') || 'report'}_${Date.now()}.pdf`
    const { filePath: savePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: '保存 PDF 报告', defaultPath: defaultName,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    })

    if (canceled || !savePath) return { success: false, error: '用户取消保存' }

    writeFileSync(savePath, pdfBuffer)
    send('✅ PDF 已保存，正在打开…', 100)
    shell.openPath(savePath)

    return { success: true, path: savePath }
  } catch (err) {
    console.error('[generate-pdf] 错误:', err)
    send(`❌ 失败：${err.message}`, 0)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 旧接口兼容（一步式解析+分析）─────────────────────────────────────────
ipcMain.handle('parse-excel', async (_e, filePath) => {
  const send = (message, percent) => mainWindow?.webContents.send('progress', { message, percent })
  try {
    send('正在读取文件…', 10)
    const buffer = readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    cachedWorkbook = workbook
    cachedFilePath = filePath

    // 默认使用第一个 sheet，从第 1 行开始
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return { success: false, error: '工作表不存在' }

    send('正在解析数据…', 30)
    const { headers, rows } = extractRowsFromSheet(sheet, { startRow: 1, endRow: null, headerRow: null })
    if (rows.length === 0) return { success: false, error: '未提取到有效数据行' }

    send('正在执行统计分析…', 60)
    const fileName = filePath.split(/[\\/]/).pop()
    const result = analyzeData(rows, headers, fileName)
    cachedAnalysisData = result

    send('分析完成', 100)
    return { success: true, data: result }
  } catch (err) {
    console.error('[parse-excel] 错误:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 打开文件对话框 ───────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Excel 文件',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls', 'csv'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// ─── App 生命周期 ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.excel.report')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
