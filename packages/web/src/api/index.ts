/**
 * 茶掌柜 Web 端 - Axios 实例配置
 * 封装统一的 HTTP 请求客户端，包含：
 * - 请求拦截器：自动附加 Bearer Token
 * - 响应拦截器：统一处理业务错误及 401 未授权跳转
 */
import axios from 'axios'
import { message } from 'antd'
import { useAuthStore } from '@/store/auth'

/** 创建 Axios 实例，配置基础路径和超时 */
const request = axios.create({
  baseURL: '/api',           // 代理到后端 API（Vite 开发时代理到 localhost:3000）
  timeout: 10000,            // 请求超时时间 10 秒
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：从 Zustand 状态中取出 Token，自动附加到请求头
request.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器：统一处理响应结构及服务端错误
request.interceptors.response.use(
  (response) => {
    const data = response.data
    // 后端统一返回 { code, message, data } 格式，非 200 即报错
    if (data.code !== undefined && data.code !== 200) {
      message.error(data.message || '请求失败')
      return Promise.reject(new Error(data.message))
    }
    return data
  },
  (error) => {
    // 401 未授权：清除登录状态并跳转到登录页
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      return Promise.reject(error)
    }
    // 其他错误展示提示信息
    const msg = error.response?.data?.message || error.message || '网络错误'
    message.error(msg)
    return Promise.reject(error)
  },
)

export default request
