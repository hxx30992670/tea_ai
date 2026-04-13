/**
 * Web Speech API 语音识别 Hook
 * 支持按住说话 / 点击切换模式
 * 注：Web Speech API 无官方 TS 类型，使用 any 绕过
 * 
 * Android 兼容性说明：
 * - Android Chrome 支持 Web Speech API，但需要用户交互触发（点击按钮）
 * - 国内网络可能无法访问 Google 语音服务，导致连接失败
 * - 设置 continuous=true 防止识别过早结束
 * 
 * 已知问题：
 * - Android 设备即使 API 存在，也可能因为缺少 Google Play Services 而无法工作
 * - 需要 HTTPS 环境（localhost 除外）
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>

function getSpeechRecognition() {
  const w = window as AnyWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function getPlatformInfo(): { isAndroid: boolean; isIOS: boolean; isMobile: boolean } {
  const ua = navigator.userAgent.toLowerCase()
  return {
    isAndroid: ua.includes('android'),
    isIOS: /iphone|ipad|ipod/.test(ua),
    isMobile: /android|iphone|ipad|ipod|mobile/.test(ua),
  }
}

interface SpeechOptions {
  onResult: (text: string) => void
  onError?: (error: string) => void
  lang?: string
}

export function useSpeech({ onResult, onError, lang = 'zh-CN' }: SpeechOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [supportInfo, setSupportInfo] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const isStoppingRef = useRef(false)

  useEffect(() => {
    const SR = getSpeechRecognition()
    const platform = getPlatformInfo()
    
    if (!SR) {
      setIsSupported(false)
      setSupportInfo('当前浏览器不支持 Web Speech API')
      return
    }

    // Android 特殊检测
    if (platform.isAndroid) {
      setSupportInfo('Android 设备已检测到 API，正在测试可用性...')
      // Android 上 API 存在但可能不工作，需要实际启动测试
      setIsSupported(true)
    } else {
      setIsSupported(true)
      setSupportInfo(null)
    }

    console.log('[Speech] 平台信息:', platform)
    console.log('[Speech] API 支持:', !!SR)
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      onError?.('当前浏览器不支持语音输入')
      return
    }

    // 防止重复启动
    if (recognitionRef.current && isListening) {
      console.log('[Speech] 已在监听中，跳过启动')
      return
    }

    isStoppingRef.current = false
    setSupportInfo(null)

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
      setSupportInfo('语音识别已启动，请开始说话')
    }

    recognition.onend = () => {
      console.log('[Speech] 识别已结束, isStopping:', isStoppingRef.current)
      // 如果不是用户主动停止，且未收到结果，可能是异常结束
      if (!isStoppingRef.current) {
        const platform = getPlatformInfo()
        if (platform.isAndroid) {
          onError?.('Android 设备语音识别意外中断。可能原因：1) 国内网络无法访问 Google 服务；2) 设备缺少 Google Play Services；3) 需要 HTTPS 环境。建议使用 iPhone 或安装支持离线语音的浏览器。')
        } else {
          onError?.('语音识别意外中断，请重试')
        }
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
        setSupportInfo(null)
      } else if (interimTranscript) {
        setSupportInfo(`识别中: ${interimTranscript}`)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.log('[Speech] 错误:', event.error, event.message)
      setIsListening(false)
      recognitionRef.current = null

      const platform = getPlatformInfo()
      const errMap: Record<string, string> = {
        'no-speech': '没有检测到声音，请靠近麦克风重试',
        'audio-capture': '无法访问麦克风，请检查设备是否有麦克风',
        'not-allowed': '麦克风权限被拒绝。请点击地址栏左侧的锁图标，允许麦克风权限后刷新页面重试',
        'network': platform.isAndroid 
          ? 'Android 语音服务连接失败。国内网络无法访问 Google 语音服务，建议：1) 使用 VPN；2) 使用 iPhone；3) 尝试其他浏览器（如 Firefox）'
          : '语音服务连接失败（国内网络可能无法使用此功能）',
        'aborted': '语音识别被中断',
        'service-not-allowed': '语音服务不可用',
      }
      
      // Android 特殊错误处理
      if (platform.isAndroid && event.error === 'network') {
        onError?.(errMap['network'])
      } else if (platform.isAndroid && !event.error) {
        // Android 上可能直接触发 onend 而不报错
        onError?.('Android 设备语音识别不可用。建议使用 iPhone 或切换到文字输入。')
      } else {
        const errorMsg = errMap[event.error as string] ?? `语音识别失败: ${event.error ?? '未知错误'}`
        onError?.(errorMsg)
      }
    }

    recognitionRef.current = recognition
    try {
      console.log('[Speech] 正在启动识别...')
      recognition.start()
      setSupportInfo('正在启动语音识别...')
    } catch (e: unknown) {
      console.error('[Speech] 启动失败:', e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      if (errorMessage.includes('not allowed')) {
        onError?.('麦克风权限被拒绝，请在浏览器设置中开启')
      } else {
        onError?.('语音识别启动失败，请重试')
      }
      recognitionRef.current = null
    }
  }, [lang, onResult, onError, isListening])

  const stop = useCallback(() => {
    console.log('[Speech] 用户主动停止')
    isStoppingRef.current = true
    setSupportInfo(null)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, supportInfo, start, stop, toggle }
}
