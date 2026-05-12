/**
 * aiConfig.js - AI 配置
 * 默认使用智谱 GLM-4-Flash（免费）
 */

// 默认内置的 API Key（你的 Key，打包时会一起进应用）
export const DEFAULT_API_KEY = 'e32a0d619785477b93dc4d97cecdb546.qgSYJKPZxttVcEay'

// 智谱 AI 的 API 端点
export const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

// 默认模型（免费）
export const DEFAULT_MODEL = 'glm-4-flash'

// 从用户设置或环境变量读取 API Key，没有就用默认
export function getApiKey() {
  return process.env.GLM_API_KEY || DEFAULT_API_KEY
}
