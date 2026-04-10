/**
 * 认证状态管理（Zustand + 持久化）
 * 管理用户登录状态、Token 及用户信息，数据持久化到 localStorage
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '@/types'

/** 认证状态接口定义 */
interface AuthState {
  accessToken: string | null     // 访问令牌
  refreshToken: string | null    // 刷新令牌
  user: UserInfo | null          // 用户信息
  isLoggedIn: boolean            // 是否已登录

  setAuth: (data: { accessToken: string; refreshToken: string; user: UserInfo }) => void  // 登录成功时调用
  logout: () => void             // 退出登录
  updateUser: (user: UserInfo) => void  // 更新用户信息
}

/** 创建认证状态存储，使用 persist 中间件实现持久化 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoggedIn: false,

      // 设置认证信息（登录成功后调用）
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user, isLoggedIn: true }),

      // 清除认证信息（退出登录时调用）
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null, isLoggedIn: false }),

      // 更新用户信息
      updateUser: (user) => set({ user }),
    }),
    {
      name: 'tea-auth',  // localStorage 中的存储键名
      partialize: (state) => ({
        // 仅持久化必要字段，节省存储空间
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    },
  ),
)
