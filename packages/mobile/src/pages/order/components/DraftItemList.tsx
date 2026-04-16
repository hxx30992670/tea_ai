import { Pencil, Trash2 } from 'lucide-react'
import { useOrderDraftStore } from '@/store/order-draft'
import { calcTotalQuantity, formatMoney, formatNumber, formatQuantity, roundQuantity } from '@/lib/utils'
import type { DraftItem } from '@/store/order-draft'

interface DraftItemListProps {
  onEditItem: (item: DraftItem) => void
}

export function DraftItemList({ onEditItem }: DraftItemListProps) {
  const { draft, removeItem, updateItem } = useOrderDraftStore()

  if (!draft.items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <p className="text-sm">还没有商品，点击下方添加</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {draft.items.map((item) => {
        const hasPackage = item.packageUnit && item.packageSize
        const totalQty = calcTotalQuantity(item.packageQty, item.looseQty, item.packageSize)
        const displayQty = item.quantity ?? totalQty
        const subtotal = displayQty * item.unitPrice

        return (
          <div key={item.productId} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.productName}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                {item.spec && <p className="text-xs text-muted-foreground">{item.spec}</p>}
                <span className="text-xs text-muted-foreground">
                  单价{item.unit ? `（按${item.unit}）` : ''}: ¥{formatMoney(item.unitPrice)}
                </span>
                {item.sellPrice != null && item.unitPrice !== item.sellPrice && (
                  <span className={`text-xs font-medium ${item.unitPrice > item.sellPrice ? 'text-green-400' : 'text-red-400'}`}>
                    {item.unitPrice > item.sellPrice ? '↑' : '↓'}
                    ¥{formatMoney(Math.abs(item.unitPrice - item.sellPrice))}
                    <span className="text-muted-foreground font-normal ml-0.5">(参考价 ¥{formatMoney(item.sellPrice)})</span>
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {hasPackage ? (
                  <>
                    {/* 件数调整 */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-0.5">{item.packageUnit}</span>
                      <button
                        onClick={() => {
                          const newPkg = roundQuantity(Math.max(0, (item.packageQty ?? 0) - 1))
                          updateItem(item.productId, { packageQty: newPkg, quantity: roundQuantity(newPkg * (item.packageSize ?? 1) + (item.looseQty ?? 0)) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >−</button>
                      <span className="w-10 text-center text-sm font-medium">{formatNumber(item.packageQty ?? 0)}</span>
                      <button
                        onClick={() => {
                          const newPkg = roundQuantity((item.packageQty ?? 0) + 1)
                          updateItem(item.productId, { packageQty: newPkg, quantity: roundQuantity(newPkg * (item.packageSize ?? 1) + (item.looseQty ?? 0)) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >＋</button>
                    </div>
                    {/* 散装调整 */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-0.5">{item.unit || '散'}</span>
                      <button
                        onClick={() => {
                          const newLoose = roundQuantity(Math.max(0, (item.looseQty ?? 0) - 1))
                          updateItem(item.productId, { looseQty: newLoose, quantity: roundQuantity((item.packageQty ?? 0) * (item.packageSize ?? 1) + newLoose) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >−</button>
                      <span className="w-10 text-center text-sm font-medium">{formatNumber(item.looseQty ?? 0)}</span>
                      <button
                        onClick={() => {
                          const newLoose = roundQuantity((item.looseQty ?? 0) + 1)
                          updateItem(item.productId, { looseQty: newLoose, quantity: roundQuantity((item.packageQty ?? 0) * (item.packageSize ?? 1) + newLoose) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >＋</button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-0.5">{item.unit || '数量'}</span>
                    <button
                      onClick={() => {
                          const qty = item.looseQty ?? item.quantity ?? 1
                          const nextQty = roundQuantity(Math.max(0.0001, qty - 1))
                          updateItem(item.productId, { looseQty: nextQty, quantity: nextQty })
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                    >−</button>
                    <span className="w-12 text-center text-sm font-medium">{formatNumber(item.looseQty ?? item.quantity ?? 0)}</span>
                    <button
                      onClick={() => {
                          const qty = item.looseQty ?? item.quantity ?? 0
                          const nextQty = roundQuantity(qty + 1)
                          updateItem(item.productId, { looseQty: nextQty, quantity: nextQty })
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                    >＋</button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground truncate">
                计价单位: {item.unit || '无'}
                {hasPackage && (
                  <span className="ml-1.5 opacity-90">
                    (1{item.packageUnit}={item.packageSize}{item.unit})
                  </span>
                )}
                {hasPackage && (item.packageQty || 0) > 0 && (
                  <span className="ml-1.5 opacity-70">
                    [{formatQuantity(undefined, item.packageQty, item.looseQty, item.unit, item.packageUnit)}={displayQty}{item.unit || ''}]
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEditItem(item)}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  aria-label="修改商品"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                  aria-label="删除商品"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">小计</p>
                <span className="text-sm font-bold text-primary">
                  ¥{formatMoney(subtotal)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
