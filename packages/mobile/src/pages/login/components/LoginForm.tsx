import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
      className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-slide-up"
      style={{ animationDelay: '0.1s' }}
    >
      <h2 className="mb-5 text-lg font-semibold text-foreground">登录账号</h2>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">账号</label>
          <Input
            placeholder="请输入账号"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            autoComplete="username"
            autoCapitalize="none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">密码</label>
          <div className="relative">
            <Input
              type={showPwd ? 'text' : 'password'}
              placeholder="请输入密码"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}

      <Button
        type="submit"
        variant="gold"
        size="lg"
        className="mt-5 w-full"
        disabled={loading}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
        {loading ? '登录中...' : '登录'}
      </Button>
    </form>
  )
}
