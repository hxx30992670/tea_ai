import logoIcon from '@/assets/images/logo-icon.png'

const AI_FEATURES = [
  { icon: '💬', label: 'AI 自然语言', desc: '中文直接问数据' },
  { icon: '📊', label: '智能图表', desc: '一键可视化分析' },
  { icon: '📷', label: '拍照录单', desc: '拍照自动识别录入' },
  { icon: '📦', label: '库存预警', desc: '实时库存监控告急' },
]

export function LoginBrand() {
  return (
    <div className="flex flex-col items-center">
      {/* ── Logo + 雷达环 ────────────────────────────── */}
      <div className="relative flex items-center justify-center mb-5 animate-slide-up">
        {/* 三层雷达扩散环 */}
        <span className="login-radar-ring" style={{ '--delay': '0s' } as React.CSSProperties} />
        <span className="login-radar-ring" style={{ '--delay': '1s' } as React.CSSProperties} />
        <span className="login-radar-ring" style={{ '--delay': '2s' } as React.CSSProperties} />

        {/* 图标容器 */}
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 to-primary/5 glow-gold shadow-xl">
          <img src={logoIcon} alt="茶掌柜" className="h-12 w-12 object-contain" />
        </div>

        {/* AI 角标 */}
        <div className="absolute -right-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2 border-background text-[9px] font-bold text-primary-foreground shadow-lg">
          AI
        </div>
      </div>

      {/* 品牌文字 */}
      <h1
        className="text-3xl font-bold tracking-tight animate-slide-up"
        style={{ animationDelay: '0.05s', color: '#d4a853' }}
      >
        茶掌柜
      </h1>
      <p
        className="mt-1.5 text-sm text-muted-foreground text-center leading-relaxed animate-slide-up"
        style={{ animationDelay: '0.1s' }}
      >
        AI 驱动的茶叶经营管理系统
      </p>

      {/* ── 2×2 特性卡片 ─────────────────────────────── */}
      <div
        className="mt-7 grid grid-cols-2 gap-3 w-full animate-slide-up"
        style={{ animationDelay: '0.15s', maxWidth: 320 }}
      >
        {AI_FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3 backdrop-blur-sm"
          >
            <span className="mt-0.5 text-lg leading-none">{f.icon}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-primary/90 leading-tight">{f.label}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground/60 leading-tight">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
