/**
 * Web Speech API 语音识别 Hook
 * 支持按住说话 / 点击切换模式
 * 注：Web Speech API 无官方 TS 类型，使用 any 绕过
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>

function getSpeechRecognition() {
  const w = window as AnyWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface SpeechOptions {
  onResult: (text: string) => void
  onError?: (error: string) => void
  continuous?: boolean
  lang?: string
}

export function useSpeech({ onResult, onError, continuous = false, lang = 'zh-CN' }: SpeechOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setIsSupported(!!getSpeechRecognition())
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      onError?.('当前浏览器不支持语音输入')
      return
    }

    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as unknown[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript as string)
        .join('')
      onResult(transcript)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setIsListening(false)
      const errMap: Record<string, string> = {
        'no-speech': '没有检测到声音',
        'audio-capture': '无法访问麦克风',
        'not-allowed': '麦克风权限被拒绝',
        network: '网络错误',
      }
      onError?.(errMap[event.error as string] ?? '语音识别失败')
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [lang, continuous, onResult, onError])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, start, stop, toggle }
}
