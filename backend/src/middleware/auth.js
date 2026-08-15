import jwt from 'jsonwebtoken'
import config from '../config/index.js'

/**
 * JWT 认证中间件
 */
export function authMiddleware(req, res, next) {
  try {
    // 从请求头获取 token
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }
    
    const token = authHeader.substring(7) // 移除 'Bearer ' 前缀
    
    // 验证 token
    const decoded = jwt.verify(token, config.jwt.secret)
    
    // 将用户信息附加到请求对象
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    }
    
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: '认证令牌已过期，请重新登录'
      })
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }
    
    return res.status(500).json({
      success: false,
      error: '认证失败'
    })
  }
}

/**
 * 生成 JWT token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn
    }
  )
}
