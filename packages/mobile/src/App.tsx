import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

const appBasePath = import.meta.env.BASE_URL
const routerBaseName = appBasePath === '/' ? undefined : appBasePath.replace(/\/$/, '')

// 懒加载所有页面
const LoginPage = lazy(() => import('@/pages/login'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const ScanPage = lazy(() => import('@/pages/scan'))
const OrderListPage = lazy(() => import('@/pages/order'))
const NewOrderPage = lazy(() => import('@/pages/order/NewOrder'))
const AiPage = lazy(() => import('@/pages/ai'))
const ProfilePage = lazy(() => import('@/pages/profile'))

// 页面加载中的占位
function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}

// 全局错误边界，防止意外错误显示 React Router 的丑陋默认页
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 静默记录，不上报
    console.error('[AppError]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-muted-foreground">出了点小问题，请刷新重试</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              window.location.href = appBasePath
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            返回首页
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>,
      },
      {
        path: 'scan',
        element: <Suspense fallback={<PageLoader />}><ScanPage /></Suspense>,
      },
      {
        path: 'order',
        element: <Suspense fallback={<PageLoader />}><OrderListPage /></Suspense>,
      },
      {
        path: 'order/new',
        element: <Suspense fallback={<PageLoader />}><NewOrderPage /></Suspense>,
      },
      {
        path: 'ai',
        element: <Suspense fallback={<PageLoader />}><AiPage /></Suspense>,
      },
      {
        path: 'profile',
        element: <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>,
      },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
], {
  basename: routerBaseName,
})

export default function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  )
}
