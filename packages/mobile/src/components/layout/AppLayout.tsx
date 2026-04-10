import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

export function AppLayout() {
  const { isLoggedIn } = useAuthStore()
  if (!isLoggedIn) return <Navigate to="/login" replace />

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 主内容区：减去底部导航高度 */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-nav">
        <Outlet />
      </main>

      <BottomNav />

      {/* PWA 安装引导（首次访问时触发） */}
      <InstallPrompt />
    </div>
  )
}
