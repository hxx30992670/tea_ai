/**
 * PWA 安装提示 Hook
 * 封装 beforeinstallprompt 事件，并检测是否运行在 Standalone 模式
 */
import { useEffect, useState, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'standalone' | 'unsupported'

/** 检测是否在不支持 PWA 安装的内嵌浏览器中（微信、QQ、微博等） */
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent
  return /MicroMessenger|QQ\/|MQQBrowser|Weibo|DingTalk|BytedanceWebview/i.test(ua)
}

/** 检测是否在 Chrome 浏览器（Android PWA 安装需要 Chrome） */
function isChromeBrowser(): boolean {
  const ua = navigator.userAgent
  return /Chrome/.test(ua) && !/EdgA|OPR/.test(ua)
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('unsupported')
  const [inAppBrowser, setInAppBrowser] = useState(false)
  const [needChrome, setNeedChrome] = useState(false)

  useEffect(() => {
    // 检测是否已安装为独立应用
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      setPlatform('standalone')
      return
    }

    // 检测平台
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    const isAndroid = /Android/.test(ua)

    // 检测内嵌浏览器（微信等）
    if (isInAppBrowser()) {
      setInAppBrowser(true)
    }

    // Android 非 Chrome 浏览器（自带浏览器）也无法安装
    if (isAndroid && !isChromeBrowser() && !isInAppBrowser()) {
      setNeedChrome(true)
    }

    if (isIOS) setPlatform('ios')
    else if (isAndroid) setPlatform('android')
    else setPlatform('desktop')

    // Android/Chrome 原生安装提示
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // 安装成功后更新状态
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
    return outcome === 'accepted'
  }, [installPrompt])

  return {
    /** 是否可以触发原生安装提示（Android Chrome） */
    canInstall: !!installPrompt,
    /** 是否已经安装为独立应用 */
    isInstalled,
    /** 当前平台 */
    platform,
    /** 是否在微信/QQ等内嵌浏览器中（无法安装PWA） */
    inAppBrowser,
    /** 是否是Android但不是Chrome（需要引导用Chrome打开） */
    needChrome,
    /** 触发安装（Android Chrome），返回是否成功 */
    triggerInstall,
  }
}
