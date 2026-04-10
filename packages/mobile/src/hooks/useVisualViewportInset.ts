import { useEffect, useState } from 'react'

/**
 * 软键盘弹出时，layout viewport 底部与 visual viewport 的差值（像素），
 * 用于给底部抽屉内容区增加 padding，避免输入框被键盘挡住。
 */
export function useVisualViewportInset(active: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setInset(0)
      return
    }
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const bottom = window.innerHeight - vv.height - vv.offsetTop
      setInset(Math.max(0, Math.round(bottom)))
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [active])

  return inset
}
