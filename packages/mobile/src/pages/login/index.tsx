import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { LoginBrand } from './components/LoginBrand'
import { LoginForm } from './components/LoginForm'

export default function LoginPage() {
  const { isLoggedIn } = useAuthStore()

  if (isLoggedIn) return <Navigate to="/dashboard" replace />

  return (
    // min-h-[100dvh] 处理键盘弹出时的动态视口高度（PWA 关键）
    <div className="relative flex min-h-[100dvh] flex-col bg-background overflow-hidden md:flex-row">

      {/* ── 背景层 ──────────────────────────────────────────────── */}
      {/* 网格背景 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(212,168,83,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,83,0.06) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {/* 顶部光晕 */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
      {/* 右下光晕 */}
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
      {/* 左中光晕 */}
      <div className="pointer-events-none absolute left-0 top-1/2 h-60 w-60 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary/6 blur-3xl" />

      {/* 扫描线 */}
      <div
        className="pointer-events-none absolute left-0 right-0 h-px z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.5), transparent)',
          animation: 'loginScanLine 7s linear infinite',
        }}
      />

      {/* ── 顶部安全区（PWA standalone 模式）──────────────────────── */}
      <div className="pt-safe shrink-0 md:hidden" />

      {/* ══════════════════════════════════════════════════════════
          手机端：品牌区 + 表单区上下排列
          iPad / 横屏（md:768px+）：左右分栏
      ══════════════════════════════════════════════════════════ */}

      {/* ── 左栏：品牌展示区 ───────────────────────────────────────
          手机：居中，padding 向下
          iPad：占左半，居中，加右侧分割线
      ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 pt-12 pb-6 md:flex-1 md:pt-0 md:pb-0 md:border-r md:border-white/5">
        <LoginBrand />
      </div>

      {/* ── 右栏：登录表单区 ───────────────────────────────────────
          手机：紧跟品牌区，垂直居中
          iPad：占右半，居中，固定宽度
      ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-4 md:flex-none md:w-[420px] md:pb-0">
        <LoginForm />

        {/* 版权 — 仅手机端在表单下方显示 */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground/35 md:hidden">
          © 2026 茶掌柜 · 基于 AI 的茶叶管理系统
        </p>
      </div>

      {/* ── 底部安全区（手机）/ 版权（iPad）──────────────────────── */}
      <div className="relative z-10 shrink-0 pb-safe md:hidden" />
      {/* iPad 版权：绝对定位到底部居中 */}
      <p className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 hidden text-center text-[11px] text-muted-foreground/30 md:block">
        © 2026 茶掌柜 · 基于 AI 的茶叶管理系统
      </p>

      {/* ── 雷达环 & 扫描线 keyframes ──────────────────────────── */}
      <style>{`
        @keyframes loginScanLine {
          0%   { top: 0;    opacity: 0; }
          5%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }

        /* 雷达扩散环：从 logo 大小(80px) 向外扩散到 160px */
        .login-radar-ring {
          position: absolute;
          width: 80px;
          height: 80px;
          border-radius: 1rem; /* 和 logo 圆角一致 */
          border: 1px solid rgba(212, 168, 83, 0.5);
          animation: radarPulse 3s ease-out infinite;
          animation-delay: var(--delay, 0s);
        }

        @keyframes radarPulse {
          0%   { transform: scale(1);    opacity: 0.6; }
          70%  { opacity: 0.15; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
