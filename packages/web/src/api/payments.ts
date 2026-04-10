import request from './index'
import type { ApiResponse, PageResult, PaymentRecord } from '@/types'

export interface ReceivableSummary {
  id: number
  orderNo: string
  customerId: number
  customerName: string
  totalAmount: number
  receivedAmount: number
  receivableAmount: number
  status: string
  createdAt: string
}

export interface PayableSummary {
  id: number
  orderNo: string
  supplierId: number
  supplierName: string
  totalAmount: number
  paidAmount: number
  payableAmount: number
  status: string
  createdAt: string
}

export const paymentApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: PaymentRecord[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<PaymentRecord>>>('/payments', { params })
    return res.data
  },

  create: async (data: Partial<PaymentRecord>): Promise<PaymentRecord> => {
    const res = await request.post<never, ApiResponse<PaymentRecord>>('/payments', data)
    return res.data
  },

  receivables: async (): Promise<ReceivableSummary[]> => {
    const res = await request.get<never, ApiResponse<ReceivableSummary[]>>('/receivables')
    return res.data
  },

  payables: async (): Promise<PayableSummary[]> => {
    const res = await request.get<never, ApiResponse<PayableSummary[]>>('/payables')
    return res.data
  },
}
