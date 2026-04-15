import { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { canAccessMobilePath, getMobileDefaultPath } from '@/lib/permissions'
import { BottomNav } from './BottomNav'
import { InstallPrompt } from '@/components/shared/InstallPrompt'

export function AppLayout() {
  const { isLoggedIn, user } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    let rafId = 0
    const vv = window.visualViewport
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const isIos =
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      (typeof nav.standalone === 'boolean' && nav.standalone)
    const shouldUseVisualViewport = isIos && isStandalone

    const setAppHeight = () => {
      const viewportHeight = shouldUseVisualViewport
        ? (vv?.height ?? window.innerHeight)
        : window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`)
    }

    const scheduleSetAppHeight = () => {
      cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        setAppHeight()
        window.setTimeout(setAppHeight, 80)
      })
    }

    scheduleSetAppHeight()
    window.addEventListener('resize', scheduleSetAppHeight)
    window.addEventListener('orientationchange', scheduleSetAppHeight)
    window.addEventListener('pageshow', scheduleSetAppHeight)
    if (shouldUseVisualViewport) {
      vv?.addEventListener('resize', scheduleSetAppHeight)
      vv?.addEventListener('scroll', scheduleSetAppHeight)
    }

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', scheduleSetAppHeight)
      window.removeEventListener('orientationchange', scheduleSetAppHeight)
      window.removeEventListener('pageshow', scheduleSetAppHeight)
      if (shouldUseVisualViewport) {
        vv?.removeEventListener('resize', scheduleSetAppHeight)
        vv?.removeEventListener('scroll', scheduleSetAppHeight)
      }
    }
  }, [])

  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (!canAccessMobilePath(user?.role, location.pathname)) {
    return <Navigate to={getMobileDefaultPath()} replace />
  }

  return (
    <div className="flex flex-col bg-background" style={{ height: 'var(--app-height, 100dvh)' }}>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>

      <div className="h-nav shrink-0" aria-hidden="true" />

      <BottomNav />

      {/* PWA 安装引导（首次访问时触发） */}
      <InstallPrompt />
    </div>
  )
}
