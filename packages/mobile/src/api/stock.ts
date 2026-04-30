import request from './index'
import type {
  ApiResponse,
  PageResult,
  StockBatch,
  StockOperationPayload,
  StockRecord,
  StockWarning,
  Warehouse,
} from '@/types'

interface ServerStockWarning {
  productId: number
  productName: string
  warningType: 'safe_stock' | 'expiry'
  level: 'critical' | 'high' | 'medium'
  stockQty: number
  availableStockQty?: number
  safeStock: number
  remainingDays?: number
}

export const stockApi = {
  /** 入库（必须传 reason：purchase / opening / return / other） */
  in: async (data: StockOperationPayload): Promise<void> => {
    await request.post('/stock/in', data)
  },

  /** 出库（必须传 reason：sale / damage / return / other） */
  out: async (data: StockOperationPayload): Promise<void> => {
    await request.post('/stock/out', data)
  },

  records: async (
    params?: Record<string, unknown>,
  ): Promise<{ list: StockRecord[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<StockRecord>>>('/stock/records', {
      params,
    })
    return res.data
  },

  batches: async (
    params?: Record<string, unknown>,
  ): Promise<{ list: StockBatch[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<StockBatch>>>('/stock/batches', {
      params,
    })
    return res.data
  },

  warehouses: async (params?: Record<string, unknown>): Promise<Warehouse[]> => {
    const res = await request.get<never, ApiResponse<Warehouse[]>>('/stock/warehouses', {
      params,
    })
    return res.data ?? []
  },

  createCount: async (data: {
    warehouseId?: number
    locationId?: number
    items: Array<{
      productId: number
      batchId?: number
      batchNo?: string
      countedQty: number
      remark?: string
    }>
    remark?: string
  }): Promise<void> => {
    await request.post('/stock/inventory-counts', data)
  },

  warnings: async (): Promise<StockWarning[]> => {
    const res = await request.get<never, ApiResponse<ServerStockWarning[]>>('/stock/warnings')
    return (res.data ?? []).map((w) => ({
      id: `${w.productId}-${w.warningType}`,
      productName: w.productName,
      type: w.warningType === 'safe_stock' ? 'low_stock' : 'expiring',
      stockQty: w.stockQty ?? 0,
      availableStockQty: w.availableStockQty ?? 0,
      safeStock: w.safeStock ?? 0,
      shelfDaysLeft: w.remainingDays,
      urgency: w.level === 'critical' ? 'high' : w.level === 'high' ? 'medium' : 'low',
    }))
  },
}
