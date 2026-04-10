import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  back?: boolean
  /** 右侧操作区 */
  action?: React.ReactNode
  className?: string
  /** 是否使用透明背景（用于有渐变头部的页面） */
  transparent?: boolean
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
  className,
  transparent = false,
}: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <header
      className={cn(
        'flex h-14 items-center gap-3 px-4 pt-safe',
        !transparent && 'border-b border-border bg-card/80 backdrop-blur-md',
        transparent && 'absolute inset-x-0 top-0 z-10',
        className,
      )}
    >
      {back && (
        <button
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors tap-scale"
          aria-label="返回"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate leading-tight">{subtitle}</p>
        )}
      </div>

      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  )
}
