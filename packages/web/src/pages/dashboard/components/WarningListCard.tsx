import { Button, Card, Space, Tag, Typography } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import type { StockWarning } from '@/types'

const { Text } = Typography

type WarningListCardProps = {
  warnings: StockWarning[]
  urgencyMap: Record<string, { color: string; label: string }>
  onViewAll: () => void
}

export default function WarningListCard({ warnings, urgencyMap, onViewAll }: WarningListCardProps) {
  return (
    <Card
      title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} />库存预警</Space>}
      extra={<Button type="link" size="small" onClick={onViewAll}>查看全部</Button>}
      className="dashboard-panel-card dashboard-warning-card"
    >
      {warnings.length === 0 ? <Text type="secondary">暂无预警</Text> : warnings.map((warning) => (
        <div key={warning.id} className="dashboard-warning-item">
          <Space className="dashboard-card-space">
            <div>
              <div className="dashboard-warning-name">{warning.productName}</div>
              <Text type="secondary" className="dashboard-warning-desc">
                {warning.type === 'low_stock'
                  ? `库存 ${warning.stockQty}，低于安全库存 ${warning.safeStock}`
                  : `距过期仅剩 ${warning.shelfDaysLeft} 天`}
              </Text>
            </div>
            <Tag color={urgencyMap[warning.urgency].color}>{urgencyMap[warning.urgency].label}</Tag>
          </Space>
        </div>
      ))}
    </Card>
  )
}
