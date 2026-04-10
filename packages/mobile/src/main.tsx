import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './index.css'
import App from './App'

/** SW 更新通知组件 */
function SWUpdateNotice() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      // 每 60 分钟检查一次更新
      r && setInterval(() => r.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[100] rounded-xl border border-border bg-card p-3 shadow-2xl flex items-center justify-between gap-3">
      <p className="text-sm text-foreground">🔄 发现新版本</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        立即更新
      </button>
    </div>
  )
}

const container = document.getElementById('root')!
const root = createRoot(container)

root.render(
  <StrictMode>
    <App />
    <SWUpdateNotice />
  </StrictMode>,
)
