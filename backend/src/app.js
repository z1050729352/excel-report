import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import { initDB, closeDB } from './models/db.js'

// 路由
import authRoutes from './routes/auth.js'
import merchantRoutes from './routes/merchant.js'
import adminRoutes from './routes/admin.js'

const app = express()

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/merchant', merchantRoutes)
app.use('/api/admin', adminRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '服务运行正常',
    timestamp: new Date().toISOString()
  })
})

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  })
})

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err)
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  })
})

// 初始化数据库
initDB()

// 启动服务器
const server = app.listen(config.port, () => {
  console.log('='.repeat(60))
  console.log('🚀 烟草订货管理系统 - 后端服务启动成功')
  console.log('='.repeat(60))
  console.log(`📡 服务地址: http://localhost:${config.port}`)
  console.log(`🗄️  数据库: MySQL ${config.db.host}:${config.db.port}/${config.db.database}`)
  console.log(`🔐 JWT Secret: ${config.jwt.secret.substring(0, 20)}...`)
  console.log(`📝 环境: ${config.nodeEnv}`)
  console.log('='.repeat(60))
  console.log('📚 API 文档:')
  console.log('  - POST   /api/auth/login           # 管理员登录')
  console.log('  - GET    /api/auth/check           # 检查登录状态')
  console.log('  - GET    /api/merchant/:licenseNo  # 查询商户信息（C端）')
  console.log('  - POST   /api/merchant/plan        # 生成订货方案（C端）')
  console.log('  - GET    /api/admin/merchants      # 商户列表（B端）')
  console.log('  - POST   /api/admin/import/*       # 数据导入（B端）')
  console.log('  - GET    /api/admin/changes        # 获取更变列表（B端）')
  console.log('  - POST   /api/admin/changes/apply  # 应用更变（B端）')
  console.log('='.repeat(60))
})

// 优雅关闭
function shutdown() {
  console.log('\n正在关闭服务器...')
  server.close(async () => {
    await closeDB()
    console.log('服务器已关闭')
    process.exit(0)
  })
  
  // 强制退出
  setTimeout(() => {
    console.error('强制关闭服务器')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default app
