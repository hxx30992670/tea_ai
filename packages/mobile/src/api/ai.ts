import request from './index'
import type { AiChatHistoryItem, AiChatResult, AiConversation, AiSession, AiSuggestion, ApiResponse } from '@/types'

export interface AiSuggestionResponse {
  enabled: boolean
  reason: string
  suggestions: AiSuggestion[]
}

export interface AiAttachment {
  type: 'image' | 'text'
  content: string
  mimeType?: string
  filename?: string
}

export const aiApi = {
  /** AI 智能建议（补货提醒等） */
  suggestions: async (): Promise<AiSuggestionResponse> => {
    const res = await request.get<never, ApiResponse<AiSuggestionResponse>>('/ai/suggestions')
    return res.data
  },

  /** 会话列表 */
  sessions: async (): Promise<AiSession[]> => {
    const res = await request.get<never, ApiResponse<AiSession[]>>('/ai/sessions')
    return res.data
  },

  /** 获取某个会话的消息记录 */
  sessionMessages: async (sessionId: string): Promise<AiConversation[]> => {
    const res = await request.get<never, ApiResponse<AiConversation[]>>(`/ai/sessions/${sessionId}`)
    return res.data
  },

  /** 对话历史 */
  history: async (params?: Record<string, unknown>): Promise<{ list: AiConversation[]; total: number }> => {
    const res = await request.get<never, ApiResponse<{ list: AiConversation[]; total: number }>>('/ai/history', { params })
    return res.data
  },

  /**
   * SSE 流式对话
   */
  chat: async (
    question: string,
    token: string | null | undefined,
    history: AiChatHistoryItem[] = [],
    sessionId?: string,
    onToken?: (chunk: string) => void,
    onStatus?: (phase: string, message: string) => void,
    onRows?: (rows: Record<string, unknown>[]) => void,
    signal?: AbortSignal,
    attachment?: AiAttachment,
  ): Promise<AiChatResult> => {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, history, sessionId, attachment }),
      signal,
    })

    if (!response.ok || !response.body) {
      const text = await response.text()
      throw new Error(text || 'AI 请求失败')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let enabled = true
    let reason = ''
    const chunks: string[] = []

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const lines = block.split('\n')
        const eventName = lines.find((l) => l.startsWith('event:'))?.slice(6).trim()
        const dataStr = lines.find((l) => l.startsWith('data:'))?.slice(5).trim()
        if (!eventName || !dataStr) continue

        try {
          const payload = JSON.parse(dataStr) as Record<string, unknown>
          if (eventName === 'status') {
            onStatus?.(String(payload.phase ?? ''), String(payload.message ?? ''))
          }
          if (eventName === 'token' && payload.content) {
            const chunk = String(payload.content)
            chunks.push(chunk)
            onToken?.(chunk)
          }
          if (eventName === 'rows' && Array.isArray(payload.rows)) {
            onRows?.(payload.rows as Record<string, unknown>[])
          }
          if (eventName === 'error') {
            enabled = false
            reason = String(payload.message ?? '出现错误')
          }
        } catch {
          // 忽略解析异常
        }
      }
    }

    return { enabled, reason, answer: chunks.join('') }
  },
}
