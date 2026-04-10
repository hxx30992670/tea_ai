import React, { useEffect, useState } from 'react'
import {
  Row, Col, Card, Select, Spin,
  List, Typography, Space,
} from 'antd'
import {
  ArrowUpOutlined, WarningOutlined,
  ShoppingOutlined, DollarOutlined, StockOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { dashboardApi } from '@/api/dashboard'
import { AFTER_SALE_REASON_LABELS } from '@/constants/after-sale'
import type { AfterSaleReasonStat, DashboardOverview, SalesTrend, TopProduct, StockWarning } from '@/types'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'
import FloatingAiButton from './components/FloatingAiButton'
import MetricCardGrid from './components/MetricCardGrid'
import WarningListCard from './components/WarningListCard'
import './index.less'

const { Title, Text } = Typography

const URGENCY_MAP = {
  high: { color: '#ff4d4f', label: '紧急' },
  medium: { color: '#faad14', label: '警告' },
  low: { color: '#52c41a', label: '注意' },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [trend, setTrend] = useState<SalesTrend[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [warnings, setWarnings] = useState<StockWarning[]>([])
  const [afterSaleReasons, setAfterSaleReasons] = useState<AfterSaleReasonStat[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('day')

  const loadData = async () => {
    setLoading(true)
    try {
      const [ov, tr, tp, wa, ar] = await Promise.all([
        dashboardApi.overview(),
        dashboardApi.salesTrend(period),
        dashboardApi.topProducts(),
        dashboardApi.stockWarnings(),
        dashboardApi.afterSalesReasons(),
      ])
      setOverview(ov)
      setTrend(tr)
      setTopProducts(tp)
      setWarnings(wa)
      setAfterSaleReasons(ar)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [period])

  const coreMetricCards = overview ? [
    { title: '今日营收', value: overview.todayRevenue, prefix: '¥', color: '#2D6A4F', icon: <DollarOutlined />, suffix: '' },
    { title: '本月营收', value: overview.monthRevenue, prefix: '¥', color: '#1677ff', icon: <ShoppingOutlined />, suffix: '' },
    { title: '库存总值', value: overview.stockValue, prefix: '¥', color: '#722ed1', icon: <StockOutlined />, suffix: '' },
    { title: '应收总额', value: overview.receivableTotal, prefix: '¥', color: '#fa8c16', icon: <WarningOutlined />, suffix: '' },
  ] : []

  const warningMetricCards = overview ? [
    { title: '销售退货金额', value: overview.saleReturnTotal, prefix: '¥', color: '#cf1322', icon: <ArrowUpOutlined />, suffix: '' },
    { title: '采购退货金额', value: overview.purchaseReturnTotal, prefix: '¥', color: '#531dab', icon: <ArrowUpOutlined />, suffix: '' },
    { title: '销售退款金额', value: overview.refundTotal, prefix: '¥', color: '#fa8c16', icon: <ArrowUpOutlined />, suffix: '' },
    { title: '供应商退款金额', value: overview.supplierRefundTotal, prefix: '¥', color: '#13a8a8', icon: <DollarOutlined />, suffix: '' },
  ] : []

  return (
    <Spin spinning={loading}>
      <div className="dashboard-page">
        <PageHeader title="数据看板" description="实时掌握门店经营数据" className="page-header" />

        <MetricCardGrid label="核心经营" cards={coreMetricCards} />
        <MetricCardGrid label="异常与售后" cards={warningMetricCards} compact />

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <Card
              title="销售趋势"
              extra={
                <Select
                  value={period}
                  onChange={setPeriod}
                  size="small"
                  options={[
                    { value: 'day', label: '近30天' },
                    { value: 'week', label: '按周' },
                    { value: 'month', label: '近12月' },
                  ]}
                />
              }
              className="dashboard-panel-card"
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`¥${v.toLocaleString()}`, '营收']} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="营收(元)" stroke="#2D6A4F" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col xs={24} xl={8}>
            <WarningListCard warnings={warnings} urgencyMap={URGENCY_MAP} onViewAll={() => navigate('/stock')} />
          </Col>

          <Col xs={24}>
            <Card
              title="商品销量排行 TOP10"
              className="dashboard-panel-card"
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topProducts} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="productName" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip formatter={(v: number) => [`¥${v.toLocaleString()}`, '销售额']} />
                  <Bar dataKey="totalAmount" name="销售额" fill="#2D6A4F" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Card
              title="售后原因统计"
              className="dashboard-panel-card"
            >
              <List
                dataSource={afterSaleReasons}
                locale={{ emptyText: '暂无售后统计' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{AFTER_SALE_REASON_LABELS[item.reasonCode] || item.reasonCode}</div>
                        <Text type="secondary">次数 {item.count}</Text>
                      </div>
                      <Text strong>¥{item.amount.toLocaleString()}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>

        <FloatingAiButton onClick={() => navigate('/ai')} />
      </div>
    </Spin>
  )
}
