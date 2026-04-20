import request from './index'
import type {
  ApiResponse,
  LoginCaptchaChallenge,
  LoginCaptchaVerifyPayload,
  LoginCaptchaVerifyResult,
  LoginPayload,
  LoginResult,
  UserInfo,
} from '@/types'

interface VerifyLoginCaptchaOptions {
  viewportWidth?: number
}

export const authApi = {
  login: (data: LoginPayload) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/login', data),

  createLoginCaptcha: () =>
    request.post<never, ApiResponse<LoginCaptchaChallenge>>('/auth/captcha/challenge'),

  verifyLoginCaptcha: (data: LoginCaptchaVerifyPayload, options?: VerifyLoginCaptchaOptions) =>
    request.post<never, ApiResponse<LoginCaptchaVerifyResult>>('/auth/captcha/verify', data, {
      headers: {
        'X-Client-Platform': 'mobile',
        ...(options?.viewportWidth
          ? { 'X-Captcha-Viewport-Width': String(Math.round(options.viewportWidth)) }
          : {}),
      },
    }),

  refresh: (refreshToken: string) =>
    request.post<never, ApiResponse<LoginResult>>('/auth/refresh', { refreshToken }),

  profile: () =>
    request.get<never, ApiResponse<UserInfo>>('/auth/profile'),

  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.put<never, ApiResponse<void>>('/auth/password', data),
}
