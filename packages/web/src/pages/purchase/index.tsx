import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Steps,
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
import { productApi } from '@/api/products'
import type { Product, PurchaseOrder, Supplier } from '@/types'
import { formatCompositeQuantity, getProductPackageConfig } from '@/utils/packaging'
import ProductSelect from '@/components/ProductSelect'
import type { Dayjs } from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'

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
  const [products, setProducts] = useState<Product[]>([])
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
  const [form] = Form.useForm()
  const [payForm] = Form.useForm()
  const [returnForm] = Form.useForm()
  const quantities = Form.useWatch('quantities', returnForm) as Record<string, number> | undefined
  const packageQuantities = Form.useWatch('packageQuantities', returnForm) as Record<string, number> | undefined
  const looseQuantities = Form.useWatch('looseQuantities', returnForm) as Record<string, number> | undefined

  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products])

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
    const [supRes, prodRes] = await Promise.all([supplierApi.list(), productApi.list()])
    setSuppliers(supRes.list)
    setProducts(prodRes.list)
  }

  useEffect(() => { loadData(); loadMeta() }, [])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setKeyword(''); setFilterStatus(''); setDateRange(null); setPage(1)
    loadData({ keyword: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const handleCreate = async () => {
    const values = await form.validateFields()
    if (editId) {
      await purchaseOrderApi.update(editId, values)
    } else {
      await purchaseOrderApi.create(values)
    }
    setCreateOpen(false)
    setEditId(null)
    loadData()
  }

  const handleOpenEdit = async (id: number) => {
    setEditId(id)
    setEditLoading(true)
    setCreateOpen(true)
    const order = await purchaseOrderApi.getById(id)
    form.setFieldsValue({
      supplierId: order.supplierId,
      remark: order.remark,
      items: order.items?.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        packageQty: item.packageQty,
        looseQty: item.looseQty,
        unitPrice: item.unitPrice,
      })) ?? [{}],
    })
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
    payForm.setFieldsValue({ amount: outstanding, method: undefined, remark: undefined })
    setPayOpen(true)
  }

  const handlePay = async () => {
    if (!payTarget) return
    const values = await payForm.validateFields()
    await paymentApi.create({
      type: 'pay',
      relatedType: 'purchase_order',
      relatedId: payTarget.id,
      amount: values.amount,
      method: values.method ?? null,
      remark: values.remark ?? null,
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

    const quantitiesValue = Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0]))
    returnForm.setFieldsValue({
      quantities: quantitiesValue,
      packageQuantities: quantitiesValue,
      looseQuantities: quantitiesValue,
      refundAmount: 0,
      method: undefined,
      remark: undefined,
    })
  }

  const handleCreateReturn = async () => {
    if (!returnRecord) return
    const values = await returnForm.validateFields()
    const items = (returnRecord.items ?? [])
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Number(values.quantities?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number(values.packageQuantities?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number(values.looseQuantities?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0)

    if (items.length === 0) {
      message.error('请至少填写一条退货数量')
      return
    }

    const order = await purchaseOrderApi.createReturn(returnRecord.id, {
      items,
      refundAmount: values.refundAmount ?? 0,
      method: values.method,
      remark: values.remark,
    })
    message.success('采购退货处理成功')
    setReturnOpen(false)
    setReturnRecord(null)
    setDetailRecord(order)
    loadData()
  }

  const returnPreviewAmount = (returnRecord?.items ?? []).reduce((sum, item) => {
    const qty = item.packageUnit && item.packageSize
      ? Number(packageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) + Number(looseQuantities?.[String(item.id)] ?? 0)
      : Number(quantities?.[String(item.id)] ?? 0)
    return sum + qty * item.unitPrice
  }, 0)

  // 退货数量变化时自动回填退款金额（可手动覆盖）
  useEffect(() => {
    if (returnOpen) returnForm.setFieldValue('refundAmount', returnPreviewAmount)
  }, [returnPreviewAmount])

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
    { title: '创建时间', dataIndex: 'createdAt', width: 160 },
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

      <Modal
        title={editId ? '编辑采购订单' : '新建采购订单'}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setEditId(null) }}
        width={600}
        okText={editId ? '保存' : '保存草稿'}
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
        destroyOnHidden
      >
        <Spin spinning={editLoading}>
          <Form
            form={form}
            layout="vertical"
            style={{ marginTop: 16 }}
          >
            <Form.Item name="supplierId" label="供应商" rules={[{ required: true }]}> 
              <Select placeholder="选择供应商" showSearch optionFilterProp="label"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>商品明细</Text>
              <Form.List name="items" initialValue={[{}]}>
                {(fields, { add, remove }) => (
                  <div style={{ marginTop: 12 }}>
                    {fields.map(({ key, ...fieldProps }) => (
                      <Space key={`${key}-${fieldProps.name}`} style={{ width: '100%', marginBottom: 8 }} align="start">
                        <Form.Item key={`${key}-product`} {...fieldProps} name={[fieldProps.name, 'productId']} rules={[{ required: true, message: '请选择商品' }]} style={{ flex: 1, marginBottom: 0 }}>
                          <ProductSelect
                            products={products}
                            priceField="costPrice"
                            onProductChange={(p) => {
                              if (p) form.setFieldValue(['items', fieldProps.name, 'unitPrice'], p.costPrice)
                            }}
                          />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.items?.[fieldProps.name]?.productId !== cur?.items?.[fieldProps.name]?.productId}>
                          {({ getFieldValue }) => {
                            const selectedProductId = getFieldValue(['items', fieldProps.name, 'productId'])
                            const packageConfig = getProductPackageConfig(productMap.get(selectedProductId))
                            if (packageConfig.unit && packageConfig.size > 0) {
                              return (
                                <>
                                  <Form.Item key={`${key}-pkg`} {...fieldProps} name={[fieldProps.name, 'packageQty']} style={{ marginBottom: 0 }}>
                                    <InputNumber placeholder={packageConfig.unit} min={0} style={{ width: 82 }} />
                                  </Form.Item>
                                  <Form.Item key={`${key}-loose`} {...fieldProps} name={[fieldProps.name, 'looseQty']} style={{ marginBottom: 0 }}>
                                    <InputNumber placeholder={packageConfig.baseUnit || '散'} min={0} style={{ width: 82 }} />
                                  </Form.Item>
                                </>
                              )
                            }
                            return (
                              <Form.Item key={`${key}-qty`} {...fieldProps} name={[fieldProps.name, 'quantity']} rules={[{ required: true, message: '数量必填' }]} style={{ marginBottom: 0 }}>
                                <InputNumber placeholder="数量" min={1} style={{ width: 90 }} />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Form.Item key={`${key}-price`} {...fieldProps} name={[fieldProps.name, 'unitPrice']} rules={[{ required: true, message: '单价必填' }]} style={{ marginBottom: 0 }}>
                          <InputNumber placeholder="单价" prefix="¥" min={0} style={{ width: 120 }} />
                        </Form.Item>
                        {fields.length > 1 && <Button danger type="link" onClick={() => remove(fieldProps.name)}>删除</Button>}
                      </Space>
                    ))}
                    <Button type="dashed" block style={{ marginTop: 8 }} size="small" onClick={() => add({})}>+ 添加商品行</Button>
                  </div>
                )}
              </Form.List>
            </div>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>

      <Modal title={`采购单详情：${detailRecord?.orderNo ?? ''}`} open={detailLoading || !!detailRecord}
        footer={null} onCancel={() => setDetailRecord(null)} width={760} destroyOnHidden>
        <Spin spinning={detailLoading}>
          {detailRecord && (
            <>
              <Steps current={STATUS_MAP[detailRecord.status]?.step} style={{ margin: '20px 0' }} size="small"
                items={[{ title: '草稿' }, { title: '已入库' }, { title: '已结束' }]} />
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="供应商">{detailRecord.supplierName}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detailRecord.status]?.color}>{STATUS_MAP[detailRecord.status]?.label}</Tag></Descriptions.Item>
                <Descriptions.Item label="原采购金额">¥{detailRecord.totalAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="累计退货金额">¥{detailRecord.returnedAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="净采购金额">¥{(detailRecord.totalAmount - detailRecord.returnedAmount).toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="已付金额">¥{detailRecord.paidAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="未付金额" span={2}>
                  <Text type={detailRecord.totalAmount - detailRecord.returnedAmount - detailRecord.paidAmount > 0 ? 'danger' : 'success'}>
                    ¥{(detailRecord.totalAmount - detailRecord.returnedAmount - detailRecord.paidAmount).toLocaleString()}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
              </Descriptions>

              <Divider orientation="left">采购明细</Divider>
              {(detailRecord.items?.length ?? 0) > 0 ? (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={detailRecord.items}
                  columns={[
                    { title: '商品', dataIndex: 'productName' },
                    { title: '采购数量', width: 120, render: (_: unknown, row) => formatCompositeQuantity(row) },
                    { title: '已退数量', dataIndex: 'returnedQuantity', width: 100, render: (v: number) => v || 0 },
                    { title: '可退数量', dataIndex: 'remainingQuantity', width: 100, render: (v: number) => v || 0 },
                    { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` },
                    { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` },
                  ]}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购明细" />}

              <Divider orientation="left">退货记录</Divider>
              {(detailRecord.returns?.length ?? 0) > 0 ? detailRecord.returns?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.returnNo}</Text>
                      <Text type="secondary">退货金额 ¥{item.totalAmount.toLocaleString()}</Text>
                      <Text type="secondary">供应商退款 ¥{item.refundAmount.toLocaleString()}</Text>
                      <Text type="secondary">{item.createdAt}</Text>
                    </Space>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={item.items ?? []}
                      columns={[
                        { title: '商品', dataIndex: 'productName' },
                        { title: '退货数量', width: 120, render: (_: unknown, row) => formatCompositeQuantity(row) },
                        { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` },
                        { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` },
                      ]}
                    />
                  </Space>
                </Card>
              )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无退货记录" />}
            </>
          )}
        </Spin>
      </Modal>

      <Modal title={`采购退货：${returnRecord?.orderNo ?? ''}`} open={returnOpen}
        onOk={handleCreateReturn}
        onCancel={() => { setReturnOpen(false); setReturnRecord(null) }}
        width={700}
        okText="确认退货"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
        destroyOnHidden>
        <Spin spinning={returnLoading}>
          {returnRecord && (
            <>
              <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
                <Space direction="vertical" size={6}>
                  <Text>供应商：{returnRecord.supplierName}</Text>
                  <Text>原采购金额：¥{returnRecord.totalAmount.toLocaleString()}</Text>
                  <Text>当前已付款：¥{returnRecord.paidAmount.toLocaleString()}</Text>
                  <Text>累计已退货：¥{returnRecord.returnedAmount.toLocaleString()}</Text>
                  <Text strong>本次退货预估金额：¥{returnPreviewAmount.toLocaleString()}</Text>
                </Space>
              </Card>
              <Form form={returnForm} layout="vertical">
                <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>填写每个商品的本次退货数量，不能超过可退数量</Text>
                  <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                    {(returnRecord.items ?? []).map((item) => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 180px', gap: 12, alignItems: 'center' }}>
                        <div>
                          <Text strong>{item.productName}</Text>
                          <div><Text type="secondary">已采 {formatCompositeQuantity(item)}，可退 {item.remainingQuantity ?? 0}{item.unit || ''}</Text></div>
                        </div>
                        <Text>¥{item.unitPrice.toLocaleString()}</Text>
                        <Text type="secondary">可退 {item.remainingQuantity ?? 0}</Text>
                        {item.packageUnit && item.packageSize ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Form.Item name={['packageQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Text type="secondary" style={{ flexShrink: 0 }}>{item.packageUnit || '包装'}</Text>
                            <Form.Item name={['looseQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Text type="secondary" style={{ flexShrink: 0 }}>{item.unit || '散'}</Text>
                          </div>
                        ) : (
                          <Form.Item name={['quantities', String(item.id)]} style={{ marginBottom: 0 }}>
                            <InputNumber min={0} max={item.remainingQuantity ?? 0} style={{ width: '100%' }} />
                          </Form.Item>
                        )}
                      </div>
                    ))}
                  </Space>
                </div>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="refundAmount" label="本次供应商退款金额">
                      <InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => returnForm.validateFields(['method'])} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="method"
                      label="退款方式"
                      dependencies={['refundAmount']}
                      rules={[{ validator(_, value) {
                        const amount = Number(returnForm.getFieldValue('refundAmount') ?? 0)
                        if (amount > 0 && !value) return Promise.reject(new Error('有退款金额时必须选择退款方式'))
                        return Promise.resolve()
                      } }]}
                    >
                      <Select allowClear placeholder="请选择退款方式" options={['现金', '微信', '支付宝', '转账', '其他'].map((m) => ({ value: m, label: m }))} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="remark" label="退货备注">
                  <Input.TextArea rows={3} placeholder="比如：来货受潮，退回 2 包并申请供应商转账退款" />
                </Form.Item>
              </Form>
            </>
          )}
        </Spin>
      </Modal>

      <Modal
        title={<Space><DollarOutlined style={{ color: '#fa8c16' }} /><span>付款：{payTarget?.orderNo}</span></Space>}
        open={payOpen}
        onOk={handlePay}
        onCancel={() => { setPayOpen(false); setPayTarget(null) }}
        okText="确认付款"
        okButtonProps={{ style: { background: '#fa8c16', borderColor: '#fa8c16' } }}
        width={400}
        destroyOnHidden
      >
        {payTarget && (
          <Form form={payForm} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ background: '#fff7e6', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>当前未付款：</Text>
              <Text strong style={{ color: '#fa8c16', fontSize: 16 }}> ¥{payTarget.outstanding.toLocaleString()}</Text>
            </div>
            <Form.Item name="amount" label="本次付款金额" rules={[{ required: true, message: '请填写付款金额' }]}>
              <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => payForm.validateFields(['method'])} />
            </Form.Item>
            <Form.Item
              name="method"
              label="支付方式"
              dependencies={['amount']}
              rules={[{ validator(_, value) {
                const amount = Number(payForm.getFieldValue('amount') ?? 0)
                if (amount > 0 && !value) return Promise.reject(new Error('有付款金额时必须选择支付方式'))
                return Promise.resolve()
              } }]}
            >
              <Select placeholder="请选择支付方式" allowClear
                options={['现金', '微信', '支付宝', '转账', '其他'].map((m) => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} placeholder="备注信息（选填）" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  )
}
