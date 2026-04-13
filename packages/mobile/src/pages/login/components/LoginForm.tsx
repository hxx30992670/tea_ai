import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'

export function LoginForm() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      setError('请填写账号和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(form)
      setAuth(res.data)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查账号密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm animate-slide-up"
      style={{ animationDelay: '0.15s' }}
    >
      {/* 表单卡片 */}
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-2xl">
        <h2 className="mb-5 text-base font-semibold text-foreground/90">登录账号</h2>

        <div className="space-y-3">
          {/* 账号输入 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              账号
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-sm select-none">
                👤
              </span>
              <input
                type="text"
                placeholder="请输入账号"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                // enterKeyHint 控制手机键盘右下角按钮显示"下一步"
                enterKeyHint="next"
                className="h-12 w-full rounded-xl border border-border bg-input/60 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-all focus:border-primary/60 focus:bg-input focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {/* 密码输入 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              密码
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-sm select-none">
                🔒
              </span>
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="请输入密码"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="current-password"
                // enterKeyHint 控制手机键盘右下角按钮显示"完成/提交"
                enterKeyHint="done"
                className="h-12 w-full rounded-xl border border-border bg-input/60 pl-9 pr-11 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-all focus:border-primary/60 focus:bg-input focus:ring-2 focus:ring-primary/15"
              />
              {/* 密码显示切换 — 增大点击区域方便手指操作 */}
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted-foreground/50 active:text-foreground transition-colors"
                aria-label={showPwd ? '隐藏密码' : '显示密码'}
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <span className="text-destructive text-sm">⚠</span>
            <p className="text-xs text-destructive/90">{error}</p>
          </div>
        )}
      </div>

      {/* 登录按钮 — 独立在卡片外，更突出 */}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-semibold text-primary-foreground shadow-lg transition-all active:scale-[0.97] disabled:opacity-70"
        style={{
          background: loading
            ? 'hsl(var(--primary))'
            : 'linear-gradient(135deg, #c49a3c, #d4a853, #e8c87a)',
          boxShadow: loading ? 'none' : '0 6px 24px rgba(212,168,83,0.4)',
        }}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <ArrowRight size={18} />
        )}
        <span className="text-[15px]">{loading ? '验证中...' : '立即登录'}</span>
      </button>

      {/* 默认账号提示 — 等宽字体，低调显示 */}
      <p
        className="mt-4 rounded-xl border border-border/40 bg-secondary/30 px-4 py-2.5 text-center font-mono text-[11px] tracking-wide text-muted-foreground/50"
      >
        默认账号：admin / Admin@123456
      </p>
    </form>
  )
}
