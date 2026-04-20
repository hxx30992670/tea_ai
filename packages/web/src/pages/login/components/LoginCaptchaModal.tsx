import React, { useEffect, useRef, useState } from 'react'
import { Button, Modal, Spin, Typography } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import type { LoginCaptchaChallenge, LoginCaptchaVerifyPayload } from '@/types'

const { Text } = Typography
const CAPTCHA_BASE_WIDTH = 320

type CaptchaStatus = 'idle' | 'dragging' | 'error' | 'success'

interface LoginCaptchaModalProps {
  open: boolean
  challenge: LoginCaptchaChallenge | null
  loading: boolean
  verifying: boolean
  onCancel: () => void
  onRefresh: () => void
  onVerify: (payload: LoginCaptchaVerifyPayload) => Promise<boolean>
}

export default function LoginCaptchaModal({
  open,
  challenge,
  loading,
  verifying,
  onCancel,
  onRefresh,
  onVerify,
}: LoginCaptchaModalProps) {
  const [status, setStatus] = useState<CaptchaStatus>('idle')
  const [viewportWidth, setViewportWidth] = useState(CAPTCHA_BASE_WIDTH)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const pieceRef = useRef<HTMLImageElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const startPointerXRef = useRef(0)
  const startOffsetXRef = useRef(0)
  const sliderTravelRef = useRef(1)
  const dragStartedAtRef = useRef(0)
  const trailRef = useRef<number[]>([])
  const latestOffsetRef = useRef(0)
  const pendingOffsetRef = useRef(0)
  const latestChallengeIdRef = useRef<string | null>(null)
  const viewportScaleRef = useRef(1)
  const frameRef = useRef<number | null>(null)
  const viewportScale = viewportWidth / CAPTCHA_BASE_WIDTH

  const cancelScheduledOffsetSync = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }

  const applyOffsetToDom = (nextOffset: number) => {
    const maxOffset = challenge?.sliderMax ?? 0
    const safeOffset = Math.max(0, Math.min(nextOffset, maxOffset))
    const progress = maxOffset > 0 ? safeOffset / maxOffset : 0

    latestOffsetRef.current = safeOffset

    if (handleRef.current) {
      handleRef.current.style.transform = `translate3d(${safeOffset}px, 0, 0)`
    }

    if (fillRef.current) {
      fillRef.current.style.transform = `scaleX(${progress})`
    }

    if (pieceRef.current) {
      pieceRef.current.style.transform = `translate3d(${safeOffset * viewportScaleRef.current}px, 0, 0)`
    }
  }

  const scheduleOffsetSync = (nextOffset: number) => {
    pendingOffsetRef.current = nextOffset

    if (frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      applyOffsetToDom(pendingOffsetRef.current)
    })
  }

  useEffect(() => {
    if (!viewportRef.current) {
      return
    }

    const updateWidth = () => {
      const nextWidth = viewportRef.current?.getBoundingClientRect().width ?? CAPTCHA_BASE_WIDTH
      const safeWidth = nextWidth || CAPTCHA_BASE_WIDTH
      setViewportWidth((currentWidth) => (currentWidth === safeWidth ? currentWidth : safeWidth))
    }

    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(viewportRef.current)

    return () => {
      observer.disconnect()
    }
  }, [open])

  useEffect(() => {
    viewportScaleRef.current = viewportScale
    applyOffsetToDom(latestOffsetRef.current)
  }, [viewportScale, challenge?.captchaId])

  useEffect(() => {
    if (!open) {
      cancelScheduledOffsetSync()
      applyOffsetToDom(0)
      setStatus('idle')
      trailRef.current = []
      pointerIdRef.current = null
      latestChallengeIdRef.current = null
      return
    }

    if (challenge?.captchaId && latestChallengeIdRef.current !== challenge.captchaId) {
      latestChallengeIdRef.current = challenge.captchaId
      cancelScheduledOffsetSync()
      applyOffsetToDom(0)
      setStatus('idle')
      trailRef.current = []
      pointerIdRef.current = null
    }
  }, [open, challenge?.captchaId])

  useEffect(() => () => {
    cancelScheduledOffsetSync()
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!challenge || pointerIdRef.current !== event.pointerId) {
        return
      }

      const maxOffset = challenge.sliderMax
      const deltaX = event.clientX - startPointerXRef.current
      const nextOffset = Math.max(
        0,
        Math.min(maxOffset, startOffsetXRef.current + (deltaX / sliderTravelRef.current) * maxOffset),
      )
      const rounded = Math.round(nextOffset)

      latestOffsetRef.current = rounded
      scheduleOffsetSync(rounded)

      const last = trailRef.current[trailRef.current.length - 1]
      if (last !== rounded) {
        trailRef.current.push(rounded)
      }
    }

    const handlePointerUp = async (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId || !challenge) {
        return
      }

      pointerIdRef.current = null
      cancelScheduledOffsetSync()
      applyOffsetToDom(latestOffsetRef.current)

      if (latestOffsetRef.current <= 0) {
        setStatus('idle')
        trailRef.current = []
        return
      }

      setStatus('dragging')

      const passed = await onVerify({
        captchaId: challenge.captchaId,
        offsetX: latestOffsetRef.current,
        durationMs: Math.max(Date.now() - dragStartedAtRef.current, 300),
        trail: [...trailRef.current, latestOffsetRef.current],
      })

      setStatus(passed ? 'success' : 'error')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [challenge, onVerify])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!challenge || loading || verifying) {
      return
    }

    pointerIdRef.current = event.pointerId
    startPointerXRef.current = event.clientX
    startOffsetXRef.current = latestOffsetRef.current
    sliderTravelRef.current = Math.max((sliderRef.current?.getBoundingClientRect().width ?? 44) - 44, 1)
    dragStartedAtRef.current = Date.now()
    trailRef.current = [latestOffsetRef.current]
    setStatus('dragging')

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const refreshChallenge = () => {
    if (verifying) {
      return
    }
    cancelScheduledOffsetSync()
    applyOffsetToDom(0)
    setStatus('idle')
    trailRef.current = []
    latestOffsetRef.current = 0
    pointerIdRef.current = null
    onRefresh()
  }

  const statusText = status === 'error'
    ? '轨迹不自然或未对准缺口，请重试或刷新挑战'
    : status === 'success'
      ? '验证通过，正在登录'
      : '按住滑块拖动，让拼图回到缺口位置'

  return (
    <Modal
      open={open}
      footer={null}
      onCancel={verifying ? undefined : onCancel}
      closable={!verifying}
      centered
      width={420}
      destroyOnClose
      className="login-captcha-modal"
      title={(
        <div className="login-captcha-modal__title">
          <SafetyCertificateOutlined />
          <span>安全校验</span>
        </div>
      )}
    >
      <div className="login-captcha">
        <div className="login-captcha__head">
          <div>
            <div className="login-captcha__headline">行为式滑块验证</div>
            <Text className="login-captcha__subtext">登录前进行一次性风控验证，防止脚本撞库与暴力尝试</Text>
          </div>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            className="login-captcha__refresh"
            onClick={refreshChallenge}
            disabled={loading || verifying}
          >
            换一张
          </Button>
        </div>

        <div className="login-captcha__viewport" ref={viewportRef}>
          {loading || !challenge
            ? (
                <div className="login-captcha__loading">
                  <Spin />
                  <Text>正在生成验证场景...</Text>
                </div>
              )
            : (
                <>
                  <img
                    src={challenge.background}
                    alt="验证码背景"
                    className="login-captcha__image"
                    draggable={false}
                  />
                  <img
                    src={challenge.piece}
                    alt="验证码拼图"
                    className="login-captcha__piece"
                    ref={pieceRef}
                    draggable={false}
                    style={{
                      width: challenge.pieceSize * viewportScale,
                      height: challenge.pieceSize * viewportScale,
                      top: challenge.pieceTop * viewportScale,
                      left: 0,
                    }}
                  />
                  <div className="login-captcha__scan" />
                </>
              )}
        </div>

        <div className={`login-captcha__hint login-captcha__hint--${status}`}>
          {statusText}
        </div>

        <div className="login-captcha__slider" ref={sliderRef}>
          <div
            className="login-captcha__slider-fill"
            ref={fillRef}
          />
          <div className="login-captcha__slider-label">拖动完成验证</div>
          <button
            type="button"
            className="login-captcha__handle"
            ref={handleRef}
            onPointerDown={handlePointerDown}
            disabled={!challenge || loading || verifying}
            aria-label="拖动滑块完成验证"
          >
            <span />
          </button>
        </div>
      </div>
    </Modal>
  )
}
