/**
 * 认证 API 接口
 * 封装登录、刷新 Token、获取用户信息及修改密码等请求
 */
import request from './index'
import type { ApiResponse, LoginForm, LoginResult, UserInfo } from '@/types'

export const authApi = {
  /** 用户登录，返回 Token 及用户信息 */
  login: (data: LoginForm) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/login', data),

  /** 使用 refresh_token 刷新访问令牌 */
  refresh: (refreshToken: string) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/refresh', { refreshToken }),

  /** 获取当前登录用户的详细信息 */
  profile: () =>
    request.get<never, ApiResponse<UserInfo>>('/auth/profile'),

  /** 修改密码（需验证原密码） */
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.put<never, ApiResponse<void>>('/auth/password', data),
}
