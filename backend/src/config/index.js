import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 加载环境变量
dotenv.config({ path: join(__dirname, '../../.env') })

export default {
  // 服务器配置
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // 数据库配置
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'tobacco',
    password: process.env.DB_PASSWORD || 'tobacco123',
    database: process.env.DB_NAME || 'tobacco_order',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  },
  
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'tobacco-jwt-secret-key-2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  
  // 文件上传配置
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '20971520') // 20MB
  }
}
