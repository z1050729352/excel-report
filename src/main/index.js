import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  initDatabase,
  clearAllData,
  insertMerchants,
  insertProducts,
  insertChanges,
  applyChanges,
  getMerchantByLicense,
  getProductsByTier,
  getSegCapsByTier,
  insertSegCaps,
  getAllMerchants,
  getStats,
  closeDatabase,
  parseMerchantSheet,
  parseProductSheet,
  parseChangeSheet,
  previewExcel,
  optimizeOrder,
  generateOrderGuide,
  generateReportHTML,
  normalizeTier
} from '../core/index.js'

import { initReports, saveReport } from '../server/reports.js'
import {
  startEmbeddedServer,
  stopEmbeddedServer,
  getEmbeddedServerStatus,
  getLocalIP
} from '../server/runtime.js'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.on('close', () => {
    closeDatabase()
    stopEmbeddedServer()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('open-file-dialog', async (_e, { title, filters }) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: title || '选择 Excel 文件',
    filters: filters || [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

ipcMain.handle('preview-excel', async (_e, filePath) => {
  try {
    return previewExcel(filePath)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('debug-changes', async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath)
    return { success: true, changes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('import-merchants', async (_e, filePath) => {
  try {
    const merchants = parseMerchantSheet(filePath)
    insertMerchants(merchants)
    return { success: true, count: merchants.length }
  } catch (err) {
    console.error('[IPC] 导入商户信息失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('import-products', async (_e, filePath) => {
  try {
    const { products, segCaps } = parseProductSheet(filePath)
    insertProducts(products)
    if (segCaps.length > 0) insertSegCaps(segCaps)
    return { success: true, count: products.length }
  } catch (err) {
    console.error('[IPC] 导入货源表失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('import-changes', async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath)
    insertChanges(changes)
    return { success: true, count: changes.length, changes }
  } catch (err) {
    console.error('[IPC] 导入信息更变表失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('apply-changes', async () => {
  try {
    const count = applyChanges()
    return { success: true, count }
  } catch (err) {
    console.error('[IPC] 应用更变失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('query-merchant', async (_e, licenseNo) => {
  try {
    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }
    const products = getProductsByTier(merchant.tier)
    return {
      success: true,
      merchant,
      products,
      productCount: products.length
    }
  } catch (err) {
    console.error('[IPC] 查询商户失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('generate-order-plan', async (_e, { licenseNo }) => {
  try {
    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }
    const products = getProductsByTier(merchant.tier)
    const segCaps = getSegCapsByTier(normalizeTier(merchant.tier))
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier, segCaps)
    const orderGuide = generateOrderGuide(merchant, products, orderPlan)
    return { success: true, orderGuide }
  } catch (err) {
    console.error('[IPC] 生成订货方案失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('share-report', async (_e, { licenseNo }) => {
  try {
    const status = getEmbeddedServerStatus()
    if (!status.running) {
      await startEmbeddedServer()
    }

    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }

    const products = getProductsByTier(merchant.tier)
    const segCaps = getSegCapsByTier(normalizeTier(merchant.tier))
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier, segCaps)
    const orderGuide = generateOrderGuide(merchant, products, orderPlan)
    const html = generateReportHTML(orderGuide)
    const reportId = saveReport(html)

    const port = getEmbeddedServerStatus().port
    const localIP = getLocalIP()
    const link = `http://localhost:${port}/report/${reportId}`
    const networkLink = `http://${localIP}:${port}/report/${reportId}`

    return {
      success: true,
      reportId,
      link,
      networkLink,
      qrData: networkLink
    }
  } catch (err) {
    console.error('[IPC] 分享报告失败:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('start-server', async () => {
  try {
    return await startEmbeddedServer()
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('stop-server', async () => {
  try {
    return await stopEmbeddedServer()
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-server-status', async () => {
  return getEmbeddedServerStatus()
})

ipcMain.handle('get-stats', async () => {
  try {
    return { success: true, stats: getStats() }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-all-merchants', async () => {
  try {
    return { success: true, merchants: getAllMerchants() }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('clear-all-data', async () => {
  try {
    clearAllData()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tobacco.order')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // 开发模式沿用项目 data/，打包后使用 userData，避免 cwd 不确定
  const dbDir = app.isPackaged
    ? join(app.getPath('userData'), 'data')
    : join(process.cwd(), 'data')
  const reportsDir = app.isPackaged
    ? join(app.getPath('userData'), 'reports')
    : join(process.cwd(), 'data', 'reports')
  initDatabase({ dbDir })
  initReports(reportsDir)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
