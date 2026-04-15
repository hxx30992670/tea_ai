import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { canAccessMobilePath, getMobileDefaultPath } from '@/lib/permissions'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

export function AppLayout() {
  const { isLoggedIn, user } = useAuthStore()
  const location = useLocation()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (!canAccessMobilePath(user?.role, location.pathname)) {
    return <Navigate to={getMobileDefaultPath()} replace />
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
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
