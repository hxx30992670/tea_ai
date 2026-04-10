import { Typography } from 'antd'

const { Title, Text } = Typography

export default function LoginBrand() {
  return (
    <div className="login-brand">
      <div className="login-brand__logo">🍵</div>
      <Title level={2} className="login-brand__title">茶掌柜</Title>
      <Text className="login-brand__subtitle">茶叶批发零售 AI 智能管理系统</Text>
    </div>
  )
}
