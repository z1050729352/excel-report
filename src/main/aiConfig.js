/**
 * aiConfig.js - AI 配置
 * 默认使用智谱 GLM-4-Flash（免费）
 * API Key 从 .env 文件或环境变量读取，不要硬编码在代码中
 */

// 智谱 AI 的 API 端点
export const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

// 默认模型（免费）
export const DEFAULT_MODEL = 'glm-4-flash'

// 从环境变量读取 API Key（通过 .env 文件或系统环境变量设置）
export function getApiKey() {
  const key = process.env.GLM_API_KEY
  if (!key) {
    console.warn('[aiConfig] 未检测到 GLM_API_KEY，请在项目根目录 .env 文件中配置')
  }
  return key || ''
}
