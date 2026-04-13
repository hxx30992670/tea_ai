import React, { useEffect, useState } from 'react'
import {
  Form, Input, Button, Card, Select, Divider, message,
  Typography, Space, Tag, Tabs, Alert, Collapse, Image,
} from 'antd'
import {
  ShopOutlined, RobotOutlined, KeyOutlined,
  CheckCircleOutlined, LockOutlined, ApiOutlined,
} from '@ant-design/icons'
import { systemApi } from '@/api/system'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'

const serviceQrcode = new URL('@/assets/images/service_qcode.JPG', import.meta.url).href

const { Title, Text } = Typography

// ── 提供商配置表 ────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'qwen', label: '阿里云（通义千问）' },
  { value: 'deepseek', label: 'DeepSeek' },
]

const PROVIDER_CONFIG: Record<string, { baseUrl: string; defaultModel: string }> = {
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.6-plus',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
}

const DEFAULT_PROVIDER = 'qwen'

function getDefaultAiFields(provider = DEFAULT_PROVIDER) {
  const normalizedProvider = PROVIDER_CONFIG[provider] ? provider : DEFAULT_PROVIDER
  const config = PROVIDER_CONFIG[normalizedProvider]

  return {
    aiProvider: normalizedProvider,
    aiModelName: config.defaultModel,
    aiModelBaseUrl: config.baseUrl,
  }
}

type TestStatus = 'idle' | 'testing' | 'success' | 'fail'
type TestCheck = { key: string; label: string; ok: boolean; message: string }

export default function SettingsPage() {
  const [shopForm] = Form.useForm()
  const [aiForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [shopLoading, setShopLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [testChecks, setTestChecks] = useState<TestCheck[]>([])
  const [currentProvider, setCurrentProvider] = useState<string>('')
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    systemApi.getSettings().then((data) => {
      shopForm.setFieldsValue(data)

      const defaultAiFields = getDefaultAiFields(data.aiProvider)
      const nextAiValues = {
        ...data,
        aiProvider: data.aiProvider || defaultAiFields.aiProvider,
        aiModelName: data.aiModelName || defaultAiFields.aiModelName,
        aiModelBaseUrl: data.aiModelBaseUrl || defaultAiFields.aiModelBaseUrl,
      }

      aiForm.setFieldsValue(nextAiValues)
      setCurrentProvider(nextAiValues.aiProvider)
    })
  }, [])

  const handleProviderChange = (provider: string) => {
    setCurrentProvider(provider)
    const cfg = PROVIDER_CONFIG[provider]
    if (cfg) {
      aiForm.setFieldsValue({
        aiModelBaseUrl: cfg.baseUrl,
        aiModelName: cfg.defaultModel,
      })
    }
    setTestStatus('idle')
    setTestChecks([])
  }

  const handleSaveShop = async () => {
    setShopLoading(true)
    try {
      await systemApi.updateSettings(shopForm.getFieldsValue())
      message.success('店铺信息已保存')
    } catch { /* interceptor 处理 */ } finally {
      setShopLoading(false)
    }
  }

  const handleSaveAi = async () => {
    try {
      await aiForm.validateFields(['aiApiKey', 'aiPromptServiceUrl', 'aiProvider', 'aiModelApiKey', 'aiModelName', 'aiModelBaseUrl'])
    } catch {
      return
    }
    setAiLoading(true)
    try {
      await systemApi.updateSettings(aiForm.getFieldsValue())
      message.success('AI 配置已保存，刷新页面后生效')
    } catch { /* interceptor 处理 */ } finally {
      setAiLoading(false)
    }
  }

  const handleTestAi = async () => {
    const values = aiForm.getFieldsValue() as {
      aiApiKey: string
      aiPromptServiceUrl: string
      aiProvider: string
      aiModelApiKey: string
      aiModelName: string
      aiModelBaseUrl: string
    }
    if (!values.aiApiKey || !values.aiPromptServiceUrl || !values.aiProvider || !values.aiModelApiKey || !values.aiModelName || !values.aiModelBaseUrl) {
      message.warning('请先填写 AI 授权 Key、Agent 服务地址、提供商、模型 API Key、模型名称和 Base URL')
      return
    }

    setTestStatus('testing')
    setTestMsg('')
    setTestChecks([])
    try {
      const result = await systemApi.testAi({
        apiKey: values.aiApiKey,
        promptServiceUrl: values.aiPromptServiceUrl,
        provider: values.aiProvider,
        modelApiKey: values.aiModelApiKey,
        modelName: values.aiModelName,
        modelBaseUrl: values.aiModelBaseUrl,
      })
      setTestChecks(result.checks)
      if (result.ok) {
        setTestStatus('success')
        setTestMsg(result.message)
        message.success(result.message)
      } else {
        setTestStatus('fail')
        setTestMsg(result.message)
        message.error(result.message)
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '测试请求失败'
      setTestStatus('fail')
      setTestMsg(errMsg)
      setTestChecks([])
      message.error(errMsg)
    }
  }

  const handleChangePwd = async () => {
    const values = await pwdForm.validateFields()
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入密码不一致')
      return
    }
    setPwdLoading(true)
    try {
      await authApi.changePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword })
      message.success('密码修改成功')
      pwdForm.resetFields()
    } catch { /* interceptor 处理 */ } finally {
      setPwdLoading(false)
    }
  }

  const testTagColor = testStatus === 'success' ? 'success' : testStatus === 'fail' ? 'error' : testStatus === 'testing' ? 'processing' : 'default'
  const testTagText = testStatus === 'success' ? '✓ 连接成功' : testStatus === 'fail' ? '✗ 连接失败' : testStatus === 'testing' ? '测试中...' : '未测试'

  const tabItems = [
    {
      key: 'shop',
      label: <Space><ShopOutlined />店铺信息</Space>,
      children: (
        <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxWidth: 520 }}>
          <Form form={shopForm} layout="vertical">
            <Form.Item name="shopName" label="店铺名称" rules={[{ required: true }]}>
              <Input placeholder="如：茶掌柜示范门店" />
            </Form.Item>
            <Button type="primary" loading={shopLoading} onClick={handleSaveShop}
              style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>
              保存店铺信息
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'ai',
      label: <Space><RobotOutlined />AI 配置</Space>,
      children: (
        <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxWidth: 760 }}>
          {/* 联系提示卡片 */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '1.5px solid #86efac',
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 32,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <RobotOutlined style={{ fontSize: 22, color: '#16a34a' }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: '#15803d' }}>开通 AI 功能</span>
              </div>
              <p style={{ margin: '0 0 6px', color: '#166534', fontSize: 14, lineHeight: 1.8 }}>
                AI 功能由「大模型」+「茶行业 Agent」两部分组成：大模型 API Key 需自行前往对应厂商申请，Agent 服务由我们提供，专为茶行业场景优化，开通后即可使用智能问答、图片识别、AI 自动录单等能力。
              </p>
              <p style={{ margin: 0, color: '#15803d', fontSize: 14, fontWeight: 600 }}>
                📱 扫码联系我，获取茶行业 Agent 服务地址和授权 Key
              </p>
            </div>
            <div style={{
              flex: 'none',
              alignSelf: 'flex-start',
              background: '#fff',
              borderRadius: 12,
              padding: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              lineHeight: 0,
            }}>
              <Image
                src={serviceQrcode}
                alt="联系二维码"
                width={176}
                height={176}
                style={{
                  borderRadius: 8,
                  objectFit: 'contain',
                  display: 'block',
                  cursor: 'pointer',
                }}
                preview={{
                  mask: <span style={{ fontSize: 12 }}>点击放大</span>,
                }}
              />
            </div>
          </div>

          <Form form={aiForm} layout="vertical">
            {/* Agent 配置 */}
            <Form.Item name="aiApiKey" label="Agent 授权 Key" rules={[{ required: true, message: '请填写 AI 授权 Key' }]}>
              <Input.Password prefix={<KeyOutlined />} placeholder="填入你购买的 AI Agent 行业授权 Key" />
            </Form.Item>
            <Form.Item name="aiPromptServiceUrl" label="Agent 服务地址" rules={[{ required: true, message: '请填写 Agent 服务地址' }]}>
              <Input
                prefix={<ApiOutlined />}
                placeholder="https://..."
                onChange={() => setTestStatus('idle')}
              />
            </Form.Item>

            {/* 大模型配置 */}
            <Form.Item name="aiProvider" label="大模型提供商" rules={[{ required: true, message: '请选择提供商' }]}>
              <Select
                placeholder="选择提供商"
                options={PROVIDERS}
                onChange={handleProviderChange}
              />
            </Form.Item>

            <Form.Item name="aiModelName" label="模型" rules={[{ required: true, message: '请填写模型名称' }]}>
              <Input
                placeholder={currentProvider ? `默认 ${PROVIDER_CONFIG[currentProvider]?.defaultModel}，可手动修改` : '请输入模型名称'}
                onChange={() => setTestStatus('idle')}
              />
            </Form.Item>

            <Form.Item name="aiModelBaseUrl" label="Base URL" rules={[{ required: true, message: '请填写 Base URL' }]}>
              <Input
                prefix={<ApiOutlined />}
                placeholder="https://..."
                onChange={() => setTestStatus('idle')}
              />
            </Form.Item>
            <Form.Item name="aiModelApiKey" label="模型 API Key" rules={[{ required: true, message: '请填写模型 API Key' }]}>
              <Input.Password
                prefix={<KeyOutlined />}
                placeholder="填入你购买的大模型 API Key"
                onChange={() => setTestStatus('idle')}
              />
            </Form.Item>


            {/* 测试结果提示 */}
            {testStatus !== 'idle' && (
              <div style={{ marginBottom: 16 }}>
                <Tag color={testTagColor}>{testTagText}</Tag>
                {testMsg && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{testMsg}</Text>}
                {testChecks.length > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {testChecks.map((item) => (
                      <Alert
                        key={item.key}
                        type={item.ok ? 'success' : 'error'}
                        showIcon
                        message={item.label}
                        description={item.message}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<CheckCircleOutlined />}
                loading={testStatus === 'testing'}
                onClick={handleTestAi}
              >
                测试连接
              </Button>
              <Button
                type="primary"
                loading={aiLoading}
                onClick={handleSaveAi}
                style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}
              >
                保存 AI 配置
              </Button>
            </Space>

            {/* 高级配置（外部授权服务，暂未部署时不需要填） */}
            {/* <Collapse
              ghost
              size="small"
              items={[{
                key: 'advanced',
                label: <Text type="secondary" style={{ fontSize: 12 }}>高级配置（外部 Prompt 授权服务）</Text>,
                children: (
                  <div>
                    <Alert
                      type="info"
                      showIcon
                      message="以下配置由系统自动注入，无需客户手工修改。"
                      style={{ marginBottom: 16 }}
                    />

                    <Form.Item name="aiIndustry" label="行业标识">
                      <Input placeholder="由环境变量自动注入，如：tea" disabled />
                    </Form.Item>
                  </div>
                ),
              }]}
            /> */}
          </Form>
        </Card>
      ),
    },
    {
      key: 'password',
      label: <Space><LockOutlined />修改密码</Space>,
      children: (
        <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxWidth: 400 }}>
          <Form form={pwdForm} layout="vertical">
            <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true }]}>
              <Input.Password placeholder="当前密码" />
            </Form.Item>
            <Form.Item name="newPassword" label="新密码" rules={[{ required: true }, { min: 8, message: '至少8位' }]}>
              <Input.Password placeholder="新密码（至少8位）" />
            </Form.Item>
            <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true }]}>
              <Input.Password placeholder="再次输入新密码" />
            </Form.Item>
            <Button type="primary" loading={pwdLoading} onClick={handleChangePwd}
              style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>
              确认修改密码
            </Button>
          </Form>
        </Card>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="系统设置" description="管理店铺信息、AI 配置和账户安全" className="page-header" />
      <Tabs items={isAdmin ? tabItems : tabItems.filter((item) => item.key !== 'ai')} />
    </div>
  )
}
