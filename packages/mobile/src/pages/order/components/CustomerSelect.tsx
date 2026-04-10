import { useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { useOrderDraftStore } from '@/store/order-draft'
import { CustomerSearchSheet } from './CustomerSearchSheet'

export function CustomerSelect() {
  const { draft, setCustomer } = useOrderDraftStore()
  const [sheetOpen, setSheetOpen] = useState(false)

  const clearCustomer = () => setCustomer({ name: '' })

  if (draft.customerName) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
          {draft.customerName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{draft.customerName}</p>
          {draft.customerPhone && (
            <p className="text-xs text-muted-foreground">{draft.customerPhone}</p>
          )}
        </div>
        <button onClick={clearCustomer} className="p-1 text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setSheetOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left tap-scale"
      >
        <span className="flex-1 text-sm text-muted-foreground">搜索客户（可跳过，以散客开单）</span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>

      <CustomerSearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
