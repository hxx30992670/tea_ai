import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'

interface OrderSummaryBarProps {
  itemCount: number
  totalAmount: number
  submitting: boolean
  onSubmit: () => void
}

export function OrderSummaryBar({ itemCount, totalAmount, submitting, onSubmit }: OrderSummaryBarProps) {
  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{itemCount} 件商品</p>
          <p className="text-xl font-bold text-primary">¥{formatMoney(totalAmount)}</p>
        </div>
        <Button
          variant="gold"
          size="lg"
          onClick={onSubmit}
          disabled={submitting || itemCount === 0}
          className="px-8"
        >
          {submitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
          {submitting ? '提交中...' : '确认开单'}
        </Button>
      </div>
    </div>
  )
}
