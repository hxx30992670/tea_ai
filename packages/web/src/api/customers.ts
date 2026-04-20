/**
 * 客户管理 API 接口
 * 封装客户档案及跟进记录的增删改查等请求
 */
import request from './index'
import type { ApiResponse, PageResult, Customer } from '@/types'

export type FollowUpStatus = 'pending' | 'completed' | 'cancelled'
export type FollowUpDisplayStatus = FollowUpStatus | 'overdue'

export interface FollowUp {
  id: number
  customerId: number
  content: string
  followType?: 'call' | 'wechat' | 'visit' | 'other'
  intentLevel?: 'high' | 'medium' | 'low' | 'lost'
  status: FollowUpStatus
  displayStatus: FollowUpDisplayStatus
  feedback?: string
  nextFollowDate?: string
  operatorId?: number
  operatorName?: string
  completedBy?: number
  completedByName?: string
  completedAt?: string
  cancelledBy?: number
  cancelledByName?: string
  cancelledAt?: string
  cancelReason?: string
  updatedAt?: string
  isOverdue?: boolean
  canEdit?: boolean
  canCancel?: boolean
  canConfirm?: boolean
  createdAt: string
}

export interface FollowUpQueryParams {
  customerId?: number
  page?: number
  pageSize?: number
  keyword?: string
  status?: FollowUpDisplayStatus
  followType?: 'call' | 'wechat' | 'visit' | 'other'
  dateFrom?: string
  dateTo?: string
}

export interface CreateFollowUpPayload {
  customerId: number
  content: string
  followType?: string
  intentLevel?: string
  nextFollowDate?: string
}

export interface UpdateFollowUpPayload {
  content?: string
  followType?: string
  intentLevel?: string
  nextFollowDate?: string
}

export interface CompleteFollowUpPayload {
  feedback: string
  followType?: string
  intentLevel?: string
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

  followUps: async (params?: FollowUpQueryParams): Promise<{ list: FollowUp[]; total: number; page: number; pageSize: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<FollowUp>>>('/follow-ups', { params })
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await request.delete(`/customers/${id}`)
  },

  createFollowUp: async (data: CreateFollowUpPayload): Promise<FollowUp> => {
    const res = await request.post<never, ApiResponse<FollowUp>>('/follow-ups', data)
    return res.data
  },

  updateFollowUp: async (id: number, data: UpdateFollowUpPayload): Promise<FollowUp> => {
    const res = await request.put<never, ApiResponse<FollowUp>>(`/follow-ups/${id}`, data)
    return res.data
  },

  completeFollowUp: async (id: number, data: CompleteFollowUpPayload): Promise<FollowUp> => {
    const res = await request.post<never, ApiResponse<FollowUp>>(`/follow-ups/${id}/complete`, data)
    return res.data
  },

  cancelFollowUp: async (id: number, reason?: string): Promise<FollowUp> => {
    const res = await request.post<never, ApiResponse<FollowUp>>(`/follow-ups/${id}/cancel`, { reason })
    return res.data
  },
}
