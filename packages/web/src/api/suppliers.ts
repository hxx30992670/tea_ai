import request from './index'
import type { ApiResponse, PageResult, Supplier } from '@/types'

export const supplierApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Supplier[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<Supplier>>>('/suppliers', { params })
    return res.data
  },

  create: async (data: Partial<Supplier>): Promise<Supplier> => {
    const res = await request.post<never, ApiResponse<Supplier>>('/suppliers', data)
    return res.data
  },

  update: async (id: number, data: Partial<Supplier>): Promise<Supplier> => {
    const res = await request.put<never, ApiResponse<Supplier>>(`/suppliers/${id}`, data)
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await request.delete(`/suppliers/${id}`)
  },
}
