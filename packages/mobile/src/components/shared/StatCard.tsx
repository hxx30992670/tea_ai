import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
  title: string
  value: string
  sub?: string
  icon?: ReactNode
  trend?: { value: number; label?: string }
  loading?: boolean
  className?: string
  /** 主色调，默认金色 */
  accent?: 'gold' | 'green' | 'red' | 'blue' | 'amber'
}

const ACCENT_MAP = {
  gold: {
    icon: 'bg-[#D4A853]/15 text-[#D4A853]',
    value: 'text-[#D4A853]',
  },
  green: {
    icon: 'bg-green-500/15 text-green-400',
    value: 'text-green-400',
  },
  red: {
    icon: 'bg-red-500/15 text-red-400',
    value: 'text-red-400',
  },
  blue: {
    icon: 'bg-blue-500/15 text-blue-400',
    value: 'text-blue-400',
  },
  amber: {
    icon: 'bg-amber-500/15 text-amber-400',
    value: 'text-amber-400',
  },
}

export function StatCard({
  title,
  value,
  sub,
  icon,
  trend,
  loading = false,
  className,
  accent = 'gold',
}: StatCardProps) {
  const colors = ACCENT_MAP[accent]

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <div className="flex items-start justify-between mb-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-24 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 transition-all duration-150 tap-scale',
        className,
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="min-w-0 pr-2 text-xs font-medium text-muted-foreground">{title}</span>
        {icon && (
          <div className={cn('shrink-0 flex h-8 w-8 items-center justify-center rounded-lg', colors.icon)}>
            {icon}
          </div>
        )}
      </div>

      <div
        className={cn(
          'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(1.125rem,4.8vw,1.5rem)] font-bold leading-tight tracking-tight',
          colors.value,
        )}
      >
        {value}
      </div>

      {(sub || trend) && (
        <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
          {trend && (
            <span
              className={cn(
                'shrink-0 text-xs font-medium',
                trend.value >= 0 ? 'text-green-400' : 'text-red-400',
              )}
            >
              {trend.value >= 0 ? '+' : ''}
              {trend.value}%
            </span>
          )}
          {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  )
}
