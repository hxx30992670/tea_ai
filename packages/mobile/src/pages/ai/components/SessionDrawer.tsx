/**
 * 历史会话抽屉（底部弹出）
 * 列出所有 session，支持切换、新建
 */
import { MessageSquarePlus, Clock, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AiSession } from '@/types'

interface SessionDrawerProps {
  open: boolean
  onClose: () => void
  sessions: AiSession[]
  activeSessionId: string | undefined
  loading: boolean
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  onDelete: (sessionId: string) => void
}

export function SessionDrawer({
  open,
  onClose,
  sessions,
  activeSessionId,
  loading,
  onSelect,
  onNewChat,
  onDelete,
}: SessionDrawerProps) {
  const handleSelect = (sessionId: string) => {
    if (loading) return
    onSelect(sessionId)
    onClose()
  }

  const handleNewChat = () => {
    onNewChat()
    onClose()
  }

  const handleDelete = (sessionId: string) => {
    if (loading) return
    if (!window.confirm('确认删除这条历史对话吗？删除后不可恢复。')) return
    onDelete(sessionId)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent height="70dvh">
        <SheetHeader className="pb-2">
          <SheetTitle>历史对话</SheetTitle>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-3 overflow-y-auto overscroll-contain">
          {/* 新建对话 */}
          <Button
            variant="outline"
            className="w-full gap-2 justify-start"
            onClick={handleNewChat}
          >
            <MessageSquarePlus size={16} />
            新建对话
          </Button>

          {/* 会话列表 */}
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无历史对话</p>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((session) => {
                const isActive = session.sessionId === activeSessionId
                return (
                  <div
                    key={session.sessionId}
                    className={cn(
                      'flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border bg-secondary/20 hover:bg-secondary/40',
                    )}
                  >
                    <button
                      onClick={() => handleSelect(session.sessionId)}
                      disabled={loading}
                      className="flex flex-1 items-start gap-3 text-left tap-scale"
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'truncate text-sm font-medium',
                            isActive ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {session.title || '未命名对话'}
                        </p>
                        {session.lastAt && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock size={10} />
                            {session.lastAt.slice(0, 10)}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <span className="shrink-0 self-center text-xs font-semibold text-primary">当前</span>
                      )}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(session.sessionId)}
                      aria-label="删除历史对话"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
