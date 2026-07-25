/**
 * Web 独立启动入口
 * 启动方式：node --experimental-default-type=module src/server/index.js
 */

import { join } from 'path'
import { initDatabase, closeDatabase } from '../core/index.js'
import { initReports } from './reports.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const DB_DIR = process.env.DB_DIR || join(process.cwd(), 'data')
const REPORTS_DIR = process.env.REPORTS_DIR || join(DB_DIR, 'reports')
const STATIC_DIR = process.env.STATIC_DIR || join(process.cwd(), 'dist-web')

initDatabase({ dbDir: DB_DIR })
initReports(REPORTS_DIR)

const app = createApp({
  mode: 'web',
  staticDir: STATIC_DIR
})

const server = app.listen(PORT, HOST, () => {
  console.log(`[Web] 服务已启动: http://localhost:${PORT}`)
  console.log(`[Web] 数据库目录: ${DB_DIR}`)
  console.log(`[Web] 报告目录: ${REPORTS_DIR}`)
})

function shutdown() {
  console.log('[Web] 正在关闭...')
  server.close(() => {
    closeDatabase()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
