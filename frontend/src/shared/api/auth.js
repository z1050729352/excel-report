import request from './request'

export const authAPI = {
  // 登录
  login(data) {
    return request.post('/auth/login', data)
  },
  
  // 注册
  register(data) {
    return request.post('/auth/register', data)
  },
  
  // 退出登录
  logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },
  
  // 获取当前用户信息
  getCurrentUser() {
    return request.get('/auth/me')
  },
  
  // 修改密码
  changePassword(data) {
    return request.post('/auth/change-password', data)
  }
}
