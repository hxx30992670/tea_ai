import { useEffect, useRef, useState } from 'react'
import { Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import type { SpeechConfig } from '@/hooks/useSpeech'
import { useChat } from './hooks/useChat'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { QuickSuggestions } from './components/QuickSuggestions'
import { SessionDrawer } from './components/SessionDrawer'

const AUTO_SCROLL_THRESHOLD = 80

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD
}

interface AiPageProps {
  speechConfig?: SpeechConfig
}

export default function AiPage({ speechConfig }: AiPageProps) {
  const {
    messages, loading, loadingHistory, statusPhase,
    sessions, activeSessionId,
    sendMessage, stopMessage, newChat, loadSession,
  } = useChat()

  const [showSessions, setShowSessions] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  // 新消息时自动滚到底部
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!(viewport instanceof HTMLDivElement)) return

    const handleScroll = () => {
      shouldAutoScrollRef.current = isNearBottom(viewport)
    }

    handleScroll()
    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    shouldAutoScrollRef.current = true
  }, [activeSessionId])

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="AI 助手"
        subtitle={activeSession?.title ?? '语音或打字，快速查询数据'}
        action={
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" onClick={newChat} aria-label="新建对话">
                <Trash2 size={18} className="text-muted-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSessions(true)}
              aria-label="历史对话"
            >
              <History size={18} className="text-muted-foreground" />
            </Button>
          </div>
        }
      />

      {/* 消息列表 */}
      <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
        <div className="min-h-full overflow-x-hidden px-4 py-4 space-y-4">
          {loadingHistory ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`flex gap-2.5 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-64'}`} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen />
          ) : (
            messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* 快捷提问 + 输入框 */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md">
        <div className="px-3 pt-3">
          <QuickSuggestions onSelect={sendMessage} disabled={loading} />
        </div>
        <ChatInput
          onSend={sendMessage}
          onStop={stopMessage}
          loading={loading}
          disabled={loading || loadingHistory}
          statusPhase={statusPhase}
          speechConfig={speechConfig}
        />
      </div>

      {/* 历史会话抽屉 */}
      <SessionDrawer
        open={showSessions}
        onClose={() => setShowSessions(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        loading={loading || loadingHistory}
        onSelect={loadSession}
        onNewChat={newChat}
      />
    </div>
  )
}

function WelcomeScreen() {
  const appIconSrc = `${import.meta.env.BASE_URL}icons/icon.svg`

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <img src={appIconSrc} alt="" className="h-10 w-10" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">茶掌柜 AI</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          用自然语言查询经营数据<br />
          比如：「今天卖了多少钱？」
        </p>
      </div>
    </div>
  )
}
