import { useState, useEffect } from 'react'
import { Loader2, X, Package, Banknote, Truck, FileText, User } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { saleOrderApi } from '@/api/sale-order'
import { formatMoney, formatDate, formatQuantity, SALE_ORDER_STATUS_MAP } from '@/lib/utils'
import type { SaleOrder } from '@/types'

interface OrderDetailSheetProps {
  order: SaleOrder | null
  open: boolean
  onClose: () => void
  onStockOut?: (id: number) => void
  onCollect?: (id: number, amount: number) => void
  stockingOut?: boolean
  collectingId?: number | null
}

export function OrderDetailSheet({
  order: listOrder,
  open,
  onClose,
  onStockOut,
  onCollect,
  stockingOut,
  collectingId,
}: OrderDetailSheetProps) {
  const [detail, setDetail] = useState<SaleOrder | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !listOrder) {
      setDetail(null)
      return
    }
    let stale = false
    setLoading(true)
    saleOrderApi.getById(listOrder.id).then((data) => {
      if (!stale) {
        // getById 可能缺少 paidAmount/receivable，用列表数据补全
        setDetail({
          ...data,
          paidAmount: data.paidAmount ?? listOrder.paidAmount,
          receivable: data.receivable ?? listOrder.receivable,
        })
      }
    }).finally(() => {
      if (!stale) setLoading(false)
    })
    return () => { stale = true }
  }, [open, listOrder])

  // 未加载完成前用列表数据先渲染
  const order = detail ?? listOrder

  const receivable = (() => {
    if (!order) return 0
    // status=done 代表已完结，应收为 0
    if (order.status === 'done') return 0
    if (order.receivable != null) return order.receivable
    return Math.max(0, order.totalAmount - (order.paidAmount ?? 0))
  })()
  // 已收款：done 时若 paidAmount 缺失，以 totalAmount 补全
  const displayPaidAmount = (() => {
    if (!order) return 0
    if (order.paidAmount != null) return order.paidAmount
    if (order.status === 'done') return order.totalAmount
    return 0
  })()
  const isSettled = receivable <= 0
  const statusInfo = order ? (SALE_ORDER_STATUS_MAP[order.status] ?? { label: order.status, color: 'text-muted-foreground' }) : null

  const showStockOut = order?.status === 'draft' && !!onStockOut
  const showCollect = order && (order.status === 'draft' || order.status === 'shipped') && receivable > 0 && !!onCollect
  const exchangeStatusMap: Record<string, string> = {
    draft: '草稿',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消',
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
          <SheetTitle className="flex-1">订单详情</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label="关闭">
              <X size={20} />
            </Button>
          </SheetClose>
        </SheetHeader>

        <SheetBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pb-8">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : !order ? (
            <p className="py-12 text-center text-sm text-muted-foreground">订单不存在</p>
          ) : (
            <>
              {/* 基本信息 */}
              <section className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">{order.orderNo}</span>
                  {statusInfo && (
                    <span className={`text-xs font-medium ${statusInfo.color}`}>
                      {order.status === 'done' || (order.status === 'shipped' && isSettled)
                        ? '已完成'
                        : isSettled
                          ? `${statusInfo.label}（已结清）`
                          : `${statusInfo.label}（待收款）`
                      }
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{order.customerName || '散客'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt, 'YYYY-MM-DD HH:mm')}
                    {order.operatorName && ` · ${order.operatorName}`}
                  </span>
                </div>
              </section>

              {/* 商品明细 */}
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-secondary/20">
                  <Package size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">商品明细（{order.items?.length ?? 0} 件）</span>
                </div>
                {order.items?.length ? (
                  <div className="divide-y divide-border">
                    {order.items.map((item, idx) => (
                      <div key={item.id ?? idx} className="flex items-center justify-between px-3.5 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.spec && `${item.spec} · `}
                            {formatQuantity(item.quantity, item.packageQty, item.looseQty, item.unit)}
                            {' × ¥'}
                            {formatMoney(item.unitPrice)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-foreground ml-3">
                          ¥{formatMoney(item.totalPrice ?? (item.quantity ?? 0) * item.unitPrice)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">无商品信息</p>
                )}
              </section>

              {/* 金额信息 */}
              <section className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">金额信息</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">订单总额</span>
                  <span className="font-semibold text-primary">¥{formatMoney(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">已收款</span>
                  <span className="font-medium">¥{formatMoney(displayPaidAmount)}</span>
                </div>
                {receivable > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">待收款</span>
                    <span className="font-medium text-amber-400">¥{formatMoney(receivable)}</span>
                  </div>
                )}
              </section>

              {/* 出库状态 */}
              <section className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">出库状态</span>
                  <span className={`ml-auto text-xs font-medium ${order.status === 'draft' ? 'text-muted-foreground' : 'text-green-400'}`}>
                    {order.status === 'draft' ? '未出库' : '已出库'}
                  </span>
                </div>
              </section>

              {/* 备注 */}
              {order.remark && (
                <section className="rounded-xl border border-border bg-card p-3.5 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">备注</span>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{order.remark}</p>
                </section>
              )}

              {/* 售后记录 */}
              {((order.returns?.length ?? 0) > 0 || (order.refunds?.length ?? 0) > 0 || (order.exchanges?.length ?? 0) > 0) && (
                <section className="rounded-xl border border-border bg-card p-3.5 space-y-3">
                  <span className="text-xs font-semibold text-muted-foreground">售后记录</span>

                  {(order.returns?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">退货记录</p>
                      {order.returns?.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{item.returnNo || `退货#${item.id}`}</span>
                            <span className="text-muted-foreground">{formatDate(item.createdAt, 'YYYY-MM-DD HH:mm')}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            退货 ¥{formatMoney(item.totalAmount)} · 退款 ¥{formatMoney(item.refundAmount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(order.refunds?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">仅退款记录</p>
                      {order.refunds?.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{item.refundNo || `退款#${item.id}`}</span>
                            <span className="text-muted-foreground">{formatDate(item.createdAt, 'YYYY-MM-DD HH:mm')}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">退款 ¥{formatMoney(item.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(order.exchanges?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">换货记录</p>
                      {order.exchanges?.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{item.exchangeNo || `换货#${item.id}`}</span>
                            <span className="text-muted-foreground">{exchangeStatusMap[item.status || 'completed'] || item.status || '已完成'}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            换回 ¥{formatMoney(item.returnAmount)} · 换出 ¥{formatMoney(item.exchangeAmount)}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            退款 ¥{formatMoney(item.refundAmount)} · 补差 ¥{formatMoney(item.receiveAmount ?? 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* 操作按钮 */}
              {(showStockOut || showCollect) && (
                <div className="flex gap-3 pt-1">
                  {showStockOut && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={stockingOut}
                      onClick={() => { onStockOut!(order.id); onClose() }}
                    >
                      {stockingOut ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                      出库
                    </Button>
                  )}
                  {showCollect && (
                    <Button
                      variant="gold"
                      className="flex-1"
                      disabled={collectingId !== null && collectingId !== undefined}
                      onClick={() => { onCollect!(order.id, receivable); onClose() }}
                    >
                      {collectingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
                      收款 ¥{formatMoney(receivable, 0)}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
