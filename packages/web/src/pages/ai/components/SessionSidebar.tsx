import { Button, Popconfirm } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { AiSession } from '@/api/ai'
import { EmptySessionText } from './ChatMessage'
import { formatDate } from '@/utils/date'

type SessionSidebarProps = {
  sessions: AiSession[]
  activeSessionId?: string
  loading: boolean
  onCreate: () => void
  onSelect: (sessionId: string) => void | Promise<void>
  onDelete: (sessionId: string) => void | Promise<void>
}

export default function SessionSidebar({ sessions, activeSessionId, loading, onCreate, onSelect, onDelete }: SessionSidebarProps) {
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
          <div
            key={session.sessionId}
            className={`ai-sidebar__item ${isActive ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className="ai-sidebar__item-main"
              onClick={() => !loading && void onSelect(session.sessionId)}
              disabled={loading}
            >
              <div className="ai-sidebar__title">{session.title}</div>
              <div className="ai-sidebar__date">{formatDate(session.lastAt)}</div>
            </button>
            <Popconfirm
              title="删除历史对话"
              description="删除后不可恢复，确认继续吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void onDelete(session.sessionId)}
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                disabled={loading}
                danger
                className="ai-sidebar__delete"
              />
            </Popconfirm>
          </div>
        )
      })}
    </div>
  )
}
