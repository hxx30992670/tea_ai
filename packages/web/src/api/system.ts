import request from './index'
import type { ApiResponse, PageResult, SysUser, OperationLog } from '@/types'

export interface SystemSettings {
  shopName?: string
  aiConfigured?: boolean
  aiProvider?: string
  aiModelName?: string
  aiIndustry?: string
}

export interface UpdateAiSettingsPayload {
  aiApiKey: string
  aiProvider: string
  aiModelApiKey: string
  aiModelName: string
  aiModelBaseUrl: string
  aiPromptServiceUrl: string
}

export const systemApi = {
  users: async (params?: Record<string, unknown>): Promise<{ list: SysUser[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<SysUser>>>('/system/users', { params })
    return res.data
  },

  createUser: async (data: Partial<SysUser> & { password?: string }): Promise<SysUser> => {
    const res = await request.post<never, ApiResponse<SysUser>>('/system/users', data)
    return res.data
  },

  updateUser: async (id: number, data: Partial<SysUser>): Promise<SysUser> => {
    const res = await request.put<never, ApiResponse<SysUser>>(`/system/users/${id}`, data)
    return res.data
  },

  toggleStatus: async (id: number, status: number): Promise<void> => {
    await request.put(`/system/users/${id}/status`, { status })
  },

  logs: async (params?: Record<string, unknown>): Promise<{ list: OperationLog[]; total: number }> => {
    const res = await request.get<never, ApiResponse<PageResult<OperationLog>>>('/system/operation-logs', { params })
    return res.data
  },

  getSettings: async (): Promise<SystemSettings> => {
    const res = await request.get<never, ApiResponse<SystemSettings>>('/system/settings')
    return res.data
  },

  updateSettings: async (data: Partial<SystemSettings> | UpdateAiSettingsPayload): Promise<void> => {
    await request.put('/system/settings', data)
  },

  testAi: async (params: {
    apiKey: string
    promptServiceUrl: string
    provider: string
    modelApiKey: string
    modelName: string
    modelBaseUrl: string
  }): Promise<{ ok: boolean; message: string; checks: Array<{ key: string; label: string; ok: boolean; message: string }> }> => {
    const res = await request.post<never, { data: { ok: boolean; message: string; checks: Array<{ key: string; label: string; ok: boolean; message: string }> } }>('/ai/test', params)
    return res.data
  },
}
