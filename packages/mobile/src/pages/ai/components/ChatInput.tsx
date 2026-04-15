import { useEffect, useRef, useState } from 'react'
import { Send, Mic, MicOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSpeech } from '@/hooks/useSpeech'
import type { SpeechConfig } from '@/hooks/useSpeech'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  loading?: boolean
  statusPhase?: string
  speechConfig?: SpeechConfig
}

export function ChatInput({ onSend, onStop, disabled, loading, statusPhase, speechConfig }: ChatInputProps) {
  const [text, setText] = useState('')
  const [speechError, setSpeechError] = useState<string | null>(null)
  const baseTextRef = useRef('')
  const speechTextRef = useRef('')
  const wasListeningRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { isListening, isSupported, supportInfo, toggle: toggleSpeech } = useSpeech({
    onResult: (transcript) => {
      speechTextRef.current = transcript
      setText(baseTextRef.current + transcript)
      textareaRef.current?.focus()
      setSpeechError(null)
    },
    onPartialResult: (transcript) => {
      if (!transcript) {
        return
      }
      speechTextRef.current = transcript
      setText(baseTextRef.current + transcript)
    },
    onStopCapture: (transcript) => {
      speechTextRef.current = transcript
      setText(baseTextRef.current + transcript)
    },
    onError: (error) => {
      setSpeechError(error)
      // 5秒后消失（Android 错误信息较长）
      setTimeout(() => setSpeechError(null), 5000)
    },
    speechConfig,
  })

  useEffect(() => {
    if (isListening && !wasListeningRef.current) {
      baseTextRef.current = text
      speechTextRef.current = ''
    }

    if (!isListening && wasListeningRef.current) {
      baseTextRef.current = ''
      speechTextRef.current = ''
    }

    wasListeningRef.current = isListening
  }, [isListening, text])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.scrollTop = textarea.scrollHeight
  }, [text])

  const handleClear = () => {
    setText('')
    baseTextRef.current = ''
    speechTextRef.current = ''
    textareaRef.current?.focus()
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    handleClear()
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
        <p className="mb-2 text-center text-xs text-muted-foreground">
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
              'shrink-0 rounded-full transition-all duration-300',
              isListening && 'animate-voice-listening shadow-lg shadow-red-500/20',
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
          placeholder={isListening ? '正在识别，停顿后会自动结束...' : '问任何关于茶叶经营的问题'}
          value={text}
          onChange={(e) => {
            const nextValue = e.target.value
            baseTextRef.current = nextValue
            speechTextRef.current = ''
            setText(nextValue)
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || isListening}
          rows={1}
          className="min-h-[40px] max-h-24 resize-none rounded-xl py-2.5 text-sm"
        />

        {text && !loading ? (
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 rounded-full text-muted-foreground"
            onClick={handleClear}
            disabled={disabled}
          >
            <X size={18} />
          </Button>
        ) : null}

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
