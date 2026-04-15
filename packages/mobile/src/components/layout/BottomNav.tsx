import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ScanLine, FileText, Bot, UserCircle } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { canUseMobileAiChat } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: '看板' },
  { to: '/scan', icon: ScanLine, label: '扫码' },
  { to: '/order', icon: FileText, label: '开单' },
  { to: '/ai', icon: Bot, label: 'AI' },
  { to: '/profile', icon: UserCircle, label: '我的' },
] as const

export function BottomNav() {
  const role = useAuthStore((state) => state.user?.role)
  const navItems = canUseMobileAiChat(role)
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.to !== '/ai')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
      <div className="flex h-14 items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-all duration-150',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150',
                    isActive && 'bg-primary/15',
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    className={isActive ? 'text-primary' : 'text-muted-foreground'}
                  />
                </div>
                <span className={cn('text-[10px]', isActive ? 'font-semibold text-primary' : '')}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
