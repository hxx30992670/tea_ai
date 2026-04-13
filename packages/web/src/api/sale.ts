/**
 * 销售订单 API 接口
 * 封装销售订单、退货/退款/换货、收款及快速开单等请求
 */
import request from './index'
import type { ApiResponse, PageResult, SaleOrder } from '@/types'

export interface CreateSaleReturnPayload {
  items: Array<{
    saleOrderItemId: number
    quantity?: number
    packageQty?: number
    looseQty?: number
  }>
  refundAmount?: number
  method?: string
  reasonCode?: string
  reasonNote?: string
  remark?: string
}

export interface CreateSaleRefundPayload {
  amount: number
  method?: string
  reasonCode?: string
  reasonNote?: string
  remark?: string
}

export interface CreateSaleExchangePayload {
  returnItems: Array<{
    saleOrderItemId: number
    quantity?: number
    packageQty?: number
    looseQty?: number
  }>
  exchangeItems: Array<{
    productId: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice: number
  }>
  refundAmount?: number
  receiveAmount?: number
  method?: string
  reasonCode?: string
  reasonNote?: string
  remark?: string
}

export const saleOrderApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: SaleOrder[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<SaleOrder>>>('/sale-orders', { params })
    return res.data
  },

  create: async (data: Partial<SaleOrder>): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>('/sale-orders', data)
    return res.data
  },

  quickComplete: async (data: Record<string, unknown>): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>('/sale-orders/quick-complete', data)
    return res.data
  },

  getById: async (id: number): Promise<SaleOrder> => {
    const res = await request.get<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}`)
    return res.data
  },

  update: async (id: number, data: Partial<SaleOrder>): Promise<SaleOrder> => {
    const res = await request.put<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}`, data)
    return res.data
  },

  stockOut: async (id: number, remark?: string): Promise<void> => {
    await request.put(`/sale-orders/${id}/stock-out`, { remark })
  },

  createReturn: async (id: number, data: CreateSaleReturnPayload): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}/returns`, data)
    return res.data
  },

  createRefund: async (id: number, data: CreateSaleRefundPayload): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}/refunds`, data)
    return res.data
  },

  createExchange: async (id: number, data: CreateSaleExchangePayload): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}/exchanges`, data)
    return res.data
  },

  createExchangeDraft: async (id: number, data: CreateSaleExchangePayload): Promise<{ exchangeId: number; exchangeNo: string; status: string }> => {
    const res = await request.post<never, ApiResponse<{ exchangeId: number; exchangeNo: string; status: string }>>(`/sale-orders/${id}/exchanges`, { ...data, saveAsDraft: true })
    return res.data
  },

  getExchanges: async (orderId: number): Promise<Array<{ id: number; exchangeNo: string; status: string; returnAmount: number; exchangeAmount: number; refundAmount: number; receiveAmount: number; createdAt: string; items: unknown[] }>> => {
    const res = await request.get<never, ApiResponse<Array<{ id: number; exchangeNo: string; status: string; returnAmount: number; exchangeAmount: number; refundAmount: number; receiveAmount: number; createdAt: string; items: unknown[] }>>>(`/sale-orders/${orderId}/exchanges`)
    return res.data
  },

  updateExchangeDraft: async (orderId: number, exchangeId: number, data: Partial<CreateSaleExchangePayload>): Promise<{ exchangeId: number; exchangeNo: string; status: string }> => {
    const res = await request.put<never, ApiResponse<{ exchangeId: number; exchangeNo: string; status: string }>>(`/sale-orders/${orderId}/exchanges/${exchangeId}`, data)
    return res.data
  },

  cancelExchange: async (orderId: number, exchangeId: number): Promise<{ success: boolean }> => {
    const res = await request.delete<never, ApiResponse<{ success: boolean }>>(`/sale-orders/${orderId}/exchanges/${exchangeId}`)
    return res.data
  },

  shipExchangeDraft: async (orderId: number, exchangeId: number): Promise<{ success: boolean; exchangeId: number; status: string }> => {
    const res = await request.post<never, ApiResponse<{ success: boolean; exchangeId: number; status: string }>>(`/sale-orders/${orderId}/exchanges/${exchangeId}/ship`)
    return res.data
  },

  settleExchangeDraft: async (orderId: number, exchangeId: number): Promise<{ success: boolean; exchangeId: number; status: string }> => {
    const res = await request.post<never, ApiResponse<{ success: boolean; exchangeId: number; status: string }>>(`/sale-orders/${orderId}/exchanges/${exchangeId}/settle`)
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await request.delete(`/sale-orders/${id}`)
  },
}
