/**
 * Web Speech API 语音识别 Hook
 * 支持按住说话 / 点击切换模式
 * 注：Web Speech API 无官方 TS 类型，使用 any 绕过
 * 
 * Android 兼容性说明：
 * - Android Chrome 支持 Web Speech API，但需要用户交互触发（点击按钮）
 * - 国内网络可能无法访问 Google 语音服务，导致连接失败
 * - 设置 continuous=true 防止识别过早结束
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
  lang?: string
}

export function useSpeech({ onResult, onError, lang = 'zh-CN' }: SpeechOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const isStoppingRef = useRef(false)

  useEffect(() => {
    setIsSupported(!!getSpeechRecognition())
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      onError?.('当前浏览器不支持语音输入')
      return
    }

    // 防止重复启动
    if (recognitionRef.current && isListening) {
      return
    }

    isStoppingRef.current = false

    const recognition = new SR()
    recognition.lang = lang
    // Android 兼容：开启持续识别，防止过早结束
    recognition.continuous = true
    // 开启临时结果，实时反馈用户说话内容
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('[Speech] 识别已启动')
      setIsListening(true)
    }

    recognition.onend = () => {
      console.log('[Speech] 识别已结束, isStopping:', isStoppingRef.current)
      // 如果不是用户主动停止，且未收到结果，可能是异常结束
      if (!isStoppingRef.current) {
        onError?.('语音识别意外中断，请重试')
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      console.log('[Speech] 收到结果:', event.results)
      const results = event.results as unknown[]
      let finalTranscript = ''
      let interimTranscript = ''
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i] as any
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      // 只有最终结果才提交
      if (finalTranscript) {
        onResult(finalTranscript)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.log('[Speech] 错误:', event.error)
      setIsListening(false)
      const errMap: Record<string, string> = {
        'no-speech': '没有检测到声音，请靠近麦克风重试',
        'audio-capture': '无法访问麦克风，请检查设备',
        'not-allowed': '麦克风权限被拒绝，请在浏览器设置中开启',
        'network': '语音服务连接失败（国内网络可能无法使用此功能）',
        'aborted': '语音识别被中断',
        'service-not-allowed': '语音服务不可用',
      }
      const errorMsg = errMap[event.error as string] ?? `语音识别失败: ${event.error}`
      onError?.(errorMsg)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (e) {
      console.error('[Speech] 启动失败:', e)
      onError?.('语音识别启动失败，请重试')
    }
  }, [lang, onResult, onError, isListening])

  const stop = useCallback(() => {
    console.log('[Speech] 用户主动停止')
    isStoppingRef.current = true
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, start, stop, toggle }
}
