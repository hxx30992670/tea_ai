import { type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuItem {
  icon: ReactNode
  label: string
  value?: string
  onClick?: () => void
  danger?: boolean
}

interface MenuGroup {
  title?: string
  items: MenuItem[]
}

interface MenuListProps {
  groups: MenuGroup[]
}

export function MenuList({ groups }: MenuListProps) {
  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.title && (
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {group.items.map((item, ii) => (
              <button
                key={ii}
                onClick={item.onClick}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3.5 tap-scale transition-colors',
                  ii > 0 && 'border-t border-border',
                  item.danger ? 'hover:bg-red-500/5' : 'hover:bg-white/5',
                  !item.onClick && 'cursor-default',
                )}
              >
                <span className={cn('text-muted-foreground', item.danger && 'text-red-400')}>
                  {item.icon}
                </span>
                <span className={cn('flex-1 text-left text-sm', item.danger && 'text-red-400')}>
                  {item.label}
                </span>
                {item.value ? (
                  <span className="text-xs text-muted-foreground">{item.value}</span>
                ) : (
                  item.onClick && <ChevronRight size={16} className="text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
