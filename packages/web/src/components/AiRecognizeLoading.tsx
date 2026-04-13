import React, { useEffect, useState } from 'react'
import './AiRecognizeLoading.less'

interface AiRecognizeLoadingProps {
  visible: boolean
  /** 批量模式：当前正在识别第几个（从 1 开始） */
  current?: number
  /** 批量模式：总共几个文件 */
  total?: number
}

const STEPS = [
  '正在读取文件内容...',
  'AI 分析图像中...',
  '识别商品信息...',
  '匹配系统商品...',
  '整理录单数据...',
]

export default function AiRecognizeLoading({ visible, current, total }: AiRecognizeLoadingProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [dots, setDots] = useState('')
  const isBatch = total != null && total > 1

  useEffect(() => {
    if (!visible) {
      setStepIdx(0)
      setDots('')
      return
    }

    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1 < STEPS.length ? prev + 1 : prev))
    }, 1800)

    const dotTimer = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 400)

    return () => {
      clearInterval(stepTimer)
      clearInterval(dotTimer)
    }
  }, [visible])

  // 批量模式下每处理一个新文件重置步骤
  useEffect(() => {
    if (isBatch) setStepIdx(0)
  }, [current, isBatch])

  if (!visible) return null

  // 批量模式下进度 = 已完成的文件比例 + 当前文件的步骤比例
  const progressPct = isBatch
    ? (((current ?? 1) - 1) / total! + (stepIdx + 1) / STEPS.length / total!) * 100
    : ((stepIdx + 1) / STEPS.length) * 100

  return (
    <div className="ai-recognize-overlay">
      <div className="ai-recognize-card">
        {/* 扫描动画区域 */}
        <div className="ai-recognize-scanner">
          <div className="ai-recognize-scanner__ring ai-recognize-scanner__ring--1" />
          <div className="ai-recognize-scanner__ring ai-recognize-scanner__ring--2" />
          <div className="ai-recognize-scanner__ring ai-recognize-scanner__ring--3" />
          <div className="ai-recognize-scanner__icon">🤖</div>
          <div className="ai-recognize-scanner__beam" />
        </div>

        {/* 文字区域 */}
        <div className="ai-recognize-title">
          {isBatch ? `AI 批量识别 (${current ?? 1}/${total})` : 'AI 识别录单'}
        </div>
        <div className="ai-recognize-step">
          {STEPS[stepIdx]}{dots}
        </div>

        {/* 进度条 */}
        <div className="ai-recognize-progress">
          <div
            className="ai-recognize-progress__bar"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="ai-recognize-hint">请勿关闭或切换页面</div>
      </div>
    </div>
  )
}
