/**
 * Express 应用工厂：只定义路由，不 listen
 * Electron 内嵌服务与独立 Web 服务共用此模块
 */

import express from 'express'
import multer from 'multer'
import { join } from 'path'
import { existsSync } from 'fs'

import {
  clearAllData,
  insertMerchants,
  insertProducts,
  insertSegCaps,
  insertChanges,
  applyChanges,
  getMerchantByLicense,
  getProductsByTier,
  getSegCapsByTier,
  getAllMerchants,
  getStats,
  parseMerchantSheetFromBuffer,
  parseProductSheetFromBuffer,
  parseChangeSheetFromBuffer,
  previewExcelFromBuffer,
  optimizeOrder,
  generateOrderGuide,
  generateReportHTML,
  normalizeTier
} from '../core/index.js'

import { saveReport, getReport, getReportCount, getReportsDir, getLocalIP } from './reports.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
})

/** multer/busboy 常把 UTF-8 中文文件名按 latin1 解析，导致乱码 */
function decodeUploadFilename(name) {
  if (!name) return 'upload.xlsx'
  if (/[\u4e00-\u9fff]/.test(name)) return name
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    if (/[\u4e00-\u9fff]/.test(decoded)) return decoded
  } catch {
    /* ignore */
  }
  return name
}

const REPORT_NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>报告不存在</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:20px}
    .container{background:white;padding:40px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center;max-width:500px}
    h1{color:#FF4D4F;margin-bottom:20px}p{color:#595959}
  </style>
</head>
<body><div class="container"><h1>报告不存在</h1><p>该报告可能已过期或链接无效</p></div></body>
</html>`

/**
 * @param {{ mode?: 'web' | 'electron', staticDir?: string | null }} [options]
 */
export function createApp(options = {}) {
  const mode = options.mode || 'web'
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  const reportsDir = getReportsDir()
  if (reportsDir) {
    app.use('/reports', express.static(reportsDir))
  }

  app.get('/api/stats', (_req, res) => {
    try {
      res.json({ success: true, stats: getStats() })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.get('/api/merchants', (_req, res) => {
    try {
      res.json({ success: true, merchants: getAllMerchants() })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.get('/api/merchants/:licenseNo', (req, res) => {
    try {
      const merchant = getMerchantByLicense(req.params.licenseNo)
      if (!merchant) {
        return res.status(404).json({ success: false, error: '未找到该商户' })
      }
      const products = getProductsByTier(merchant.tier)
      res.json({
        success: true,
        merchant,
        products,
        productCount: products.length
      })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/orders/plan', (req, res) => {
    try {
      const licenseNo = req.body?.licenseNo
      if (!licenseNo) {
        return res.status(400).json({ success: false, error: '缺少 licenseNo' })
      }
      const merchant = getMerchantByLicense(licenseNo)
      if (!merchant) {
        return res.status(404).json({ success: false, error: '未找到该商户' })
      }
      const products = getProductsByTier(merchant.tier)
      const segCaps = getSegCapsByTier(normalizeTier(merchant.tier))
      const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier, segCaps)
      const orderGuide = generateOrderGuide(merchant, products, orderPlan)
      res.json({ success: true, orderGuide })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/reports/share', (req, res) => {
    try {
      const licenseNo = req.body?.licenseNo
      if (!licenseNo) {
        return res.status(400).json({ success: false, error: '缺少 licenseNo' })
      }
      const merchant = getMerchantByLicense(licenseNo)
      if (!merchant) {
        return res.status(404).json({ success: false, error: '未找到该商户' })
      }
      const products = getProductsByTier(merchant.tier)
      const segCaps = getSegCapsByTier(normalizeTier(merchant.tier))
      const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier, segCaps)
      const orderGuide = generateOrderGuide(merchant, products, orderPlan)
      const html = generateReportHTML(orderGuide)
      const reportId = saveReport(html)
      res.json({
        success: true,
        reportId,
        localIP: getLocalIP()
      })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/import/:type', upload.single('file'), (req, res) => {
    try {
      const type = req.params.type
      if (!['merchants', 'products', 'changes'].includes(type)) {
        return res.status(400).json({ success: false, error: '无效的导入类型' })
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: '未上传文件' })
      }

      const buffer = req.file.buffer
      const fileName = decodeUploadFilename(req.file.originalname)
      let count = 0
      let changes = null

      if (type === 'merchants') {
        const merchants = parseMerchantSheetFromBuffer(buffer)
        insertMerchants(merchants)
        count = merchants.length
      } else if (type === 'products') {
        const { products, segCaps } = parseProductSheetFromBuffer(buffer)
        insertProducts(products)
        if (segCaps.length > 0) insertSegCaps(segCaps)
        count = products.length
      } else {
        changes = parseChangeSheetFromBuffer(buffer)
        insertChanges(changes)
        count = changes.length
      }

      const payload = { success: true, count, fileName }
      if (type === 'changes') {
        payload.changes = changes
      }
      res.json(payload)
    } catch (err) {
      console.error('[API] 导入失败:', err)
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/excel/preview', upload.single('file'), (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: '未上传文件' })
      }
      res.json(previewExcelFromBuffer(req.file.buffer))
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/changes/apply', (_req, res) => {
    try {
      const count = applyChanges()
      res.json({ success: true, count })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/data/clear', (_req, res) => {
    try {
      clearAllData()
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.get('/api/server/status', (_req, res) => {
    if (mode === 'web') {
      return res.json({
        running: true,
        alwaysOn: true,
        port: Number(process.env.PORT) || 3000,
        reportCount: getReportCount()
      })
    }
    res.json({
      running: true,
      alwaysOn: false,
      port: Number(process.env.PORT) || 3000,
      reportCount: getReportCount()
    })
  })

  app.get('/report/:id', (req, res) => {
    const html = getReport(req.params.id)
    if (html) {
      res.type('html').send(html)
    } else {
      res.status(404).type('html').send(REPORT_NOT_FOUND_HTML)
    }
  })

  const staticDir = options.staticDir
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api') || req.path.startsWith('/report')) return next()
      if (req.path.includes('.')) return next()
      res.sendFile(join(staticDir, 'index.html'), (err) => {
        if (err) next()
      })
    })
  } else if (mode === 'web') {
    app.get('/', (_req, res) => {
      res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>烟草订货管理系统</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F0F2F5}
.box{background:#fff;padding:32px;border-radius:12px;text-align:center;max-width:420px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{color:#1890FF;font-size:22px}p{color:#595959;line-height:1.6}</style></head>
<body><div class="box"><h1>烟草订货管理系统</h1><p>API 服务已启动。请运行 <code>npm run build:web</code> 后使用 <code>npm run start:web</code>，或开发时使用 <code>npm run dev:web</code>。</p></div></body></html>`)
    })
  }

  return app
}

export function resolveDefaultStaticDir() {
  return join(process.cwd(), 'dist-web')
}
