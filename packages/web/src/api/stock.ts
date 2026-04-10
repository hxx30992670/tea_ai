import request from './index'
import type { ApiResponse, PageResult, StockRecord, StockWarning } from '@/types'

interface StockStats {
  todayIn: number
  todayOut: number
}

// 服务端预警的原始结构（与 dashboard 的 getStockWarnings 一致）
interface ServerStockWarning {
  productId: number
  productName: string
  sku: string
  teaType: string
  warningType: 'safe_stock' | 'expiry'
  level: 'critical' | 'high' | 'medium'
  stockQty: number
  safeStock: number
  remainingDays?: number
  message?: string
}

function mapWarningType(t: 'safe_stock' | 'expiry'): 'low_stock' | 'expiring' {
  return t === 'safe_stock' ? 'low_stock' : 'expiring'
}

function mapLevel(l: 'critical' | 'high' | 'medium'): 'high' | 'medium' | 'low' {
  return l === 'critical' ? 'high' : l === 'high' ? 'medium' : 'low'
}

export const stockApi = {
  records: async (params?: Record<string, unknown>): Promise<{ list: StockRecord[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<StockRecord>>>('/stock/records', { params })
    return res.data
  },

  in: async (data: Partial<StockRecord>): Promise<void> => {
    await request.post('/stock/in', data)
  },

  out: async (data: Partial<StockRecord>): Promise<void> => {
    await request.post('/stock/out', data)
  },

  stats: async (): Promise<StockStats> => {
    const res = await request.get<never, ApiResponse<StockStats>>('/stock/stats')
    return res.data
  },

  warnings: async (): Promise<StockWarning[]> => {
    const res = await request.get<never, ApiResponse<ServerStockWarning[]>>('/stock/warnings')
    return (res.data ?? []).map((w) => ({
      id: `${w.productId}-${w.warningType}`,
      productName: w.productName,
      type: mapWarningType(w.warningType),
      stockQty: w.stockQty ?? 0,
      safeStock: w.safeStock ?? 0,
      shelfDaysLeft: w.remainingDays,
      urgency: mapLevel(w.level),
    }))
  },
}
