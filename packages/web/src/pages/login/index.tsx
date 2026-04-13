import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Form, Input, Button, Checkbox, Typography, message, ConfigProvider, theme,
} from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import type { LoginForm } from '@/types'
import './index.less'

const { Title, Text } = Typography

// 模拟 AI 对话内容
const MOCK_CHAT = [
  { role: 'user', text: '本月哪些客户欠款超过 5000 元？' },
  { role: 'ai', text: '共找到 3 位客户欠款超过 5000 元：\n• 清远茶行 ¥12,400\n• 德兴茶庄 ¥8,760\n• 汇丰茶业 ¥5,320' },
  { role: 'user', text: '今年各月销售额趋势怎么样？' },
]

// 模拟柱状图数据
const BAR_DATA = [
  { label: '1月', value: 42, color: '#2d6a4f' },
  { label: '2月', value: 35, color: '#2d6a4f' },
  { label: '3月', value: 68, color: '#2d6a4f' },
  { label: '4月', value: 55, color: '#2d6a4f' },
  { label: '5月', value: 80, color: '#52b788' },
  { label: '6月', value: 72, color: '#52b788' },
  { label: '7月', value: 90, color: '#52b788' },
  { label: '8月', value: 85, color: '#52b788' },
]

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

        {/* ── 左侧：AI 演示面板 ─────────────────────────────────────── */}
        <div className="login-showcase">
          {/* 顶部品牌 */}
          <div className="login-showcase__header">
            <div className="login-showcase__logo">🍵</div>
            <div>
              <div className="login-showcase__brand">茶掌柜</div>
              <div className="login-showcase__tagline">AI 驱动的茶叶经营管理系统</div>
            </div>
          </div>

          {/* AI 对话模拟 */}
          <div className="login-demo-card">
            <div className="login-demo-card__titlebar">
              <span className="login-demo-card__dot" style={{ background: '#ff5f57' }} />
              <span className="login-demo-card__dot" style={{ background: '#febc2e' }} />
              <span className="login-demo-card__dot" style={{ background: '#28c840' }} />
              <span className="login-demo-card__label">AI 助手 · 实时问答</span>
            </div>

            <div className="login-demo-chat">
              {MOCK_CHAT.map((msg, i) => (
                <div key={i} className={`login-demo-chat__msg login-demo-chat__msg--${msg.role}`}>
                  {msg.role === 'ai' && (
                    <div className="login-demo-chat__avatar">AI</div>
                  )}
                  <div className="login-demo-chat__bubble">
                    {msg.text.split('\n').map((line, j) => (
                      <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                </div>
              ))}

              {/* 打字中指示器 */}
              <div className="login-demo-chat__msg login-demo-chat__msg--ai">
                <div className="login-demo-chat__avatar">AI</div>
                <div className="login-demo-chat__bubble login-demo-chat__bubble--typing">
                  <span className="login-demo-typing">
                    <i /><i /><i />
                  </span>
                </div>
              </div>
            </div>

            {/* 迷你柱状图 */}
            <div className="login-demo-chart">
              <div className="login-demo-chart__title">月度销售额趋势（万元）</div>
              <div className="login-demo-chart__bars">
                {BAR_DATA.map((d) => (
                  <div key={d.label} className="login-demo-chart__col">
                    <div
                      className="login-demo-chart__bar"
                      style={{ height: `${d.value}%`, background: d.color }}
                    />
                    <div className="login-demo-chart__x">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 底部特性标签 */}
          <div className="login-showcase__tags">
            {['自然语言查询', 'SQL 自动生成', '智能图表', '拍照录单', '多端适配'].map((tag) => (
              <span key={tag} className="login-showcase__tag">{tag}</span>
            ))}
          </div>
        </div>

        {/* ── 右侧：登录表单 ────────────────────────────────────────── */}
        <div className="login-form-panel">
          <div className="login-form-panel__inner">
            <div className="login-form-panel__logo">
              <div className="login-form-panel__logo-icon">🍵</div>
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
