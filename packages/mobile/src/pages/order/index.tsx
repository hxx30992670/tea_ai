import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { useOrderDraftStore } from '@/store/order-draft'
import { formatMoney } from '@/lib/utils'
import { useVisualViewportInset } from '@/hooks/useVisualViewportInset'
import { useOrderList } from './hooks/useOrderList'
import { useOrderActions } from './hooks/useOrderActions'
import { OrderCard } from './components/OrderCard'
import { OrderDetailSheet } from './components/OrderDetailSheet'
import type { SaleOrder } from '@/types'

export default function OrderListPage() {
  const navigate = useNavigate()
  const hasDraft = useOrderDraftStore((s) => s.draft.customerId != null || s.draft.items.length > 0)
  const clearDraft = useOrderDraftStore((s) => s.clearDraft)
  const { orders, loading, loadingMore, refresh, loadMore } = useOrderList()
  const { doStockOut, doCollect, stockingOutId, collectingId } = useOrderActions(refresh)
  
  const [detailOrder, setDetailOrder] = useState<SaleOrder | null>(null)
  const [collectSheetOpen, setCollectSheetOpen] = useState(false)
  const [collectTarget, setCollectTarget] = useState<{ id: number; amount: number } | null>(null)
  const [collectAmount, setCollectAmount] = useState<number>(0)
  const collectInputRef = useRef<HTMLInputElement | null>(null)
  const keyboardInset = useVisualViewportInset(collectSheetOpen)

  useEffect(() => {
    if (!collectSheetOpen) return
    const timer = window.setTimeout(() => {
      collectInputRef.current?.focus()
      collectInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [collectSheetOpen])

  const handleOpenCollect = (id: number, amount: number) => {
    setCollectTarget({ id, amount })
    setCollectAmount(amount)
    setCollectSheetOpen(true)
  }

  const handleConfirmCollect = async () => {
    if (!collectTarget) return
    await doCollect(collectTarget.id, collectAmount)
    setCollectSheetOpen(false)
    setCollectTarget(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <PageHeader
        title="开单"
        subtitle={`共 ${orders.length} 条记录`}
        action={
          <Button variant="ghost" size="icon" onClick={refresh}>
            <RefreshCw size={18} className="text-muted-foreground" />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        {/* 草稿提示 */}
        <div className="space-y-3">
          {hasDraft && (
            <button
              onClick={() => navigate('/order/new')}
              className="w-full rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left tap-scale"
            >
              <p className="text-sm font-semibold text-primary">📝 有未完成的开单草稿</p>
              <p className="mt-0.5 text-xs text-muted-foreground">点击继续编辑</p>
            </button>
          )}

          {/* 订单列表 */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">还没有销售订单</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/order/new')}>
                <Plus size={16} />
                立即开单
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={setDetailOrder}
                    onStockOut={doStockOut}
                    onCollect={handleOpenCollect}
                    stockingOut={stockingOutId === order.id}
                    collecting={collectingId === order.id}
                  />
                ))}
              </div>

              {loadingMore && (
                <p className="py-3 text-center text-xs text-muted-foreground">加载中...</p>
              )}

              {!loadingMore && orders.length > 0 && (
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-center text-xs text-muted-foreground"
                >
                  上拉加载更多
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 新建开单 FAB */}
      <button
        onClick={() => { clearDraft(); navigate('/order/new') }}
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A853] to-[#B8892F] shadow-lg shadow-[#D4A853]/30 tap-scale animate-pulse-gold"
        aria-label="新建开单"
      >
        <Plus size={24} className="text-[#0A0E1A]" strokeWidth={2.5} />
      </button>

      {/* 订单详情 */}
      <OrderDetailSheet
        order={detailOrder}
        open={detailOrder !== null}
        onClose={() => setDetailOrder(null)}
        onStockOut={doStockOut}
        onCollect={handleOpenCollect}
        stockingOut={stockingOutId === detailOrder?.id}
        collectingId={collectingId}
      />

      {/* 收款金额弹窗 */}
      <Sheet open={collectSheetOpen} onOpenChange={setCollectSheetOpen}>
        <SheetContent
          height="auto"
          style={
            keyboardInset > 0
              ? {
                  bottom: keyboardInset,
                  maxHeight: `calc(100dvh - ${keyboardInset}px)`,
                }
              : undefined
          }
        >
          <SheetHeader>
            <SheetTitle>收款</SheetTitle>
          </SheetHeader>
          <SheetBody
            className="space-y-4 overflow-y-auto overscroll-contain pb-6"
            style={
              keyboardInset > 0
                ? { paddingBottom: keyboardInset + 24 }
                : undefined
            }
          >
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                待收款：<span className="text-foreground font-medium">¥{formatMoney(collectTarget?.amount ?? 0)}</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">收款金额</span>
                <span className="text-sm text-muted-foreground">¥</span>
                <Input
                  ref={collectInputRef}
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  value={collectAmount || ''}
                  onChange={(e) => setCollectAmount(Number(e.target.value) || 0)}
                  className="flex-1"
                  placeholder="输入金额"
                  onFocus={() => {
                    setTimeout(() => collectInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
                  }}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCollectSheetOpen(false)}
              >
                取消
              </Button>
              <Button
                variant="gold"
                className="flex-1"
                onClick={handleConfirmCollect}
                disabled={collectAmount <= 0 || collectingId !== null}
              >
                {collectingId !== null ? '收款中...' : '确认收款'}
              </Button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
