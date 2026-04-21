import { useCallback, useEffect, useRef, useState } from 'react'

const PCM_SAMPLE_RATE = 16000
const PCM_FRAME_SIZE = 1280
const PRE_SPEECH_BUFFER_BYTES = 19200
const MIN_SPEECH_RMS = 0.02
const MAX_SPEECH_ZCR = 0.2
const MIN_SPEECH_FRAMES = 3
const AUTO_STOP_SILENCE_MS = 2600
const WS_CONNECT_TIMEOUT_MS = 12000

export interface SpeechConfig {
  accessToken: string
  enabled: boolean
  reason?: string | null
  provider?: string
  model?: string
  realtimeSupported?: boolean
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

function buildProxyWsUrl(accessToken: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/speech/ws?token=${encodeURIComponent(accessToken)}`
}

function normalizeSpeechError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '未获得麦克风权限，请允许浏览器访问麦克风'
    }
    if (error.name === 'NotFoundError') {
      return '未检测到可用的麦克风设备'
    }
    if (error.name === 'NotReadableError') {
      return '麦克风当前被其他应用占用，请稍后重试'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return '语音识别初始化失败，请稍后重试'
}

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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

function appendWithByteLimit(buffer: Uint8Array, chunk: Uint8Array, limit: number) {
  const merged = concatUint8Arrays(buffer, chunk)
  if (merged.length <= limit) {
    return merged
  }

  return merged.slice(merged.length - limit)
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

interface ServerHeader {
  task_id?: string
  event?: string
  error_code?: string
  error_message?: string
}

interface SentenceResult {
  begin_time?: number
  end_time?: number | null
  text?: string
  sentence_end?: boolean
}

interface ServerMessage {
  header: ServerHeader
  payload?: {
    output?: {
      sentence?: SentenceResult
    }
  }
}

function parseServerMessage(rawData: string) {
  const message = JSON.parse(rawData) as ServerMessage
  const event = message.header?.event

  if (event === 'task-failed') {
    throw new Error(message.header?.error_message || '语音服务异常')
  }

  if (event === 'result-generated') {
    const sentence = message.payload?.output?.sentence
    if (!sentence?.text) {
      return { finalText: '', partialText: '' }
    }

    const isFinal = Boolean(sentence.sentence_end) && sentence.end_time != null
    return isFinal
      ? { finalText: sentence.text, partialText: '' }
      : { finalText: '', partialText: sentence.text }
  }

  return { finalText: '', partialText: '' }
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
  const preSpeechPcmBufferRef = useRef<Uint8Array>(new Uint8Array())
  const isStoppingRef = useRef(false)
  const finalizedTextRef = useRef('')
  const latestPartialRef = useRef('')
  const speechDetectedRef = useRef(false)
  const voicedFramesRef = useRef(0)
  const lastSpeechAtRef = useRef(0)
  const autoStoppingRef = useRef(false)
  const taskIdRef = useRef<string>('')
  const taskStartedRef = useRef(false)
  const connectTimeoutRef = useRef<number | null>(null)

  const resetRecognitionState = useCallback(() => {
    finalizedTextRef.current = ''
    latestPartialRef.current = ''
    speechDetectedRef.current = false
    voicedFramesRef.current = 0
    lastSpeechAtRef.current = 0
    autoStoppingRef.current = false
    taskIdRef.current = ''
    taskStartedRef.current = false
    if (connectTimeoutRef.current != null) {
      window.clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
  }, [])

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
    preSpeechPcmBufferRef.current = new Uint8Array()
  }, [])

  const mergeTranscript = useCallback((committed: string, incoming: string, partial = '') => {
    if (!incoming) {
      return committed
    }

    if (!committed) {
      return incoming
    }

    if (partial && incoming.startsWith(partial) && committed.endsWith(partial)) {
      return `${committed.slice(0, -partial.length)}${incoming}`
    }

    if (incoming.startsWith(committed)) {
      return incoming
    }

    if (committed.endsWith(incoming)) {
      return committed
    }

    return `${committed}${incoming}`
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

    const combinedText = mergeTranscript(finalizedTextRef.current, latestPartialRef.current.trim(), latestPartialRef.current)
    if (combinedText) {
      onStopCapture?.(combinedText)
      finalizedTextRef.current = combinedText
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

    if (ws?.readyState === WebSocket.OPEN && taskIdRef.current) {
      ws.send(JSON.stringify({
        header: {
          task_id: taskIdRef.current,
          action: 'finish-task',
          streaming: 'duplex',
        },
        payload: { input: {} },
      }))
    } else {
      setIsListening(false)
      setSupportInfo(null)
    }
  }, [clearAudioResources, flushAudioFrames, mergeTranscript, onPartialResult, onStopCapture])

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
      const pcmData = floatTo16BitPCM(downsampleBuffer(inputData, audioContext.sampleRate, PCM_SAMPLE_RATE))

      if (!speechDetectedRef.current) {
        preSpeechPcmBufferRef.current = appendWithByteLimit(
          preSpeechPcmBufferRef.current,
          pcmData,
          PRE_SPEECH_BUFFER_BYTES,
        )

        if (speechFrame) {
          voicedFramesRef.current += 1
          if (voicedFramesRef.current >= MIN_SPEECH_FRAMES) {
            speechDetectedRef.current = true
            lastSpeechAtRef.current = now
            setSupportInfo('检测到说话，正在识别...')
            pcmBufferRef.current = concatUint8Arrays(pcmBufferRef.current, preSpeechPcmBufferRef.current)
            preSpeechPcmBufferRef.current = new Uint8Array()
            flushAudioFrames()
          }
        } else {
          voicedFramesRef.current = 0
        }

        return
      } else if (speechFrame) {
        lastSpeechAtRef.current = now
      } else if (!autoStoppingRef.current && now - lastSpeechAtRef.current >= AUTO_STOP_SILENCE_MS) {
        autoStoppingRef.current = true
        setSupportInfo('已静音，正在结束识别...')
        void stop()
        return
      }

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
    if (!speechConfig?.accessToken) {
      onError?.('需要登录后才能使用语音识别')
      return
    }

    if (!speechConfig.enabled) {
      onError?.(speechConfig.reason || '当前未开启语音识别')
      return
    }

    if (!hasSpeechPrerequisites()) {
      onError?.('当前环境不支持语音识别，请使用 HTTPS，并确认浏览器支持麦克风与 WebSocket')
      return
    }

    if (wsRef.current || isListening) {
      return
    }

    isStoppingRef.current = false
    resetRecognitionState()
    setSupportInfo('正在连接语音服务...')

    const taskId = generateTaskId()
    taskIdRef.current = taskId

    const ws = new WebSocket(buildProxyWsUrl(speechConfig.accessToken))
    wsRef.current = ws
    connectTimeoutRef.current = window.setTimeout(() => {
      if (taskStartedRef.current || ws.readyState !== WebSocket.OPEN) {
        return
      }

      onError?.('语音服务启动超时，请检查阿里云语音配置后重试')
      isStoppingRef.current = true
      ws.close()
    }, WS_CONNECT_TIMEOUT_MS)

    ws.onopen = () => {}

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      try {
        const message = JSON.parse(event.data)
        const serverEvent = message.header?.event ?? message.event

        if (serverEvent === 'proxy-ready') {
          ws.send(JSON.stringify({
            header: {
              task_id: taskId,
              action: 'run-task',
              streaming: 'duplex',
            },
            payload: {
              task_group: 'audio',
              task: 'asr',
              function: 'recognition',
              model: speechConfig.model || 'paraformer-realtime-v2',
              parameters: {
                format: 'pcm',
                sample_rate: PCM_SAMPLE_RATE,
              },
              input: {},
            },
          }))
          return
        }

        if (serverEvent === 'task-started') {
          taskStartedRef.current = true
          if (connectTimeoutRef.current != null) {
            window.clearTimeout(connectTimeoutRef.current)
            connectTimeoutRef.current = null
          }
          void startRecorder()
            .then(() => {
              setIsListening(true)
              setSupportInfo('请开始说话，停顿后会自动结束')
            })
            .catch((error) => {
              isStoppingRef.current = true
              setSupportInfo(null)
              onError?.(normalizeSpeechError(error))
              ws.close()
            })
          return
        }

        if (serverEvent === 'task-failed') {
          onError?.(message.header?.error_message || '语音识别服务异常')
          ws.close()
          return
        }

        if (serverEvent === 'task-finished') {
          ws.close()
          return
        }

        if (serverEvent !== 'result-generated') {
          return
        }

        const { finalText, partialText } = parseServerMessage(String(event.data))
        if (partialText) {
          latestPartialRef.current = mergeTranscript(latestPartialRef.current, partialText)
          const combinedText = mergeTranscript(finalizedTextRef.current, latestPartialRef.current)
          setSupportInfo(`识别中：${latestPartialRef.current}`)
          onPartialResult?.(combinedText)
        }
        if (finalText) {
          finalizedTextRef.current = mergeTranscript(finalizedTextRef.current, finalText, latestPartialRef.current)
          latestPartialRef.current = ''
          onResult(finalizedTextRef.current)
          setSupportInfo('继续说话中，说完后点击红色按钮停止')
          onPartialResult?.('')
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '解析识别结果失败'
        onError?.(errorMsg)
      }
    }

    ws.onerror = () => {
      onError?.('语音连接失败，请检查网络或重新登录')
      ws.close()
    }

    ws.onclose = async () => {
      if (connectTimeoutRef.current != null) {
        window.clearTimeout(connectTimeoutRef.current)
        connectTimeoutRef.current = null
      }
      await clearAudioResources()
      wsRef.current = null
      setIsListening(false)
      setSupportInfo(null)
      resetRecognitionState()

      if (!isStoppingRef.current) {
        onError?.('语音连接已中断，请重试')
      }
    }
  }, [clearAudioResources, isListening, mergeTranscript, onError, onPartialResult, onResult, resetRecognitionState, speechConfig, startRecorder])

  const toggle = useCallback(() => {
    if (isListening) {
      void stop()
      return
    }

    void start()
  }, [isListening, start, stop])

  useEffect(() => {
    if (!speechConfig?.accessToken) {
      setIsSupported(false)
      setSupportInfo('需要登录后才能使用语音识别')
      return
    }

    if (!speechConfig.enabled) {
      setIsSupported(false)
      setSupportInfo(speechConfig.reason || null)
      return
    }

    if (!hasSpeechPrerequisites()) {
      setIsSupported(false)
      setSupportInfo('当前环境不支持语音识别，请使用 HTTPS 打开页面')
      return
    }

    setIsSupported(true)
    setSupportInfo(null)
  }, [speechConfig?.accessToken, speechConfig?.enabled, speechConfig?.reason])

  useEffect(() => {
    return () => {
      void clearAudioResources()
      wsRef.current?.close()
      wsRef.current = null
      resetRecognitionState()
    }
  }, [clearAudioResources, resetRecognitionState])

  return { isListening, isSupported, supportInfo, start, stop, toggle }
}
