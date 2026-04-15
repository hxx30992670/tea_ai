/**
 * 茶掌柜 Web 端 - 基础布局组件
 * 提供侧边栏菜单、顶部 Header 及用户信息展示
 * 所有已登录页面均包裹在此布局中
 */
import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logoIcon from '@/assets/images/logo-icon.png'
import logoWithText from '@/assets/images/logo-400.png'
import {
  Layout, Menu, Avatar, Dropdown, Space, Tag,
  Typography, Button, theme,
} from 'antd'
import {
  DashboardOutlined, ShopOutlined, InboxOutlined,
  ShoppingCartOutlined, ShoppingOutlined, TeamOutlined,
  BankOutlined, PayCircleOutlined, RobotOutlined,
  SettingOutlined, UserOutlined, LogoutOutlined,
  KeyOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'

const { Sider, Header, Content } = Layout
const { Text } = Typography

/** 侧边栏菜单配置：定义所有导航项及子菜单 */
const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '数据看板' },
  { key: '/products', icon: <ShopOutlined />, label: '商品管理' },
  { key: '/stock', icon: <InboxOutlined />, label: '库存管理' },
  {
    key: '/orders',
    icon: <ShoppingCartOutlined />,
    label: '订单管理',
    children: [
      { key: '/purchase', label: '采购订单' },
      { key: '/sale', label: '销售订单' },
    ],
  },
  { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
  { key: '/suppliers', icon: <BankOutlined />, label: '供应商' },
  { key: '/payments', icon: <PayCircleOutlined />, label: '收付款' },
  { key: '/ai', icon: <RobotOutlined />, label: 'AI 助手' },
  {
    key: '/system',
    icon: <SettingOutlined />,
    label: '系统管理',
    children: [
      { key: '/system/users', label: '用户管理' },
      { key: '/system/logs', label: '操作日志' },
      { key: '/system/settings', label: '系统设置' },
    ],
  },
]

/** 布局组件属性定义 */
interface BasicLayoutProps {
  children: React.ReactNode  // 子页面内容
}

/** 角色显示映射：不同角色展示不同的标签颜色 */
const ROLE_MAP: Record<string, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'red' },
  manager: { label: '店长', color: 'blue' },
  staff: { label: '店员', color: 'green' },
}

/** 基础布局组件：渲染侧边栏、顶部导航及内容区域 */
export default function BasicLayout({ children }: BasicLayoutProps) {
  // 侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { token } = theme.useToken()

  // 当前选中菜单：根据路由路径自动高亮
  const selectedKeys = [location.pathname]
  // 自动展开包含当前路径的父菜单
  const openKeys = MENU_ITEMS
    .filter((item) => item.children?.some((c) => c.key === location.pathname))
    .map((item) => item.key)

  // 退出登录处理
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenuItems = [

    { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const handleUserMenu = ({ key }: { key: string }) => {
    if (key === 'logout') handleLogout()
    if (key === 'password') navigate('/system/settings?tab=password')
  }

  const roleInfo = user?.role ? ROLE_MAP[user.role] : null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        style={{
          background: 'linear-gradient(180deg, #1a3d2b 0%, #2D6A4F 60%, #1a3d2b 100%)',
          boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: collapsed ? '16px 0' : '16px 20px',
          cursor: 'pointer',
        }} onClick={() => navigate('/')}>
          {collapsed ? (
            <img
              src={logoIcon}
              alt="茶掌柜"
              style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8 }}
            />
          ) : (
            <img
              src={logoWithText}
              alt="茶掌柜"
              style={{ width: 140, height: 'auto', objectFit: 'contain' }}
            />
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={MENU_ITEMS.map((item) => ({
            ...item,
            label: item.children
              ? item.label
              : <Link to={item.key}>{item.label}</Link>,
            children: item.children?.map((c) => ({
              ...c,
              label: <Link to={c.key}>{c.label}</Link>,
            })),
          }))}
          style={{ background: 'transparent', border: 'none' }}
          theme="dark"
        />
      </Sider>

      <Layout>
        {/* Header */}
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />

          <Space size={16}>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: token.colorPrimary }}>
                  {user?.realName?.[0] || 'U'}
                </Avatar>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{user?.realName}</div>
                  {roleInfo && <Tag color={roleInfo.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{roleInfo.label}</Tag>}
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: 24, background: token.colorBgLayout, minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
