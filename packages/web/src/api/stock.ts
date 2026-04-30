import request from './index'
import type {
  ApiResponse,
  InventoryCountRecord,
  PageResult,
  StockBatch,
  StockLocation,
  StockRecord,
  StockTransferRecord,
  StockWarning,
  Warehouse,
} from '@/types'

interface StockStats {
  todayIn: number
  todayOut: number
}

interface InventoryCountPayload {
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
}

interface StockTransferPayload {
  fromWarehouseId: number
  fromLocationId?: number
  toWarehouseId: number
  toLocationId?: number
  items: Array<{
    batchId: number
    quantity: number
    remark?: string
  }>
  remark?: string
}

interface WarehousePayload {
  name?: string
  code?: string
  type?: string
  address?: string
  isDefault?: boolean
  remark?: string
}

interface ProcessAfterSaleStockPayload {
  result: 'sellable' | 'unsellable'
  batchMode?: 'same_batch' | 'new_batch'
  batchNo?: string
  warehouseId?: number
  locationId?: number
  remark?: string
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
  availableStockQty?: number
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

  batches: async (params?: Record<string, unknown>): Promise<{ list: StockBatch[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<StockBatch>>>('/stock/batches', { params })
    return res.data
  },

  matrix: async (params?: Record<string, unknown>): Promise<{ list: StockBatch[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<StockBatch>>>('/stock/matrix', { params })
    return res.data
  },

  warehouses: async (params?: Record<string, unknown>): Promise<Warehouse[]> => {
    const res = await request.get<never, ApiResponse<Warehouse[]>>('/stock/warehouses', { params })
    return res.data ?? []
  },

  createWarehouse: async (data: WarehousePayload): Promise<Warehouse> => {
    const res = await request.post<never, ApiResponse<Warehouse>>('/stock/warehouses', data)
    return res.data
  },

  updateWarehouse: async (id: number, data: WarehousePayload): Promise<Warehouse> => {
    const res = await request.put<never, ApiResponse<Warehouse>>(`/stock/warehouses/${id}`, data)
    return res.data
  },

  updateWarehouseStatus: async (id: number, status: number): Promise<Warehouse> => {
    const res = await request.patch<never, ApiResponse<Warehouse>>(`/stock/warehouses/${id}/status`, { status })
    return res.data
  },

  createLocation: async (data: Partial<StockLocation>): Promise<StockLocation> => {
    const res = await request.post<never, ApiResponse<StockLocation>>('/stock/locations', data)
    return res.data
  },

  updateLocation: async (id: number, data: Partial<StockLocation>): Promise<StockLocation> => {
    const res = await request.put<never, ApiResponse<StockLocation>>(`/stock/locations/${id}`, data)
    return res.data
  },

  updateLocationStatus: async (id: number, status: number): Promise<StockLocation> => {
    const res = await request.patch<never, ApiResponse<StockLocation>>(`/stock/locations/${id}/status`, { status })
    return res.data
  },

  updateBatchStatus: async (id: number, status: number): Promise<StockBatch> => {
    const res = await request.patch<never, ApiResponse<StockBatch>>(`/stock/batches/${id}/status`, { status })
    return res.data
  },

  processAfterSaleBatch: async (id: number, data: ProcessAfterSaleStockPayload): Promise<StockBatch> => {
    const res = await request.post<never, ApiResponse<StockBatch>>(`/stock/after-sale-batches/${id}/process`, data)
    return res.data
  },

  counts: async (): Promise<InventoryCountRecord[]> => {
    const res = await request.get<never, ApiResponse<InventoryCountRecord[]>>('/stock/inventory-counts')
    return res.data ?? []
  },

  createCount: async (data: InventoryCountPayload): Promise<InventoryCountRecord> => {
    const res = await request.post<never, ApiResponse<InventoryCountRecord>>('/stock/inventory-counts', data)
    return res.data
  },

  transfers: async (): Promise<StockTransferRecord[]> => {
    const res = await request.get<never, ApiResponse<StockTransferRecord[]>>('/stock/transfers')
    return res.data ?? []
  },

  createTransfer: async (data: StockTransferPayload): Promise<StockTransferRecord> => {
    const res = await request.post<never, ApiResponse<StockTransferRecord>>('/stock/transfers', data)
    return res.data
  },

  stats: async (): Promise<StockStats> => {
    const res = await request.get<never, ApiResponse<StockStats>>('/stock/stats')
    return res.data
  },

  warnings: async (): Promise<StockWarning[]> => {
    const res = await request.get<never, ApiResponse<ServerStockWarning[]>>('/stock/warnings')
    return (res.data ?? []).map((w) => ({
      id: `${w.productId}-${w.warningType}`,
      productId: w.productId,
      productName: w.productName,
      type: mapWarningType(w.warningType),
      stockQty: w.stockQty ?? 0,
      availableStockQty: w.availableStockQty ?? 0,
      safeStock: w.safeStock ?? 0,
      shelfDaysLeft: w.remainingDays,
      urgency: mapLevel(w.level),
    }))
  },
}
