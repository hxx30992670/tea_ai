/**
 * 茶掌柜 Web 端 - 路由配置
 * 定义所有页面路由及访问守卫
 * - RequireAuth: 已登录才能访问的页面
 * - RequireGuest: 已登录时自动跳转到首页（如登录页）
 */
import React from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import BasicLayout from '@/layouts/BasicLayout'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import ProductsPage from '@/pages/products'
import StockPage from '@/pages/stock'
import PurchasePage from '@/pages/purchase'
import SalePage from '@/pages/sale'
import CustomersPage from '@/pages/customers'
import SuppliersPage from '@/pages/suppliers'
import PaymentsPage from '@/pages/payments'
import AiPage from '@/pages/ai'
import SettingsPage from '@/pages/system/settings'
import UsersPage from '@/pages/system/users'
import LogsPage from '@/pages/system/logs'

/** 路由守卫：已登录才能访问，未登录重定向到登录页 */
function RequireAuth() {
  const { isLoggedIn } = useAuthStore()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return (
    <BasicLayout>
      <Outlet />
    </BasicLayout>
  )
}

/** 路由守卫：已登录时访问 /login 自动跳转到首页 */
function RequireGuest() {
  const { isLoggedIn } = useAuthStore()
  if (isLoggedIn) return <Navigate to="/" replace />
  return <Outlet />
}

/** 路由表定义 */
const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <DashboardPage /> },           // 数据看板
      { path: '/products', element: <ProductsPage /> },    // 商品管理
      { path: '/stock', element: <StockPage /> },          // 库存管理
      { path: '/purchase', element: <PurchasePage /> },    // 采购订单
      { path: '/sale', element: <SalePage /> },            // 销售订单
      { path: '/customers', element: <CustomersPage /> },  // 客户管理
      { path: '/suppliers', element: <SuppliersPage /> },  // 供应商管理
      { path: '/payments', element: <PaymentsPage /> },    // 收付款管理
      { path: '/ai', element: <AiPage /> },                // AI 助手
      { path: '/system/settings', element: <SettingsPage /> },  // 系统设置
      { path: '/system/users', element: <UsersPage /> },        // 用户管理
      { path: '/system/logs', element: <LogsPage /> },          // 操作日志
      { path: '*', element: <Navigate to="/" replace /> }, // 未知路径重定向到首页
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
