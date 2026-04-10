import { ChevronRight, Loader2 } from 'lucide-react'
import { formatMoney, formatRelativeTime, SALE_ORDER_STATUS_MAP } from '@/lib/utils'
import type { SaleOrder } from '@/types'

interface OrderCardProps {
  order: SaleOrder
  onClick?: (order: SaleOrder) => void
  onStockOut?: (id: number) => void
  onCollect?: (id: number, amount: number) => void
  stockingOut?: boolean
  collecting?: boolean
}

export function OrderCard({ order, onClick, onStockOut, onCollect, stockingOut, collecting }: OrderCardProps) {
  const statusInfo = SALE_ORDER_STATUS_MAP[order.status] ?? { label: order.status, color: 'text-muted-foreground' }
  const receivable = order.receivable ?? (order.totalAmount - (order.paidAmount ?? 0))
  const isSettled = receivable <= 0
  
  const showStockOut = order.status === 'draft' && !!onStockOut
  const showCollect = (order.status === 'draft' || order.status === 'shipped') && receivable > 0 && !!onCollect
  
  const displayStatus = (() => {
    if (order.status === 'done' || (order.status === 'shipped' && isSettled)) {
      return { label: '已完成', color: 'text-green-400' }
    }
    if (isSettled) {
      return { label: `${statusInfo.label}（已结清）`, color: statusInfo.color }
    }
    return { label: `${statusInfo.label}（待收款）`, color: statusInfo.color }
  })()

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      onClick={() => onClick?.(order)}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground font-mono">{order.orderNo}</span>
            <span className={`text-xs font-medium ${displayStatus.color}`}>{displayStatus.label}</span>
          </div>
          <p className="text-sm font-semibold text-foreground truncate">
            {order.customerName || '散客'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {order.items?.length ? `${order.items.length} 件商品` : ''}
            {order.paidAmount != null ? ` · ¥${formatMoney(order.paidAmount, 0)}` : ''}
            {' · '}
            {formatRelativeTime(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-base font-bold text-primary">¥{formatMoney(order.totalAmount, 0)}</span>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>
      </div>

      {(showStockOut || showCollect) && (
        <div className="flex border-t border-border divide-x divide-border">
          {showStockOut && (
            <button
              onClick={(e) => { e.stopPropagation(); onStockOut(order.id) }}
              disabled={stockingOut}
              className="flex-1 py-2.5 text-xs font-medium text-blue-500 tap-scale disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {stockingOut ? <Loader2 size={12} className="animate-spin" /> : null}
              出库
            </button>
          )}
          {showCollect && (
            <button
              onClick={(e) => { e.stopPropagation(); onCollect(order.id, receivable) }}
              disabled={collecting}
              className="flex-1 py-2.5 text-xs font-medium text-primary tap-scale disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {collecting ? <Loader2 size={12} className="animate-spin" /> : null}
              收款{receivable > 0 ? ` ¥${formatMoney(receivable, 0)}` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
