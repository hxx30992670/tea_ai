import { useRef, useState } from 'react'
import { Send, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSpeech } from '@/hooks/useSpeech'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  loading?: boolean
  statusPhase?: string
}

export function ChatInput({ onSend, onStop, disabled, loading, statusPhase }: ChatInputProps) {
  const [text, setText] = useState('')
  const [speechError, setSpeechError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { isListening, isSupported, supportInfo, toggle: toggleSpeech } = useSpeech({
    onResult: (transcript) => {
      setText((prev) => prev + transcript)
      textareaRef.current?.focus()
      setSpeechError(null)
    },
    onError: (error) => {
      setSpeechError(error)
      // 5秒后消失（Android 错误信息较长）
      setTimeout(() => setSpeechError(null), 5000)
    },
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-md px-3 py-3 pb-safe">
      {/* 状态提示 */}
      {speechError && (
        <p className="mb-2 text-center text-xs text-red-500 leading-relaxed">
          {speechError}
        </p>
      )}
      {!speechError && supportInfo && (
        <p className="mb-2 text-center text-xs text-muted-foreground animate-pulse">
          {supportInfo}
        </p>
      )}
      {!speechError && !supportInfo && statusPhase && (
        <p className="mb-2 text-center text-xs text-muted-foreground animate-pulse">
          {statusPhase}
        </p>
      )}

      <div className="flex items-end gap-2">
        {/* 语音按钮 */}
        {isSupported && (
          <Button
            variant={isListening ? 'destructive' : 'ghost'}
            size="icon"
            className={cn(
              'shrink-0 rounded-full',
              isListening && 'animate-pulse-gold',
            )}
            onClick={toggleSpeech}
            disabled={disabled}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
        )}

        {/* 文字输入框 */}
        <Textarea
          ref={textareaRef}
          placeholder={isListening ? '正在监听，说完后点击红色按钮停止...' : '问任何关于茶叶经营的问题'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isListening}
          rows={1}
          className="min-h-[40px] max-h-24 resize-none rounded-xl py-2.5 text-sm"
        />

        {/* 发送/停止按钮 */}
        {loading ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onStop}
            className="shrink-0 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
          >
            <div className="h-3 w-3 rounded-[3px] bg-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant={text.trim() ? 'gold' : 'ghost'}
            className="shrink-0 rounded-full"
            onClick={handleSend}
            disabled={!text.trim() || disabled}
          >
            <Send size={18} />
          </Button>
        )}
      </div>
    </div>
  )
}
