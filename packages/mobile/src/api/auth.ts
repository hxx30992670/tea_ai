import request from './index'
import type { ApiResponse, LoginForm, LoginResult, UserInfo } from '@/types'

export const authApi = {
  login: (data: LoginForm) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/login', data),

  refresh: (refreshToken: string) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/refresh', { refreshToken }),

  profile: () =>
    request.get<never, ApiResponse<UserInfo>>('/auth/profile'),

  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.put<never, ApiResponse<void>>('/auth/password', data),
}
