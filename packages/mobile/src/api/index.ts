import axios from 'axios'
import { useAuthStore } from '@/store/auth'

const loginPath = `${import.meta.env.BASE_URL}login`

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  (response) => {
    const data = response.data
    if (data.code !== undefined && data.code !== 200) {
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return data
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = loginPath
    }
    return Promise.reject(error)
  },
)

export default request
