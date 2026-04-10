import { useCallback, useEffect, useState } from 'react'
import { saleOrderApi } from '@/api/sale-order'
import type { SaleOrder } from '@/types'

export function useOrderList() {
  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const PAGE_SIZE = 15

  const load = useCallback(async (p = 1) => {
    if (p === 1) setLoading(true)
    else setLoadingMore(true)

    try {
      const res = await saleOrderApi.list({ page: p, pageSize: PAGE_SIZE })
      setTotal(res.total)
      if (p === 1) setOrders(res.list)
      else setOrders((prev) => [...prev, ...res.list])
      setPage(p)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  const loadMore = () => {
    if (!loadingMore && orders.length < total) load(page + 1)
  }

  return { orders, total, loading, loadingMore, refresh: () => load(1), loadMore }
}
