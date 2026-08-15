import request from './request'

export const productAPI = {
  // 获取商品列表
  getProducts(params) {
    return request.get('/products', { params })
  },
  
  // 获取商品详情
  getProduct(id) {
    return request.get(`/products/${id}`)
  },
  
  // 创建商品
  createProduct(data) {
    return request.post('/products', data)
  },
  
  // 更新商品
  updateProduct(id, data) {
    return request.put(`/products/${id}`, data)
  },
  
  // 删除商品
  deleteProduct(id) {
    return request.delete(`/products/${id}`)
  },
  
  // 批量导入商品
  importProducts(formData) {
    return request.post('/products/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  
  // 导出商品
  exportProducts(params) {
    return request.get('/products/export', {
      params,
      responseType: 'blob'
    })
  },
  
  // 更新库存
  updateStock(id, stock) {
    return request.patch(`/products/${id}/stock`, { stock })
  }
}
