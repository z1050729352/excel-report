"use strict";
const electron = require("electron");
const electronAPI = {
  // 打开文件选择对话框
  openFileDialog: () => electron.ipcRenderer.invoke("open-file-dialog"),
  // 打开 Excel（返回 sheet 列表和预览）
  openExcel: (filePath) => electron.ipcRenderer.invoke("open-excel", filePath),
  // 分析 Excel（指定 sheet、起止行）
  analyzeExcel: (opts) => electron.ipcRenderer.invoke("analyze-excel", opts),
  // 旧接口兼容
  parseExcel: (filePath) => electron.ipcRenderer.invoke("parse-excel", filePath),
  // 生成 PDF 报告
  generatePdf: () => electron.ipcRenderer.invoke("generate-pdf"),
  // AI 执行摘要
  aiSummary: (opts) => electron.ipcRenderer.invoke("ai-summary", opts || {}),
  // AI 深度洞察
  aiInsights: (opts) => electron.ipcRenderer.invoke("ai-insights", opts || {}),
  // AI 问答
  aiAsk: (opts) => electron.ipcRenderer.invoke("ai-ask", opts),
  // 保存 AI 摘要到缓存
  saveAiSummary: (summary) => electron.ipcRenderer.invoke("save-ai-summary", { summary }),
  // 监听进度更新
  onProgress: (callback) => {
    const handler = (_, data) => callback(data);
    electron.ipcRenderer.on("progress", handler);
    return () => electron.ipcRenderer.removeListener("progress", handler);
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
  } catch (error) {
    console.error("[preload] contextBridge 错误:", error);
  }
} else {
  window.electronAPI = electronAPI;
}
