import request from './index'
import type { ApiResponse, Customer, PageResult } from '@/types'

export const customerApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Customer[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<Customer>>>('/customers', { params })
    return res.data
  },

  search: async (keyword: string): Promise<Customer[]> => {
    const res = await request.get<never, ApiResponse<PageResult<Customer>>>('/customers', {
      params: { keyword, pageSize: 20 },
    })
    return res.data.list
  },

  create: async (data: Partial<Customer>): Promise<Customer> => {
    const res = await request.post<never, ApiResponse<Customer>>('/customers', data)
    return res.data
  },
}
