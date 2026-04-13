import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { LoginForm } from './components/LoginForm'

export default function LoginPage() {
  const { isLoggedIn } = useAuthStore()
  const appIconSrc = `${import.meta.env.BASE_URL}icons/icon.svg`

  if (isLoggedIn) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-5 overflow-hidden">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Logo 区 */}
      <div className="mb-10 flex flex-col items-center gap-3 animate-slide-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 glow-gold">
          <img src={appIconSrc} alt="茶掌柜" className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gold">茶掌柜</h1>
          <p className="mt-1 text-sm text-muted-foreground">茶叶批发零售管理助手</p>
        </div>
      </div>

      {/* 登录表单 */}
      <LoginForm />
    </div>
  )
}
