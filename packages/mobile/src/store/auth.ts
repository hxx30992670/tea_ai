import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '@/types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserInfo | null
  isLoggedIn: boolean

  setAuth: (data: { accessToken: string; refreshToken: string; user: UserInfo }) => void
  logout: () => void
  updateUser: (user: UserInfo) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoggedIn: false,

      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user, isLoggedIn: true }),

      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null, isLoggedIn: false }),

      updateUser: (user) => set({ user }),
    }),
    {
      // 与 web 端共享同一 localStorage key，扫码后免登录
      name: 'tea-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    },
  ),
)
