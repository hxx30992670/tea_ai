import { Trash2 } from 'lucide-react'
import { useOrderDraftStore } from '@/store/order-draft'
import { formatMoney, formatQuantity, calcTotalQuantity } from '@/lib/utils'

export function DraftItemList() {
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
              <div className="flex items-center gap-2 mt-0.5">
                {item.spec && <p className="text-xs text-muted-foreground">{item.spec}</p>}
                <span className="text-xs text-muted-foreground">单价: ¥{formatMoney(item.unitPrice)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {hasPackage ? (
                  <>
                    {/* 件数调整 */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-0.5">{item.packageUnit}</span>
                      <button
                        onClick={() => {
                          const newPkg = Math.max(0, (item.packageQty ?? 0) - 1)
                          updateItem(item.productId, { packageQty: newPkg, quantity: newPkg * (item.packageSize ?? 1) + (item.looseQty ?? 0) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >−</button>
                      <span className="w-6 text-center text-sm font-medium">{item.packageQty ?? 0}</span>
                      <button
                        onClick={() => {
                          const newPkg = (item.packageQty ?? 0) + 1
                          updateItem(item.productId, { packageQty: newPkg, quantity: newPkg * (item.packageSize ?? 1) + (item.looseQty ?? 0) })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >＋</button>
                    </div>
                    {/* 散装调整 */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-0.5">{item.unit || '散'}</span>
                      <button
                        onClick={() => {
                          const newLoose = Math.max(0, (item.looseQty ?? 0) - 1)
                          updateItem(item.productId, { looseQty: newLoose, quantity: (item.packageQty ?? 0) * (item.packageSize ?? 1) + newLoose })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                      >−</button>
                      <span className="w-6 text-center text-sm font-medium">{item.looseQty ?? 0}</span>
                      <button
                        onClick={() => {
                          const newLoose = (item.looseQty ?? 0) + 1
                          updateItem(item.productId, { looseQty: newLoose, quantity: (item.packageQty ?? 0) * (item.packageSize ?? 1) + newLoose })
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
                        if (qty <= 1) removeItem(item.productId)
                        else updateItem(item.productId, { looseQty: qty - 1, quantity: qty - 1 })
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm tap-scale"
                    >−</button>
                    <span className="w-8 text-center text-sm font-medium">{item.looseQty ?? item.quantity ?? 0}</span>
                    <button
                      onClick={() => {
                        const qty = item.looseQty ?? item.quantity ?? 0
                        updateItem(item.productId, { looseQty: qty + 1, quantity: qty + 1 })
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
              <button
                onClick={() => removeItem(item.productId)}
                className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
              <span className="text-sm font-bold text-primary">
                ¥{formatMoney(subtotal)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
