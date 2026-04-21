import type { ApiResponse } from '@/types'
import request from './index'

export interface SpeechCapabilities {
  enabled: boolean
  provider: string
  model: string
  realtimeSupported: boolean
  reason: string
}

export const systemApi = {
  speechCapabilities: async (): Promise<SpeechCapabilities> => {
    const res = await request.get<never, ApiResponse<SpeechCapabilities>>('/system/speech-capabilities')
    return res.data
  },
}
