/**
 * 采购订单 API 接口
 * 封装采购订单及退货的增删改查、确认入库等请求
 */
import request from './index'
import type { ApiResponse, PageResult, PurchaseOrder } from '@/types'

export interface CreatePurchaseReturnPayload {
  items: Array<{
    purchaseOrderItemId: number
    quantity?: number
    packageQty?: number
    looseQty?: number
  }>
  refundAmount?: number
  method?: string
  remark?: string
}

export const purchaseOrderApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: PurchaseOrder[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<PurchaseOrder>>>('/purchase-orders', { params })
    return res.data
  },

  create: async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const res = await request.post<never, ApiResponse<PurchaseOrder>>('/purchase-orders', data)
    return res.data
  },

  getById: async (id: number): Promise<PurchaseOrder> => {
    const res = await request.get<never, ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`)
    return res.data
  },

  update: async (id: number, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const res = await request.put<never, ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`, data)
    return res.data
  },

  stockIn: async (id: number, remark?: string): Promise<void> => {
    await request.put(`/purchase-orders/${id}/stock-in`, { remark })
  },

  createReturn: async (id: number, data: CreatePurchaseReturnPayload): Promise<PurchaseOrder> => {
    const res = await request.post<never, ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/returns`, data)
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await request.delete(`/purchase-orders/${id}`)
  },
}
