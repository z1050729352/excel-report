import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // 文件对话框
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  
  // 数据导入
  importMerchants: (filePath) => ipcRenderer.invoke('import-merchants', filePath),
  importProducts: (filePath) => ipcRenderer.invoke('import-products', filePath),
  importChanges: (filePath) => ipcRenderer.invoke('import-changes', filePath),
  
  // 调试
  debugChanges: (filePath) => ipcRenderer.invoke('debug-changes', filePath),
  
  // 数据操作
  applyChanges: () => ipcRenderer.invoke('apply-changes'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  
  // 查询
  queryMerchant: (licenseNo) => ipcRenderer.invoke('query-merchant', licenseNo),
  getAllMerchants: () => ipcRenderer.invoke('get-all-merchants'),
  
  // 报告生成
  generateOrderPlan: (opts) => ipcRenderer.invoke('generate-order-plan', opts),
  shareReport: (opts) => ipcRenderer.invoke('share-report', opts),
  
  // 服务器管理
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // 统计信息
  getStats: () => ipcRenderer.invoke('get-stats'),
  
  // Excel 预览
  previewExcel: (filePath) => ipcRenderer.invoke('preview-excel', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[preload] contextBridge 错误:', error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
