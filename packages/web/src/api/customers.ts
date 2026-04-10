/**
 * 客户管理 API 接口
 * 封装客户档案及跟进记录的增删改查等请求
 */
import request from './index'
import type { ApiResponse, PageResult, Customer } from '@/types'

export interface FollowUp {
  id: number
  customerId: number
  content: string
  followType?: 'call' | 'wechat' | 'visit' | 'other'
  intentLevel?: 'high' | 'medium' | 'low' | 'lost'
  nextFollowDate?: string
  operatorId?: number
  createdAt: string
}

export const customerApi = {
  list: async (params?: Record<string, unknown>): Promise<{ list: Customer[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<Customer>>>('/customers', { params })
    return res.data
  },

  create: async (data: Partial<Customer>): Promise<Customer> => {
    const res = await request.post<never, ApiResponse<Customer>>('/customers', data)
    return res.data
  },

  update: async (id: number, data: Partial<Customer>): Promise<Customer> => {
    const res = await request.put<never, ApiResponse<Customer>>(`/customers/${id}`, data)
    return res.data
  },

  followUps: async (params?: Record<string, unknown>): Promise<{ list: FollowUp[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<FollowUp>>>('/follow-ups', { params })
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await request.delete(`/customers/${id}`)
  },

  createFollowUp: async (data: { customerId: number; content: string; followType?: string; intentLevel?: string; nextFollowDate?: string }): Promise<FollowUp> => {
    const res = await request.post<never, ApiResponse<FollowUp>>('/follow-ups', data)
    return res.data
  },
}
