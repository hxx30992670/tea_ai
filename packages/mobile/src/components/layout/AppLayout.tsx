import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

export function AppLayout() {
  const { isLoggedIn } = useAuthStore()
  if (!isLoggedIn) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-dvh flex-col bg-background">
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
