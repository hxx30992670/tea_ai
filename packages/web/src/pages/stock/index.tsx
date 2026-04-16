import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  InputNumber, Card, Badge, Typography, Row, Col, List, Statistic, DatePicker,
} from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined, SearchOutlined } from '@ant-design/icons'
import { stockApi } from '@/api/stock'
import type { StockRecord, StockWarning } from '@/types'
import { formatCompositeQuantity, formatQuantityNumber, getProductPackageConfig } from '@/utils/packaging'
import ProductSelect from '@/components/ProductSelect'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import { formatDateTime } from '@/utils/date'
import '@/styles/page.less'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4

const REASON_MAP: Record<string, string> = {
  opening: '期初建账',
  purchase: '采购入库',
  purchase_return: '采购退货',
  sale: '销售出库',
  sale_return: '销售退货',
  sale_exchange_return: '换货退回',
  sale_exchange_out: '换货出库',
  return: '退货入库',
  damage: '报损出库',
  surplus: '盘盈入库',
  shortage: '盘亏出库',
  usage: '内部领用',
  other: '其他',
}

function formatStockQty(r: StockRecord): string {
  if (r.packageUnit && (Number(r.packageQty ?? 0) > 0 || Number(r.looseQty ?? 0) > 0)) {
    return formatCompositeQuantity(r)
  }

  return `${formatQuantityNumber(r.quantity)}${r.unit ?? ''}`
}

function renderAfterQty(qty: number, r: StockRecord) {
  const unit = r.unit ?? ''
  const packageUnit = r.packageUnit
  const packageSize = Number(r.packageSize ?? 0)

  if (packageUnit && packageSize > 0) {
    const pkgAmount = formatQuantityNumber(qty / packageSize)
    return (
      <span>
        <Text strong>{formatQuantityNumber(qty)}{unit}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 11 }}>{pkgAmount}{packageUnit}</Text>
      </span>
    )
  }

  return <Text strong>{formatQuantityNumber(qty)}{unit}</Text>
}

function formatAfterQty(qty: number, r: { unit?: string }) {
  return `${formatQuantityNumber(qty)}${r.unit ?? ''}`
}

const URGENCY_STATUS: Record<string, 'error' | 'warning' | 'processing'> = {
  high: 'error', medium: 'warning', low: 'processing',
}

const URGENCY_LABEL: Record<string, string> = {
  high: '紧急', medium: '警告', low: '注意',
}

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'in', label: '入库' },
  { value: 'out', label: '出库' },
]

export default function StockPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<StockRecord[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ todayIn: 0, todayOut: 0 })
  const [warnings, setWarnings] = useState<StockWarning[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'in' | 'out'>('in')
  const [form] = Form.useForm()

  const [keyword, setKeyword] = useState('')
  const [filterType, setFilterType] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)

  const buildParams = (overrides?: Record<string, unknown>) => ({
    keyword: keyword || undefined,
    type: filterType || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const loadData = async (overrides?: Record<string, unknown>) => {
    setLoading(true)
    const [res, statsRes, wa] = await Promise.all([
      stockApi.records(buildParams(overrides)),
      stockApi.stats(),
      stockApi.warnings(),
    ])
    setRecords(res.list)
    setTotal(res.total ?? 0)
    setStats(statsRes)
    setWarnings(wa)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setKeyword(''); setFilterType(''); setDateRange(null); setPage(1)
    loadData({ keyword: undefined, type: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const openModal = (type: 'in' | 'out') => {
    setModalType(type)
    form.resetFields()
    form.setFieldsValue({ reason: type === 'in' ? 'surplus' : 'damage', _product: null })
    setModalOpen(true)
  }

  /** 从库存预警跳转采购页，按缺口预填建议采购数量 */
  const goPurchaseForWarning = (w: StockWarning) => {
    const gap = Math.max(1, Math.ceil(Number(w.safeStock ?? 0) - Number(w.stockQty ?? 0)))
    navigate(`/purchase?productId=${w.productId}&suggestQty=${gap}`)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const { _product, ...payload } = values
    if (modalType === 'in') await stockApi.in(payload)
    else await stockApi.out(payload)
    setModalOpen(false)
    loadData()
  }

  const sortedWarnings = [...warnings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
  })

  const columns = [
    { title: '商品', dataIndex: 'productName', width: 180 },
    {
      title: '类型', dataIndex: 'type', width: 80,
      render: (v: string) => <Tag color={v === 'in' ? 'success' : 'error'}>{v === 'in' ? '↑ 入库' : '↓ 出库'}</Tag>,
    },
    { title: '原因', dataIndex: 'reason', width: 100, render: (v: string) => REASON_MAP[v] || v },
    {
      title: '数量', dataIndex: 'quantity', width: 200,
      render: (_: number, r: StockRecord) => (
        <Text strong style={{ color: r.type === 'in' ? '#52c41a' : '#ff4d4f' }}>
          {r.type === 'in' ? '+' : '-'}{formatStockQty(r)}
        </Text>
      ),
    },
    {
      title: '总库存', dataIndex: 'afterQty', width: 120,
      render: (afterQty: number, r: StockRecord) => renderAfterQty(afterQty, r),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 200,
      render: (v: string | Date | null | undefined) => formatDateTime(v),
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ]

  return (
    <div>
      <PageHeader title="库存管理" className="page-header" />

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 10, borderColor: '#52c41a', background: '#f6ffed' }}>
            <Statistic title="今日入库" value={stats.todayIn} valueStyle={{ color: '#52c41a', fontSize: 26 }}
              prefix={<ArrowUpOutlined />} suffix="件" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 10, borderColor: '#ff4d4f', background: '#fff2f0' }}>
            <Statistic title="今日出库" value={stats.todayOut} valueStyle={{ color: '#ff4d4f', fontSize: 26 }}
              prefix={<ArrowDownOutlined />} suffix="件" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 10, borderColor: warnings.length > 0 ? '#faad14' : '#d9d9d9', background: warnings.length > 0 ? '#fffbe6' : undefined }}>
            <Statistic title="库存预警" value={warnings.length}
              valueStyle={{ color: warnings.length > 0 ? '#faad14' : '#bfbfbf', fontSize: 26 }}
              prefix={<WarningOutlined />} suffix="项" />
          </Card>
        </Col>
      </Row>

      {warnings.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12, borderColor: '#faad14' }}
          title={<Space><WarningOutlined style={{ color: '#faad14' }} /><span>需要关注的商品</span><Badge count={warnings.length} style={{ backgroundColor: '#faad14' }} /></Space>}>
          <List size="small" dataSource={sortedWarnings} renderItem={(w) => (
            <List.Item
              style={{ padding: '6px 0' }}
              actions={w.type === 'low_stock'
                ? [
                    <Button key="in" size="small" type="primary" ghost onClick={() => openModal('in')}>入库</Button>,
                    <Button key="po" size="small" onClick={() => goPurchaseForWarning(w)}>采购</Button>,
                  ]
                : []}
            >
              <Space size={12}>
                <Badge status={URGENCY_STATUS[w.urgency]} text={URGENCY_LABEL[w.urgency]} />
                <Text strong style={{ minWidth: 100 }}>{w.productName}</Text>
                {w.type === 'low_stock' && <Text type="secondary">库存 <Text type="danger">{w.stockQty}</Text> / 安全库存 {w.safeStock}</Text>}
                {w.type === 'expiring' && w.shelfDaysLeft != null && <Tag color="volcano">还有 {w.shelfDaysLeft} 天到期</Tag>}
              </Space>
            </List.Item>
          )} />
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Button block size="large" icon={<ArrowUpOutlined />} onClick={() => openModal('in')}
            style={{ height: 60, fontSize: 17, fontWeight: 600, borderRadius: 12, background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}>
            手工入库 (盘盈/期初)
          </Button>
        </Col>
        <Col span={12}>
          <Button block size="large" icon={<ArrowDownOutlined />} onClick={() => openModal('out')}
            style={{ height: 60, fontSize: 17, fontWeight: 600, borderRadius: 12, background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' }}>
            手工出库 (报损/领用)
          </Button>
        </Col>
      </Row>

      <Card
        title={<Space><span>库存流水</span><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>共 {total} 条</Text></Space>}
        className="page-card page-card--flat"
        extra={
          <Row gutter={8} align="middle">
            <Col>
              <Input placeholder="商品名称" value={keyword} onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={handleSearch} allowClear style={{ width: 160 }} />
            </Col>
            <Col>
              <Select style={{ width: 110 }} value={filterType} onChange={setFilterType} options={TYPE_OPTIONS} />
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
      >
        <Table columns={columns} dataSource={records} rowKey="id" loading={loading}
          pagination={{
            current: page, total, pageSize: 10, size: 'small',
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => { setPage(p); loadData({ page: p }) },
          }}
          size="middle" />
      </Card>

      <Modal title={modalType === 'in' ? '入库操作' : '出库操作'} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} okText="确认"
        okButtonProps={{ style: { background: modalType === 'in' ? '#52c41a' : '#ff4d4f', borderColor: 'transparent' } }}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="productId" label="商品" rules={[{ required: true }]}>
            <ProductSelect
              lazy
              onProductChange={(p) => {
                if (p) form.setFieldValue('_product', p)
              }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.productId !== cur?.productId || prev?._product !== cur?._product}>
            {({ getFieldValue }) => {
              const selectedProduct = getFieldValue('_product')
              const packageConfig = getProductPackageConfig(selectedProduct)

              if (packageConfig.unit && packageConfig.size > 0) {
                return (
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="packageQty" label={`包装数量（${packageConfig.unit}）`}>
                        <InputNumber style={{ width: '100%' }} min={0} step={QUANTITY_STEP} precision={QUANTITY_PRECISION} placeholder={`输入${packageConfig.unit}数`} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="looseQty" label={`散数量（${packageConfig.baseUnit || '散'}）`}>
                        <InputNumber style={{ width: '100%' }} min={0} step={QUANTITY_STEP} precision={QUANTITY_PRECISION} placeholder={`输入${packageConfig.baseUnit || '散'}数`} />
                      </Form.Item>
                    </Col>
                  </Row>
                )
              }

              return (
                <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={QUANTITY_STEP} step={QUANTITY_STEP} precision={QUANTITY_PRECISION} placeholder="输入数量" />
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item name="reason" label="调整原因" rules={[{ required: true }]}>
            <Select options={
              modalType === 'in'
                ? [{ value: 'opening', label: '期初建账' }, { value: 'surplus', label: '盘盈入库' }, { value: 'other', label: '其他入库' }]
                : [{ value: 'damage', label: '报损出库' }, { value: 'usage', label: '内部领用' }, { value: 'shortage', label: '盘亏出库' }, { value: 'other', label: '其他出库' }]
            } />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
