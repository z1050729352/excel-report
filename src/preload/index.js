import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 打开文件选择对话框
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // 打开 Excel（返回 sheet 列表和预览）
  openExcel: (filePath) => ipcRenderer.invoke('open-excel', filePath),

  // 分析 Excel（指定 sheet、起止行）
  analyzeExcel: (opts) => ipcRenderer.invoke('analyze-excel', opts),

  // 旧接口兼容
  parseExcel: (filePath) => ipcRenderer.invoke('parse-excel', filePath),

  // 生成 PDF 报告（支持模板选择）
  generatePdf: (opts) => ipcRenderer.invoke('generate-pdf', opts || {}),

  // 获取报告模板列表
  getReportTemplates: () => ipcRenderer.invoke('get-report-templates'),

  // AI 生成报告规划
  aiReportPlan: (opts) => ipcRenderer.invoke('ai-report-plan', opts),

  // AI 执行摘要
  aiSummary: (opts) => ipcRenderer.invoke('ai-summary', opts || {}),

  // AI 深度洞察
  aiInsights: (opts) => ipcRenderer.invoke('ai-insights', opts || {}),

  // AI 问答
  aiAsk: (opts) => ipcRenderer.invoke('ai-ask', opts),

  // 保存 AI 摘要到缓存
  saveAiSummary: (summary) => ipcRenderer.invoke('save-ai-summary', { summary }),

  // 监听进度更新
  onProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('progress', handler)
    return () => ipcRenderer.removeListener('progress', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('[preload] contextBridge 错误:', error)
  }
} else {
  window.electronAPI = electronAPI
}
