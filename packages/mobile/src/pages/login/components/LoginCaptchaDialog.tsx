import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LoginCaptchaChallenge, LoginCaptchaVerifyPayload } from '@/types'

const CAPTCHA_BASE_WIDTH = 320
const CAPTCHA_BASE_HEIGHT = 180
const SLIDER_HANDLE_SIZE = 52

type CaptchaStatus = 'idle' | 'dragging' | 'error' | 'success'

interface ViewportRect {
  width: number
  height: number
}

interface LoginCaptchaDialogProps {
  open: boolean
  challenge: LoginCaptchaChallenge | null
  loading: boolean
  verifying: boolean
  onCancel: () => void
  onRefresh: () => void
  onVerify: (payload: LoginCaptchaVerifyPayload, meta: { viewportWidth: number }) => Promise<boolean>
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function dedupeTrail(points: number[]) {
  return points.reduce<number[]>((acc, point) => {
    const safePoint = Math.round(point)
    if (acc[acc.length - 1] !== safePoint) {
      acc.push(safePoint)
    }
    return acc
  }, [])
}

function buildSubmitTrail(points: number[], finalOffset: number) {
  const initialTrail = dedupeTrail([...points, finalOffset])

  if (initialTrail.length >= 6) {
    return initialTrail.slice(-120)
  }

  const start = initialTrail[0] ?? 0
  const gap = Math.max(finalOffset - start, 1)
  const fallback = Array.from({ length: 6 }, (_, index) => {
    if (index === 0) return start
    if (index === 5) return finalOffset
    const ratio = index / 5
    return Math.round(start + gap * ratio)
  })

  return dedupeTrail(fallback)
}

export function LoginCaptchaDialog({
  open,
  challenge,
  loading,
  verifying,
  onCancel,
  onRefresh,
  onVerify,
}: LoginCaptchaDialogProps) {
  const [status, setStatus] = useState<CaptchaStatus>('idle')
  const [viewportRect, setViewportRect] = useState<ViewportRect>({
    width: CAPTCHA_BASE_WIDTH,
    height: CAPTCHA_BASE_HEIGHT,
  })
  const [handleLeftPx, setHandleLeftPx] = useState(0)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sliderTrackRef = useRef<HTMLDivElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const dragStartClientXRef = useRef(0)
  const dragStartHandleLeftRef = useRef(0)
  const dragStartedAtRef = useRef(0)
  const handleTravelPxRef = useRef(1)
  const latestHandleLeftPxRef = useRef(0)
  const trailRef = useRef<number[]>([])
  const latestChallengeIdRef = useRef<string | null>(null)

  // viewportRef 指向内层 aspect-[16/9] div，无边框，X/Y 缩放严格一致
  const viewportScale = viewportRect.width / CAPTCHA_BASE_WIDTH
  const pieceSize = challenge?.pieceSize ?? 0
  const pieceWidthPx = pieceSize * viewportScale
  const pieceHeightPx = pieceSize * viewportScale
  const pieceTopPx = (challenge?.pieceTop ?? 0) * viewportScale

  const sliderMax = challenge?.sliderMax ?? 0
  const sliderProgress = handleTravelPxRef.current > 0 ? handleLeftPx / handleTravelPxRef.current : 0
  const normalizedProgress = clamp(sliderProgress || 0, 0, 1)
  // sliderMax * viewportScale 与 captchaOffsetX 换算一一对应（均以 base 坐标 0~sliderMax 为轴）
  const puzzleTravelPx = sliderMax * viewportScale
  const pieceLeftPx = normalizedProgress * puzzleTravelPx
  const captchaOffsetX = sliderMax > 0 ? Math.round(normalizedProgress * sliderMax) : 0

  const statusText = status === 'error'
    ? '拼图未对准缺口，已刷新挑战，请重新拖动'
    : status === 'success'
      ? '验证通过，正在登录'
      : verifying
        ? '正在校验拖动轨迹与落点'
        : '按住滑块拖动，让拼图块精准回到缺口位置'

  const statusClassName = status === 'error'
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : status === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-primary/20 bg-primary/10 text-muted-foreground'

  const syncMetrics = () => {
    const viewportElement = viewportRef.current
    const sliderTrackElement = sliderTrackRef.current

    if (viewportElement) {
      const { width, height } = viewportElement.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setViewportRect({ width, height })
      }
    }

    if (sliderTrackElement) {
      const { width } = sliderTrackElement.getBoundingClientRect()
      const prevTravel = handleTravelPxRef.current
      const nextTravel = Math.max(width - SLIDER_HANDLE_SIZE, 1)
      handleTravelPxRef.current = nextTravel

      // 视口变化时按比例缩放 handle 位置，避免滑块跑出新的轨道范围
      if (prevTravel > 0 && prevTravel !== nextTravel) {
        setHandleLeftPx((prev) => clamp((prev / prevTravel) * nextTravel, 0, nextTravel))
      }
    }
  }

  const resetDragState = () => {
    setHandleLeftPx(0)
    latestHandleLeftPxRef.current = 0
    trailRef.current = []
    activePointerIdRef.current = null
    dragStartClientXRef.current = 0
    dragStartHandleLeftRef.current = 0
    dragStartedAtRef.current = 0
    setStatus('idle')
  }

  useEffect(() => {
    if (!open) {
      resetDragState()
      latestChallengeIdRef.current = null
      return
    }

    syncMetrics()

    if (challenge?.captchaId && latestChallengeIdRef.current !== challenge.captchaId) {
      latestChallengeIdRef.current = challenge.captchaId
      resetDragState()
    }
  }, [open, challenge?.captchaId])

  useEffect(() => {
    if (!open) {
      return
    }

    syncMetrics()

    const viewportElement = viewportRef.current
    const sliderTrackElement = sliderTrackRef.current
    if (!viewportElement && !sliderTrackElement) {
      return
    }

    const observer = new ResizeObserver(() => {
      syncMetrics()
    })

    if (viewportElement) observer.observe(viewportElement)
    if (sliderTrackElement) observer.observe(sliderTrackElement)

    return () => {
      observer.disconnect()
    }
  }, [open])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId || verifying) {
        return
      }

      const nextHandleLeftPx = clamp(
        dragStartHandleLeftRef.current + (event.clientX - dragStartClientXRef.current),
        0,
        handleTravelPxRef.current,
      )
      const progress = handleTravelPxRef.current > 0 ? nextHandleLeftPx / handleTravelPxRef.current : 0
      const nextOffsetX = Math.round(progress * sliderMax)

      latestHandleLeftPxRef.current = nextHandleLeftPx
      setHandleLeftPx(nextHandleLeftPx)

      if (trailRef.current[trailRef.current.length - 1] !== nextOffsetX) {
        trailRef.current.push(nextOffsetX)
      }
    }

    const handlePointerUp = async (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId || !challenge) {
        return
      }

      activePointerIdRef.current = null

      const finalHandleLeft = latestHandleLeftPxRef.current
      const finalProgress = handleTravelPxRef.current > 0 ? finalHandleLeft / handleTravelPxRef.current : 0
      const finalOffsetX = sliderMax > 0 ? Math.round(finalProgress * sliderMax) : 0

      if (finalOffsetX <= 0) {
        resetDragState()
        return
      }

      setStatus('dragging')

      const passed = await onVerify({
        captchaId: challenge.captchaId,
        offsetX: finalOffsetX,
        durationMs: Math.max(Date.now() - dragStartedAtRef.current, 320),
        trail: buildSubmitTrail(trailRef.current, finalOffsetX),
      }, {
        viewportWidth: viewportRect.width,
      })

      if (passed) {
        setStatus('success')
        return
      }

      setStatus('error')
      setHandleLeftPx(0)
      trailRef.current = []
      dragStartClientXRef.current = 0
      dragStartHandleLeftRef.current = 0
      dragStartedAtRef.current = 0
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [challenge, onVerify, sliderMax, verifying])

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!challenge || loading || verifying) {
      return
    }

    syncMetrics()
    activePointerIdRef.current = event.pointerId
    dragStartClientXRef.current = event.clientX
    dragStartHandleLeftRef.current = handleLeftPx
    dragStartedAtRef.current = Date.now()

    const seedOffset = sliderMax > 0
      ? Math.round((dragStartHandleLeftRef.current / handleTravelPxRef.current) * sliderMax)
      : 0
    trailRef.current = seedOffset > 0 ? [seedOffset] : [0]
    setStatus('dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleRefresh = () => {
    if (verifying) {
      return
    }

    resetDragState()
    onRefresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !verifying) {
          onCancel()
        }
      }}
    >
      <DialogContent className="w-[calc(100vw-24px)] max-w-md overflow-hidden border-primary/20 bg-[linear-gradient(180deg,rgba(18,23,34,0.98),rgba(12,17,24,0.96))] p-0 backdrop-blur-xl">
        <DialogHeader className="mb-0 border-b border-white/8 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck size={18} className="text-primary" />
                安全校验
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground/75">
                完成一次行为验证后再登录，拦截异常脚本和撞库请求。
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs text-muted-foreground"
              onClick={handleRefresh}
              disabled={loading || verifying}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              换一张
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/8 to-transparent p-3">
            <div
              className="relative overflow-hidden rounded-[20px] border border-white/8 bg-[#081510] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <div ref={viewportRef} className="relative aspect-[16/9] w-full">
                {loading || !challenge
                  ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/70">
                        <Loader2 size={22} className="animate-spin text-primary" />
                        <span className="text-sm">正在生成验证场景...</span>
                      </div>
                    )
                  : (
                      <>
                        <img
                          src={challenge.background}
                          alt="验证码背景"
                          className="absolute inset-0 h-full w-full object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/12 via-white/0 to-transparent opacity-60" />
                        <img
                          src={challenge.piece}
                          alt="验证码拼图"
                          className="absolute will-change-transform"
                          draggable={false}
                          style={{
                            width: pieceWidthPx,
                            height: pieceHeightPx,
                            top: pieceTopPx,
                            left: pieceLeftPx,
                            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.28))',
                          }}
                        />
                      </>
                    )}
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${statusClassName}`}>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="shrink-0" />
              <span>{statusText}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div
              ref={sliderTrackRef}
              className="relative h-[56px] overflow-hidden rounded-2xl border border-primary/15 bg-secondary/70"
            >
              <div
                className="absolute inset-y-0 left-0 origin-left rounded-2xl bg-gradient-to-r from-primary/30 via-primary/18 to-primary/8"
                style={{ width: '100%', transform: `scaleX(${normalizedProgress})` }}
              />
              <div className="absolute inset-0 flex items-center justify-center px-16 text-[11px] font-medium tracking-[0.22em] text-muted-foreground/55">
                拖动滑块完成验证
              </div>
              <button
                type="button"
                aria-label="拖动滑块完成验证"
                disabled={loading || verifying || !challenge}
                onPointerDown={handlePointerDown}
                className={`absolute left-0 top-0 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-primary/25 bg-gradient-to-br from-[#d4a853] via-[#dfb762] to-[#f0d18a] text-[#0a0e1a] shadow-lg shadow-primary/25 disabled:opacity-60${status === 'dragging' ? '' : ' transition-transform active:scale-[0.98]'}`}
                style={{
                  transform: `translate3d(${handleLeftPx}px, 2px, 0)`,
                }}
              >
                {verifying ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground/55">
              <span>拼图块会跟随当前滑动比例实时移动</span>
              <span>{Math.round(normalizedProgress * 100)}%</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
