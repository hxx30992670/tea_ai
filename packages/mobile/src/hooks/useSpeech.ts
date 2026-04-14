import CryptoJS from 'crypto-js'
import { useCallback, useEffect, useRef, useState } from 'react'

const XF_RTASR_URL = 'wss://rtasr.xfyun.cn/v1/ws'
const PCM_SAMPLE_RATE = 16000
const PCM_FRAME_SIZE = 1280
const MIN_SPEECH_RMS = 0.02
const MAX_SPEECH_ZCR = 0.2
const MIN_SPEECH_FRAMES = 3
const AUTO_STOP_SILENCE_MS = 1600

export interface SpeechConfig {
  appId: string
  apiKey: string
}

interface SpeechOptions {
  onResult: (text: string) => void
  onPartialResult?: (text: string) => void
  onStopCapture?: (text: string) => void
  onError?: (error: string) => void
  speechConfig?: SpeechConfig
}

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor() {
  return (window.AudioContext || (window as typeof window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext)
}

function hasSpeechPrerequisites() {
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined
  return !!(
    window.isSecureContext
    && mediaDevices
    && typeof mediaDevices.getUserMedia === 'function'
    && getAudioContextCtor()
    && window.WebSocket
  )
}

function buildWebSocketUrl({ appId, apiKey }: SpeechConfig) {
  const ts = Math.floor(Date.now() / 1000).toString()
  const signa = CryptoJS.MD5(`${appId}${ts}`).toString()
  const signature = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA1(signa, apiKey))

  return `${XF_RTASR_URL}?appid=${encodeURIComponent(appId)}&ts=${ts}&signa=${encodeURIComponent(signature)}&vadMdn=2`
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (inputSampleRate === outputSampleRate) {
    return buffer
  }

  const ratio = inputSampleRate / outputSampleRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i]
      count += 1
    }

    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult += 1
    offsetBuffer = nextOffsetBuffer
  }

  return result
}

function floatTo16BitPCM(input: Float32Array) {
  const output = new ArrayBuffer(input.length * 2)
  const view = new DataView(output)

  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]))
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Uint8Array(output)
}

function concatUint8Arrays(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length)
  merged.set(left, 0)
  merged.set(right, left.length)
  return merged
}

function calculateRms(input: Float32Array) {
  let sum = 0
  for (let i = 0; i < input.length; i += 1) {
    sum += input[i] * input[i]
  }
  return Math.sqrt(sum / input.length)
}

function calculateZcr(input: Float32Array) {
  let crossings = 0
  for (let i = 1; i < input.length; i += 1) {
    const prev = input[i - 1]
    const current = input[i]
    if ((prev >= 0 && current < 0) || (prev < 0 && current >= 0)) {
      crossings += 1
    }
  }
  return crossings / input.length
}

function isSpeechFrame(input: Float32Array) {
  const rms = calculateRms(input)
  const zcr = calculateZcr(input)
  return rms >= MIN_SPEECH_RMS && zcr <= MAX_SPEECH_ZCR
}

function extractRecognitionText(payload: string) {
  const message = JSON.parse(payload) as {
    action?: string
    code?: number
    desc?: string
    data?: string
  }

  if (message.action === 'error') {
    throw new Error(message.desc || '讯飞语音服务异常')
  }

  if (message.action !== 'result' || !message.data) {
    return { finalText: '', partialText: '' }
  }

  const result = JSON.parse(message.data) as {
    cn?: {
      st?: {
        type?: number
        rt?: Array<{
          ws?: Array<{
            cw?: Array<{ w?: string; rl?: number }>
          }>
        }>
      }
    }
  }

  const text = result.cn?.st?.rt
    ?.flatMap((rt) => rt.ws ?? [])
    .flatMap((ws) => ws.cw ?? [])
    .map((cw) => cw.w ?? '')
    .join('') ?? ''

  return result.cn?.st?.type === 0
    ? { finalText: text, partialText: '' }
    : { finalText: '', partialText: text }
}

export function useSpeech({ onResult, onPartialResult, onStopCapture, onError, speechConfig }: SpeechOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [supportInfo, setSupportInfo] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const silentGainRef = useRef<GainNode | null>(null)
  const pcmBufferRef = useRef<Uint8Array>(new Uint8Array())
  const isStoppingRef = useRef(false)
  const latestPartialRef = useRef('')
  const speechDetectedRef = useRef(false)
  const voicedFramesRef = useRef(0)
  const lastSpeechAtRef = useRef(0)
  const autoStoppingRef = useRef(false)

  const clearAudioResources = useCallback(async () => {
    processorNodeRef.current?.disconnect()
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null
    }

    sourceNodeRef.current?.disconnect()
    silentGainRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close().catch(() => undefined)
    }

    processorNodeRef.current = null
    sourceNodeRef.current = null
    silentGainRef.current = null
    mediaStreamRef.current = null
    audioContextRef.current = null
    pcmBufferRef.current = new Uint8Array()
    speechDetectedRef.current = false
    voicedFramesRef.current = 0
    lastSpeechAtRef.current = 0
    autoStoppingRef.current = false
  }, [])

  const flushAudioFrames = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    while (pcmBufferRef.current.length >= PCM_FRAME_SIZE) {
      ws.send(pcmBufferRef.current.slice(0, PCM_FRAME_SIZE))
      pcmBufferRef.current = pcmBufferRef.current.slice(PCM_FRAME_SIZE)
    }
  }, [])

  const stop = useCallback(async () => {
    isStoppingRef.current = true
    setSupportInfo('正在结束录音...')

    const partialText = latestPartialRef.current.trim()
    if (partialText) {
      onStopCapture?.(partialText)
      latestPartialRef.current = ''
      onPartialResult?.('')
    }

    flushAudioFrames()

    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN && pcmBufferRef.current.length > 0) {
      ws.send(pcmBufferRef.current)
      pcmBufferRef.current = new Uint8Array()
    }

    await clearAudioResources()

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send('{"end": true}')
    } else {
      setIsListening(false)
      setSupportInfo(null)
    }
  }, [clearAudioResources, flushAudioFrames, onPartialResult, onStopCapture])

  const startRecorder = useCallback(async () => {
    const AudioContextClass = getAudioContextCtor()
    if (!AudioContextClass) {
      throw new Error('当前浏览器不支持音频采集')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    const audioContext = new AudioContextClass()
    const sourceNode = audioContext.createMediaStreamSource(stream)
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0

    processorNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0)
      const now = Date.now()
      const speechFrame = isSpeechFrame(inputData)

      if (!speechDetectedRef.current) {
        if (speechFrame) {
          voicedFramesRef.current += 1
          if (voicedFramesRef.current >= MIN_SPEECH_FRAMES) {
            speechDetectedRef.current = true
            lastSpeechAtRef.current = now
            setSupportInfo('检测到说话，正在识别...')
          }
        } else {
          voicedFramesRef.current = 0
        }
      } else if (speechFrame) {
        lastSpeechAtRef.current = now
      } else if (!autoStoppingRef.current && now - lastSpeechAtRef.current >= AUTO_STOP_SILENCE_MS) {
        autoStoppingRef.current = true
        setSupportInfo('已静音，正在结束识别...')
        void stop()
        return
      }

      if (!speechDetectedRef.current) {
        return
      }

      const pcmData = floatTo16BitPCM(downsampleBuffer(inputData, audioContext.sampleRate, PCM_SAMPLE_RATE))
      pcmBufferRef.current = concatUint8Arrays(pcmBufferRef.current, pcmData)
      flushAudioFrames()
    }

    sourceNode.connect(processorNode)
    processorNode.connect(silentGain)
    silentGain.connect(audioContext.destination)

    mediaStreamRef.current = stream
    audioContextRef.current = audioContext
    sourceNodeRef.current = sourceNode
    processorNodeRef.current = processorNode
    silentGainRef.current = silentGain
  }, [flushAudioFrames, stop])

  const start = useCallback(async () => {
    if (!speechConfig?.appId || !speechConfig?.apiKey) {
      onError?.('未配置讯飞语音参数，请在入口注入 APPID 和 API_KEY')
      return
    }

    if (!hasSpeechPrerequisites()) {
      onError?.('当前环境不支持讯飞语音，请使用 HTTPS，并确认浏览器支持麦克风与 WebSocket')
      return
    }

    if (wsRef.current || isListening) {
      return
    }

    isStoppingRef.current = false
    setSupportInfo('正在连接讯飞语音服务...')

    const ws = new WebSocket(buildWebSocketUrl(speechConfig))
    wsRef.current = ws

    ws.onopen = async () => {
      try {
        await startRecorder()
        setIsListening(true)
        setSupportInfo('请开始说话，停顿后会自动结束')
      } catch (error) {
        const message = error instanceof Error ? error.message : '麦克风启动失败'
        onError?.(message)
        ws.close()
      }
    }

    ws.onmessage = (event) => {
      try {
        const { finalText, partialText } = extractRecognitionText(String(event.data))
        if (partialText) {
          latestPartialRef.current = partialText
          setSupportInfo(`识别中：${partialText}`)
          onPartialResult?.(partialText)
        }
        if (finalText) {
          latestPartialRef.current = ''
          onResult(finalText)
          setSupportInfo('继续说话中，说完后点击红色按钮停止')
          onPartialResult?.('')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '解析讯飞识别结果失败'
        onError?.(message)
      }
    }

    ws.onerror = () => {
      onError?.('讯飞语音连接失败，请检查 APPID/API_KEY 或当前网络环境')
      ws.close()
    }

    ws.onclose = async () => {
      await clearAudioResources()
      wsRef.current = null
      setIsListening(false)
      setSupportInfo(null)

      if (!isStoppingRef.current) {
        onError?.('讯飞语音连接已中断，请重试')
      }
    }
  }, [clearAudioResources, isListening, onError, onPartialResult, onResult, speechConfig, startRecorder])

  const toggle = useCallback(() => {
    if (isListening) {
      void stop()
      return
    }

    void start()
  }, [isListening, start, stop])

  useEffect(() => {
    if (!speechConfig?.appId || !speechConfig?.apiKey) {
      setIsSupported(false)
      setSupportInfo('未配置讯飞语音参数')
      return
    }

    if (!hasSpeechPrerequisites()) {
      setIsSupported(false)
      setSupportInfo('当前环境不支持讯飞语音，请使用 HTTPS 打开页面')
      return
    }

    setIsSupported(true)
    setSupportInfo(null)
  }, [speechConfig?.apiKey, speechConfig?.appId])

  useEffect(() => {
    return () => {
      void clearAudioResources()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [clearAudioResources])

  return { isListening, isSupported, supportInfo, start, stop, toggle }
}
