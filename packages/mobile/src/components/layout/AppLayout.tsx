import { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { canAccessMobilePath, getMobileDefaultPath } from '@/lib/permissions'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

// iOS PWA 键盘收起后 dvh 不刷新的 workaround：
// - navigator.standalone 只在 iOS 添加到主屏幕后为 true，微信内置浏览器永远是 false
// - viewport meta 已设置 interactive-widget=resizes-content，键盘弹出时 window 本身会 resize
// - 因此监听 window.resize 并读取 window.innerHeight，可拿到键盘动画完成后的稳定高度
// - 避免使用 visualViewport.resize，它会在键盘动画过程中不断触发中间值，导致高度异常
function useIOSPwaHeightFix() {
  useEffect(() => {
    const isIOSPWA = !!(window.navigator as Navigator & { standalone?: boolean }).standalone
    if (!isIOSPWA) return

    const update = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
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
