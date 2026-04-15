import React, { useState } from 'react'
import logoWithText from '@/assets/images/logo-400-light.png'
import { useNavigate } from 'react-router-dom'
import {
  Form, Input, Button, Checkbox, Typography, message, ConfigProvider, theme,
} from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import type { LoginForm } from '@/types'
import LoginShowcase from './components/LoginShowcase'
import './index.less'

const { Title, Text } = Typography


export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm<LoginForm>()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const handleLogin = async (values: LoginForm) => {
    setLoading(true)
    try {
      const res = await authApi.login(values)
      if (res.code === 200 && res.data) {
        setAuth(res.data)
        message.success(`欢迎回来，${res.data.user.realName}！`)
        navigate('/', { replace: true })
      }
    } catch {
      // 错误已在拦截器中处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__scan-line" />
      <div className="login-page__orb login-page__orb--br" />
      <div className="login-page__orb login-page__orb--tl" />

      <div className="login-layout">

        {/* ── 左侧：AI 演示面板（动态） ────────────────────────────── */}
        <LoginShowcase />

        {/* ── 右侧：登录表单 ────────────────────────────────────────── */}
        <div className="login-form-panel">
          <div className="login-form-panel__inner">
            <div className="login-form-panel__logo">
              <img src={logoWithText} alt="茶掌柜" style={{ width: 140, height: 'auto', display: 'block', margin: '0 auto' }} />
            </div>

            <Title level={3} className="login-form-panel__title">欢迎回来</Title>
            <Text className="login-form-panel__subtitle">登录你的茶掌柜账号</Text>

            <ConfigProvider
              theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                  colorPrimary: '#52b788',
                  borderRadius: 12,
                  colorBgContainer: 'rgba(255,255,255,0.05)',
                  colorBorder: 'rgba(255,255,255,0.1)',
                  colorText: 'rgba(255,255,255,0.9)',
                  colorTextPlaceholder: 'rgba(255,255,255,0.25)',
                },
              }}
            >
              <Form
                form={form}
                onFinish={handleLogin}
                size="large"
                className="login-form"
                initialValues={{ username: 'admin', password: 'Admin@123456' }}
              >
                <Form.Item
                  name="username"
                  rules={[{ required: true, message: '请输入登录账号' }]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="登录账号"
                    style={{ height: 52 }}
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入登录密码' }]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="登录密码"
                    style={{ height: 52 }}
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: 20 }}>
                  <Checkbox defaultChecked>记住账号</Checkbox>
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    htmlType="submit"
                    loading={loading}
                    className="login-submit-btn"
                  >
                    {loading ? '验证中...' : '立即登录'}
                  </Button>
                </Form.Item>
              </Form>
            </ConfigProvider>

            <div className="login-hint">
              默认账号：admin / Admin@123456
            </div>

            <Text className="login-copyright">© 2026 茶掌柜 · 基于 AI 的茶叶管理系统</Text>
          </div>
        </div>

      </div>
    </div>
  )
}
