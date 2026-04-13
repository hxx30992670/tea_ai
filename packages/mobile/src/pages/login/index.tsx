import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { LoginForm } from './components/LoginForm'

const AI_FEATURES = [
  { icon: '🤖', label: 'AI 自然语言查询' },
  { icon: '📊', label: '智能图表分析' },
  { icon: '📷', label: '拍照识别录单' },
  { icon: '📦', label: '库存智能预警' },
]

export default function LoginPage() {
  const { isLoggedIn } = useAuthStore()
  const appIconSrc = `${import.meta.env.BASE_URL}icons/icon.svg`

  if (isLoggedIn) return <Navigate to="/dashboard" replace />

  return (
    // min-h-[100dvh] 处理键盘弹出时的动态视口高度（PWA 关键）
    <div className="relative flex min-h-[100dvh] flex-col bg-background overflow-hidden">

      {/* ── 背景层 ─────────────────────────────────────────────────── */}
      {/* 网格背景 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(212,168,83,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,83,0.07) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {/* 顶部光晕 */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      {/* 底部光晕 */}
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />

      {/* 扫描线 */}
      <div
        className="pointer-events-none absolute left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.5), transparent)',
          animation: 'loginScanLine 7s linear infinite',
        }}
      />

      {/* ── 顶部安全区占位（PWA standalone 模式下显示状态栏区域）── */}
      <div className="pt-safe shrink-0" />

      {/* ── 主内容区（flex-1 撑满剩余高度，内部居中）──────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-8">

        {/* Logo + 品牌 */}
        <div className="mb-8 flex flex-col items-center animate-slide-up">
          <div className="relative mb-4">
            {/* 外圈脉冲光环 */}
            <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-pulse-gold" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 glow-gold">
              <img src={appIconSrc} alt="茶掌柜" className="h-12 w-12" />
            </div>
            {/* AI 角标 */}
            <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2 border-background text-[9px] font-bold text-primary-foreground shadow-lg">
              AI
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gold tracking-tight">茶掌柜</h1>
          <p className="mt-1.5 text-sm text-muted-foreground text-center leading-relaxed">
            AI 驱动的茶叶经营管理系统
          </p>
        </div>

        {/* AI 功能特性横向滚动标签 */}
        <div
          className="mb-6 flex gap-2 overflow-x-auto pb-1 w-full no-scrollbar animate-slide-up"
          style={{ animationDelay: '0.08s' }}
        >
          {AI_FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/6 px-3 py-1.5"
            >
              <span className="text-sm">{f.icon}</span>
              <span className="text-xs font-medium text-primary/80 whitespace-nowrap">{f.label}</span>
            </div>
          ))}
        </div>

        {/* 登录表单 */}
        <LoginForm />

      </div>

      {/* ── 底部版权 + 安全区 ─────────────────────────────────────── */}
      <div className="relative z-10 shrink-0 pb-safe">
        <p className="pb-3 text-center text-[11px] text-muted-foreground/40">
          © 2026 茶掌柜 · 基于 AI 的茶叶管理系统
        </p>
      </div>

      {/* 扫描线 keyframe 注入 */}
      <style>{`
        @keyframes loginScanLine {
          0%   { top: 0; opacity: 0; }
          5%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
