import express from 'express'
import bcrypt from 'bcrypt'
import { query } from '../models/db.js'
import { generateToken, authMiddleware } from '../middleware/auth.js'

const router = express.Router()

/**
 * POST /api/auth/login
 * 管理员登录
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '请输入用户名和密码'
      })
    }
    
    // 查询用户
    const users = await query(
      'SELECT id, username, password, role FROM users WHERE username = ?',
      [username]
    )
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      })
    }
    
    const user = users[0]
    
    // 验证密码
    const isValid = await bcrypt.compare(password, user.password)
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      })
    }
    
    // 生成 token
    const token = generateToken(user)
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (err) {
    console.error('[Auth] 登录失败:', err)
    res.status(500).json({
      success: false,
      error: '登录失败，请稍后重试'
    })
  }
})

/**
 * POST /api/auth/logout
 * 退出登录（客户端删除 token 即可）
 */
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: '退出登录成功'
  })
})

/**
 * GET /api/auth/check
 * 检查登录状态
 */
router.get('/check', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user
  })
})

/**
 * PUT /api/auth/password
 * 修改密码
 */
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const userId = req.user.id

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '请输入原密码和新密码' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码不能少于6位' })
    }

    const users = await query('SELECT password FROM users WHERE id = ?', [userId])
    if (!users.length) {
      return res.status(404).json({ success: false, error: '用户不存在' })
    }

    const isValid = await bcrypt.compare(oldPassword, users[0].password)
    if (!isValid) {
      return res.status(400).json({ success: false, error: '原密码错误' })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await query('UPDATE users SET password = ? WHERE id = ?', [hash, userId])

    res.json({ success: true, message: '密码修改成功' })
  } catch (err) {
    console.error('[Auth] 修改密码失败:', err)
    res.status(500).json({ success: false, error: '修改密码失败，请稍后重试' })
  }
})

export default router
