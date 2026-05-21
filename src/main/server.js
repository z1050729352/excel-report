/**
 * Express 服务器 - 用于分享报告
 * 启动本地服务器，生成可访问的链接
 */

import express from 'express'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app as electronApp } from 'electron'

let server = null
let serverPort = 3000
let reportCache = new Map() // 存储报告 ID -> HTML 的映射

/**
 * 启动服务器
 */
export function startServer(port = 3000) {
  if (server) {
    console.log('[Server] 服务器已在运行')
    return { success: true, port: serverPort }
  }
  
  serverPort = port
  const app = express()
  
  // 静态文件目录
  const userDataPath = electronApp.getPath('userData')
  const reportsDir = join(userDataPath, 'reports')
  
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true })
  }
  
  // 提供静态文件
  app.use('/reports', express.static(reportsDir))
  
  // 根路径
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>烟草订货管理系统</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 500px;
          }
          h1 {
            color: #1890FF;
            margin-bottom: 20px;
          }
          p {
            color: #595959;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 烟草订货管理系统</h1>
          <p>报告分享服务器正在运行</p>
          <p style="margin-top: 20px; font-size: 14px; color: #8C8C8C;">
            请通过桌面端生成报告链接
          </p>
        </div>
      </body>
      </html>
    `)
  })
  
  // 动态报告路由（从缓存读取）
  app.get('/report/:id', (req, res) => {
    const reportId = req.params.id
    const html = reportCache.get(reportId)
    
    if (html) {
      res.send(html)
    } else {
      res.status(404).send(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>报告不存在</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              text-align: center;
              max-width: 500px;
            }
            h1 {
              color: #FF4D4F;
              margin-bottom: 20px;
            }
            p {
              color: #595959;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ 报告不存在</h1>
            <p>该报告可能已过期或链接无效</p>
          </div>
        </body>
        </html>
      `)
    }
  })
  
  // 启动服务器
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(port, () => {
        console.log(`[Server] 服务器已启动: http://localhost:${port}`)
        resolve({ success: true, port })
      })
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[Server] 端口 ${port} 被占用，尝试 ${port + 1}`)
          serverPort = port + 1
          resolve(startServer(serverPort))
        } else {
          reject(err)
        }
      })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 停止服务器
 */
export function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[Server] 服务器已停止')
        server = null
        resolve({ success: true })
      })
    } else {
      resolve({ success: true, message: '服务器未运行' })
    }
  })
}

/**
 * 生成报告链接
 * @param {string} html - 报告 HTML 内容
 * @returns {string} 访问链接
 */
export function generateReportLink(html) {
  const reportId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  reportCache.set(reportId, html)
  
  // 5 分钟后自动清理
  setTimeout(() => {
    reportCache.delete(reportId)
    console.log(`[Server] 报告 ${reportId} 已过期`)
  }, 5 * 60 * 1000)
  
  const link = `http://localhost:${serverPort}/report/${reportId}`
  console.log(`[Server] 生成报告链接: ${link}`)
  
  return link
}

/**
 * 获取服务器状态
 */
export function getServerStatus() {
  return {
    running: server !== null,
    port: serverPort,
    reportCount: reportCache.size
  }
}

/**
 * 获取本机 IP 地址
 */
export function getLocalIP() {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // 跳过内部地址和非 IPv4 地址
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  
  return 'localhost'
}
