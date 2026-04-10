import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library'

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'paused' | 'error'
export type ScanMode = 'auto' | 'barcode' | 'qr'

interface UseScannerOptions {
  onScan: (result: string) => void
  onError?: (err: string) => void
  mode?: ScanMode
}

const buildHints = (mode: ScanMode) => {
  const hints = new Map()
  const formats =
    mode === 'qr'
      ? [BarcodeFormat.QR_CODE]
      : mode === 'barcode'
        ? [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]
        : [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]

  hints.set(DecodeHintType.POSSIBLE_FORMATS, formats)
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

export function useScanner({ onScan, onError, mode = 'auto' }: UseScannerOptions) {
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [decodeMissCount, setDecodeMissCount] = useState(0)
  const [lastDecodeError, setLastDecodeError] = useState('')
  const controlsRef = useRef<IScannerControls | null>(null)
  const scannerContainerId = 'qr-scanner-video'

  const reader = useMemo(() => new BrowserMultiFormatReader(buildHints(mode), {
    delayBetweenScanAttempts: 80,
    delayBetweenScanSuccess: 500,
  }), [mode])

  const stop = useCallback(async () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    const video = document.getElementById(scannerContainerId) as HTMLVideoElement | null
    if (!video) {
      const msg = '扫码视频容器不存在'
      setErrorMsg(msg)
      setStatus('error')
      onError?.(msg)
      return
    }

    setStatus('starting')
    setErrorMsg('')
    setDecodeMissCount(0)
    setLastDecodeError('')

    try {
      controlsRef.current?.stop()
      controlsRef.current = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video,
        (result, error) => {
          if (result) {
            setDecodeMissCount(0)
            setLastDecodeError('')
            onScan(result.getText())
            return
          }

          if (error) {
            setDecodeMissCount((count) => count + 1)
            if (!(error instanceof NotFoundException)) {
              setLastDecodeError(error.message)
            } else {
              setLastDecodeError('未识别到可解码内容')
            }
          }
        },
      )
      setStatus('scanning')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '摄像头启动失败'
      setErrorMsg(msg)
      setStatus('error')
      onError?.(msg)
    }
  }, [onError, onScan, reader])

  const pause = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    if (status === 'paused') {
      void start()
    }
  }, [start, status])

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [])

  return { status, errorMsg, decodeMissCount, lastDecodeError, scannerContainerId, start, stop, pause, resume }
}
