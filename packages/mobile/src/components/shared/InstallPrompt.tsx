/**
 * PWA 安装引导组件
 * - Android/Chrome：触发原生安装提示
 * - iOS/Safari：展示操作指引弹窗
 * - 微信/QQ/自带浏览器：提示用 Chrome 打开
 * - 已安装或已关闭：不显示
 */
import { useEffect, useState } from 'react'
import { Share, Download, X, Smartphone, Chrome } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { usePwaInstall } from '@/hooks/usePwaInstall'

const DISMISS_KEY = 'tea-pwa-prompt-dismissed'
const SHOW_DELAY_MS = 5000 // 进入 App 5s 后弹出

export function InstallPrompt() {
  const { canInstall, isInstalled, platform, inAppBrowser, needChrome, triggerInstall } = usePwaInstall()
  const [show, setShow] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [showChromeGuide, setShowChromeGuide] = useState(false)

  useEffect(() => {
    if (isInstalled) return
    if (sessionStorage.getItem(DISMISS_KEY)) return

    const needPrompt = canInstall || platform === 'ios' || inAppBrowser || needChrome
    if (!needPrompt) return

    const timer = setTimeout(() => setShow(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canInstall, isInstalled, platform, inAppBrowser, needChrome])

  const dismiss = () => {
    setShow(false)
    sessionStorage.setItem(DISMISS_KEY, '1')
  }

  const handleInstall = async () => {
    if (platform === 'ios') {
      setShowIosGuide(true)
      setShow(false)
    } else if (inAppBrowser || needChrome) {
      setShowChromeGuide(true)
      setShow(false)
    } else {
      const ok = await triggerInstall()
      if (ok) setShow(false)
    }
  }

  if (!show && !showIosGuide && !showChromeGuide) return null

  // 微信/自带浏览器：提示用 Chrome 打开
  const isUnsupportedBrowser = inAppBrowser || needChrome
  const bannerLabel = isUnsupportedBrowser ? '用 Chrome 打开，体验更好' : '添加到桌面，使用更方便'
  const bannerDesc = isUnsupportedBrowser
    ? '当前浏览器不支持安装应用，推荐用 Chrome 打开'
    : '像 App 一样启动，无需浏览器'

  return (
    <>
      {/* 底部横幅提示 */}
      {show && (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 animate-slide-up">
          <div className="glass rounded-xl p-3 flex items-center gap-3 shadow-2xl">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              {isUnsupportedBrowser
                ? <Chrome size={18} className="text-primary" />
                : <Smartphone size={18} className="text-primary" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{bannerLabel}</p>
              <p className="text-xs text-muted-foreground">{bannerDesc}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="gold" onClick={handleInstall}>
                {isUnsupportedBrowser ? '如何操作' : '添加'}
              </Button>
              <button onClick={dismiss} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari 安装引导 */}
      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加到主屏幕</DialogTitle>
            <DialogDescription>按以下步骤将茶掌柜保存为桌面图标</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {[
              {
                step: 1,
                icon: <Share size={18} className="text-blue-400" />,
                text: '点击 Safari 底部的',
                highlight: '分享按钮',
              },
              {
                step: 2,
                icon: <Download size={18} className="text-primary" />,
                text: '在菜单中找到并点击',
                highlight: '「添加到主屏幕」',
              },
              {
                step: 3,
                text: '点击右上角',
                highlight: '「添加」',
                last: true,
              },
            ].map(({ step, icon, text, highlight, last }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {step}
                </div>
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground">{text} </span>
                  <span className="text-sm font-semibold text-foreground">{highlight}</span>
                  {icon && <span className="inline-flex items-center ml-1">{icon}</span>}
                  {last && (
                    <span className="text-sm text-muted-foreground">，完成安装即可</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-5 w-full" variant="gold" onClick={() => setShowIosGuide(false)}>
            我知道了
          </Button>
        </DialogContent>
      </Dialog>

      {/* 微信/Android 自带浏览器：引导用 Chrome 打开 */}
      <Dialog open={showChromeGuide} onOpenChange={setShowChromeGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>请用 Chrome 打开</DialogTitle>
            <DialogDescription>
              {inAppBrowser
                ? '微信、QQ 等内置浏览器不支持安装应用'
                : '手机自带浏览器不支持安装应用'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {inAppBrowser ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</div>
                  <div className="pt-0.5">
                    <span className="text-sm text-muted-foreground">点击右上角 </span>
                    <span className="text-sm font-semibold text-foreground">「…」菜单</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</div>
                  <div className="pt-0.5">
                    <span className="text-sm text-muted-foreground">选择 </span>
                    <span className="text-sm font-semibold text-foreground">「在浏览器中打开」</span>
                    <span className="text-sm text-muted-foreground">或「用其他浏览器打开」</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">3</div>
                  <div className="pt-0.5">
                    <span className="text-sm text-muted-foreground">选择 </span>
                    <span className="text-sm font-semibold text-foreground">Chrome</span>
                    <span className="text-sm text-muted-foreground">，再按提示添加到桌面</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</div>
                  <div className="pt-0.5">
                    <span className="text-sm text-muted-foreground">在手机上安装或打开 </span>
                    <span className="text-sm font-semibold text-foreground">Chrome 浏览器</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</div>
                  <div className="pt-0.5">
                    <span className="text-sm text-muted-foreground">用 Chrome 打开本页面，点击右上角菜单 → </span>
                    <span className="text-sm font-semibold text-foreground">「添加到主屏幕」</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <Button className="mt-5 w-full" variant="gold" onClick={() => setShowChromeGuide(false)}>
            我知道了
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
