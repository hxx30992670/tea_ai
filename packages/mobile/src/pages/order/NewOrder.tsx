import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Bot, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useOrderDraftStore } from '@/store/order-draft'
import { useAuthStore } from '@/store/auth'
import { canUseMobileAiRecognize } from '@/lib/permissions'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import { CustomerSelect } from './components/CustomerSelect'
import { DraftItemList } from './components/DraftItemList'
import { ProductSearchSheet } from './components/ProductSearchSheet'
import { AiInputSheet } from './components/AiInputSheet'
import { OrderSummaryBar } from './components/OrderSummaryBar'
import { useNewOrder } from './hooks/useNewOrder'
import { useAiRecognize } from './hooks/useAiRecognize'
import type { DraftItem } from '@/store/order-draft'

export default function NewOrderPage() {
  const navigate = useNavigate()
  const role = useAuthStore((state) => state.user?.role)
  const allowAiRecognize = canUseMobileAiRecognize(role)
  const { draft, setMethod, setRemark, setPaidAmount, adjustPricesByPaidAmount, totalAmount } = useOrderDraftStore()
  const { submitting, error, submit } = useNewOrder()
  const { recognizing, progress, recognize } = useAiRecognize()
  const [showProductSheet, setShowProductSheet] = useState(false)
  const [showAiSheet, setShowAiSheet] = useState(false)
  const [editingItem, setEditingItem] = useState<DraftItem | null>(null)
  const [aiMessage, setAiMessage] = useState('')
  const [autoStockOut, setAutoStockOut] = useState(true)
  const [autoPayment, setAutoPayment] = useState(true)
  const [adjustTotalPrice, setAdjustTotalPrice] = useState<number | undefined>(undefined)

  const total = totalAmount()

  useEffect(() => {
    if (autoPayment) {
      setPaidAmount(total)
    }
  }, [total, autoPayment, setPaidAmount])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <PageHeader
        title="新建开单"
        back
        action={
          !allowAiRecognize ? undefined : recognizing ? (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="gap-1.5 text-primary"
            >
              <Loader2 size={16} className="animate-spin" />
              识别中
            </Button>
          ) : (
            <button
              onClick={() => setShowAiSheet(true)}
              className="relative flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 border border-purple-400/40 px-3 py-1.5 text-xs font-medium text-purple-400 animate-glow-ai tap-scale"
            >
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <Bot size={14} className="animate-ai-sparkle flex-shrink-0" />
              <span>AI 录单</span>
            </button>
          )
        }
      />

      {/* 表单区域（底部留出 OrderSummaryBar 高度） */}
      <div className="flex-1 overflow-y-auto">
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
              onClick={() => {
                setEditingItem(null)
                setShowProductSheet(true)
              }}
              className="h-7 gap-1.5 text-xs"
            >
              <Plus size={13} />
              添加商品
            </Button>
          </div>
          <DraftItemList
            onEditItem={(item) => {
              setEditingItem(item)
              setShowProductSheet(true)
            }}
          />
        </section>

        {/* 调整总价 */}
        {draft.items.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">当前总价</span>
                <span className="text-xl font-bold text-primary">¥{total.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  value={adjustTotalPrice ?? ''}
                  onChange={(e) => setAdjustTotalPrice(Number(e.target.value) || undefined)}
                  className="w-24 h-9 text-right"
                  placeholder="目标总价"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 whitespace-nowrap"
                  disabled={adjustTotalPrice == null || adjustTotalPrice === total}
                  onClick={() => {
                    if (adjustTotalPrice != null) {
                      adjustPricesByPaidAmount(adjustTotalPrice)
                      setAdjustTotalPrice(undefined)
                    }
                  }}
                >
                  调整
                </Button>
              </div>
            </div>
            {adjustTotalPrice != null && adjustTotalPrice !== total && (
              <p className="mt-1.5 text-right text-xs text-muted-foreground">
                差额 {(adjustTotalPrice - total) >= 0 ? '+' : ''}¥{(adjustTotalPrice - total).toFixed(2)}
              </p>
            )}
          </section>
        )}

        {/* 支付方式 */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            付款方式
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setMethod(value)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-all tap-scale ${
                  draft.method === value
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
              onClick={() => setAutoPayment((v) => !v)}
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
                    inputMode="decimal"
                    pattern="[0-9.]*"
                    value={draft.paidAmount || ''}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
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
      </div>

      {/* AI 识别录单 */}
      <AiInputSheet
        open={allowAiRecognize && showAiSheet}
        onClose={() => setShowAiSheet(false)}
        onFile={async (file) => {
          const result = await recognize(file)
          setAiMessage(result.message)
          setTimeout(() => setAiMessage(''), 4000)
        }}
      />

      {/* AI 识别中遮罩 */}
      {recognizing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 size={36} className="animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">{progress || 'AI 识别中…'}</p>
        </div>
      )}

      {/* AI 识别结果提示 */}
      {aiMessage && !recognizing && (
        <div className="fixed top-16 left-4 right-4 z-50 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
          {aiMessage}
        </div>
      )}

      {/* 商品搜索面板 */}
      <ProductSearchSheet
        open={showProductSheet}
        editingItem={editingItem}
        onClose={() => {
          setShowProductSheet(false)
          setEditingItem(null)
        }}
      />

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
