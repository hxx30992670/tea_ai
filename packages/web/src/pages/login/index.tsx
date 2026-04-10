import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Form, Input, Button, Card, message, Checkbox, Typography,
} from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import type { LoginForm } from '@/types'
import LoginBrand from './components/LoginBrand'
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
      // 错误已在拦截器中 message.error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {['12%,18%', '75%,60%', '45%,80%'].map((pos, i) => (
        <div
          key={i}
          className="login-page__orb"
          style={{
            left: pos.split(',')[0],
            top: pos.split(',')[1],
            width: [400, 300, 200][i],
            height: [400, 300, 200][i],
          }}
        />
      ))}

      <div className="login-page__container">
        <LoginBrand />

        <Card
          className="login-card"
          styles={{ body: { padding: '36px 32px' } }}
        >
          <Title level={4} className="login-card__title">登录账号</Title>

          <Form
            form={form}
            onFinish={handleLogin}
            size="large"
            initialValues={{ username: 'admin', password: 'Admin@123456' }}
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入登录账号' }]}
            >
                <Input
                  prefix={<UserOutlined style={{ color: '#aaa' }} />}
                  placeholder="登录账号"
                  className="login-input"
                />
              </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#aaa' }} />}
                  placeholder="登录密码"
                  className="login-input"
                />
              </Form.Item>

            <Form.Item style={{ marginBottom: 12 }}>
              <div className="login-page__actions">
                <Checkbox defaultChecked>记住账号</Checkbox>
                <Text type="secondary" style={{ fontSize: 13 }}>忘记密码？</Text>
              </div>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className="login-submit"
              >
                立即登录
              </Button>
            </Form.Item>
          </Form>

          <div className="login-page__tips">
            <Text type="secondary" style={{ fontSize: 12 }}>
              默认账号：admin / Admin@123456
            </Text>
          </div>
        </Card>

        <div className="login-page__footer">
          <Text className="login-page__copyright">
            © 2026 茶掌柜 · 基于AI的茶叶管理系统
          </Text>
        </div>
      </div>
    </div>
  )
}
