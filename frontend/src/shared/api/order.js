import request from './request'

export const orderAPI = {
  // 获取订单列表
  getOrders(params) {
    return request.get('/orders', { params })
  },
  
  // 获取订单详情
  getOrder(id) {
    return request.get(`/orders/${id}`)
  },
  
  // 创建订单
  createOrder(data) {
    return request.post('/orders', data)
  },
  
  // 更新订单
  updateOrder(id, data) {
    return request.put(`/orders/${id}`, data)
  },
  
  // 删除订单
  deleteOrder(id) {
    return request.delete(`/orders/${id}`)
  },
  
  // 更新订单状态
  updateOrderStatus(id, status) {
    return request.patch(`/orders/${id}/status`, { status })
  },
  
  // 获取订单统计
  getOrderStats(params) {
    return request.get('/orders/stats', { params })
  },
  
  // 取消订单
  cancelOrder(id, reason) {
    return request.post(`/orders/${id}/cancel`, { reason })
  }
}
