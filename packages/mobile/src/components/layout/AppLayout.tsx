import { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { canAccessMobilePath, getMobileDefaultPath } from '@/lib/permissions'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

// iOS PWA 键盘收起后 dvh 不刷新的 workaround：
// navigator.standalone 只在 iOS 添加到主屏幕后为 true，微信内置浏览器永远是 false，
// 因此可以安全地只在 PWA 里使用 visualViewport 高度修正。
function useIOSPwaHeightFix() {
  useEffect(() => {
    const isIOSPWA = !!(window.navigator as Navigator & { standalone?: boolean }).standalone
    if (!isIOSPWA) return

    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      document.documentElement.style.setProperty('--app-height', `${vv.height}px`)
    }

    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
}

export function AppLayout() {
  useIOSPwaHeightFix()

  const { isLoggedIn, user } = useAuthStore()
  const location = useLocation()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (!canAccessMobilePath(user?.role, location.pathname)) {
    return <Navigate to={getMobileDefaultPath()} replace />
  }

  return (
    <div className="flex flex-col bg-background" style={{ height: 'var(--app-height, 100dvh)' }}>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>

      <div className="h-nav shrink-0" aria-hidden="true" />

      <BottomNav />

      {/* PWA 安装引导（首次访问时触发） */}
      <InstallPrompt />
    </div>
  )
}
