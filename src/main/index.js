import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// 导入新模块
import { 
  initDatabase, 
  clearAllData, 
  insertMerchants, 
  insertProducts, 
  insertChanges,
  applyChanges,
  getMerchantByLicense,
  getProductsByTier,
  getAllMerchants,
  getStats,
  closeDatabase
} from './database.js'

import {
  parseMerchantSheet,
  parseProductSheet,
  parseChangeSheet,
  previewExcel
} from './excelParser.js'

import {
  optimizeOrder,
  generateOrderGuide
} from './optimizer.js'

import {
  generateReportHTML
} from './reportGenerator.js'

import {
  startServer,
  stopServer,
  generateReportLink,
  getServerStatus,
  getLocalIP
} from './server.js'

let mainWindow = null

// ─── 主窗口 ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
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
  
  // macOS 点击关闭按钮时真正退出应用
  mainWindow.on('close', () => {
    // 关闭数据库和服务器
    closeDatabase()
    stopServer()
  })
  
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC: 打开文件对话框 ───────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (_e, { title, filters }) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: title || '选择 Excel 文件',
    filters: filters || [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// ─── IPC: 预览 Excel 文件 ──────────────────────────────────────────────────────
ipcMain.handle('preview-excel', async (_e, filePath) => {
  try {
    return previewExcel(filePath)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: 调试更变表 ───────────────────────────────────────────────────────────
ipcMain.handle('debug-changes', async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath)
    return { success: true, changes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: 导入商户信息表 ───────────────────────────────────────────────────────
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

// ─── IPC: 导入货源表 ───────────────────────────────────────────────────────────
ipcMain.handle('import-products', async (_e, filePath) => {
  try {
    const products = parseProductSheet(filePath)
    insertProducts(products)
    return { success: true, count: products.length }
  } catch (err) {
    console.error('[IPC] 导入货源表失败:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 导入信息更变表 ───────────────────────────────────────────────────────
ipcMain.handle('import-changes', async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath)
    insertChanges(changes)
    return { success: true, count: changes.length }
  } catch (err) {
    console.error('[IPC] 导入信息更变表失败:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 应用信息更变 ─────────────────────────────────────────────────────────
ipcMain.handle('apply-changes', async () => {
  try {
    const count = applyChanges()
    return { success: true, count }
  } catch (err) {
    console.error('[IPC] 应用更变失败:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 查询商户信息 ─────────────────────────────────────────────────────────
ipcMain.handle('query-merchant', async (_e, licenseNo) => {
  try {
    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }
    
    // 获取可用货源
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

// ─── IPC: 生成订货方案 ─────────────────────────────────────────────────────────
ipcMain.handle('generate-order-plan', async (_e, { licenseNo }) => {
  try {
    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }
    
    const products = getProductsByTier(merchant.tier)
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier)
    const orderGuide = generateOrderGuide(merchant, products, orderPlan)
    
    return { 
      success: true, 
      orderGuide
    }
  } catch (err) {
    console.error('[IPC] 生成订货方案失败:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 生成报告并分享 ───────────────────────────────────────────────────────
ipcMain.handle('share-report', async (_e, { licenseNo }) => {
  try {
    // 确保服务器已启动
    const status = getServerStatus()
    if (!status.running) {
      await startServer()
    }
    
    // 生成报告
    const merchant = getMerchantByLicense(licenseNo)
    if (!merchant) {
      return { success: false, error: '未找到该商户' }
    }
    
    const products = getProductsByTier(merchant.tier)
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier)
    const orderGuide = generateOrderGuide(merchant, products, orderPlan)
    const html = generateReportHTML(orderGuide)
    
    // 生成链接
    const link = generateReportLink(html)
    const localIP = getLocalIP()
    const networkLink = link.replace('localhost', localIP)
    
    return { 
      success: true, 
      link,
      networkLink,
      qrData: networkLink
    }
  } catch (err) {
    console.error('[IPC] 分享报告失败:', err)
    return { success: false, error: err.message }
  }
})

// ─── IPC: 启动/停止服务器 ──────────────────────────────────────────────────────
ipcMain.handle('start-server', async () => {
  try {
    const result = await startServer()
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('stop-server', async () => {
  try {
    const result = await stopServer()
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-server-status', async () => {
  return getServerStatus()
})

// ─── IPC: 获取统计信息 ─────────────────────────────────────────────────────────
ipcMain.handle('get-stats', async () => {
  try {
    const stats = getStats()
    return { success: true, stats }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: 获取所有商户列表 ─────────────────────────────────────────────────────
ipcMain.handle('get-all-merchants', async () => {
  try {
    const merchants = getAllMerchants()
    return { success: true, merchants }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: 清空所有数据 ─────────────────────────────────────────────────────────
ipcMain.handle('clear-all-data', async () => {
  try {
    clearAllData()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── App 生命周期 ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tobacco.order')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  
  // 初始化数据库
  initDatabase()
  
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  // macOS 也退出应用（不保留在 Dock）
  app.quit()
})
