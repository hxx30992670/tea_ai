import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { AiSession } from '@/api/ai'
import { EmptySessionText } from './ChatMessage'

type SessionSidebarProps = {
  sessions: AiSession[]
  activeSessionId?: string
  loading: boolean
  onCreate: () => void
  onSelect: (sessionId: string) => void | Promise<void>
}

export default function SessionSidebar({ sessions, activeSessionId, loading, onCreate, onSelect }: SessionSidebarProps) {
  return (
    <div className="ai-sidebar">
      <div className="ai-sidebar__header">
        <Button type="primary" icon={<PlusOutlined />} block onClick={onCreate} className="ai-sidebar__new-chat">
          新建聊天
        </Button>
      </div>

      {sessions.length === 0 ? <EmptySessionText /> : sessions.map((session) => {
        const isActive = session.sessionId === activeSessionId
        return (
          <button
            key={session.sessionId}
            type="button"
            className={`ai-sidebar__item ${isActive ? 'is-active' : ''}`}
            onClick={() => !loading && void onSelect(session.sessionId)}
            disabled={loading}
          >
            <div className="ai-sidebar__title">{session.title}</div>
            <div className="ai-sidebar__date">{session.lastAt?.slice(0, 10)}</div>
          </button>
        )
      })}
    </div>
  )
}
