import type { ReactNode } from 'react'
import { Card, Col, Row, Space, Typography } from 'antd'

type MetricCard = {
  title: string
  value: number
  prefix?: string
  color: string
  icon: ReactNode
}

type MetricCardGridProps = {
  label: string
  cards: MetricCard[]
  compact?: boolean
}

const { Text } = Typography

export default function MetricCardGrid({ label, cards, compact }: MetricCardGridProps) {
  return (
    <>
      <div className="dashboard-section-label">
        <Text type="secondary">{label}</Text>
      </div>
      <Row gutter={[16, 16]} className="dashboard-metric-grid">
        {cards.map((card) => (
          <Col key={card.title} xs={24} sm={12} xl={6}>
            <Card className="dashboard-metric-card" styles={{ body: { padding: compact ? 20 : 24 } }}>
              <Space className="dashboard-card-space">
                <div>
                  <Text type="secondary" className="dashboard-card-title">{card.title}</Text>
                  <div className={`dashboard-card-value ${compact ? 'is-compact' : ''}`} style={{ color: card.color }}>
                    {card.prefix}{(card.value ?? 0).toLocaleString()}
                  </div>
                  {!compact ? (
                    <div className="dashboard-card-caption">
                      <Text type="secondary" className="dashboard-caption-text">实时数据</Text>
                    </div>
                  ) : null}
                </div>
                <div className={`dashboard-card-icon ${compact ? 'is-compact' : ''}`} style={{ background: `${card.color}15`, color: card.color }}>
                  {card.icon}
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  )
}
