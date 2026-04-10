import { useState, useEffect, useCallback, useRef } from 'react'
import { customerApi } from '@/api/customer'
import type { Customer } from '@/types'

const PAGE_SIZE = 20

export function useCustomerList(keyword: string, enabled = true) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // 追踪「当前生效」的 keyword，防止旧请求的结果污染新列表
  const activeKeywordRef = useRef(keyword)
  // 追踪进行中的「关键词+页码」请求，防止同页重复请求
  const pendingRequestKeyRef = useRef<string | null>(null)
  // 追踪请求序号，丢弃过期响应（即使关键词相同）
  const requestSeqRef = useRef(0)

  const fetchPage = useCallback(async (p: number, kw: string, reset: boolean) => {
    const normalizedKw = kw.trim()
    const requestKey = `${normalizedKw}::${p}`
    if (pendingRequestKeyRef.current === requestKey) return
    pendingRequestKeyRef.current = requestKey
    const requestSeq = ++requestSeqRef.current

    if (reset) {
      setLoading(true)
      setCustomers([])   // 立刻清空，避免旧结果残留
      setHasMore(true)
    } else {
      setLoadingMore(true)
    }
    try {
      const params: Record<string, unknown> = { page: p, pageSize: PAGE_SIZE }
      if (normalizedKw) params.keyword = normalizedKw
      const result = await customerApi.list(params)
      // 请求返回时 keyword 已变，或请求已过期，丢弃结果
      if (kw !== activeKeywordRef.current || requestSeq !== requestSeqRef.current) return
      setTotal(result.total)
      setCustomers((prev) => {
        if (reset) {
          const canLoadMore =
            result.list.length >= PAGE_SIZE && result.list.length < result.total
          setHasMore(canLoadMore)
          return result.list
        }
        // 追加时按 id 去重，避免同一页重复触发造成重复数据
        const existed = new Set(prev.map((item) => item.id))
        const appended = result.list.filter((item) => !existed.has(item.id))
        const next = [...prev, ...appended]
        // 关键：若本次没有新增数据，立即停止继续分页，避免无限请求
        const canLoadMore =
          appended.length > 0 && result.list.length >= PAGE_SIZE && next.length < result.total
        setHasMore(canLoadMore)
        return next
      })
      setPage(p)
    } finally {
      if (pendingRequestKeyRef.current === requestKey) {
        pendingRequestKeyRef.current = null
      }
      if (reset) setLoading(false)
      else setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    activeKeywordRef.current = keyword   // 先更新 ref，再防抖
    const timer = setTimeout(
      () => fetchPage(1, keyword, true),
      keyword.trim() ? 450 : 0,
    )
    return () => clearTimeout(timer)
  }, [keyword, enabled, fetchPage])

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    // 用 ref 而非 closure，保证取到最新 keyword
    fetchPage(page + 1, activeKeywordRef.current, false)
  }, [loading, loadingMore, hasMore, page, fetchPage])

  return { customers, loading, loadingMore, hasMore, loadMore }
}
