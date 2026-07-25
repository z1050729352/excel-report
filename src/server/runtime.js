/**
 * Electron 内嵌 HTTP 服务运行时
 * 复用 createApp()，对外暴露 start/stop/status
 */

import { createApp } from './app.js'
import { getReportCount, getLocalIP } from './reports.js'

let server = null
let serverPort = 3000

export async function startEmbeddedServer(port = 3000) {
  if (server) {
    return { success: true, port: serverPort }
  }

  serverPort = port
  const app = createApp({ mode: 'electron' })

  return new Promise((resolve, reject) => {
    const tryListen = (p) => {
      const s = app.listen(p, '0.0.0.0', () => {
        server = s
        serverPort = p
        console.log(`[Server] 内嵌服务已启动: http://localhost:${p}`)
        resolve({ success: true, port: p })
      })

      s.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[Server] 端口 ${p} 被占用，尝试 ${p + 1}`)
          tryListen(p + 1)
        } else {
          reject(err)
        }
      })
    }

    tryListen(port)
  })
}

export function stopEmbeddedServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve({ success: true, message: '服务器未运行' })
      return
    }
    server.close(() => {
      console.log('[Server] 内嵌服务已停止')
      server = null
      resolve({ success: true })
    })
  })
}

export function getEmbeddedServerStatus() {
  return {
    running: server !== null,
    alwaysOn: false,
    port: serverPort,
    reportCount: getReportCount()
  }
}

export { getLocalIP }
