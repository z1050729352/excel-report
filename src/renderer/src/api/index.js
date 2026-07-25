/**
 * 环境适配层：Electron 走 preload IPC，浏览器走 REST
 */

const isElectron = typeof window !== 'undefined' && Boolean(window.api)

async function http(path, options = {}) {
  const res = await fetch(path, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok && data.success === undefined) {
    return { success: false, error: data.error || res.statusText || '请求失败' }
  }
  return data
}

function pickFileViaInput(accept = '.xlsx,.xls') {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      input.remove()
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null
      cleanup()
      resolve(file)
    })

    // 用户取消时部分浏览器不触发 change
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.files?.length) {
            cleanup()
            resolve(null)
          }
        }, 300)
      },
      { once: true }
    )

    input.click()
  })
}

const electronAdapter = {
  getStats: () => window.api.getStats(),
  getAllMerchants: () => window.api.getAllMerchants(),
  queryMerchant: (licenseNo) => window.api.queryMerchant(licenseNo),
  generateOrderPlan: (opts) => window.api.generateOrderPlan(opts),
  shareReport: async (opts) => {
    const result = await window.api.shareReport(opts)
    return result
  },
  applyChanges: () => window.api.applyChanges(),
  clearAllData: () => window.api.clearAllData(),
  getServerStatus: () => window.api.getServerStatus(),
  startServer: () => window.api.startServer(),
  stopServer: () => window.api.stopServer(),
  pickAndImport: async (type) => {
    const titles = {
      merchants: '商户信息表',
      products: '货源表',
      changes: '信息更变表'
    }
    const filePath = await window.api.openFileDialog({
      title: `选择${titles[type] || 'Excel 文件'}`,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }]
    })
    if (!filePath) {
      return { success: false, canceled: true }
    }

    let result
    if (type === 'merchants') {
      result = await window.api.importMerchants(filePath)
    } else if (type === 'products') {
      result = await window.api.importProducts(filePath)
    } else {
      result = await window.api.importChanges(filePath)
    }

    if (result.success) {
      result.fileName = filePath.split(/[\\/]/).pop()
    }
    return result
  }
}

const httpAdapter = {
  getStats: () => http('/api/stats'),
  getAllMerchants: () => http('/api/merchants'),
  queryMerchant: (licenseNo) => http(`/api/merchants/${encodeURIComponent(licenseNo)}`),
  generateOrderPlan: (opts) =>
    http('/api/orders/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    }),
  shareReport: async (opts) => {
    const result = await http('/api/reports/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    })
    if (!result.success) return result

    const origin = window.location.origin
    const link = `${origin}/report/${result.reportId}`
    return {
      ...result,
      link,
      networkLink: link,
      qrData: link
    }
  },
  applyChanges: () => http('/api/changes/apply', { method: 'POST' }),
  clearAllData: () => http('/api/data/clear', { method: 'POST' }),
  getServerStatus: () => http('/api/server/status'),
  startServer: async () => ({ success: true, message: 'Web 模式服务常驻运行' }),
  stopServer: async () => ({ success: false, error: 'Web 模式不支持停止服务' }),
  pickAndImport: async (type) => {
    const file = await pickFileViaInput('.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    if (!file) {
      return { success: false, canceled: true }
    }

    const form = new FormData()
    form.append('file', file)

    const result = await http(`/api/import/${type}`, {
      method: 'POST',
      body: form
    })

    if (result.success && !result.fileName) {
      result.fileName = file.name
    }
    return result
  }
}

export const api = isElectron ? electronAdapter : httpAdapter
export { isElectron }
