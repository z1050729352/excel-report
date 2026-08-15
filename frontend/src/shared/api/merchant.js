import request from './request'

export const merchantAPI = {
  // 获取商户信息
  getProfile() {
    return request.get('/merchants/profile')
  },
  
  // 更新商户信息
  updateProfile(data) {
    return request.put('/merchants/profile', data)
  },
  
  // 获取商户统计信息
  getStats() {
    return request.get('/merchants/stats')
  },
  
  // 修改密码
  changePassword(data) {
    return request.put('/merchants/password', data)
  }
}
