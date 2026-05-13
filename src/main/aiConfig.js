/**
 * aiConfig.js - AI 配置
 * 默认使用智谱 GLM-4-Flash（免费）
 * API Key 从 .env 文件或环境变量读取，不要硬编码在代码中
 */
import { readFileSync } from 'fs'
import { join } from 'path'

// 智谱 AI 的 API 端点
export const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

// 默认模型（免费）
export const DEFAULT_MODEL = 'glm-4-flash'

// 手动从 .env 文件读取（electron 主进程不会自动加载 .env）
let _envKey = ''
try {
  const envPath = join(process.cwd(), '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  const match = envContent.match(/^GLM_API_KEY=(.+)$/m)
  if (match) _envKey = match[1].trim()
} catch (e) {
  // .env 文件不存在，忽略
}

// 从环境变量或 .env 文件读取 API Key
export function getApiKey() {
  const key = process.env.GLM_API_KEY || _envKey
  if (!key) {
    console.warn('[aiConfig] 未检测到 GLM_API_KEY，请在项目根目录 .env 文件中配置')
  }
  return key || ''
}
