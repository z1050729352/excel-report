"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  // 文件对话框
  openFileDialog: (opts) => electron.ipcRenderer.invoke("open-file-dialog", opts),
  // 数据导入
  importMerchants: (filePath) => electron.ipcRenderer.invoke("import-merchants", filePath),
  importProducts: (filePath) => electron.ipcRenderer.invoke("import-products", filePath),
  importChanges: (filePath) => electron.ipcRenderer.invoke("import-changes", filePath),
  // 调试
  debugChanges: (filePath) => electron.ipcRenderer.invoke("debug-changes", filePath),
  // 数据操作
  applyChanges: () => electron.ipcRenderer.invoke("apply-changes"),
  clearAllData: () => electron.ipcRenderer.invoke("clear-all-data"),
  // 查询
  queryMerchant: (licenseNo) => electron.ipcRenderer.invoke("query-merchant", licenseNo),
  getAllMerchants: () => electron.ipcRenderer.invoke("get-all-merchants"),
  // 报告生成
  generateOrderPlan: (opts) => electron.ipcRenderer.invoke("generate-order-plan", opts),
  shareReport: (opts) => electron.ipcRenderer.invoke("share-report", opts),
  // 服务器管理
  startServer: () => electron.ipcRenderer.invoke("start-server"),
  stopServer: () => electron.ipcRenderer.invoke("stop-server"),
  getServerStatus: () => electron.ipcRenderer.invoke("get-server-status"),
  // 统计信息
  getStats: () => electron.ipcRenderer.invoke("get-stats"),
  // Excel 预览
  previewExcel: (filePath) => electron.ipcRenderer.invoke("preview-excel", filePath)
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error("[preload] contextBridge 错误:", error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
