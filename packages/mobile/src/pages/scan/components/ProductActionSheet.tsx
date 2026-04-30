import { useEffect, useState } from 'react'
import { useVisualViewportInset } from '@/hooks/useVisualViewportInset'
import { ClipboardCheck, PackagePlus, PackageMinus, Loader2, CheckCircle2, ShoppingCart } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { stockApi } from '@/api/stock'
import { formatMoney, formatNumber, parseDecimal, roundQuantity, STOCK_IN_REASONS, STOCK_OUT_REASONS } from '@/lib/utils'
import { getBatchAutoPickPlaceholder, getBatchAutoPickStrategy } from '@/utils/batch-strategy'
import type { Product, StockBatch, StockOperationPayload, Warehouse } from '@/types'
import type { ActionType } from '../hooks/useStockAction'

interface ProductActionSheetProps {
  product: Product | null
  open: boolean
  onClose: () => void
  onAction: (type: ActionType, payload: StockOperationPayload) => Promise<void>
  loading: boolean
  userRole?: string
  onAddToOrder?: (product: Product) => void
}

export function ProductActionSheet({
  product,
  open,
  onClose,
  onAction,
  loading,
  userRole,
  onAddToOrder,
}: ProductActionSheetProps) {
  const [packageQty, setPackageQty] = useState('0')
  const [looseQty, setLooseQty] = useState('1')
  const [reason, setReason] = useState('')
  const [remark, setRemark] = useState('')
  const [done, setDone] = useState<ActionType | 'count' | null>(null)
  const [activeType, setActiveType] = useState<ActionType | 'count' | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [batchId, setBatchId] = useState<number | ''>('')
  const [batchNo, setBatchNo] = useState('')
  const [inboundMode, setInboundMode] = useState<'new' | 'existing'>('new')
  const [countLoading, setCountLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const keyboardInset = useVisualViewportInset(open && !!product)

  const hasPackage = product?.packageUnit && product?.packageSize
  const selectedWarehouse = warehouses.find((item) => item.id === warehouseId)
  const selectedBatch = batches.find((item) => item.id === batchId)
  const visibleBatches = batches
    .filter((batch) => !warehouseId || batch.warehouseId === warehouseId)
    .filter((batch) => !locationId || batch.locationId === locationId)
    .filter((batch) => activeType !== 'out' || (batch.status === 1 && Number(batch.quantity ?? 0) > 0))
  const selectableBatches = visibleBatches

  const buildSuggestedBatchNo = (item: Product) => {
    const now = new Date()
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('')
    const code = (item.sku || `P${item.id}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || `P${item.id}`
    return `${date}-${code}-01`
  }

  useEffect(() => {
    if (!open || !product) return

    let alive = true
    void Promise.all([
      stockApi.warehouses(),
      stockApi.batches({ productId: product.id, pageSize: 100 }),
    ]).then(([warehouseRes, batchRes]) => {
      if (!alive) return
      setWarehouses(warehouseRes)
      setBatches(batchRes.list ?? [])
      setWarehouseId('')
      setLocationId('')
      setBatchId('')
      setInboundMode('new')
      setBatchNo(buildSuggestedBatchNo(product))
      setErrorMessage('')
    }).catch(() => {
      if (!alive) return
      setWarehouses([])
      setBatches([])
      setInboundMode('new')
      setBatchNo(buildSuggestedBatchNo(product))
      setErrorMessage('')
    })

    return () => {
      alive = false
    }
  }, [open, product])

  const resetPanel = () => {
    setDone(null)
    setPackageQty('0')
    setLooseQty('1')
    setReason('')
    setRemark('')
    setActiveType(null)
    setInboundMode('new')
    setWarehouseId('')
    setLocationId('')
    setBatchId('')
    setErrorMessage('')
  }

  const getBaseQuantity = () => {
    const pkg = roundQuantity(parseDecimal(packageQty))
    const loose = roundQuantity(parseDecimal(looseQty))
    if (!hasPackage) return loose
    return roundQuantity(pkg * Number(product?.packageSize ?? 0) + loose)
  }

  const handleAction = async (type: ActionType) => {
    if (!product) return
    const pkg = roundQuantity(parseDecimal(packageQty))
    const loose = roundQuantity(parseDecimal(looseQty))
    if (pkg === 0 && loose === 0) return

    const selectedReason = reason || (type === 'in' ? 'surplus' : 'damage')
    if (type === 'in') {
      if (inboundMode === 'existing' && !batchId) {
        setErrorMessage('请选择要并入的已有批次')
        return
      }
      if (inboundMode === 'new' && !batchNo.trim()) {
        setErrorMessage('请输入实际入库批次号')
        return
      }
      if (inboundMode === 'new' && !warehouseId) {
        setErrorMessage('请选择入库仓库')
        return
      }
      if (inboundMode === 'new' && !locationId) {
        setErrorMessage('请选择入库仓位')
        return
      }
    }
    if (type === 'out' && getBatchAutoPickStrategy(product) === 'manual_only' && !batchId) {
      setErrorMessage('该商品必须先选择出库批次')
      return
    }
    setErrorMessage('')

    await onAction(type, {
      productId: product.id,
      ...(hasPackage ? { packageQty: pkg, looseQty: loose } : { quantity: loose }),
      reason: selectedReason,
      warehouseId: typeof warehouseId === 'number' ? warehouseId : undefined,
      locationId: typeof locationId === 'number' ? locationId : undefined,
      batchId: (type === 'out' || (type === 'in' && inboundMode === 'existing')) && typeof batchId === 'number' ? batchId : undefined,
      batchNo: type === 'in' && inboundMode === 'new' ? batchNo.trim() : undefined,
      remark: remark || undefined,
    })
    setDone(type)
    setTimeout(() => {
      resetPanel()
      onClose()
    }, 1200)
  }

  const handleCount = async () => {
    if (!product) return
    const countedQty = getBaseQuantity()
    if (countedQty < 0) {
      setErrorMessage('实盘数量不能小于 0')
      return
    }
    if (!batchId) {
      setErrorMessage('请选择盘点批次后再提交')
      return
    }
    setErrorMessage('')
    setCountLoading(true)
    try {
      await stockApi.createCount({
        warehouseId: typeof warehouseId === 'number' ? warehouseId : undefined,
        locationId: typeof locationId === 'number' ? locationId : undefined,
        items: [{
          productId: product.id,
          batchId: typeof batchId === 'number' ? batchId : undefined,
          batchNo: selectedBatch?.batchNo,
          countedQty,
          remark: remark || undefined,
        }],
        remark: remark || undefined,
      })
      setDone('count')
      setTimeout(() => {
        resetPanel()
        onClose()
      }, 1200)
    } finally {
      setCountLoading(false)
    }
  }

  if (!product) return null

  const reasons = activeType === 'in' ? STOCK_IN_REASONS : activeType === 'out' ? STOCK_OUT_REASONS : []

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
                库存 {product.availableStockQty ?? product.stockQty}{product.unit}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>SKU: {product.sku}</span>
              <span>售价: ¥{formatMoney(product.sellPrice)}</span>
              {product.packageUnit && <span>{product.packageUnit}: {product.packageSize}{product.unit}/件</span>}
            </div>
          </div>

          {/* 选择操作类型 */}
          {!activeType && !done && userRole !== 'staff' && (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="success"
                size="lg"
                onClick={() => { setActiveType('in'); setReason('surplus'); setErrorMessage('') }}
                className="flex-1"
              >
                <PackagePlus size={18} />
                入库
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={() => { setActiveType('out'); setReason('damage'); setErrorMessage('') }}
                className="flex-1"
              >
                <PackageMinus size={18} />
                出库
              </Button>
              <Button
                variant="default"
                size="lg"
                onClick={() => { setActiveType('count'); setReason(''); setErrorMessage('') }}
                className="flex-1"
              >
                <ClipboardCheck size={18} />
                盘点
              </Button>
            </div>
          )}

          {!activeType && !done && userRole === 'staff' && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-xs leading-5 text-muted-foreground">
                店员扫码后可直接加入开单，库存入库、出库和盘点由店长处理。
              </p>
              <Button
                variant="default"
                size="lg"
                className="w-full"
                onClick={() => onAddToOrder?.(product)}
              >
                <ShoppingCart size={18} />
                加入开单
              </Button>
            </div>
          )}

          {/* 选了操作类型后的表单 */}
          {activeType && !done && (
            <>
              {activeType !== 'count' && (
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
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">仓库</label>
                  <select
                    value={warehouseId}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setWarehouseId(next || '')
                      setLocationId('')
                      setBatchId('')
                      setErrorMessage('')
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  >
                    <option value="">{activeType === 'in' && inboundMode === 'new' ? '请选择仓库' : '不限定仓库'}</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">仓位</label>
                  <select
                    value={locationId}
                    onChange={(event) => {
                      setLocationId(Number(event.target.value) || '')
                      setBatchId('')
                      setErrorMessage('')
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  >
                    <option value="">{activeType === 'in' && inboundMode === 'new' ? '请选择仓位' : '不限定仓位'}</option>
                    {(selectedWarehouse?.locations ?? []).map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {activeType === 'in' ? (
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">入库批次</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setInboundMode('new'); setBatchId(''); setErrorMessage('') }}
                      className={`rounded-lg border px-3 py-2 text-sm ${inboundMode === 'new' ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground'}`}
                    >
                      新建批次
                    </button>
                    <button
                      type="button"
                      onClick={() => { setInboundMode('existing'); setBatchNo(buildSuggestedBatchNo(product)); setErrorMessage('') }}
                      disabled={visibleBatches.length === 0}
                      className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${inboundMode === 'existing' ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground'}`}
                    >
                      并入已有
                    </button>
                  </div>
                  {inboundMode === 'existing' ? (
                    <select
                      value={batchId}
                      onChange={(event) => {
                        const next = Number(event.target.value) || ''
                        const batch = batches.find((item) => item.id === next)
                        setBatchId(next)
                        if (batch) {
                          setWarehouseId(batch.warehouseId)
                          setLocationId(batch.locationId ?? '')
                        }
                        setErrorMessage('')
                      }}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                    >
                      <option value="">请选择已有批次</option>
                      {selectableBatches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNo}｜{batch.warehouseName}/{batch.locationName ?? '-'}｜{formatNumber(batch.quantity)}{batch.unit ?? ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={batchNo}
                      onChange={(event) => setBatchNo(event.target.value)}
                      placeholder="系统已建议，可按实际批次号修改"
                    />
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    {activeType === 'count' ? '盘点批次' : '出库批次'}
                  </label>
                  <select
                    value={batchId}
                    onChange={(event) => {
                      const next = Number(event.target.value) || ''
                      const batch = selectableBatches.find((item) => item.id === next)
                      setBatchId(next)
                      if (batch) {
                        setWarehouseId(batch.warehouseId)
                        setLocationId(batch.locationId ?? '')
                      }
                      setErrorMessage('')
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  >
                    <option value="">{activeType === 'count' ? '请选择盘点批次' : getBatchAutoPickPlaceholder(product)}</option>
                    {selectableBatches
                      .map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNo}｜{batch.warehouseName}/{batch.locationName ?? '-'}｜{formatNumber(batch.quantity)}{batch.unit ?? ''}
                        </option>
                      ))}
                  </select>
                  {activeType === 'count' && selectableBatches.length === 0 && (
                    <p className="mt-1.5 text-xs text-red-400">当前商品暂无可盘点批次，请先在 Web 端新增盘点批次。</p>
                  )}
                </div>
              )}

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

              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {errorMessage}
                </div>
              )}

              {/* 确认按钮 */}
              <Button
                variant={activeType === 'in' ? 'success' : activeType === 'out' ? 'destructive' : 'default'}
                size="lg"
                className="w-full"
                onClick={() => activeType === 'count' ? handleCount() : handleAction(activeType)}
                disabled={loading || countLoading}
              >
                {loading || countLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                确认{activeType === 'in' ? '入库' : activeType === 'out' ? '出库' : '盘点'}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => { setActiveType(null); setErrorMessage('') }}
              >
                返回
              </Button>
            </>
          )}

          {/* 完成状态 */}
          {done && (
            <div className="flex items-center justify-center gap-2 py-3 text-green-400">
              <CheckCircle2 size={20} />
              <span className="font-medium">{done === 'in' ? '入库' : done === 'out' ? '出库' : '盘点'}成功</span>
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
