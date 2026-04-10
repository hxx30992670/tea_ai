import { AlertTriangle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { StockWarning } from '@/types'

interface StockWarningListProps {
  warnings: StockWarning[]
}

const URGENCY_CONFIG = {
  high: { label: '紧急', variant: 'destructive' as const, bg: 'bg-red-500/10 border-red-500/20' },
  medium: { label: '预警', variant: 'warning' as const, bg: 'bg-yellow-500/10 border-yellow-500/20' },
  low: { label: '注意', variant: 'default' as const, bg: 'bg-primary/10 border-primary/20' },
}

export function StockWarningList({ warnings }: StockWarningListProps) {
  if (warnings.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={15} className="text-yellow-400" />
        <h3 className="text-sm font-medium text-foreground">库存预警</h3>
        <Badge variant="warning" className="ml-auto">{warnings.length} 项</Badge>
      </div>

      <div className="space-y-2">
        {warnings.slice(0, 5).map((w) => {
          const cfg = URGENCY_CONFIG[w.urgency]
          return (
            <div
              key={w.id}
              className={`flex items-center gap-3 rounded-lg border p-2.5 ${cfg.bg}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{w.productName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {w.type === 'low_stock'
                    ? `库存 ${w.stockQty} / 安全库存 ${w.safeStock}`
                    : `剩余 ${w.shelfDaysLeft ?? '?'} 天到期`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {w.type === 'expiring' && <Clock size={13} className="text-muted-foreground" />}
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </div>
            </div>
          )
        })}

        {warnings.length > 5 && (
          <p className="text-center text-xs text-muted-foreground pt-1">
            还有 {warnings.length - 5} 项预警
          </p>
        )}
      </div>
    </div>
  )
}
