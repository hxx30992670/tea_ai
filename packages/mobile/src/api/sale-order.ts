import request from './index'
import type { ApiResponse, PageResult, SaleOrder } from '@/types'

/** 创建销售订单 */
export interface CreateSaleOrderPayload {
  customerId?: number
  items: Array<{
    productId: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice: number
  }>
  remark?: string
}

/** 快速完成（建单 + 出库 + 收款） */
export interface QuickCompleteSaleOrderPayload extends CreateSaleOrderPayload {
  paidAmount: number
  method?: string
}

/** 查询参数 */
export interface SaleOrderQueryParams {
  page?: number
  pageSize?: number
  customerId?: number
  status?: string
  keyword?: string
  dateFrom?: string
  dateTo?: string
}

export const saleOrderApi = {
  list: async (params?: SaleOrderQueryParams): Promise<{ list: SaleOrder[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<SaleOrder>>>('/sale-orders', {
      params,
    })
    return res.data
  },

  getById: async (id: number): Promise<SaleOrder> => {
    const res = await request.get<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}`)
    return res.data
  },

  /** 创建草稿订单 */
  create: async (data: CreateSaleOrderPayload): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>('/sale-orders', data)
    return res.data
  },

  /** 编辑草稿订单 */
  update: async (id: number, data: Partial<CreateSaleOrderPayload>): Promise<SaleOrder> => {
    const res = await request.put<never, ApiResponse<SaleOrder>>(`/sale-orders/${id}`, data)
    return res.data
  },

  /** 一键完成：建单 + 出库 + 收款 */
  quickComplete: async (data: QuickCompleteSaleOrderPayload): Promise<SaleOrder> => {
    const res = await request.post<never, ApiResponse<SaleOrder>>(
      '/sale-orders/quick-complete',
      data,
    )
    return res.data
  },

  /** 出库 */
  stockOut: async (id: number, remark?: string): Promise<void> => {
    await request.put(`/sale-orders/${id}/stock-out`, { remark })
  },

  /** 补录收款（建单后单独收款） */
  collectPayment: async (
    id: number,
    amount: number,
    method: string,
    remark?: string,
  ): Promise<void> => {
    await request.post('/payments', {
      type: 'receive',
      relatedType: 'sale_order',
      relatedId: id,
      amount,
      method,
      remark,
    })
  },

  /** 删除草稿 */
  remove: async (id: number): Promise<void> => {
    await request.delete(`/sale-orders/${id}`)
  },
}
