import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  InputNumber, Card, Badge, Typography, Row, Col, List, Statistic, DatePicker, Tabs, Popconfirm, Switch, Segmented, Radio, message, Drawer, Descriptions, Spin,
} from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined, SearchOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { stockApi } from '@/api/stock'
import { productApi } from '@/api/products'
import type { InventoryCountRecord, Product, StockBatch, StockLocation, StockRecord, StockTransferRecord, StockWarning, Warehouse } from '@/types'
import { getBatchAutoPickPlaceholder, getBatchAutoPickStrategy } from '@/utils/batch-strategy'
import { formatCompositeQuantity, formatQuantityNumber, getProductPackageConfig } from '@/utils/packaging'
import { filterBatchSelectOption, makeBatchSelectOption, renderBatchSelectOption } from '@/components/BatchSelectOption'
import ProductSelect from '@/components/ProductSelect'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import { formatDate, formatDateTime } from '@/utils/date'
import '@/styles/page.less'

const { Text, Link } = Typography
const { RangePicker } = DatePicker
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4
const BATCH_STATUS_OPTIONS = [
  { value: 1, label: '可售' },
  { value: 2, label: '待检' },
  { value: 3, label: '不可售' },
]

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
  transfer_in: '调拨入库',
  transfer_out: '调拨出库',
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

function formatPlainValue(value: unknown, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function formatPackageText(packageUnit?: string | null, packageSize?: number | null, baseUnit?: string | null) {
  const size = Number(packageSize ?? 0)
  if (!packageUnit || size <= 0) return '-'
  return `1${packageUnit}=${formatQuantityNumber(size)}${baseUnit ?? ''}`
}

function formatMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : '-'
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

async function loadBatchSelectorSource(): Promise<StockBatch[]> {
  const pageSize = 200
  const first = await stockApi.batches({ page: 1, pageSize })
  const firstList = first.list ?? []
  const total = first.total ?? firstList.length
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return firstList

  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => stockApi.batches({ page: index + 2, pageSize })),
  )
  return firstList.concat(rest.flatMap((item) => item.list ?? []))
}

function buildSuggestedBatchNo(product: { id: number; name: string; sku?: string | null }) {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const code = (product.sku || `P${product.id}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || `P${product.id}`
  return `${date}-${code}-01`
}

export default function StockPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<StockRecord[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ todayIn: 0, todayOut: 0 })
  const [warnings, setWarnings] = useState<StockWarning[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseManageList, setWarehouseManageList] = useState<Warehouse[]>([])
  const [matrix, setMatrix] = useState<StockBatch[]>([])
  const [matrixTotal, setMatrixTotal] = useState(0)
  const [afterSaleBatches, setAfterSaleBatches] = useState<StockBatch[]>([])
  const [batchSelectSource, setBatchSelectSource] = useState<StockBatch[]>([])
  const [productDetailOpen, setProductDetailOpen] = useState(false)
  const [productDetailLoading, setProductDetailLoading] = useState(false)
  const [productDetail, setProductDetail] = useState<Product | null>(null)
  const [counts, setCounts] = useState<InventoryCountRecord[]>([])
  const [transfers, setTransfers] = useState<StockTransferRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'in' | 'out'>('in')
  const [countModalOpen, setCountModalOpen] = useState(false)
  const [countMode, setCountMode] = useState<'existing' | 'new'>('existing')
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false)
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [afterSaleModalOpen, setAfterSaleModalOpen] = useState(false)
  const [processingBatch, setProcessingBatch] = useState<StockBatch | null>(null)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null)
  const [form] = Form.useForm()
  const [countForm] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [warehouseForm] = Form.useForm()
  const [locationForm] = Form.useForm()
  const [afterSaleForm] = Form.useForm()

  const [keyword, setKeyword] = useState('')
  const [filterType, setFilterType] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const [matrixKeyword, setMatrixKeyword] = useState('')
  const [matrixWarehouseId, setMatrixWarehouseId] = useState<number | undefined>()
  const [matrixLocationId, setMatrixLocationId] = useState<number | undefined>()
  const [matrixStatus, setMatrixStatus] = useState<number | undefined>()
  const [matrixPage, setMatrixPage] = useState(1)
  const [matrixPageSize, setMatrixPageSize] = useState(20)

  const buildParams = (overrides?: Record<string, unknown>) => ({
    keyword: keyword || undefined,
    type: filterType || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const buildMatrixParams = (overrides?: Record<string, unknown>) => ({
    keyword: matrixKeyword || undefined,
    warehouseId: matrixWarehouseId,
    locationId: matrixLocationId,
    status: matrixStatus,
    page: matrixPage,
    pageSize: matrixPageSize,
    ...overrides,
  })

  const loadData = async (overrides?: Record<string, unknown>, matrixOverrides?: Record<string, unknown>) => {
    setLoading(true)
    const [res, statsRes, wa, warehouseRes, warehouseManageRes, matrixRes, pendingAfterSaleRes, unsellableAfterSaleRes, batchSelectorRes, countRes, transferRes] = await Promise.all([
      stockApi.records(buildParams(overrides)),
      stockApi.stats(),
      stockApi.warnings(),
      stockApi.warehouses(),
      stockApi.warehouses({ includeDisabled: true }),
      stockApi.matrix(buildMatrixParams(matrixOverrides)),
      stockApi.batches({ status: 2, availableOnly: '1', pageSize: 200 }),
      stockApi.batches({ status: 3, availableOnly: '1', pageSize: 200 }),
      loadBatchSelectorSource(),
      stockApi.counts(),
      stockApi.transfers(),
    ])
    setRecords(res.list)
    setTotal(res.total ?? 0)
    setStats(statsRes)
    setWarnings(wa)
    setWarehouses(warehouseRes)
    setWarehouseManageList(warehouseManageRes)
    setMatrix(matrixRes.list ?? [])
    setMatrixTotal(matrixRes.total ?? 0)
    setAfterSaleBatches([...(pendingAfterSaleRes.list ?? []), ...(unsellableAfterSaleRes.list ?? [])])
    setBatchSelectSource(batchSelectorRes)
    setCounts(countRes)
    setTransfers(transferRes)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setKeyword(''); setFilterType(''); setDateRange(null); setPage(1)
    loadData({ keyword: undefined, type: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const handleMatrixSearch = () => {
    setMatrixPage(1)
    loadData(undefined, { page: 1 })
  }

  const handleMatrixReset = () => {
    setMatrixKeyword('')
    setMatrixWarehouseId(undefined)
    setMatrixLocationId(undefined)
    setMatrixStatus(undefined)
    setMatrixPage(1)
    loadData(undefined, {
      keyword: undefined,
      warehouseId: undefined,
      locationId: undefined,
      status: undefined,
      page: 1,
    })
  }

  const getBatchStatusLabel = (status?: number) => BATCH_STATUS_OPTIONS.find((item) => item.value === status)?.label || '未知'

  const getBatchStatusColor = (status?: number) => {
    if (status === 1) return 'success'
    if (status === 2) return 'warning'
    return 'default'
  }

  const handleBatchStatusChange = async (batch: StockBatch, status: number) => {
    if (batch.status === status) return
    await stockApi.updateBatchStatus(batch.id, status)
    message.success(`批次已转为${getBatchStatusLabel(status)}`)
    loadData(undefined, { page: matrixPage, pageSize: matrixPageSize })
  }

  const openAfterSaleProcessModal = (batch: StockBatch) => {
    setProcessingBatch(batch)
    afterSaleForm.resetFields()
    afterSaleForm.setFieldsValue({
      result: 'sellable',
      batchMode: 'same_batch',
      locationMode: 'original',
      batchNo: batch.batchNo,
      warehouseId: batch.warehouseId,
      locationId: batch.locationId ?? undefined,
    })
    setAfterSaleModalOpen(true)
  }

  const handleAfterSaleProcess = async () => {
    if (!processingBatch) return
    const values = await afterSaleForm.validateFields()
    const useCustomLocation = values.result === 'sellable' && values.locationMode === 'custom'
    await stockApi.processAfterSaleBatch(processingBatch.id, {
      result: values.result,
      batchMode: values.batchMode,
      batchNo: values.batchMode === 'new_batch' ? values.batchNo?.trim() : undefined,
      warehouseId: useCustomLocation ? values.warehouseId : undefined,
      locationId: useCustomLocation ? values.locationId : undefined,
      remark: values.remark?.trim() || undefined,
    })
    message.success('售后库存已处理')
    setAfterSaleModalOpen(false)
    setProcessingBatch(null)
    afterSaleForm.resetFields()
    loadData(undefined, { page: matrixPage, pageSize: matrixPageSize })
  }

  const openModal = (type: 'in' | 'out') => {
    setModalType(type)
    form.resetFields()
    form.setFieldsValue({
      reason: type === 'in' ? 'surplus' : 'damage',
      _product: null,
      batchMode: 'new',
      warehouseId: undefined,
      locationId: undefined,
    })
    setModalOpen(true)
  }

  const openCountModal = (batch?: StockBatch) => {
    setCountMode('existing')
    countForm.resetFields()
    countForm.setFieldsValue(batch
      ? { batchId: batch.id, countedQty: batch.quantity, warehouseId: batch.warehouseId, locationId: batch.locationId ?? undefined }
      : { warehouseId: undefined, locationId: undefined })
    setCountModalOpen(true)
  }

  const openTransferModal = (batch?: StockBatch) => {
    transferForm.resetFields()
    transferForm.setFieldsValue(batch
      ? {
          batchId: batch.id,
          quantity: batch.quantity,
          fromWarehouseId: batch.warehouseId,
          fromLocationId: batch.locationId ?? undefined,
        }
      : {
          batchId: undefined,
          quantity: undefined,
          fromWarehouseId: undefined,
          fromLocationId: undefined,
          toWarehouseId: undefined,
          toLocationId: undefined,
        })
    setTransferModalOpen(true)
  }

  /** 从库存预警跳转采购页，按缺口预填建议采购数量 */
  const goPurchaseForWarning = (w: StockWarning) => {
    const gap = Math.max(1, Math.ceil(Number(w.safeStock ?? 0) - Number(w.availableStockQty ?? w.stockQty ?? 0)))
    navigate(`/purchase?productId=${w.productId}&suggestQty=${gap}`)
  }

  const openProductDetail = async (productId: number) => {
    setProductDetailOpen(true)
    setProductDetail(null)
    setProductDetailLoading(true)
    try {
      const detail = await productApi.get(productId)
      setProductDetail(detail)
    } catch {
      message.error('商品详情加载失败')
    } finally {
      setProductDetailLoading(false)
    }
  }

  const renderProductLink = (productId: number, productName?: string | null, productSku?: string | null) => (
    <Space direction="vertical" size={0}>
      <Link strong onClick={() => openProductDetail(productId)}>
        {productName || '-'}
      </Link>
      {productSku && <Text type="secondary" style={{ fontSize: 12 }}>{productSku}</Text>}
    </Space>
  )

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const { _product, batchMode, ...payload } = values
    if (modalType === 'in' && batchMode === 'existing') {
      const batch = batchSelectSource.find((item) => item.id === payload.batchId)
      payload.batchNo = undefined
      payload.warehouseId = batch?.warehouseId ?? payload.warehouseId
      payload.locationId = batch?.locationId ?? payload.locationId
    }
    if (modalType === 'in' && batchMode !== 'existing') {
      payload.batchId = undefined
      payload.batchNo = payload.batchNo?.trim()
    }
    if (modalType === 'out' && payload.batchId) {
      const batch = batchSelectSource.find((item) => item.id === payload.batchId)
      payload.warehouseId = batch?.warehouseId ?? payload.warehouseId
      payload.locationId = batch?.locationId ?? payload.locationId
    }
    if (modalType === 'in') await stockApi.in(payload)
    else await stockApi.out(payload)
    setModalOpen(false)
    loadData()
  }

  const handleCountSubmit = async () => {
    const values = await countForm.validateFields()
    if (countMode === 'new') {
      await stockApi.createCount({
        warehouseId: values.warehouseId,
        locationId: values.locationId,
        items: [{
          productId: values.productId,
          batchNo: values.batchNo?.trim(),
          countedQty: Number(values.countedQty ?? 0),
          remark: values.remark,
        }],
        remark: values.remark,
      })
      setCountModalOpen(false)
      countForm.resetFields()
      setCountMode('existing')
      loadData()
      return
    }

    const batch = batchSelectSource.find((item) => item.id === values.batchId) ?? matrix.find((item) => item.id === values.batchId)
    if (!batch) {
      message.error('盘点批次不存在，请刷新后重试')
      return
    }
    await stockApi.createCount({
      warehouseId: batch.warehouseId,
      locationId: batch.locationId ?? undefined,
      items: [{
        productId: batch.productId,
        batchId: batch.id,
        countedQty: Number(values.countedQty ?? 0),
        remark: values.remark,
      }],
      remark: values.remark,
    })
    setCountModalOpen(false)
    countForm.resetFields()
    setCountMode('existing')
    loadData()
  }

  const handleTransferSubmit = async () => {
    const values = await transferForm.validateFields()
    const batch = batchSelectSource.find((item) => item.id === values.batchId) ?? matrix.find((item) => item.id === values.batchId)
    if (!batch) return
    await stockApi.createTransfer({
      fromWarehouseId: batch.warehouseId,
      fromLocationId: batch.locationId ?? undefined,
      toWarehouseId: values.toWarehouseId,
      toLocationId: values.toLocationId,
      items: [{ batchId: batch.id, quantity: Number(values.quantity ?? 0), remark: values.remark }],
      remark: values.remark,
    })
    setTransferModalOpen(false)
    transferForm.resetFields()
    loadData()
  }

  const openWarehouseModal = (record?: Warehouse) => {
    setEditingWarehouse(record ?? null)
    warehouseForm.resetFields()
    warehouseForm.setFieldsValue(record ? {
      name: record.name,
      code: record.code,
      type: record.type,
      address: record.address,
      isDefault: record.isDefault === 1,
      remark: record.remark,
    } : { type: 'main', isDefault: false })
    setWarehouseModalOpen(true)
  }

  const handleWarehouseSubmit = async () => {
    const values = await warehouseForm.validateFields()
    const payload = {
      name: values.name?.trim(),
      code: values.code?.trim() || undefined,
      type: values.type?.trim() || undefined,
      address: values.address?.trim() || undefined,
      isDefault: Boolean(values.isDefault),
      remark: values.remark?.trim() || undefined,
    }
    if (editingWarehouse) {
      await stockApi.updateWarehouse(editingWarehouse.id, payload)
      message.success('仓库已更新')
    } else {
      await stockApi.createWarehouse(payload)
      message.success('仓库已新增')
    }
    setWarehouseModalOpen(false)
    setEditingWarehouse(null)
    warehouseForm.resetFields()
    loadData()
  }

  const openLocationModal = (warehouseId: number, record?: StockLocation) => {
    setEditingLocation(record ?? null)
    locationForm.resetFields()
    locationForm.setFieldsValue(record ? {
      warehouseId: record.warehouseId,
      name: record.name,
      code: record.code,
      remark: record.remark,
    } : { warehouseId })
    setLocationModalOpen(true)
  }

  const handleLocationSubmit = async () => {
    const values = await locationForm.validateFields()
    const payload = {
      warehouseId: values.warehouseId,
      name: values.name?.trim(),
      code: values.code?.trim() || undefined,
      remark: values.remark?.trim() || undefined,
    }
    if (editingLocation) {
      await stockApi.updateLocation(editingLocation.id, payload)
      message.success('仓位已更新')
    } else {
      await stockApi.createLocation(payload)
      message.success('仓位已新增')
    }
    setLocationModalOpen(false)
    setEditingLocation(null)
    locationForm.resetFields()
    loadData()
  }

  const handleToggleWarehouseStatus = async (record: Warehouse) => {
    await stockApi.updateWarehouseStatus(record.id, record.status === 1 ? 0 : 1)
    message.success(record.status === 1 ? '仓库已停用' : '仓库已启用')
    loadData()
  }

  const handleToggleLocationStatus = async (record: StockLocation) => {
    await stockApi.updateLocationStatus(record.id, record.status === 1 ? 0 : 1)
    message.success(record.status === 1 ? '仓位已停用' : '仓位已启用')
    loadData()
  }

  const sortedWarnings = [...warnings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
  })

  const warehouseOptions = warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))
  const locationOptions = (warehouseId?: number) => (
    warehouses.find((warehouse) => warehouse.id === warehouseId)?.locations ?? []
  ).map((location) => ({ label: location.name, value: location.id }))
  const matrixLocationOptions = locationOptions(matrixWarehouseId)
  const countBatchOptions = batchSelectSource
    .map((item) => makeBatchSelectOption(item, { showProductName: true }))
  const transferBatchOptions = batchSelectSource
    .filter((item) => Number(item.quantity ?? 0) > 0)
    .map((item) => makeBatchSelectOption(item, { showProductName: true }))

  const columns = [
    {
      title: '商品',
      dataIndex: 'productName',
      width: 180,
      render: (name: string, r: StockRecord) => renderProductLink(r.productId, name),
    },
    {
      title: '类型', dataIndex: 'type', width: 80,
      render: (v: string) => <Tag color={v === 'in' ? 'success' : 'error'}>{v === 'in' ? '↑ 入库' : '↓ 出库'}</Tag>,
    },
    { title: '原因', dataIndex: 'reason', width: 100, render: (v: string) => REASON_MAP[v] || v },
    { title: '批次', dataIndex: 'batchNo', width: 140, render: (v: string | null) => v || '-' },
    {
      title: '仓库/仓位',
      dataIndex: 'warehouseName',
      width: 150,
      render: (_: string, r: StockRecord) => `${r.warehouseName ?? '-'} / ${r.locationName ?? '-'}`,
    },
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

  const matrixColumns = [
    {
      title: '商品',
      dataIndex: 'productName',
      width: 190,
      render: (name: string, r: StockBatch) => renderProductLink(r.productId, name, r.productSku),
    },
    {
      title: '年份',
      dataIndex: 'year',
      width: 90,
      render: (v: number | null) => formatPlainValue(v),
    },
    {
      title: '规格',
      dataIndex: 'productSpec',
      width: 130,
      ellipsis: true,
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: '产地/季节',
      dataIndex: 'origin',
      width: 140,
      render: (_: string | null, r: StockBatch) => {
        const text = [r.origin, r.season].filter(Boolean).join(' / ')
        return text || '-'
      },
    },
    {
      title: '包装规格',
      dataIndex: 'packageUnit',
      width: 130,
      render: (_: string | null, r: StockBatch) => formatPackageText(r.packageUnit, r.packageSize, r.unit),
    },
    { title: '批次', dataIndex: 'batchNo', width: 150 },
    {
      title: '仓库/仓位',
      dataIndex: 'warehouseName',
      width: 160,
      render: (_: string, r: StockBatch) => `${r.warehouseName ?? '-'} / ${r.locationName ?? '-'}`,
    },
    {
      title: '可用库存',
      dataIndex: 'quantity',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: StockBatch) => <Text strong>{formatQuantityNumber(v)}{r.unit ?? ''}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: number) => <Tag color={getBatchStatusColor(status)}>{getBatchStatusLabel(status)}</Tag>,
    },
    {
      title: '到期日',
      dataIndex: 'expireAt',
      width: 130,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right' as const,
      render: (_: unknown, r: StockBatch) => (
        <Space>
          <Button size="small" onClick={() => {
            openCountModal(r)
          }}>盘点</Button>
          <Button size="small" onClick={() => {
            openTransferModal(r)
          }}>调拨</Button>
        </Space>
      ),
    },
  ]

  const afterSaleColumns = [
    {
      title: '商品',
      dataIndex: 'productName',
      width: 180,
      render: (name: string, r: StockBatch) => renderProductLink(r.productId, name, r.productSku),
    },
    { title: '批次', dataIndex: 'batchNo', width: 150 },
    {
      title: '当前仓库/仓位',
      dataIndex: 'warehouseName',
      width: 180,
      render: (_: string, r: StockBatch) => `${r.warehouseName ?? '-'} / ${r.locationName ?? '-'}`,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: StockBatch) => <Text strong>{formatQuantityNumber(v)}{r.unit ?? ''}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: number) => <Tag color={getBatchStatusColor(status)}>{getBatchStatusLabel(status)}</Tag>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string | null) => v || '-' },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, r: StockBatch) => (
        r.status === 2
          ? <Button size="small" type="primary" onClick={() => openAfterSaleProcessModal(r)}>处理</Button>
          : <Text type="secondary">已归档</Text>
      ),
    },
  ]

  const countColumns = [
    { title: '盘点单', dataIndex: 'countNo', width: 150 },
    { title: '仓库/仓位', dataIndex: 'warehouseName', render: (_: string, r: InventoryCountRecord) => `${r.warehouseName ?? '-'} / ${r.locationName ?? '-'}` },
    { title: '差异', dataIndex: 'totalDiffQty', width: 100, align: 'right' as const },
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => formatDateTime(v) },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ]

  const transferColumns = [
    { title: '调拨单', dataIndex: 'transferNo', width: 150 },
    { title: '调出', dataIndex: 'fromWarehouseName', render: (_: string, r: StockTransferRecord) => `${r.fromWarehouseName ?? '-'} / ${r.fromLocationName ?? '-'}` },
    { title: '调入', dataIndex: 'toWarehouseName', render: (_: string, r: StockTransferRecord) => `${r.toWarehouseName ?? '-'} / ${r.toLocationName ?? '-'}` },
    { title: '数量', dataIndex: 'totalQty', width: 100, align: 'right' as const },
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => formatDateTime(v) },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ]

  const locationColumns = [
    { title: '仓位编码', dataIndex: 'code', width: 140 },
    { title: '仓位名称', dataIndex: 'name', width: 180 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: number) => <Tag color={status === 1 ? 'success' : 'default'}>{status === 1 ? '启用' : '停用'}</Tag>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record: StockLocation) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openLocationModal(record.warehouseId, record)}>编辑</Button>
          <Popconfirm
            title={record.status === 1 ? '确认停用该仓位？' : '确认启用该仓位？'}
            onConfirm={() => handleToggleLocationStatus(record)}
          >
            <Button size="small" type="link" danger={record.status === 1}>{record.status === 1 ? '停用' : '启用'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const warehouseColumns = [
    { title: '仓库编码', dataIndex: 'code', width: 140 },
    {
      title: '仓库名称',
      dataIndex: 'name',
      width: 180,
      render: (name: string, record: Warehouse) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isDefault === 1 && <Tag color="green">默认</Tag>}
        </Space>
      ),
    },
    { title: '类型', dataIndex: 'type', width: 110 },
    { title: '地址', dataIndex: 'address', ellipsis: true, render: (v: string | null) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: number) => <Tag color={status === 1 ? 'success' : 'default'}>{status === 1 ? '启用' : '停用'}</Tag>,
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right' as const,
      render: (_: unknown, record: Warehouse) => (
        <Space wrap>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openWarehouseModal(record)}>编辑</Button>
          <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => openLocationModal(record.id)}>新增仓位</Button>
          <Popconfirm
            title={record.status === 1 ? '确认停用该仓库？' : '确认启用该仓库？'}
            onConfirm={() => handleToggleWarehouseStatus(record)}
          >
            <Button size="small" type="link" danger={record.status === 1}>{record.status === 1 ? '停用' : '启用'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const productDetailExt = productDetail?.extData ?? {}
  const productDetailSpec = productDetail?.spec ?? productDetailExt.spec
  const productDetailTeaType = productDetail?.teaType ?? productDetailExt.teaType
  const productDetailOrigin = productDetail?.origin ?? productDetailExt.origin
  const productDetailYear = productDetail?.year ?? productDetailExt.year
  const productDetailSeason = productDetail?.season ?? productDetailExt.season
  const productDetailBatchNo = productDetail?.batchNo ?? productDetailExt.batchNo
  const productDetailPackageUnit = productDetail?.packageUnit ?? (productDetailExt.packageUnit as string | undefined)
  const productDetailPackageSize = productDetail?.packageSize ?? Number(productDetailExt.packageSize ?? 0)

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
                {w.type === 'low_stock' && <Text type="secondary">库存 <Text type="danger">{w.availableStockQty ?? w.stockQty}</Text> / 安全库存 {w.safeStock}</Text>}
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

      <Tabs
        defaultActiveKey="matrix"
        items={[
          {
            key: 'matrix',
            label: '批次库存矩阵',
            children: (
              <Card
                className="page-card page-card--flat"
                title={<Space><span>批次库存矩阵</span><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>共 {matrixTotal} 个批次</Text></Space>}
                extra={(
                  <Space wrap>
                    <Input
                      placeholder="商品/批次/仓位"
                      value={matrixKeyword}
                      onChange={(e) => setMatrixKeyword(e.target.value)}
                      onPressEnter={handleMatrixSearch}
                      allowClear
                      style={{ width: 180 }}
                    />
                    <Select
                      allowClear
                      placeholder="仓库"
                      value={matrixWarehouseId}
                      options={warehouseOptions}
                      style={{ width: 130 }}
                      onChange={(value) => {
                        setMatrixWarehouseId(value)
                        setMatrixLocationId(undefined)
                      }}
                    />
                    <Select
                      allowClear
                      placeholder="仓位"
                      value={matrixLocationId}
                      options={matrixLocationOptions}
                      style={{ width: 130 }}
                      onChange={setMatrixLocationId}
                    />
                    <Select
                      allowClear
                      placeholder="库存状态"
                      value={matrixStatus}
                      options={BATCH_STATUS_OPTIONS}
                      style={{ width: 130 }}
                      onChange={setMatrixStatus}
                    />
                    <Button icon={<SearchOutlined />} onClick={handleMatrixSearch}>筛选</Button>
                    <Button onClick={handleMatrixReset}>重置</Button>
                    <Button onClick={() => openCountModal()}>新建盘点</Button>
                    <Button type="primary" onClick={() => openTransferModal()}>新建调拨</Button>
                  </Space>
                )}
              >
                <Table
                  columns={matrixColumns}
                  dataSource={matrix}
                  rowKey="id"
                  loading={loading}
                  pagination={{
                    current: matrixPage,
                    total: matrixTotal,
                    pageSize: matrixPageSize,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 个批次`,
                    onChange: (nextPage, nextPageSize) => {
                      setMatrixPage(nextPage)
                      setMatrixPageSize(nextPageSize)
                      loadData(undefined, { page: nextPage, pageSize: nextPageSize })
                    },
                  }}
                  size="middle"
                  scroll={{ x: 1380 }}
                />
              </Card>
            ),
          },
          {
            key: 'warehouses',
            label: '仓库仓位',
            children: (
              <Card
                className="page-card page-card--flat"
                title={<Space><span>仓库仓位</span><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>共 {warehouseManageList.length} 个仓库</Text></Space>}
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openWarehouseModal()}>新增仓库</Button>}
              >
                <Table
                  columns={warehouseColumns}
                  dataSource={warehouseManageList}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  scroll={{ x: 920 }}
                  expandable={{
                    expandedRowRender: (record) => (
                      <Table
                        columns={locationColumns}
                        dataSource={record.locations ?? []}
                        rowKey="id"
                        size="small"
                        pagination={false}
                      />
                    ),
                    rowExpandable: (record) => (record.locations?.length ?? 0) > 0,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'after-sale',
            label: '售后处理',
            children: (
              <Card
                className="page-card page-card--flat"
                title={<Space><span>售后处理台</span><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>共 {afterSaleBatches.length} 条</Text></Space>}
              >
                <Table
                  columns={afterSaleColumns}
                  dataSource={afterSaleBatches}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  size="middle"
                  scroll={{ x: 900 }}
                />
              </Card>
            ),
          },
          {
            key: 'records',
            label: '库存流水',
            children: (
              <Card
                title={<Space><span>库存流水</span><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>共 {total} 条</Text></Space>}
                className="page-card page-card--flat"
                extra={
                  <Row gutter={8} align="middle">
                    <Col>
                      <Input placeholder="商品/批次/仓位" value={keyword} onChange={(e) => setKeyword(e.target.value)}
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
                  size="middle" scroll={{ x: 980 }} />
              </Card>
            ),
          },
          {
            key: 'counts',
            label: '盘点单',
            children: (
              <Card className="page-card page-card--flat" title="盘点单" extra={<Button type="primary" onClick={() => openCountModal()}>新建盘点</Button>}>
                <Table columns={countColumns} dataSource={counts} rowKey="id" loading={loading} pagination={false} size="middle" />
              </Card>
            ),
          },
          {
            key: 'transfers',
            label: '调拨单',
            children: (
              <Card className="page-card page-card--flat" title="调拨单" extra={<Button type="primary" onClick={() => openTransferModal()}>新建调拨</Button>}>
                <Table columns={transferColumns} dataSource={transfers} rowKey="id" loading={loading} pagination={false} size="middle" />
              </Card>
            ),
          },
        ]}
      />

      <Modal title={modalType === 'in' ? '入库操作' : '出库操作'} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} okText="确认"
        okButtonProps={{ style: { background: modalType === 'in' ? '#52c41a' : '#ff4d4f', borderColor: 'transparent' } }}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="productId" label="商品" rules={[{ required: true }]}>
            <ProductSelect
              lazy
              onProductChange={(p) => {
                if (p) {
                  form.setFieldValue('_product', p)
                  form.setFieldValue('batchId', undefined)
                  form.setFieldValue('batchMode', 'new')
                  form.setFieldValue('batchNo', buildSuggestedBatchNo(p))
                }
              }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="warehouseId"
                label="仓库"
                rules={[{
                  validator: (_, value) => {
                    if (modalType === 'in' && form.getFieldValue('batchMode') !== 'existing' && !value) {
                      return Promise.reject(new Error('请选择仓库'))
                    }
                    return Promise.resolve()
                  },
                }]}
              >
                <Select
                  allowClear
                  options={warehouseOptions}
                  placeholder={modalType === 'out' ? '可选，用于限制出库范围' : '选择仓库'}
                  onChange={() => {
                    form.setFieldValue('locationId', undefined)
                    form.setFieldValue('batchId', undefined)
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.warehouseId !== cur.warehouseId}>
                {({ getFieldValue }) => (
                  <Form.Item
                    name="locationId"
                    label="仓位"
                    rules={[{
                      validator: (_, value) => {
                        if (modalType === 'in' && form.getFieldValue('batchMode') !== 'existing' && !value) {
                          return Promise.reject(new Error('请选择仓位'))
                        }
                        return Promise.resolve()
                      },
                    }]}
                  >
                    <Select
                      allowClear
                      options={locationOptions(getFieldValue('warehouseId'))}
                      placeholder={modalType === 'out' ? '可选，用于限制出库范围' : '选择仓位'}
                      onChange={() => {
                        form.setFieldValue('batchId', undefined)
                      }}
                    />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
          </Row>
          {modalType === 'in' ? (
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.productId !== cur.productId || prev.batchMode !== cur.batchMode || prev.warehouseId !== cur.warehouseId || prev.locationId !== cur.locationId}>
              {({ getFieldValue }) => {
                const productId = getFieldValue('productId')
                const warehouseId = getFieldValue('warehouseId')
                const locationId = getFieldValue('locationId')
                const mode = getFieldValue('batchMode') ?? 'new'
                const options = batchSelectSource
                  .filter((item) => item.productId === productId)
                  .filter((item) => !warehouseId || item.warehouseId === warehouseId)
                  .filter((item) => !locationId || item.locationId === locationId)
                const selectOptions = options.map((item) => ({
                  ...makeBatchSelectOption(item),
                }))
                return (
                  <>
                    <Form.Item name="batchMode" label="入库批次方式" initialValue="new">
                      <Radio.Group>
                        <Radio.Button value="new">新建批次</Radio.Button>
                        <Radio.Button value="existing" disabled={selectOptions.length === 0}>并入已有</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                    {mode === 'existing' ? (
                      <Form.Item name="batchId" label="已有批次" rules={[{ required: true, message: '请选择已有批次' }]}>
                        <Select
                          showSearch
                          filterOption={filterBatchSelectOption}
                          optionLabelProp="label"
                          optionRender={renderBatchSelectOption}
                          placeholder="搜索并选择已有批次"
                          options={selectOptions}
                          onChange={(batchId) => {
                            const batch = options.find((item) => item.id === batchId)
                            form.setFieldsValue({
                              warehouseId: batch?.warehouseId,
                              locationId: batch?.locationId ?? undefined,
                            })
                          }}
                        />
                      </Form.Item>
                    ) : (
                      <Form.Item name="batchNo" label="新批次号" rules={[{ required: true, message: '请输入批次号' }]}>
                        <Input placeholder="系统已建议，可按实际批次号修改" />
                      </Form.Item>
                    )}
                  </>
                )
              }}
            </Form.Item>
          ) : (
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.productId !== cur.productId || prev.warehouseId !== cur.warehouseId || prev.locationId !== cur.locationId}>
              {({ getFieldValue }) => {
                const productId = getFieldValue('productId')
                const selectedProduct = getFieldValue('_product')
                const warehouseId = getFieldValue('warehouseId')
                const locationId = getFieldValue('locationId')
                const options = batchSelectSource
                  .filter((item) => item.productId === productId)
                  .filter((item) => !warehouseId || item.warehouseId === warehouseId)
                  .filter((item) => !locationId || item.locationId === locationId)
                  .filter((item) => Number(item.quantity ?? 0) > 0)
                  .map((item) => makeBatchSelectOption(item))
                return (
                  <Form.Item
                    name="batchId"
                    label="出库批次"
                    rules={[
                      {
                        validator: (_, value) => {
                          if (getBatchAutoPickStrategy(selectedProduct) === 'manual_only' && !value) {
                            return Promise.reject(new Error('该商品必须手选批次'))
                          }
                          return Promise.resolve()
                        },
                      },
                    ]}
                  >
                    <Select
                      allowClear
                      showSearch
                      filterOption={filterBatchSelectOption}
                      optionLabelProp="label"
                      optionRender={renderBatchSelectOption}
                      placeholder={getBatchAutoPickPlaceholder(selectedProduct)}
                      options={options}
                      onChange={(batchId) => {
                        const batch = batchSelectSource.find((item) => item.id === batchId)
                        form.setFieldsValue({
                          warehouseId: batch?.warehouseId,
                          locationId: batch?.locationId ?? undefined,
                        })
                      }}
                    />
                  </Form.Item>
                )
              }}
            </Form.Item>
          )}
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

      <Modal
        title="新建盘点"
        open={countModalOpen}
        onOk={handleCountSubmit}
        onCancel={() => { setCountModalOpen(false); countForm.resetFields(); setCountMode('existing') }}
        okText="提交盘点"
      >
        <Form form={countForm} layout="vertical" style={{ marginTop: 16 }}>
          <Segmented
            block
            value={countMode}
            options={[
              { label: '已有批次', value: 'existing' },
              { label: '新发现批次', value: 'new' },
            ]}
            onChange={(value) => {
              const nextMode = value as 'existing' | 'new'
              setCountMode(nextMode)
              countForm.setFieldsValue({
                batchId: undefined,
                productId: undefined,
                batchNo: undefined,
                countedQty: undefined,
                warehouseId: undefined,
                locationId: undefined,
              })
            }}
            style={{ marginBottom: 16 }}
          />
          {countMode === 'existing' ? (
            <>
              <Form.Item name="batchId" label="盘点批次" rules={[{ required: true, message: '请选择批次' }]}>
                <Select
                  showSearch
                  filterOption={filterBatchSelectOption}
                  optionLabelProp="label"
                  optionRender={renderBatchSelectOption}
                  options={countBatchOptions}
                  placeholder="先选批次，系统自动带出仓库/仓位"
                  onChange={(batchId) => {
                    const batch = batchSelectSource.find((item) => item.id === batchId) ?? matrix.find((item) => item.id === batchId)
                    countForm.setFieldsValue({
                      warehouseId: batch?.warehouseId,
                      locationId: batch?.locationId ?? undefined,
                    })
                  }}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warehouseId" label="批次所在仓库">
                    <Select disabled options={warehouseOptions} placeholder="选择批次后自动填充" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.warehouseId !== cur.warehouseId}>
                    {({ getFieldValue }) => (
                      <Form.Item name="locationId" label="批次所在仓位">
                        <Select disabled options={locationOptions(getFieldValue('warehouseId'))} placeholder="选择批次后自动填充" />
                      </Form.Item>
                    )}
                  </Form.Item>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Form.Item name="productId" label="商品" rules={[{ required: true, message: '请选择商品' }]}>
                <ProductSelect
                  lazy
                  placeholder="选择盘点商品"
                  onProductChange={() => countForm.setFieldValue('batchNo', undefined)}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item name="batchNo" label="新批次号" rules={[{ required: true, message: '请输入新批次号' }]}>
                <Input placeholder="如：2026-CQ-001" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warehouseId" label="盘点仓库" rules={[{ required: true, message: '请选择盘点仓库' }]}>
                    <Select
                      allowClear
                      options={warehouseOptions}
                      onChange={() => countForm.setFieldValue('locationId', undefined)}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.warehouseId !== cur.warehouseId}>
                    {({ getFieldValue }) => (
                      <Form.Item name="locationId" label="盘点仓位" rules={[{ required: true, message: '请选择盘点仓位' }]}>
                        <Select allowClear options={locationOptions(getFieldValue('warehouseId'))} />
                      </Form.Item>
                    )}
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
          <Form.Item name="countedQty" label="实盘数量" rules={[{ required: true, message: '请输入实盘数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={QUANTITY_STEP} precision={QUANTITY_PRECISION} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="如：扫码盘点、月末盘点" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建调拨" open={transferModalOpen} onOk={handleTransferSubmit} onCancel={() => setTransferModalOpen(false)} okText="提交调拨">
        <Form form={transferForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="batchId" label="调拨批次" rules={[{ required: true, message: '请选择批次' }]}>
            <Select
              showSearch
              filterOption={filterBatchSelectOption}
              optionLabelProp="label"
              optionRender={renderBatchSelectOption}
              options={transferBatchOptions}
              placeholder="先选批次，系统自动带出调出仓库/仓位"
              onChange={(batchId) => {
                const batch = batchSelectSource.find((item) => item.id === batchId) ?? matrix.find((item) => item.id === batchId)
                transferForm.setFieldsValue({
                  fromWarehouseId: batch?.warehouseId,
                  fromLocationId: batch?.locationId ?? undefined,
                })
              }}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fromWarehouseId" label="调出仓库">
                <Select disabled options={warehouseOptions} placeholder="选择批次后自动填充" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.fromWarehouseId !== cur.fromWarehouseId}>
                {({ getFieldValue }) => (
                  <Form.Item name="fromLocationId" label="调出仓位">
                    <Select disabled options={locationOptions(getFieldValue('fromWarehouseId'))} placeholder="选择批次后自动填充" />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="quantity" label="调拨数量" rules={[{ required: true, message: '请输入调拨数量' }]}>
            <InputNumber style={{ width: '100%' }} min={QUANTITY_STEP} step={QUANTITY_STEP} precision={QUANTITY_PRECISION} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="toWarehouseId" label="调入仓库" rules={[{ required: true, message: '请选择调入仓库' }]}>
                <Select
                  allowClear
                  options={warehouseOptions}
                  onChange={() => transferForm.setFieldValue('toLocationId', undefined)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.toWarehouseId !== cur.toWarehouseId}>
                {({ getFieldValue }) => (
                  <Form.Item name="toLocationId" label="调入仓位" rules={[{ required: true, message: '请选择调入仓位' }]}>
                    <Select allowClear options={locationOptions(getFieldValue('toWarehouseId'))} />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="如：档口补货、仓间调拨" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingWarehouse ? '编辑仓库' : '新增仓库'}
        open={warehouseModalOpen}
        onOk={handleWarehouseSubmit}
        onCancel={() => { setWarehouseModalOpen(false); setEditingWarehouse(null); warehouseForm.resetFields() }}
        okText="保存"
      >
        <Form form={warehouseForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="仓库名称" rules={[{ required: true, message: '请输入仓库名称' }]}>
                <Input placeholder="如：主仓、档口仓" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="仓库编码">
                <Input placeholder="如：WH-MAIN" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="仓库类型">
                <Select options={[
                  { value: 'main', label: '主仓' },
                  { value: 'store', label: '门店/档口' },
                  { value: 'transit', label: '中转仓' },
                  { value: 'other', label: '其他' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isDefault" label="默认仓库" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="地址">
            <Input placeholder="仓库地址或档口位置" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="仓库说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingLocation ? '编辑仓位' : '新增仓位'}
        open={locationModalOpen}
        onOk={handleLocationSubmit}
        onCancel={() => { setLocationModalOpen(false); setEditingLocation(null); locationForm.resetFields() }}
        okText="保存"
      >
        <Form form={locationForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="warehouseId" label="所属仓库" rules={[{ required: true, message: '请选择所属仓库' }]}>
            <Select
              options={warehouseManageList
                .filter((item) => item.status === 1)
                .map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="仓位名称" rules={[{ required: true, message: '请输入仓位名称' }]}>
                <Input placeholder="如：A-01、冷藏柜 1" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="仓位编码">
                <Input placeholder="如：A-01" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="仓位说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="售后库存处理"
        open={afterSaleModalOpen}
        onOk={handleAfterSaleProcess}
        onCancel={() => { setAfterSaleModalOpen(false); setProcessingBatch(null); afterSaleForm.resetFields() }}
        okText="确认处理"
      >
        <Form form={afterSaleForm} layout="vertical" style={{ marginTop: 16 }}>
          {processingBatch && (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space direction="vertical" size={2}>
                <Text strong>{processingBatch.productName}</Text>
                <Text type="secondary">批次 {processingBatch.batchNo}｜{processingBatch.warehouseName}/{processingBatch.locationName ?? '-'}｜{formatQuantityNumber(processingBatch.quantity)}{processingBatch.unit ?? ''}</Text>
              </Space>
            </Card>
          )}
          <Form.Item name="result" label="处理结果" rules={[{ required: true, message: '请选择处理结果' }]}>
            <Radio.Group>
              <Radio.Button value="sellable">可继续销售</Radio.Button>
              <Radio.Button value="unsellable">不可售/报损</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => (
            prev.result !== cur.result ||
            prev.batchMode !== cur.batchMode ||
            prev.locationMode !== cur.locationMode ||
            prev.warehouseId !== cur.warehouseId
          )}>
            {({ getFieldValue }) => {
              const result = getFieldValue('result')
              const batchMode = getFieldValue('batchMode')
              const locationMode = getFieldValue('locationMode')
              if (result !== 'sellable') return null
              return (
                <>
                  <Form.Item name="batchMode" label="批次处理方式" rules={[{ required: true, message: '请选择批次处理方式' }]}>
                    <Radio.Group>
                      <Radio.Button value="same_batch">保留原批次</Radio.Button>
                      <Radio.Button value="new_batch">新建批次</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  {batchMode === 'new_batch' && (
                    <Form.Item name="batchNo" label="新批次号" rules={[{ required: true, message: '请输入新批次号' }]}>
                      <Input placeholder="如：REPACK-20260430-001" />
                    </Form.Item>
                  )}
                  <Form.Item name="locationMode" label="回库位置" rules={[{ required: true, message: '请选择回库位置' }]}>
                    <Radio.Group>
                      <Radio.Button value="original">退回到原始仓位</Radio.Button>
                      <Radio.Button value="custom">选择仓位</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  {locationMode === 'custom' ? (
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="warehouseId" label="目标仓库" rules={[{ required: true, message: '请选择目标仓库' }]}>
                          <Select options={warehouseOptions} onChange={() => afterSaleForm.setFieldValue('locationId', undefined)} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="locationId" label="目标仓位">
                          <Select allowClear options={locationOptions(getFieldValue('warehouseId'))} />
                        </Form.Item>
                      </Col>
                    </Row>
                  ) : (
                    processingBatch && (
                      <Text type="secondary">
                        默认退回到 {processingBatch.warehouseName}/{processingBatch.locationName ?? '默认仓位'}
                      </Text>
                    )
                  )}
                </>
              )
            }}
          </Form.Item>
          <Form.Item name="remark" label="处理说明">
            <Input.TextArea rows={3} placeholder="如：包装完好，可继续销售；受潮不可售" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={productDetail?.name ? `商品详情：${productDetail.name}` : '商品详情'}
        open={productDetailOpen}
        width={560}
        onClose={() => {
          setProductDetailOpen(false)
          setProductDetail(null)
        }}
      >
        <Spin spinning={productDetailLoading}>
          {productDetail ? (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="商品名称">{productDetail.name}</Descriptions.Item>
              <Descriptions.Item label="SKU">{formatPlainValue(productDetail.sku)}</Descriptions.Item>
              <Descriptions.Item label="分类">{formatPlainValue(productDetail.categoryName)}</Descriptions.Item>
              <Descriptions.Item label="茶类">{formatPlainValue(productDetailTeaType)}</Descriptions.Item>
              <Descriptions.Item label="年份">{formatPlainValue(productDetailYear)}</Descriptions.Item>
              <Descriptions.Item label="规格">{formatPlainValue(productDetailSpec)}</Descriptions.Item>
              <Descriptions.Item label="产地">{formatPlainValue(productDetailOrigin)}</Descriptions.Item>
              <Descriptions.Item label="季节">{formatPlainValue(productDetailSeason)}</Descriptions.Item>
              <Descriptions.Item label="商品批次">{formatPlainValue(productDetailBatchNo)}</Descriptions.Item>
              <Descriptions.Item label="包装规格">{formatPackageText(productDetailPackageUnit, productDetailPackageSize, productDetail.unit)}</Descriptions.Item>
              <Descriptions.Item label="可售库存">
                {formatQuantityNumber(productDetail.availableStockQty ?? productDetail.stockQty ?? 0)}{productDetail.unit ?? ''}
              </Descriptions.Item>
              <Descriptions.Item label="总库存">
                {formatQuantityNumber(productDetail.stockQty ?? 0)}{productDetail.unit ?? ''}
              </Descriptions.Item>
              <Descriptions.Item label="安全库存">
                {formatQuantityNumber(productDetail.safeStock ?? 0)}{productDetail.unit ?? ''}
              </Descriptions.Item>
              <Descriptions.Item label="销售价">{formatMoney(productDetail.sellPrice)}</Descriptions.Item>
              <Descriptions.Item label="采购价">{formatMoney(productDetail.costPrice)}</Descriptions.Item>
              <Descriptions.Item label="生产日期">{formatDate(productDetail.productionDate ?? productDetail.producedAt)}</Descriptions.Item>
              <Descriptions.Item label="保质期">
                {productDetail.shelfLife ? `${productDetail.shelfLife}天` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="存储条件">{formatPlainValue(productDetail.storageCond)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={productDetail.status === 1 ? 'success' : 'default'}>{productDetail.status === 1 ? '在售' : '停售'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="备注">{formatPlainValue(productDetail.remark)}</Descriptions.Item>
            </Descriptions>
          ) : (
            !productDetailLoading && <Text type="secondary">暂无商品详情</Text>
          )}
        </Spin>
      </Drawer>
    </div>
  )
}
