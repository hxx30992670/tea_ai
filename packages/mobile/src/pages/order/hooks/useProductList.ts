import { useState, useEffect, useCallback, useRef } from 'react'
import { productApi } from '@/api/product'
import type { Product } from '@/types'

const PAGE_SIZE = 20

export function useProductList(keyword: string, enabled = true) {
  const [products, setProducts] = useState<Product[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Track the keyword used for the current loaded pages to detect resets
  const loadedKeywordRef = useRef<string | null>(null)

  const hasMore = products.length < total

  const fetchPage = useCallback(async (p: number, kw: string, reset: boolean) => {
    if (reset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    try {
      const params: Record<string, unknown> = { page: p, pageSize: PAGE_SIZE }
      if (kw.trim()) params.keyword = kw.trim()

      const result = await productApi.list(params)
      setTotal(result.total)
      setProducts((prev) => (reset ? result.list : [...prev, ...result.list]))
      setPage(p)
      loadedKeywordRef.current = kw
    } finally {
      if (reset) setLoading(false)
      else setLoadingMore(false)
    }
  }, [])

  // Reset list and refetch when keyword changes (debounced)
  useEffect(() => {
    if (!enabled) return

    const delay = keyword.trim() ? 300 : 0
    const timer = setTimeout(() => {
      fetchPage(1, keyword, true)
    }, delay)
    return () => clearTimeout(timer)
  }, [keyword, enabled, fetchPage])

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    fetchPage(page + 1, loadedKeywordRef.current ?? keyword, false)
  }, [loading, loadingMore, hasMore, page, keyword, fetchPage])

  return { products, loading, loadingMore, hasMore, loadMore }
}
