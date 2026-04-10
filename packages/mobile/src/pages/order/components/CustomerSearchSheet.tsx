import { useState, useEffect, useRef } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrderDraftStore } from '@/store/order-draft'
import { useCustomerList } from '../hooks/useCustomerList'
import type { Customer } from '@/types'

interface CustomerSearchSheetProps {
  open: boolean
  onClose: () => void
}

export function CustomerSearchSheet({ open, onClose }: CustomerSearchSheetProps) {
  const { setCustomer } = useOrderDraftStore()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { customers, loading, loadingMore, hasMore, loadMore } = useCustomerList(query, open)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const sentinel = sentinelRef.current
    const list = listRef.current
    if (!sentinel || !list) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { root: list, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const select = (c: Customer) => {
    setCustomer({ id: c.id, name: c.name, phone: c.phone })
    onClose()
  }

  const useAsGuest = () => {
    setCustomer({ name: query.trim() || '散客' })
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
          <SheetTitle className="flex-1">选择客户</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label="关闭">
              <X size={20} />
            </Button>
          </SheetClose>
        </SheetHeader>

        <SheetBody className="flex min-h-0 flex-1 flex-col gap-3 pb-0">
          {/* 搜索框 */}
          <div className="relative z-10 shrink-0 bg-card pt-0.5">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索客户名称 / 手机号"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 ring-inset"
            />
          </div>

          {/* 散客快捷按钮 */}
          <button
            onClick={useAsGuest}
            className="shrink-0 flex items-center gap-2 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2.5 text-left tap-scale"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm">
              <UserPlus size={14} className="text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">
              {query.trim() ? `以「${query.trim()}」直接开单` : '散客开单（不绑定客户）'}
            </span>
          </button>

          {/* 客户列表 */}
          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="space-y-2 pb-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {query ? '未找到匹配客户' : '暂无客户'}
              </p>
            ) : (
              <div className="space-y-2 pb-4">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => select(c)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3 text-left tap-scale hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                    </div>
                    {c.receivable != null && c.receivable > 0 && (
                      <span className="shrink-0 text-xs text-amber-400">欠款 ¥{c.receivable}</span>
                    )}
                  </button>
                ))}

                {loadingMore && (
                  <p className="py-3 text-center text-xs text-muted-foreground">加载中...</p>
                )}
                {!loadingMore && !hasMore && customers.length > 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">已全部加载</p>
                )}
                <div ref={sentinelRef} className="h-1" />
              </div>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
