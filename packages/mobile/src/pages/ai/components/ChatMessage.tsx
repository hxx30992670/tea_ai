import { useState } from 'react'
import { Bot, User, AlertCircle, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { AiChart } from './AiChart'
import type { Message } from '../hooks/useChat'

interface ChatMessageProps {
  message: Message
}

// ─── Markdown 自定义组件（移动端样式）────────────────────────────────────────
const md = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 mt-2 text-base font-bold text-foreground">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 mt-2 text-sm font-bold text-foreground">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-0.5 mt-1.5 text-sm font-semibold text-foreground">{children}</p>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 break-words text-sm leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-4 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-4 text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    className?.startsWith('language-') ? (
      <pre className="my-2 overflow-x-auto rounded-lg bg-secondary/60 p-3 text-xs leading-relaxed">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-xs text-primary">
        {children}
      </code>
    ),
  // 表格：包裹 overflow-x-auto，内容宽则横向滚动
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-max text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-secondary/50">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-border/50">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="even:bg-secondary/20">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{children}</td>
  ),
  hr: () => <hr className="my-2 border-border" />,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-1 border-l-2 border-primary/50 pl-3 text-sm italic text-muted-foreground">
      {children}
    </blockquote>
  ),
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isError = message.status === 'error'
  const isThinking = message.status === 'thinking' && !message.content

  const hasChart =
    !isUser &&
    message.status === 'done' &&
    message.rows &&
    message.rows.length > 0 &&
    message.visualization &&
    message.visualization.type !== 'none'

  return (
    // w-full 锚定整行宽度，overflow-hidden 防止任何子元素突破边界
    <div
      className={cn(
        'flex w-full items-start gap-2.5 animate-fade-in overflow-hidden',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* 头像 */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/20' : 'bg-secondary',
        )}
      >
        {isUser ? (
          <User size={15} className="text-primary" />
        ) : isError ? (
          <AlertCircle size={15} className="text-red-400" />
        ) : (
          <Bot size={15} className="text-muted-foreground" />
        )}
      </div>

      {/* 内容区：w-0 flex-1 强制收缩到剩余空间，杜绝溢出 */}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-1 overflow-hidden',
          isUser ? 'max-w-[80%] items-end' : 'w-0 flex-1',
        )}
      >
        {/* 气泡 */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'max-w-[85vw] rounded-br-sm bg-primary text-primary-foreground'
              : isError
              ? 'w-full rounded-bl-sm border border-red-500/20 bg-red-500/10 text-red-400'
              : 'w-full rounded-bl-sm border border-border bg-card text-foreground',
          )}
        >
          {isThinking ? (
            <div className="flex items-center gap-1.5 py-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : isUser ? (
            <p className="break-words whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md as never}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* 复制按钮 */}
        {!isUser && !isThinking && !isError && message.content && (
          <CopyButton text={message.content} />
        )}

        {/* 图表 */}
        {hasChart && <AiChart rows={message.rows!} spec={message.visualization!} />}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground tap-scale"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}
