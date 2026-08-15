/**
 * 格式化金额
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数
 * @returns {string}
 */
export function formatMoney(amount, decimals = 2) {
  if (amount === null || amount === undefined) return '0.00'
  return Number(amount).toFixed(decimals)
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @param {string} format - 格式类型：'full', 'date', 'time'
 * @returns {string}
 */
export function formatDate(date, format = 'full') {
  if (!date) return '-'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  
  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`
    case 'time':
      return `${hours}:${minutes}:${seconds}`
    case 'datetime':
      return `${year}-${month}-${day} ${hours}:${minutes}`
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }
}

/**
 * 订单状态映射
 */
export const ORDER_STATUS = {
  pending: '待确认',
  confirmed: '已确认',
  shipping: '配送中',
  completed: '已完成',
  cancelled: '已取消'
}

/**
 * 获取订单状态的标签类型
 * @param {string} status - 订单状态
 * @returns {string}
 */
export function getOrderStatusType(status) {
  const typeMap = {
    pending: 'warning',
    confirmed: 'primary',
    shipping: 'info',
    completed: 'success',
    cancelled: 'danger'
  }
  return typeMap[status] || 'info'
}

/**
 * 文件大小格式化
 * @param {number} bytes - 字节数
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * 手机号脱敏
 * @param {string} phone - 手机号
 * @returns {string}
 */
export function maskPhone(phone) {
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
export function throttle(fn, delay = 300) {
  let timer = null
  let lastTime = 0
  
  return function (...args) {
    const now = Date.now()
    
    if (now - lastTime < delay) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        lastTime = now
        fn.apply(this, args)
      }, delay)
    } else {
      lastTime = now
      fn.apply(this, args)
    }
  }
}
