import { useState } from 'react'
import { Button, Card, Spin, Tag, Tooltip, Typography } from 'antd'
import { CheckOutlined, CopyOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AiVisualization from '@/components/AiVisualization'
import type { AiMessage } from '@/types'

type UserBubbleProps = {
  content: string
  imageUrl?: string
  attachmentName?: string
}

type AssistantCardProps = {
  message: AiMessage
  isStreaming?: boolean
}

const { Text } = Typography

export function UserBubble({ content, imageUrl, attachmentName }: UserBubbleProps) {
  return (
    <div className="ai-message ai-message--user">
      <div className="ai-message__bubble ai-message__bubble--user">
        {imageUrl && (
          <img
            src={imageUrl}
            alt="上传图片"
            style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, display: 'block', marginBottom: content ? 8 : 0 }}
          />
        )}
        {attachmentName && !imageUrl && (
          <Tag icon={<FileTextOutlined />} color="blue" style={{ marginBottom: content ? 6 : 0 }}>
            {attachmentName}
          </Tag>
        )}
        {content && <span>{content}</span>}
      </div>
      <div className="ai-message__avatar ai-message__avatar--user">
        <UserOutlined />
      </div>
    </div>
  )
}

export function AssistantCard({ message, isStreaming }: AssistantCardProps) {
  const [copied, setCopied] = useState(false)
  const isLoading = message.content === '' || message.content.startsWith('⏳')
  const isError = message.content.startsWith('⚠️')
  const shouldShowVisualization =
    !isStreaming &&
    !isLoading &&
    !isError &&
    !!message.rows?.length &&
    !!message.visualization &&
    message.visualization.type !== 'none'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="ai-message ai-message--assistant">
      <div className="ai-message__avatar ai-message__avatar--assistant">🤖</div>
      <Card className={`ai-message__card ${isError ? 'is-error' : ''}`} styles={{ body: { padding: 0 } }}>
        <div className="ai-message__content">
          {isLoading ? (
            <div className="ai-message__loading">
              <Spin size="small" />
              <span>{message.content.replace('⏳ ', '') || '正在思考...'}</span>
            </div>
          ) : (
            <div className={`ai-message__text ${isError ? 'is-error' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              {isStreaming ? <span className="ai-message__cursor" /> : null}
            </div>
          )}

          {!isLoading && !isError ? (
            <Tooltip title={copied ? '已复制' : '复制'}>
              <Button
                type="text"
                size="small"
                className="ai-message__copy"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={() => void handleCopy()}
              />
            </Tooltip>
          ) : null}
        </div>

        {shouldShowVisualization ? (
          <div className="ai-message__visualization">
            <AiVisualization rows={message.rows!} spec={message.visualization!} />
          </div>
        ) : null}
      </Card>
    </div>
  )
}

export function EmptySessionText() {
  return <Text className="ai-sidebar__empty">暂无历史</Text>
}
