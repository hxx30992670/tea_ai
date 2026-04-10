import { RobotOutlined } from '@ant-design/icons'

type FloatingAiButtonProps = {
  onClick: () => void
}

export default function FloatingAiButton({ onClick }: FloatingAiButtonProps) {
  return (
    <button type="button" className="dashboard-floating-ai" onClick={onClick} title="AI 助手">
      <RobotOutlined />
    </button>
  )
}
