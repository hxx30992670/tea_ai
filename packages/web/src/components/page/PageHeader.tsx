import type { ReactNode } from 'react'
import { Typography } from 'antd'

type PageHeaderProps = {
  title: string
  description?: ReactNode
  extra?: ReactNode
  className?: string
}

const { Title, Text } = Typography

export default function PageHeader({ title, description, extra, className }: PageHeaderProps) {
  return (
    <div className={className}>
      <div>
        <Title level={3} style={{ margin: 0 }}>{title}</Title>
        {description ? <Text type="secondary">{description}</Text> : null}
      </div>
      {extra ? <div>{extra}</div> : null}
    </div>
  )
}
