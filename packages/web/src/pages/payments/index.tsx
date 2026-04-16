import React, { useEffect, useState } from 'react'
import {
  Table, Button, Space, Tag, Card, Select, Row, Col, Statistic, Typography, Tabs, DatePicker,
} from 'antd'
import { PlusOutlined, ArrowUpOutlined, ArrowDownOutlined, SearchOutlined } from '@ant-design/icons'
import { paymentApi, type PayableSummary, type ReceivableSummary } from '@/api/payments'
import { PAYMENT_RECORD_TYPE } from '@/constants/order'
import type { PaymentRecord } from '@/types'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import type { Dayjs } from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import { PaymentRecordModal } from './components/PaymentRecordModal'
import { formatDateTime } from '@/utils/date'
import '@/styles/page.less'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const METHOD_OPTIONS_FILTER = [
  { value: '', label: '全部方式' },
  ...PAYMENT_METHOD_OPTIONS,
]

const TYPE_OPTIONS_FILTER = [
  { value: '', label: '全部类型' },
  { value: PAYMENT_RECORD_TYPE.RECEIVE, label: '收款' },
  { value: PAYMENT_RECORD_TYPE.PAY, label: '付款' },
  { value: PAYMENT_RECORD_TYPE.REFUND, label: '仅看销售退款' },
  { value: PAYMENT_RECORD_TYPE.SUPPLIER_REFUND, label: '仅看供应商退款' },
]

export default function PaymentsPage() {
  const [list, setList] = useState<PaymentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [receivables, setReceivables] = useState<ReceivableSummary[]>([])
  const [payables, setPayables] = useState<PayableSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const [filterType, setFilterType] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)

  const buildParams = (overrides?: Record<string, unknown>) => ({
    type: filterType || undefined,
    method: filterMethod || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const loadData = async (overrides?: Record<string, unknown>) => {
    setLoading(true)
    const [res, receiveRes, payRes] = await Promise.all([
      paymentApi.list(buildParams(overrides)),
      paymentApi.receivables(),
      paymentApi.payables(),
    ])
    setList(res.list)
    setTotal(res.total ?? 0)
    setReceivables(receiveRes)
    setPayables(payRes)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setFilterType(''); setFilterMethod(''); setDateRange(null); setPage(1)
    loadData({ type: undefined, method: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const totalReceive = list.filter((p) => p.type === PAYMENT_RECORD_TYPE.RECEIVE).reduce((sum, p) => sum + p.amount, 0)
  const totalPay = list.filter((p) => p.type === PAYMENT_RECORD_TYPE.PAY || p.type === PAYMENT_RECORD_TYPE.REFUND).reduce((sum, p) => sum + p.amount, 0)
  const totalSupplierRefund = list.filter((p) => p.type === PAYMENT_RECORD_TYPE.SUPPLIER_REFUND).reduce((sum, p) => sum + p.amount, 0)

  const columns = [
    {
      title: '类型', dataIndex: 'type', width: 90,
      render: (v: string) => {
        if (v === PAYMENT_RECORD_TYPE.RECEIVE) {
          return <Tag color="success" icon={<ArrowDownOutlined />}>收款</Tag>
        }
        if (v === PAYMENT_RECORD_TYPE.REFUND) {
          return <Tag color="orange" icon={<ArrowUpOutlined />}>退款</Tag>
        }
        if (v === PAYMENT_RECORD_TYPE.SUPPLIER_REFUND) {
          return <Tag color="cyan" icon={<ArrowDownOutlined />}>供应商退款</Tag>
        }
        return <Tag color="error" icon={<ArrowUpOutlined />}>付款</Tag>
      },
    },
    {
      title: '关联单号', dataIndex: 'orderNo', width: 180,
      render: (v?: string) => v ? <Text code>{v}</Text> : '-',
    },
    {
      title: '金额', dataIndex: 'amount', width: 150, align: 'right' as const,
      render: (v: number, r: PaymentRecord) => (
        <Text strong style={{ color: r.type === 'receive' ? '#52c41a' : '#ff4d4f' }}>
          {r.type === 'receive' ? '+' : '-'}¥{v.toLocaleString()}
        </Text>
      ),
    },
    { title: '支付方式', dataIndex: 'method', width: 110, render: (v?: string) => v || '-' },
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v?: string) => formatDateTime(v) },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ]

  return (
    <div>
      <PageHeader
        title="收付款管理"
        description="主要用于查询流水、核对应收应付，以及补录漏记的收付款。"
        className="page-header"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} className="page-primary-button">
            补录收付款
          </Button>
        )}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="累计收款" value={totalReceive} prefix="¥" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="累计付款" value={totalPay} prefix="¥" valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="净收入" value={totalReceive + totalSupplierRefund - totalPay} prefix="¥" valueStyle={{ color: '#2D6A4F' }} />
          </Card>
        </Col>
      </Row>

      <Card className="page-card page-card--flat">
        <Tabs
          tabBarExtraContent={
            <Row gutter={8} align="middle" style={{ padding: '8px 16px 0' }}>
              <Col>
                <Select style={{ width: 120 }} value={filterType} onChange={setFilterType} options={TYPE_OPTIONS_FILTER} />
              </Col>
              <Col>
                <Select style={{ width: 120 }} value={filterMethod} onChange={setFilterMethod} options={METHOD_OPTIONS_FILTER} />
              </Col>
              <Col>
                <RangePicker style={{ width: 220 }} value={dateRange}
                  onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)} />
              </Col>
              <Col>
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}
                    style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>搜索</Button>
                  <Button onClick={handleReset}>重置</Button>
                </Space>
              </Col>
            </Row>
          }
          items={[
            {
              key: 'records',
              label: `流水查询（${total}）`,
              children: (
                <Table columns={columns} dataSource={list} rowKey="id" loading={loading}
                  pagination={{
                    current: page, total, pageSize: 10, size: 'small',
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p) => { setPage(p); loadData({ page: p }) },
                  }} />
              ),
            },
            {
              key: 'receivables',
              label: '应收查询',
              children: <Table rowKey="id" loading={loading} dataSource={receivables} pagination={false} columns={[
                { title: '销售单号', dataIndex: 'orderNo' },
                { title: '客户', dataIndex: 'customerName' },
                { title: '总金额', dataIndex: 'totalAmount', render: (v: number) => `¥${v.toLocaleString()}` },
                { title: '已收', dataIndex: 'receivedAmount', render: (v: number) => `¥${v.toLocaleString()}` },
                { title: '待收', dataIndex: 'receivableAmount', render: (v: number) => <Text type="danger">¥{v.toLocaleString()}</Text> },
              ]} />,
            },
            {
              key: 'payables',
              label: '应付查询',
              children: <Table rowKey="id" loading={loading} dataSource={payables} pagination={false} columns={[
                { title: '采购单号', dataIndex: 'orderNo' },
                { title: '供应商', dataIndex: 'supplierName' },
                { title: '总金额', dataIndex: 'totalAmount', render: (v: number) => `¥${v.toLocaleString()}` },
                { title: '已付', dataIndex: 'paidAmount', render: (v: number) => `¥${v.toLocaleString()}` },
                { title: '待付', dataIndex: 'payableAmount', render: (v: number) => <Text type="danger">¥{v.toLocaleString()}</Text> },
              ]} />,
            },
          ]}
        />
      </Card>

      <PaymentRecordModal
        open={modalOpen}
        receivables={receivables}
        payables={payables}
        onCancel={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); loadData() }}
      />
    </div>
  )
}
