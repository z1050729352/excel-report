/**
 * 报告存储：内存缓存 + 落盘持久化
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'
import { networkInterfaces } from 'os'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 小时

let reportsDir = null
const reportCache = new Map()
const expiryTimers = new Map()

export function initReports(dir) {
  reportsDir = dir
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true })
  }
  loadPersistedReports()
  return reportsDir
}

export function getReportsDir() {
  return reportsDir
}

function loadPersistedReports() {
  if (!reportsDir || !existsSync(reportsDir)) return

  const files = readdirSync(reportsDir).filter((f) => f.endsWith('.html'))
  const now = Date.now()

  for (const file of files) {
    const id = file.replace(/\.html$/, '')
    const filePath = join(reportsDir, file)
    try {
      const mtime = statSync(filePath).mtimeMs
      if (now - mtime > DEFAULT_TTL_MS) {
        unlinkSync(filePath)
        continue
      }
      const html = readFileSync(filePath, 'utf8')
      reportCache.set(id, html)
      scheduleExpiry(id, DEFAULT_TTL_MS - (now - mtime))
    } catch (err) {
      console.warn(`[Reports] 加载报告失败 ${id}:`, err.message)
    }
  }

  console.log(`[Reports] 已加载 ${reportCache.size} 份持久化报告`)
}

function scheduleExpiry(reportId, ttlMs = DEFAULT_TTL_MS) {
  if (expiryTimers.has(reportId)) {
    clearTimeout(expiryTimers.get(reportId))
  }

  const timer = setTimeout(() => {
    reportCache.delete(reportId)
    expiryTimers.delete(reportId)
    if (reportsDir) {
      const filePath = join(reportsDir, `${reportId}.html`)
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath)
        } catch {
          /* ignore */
        }
      }
    }
    console.log(`[Reports] 报告 ${reportId} 已过期`)
  }, Math.max(ttlMs, 1000))

  if (typeof timer.unref === 'function') {
    timer.unref()
  }
  expiryTimers.set(reportId, timer)
}

/**
 * 保存报告并返回 reportId
 * @param {string} html
 * @returns {string} reportId
 */
export function saveReport(html) {
  const reportId = Date.now().toString(36) + Math.random().toString(36).slice(2)
  reportCache.set(reportId, html)

  if (reportsDir) {
    const filePath = join(reportsDir, `${reportId}.html`)
    writeFileSync(filePath, html, 'utf8')
  }

  scheduleExpiry(reportId)
  console.log(`[Reports] 已保存报告: ${reportId}`)
  return reportId
}

export function getReport(reportId) {
  if (reportCache.has(reportId)) {
    return reportCache.get(reportId)
  }

  if (reportsDir) {
    const filePath = join(reportsDir, `${reportId}.html`)
    if (existsSync(filePath)) {
      const html = readFileSync(filePath, 'utf8')
      reportCache.set(reportId, html)
      return html
    }
  }

  return null
}

export function getReportCount() {
  return reportCache.size
}

export function getLocalIP() {
  const nets = networkInterfaces()

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const family = net.family
      if ((family === 'IPv4' || family === 4) && !net.internal) {
        return net.address
      }
    }
  }

  return 'localhost'
}
