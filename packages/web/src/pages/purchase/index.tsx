import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { CheckCircleOutlined, DollarOutlined, DownOutlined, EditOutlined, PlusOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons'
import { PURCHASE_ORDER_STATUS } from '@/constants/order'
import { purchaseOrderApi } from '@/api/purchase'
import { paymentApi } from '@/api/payments'
import { supplierApi } from '@/api/suppliers'
import type { PurchaseOrder, Supplier } from '@/types'
import type { Dayjs } from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import { formatDateTime } from '@/utils/date'
import { PurchaseOrderDetailModal } from './components/PurchaseOrderDetailModal'
import { PurchaseReturnModal } from './components/PurchaseReturnModal'
import { PaymentModal } from './components/PaymentModal'
import { PurchaseOrderFormModal } from './components/PurchaseOrderFormModal'
import '@/styles/page.less'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: PURCHASE_ORDER_STATUS.DRAFT, label: '草稿' },
  { value: PURCHASE_ORDER_STATUS.STOCKED, label: '已入库' },
  { value: PURCHASE_ORDER_STATUS.DONE, label: '已完成' },
  { value: PURCHASE_ORDER_STATUS.RETURNED, label: '已退完' },
]

const STATUS_MAP: Record<string, { label: string; color: string; step: number }> = {
  [PURCHASE_ORDER_STATUS.DRAFT]: { label: '草稿', color: 'default', step: 0 },
  [PURCHASE_ORDER_STATUS.STOCKED]: { label: '已入库', color: 'cyan', step: 1 },
  [PURCHASE_ORDER_STATUS.DONE]: { label: '已完成', color: 'success', step: 2 },
  [PURCHASE_ORDER_STATUS.RETURNED]: { label: '已退完', color: 'purple', step: 2 },
}

export default function PurchasePage() {
  const [list, setList] = useState<PurchaseOrder[]>([])
  const [total, setTotal] = useState(0)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState<PurchaseOrder | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [returnRecord, setReturnRecord] = useState<PurchaseOrder | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnLoading, setReturnLoading] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payTarget, setPayTarget] = useState<{ id: number; orderNo: string; outstanding: number } | null>(null)
  const [preFillProduct, setPreFillProduct] = useState<{ productId: number; suggestQty: number } | null>(null)

  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()

  const buildParams = (overrides?: Record<string, unknown>) => ({
    keyword: keyword || undefined,
    status: filterStatus || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const loadData = async (overrides?: Record<string, unknown>) => {
    setLoading(true)
    const res = await purchaseOrderApi.list(buildParams(overrides))
    setList(res.list)
    setTotal(res.total ?? 0)
    setLoading(false)
  }

  const loadMeta = async () => {
    const supRes = await supplierApi.list()
    setSuppliers(supRes.list)
  }

  useEffect(() => { loadData(); loadMeta() }, [])

  /** 从库存预警「采购」跳转：?productId=&suggestQty= 打开新建单并预填商品行 */
  useEffect(() => {
    const rawPid = searchParams.get('productId')
    if (!rawPid) return

    const productId = Number(rawPid)
    const rawSuggest = searchParams.get('suggestQty')
    const suggestQty = rawSuggest != null && rawSuggest !== '' && Number.isFinite(Number(rawSuggest))
      ? Math.max(1, Math.floor(Number(rawSuggest)))
      : 1

    if (!Number.isInteger(productId) || productId < 1) {
      setSearchParams({}, { replace: true })
      return
    }

    setPreFillProduct({ productId, suggestQty })
    setEditId(null)
    setEditLoading(true)
    setCreateOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setKeyword(''); setFilterStatus(''); setDateRange(null); setPage(1)
    loadData({ keyword: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const handleOpenEdit = async (id: number) => {
    setEditId(id)
    setEditLoading(true)
    setCreateOpen(true)
    setEditLoading(false)
  }

  const handleOpenDetail = async (id: number) => {
    setDetailLoading(true)
    setDetailRecord(null)
    const order = await purchaseOrderApi.getById(id)
    setDetailRecord(order)
    setDetailLoading(false)
  }

  const handleStockIn = async (id: number) => {
    await purchaseOrderApi.stockIn(id, '采购到货入库')
    message.success('入库成功')
    loadData()
  }

  const handleOpenPay = (r: PurchaseOrder) => {
    const outstanding = r.totalAmount - (r.returnedAmount ?? 0) - r.paidAmount
    setPayTarget({ id: r.id, orderNo: r.orderNo, outstanding })
    setPayOpen(true)
  }

  const handlePay = async (values: { amount: number; method?: string; remark?: string }) => {
    if (!payTarget) return
    await paymentApi.create({
      type: 'pay',
      relatedType: 'purchase_order',
      relatedId: payTarget.id,
      amount: values.amount,
      method: values.method ?? undefined,
      remark: values.remark ?? undefined,
    })
    message.success('付款成功')
    setPayOpen(false)
    setPayTarget(null)
    loadData()
  }

  const handleDelete = async (id: number) => {
    await purchaseOrderApi.remove(id)
    message.success('删除成功')
    loadData()
  }

  const handleOpenReturn = async (id: number) => {
    setReturnLoading(true)
    const order = await purchaseOrderApi.getById(id)
    setReturnRecord(order)
    setReturnOpen(true)
    setReturnLoading(false)
  }

  const columns = [
    { title: '单号', dataIndex: 'orderNo', width: 160, render: (v: string) => <Text code>{v}</Text> },
    { title: '供应商', dataIndex: 'supplierName', width: 160 },
    {
      title: '总金额', dataIndex: 'totalAmount', width: 110, align: 'right' as const,
      render: (v: number) => <Text strong>¥{v.toLocaleString()}</Text>,
    },
    {
      title: '已退货', dataIndex: 'returnedAmount', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ color: '#722ed1' }}>¥{v.toLocaleString()}</Text> : '-',
    },
    {
      title: '已付', dataIndex: 'paidAmount', width: 110, align: 'right' as const,
      render: (v: number, r: PurchaseOrder) => {
        const effectiveTotal = r.totalAmount - r.returnedAmount
        return <Text style={{ color: v >= effectiveTotal ? '#52c41a' : '#faad14' }}>¥{v.toLocaleString()}</Text>
      },
    },
    {
      title: '未付', width: 110, align: 'right' as const,
      render: (_: unknown, r: PurchaseOrder) => {
        const debt = r.totalAmount - r.returnedAmount - r.paidAmount
        return debt > 0 ? <Text type="danger">¥{debt.toLocaleString()}</Text> : <Text type="success">已结清</Text>
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label}</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 160, render(_: unknown, r: PurchaseOrder) {
        return (
          <Text>
            {formatDateTime(r.createdAt)}
          </Text>
        )
      }
    },
    {
      title: '操作', width: 280, fixed: 'right' as const,
      render: (_: unknown, r: PurchaseOrder) => {
        const debt = r.totalAmount - (r.returnedAmount ?? 0) - r.paidAmount
        const draftMoreMenu = {
          items: [
            { key: 'edit', label: '编辑', icon: <EditOutlined /> },
            { key: 'delete', label: '删除', danger: true },
          ],
          onClick: ({ key }: { key: string }) => {
            if (key === 'edit') handleOpenEdit(r.id)
            if (key === 'delete') {
              Modal.confirm({
                title: '确定删除该草稿订单？',
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => handleDelete(r.id),
              })
            }
          },
        }
        return (
          <Space wrap>
            <Button type="link" size="small" onClick={() => handleOpenDetail(r.id)}>详情</Button>
            {r.status === PURCHASE_ORDER_STATUS.DRAFT && (
              <Popconfirm title="确认入库？" onConfirm={() => handleStockIn(r.id)}>
                <Button type="link" size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }}>入库</Button>
              </Popconfirm>
            )}
            {debt > 0 && (r.status === PURCHASE_ORDER_STATUS.STOCKED || r.status === PURCHASE_ORDER_STATUS.DONE) && (
              <Button type="link" size="small" icon={<DollarOutlined />} style={{ color: '#fa8c16' }} onClick={() => handleOpenPay(r)}>付款</Button>
            )}
            {(r.status === PURCHASE_ORDER_STATUS.STOCKED || r.status === PURCHASE_ORDER_STATUS.DONE) && (
              <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handleOpenReturn(r.id)}>退货</Button>
            )}
            {r.status === PURCHASE_ORDER_STATUS.DRAFT && (
              <Dropdown menu={draftMoreMenu} trigger={['click']}>
                <Button type="link" size="small">更多 <DownOutlined /></Button>
              </Dropdown>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="采购订单"
        description="先建采购、再入库、再付款。退货和供应商退款保留，但不干扰日常主流程。"
        className="page-header"
        extra={(
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditId(null)
              setEditLoading(false)
              setPreFillProduct(null)
              setCreateOpen(true)
            }}
            className="page-primary-button"
          >
            新建采购单
          </Button>
        )}
      />

      <Card className="page-card" style={{ marginBottom: 12 }} styles={{ body: { paddingBottom: 12 } }}>
        <Row gutter={12} align="middle">
          <Col flex="200px">
            <Input placeholder="供应商名/单号" value={keyword}
              onChange={(e) => setKeyword(e.target.value)} onPressEnter={handleSearch} allowClear />
          </Col>
          <Col flex="140px">
            <Select style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} />
          </Col>
          <Col flex="260px">
            <RangePicker style={{ width: '100%' }} value={dateRange}
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
      </Card>

      <Card className="page-card page-card--flat">
        <Table
          columns={columns}
          dataSource={list}
          rowKey={(r) => `${r.id}-${r.orderNo}`}
          loading={loading}
          scroll={{ x: 1160 }}
          pagination={{
            current: page, total, pageSize: 10,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => { setPage(p); loadData({ page: p }) },
          }} />
      </Card>

      <PurchaseOrderFormModal
        open={createOpen}
        editId={editId}
        loading={editLoading}
        suppliers={suppliers}
        onClose={() => { setCreateOpen(false); setEditId(null); setEditLoading(false) }}
        onSuccess={() => { setCreateOpen(false); setEditId(null); setEditLoading(false); loadData() }}
        initialValues={preFillProduct}
      />

      <PurchaseOrderDetailModal
        open={detailLoading || !!detailRecord}
        loading={detailLoading}
        record={detailRecord}
        statusMap={STATUS_MAP}
        onClose={() => setDetailRecord(null)}
      />

      <PurchaseReturnModal
        open={returnOpen}
        loading={returnLoading}
        record={returnRecord}
        onClose={() => { setReturnOpen(false); setReturnRecord(null) }}
        onSuccess={(order) => { setDetailRecord(order); loadData() }}
      />

      <PaymentModal
        open={payOpen}
        target={payTarget}
        onOk={handlePay}
        onCancel={() => { setPayOpen(false); setPayTarget(null) }}
      />
    </div>
  )
}
