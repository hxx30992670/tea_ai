import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Input, Button, Card, Typography, Tag, Spin, Alert, List, Tooltip } from 'antd'
import { AI_BINDING_ERROR_CODES, AI_CAPABILITY_CODES, AI_KEY_INVALID_CODES, type AiCapabilityCode } from '@shared/constants'
import {
  SendOutlined, RobotOutlined, BulbOutlined, StopOutlined, PaperClipOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import type { AiMessage, AiVisualizationSpec } from '@/types'
import { useAuthStore } from '@/store/auth'
import { aiApi, type AiSuggestion, type AiSession, type AiAttachment } from '@/api/ai'
import { systemApi } from '@/api/system'
import { detectVisualization } from '@/components/AiVisualization'
import PageHeader from '@/components/page/PageHeader'
import { toTimestamp } from '@/utils/date'
import '@/styles/page.less'
import { AssistantCard, UserBubble } from './components/ChatMessage'
import SessionSidebar from './components/SessionSidebar'
import './index.less'

const { Text, Title } = Typography

const QUICK_QUESTIONS = [
  '今天赚了多少？',
  '库存现在够吗？',
  '谁欠我钱？',
  '本月哪个商品卖得最好？',
  '最近需要跟进的客户？',
  '应付哪些供应商货款？',
]

const WELCOME_MSG: AiMessage = {
  role: 'assistant',
  content: '你好！我是茶掌柜 AI 助手 🍵\n\n我可以帮你查销售数据、库存状况、客户欠款、采购情况。支持自然语言提问，结果会以表格或图表展示。\n\n试着问我：今天卖了多少钱？',
  timestamp: Date.now(),
}

const VISUALIZATION_FOLLOW_UP_RE = /^(?:(?:用|改成|切换成|换成|转成)?(?:可视化|图表|柱状图|条形图|折线图|饼图|趋势图|对比图)(?:来)?(?:表示|展示)?|(?:用)?图表展示一下|全部展示出来|都展示出来|全部画出来|都画出来|全部用图表展示|都用图表展示)$/
const AUTO_SCROLL_THRESHOLD = 80

function pickVisualizationSourceRows(messages: AiMessage[], question: string) {
  const visualizable = [...messages]
    .filter((msg) => msg.role === 'assistant' && msg.rows && msg.rows.length > 0)
    .map((msg) => msg.rows!)

  if (visualizable.length === 0) {
    return undefined
  }

  if (/全部|都/.test(question)) {
    return [...visualizable].sort((a, b) => b.length - a.length)[0]
  }

  return visualizable[visualizable.length - 1]
}

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD
}

function getRuntimeAlertTitle(code?: AiCapabilityCode) {
  if (code === AI_CAPABILITY_CODES.QUOTA_EXCEEDED) return 'AI 已配置，但今日额度已用尽'
  if (code === AI_CAPABILITY_CODES.FEATURE_DISABLED) return 'AI 已配置，但当前授权未开通所需功能'
  if (code && AI_BINDING_ERROR_CODES.includes(code)) {
    return 'AI 已配置，但当前授权绑定异常'
  }
  if (code && AI_KEY_INVALID_CODES.includes(code)) {
    return 'AI 已配置，但当前授权 Key 不可用'
  }
  return 'AI 已配置，但当前能力校验未通过'
}

export default function AiPage() {
  const [messages, setMessages] = useState<AiMessage[]>([WELCOME_MSG])
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiCode, setAiCode] = useState<AiCapabilityCode | undefined>()
  const [aiReason, setAiReason] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<AiAttachment | null>(null)
  const [pendingAttachmentPreview, setPendingAttachmentPreview] = useState<{ imageUrl?: string; name?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 保存当前问题用于可视化检测
  const currentQuestion = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const shouldAutoScrollRef = useRef(true)
  const { user, accessToken } = useAuthStore()

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleMessagesScroll = useCallback(() => {
    const element = messagesRef.current
    if (!element) return
    shouldAutoScrollRef.current = isNearBottom(element)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    void (async () => {
      try {
        const [sessionRes, suggestionRes, settingsRes] = await Promise.all([
          aiApi.sessions(),
          aiApi.suggestions(),
          systemApi.getSettings(),
        ])
        setAiConfigured(Boolean(settingsRes.aiConfigured))
        setAiEnabled(suggestionRes.enabled)
        setAiCode(suggestionRes.code)
        setAiReason(suggestionRes.reason)
        setSuggestions(suggestionRes.suggestions)
        setSessions(sessionRes)
        if (sessionRes.length > 0) {
          await loadSession(sessionRes[0].sessionId)
        }
      } catch {
        setAiEnabled(false)
        setAiCode(AI_CAPABILITY_CODES.AI_RUNTIME_ERROR)
      }
    })()
  }, [isAdmin])

  const loadSession = async (sessionId: string) => {
    setActiveSessionId(sessionId)
    shouldAutoScrollRef.current = true
    try {
      const list = await aiApi.sessionMessages(sessionId)
      if (list.length === 0) { setMessages([WELCOME_MSG]); return }
      const msgs = list.flatMap((item) => ([
        { role: 'user' as const, content: item.question, timestamp: toTimestamp(item.createdAt) },
        {
          role: 'assistant' as const,
          content: item.answer,
          timestamp: toTimestamp(item.createdAt),
          rows: item.rows,
          visualization: item.rows?.length ? detectVisualization(item.rows, item.question) : undefined,
        },
      ]))
      setMessages(msgs)
    } catch {
      setMessages([WELCOME_MSG])
    }
  }

  const handleNewChat = () => {
    setActiveSessionId(undefined)
    shouldAutoScrollRef.current = true
    setMessages([WELCOME_MSG])
    setInput('')
  }

  const refreshSessions = async () => {
    try {
      const nextSessions = await aiApi.sessions()
      setSessions(nextSessions)
      return nextSessions
    } catch {
      return [] as AiSession[]
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    abortControllerRef.current?.abort()
    await aiApi.deleteSession(sessionId)
    const nextSessions = await refreshSessions()

    if (activeSessionId === sessionId) {
      const fallbackSessionId = nextSessions[0]?.sessionId
      if (fallbackSessionId) {
        await loadSession(fallbackSessionId)
      } else {
        handleNewChat()
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // reset so the same file can be re-selected
    e.target.value = ''

    const isImage = file.type.startsWith('image/')
    const maxSize = isImage ? 5 * 1024 * 1024 : 500 * 1024  // 图片 5MB，文本 500KB
    if (file.size > maxSize) {
      alert(isImage ? '图片不能超过 5MB，请压缩后重试' : '文件不能超过 500KB')
      return
    }

    const reader = new FileReader()

    if (isImage) {
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPendingAttachment({ type: 'image', content: dataUrl, mimeType: file.type, filename: file.name })
        setPendingAttachmentPreview({ imageUrl: dataUrl, name: file.name })
      }
      reader.readAsDataURL(file)
    } else {
      reader.onload = () => {
        const text = reader.result as string
        setPendingAttachment({ type: 'text', content: text, mimeType: file.type, filename: file.name })
        setPendingAttachmentPreview({ name: file.name })
      }
      reader.readAsText(file)
    }
  }

  const clearAttachment = () => {
    setPendingAttachment(null)
    setPendingAttachmentPreview(null)
  }

  const sendMessage = useCallback(async (text: string) => {
    if ((!text.trim() && !pendingAttachment) || loading || !isAdmin || !aiConfigured) return
    shouldAutoScrollRef.current = true

    const normalizedText = text.trim()
    const previousRows = pickVisualizationSourceRows(messages, normalizedText)

    if (!pendingAttachment && normalizedText && VISUALIZATION_FOLLOW_UP_RE.test(normalizedText) && previousRows) {
      setMessages((prev) => ([
        ...prev,
        { role: 'user', content: normalizedText, timestamp: Date.now() },
        {
          role: 'assistant',
          content: '已根据上一条查询结果切换为可视化图表展示。',
          timestamp: Date.now(),
          rows: previousRows,
          visualization: detectVisualization(previousRows, normalizedText),
        },
      ]))
      setInput('')
      return
    }

    const history = messages
      .filter((m) => m.content && !m.content.startsWith('⏳'))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }))

    currentQuestion.current = normalizedText

    const attachmentToSend = pendingAttachment
    const previewToSend = pendingAttachmentPreview
    clearAttachment()

    const userMsg: AiMessage = {
      role: 'user',
      content: normalizedText,
      timestamp: Date.now(),
      imageUrl: previewToSend?.imageUrl,
      attachmentName: previewToSend?.name && !previewToSend.imageUrl ? previewToSend.name : undefined,
    }
    const assistantMsg: AiMessage = { role: 'assistant', content: '', timestamp: Date.now() }

    setMessages((prev) => {
      const next = [...prev, userMsg, assistantMsg]
      setStreamingIdx(next.length - 1)
      return next
    })
    setInput('')
    setLoading(true)

    const sessionId = activeSessionId || `sess_${Date.now()}`
    if (!activeSessionId) setActiveSessionId(sessionId)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const result = await aiApi.chat(
        normalizedText,
        accessToken,
        history,
        sessionId,
        // onToken
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              const base = last.content.startsWith('⏳') ? '' : last.content
              next[next.length - 1] = { ...last, content: base + chunk }
            }
            return next
          })
        },
        // onStatus
        (_phase, message) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && (last.content === '' || last.content.startsWith('⏳'))) {
              next[next.length - 1] = { ...last, content: `⏳ ${message}` }
            }
            return next
          })
        },
        // onRows：收到查询数据后，自动检测可视化类型并附加到消息上
        (rows) => {
          const spec: AiVisualizationSpec = detectVisualization(rows, currentQuestion.current)
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, rows, visualization: spec }
            }
            return next
          })
        },
        controller.signal,
        attachmentToSend ?? undefined,
      )

      setAiCode(result.code)
      setAiReason(result.reason)

      if (!result.enabled && result.reason) {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: `⚠️ ${result.reason}` }
          }
          return next
        })
      }

      await refreshSessions()
    } catch (err) {
      // 用户主动中断，不显示错误
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && (last.content === '' || last.content.startsWith('⏳'))) {
            next[next.length - 1] = { ...last, content: '已中断' }
          }
          return next
        })
      } else {
        const errMsg = err instanceof Error ? err.message : '请求失败'
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: `⚠️ ${errMsg}` }
          }
          return next
        })
      }
    } finally {
      abortControllerRef.current = null
      setLoading(false)
      setStreamingIdx(null)
    }
  }, [loading, isAdmin, aiConfigured, messages, activeSessionId, accessToken, pendingAttachment, pendingAttachmentPreview])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  return (
    <div className="ai-page">
      <PageHeader
        title="AI 助手"
        description="用自然语言查询经营数据，支持表格与图表展示"
        className="page-header"
        extra={(
          <Tag
            className="ai-page__status"
            style={aiEnabled ? {
              background: 'linear-gradient(90deg, #1a3d2b, #2d6a4f)',
              border: '1px solid rgba(212,168,83,0.5)',
              color: '#d4a853',
              fontWeight: 600,
              borderRadius: 20,
            } : undefined}
            color={aiEnabled ? undefined : 'default'}
          >
            {aiConfigured ? 'AI 已开通' : 'AI 未开通'}
          </Tag>
        )}
      />

      {/* 权限/配置提示 */}
      {!isAdmin && (
        <Alert type="warning" showIcon message="当前账号没有 AI 权限"
          description="AI 助手仅对老板账号开放。" style={{ marginBottom: 16, borderRadius: 12 }} />
      )}
      {isAdmin && !aiConfigured && (
        <Alert type="info" showIcon message="AI 当前不可用"
          description={aiReason || '请前往 系统设置 > AI配置 完成授权、Prompt 服务和模型配置。'}
          style={{ marginBottom: 16, borderRadius: 12 }}
          action={<Button size="small" href="/system/settings">去配置</Button>}
        />
      )}
      {isAdmin && aiConfigured && !aiEnabled && aiReason && (
        <Alert
          type="warning"
          showIcon
          message={getRuntimeAlertTitle(aiCode)}
          description={aiReason}
          style={{ marginBottom: 16, borderRadius: 12 }}
        />
      )}

      {isAdmin && suggestions.length > 0 && (
        <Card style={{ marginBottom: 12, borderRadius: 12 }} size="small" title="智能建议">
          <List size="small" dataSource={suggestions}
            renderItem={(item) => <List.Item style={{ padding: '4px 0', fontSize: 13 }}>{item.content}</List.Item>} />
        </Card>
      )}

      <div className="ai-page__layout">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={loading}
          onCreate={handleNewChat}
          onSelect={loadSession}
          onDelete={handleDeleteSession}
        />

        <Card
          className="ai-chat-card"
          styles={{ body: { padding: 0 } }}
        >
          <div className="ai-chat-card__messages" ref={messagesRef} onScroll={handleMessagesScroll}>
            {messages.map((msg, idx) =>
              msg.role === 'user'
                ? <UserBubble key={idx} content={msg.content} imageUrl={msg.imageUrl} attachmentName={msg.attachmentName} />
                : <AssistantCard key={idx} message={msg} isStreaming={streamingIdx === idx} />
            )}
            {loading && streamingIdx === null && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Spin size="small" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-card__quick-questions">
            {QUICK_QUESTIONS.map((q) => (
              <Tag key={q}
                className="ai-chat-card__question"
                color="green"
                onClick={() => isAdmin && aiConfigured && void sendMessage(q)}
              >
                <BulbOutlined style={{ marginRight: 3 }} />{q}
              </Tag>
            ))}
          </div>

          <div className="ai-chat-card__composer">
            {/* 隐藏文件 input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,.doc"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {/* 附件预览条 */}
            {pendingAttachmentPreview && (
              <div className="ai-chat-card__attachment-preview">
                {pendingAttachmentPreview.imageUrl ? (
                  <img src={pendingAttachmentPreview.imageUrl} alt="预览" style={{ height: 48, borderRadius: 6 }} />
                ) : (
                  <span style={{ fontSize: 12, color: '#555' }}>{pendingAttachmentPreview.name}</span>
                )}
                <Button
                  type="text"
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={clearAttachment}
                  style={{ color: '#999' }}
                />
              </div>
            )}

            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingAttachment ? '描述图片内容或直接发送识别...' : '输入问题，Enter 发送，Shift+Enter 换行...'}
              autoSize={{ minRows: 1, maxRows: 5 }}
              className="ai-chat-card__input"
              disabled={loading || !isAdmin || !aiConfigured}
            />
            <Tooltip title="上传图片或文件（发票、订单截图、文本等）">
              <Button
                type="text"
                icon={<PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !isAdmin || !aiConfigured}
                className="ai-chat-card__attach"
              />
            </Tooltip>
            {loading ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => abortControllerRef.current?.abort()}
                className="ai-chat-card__send"
              >
                停止
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => void sendMessage(input)}
                disabled={(!input.trim() && !pendingAttachment) || !isAdmin || !aiConfigured}
                className="ai-chat-card__send"
              >
                发送
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
