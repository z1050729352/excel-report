import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('client_token') || localStorage.getItem('admin_token')
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 友好的错误信息映射
const getErrorMessage = (error) => {
  // 网络错误或请求超时
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return '请求超时，请检查网络连接'
    }
    if (error.message.includes('Network Error')) {
      return '网络连接失败，请检查您的网络设置'
    }
    return '网络错误，请稍后重试'
  }

  const { status, data } = error.response

  // 优先使用后端返回的友好错误信息
  if (data?.error && typeof data.error === 'string') {
    return data.error
  }

  if (data?.message && typeof data.message === 'string') {
    return data.message
  }

  // 根据状态码返回友好提示
  switch (status) {
    case 400:
      return '请求参数错误，请检查输入内容'
    case 401:
      return '用户名或密码错误'
    case 403:
      return '您没有权限访问此功能'
    case 404:
      return '请求的资源不存在'
    case 500:
      return '服务器出错了，请稍后重试'
    case 502:
      return '网关错误，请稍后重试'
    case 503:
      return '服务暂时不可用，请稍后重试'
    default:
      return '操作失败，请稍后重试'
  }
}

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 直接返回后端数据
    return response.data
  },
  (error) => {
    const friendlyMessage = getErrorMessage(error)
    
    // 只有在 401 时才自动跳转登录页（但登录页面本身不跳转）
    if (error.response?.status === 401) {
      const isInLoginPage = window.location.hash.includes('/login')
      
      if (!isInLoginPage) {
        localStorage.removeItem('client_token')
        localStorage.removeItem('admin_token')
        
        // 延迟跳转，让用户看到错误提示
        setTimeout(() => {
          const isAdminPage = window.location.pathname.includes('admin.html')
          window.location.href = isAdminPage ? '/admin.html#/login' : '/'
        }, 1500)
      }
    }
    
    // 返回包含友好错误信息的 Error 对象
    const friendlyError = new Error(friendlyMessage)
    friendlyError.originalError = error
    friendlyError.status = error.response?.status
    
    return Promise.reject(friendlyError)
  }
)

export default request
