import { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { canAccessMobilePath, getMobileDefaultPath } from '@/lib/permissions'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

export function AppLayout() {
  const { isLoggedIn, user } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }

    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    window.addEventListener('orientationchange', setAppHeight)
    window.addEventListener('pageshow', setAppHeight)
    window.visualViewport?.addEventListener('resize', setAppHeight)

    return () => {
      window.removeEventListener('resize', setAppHeight)
      window.removeEventListener('orientationchange', setAppHeight)
      window.removeEventListener('pageshow', setAppHeight)
      window.visualViewport?.removeEventListener('resize', setAppHeight)
    }
  }, [])

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
