import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '@/api/dashboard'
import type { DashboardOverview, SalesTrend, StockWarning } from '@/types'

interface DashboardData {
  overview: DashboardOverview | null
  trend: SalesTrend[]
  warnings: StockWarning[]
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({ overview: null, trend: [], warnings: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const [overview, trend, warnings] = await Promise.all([
        dashboardApi.overview(),
        dashboardApi.salesTrend('day'),
        dashboardApi.stockWarnings(),
      ])
      setData({ overview, trend, warnings })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refreshing, refresh: () => load(true) }
}
