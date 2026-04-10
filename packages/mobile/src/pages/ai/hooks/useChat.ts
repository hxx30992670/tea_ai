import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi } from '@/api/ai'
import { useAuthStore } from '@/store/auth'
import { detectVisualization } from '@/lib/detectVisualization'
import type { AiChatHistoryItem, AiConversation, AiSession, AiVisualizationSpec } from '@/types'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'thinking' | 'done' | 'error'
  rows?: Record<string, unknown>[]
  visualization?: AiVisualizationSpec
}

/** 将服务端 AiConversation（question/answer 对）转为本地 Message 列表 */
function conversationsToMessages(list: AiConversation[]): Message[] {
  return list.flatMap((c) => {
    const msgs: Message[] = [
      { id: `${c.id}-q`, role: 'user', content: c.question, status: 'done' },
    ]
    const assistantMsg: Message = {
      id: `${c.id}-a`,
      role: 'assistant',
      content: c.answer,
      status: 'done',
    }
    // 恢复图表：服务端 rows 字段若存在则重建 visualization
    if (c.rows && c.rows.length > 0) {
      assistantMsg.rows = c.rows
      assistantMsg.visualization = detectVisualization(c.rows, c.question)
    }
    msgs.push(assistantMsg)
    return msgs
  })
}

export function useChat() {
  const { accessToken } = useAuthStore()

  // ── 消息 ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [statusPhase, setStatusPhase] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // ── 会话 ──────────────────────────────────────────────────
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>()
  const sessionIdRef = useRef<string | undefined>()
  useEffect(() => { sessionIdRef.current = activeSessionId }, [activeSessionId])

  // 当前问题 ref（供 onRows 闭包使用）
  const currentQuestionRef = useRef('')

  // ── 刷新会话列表 ──────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    try {
      const list = await aiApi.sessions()
      setSessions(list)
    } catch { /* ignore */ }
  }, [])

  // ── 切换会话，加载历史消息（含图表恢复） ─────────────────
  const loadSession = useCallback(async (sessionId: string) => {
    abortRef.current?.abort()
    setActiveSessionId(sessionId)
    sessionIdRef.current = sessionId
    setLoadingHistory(true)
    setMessages([])
    try {
      const list = await aiApi.sessionMessages(sessionId)
      setMessages(conversationsToMessages(list))
    } catch {
      setMessages([])
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // ── 新建对话 ──────────────────────────────────────────────
  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setActiveSessionId(undefined)
    sessionIdRef.current = undefined
    setMessages([])
    setLoading(false)
    setStatusPhase('')
  }, [])

  // ── 初始化：拉取会话列表，自动加载最新会话 ───────────────
  useEffect(() => {
    void (async () => {
      try {
        const list = await aiApi.sessions()
        setSessions(list)
        if (list.length > 0) {
          await loadSession(list[0].sessionId)
        }
      } catch { /* ignore */ }
    })()
  }, [loadSession])

  // ── 发送消息 ──────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return

      currentQuestionRef.current = text

      const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: text, status: 'done' }
      const assistantId = `a${Date.now()}`
      const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', status: 'thinking' }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setLoading(true)
      setStatusPhase('')

      abortRef.current?.abort()
      abortRef.current = new AbortController()

      let sessionId = sessionIdRef.current
      if (!sessionId) {
        sessionId = `sess_${Date.now()}`
        setActiveSessionId(sessionId)
        sessionIdRef.current = sessionId
      }

      try {
        const history: AiChatHistoryItem[] = messages
          .filter((m) => m.status === 'done' || m.role === 'user')
          .map((m) => ({ role: m.role, content: m.content }))

        const result = await aiApi.chat(
          text,
          accessToken,
          history,
          sessionId,
          // onToken：流式追加内容
          (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk, status: 'thinking' } : m,
              ),
            )
          },
          // onStatus
          (_phase, msg) => setStatusPhase(msg || _phase),
          // onRows：收到查询数据，自动检测图表类型
          (rows) => {
            const visualization = detectVisualization(rows, currentQuestionRef.current)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, rows, visualization } : m,
              ),
            )
          },
          abortRef.current.signal,
        )

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.answer || (result.enabled ? m.content : result.reason),
                  status: result.enabled ? 'done' : 'error',
                }
              : m,
          ),
        )

        void refreshSessions()
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content || '已中断', status: 'done' } : m,
            ),
          )
          return
        }
        const errMsg = err instanceof Error ? err.message : 'AI 请求失败'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: errMsg, status: 'error' } : m,
          ),
        )
      } finally {
        setLoading(false)
        setStatusPhase('')
      }
    },
    [loading, messages, accessToken, refreshSessions],
  )

  const stopMessage = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    messages,
    loading,
    loadingHistory,
    statusPhase,
    sessions,
    activeSessionId,
    sendMessage,
    stopMessage,
    newChat,
    loadSession,
  }
}
