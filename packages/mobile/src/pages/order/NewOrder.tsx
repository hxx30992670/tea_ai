import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ScanLine } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useOrderDraftStore } from '@/store/order-draft'
import { PAYMENT_METHOD_MAP, formatMoney } from '@/lib/utils'
import { CustomerSelect } from './components/CustomerSelect'
import { DraftItemList } from './components/DraftItemList'
import { ProductSearchSheet } from './components/ProductSearchSheet'
import { OrderSummaryBar } from './components/OrderSummaryBar'
import { useNewOrder } from './hooks/useNewOrder'

const PAYMENT_OPTIONS = Object.entries(PAYMENT_METHOD_MAP)

export default function NewOrderPage() {
  const navigate = useNavigate()
  const { draft, setMethod, setRemark, setPaidAmount, totalAmount } = useOrderDraftStore()
  const { submitting, error, submit } = useNewOrder()
  const [showProductSheet, setShowProductSheet] = useState(false)
  const [autoStockOut, setAutoStockOut] = useState(true)
  const [autoPayment, setAutoPayment] = useState(true)
  const [isManualAmount, setIsManualAmount] = useState(false)

  const total = totalAmount()

  useEffect(() => {
    if (autoPayment && !isManualAmount) {
      setPaidAmount(total)
    }
  }, [total, autoPayment, isManualAmount, setPaidAmount])

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        title="新建开单"
        back
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/scan')}
            className="text-muted-foreground gap-1.5"
          >
            <ScanLine size={16} />
            扫码
          </Button>
        }
      />

      {/* 表单区域（底部留出 OrderSummaryBar 高度） */}
      <div className="space-y-4 p-4 pb-32">
        {/* 客户选择 */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            客户
          </h3>
          <CustomerSelect />
        </section>

        {/* 商品列表 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              商品
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProductSheet(true)}
              className="h-7 gap-1.5 text-xs"
            >
              <Plus size={13} />
              添加商品
            </Button>
          </div>
          <DraftItemList />
        </section>

        {/* 支付方式 */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            付款方式
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-all tap-scale ${
                  draft.method === key
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 出库/收款选项 */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            提交选项
          </h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <button
              onClick={() => setAutoStockOut((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 tap-scale"
            >
              <span className="text-sm text-foreground">直接出库</span>
              <div
                className={`relative flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${
                  autoStockOut ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    autoStockOut ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
            <button
              onClick={() => {
                  const next = !autoPayment
                  setAutoPayment(next)
                  if (next) setIsManualAmount(false)
                }}
              className="flex w-full items-center justify-between px-4 py-3 tap-scale"
            >
              <span className="text-sm text-foreground">直接收款</span>
              <div
                className={`relative flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${
                  autoPayment ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    autoPayment ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
            {autoPayment && (
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <span className="text-sm text-muted-foreground">收款金额</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">¥</span>
                  <Input
                    type="number"
                    value={draft.paidAmount || ''}
                    onChange={(e) => {
                      setIsManualAmount(true)
                      setPaidAmount(Number(e.target.value) || 0)
                    }}
                    className="w-28 h-8 text-right"
                    placeholder="金额"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 备注 */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            备注（可选）
          </h3>
          <Textarea
            placeholder="如：客户要求、发货备注等"
            value={draft.remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
          />
        </section>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>

      {/* 商品搜索面板 */}
      <ProductSearchSheet open={showProductSheet} onClose={() => setShowProductSheet(false)} />

      {/* 底部汇总栏 */}
      <OrderSummaryBar
        itemCount={draft.items.length}
        totalAmount={totalAmount()}
        submitting={submitting}
        onSubmit={() => submit({ autoStockOut, autoPayment })}
      />
    </div>
  )
}
