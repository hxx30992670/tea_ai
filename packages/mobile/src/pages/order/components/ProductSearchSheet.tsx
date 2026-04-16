/**
 * 商品搜索添加面板
 * 默认展示商品列表（懒加载） → 搜索可实时过滤 → 点击商品确认数量/价格 → 加入开单
 */
import { useState, useEffect, useRef } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrderDraftStore } from '@/store/order-draft'
import { calcTotalQuantity, formatMoney, formatNumber, parseDecimal, roundQuantity } from '@/lib/utils'
import { useVisualViewportInset } from '@/hooks/useVisualViewportInset'
import { useProductList } from '../hooks/useProductList'
import type { Product } from '@/types'
import type { DraftItem } from '@/store/order-draft'

interface ProductSearchSheetProps {
  open: boolean
  onClose: () => void
  editingItem?: DraftItem | null
}

function buildEditingProductSnapshot(editingItem: DraftItem): Product {
  return {
    id: editingItem.productId,
    name: editingItem.productName,
    sku: '',
    spec: editingItem.spec,
    unit: editingItem.unit,
    packageUnit: editingItem.packageUnit,
    packageSize: editingItem.packageSize,
    costPrice: 0,
    sellPrice: editingItem.sellPrice ?? editingItem.unitPrice,
    stockQty: editingItem.quantity ?? 0,
    status: 1,
    createdAt: '',
  }
}

function getEditingPackageValues(editingItem: DraftItem) {
  const packageSize = editingItem.packageSize ?? 0
  const packageQty = editingItem.packageQty ?? 0
  const totalQty = editingItem.quantity ?? calcTotalQuantity(editingItem.packageQty, editingItem.looseQty, editingItem.packageSize)

  if (editingItem.looseQty != null) {
    return {
      packageQty,
      looseQty: editingItem.looseQty,
    }
  }

  if (packageSize > 0) {
    return {
      packageQty,
      looseQty: Math.max(0, roundQuantity(totalQty - packageQty * packageSize)),
    }
  }

  return {
    packageQty,
    looseQty: 0,
  }
}

export function ProductSearchSheet({ open, onClose, editingItem }: ProductSearchSheetProps) {
  const { addItem, removeItem } = useOrderDraftStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [packageQty, setPackageQty] = useState('0')
  const [looseQty, setLooseQty] = useState('1')
  const [price, setPrice] = useState('')
  const keyboardInset = useVisualViewportInset(open)

  const { products, loading, loadingMore, hasMore, loadMore } = useProductList(query, open)

  // sentinel div ref for infinite scroll detection
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const hasPackage = selected?.packageUnit && selected?.packageSize

  const getCategoryPathText = (product: Product) => {
    if (Array.isArray(product.categoryPath) && product.categoryPath.length > 0) {
      return product.categoryPath.join(' / ')
    }
    return product.categoryName || product.teaType || ''
  }

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelected(null)
      setPackageQty('0')
      setLooseQty('1')
      setPrice('')
    }
  }, [open])

  useEffect(() => {
    if (!open || !editingItem) {
      return
    }

    const currentProduct = buildEditingProductSnapshot(editingItem)
    const packageValues = getEditingPackageValues(editingItem)
    setSelected(currentProduct)
    setPrice(String(editingItem.unitPrice))
    setPackageQty(String(packageValues.packageQty))
    setLooseQty(String(currentProduct.packageUnit ? packageValues.looseQty : (editingItem.looseQty ?? editingItem.quantity ?? 1)))
  }, [open, editingItem])

  // Intersection observer: load more when sentinel comes into view inside the scroll container
  useEffect(() => {
    const sentinel = sentinelRef.current
    const list = listRef.current
    if (!sentinel || !list) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { root: list, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const selectProduct = (p: Product) => {
    const editTotalQty = editingItem
      ? (editingItem.quantity ?? calcTotalQuantity(editingItem.packageQty, editingItem.looseQty, editingItem.packageSize))
      : 1

    setSelected(p)
    setPrice(String(editingItem?.unitPrice ?? p.sellPrice))
    if (editingItem && p.id === editingItem.productId) {
      const packageValues = getEditingPackageValues(editingItem)
      setPackageQty(String(packageValues.packageQty))
      setLooseQty(String(p.packageUnit ? packageValues.looseQty : (editingItem.looseQty ?? editingItem.quantity ?? 1)))
      return
    }
    setPackageQty('0')
    setLooseQty(p.packageUnit ? '0' : String(Math.max(1, editTotalQty)))
  }

  const handleAdd = () => {
    if (!selected) return
    const pkg = roundQuantity(parseDecimal(packageQty))
    const loose = roundQuantity(parseDecimal(looseQty))
    const totalQty = hasPackage
      ? calcTotalQuantity(pkg, loose, selected.packageSize)
      : loose

    if (editingItem) {
      removeItem(editingItem.productId)
    }

    addItem({
      productId: selected.id,
      productName: selected.name,
      spec: selected.spec,
      unit: selected.unit,
      packageUnit: selected.packageUnit,
      packageSize: selected.packageSize,
      packageQty: hasPackage ? pkg : undefined,
      looseQty: hasPackage ? loose : loose,
      quantity: totalQty,
      unitPrice: parseFloat(price) || selected.sellPrice,
      sellPrice: selected.sellPrice,
    })
    if (editingItem) {
      onClose()
      return
    }

    // 保持面板打开，继续添加
    setSelected(null)
  }

  const currentUnitPrice = parseFloat(price) || (selected?.sellPrice ?? 0)
  const currentTotalQty = hasPackage
    ? calcTotalQuantity(parseDecimal(packageQty), parseDecimal(looseQty), selected?.packageSize)
    : roundQuantity(parseDecimal(looseQty, 1))
  const subtotal = currentTotalQty * currentUnitPrice

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
          <SheetTitle className="flex-1">{selected ? (editingItem ? '确认修改商品' : '确认商品') : (editingItem ? '修改商品' : '添加商品')}</SheetTitle>
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground"
              aria-label="关闭"
            >
              <X size={20} />
            </Button>
          </SheetClose>
        </SheetHeader>

        <SheetBody
          className="flex min-h-0 flex-1 flex-col gap-4 pb-0"
          style={
            keyboardInset > 0
              ? { paddingBottom: keyboardInset }
              : undefined
          }
        >
          {!selected ? (
            <>
              {/* 搜索框：ring 画在内部，避免父级 overflow 裁切顶部描边 */}
              <div className="relative z-10 shrink-0 bg-card pt-0.5">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索商品名称 / SKU"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="scroll-mt-14 pl-9 ring-inset"
                />
              </div>

              {/* 商品列表（可滚动，带懒加载） */}
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto overscroll-contain"
              >
                {loading ? (
                  <div className="space-y-2 pb-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {query ? '未找到匹配商品' : '暂无商品'}
                  </p>
                ) : (
                  <div className="space-y-2 pb-4">
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/30 p-3 text-left tap-scale hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          {getCategoryPathText(p) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">分类：{getCategoryPathText(p)}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.spec} · 库存 {p.stockQty}{p.unit}
                            {p.packageUnit && ` · ${p.packageSize}${p.unit}/${p.packageUnit}`}
                          </p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-semibold text-primary">¥{formatMoney(p.sellPrice)}</p>
                          <p className="text-xs text-muted-foreground">{p.unit}</p>
                        </div>
                      </button>
                    ))}

                    {/* 加载更多指示 & 哨兵 */}
                    {loadingMore && (
                      <p className="py-3 text-center text-xs text-muted-foreground">加载中...</p>
                    )}
                    {!loadingMore && !hasMore && products.length > 0 && (
                      <p className="py-3 text-center text-xs text-muted-foreground">已全部加载</p>
                    )}
                    {/* 哨兵元素，进入视口时触发 loadMore */}
                    <div ref={sentinelRef} className="h-1" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pb-8">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="font-semibold">{selected.name}</p>
                {getCategoryPathText(selected) && <p className="text-xs text-muted-foreground mt-0.5">分类：{getCategoryPathText(selected)}</p>}
                {selected.spec && <p className="text-xs text-muted-foreground mt-0.5">{selected.spec}</p>}
                {hasPackage && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selected.packageUnit}: {selected.packageSize}{selected.unit}/{selected.packageUnit}
                  </p>
                )}
              </div>

              {/* 数量输入 */}
              {hasPackage ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">{selected.packageUnit}数</label>
                    <NumberInput value={packageQty} onChange={setPackageQty} min={0} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">{selected.unit ? `基本单位(${selected.unit})` : '散装'}</label>
                    <NumberInput value={looseQty} onChange={setLooseQty} min={0} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    数量{selected.unit ? `(${selected.unit})` : ''}
                  </label>
                  <NumberInput value={looseQty} onChange={setLooseQty} min={1} />
                </div>
              )}

              {/* 单价 */}
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">单价（元/{selected.unit || '单位'}）</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={String(selected.sellPrice)}
                  className="scroll-mt-14 ring-inset"
                />
              </div>

              <div className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                小计：
                <span className="ml-1 font-bold text-primary">
                  ¥{formatMoney(subtotal, 2)}
                </span>
                {hasPackage && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (共 {currentTotalQty}{selected.unit})
                  </span>
                )}
              </div>

              <Button variant="gold" size="lg" className="w-full" onClick={handleAdd}>
                <Plus size={18} />
                {editingItem ? '保存修改' : '加入开单'}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSelected(null)
                  if (!editingItem) {
                    setPackageQty('0')
                    setLooseQty('1')
                    setPrice('')
                  }
                }}
              >
                {editingItem ? '更换商品' : '返回列表'}
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function NumberInput({ value, onChange, min = 0 }: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(String(roundQuantity(Math.max(min, parseDecimal(value) - 1))))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold tap-scale"
      >−</button>
      <Input
        type="number"
        inputMode="decimal"
        pattern="[0-9.]*"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="scroll-mt-14 text-center text-lg font-semibold ring-inset"
        min={min}
      />
      <button
        onClick={() => onChange(String(roundQuantity(parseDecimal(value) + 1)))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold tap-scale"
      >＋</button>
    </div>
  )
}
