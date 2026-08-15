import request from './request'

export const reportAPI = {
  // 生成报表
  generateReport(params) {
    return request.get('/reports/generate', { params })
  },
  
  // 导出报表
  exportReport(params) {
    return request.get('/reports/export', {
      params,
      responseType: 'blob'
    })
  },
  
  // 获取销售报表
  getSalesReport(params) {
    return request.get('/reports/sales', { params })
  },
  
  // 获取库存报表
  getInventoryReport(params) {
    return request.get('/reports/inventory', { params })
  },
  
  // 获取商户报表
  getMerchantReport(params) {
    return request.get('/reports/merchant', { params })
  },
  
  // 获取利润报表
  getProfitReport(params) {
    return request.get('/reports/profit', { params })
  },
  
  // 获取历史报表列表
  getReportHistory(params) {
    return request.get('/reports/history', { params })
  },
  
  // 下载历史报表
  downloadReport(id) {
    return request.get(`/reports/${id}/download`, {
      responseType: 'blob'
    })
  }
}
