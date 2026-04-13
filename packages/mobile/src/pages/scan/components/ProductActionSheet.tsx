import { useState } from 'react'
import { useVisualViewportInset } from '@/hooks/useVisualViewportInset'
import { PackagePlus, PackageMinus, Loader2, CheckCircle2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatNumber, parseDecimal, roundQuantity, STOCK_IN_REASONS, STOCK_OUT_REASONS } from '@/lib/utils'
import type { Product, StockOperationPayload } from '@/types'
import type { ActionType } from '../hooks/useStockAction'

interface ProductActionSheetProps {
  product: Product | null
  open: boolean
  onClose: () => void
  onAction: (type: ActionType, payload: StockOperationPayload) => Promise<void>
  loading: boolean
}

export function ProductActionSheet({
  product,
  open,
  onClose,
  onAction,
  loading,
}: ProductActionSheetProps) {
  const [packageQty, setPackageQty] = useState('0')
  const [looseQty, setLooseQty] = useState('1')
  const [reason, setReason] = useState('')
  const [remark, setRemark] = useState('')
  const [done, setDone] = useState<ActionType | null>(null)
  const [activeType, setActiveType] = useState<ActionType | null>(null)

  const hasPackage = product?.packageUnit && product?.packageSize

  const handleAction = async (type: ActionType) => {
    if (!product) return
    const pkg = roundQuantity(parseDecimal(packageQty))
    const loose = roundQuantity(parseDecimal(looseQty))
    if (pkg === 0 && loose === 0) return

    const selectedReason = reason || (type === 'in' ? 'surplus' : 'damage')

    await onAction(type, {
      productId: product.id,
      ...(hasPackage ? { packageQty: pkg, looseQty: loose } : { quantity: loose }),
      reason: selectedReason,
      remark: remark || undefined,
    })
    setDone(type)
    setTimeout(() => {
      setDone(null)
      setPackageQty('0')
      setLooseQty('1')
      setReason('')
      setRemark('')
      setActiveType(null)
      onClose()
    }, 1200)
  }

  if (!product) return null

  const reasons = activeType === 'in' ? STOCK_IN_REASONS : activeType === 'out' ? STOCK_OUT_REASONS : []
  const keyboardInset = useVisualViewportInset(open)

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader className="shrink-0">
          <SheetTitle>扫码操作</SheetTitle>
        </SheetHeader>

        <SheetBody
          className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto overscroll-contain pb-6"
          style={
            keyboardInset > 0
              ? { paddingBottom: keyboardInset + 24 }
              : undefined
          }
        >
          {/* 商品信息 */}
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{product.name}</p>
                {product.spec && (
                  <p className="text-xs text-muted-foreground mt-0.5">{product.spec}</p>
                )}
              </div>
              <Badge variant="muted">
                库存 {product.stockQty}{product.unit}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>SKU: {product.sku}</span>
              <span>售价: ¥{formatMoney(product.sellPrice)}</span>
              {product.packageUnit && <span>{product.packageUnit}: {product.packageSize}{product.unit}/件</span>}
            </div>
          </div>

          {/* 选择操作类型 */}
          {!activeType && !done && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="success"
                size="lg"
                onClick={() => { setActiveType('in'); setReason('surplus') }}
                className="flex-1"
              >
                <PackagePlus size={18} />
                入库
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={() => { setActiveType('out'); setReason('damage') }}
                className="flex-1"
              >
                <PackageMinus size={18} />
                出库
              </Button>
            </div>
          )}

          {/* 选了操作类型后的表单 */}
          {activeType && !done && (
            <>
              {/* 原因选择 */}
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">原因</label>
                <div className="flex flex-wrap gap-2">
                  {reasons.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-all tap-scale ${
                        reason === r.value
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 数量输入 */}
              {hasPackage ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">
                      {product.packageUnit}数
                    </label>
                    <NumberStepper value={packageQty} onChange={setPackageQty} min={0} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">
                      散装({product.unit})
                    </label>
                    <NumberStepper value={looseQty} onChange={setLooseQty} min={0} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    数量{product.unit ? `(${product.unit})` : ''}
                  </label>
                  <NumberStepper value={looseQty} onChange={setLooseQty} min={1} />
                </div>
              )}

              {/* 备注 */}
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">备注（可选）</label>
                <Input
                  placeholder="如：供应商名称、损耗原因等"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                />
              </div>

              {/* 确认按钮 */}
              <Button
                variant={activeType === 'in' ? 'success' : 'destructive'}
                size="lg"
                className="w-full"
                onClick={() => handleAction(activeType)}
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                确认{activeType === 'in' ? '入库' : '出库'}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setActiveType(null)}
              >
                返回
              </Button>
            </>
          )}

          {/* 完成状态 */}
          {done && (
            <div className="flex items-center justify-center gap-2 py-3 text-green-400">
              <CheckCircle2 size={20} />
              <span className="font-medium">{done === 'in' ? '入库' : '出库'}成功</span>
            </div>
          )}

          {!activeType && !done && (
            <SheetClose asChild>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
                取消
              </Button>
            </SheetClose>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/** 数量步进器小组件 */
function NumberStepper({ value, onChange, min = 0 }: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(String(roundQuantity(Math.max(min, parseDecimal(value) - 1))))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold tap-scale"
      >
        −
      </button>
      <Input
        type="number"
        inputMode="decimal"
        pattern="[0-9.]*"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-center text-lg font-semibold"
        min={min}
      />
      <button
        onClick={() => onChange(String(roundQuantity(parseDecimal(value) + 1)))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold tap-scale"
      >
        ＋
      </button>
    </div>
  )
}
