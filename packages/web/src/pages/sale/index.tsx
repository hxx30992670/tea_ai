import React, { useEffect, useMemo, useState } from 'react'
import { AI_BINDING_ERROR_CODES, AI_CAPABILITY_CODES, AI_KEY_INVALID_CODES, type AiCapabilityCode } from '@shared/constants'
import {
  buildRecognizeProductCatalog,
  collectRecognizedCustomerNames,
  normalizePriceToProductBaseUnit,
  normalizeRecognizedAmount,
  parsePossibleCustomerName,
  pickBestRecognizedProduct,
} from '@shared/ai/recognize-sale-order'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  DownOutlined,
  DollarOutlined,
  EditOutlined,
  PrinterOutlined,
  PlusOutlined,
  RedoOutlined,
  RollbackOutlined,
  RobotOutlined,
  SearchOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { saleOrderApi } from '@/api/sale'
import { systemApi } from '@/api/system'
import { aiApi } from '@/api/ai'
import { SALE_ORDER_STATUS } from '@/constants/order'
import { customerApi } from '@/api/customers'
import { productApi } from '@/api/products'
import { useAuthStore } from '@/store/auth'
import { canUseAiRecognize } from '@/lib/permissions'
import SaleOrderReceipt from '@/components/SaleOrderReceipt'
import ProductSelect from '@/components/ProductSelect'
import { SaleOrderFormModal } from './components/SaleOrderFormModal'
import { SaleOrderDetailModal } from './components/SaleOrderDetailModal'
import { SaleOrderReturnModal } from './components/SaleOrderReturnModal'
import { SaleOrderRefundModal } from './components/SaleOrderRefundModal'
import { SaleOrderExchangeModal } from './components/SaleOrderExchangeModal'
import { SaleOrderCollectModal } from './components/SaleOrderCollectModal'
import AiRecognizeLoading from '@/components/AiRecognizeLoading'
import AiBatchPreview from '@/components/AiBatchPreview'
import type { BatchRecognizeResult, BatchFormItem } from '@/components/AiBatchPreview'
import type { AiRecognizedSaleOrder } from '@/api/ai'
import type { Customer, Product, SaleOrder } from '@/types'
import { matchCustomerByRecognizedName } from '@/utils/customerMatching'
import { formatCompositeQuantity, formatQuantityNumber, getProductPackageConfig } from '@/utils/packaging'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import { formatDateTime } from '@/utils/date'
import '@/styles/page.less'
const { Title, Text } = Typography
const { RangePicker } = DatePicker

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: SALE_ORDER_STATUS.DRAFT, label: '草稿' },
  { value: SALE_ORDER_STATUS.SHIPPED, label: '已出货' },
  { value: 'processing', label: '售后处理中' },
  { value: SALE_ORDER_STATUS.DONE, label: '已完成' },
  { value: SALE_ORDER_STATUS.RETURNED, label: '已退完' },
]

const STATUS_MAP: Record<string, { label: string; color: string; step: number }> = {
  [SALE_ORDER_STATUS.DRAFT]: { label: '草稿', color: 'default', step: 0 },
  [SALE_ORDER_STATUS.SHIPPED]: { label: '已出货', color: 'blue', step: 1 },
  processing: { label: '售后处理中', color: 'orange', step: 1 },
  [SALE_ORDER_STATUS.DONE]: { label: '已完成', color: 'success', step: 2 },
  [SALE_ORDER_STATUS.RETURNED]: { label: '已退完', color: 'purple', step: 2 },
}

type RecognizedSaleItem = AiRecognizedSaleOrder['items'][number]

function resolveRecognizedCustomerId(recognized: AiRecognizedSaleOrder, customers: Customer[]) {
  for (const name of collectRecognizedCustomerNames(recognized)) {
    const matched = matchCustomerByRecognizedName(name, customers)
    if (matched) return matched.id
  }
  return undefined
}

function mapRecognizedItems(
  recognized: AiRecognizedSaleOrder,
  products: Product[],
  productMap: Map<number, Product>,
) {
  return recognized.items.map((item) => {
    const normalizedAmount = normalizeRecognizedAmount(item)
    const qUnit = normalizedAmount.quantityUnit
    const qty = normalizedAmount.quantity
    const matched = pickBestRecognizedProduct(item, products, productMap, qty, qUnit)

    const pkgUnit = matched?.packageUnit ?? ''
    const baseUnit = matched?.unit ?? ''

    const isPackageUnit = pkgUnit && (qUnit === pkgUnit || qUnit.includes(pkgUnit) || pkgUnit.includes(qUnit))
    const isBaseUnit = baseUnit && (qUnit === baseUnit || qUnit.includes(baseUnit) || baseUnit.includes(qUnit))

    const packageSize = matched?.packageSize ?? null
    const pkgQtyRaw = isPackageUnit ? qty : undefined
    const rawUnitPrice = item.subtotal != null && qty != null && qty > 0
      ? Number((item.subtotal / qty).toFixed(2))
      : (item.unitPrice ?? undefined)
    const unitPrice = rawUnitPrice != null
      ? normalizePriceToProductBaseUnit(rawUnitPrice, qUnit, matched)
      : undefined

    return {
      productId: matched?.id,
      ...(pkgUnit
        ? {
          packageQty: isPackageUnit ? qty : undefined,
          looseQty: isBaseUnit ? qty : undefined,
          ...(!isPackageUnit && !isBaseUnit && qty != null ? { packageQty: qty } : {}),
        }
        : { quantity: qty }),
      unitPrice: unitPrice ?? matched?.sellPrice ?? undefined,
    }
  })
}

export default function SalePage() {
  const role = useAuthStore((state) => state.user?.role)
  const allowAiRecognize = canUseAiRecognize(role)
  const [list, setList] = useState<SaleOrder[]>([])
  const [total, setTotal] = useState(0)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState<SaleOrder | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [returnRecord, setReturnRecord] = useState<SaleOrder | null>(null)
  const [refundRecord, setRefundRecord] = useState<SaleOrder | null>(null)
  const [exchangeRecord, setExchangeRecord] = useState<SaleOrder | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [afterSaleLoading, setAfterSaleLoading] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [collectTarget, setCollectTarget] = useState<{ id: number; orderNo: string; outstanding: number } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [printOrder, setPrintOrder] = useState<SaleOrder | null>(null)
  const [shopName, setShopName] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const [saleFormInitialValues, setSaleFormInitialValues] = useState<{
    customerId?: number
    items?: Array<{
      productId?: number
      quantity?: number
      packageQty?: number
      looseQty?: number
      unitPrice?: number
    }>
    remark?: string
    paidAmount?: number
    method?: string
  } | null>(null)

  const [aiRecognizing, setAiRecognizing] = useState(false)
  const [aiBatchCurrent, setAiBatchCurrent] = useState(0)
  const [aiBatchTotal, setAiBatchTotal] = useState(0)
  const aiFileInputRef = React.useRef<HTMLInputElement>(null)
  const aiBatchFileInputRef = React.useRef<HTMLInputElement>(null)

  const [batchResults, setBatchResults] = useState<BatchRecognizeResult[]>([])
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products])

  const renderPriceWithRef = (unitPrice: number, productId?: number) => {
    const sellPrice = productId ? productMap.get(productId)?.sellPrice : undefined
    if (sellPrice == null || unitPrice === sellPrice) {
      return `¥${unitPrice.toLocaleString()}`
    }
    const diff = unitPrice - sellPrice
    const color = diff > 0 ? '#52c41a' : '#ff4d4f'
    const arrow = diff > 0 ? '↑' : '↓'
    return (
      <div>
        <div>¥{unitPrice.toLocaleString()}</div>
        <div style={{ fontSize: 11, color, lineHeight: '16px' }}>
          {arrow}¥{Math.abs(diff).toLocaleString()}
          <span style={{ color: '#999', marginLeft: 4 }}>参考 ¥{sellPrice.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  const buildParams = (overrides?: Record<string, unknown>) => ({
    keyword: keyword || undefined,
    displayStatus: filterStatus || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const loadData = async (overrides?: Record<string, unknown>) => {
    setLoading(true)
    const res = await saleOrderApi.list(buildParams(overrides))
    setList(res.list)
    setTotal(res.total ?? 0)
    setLoading(false)
  }

  const loadMeta = async () => {
    const [custRes, prodRes, settingsRes] = await Promise.all([
      customerApi.list(),
      productApi.list({ pageSize: 100 }),
      systemApi.getSettings(),
    ])
    setCustomers(custRes.list)
    setProducts(prodRes.list)
    setShopName(settingsRes.shopName)
  }

  const handleOpenPrint = async (r: SaleOrder) => {
    const detail = await saleOrderApi.getById(r.id)
    setPrintOrder(detail)
    setPrintOpen(true)
  }

  useEffect(() => { loadData(); loadMeta() }, [])

  const handleSearch = () => { setPage(1); loadData({ page: 1 }) }

  const handleReset = () => {
    setKeyword(''); setFilterStatus(''); setDateRange(null); setPage(1)
    loadData({ keyword: undefined, displayStatus: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  /** 构建发给 AI 的商品目录 */
  const buildProductCatalog = () => buildRecognizeProductCatalog(products)

  /** 读取单个文件内容并校验大小 */
  const readFileContent = (file: File): Promise<{ content: string; isImage: boolean } | null> => {
    const isImage = file.type.startsWith('image/')
    const maxSize = isImage ? 5 * 1024 * 1024 : 500 * 1024
    if (file.size > maxSize) {
      void message.warning(`${file.name}: ${isImage ? '图片不能超过 5MB' : '文件不能超过 500KB'}`)
      return Promise.resolve(null)
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ content: reader.result as string, isImage })
      reader.onerror = reject
      if (isImage) reader.readAsDataURL(file)
      else reader.readAsText(file)
    })
  }

  /** 处理 AI 识别失败的提示逻辑 */
  const handleAiRecognizeError = (reason: string, code?: AiCapabilityCode) => {
    if (code === AI_CAPABILITY_CODES.QUOTA_EXCEEDED) {
      void message.warning(reason)
      return
    }

    if (code === AI_CAPABILITY_CODES.FEATURE_DISABLED) {
      void message.warning(`AI 功能未开通：${reason}`)
      return
    }

    if (code && AI_BINDING_ERROR_CODES.includes(code)) {
      void message.error(`AI 授权绑定异常：${reason}`)
      return
    }

    if (code && AI_KEY_INVALID_CODES.includes(code)) {
      void message.error(`AI 授权不可用：${reason}`)
      return
    }

    if (
      reason.includes('未配置')
      || reason.includes('服务实例标识')
      || reason.includes('模型 API Key')
      || reason.includes('Prompt 服务')
      || reason.includes('Agent 服务地址')
      || reason.includes('AI 授权 Key')
    ) {
      void message.warning(`AI 功能不可用：${reason}，请前往系统设置 > AI配置 完成配置`)
    } else {
      void message.error(reason)
    }
  }

  // ── 单张识别 ──────────────────────────────────────────────────────────
  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setAiRecognizing(true)
    setAiBatchTotal(0)
    try {
      const fileData = await readFileContent(file)
      if (!fileData) return

      const res = await aiApi.recognizeSaleOrder(
        { type: fileData.isImage ? 'image' : 'text', content: fileData.content, mimeType: file.type, filename: file.name },
        buildProductCatalog(),
      )

      if (!res.ok || !res.data) {
        handleAiRecognizeError(res.reason ?? '识别失败，请换一张更清晰的图片', res.code)
        return
      }

      const recognized = res.data
      const customerId = resolveRecognizedCustomerId(recognized, customers)

      const items = mapRecognizedItems(recognized, products, productMap)
      const unmatchedCount = items.filter((i) => !i.productId).length

      setSaleFormInitialValues({
        customerId,
        items: items.length > 0 ? items : [{}],
        remark: recognized.remark ?? undefined,
        paidAmount: undefined,
        method: recognized.paymentMethod ?? undefined,
      })
      setEditId(null)
      setCreateOpen(true)

      if (unmatchedCount > 0) {
        void message.warning(`已识别 ${recognized.items.length} 行商品，其中 ${unmatchedCount} 行未能匹配，请手动选择`)
      } else {
        void message.success(`已识别并填入 ${recognized.items.length} 行商品，请核对后提交`)
      }
    } catch {
      void message.error('识别出错，请重试')
    } finally {
      setAiRecognizing(false)
    }
  }

  // ── 批量识别 ──────────────────────────────────────────────────────────
  const handleAiBatchFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // 必须在清空 input 之前拷贝，因为 files 是 live 引用
    const fileList = Array.from(files)
    e.target.value = ''
    setAiRecognizing(true)
    setAiBatchTotal(fileList.length)
    setAiBatchCurrent(1)

    const catalog = buildProductCatalog()
    const results: BatchRecognizeResult[] = []

    for (let i = 0; i < fileList.length; i++) {
      setAiBatchCurrent(i + 1)
      const file = fileList[i]

      try {
        const fileData = await readFileContent(file)
        if (!fileData) {
          results.push({ index: i, filename: file.name, success: false, error: '文件格式或大小不符', items: [] })
          continue
        }

        const res = await aiApi.recognizeSaleOrder(
          { type: fileData.isImage ? 'image' : 'text', content: fileData.content, mimeType: file.type, filename: file.name },
          catalog,
        )

        if (!res.ok || !res.data) {
          results.push({ index: results.length, filename: file.name, success: false, error: res.reason ?? '识别失败', items: [] })
          continue
        }

        const recognized = res.data
        // 批量识别：每个 item 拆分为一条独立的订单记录（每行商品 = 一个散客订单）
        const allItems = mapRecognizedItems(recognized, products, productMap)
        const fallbackCustomerId = resolveRecognizedCustomerId(recognized, customers)
        for (let j = 0; j < allItems.length; j++) {
          const item = allItems[j]
          const currentRecognizedItem = recognized.items[j]
          const currentCustomerId = (() => {
            const itemCustomerName = currentRecognizedItem?.customerName ?? parsePossibleCustomerName(currentRecognizedItem?.lineText)
            if (itemCustomerName) {
              return matchCustomerByRecognizedName(itemCustomerName, customers)?.id
            }
            return fallbackCustomerId
          })()
          results.push({
            index: results.length,
            filename: allItems.length > 1 ? `${file.name} #${j + 1}` : file.name,
            success: true,
            customerId: currentCustomerId,
            customerName: currentRecognizedItem?.customerName ?? recognized.customerName,
            items: [item],
            remark: undefined,
            paidAmount: undefined,
            paymentMethod: recognized.paymentMethod,
          })
        }
      } catch {
        results.push({ index: results.length, filename: file.name, success: false, error: '识别出错', items: [] })
      }
    }

    setAiRecognizing(false)
    setBatchResults(results)
    setBatchPreviewOpen(true)

    const successCount = results.filter((r) => r.success).length
    if (successCount === 0) {
      void message.error('所有文件识别失败，请检查文件内容')
    } else {
      void message.success(`成功识别 ${successCount}/${results.length} 个文件`)
    }
  }

  // ── 批量预览操作 ──────────────────────────────────────────────────────
  const handleBatchRemove = (index: number) => {
    setBatchResults((prev) => prev.filter((r) => r.index !== index))
  }

  const handleBatchUpdate = (index: number, updates: Partial<BatchRecognizeResult>) => {
    setBatchResults((prev) => prev.map((r) => r.index === index ? { ...r, ...updates } : r))
  }

  const handleBatchUpdateItem = (orderIndex: number, itemIndex: number, updates: Partial<BatchFormItem>) => {
    setBatchResults((prev) => prev.map((r) => {
      if (r.index !== orderIndex) return r
      const newItems = [...r.items]
      newItems[itemIndex] = { ...newItems[itemIndex], ...updates }
      return { ...r, items: newItems }
    }))
  }

  const handleBatchSaveDraft = async () => {
    const successResults = batchResults.filter((r) => r.success && r.items.length > 0)
    if (successResults.length === 0) return

    setBatchSubmitting(true)
    let created = 0
    for (const r of successResults) {
      try {
        await saleOrderApi.create({
          customerId: r.customerId,
          items: r.items,
          remark: r.remark,
        } as Partial<SaleOrder>)
        created++
      } catch {
        // continue with others
      }
    }
    setBatchSubmitting(false)
    setBatchPreviewOpen(false)
    setBatchResults([])
    void message.success(`成功创建 ${created} 个草稿订单`)
    loadData()
  }

  const handleBatchQuickComplete = async () => {
    const successResults = batchResults.filter((r) => r.success && r.items.length > 0)
    if (successResults.length === 0) return

    setBatchSubmitting(true)
    let created = 0
    for (const r of successResults) {
      try {
        // 计算总金额作为 paidAmount
        const total = r.items.reduce((sum, item) => {
          const product = item.productId ? productMap.get(item.productId) : undefined
          const packageConfig = getProductPackageConfig(product)
          const qty = packageConfig.unit && packageConfig.size > 0
            ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
            : Number(item.quantity ?? 0)
          return sum + qty * Number(item.unitPrice ?? 0)
        }, 0)
        const paidAmount = r.paidAmount ?? total

        await saleOrderApi.quickComplete({
          customerId: r.customerId,
          items: r.items,
          remark: r.remark,
          paidAmount,
          method: r.paymentMethod,
        })
        created++
      } catch {
        // continue with others
      }
    }
    setBatchSubmitting(false)
    setBatchPreviewOpen(false)
    setBatchResults([])
    void message.success(`成功完成 ${created} 个销售订单`)
    loadData()
  }

  const handleOpenCreate = () => {
    setEditId(null)
    setSaleFormInitialValues(null)
    setCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setCreateOpen(false)
    setEditId(null)
    setSaleFormInitialValues(null)
  }

  const openAfterSaleRecord = async (id: number, type: 'detail' | 'return' | 'refund' | 'exchange') => {
    setAfterSaleLoading(true)
    const order = await saleOrderApi.getById(id)
    if (type === 'detail') setDetailRecord(order)
    if (type === 'return') {
      setReturnRecord(order)
      setReturnOpen(true)
    }
    if (type === 'refund') {
      setRefundRecord(order)
      setRefundOpen(true)
    }
    if (type === 'exchange') {
      setExchangeRecord(order)
      setExchangeOpen(true)
    }
    setAfterSaleLoading(false)
  }

  const handleOpenEdit = (id: number) => {
    setEditId(id)
    setSaleFormInitialValues(null)
    setCreateOpen(true)
  }

  const handleOpenCollect = (r: SaleOrder) => {
    const outstanding = r.totalAmount - (r.returnedAmount ?? 0) - r.receivedAmount
    setCollectTarget({ id: r.id, orderNo: r.orderNo, outstanding })
    setCollectOpen(true)
  }

  const handleDelete = async (id: number) => {
    await saleOrderApi.remove(id)
    message.success('删除成功')
    loadData()
  }

  const handleStockOut = async (id: number) => {
    await saleOrderApi.stockOut(id, '销售出库')
    message.success('出库成功')
    loadData()
  }

  const columns = [
    { title: '单号', dataIndex: 'orderNo', width: 160, render: (v: string) => <Text code>{v}</Text> },
    { title: '客户', dataIndex: 'customerName', width: 140, render: (v?: string) => v || <Text type="secondary">散客</Text> },
    { title: '已退货', dataIndex: 'returnedAmount', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? <Text style={{ color: '#722ed1' }}>¥{v.toLocaleString()}</Text> : '-' },
    {
      title: '净销售额', width: 120, align: 'right' as const,
      render: (_: unknown, r: SaleOrder) => <Text strong style={{ color: '#2D6A4F' }}>¥{(r.totalAmount - r.returnedAmount).toLocaleString()}</Text>,
    },
    {
      title: '已收款', dataIndex: 'receivedAmount', width: 110, align: 'right' as const,
      render: (v: number, r: SaleOrder) => {
        const effectiveTotal = r.totalAmount - r.returnedAmount
        return <Text style={{ color: v >= effectiveTotal ? '#52c41a' : '#faad14' }}>¥{v.toLocaleString()}</Text>
      },
    },
    {
      title: '欠款', width: 110, align: 'right' as const,
      render: (_: unknown, r: SaleOrder) => {
        const debt = r.totalAmount - r.returnedAmount - r.receivedAmount
        return debt > 0 ? <Text type="danger">¥{debt.toLocaleString()}</Text> : <Text type="success">已结清</Text>
      },
    },
    { title: '状态', dataIndex: 'displayStatus', width: 110, render: (_: unknown, row: SaleOrder) => <Tag color={STATUS_MAP[row.displayStatus || row.status]?.color}>{STATUS_MAP[row.displayStatus || row.status]?.label}</Tag> },
    { title: '下单时间', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
    {
      title: '操作', width: 360, fixed: 'right' as const,
      render: (_: unknown, r: SaleOrder) => {
        const debt = r.totalAmount - (r.returnedAmount ?? 0) - r.receivedAmount
        const afterSaleMenu = {
          items: [
            { key: 'return', label: '退货', icon: <RollbackOutlined /> },
            { key: 'refund', label: '仅退款', icon: <RedoOutlined /> },
            { key: 'exchange', label: '换货', icon: <SwapOutlined /> },
          ],
          onClick: ({ key }: { key: string }) => {
            if (key === 'return') openAfterSaleRecord(r.id, 'return')
            if (key === 'refund') openAfterSaleRecord(r.id, 'refund')
            if (key === 'exchange') openAfterSaleRecord(r.id, 'exchange')
          },
        }

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
            <Button type="link" size="small" onClick={() => openAfterSaleRecord(r.id, 'detail')}>详情</Button>
            {r.status !== SALE_ORDER_STATUS.DRAFT && (
              <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => handleOpenPrint(r)}>打印</Button>
            )}
            {r.status === SALE_ORDER_STATUS.DRAFT && <Popconfirm title="确认出库？" onConfirm={() => handleStockOut(r.id)}><Button type="link" size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }}>出库</Button></Popconfirm>}
            {debt > 0 && (r.status === SALE_ORDER_STATUS.SHIPPED || r.status === SALE_ORDER_STATUS.DONE) && (
              <Button type="link" size="small" icon={<DollarOutlined />} style={{ color: '#1677ff' }} onClick={() => handleOpenCollect(r)}>收款</Button>
            )}
            {(r.status === SALE_ORDER_STATUS.SHIPPED || r.status === SALE_ORDER_STATUS.DONE) && (
              <Dropdown menu={afterSaleMenu} trigger={['click']}>
                <Button type="link" size="small">售后 <DownOutlined /></Button>
              </Dropdown>
            )}
            {r.status === SALE_ORDER_STATUS.DRAFT && (
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
      <AiRecognizeLoading visible={allowAiRecognize && aiRecognizing} current={aiBatchCurrent} total={aiBatchTotal} />

      {/* 隐藏的 AI 识别文件选择框（单张） */}
      {allowAiRecognize && (
        <input
          ref={aiFileInputRef}
          type="file"
          accept="image/*,.txt,.md,.csv"
          style={{ display: 'none' }}
          onChange={(e) => void handleAiFileSelect(e)}
        />
      )}
      {/* 隐藏的 AI 识别文件选择框（批量） */}
      {allowAiRecognize && (
        <input
          ref={aiBatchFileInputRef}
          type="file"
          accept="image/*,.txt,.md,.csv"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void handleAiBatchFiles(e)}
        />
      )}

      <AiBatchPreview
        open={batchPreviewOpen}
        results={batchResults}
        products={products}
        customers={customers}
        loading={batchSubmitting}
        onClose={() => { setBatchPreviewOpen(false); setBatchResults([]) }}
        onRemove={handleBatchRemove}
        onUpdate={handleBatchUpdate}
        onUpdateItem={handleBatchUpdateItem}
        onSaveDraft={handleBatchSaveDraft}
        onQuickComplete={handleBatchQuickComplete}
      />

      <PageHeader
        title="销售订单"
        description={'先建单、再出库、再收款。售后统一从"售后"入口处理，适合散客和常规客户。'}
        className="page-header"
        extra={
          <Space>
            {allowAiRecognize && (
              <Dropdown
                menu={{
                  items: [
                    { key: 'single', label: '识别单张', onClick: () => aiFileInputRef.current?.click() },
                    { key: 'batch', label: '批量识别', onClick: () => aiBatchFileInputRef.current?.click() },
                  ],
                }}
                trigger={['click']}
              >
                <Button icon={<RobotOutlined />} loading={aiRecognizing}>
                  AI 识别录单 <DownOutlined />
                </Button>
              </Dropdown>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} className="page-primary-button">新建销售单</Button>
          </Space>
        }
      />

      <Card className="page-card" style={{ marginBottom: 12 }} styles={{ body: { paddingBottom: 12 } }}>
        <Row gutter={12} align="middle">
          <Col flex="200px"><Input placeholder="客户名/联系人/单号" value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={handleSearch} allowClear /></Col>
          <Col flex="140px"><Select style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} /></Col>
          <Col flex="260px"><RangePicker style={{ width: '100%' }} value={dateRange} onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)} /></Col>
          <Col><Space><Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>搜索</Button><Button onClick={handleReset}>重置</Button></Space></Col>
        </Row>
      </Card>

      <Card className="page-card page-card--flat">
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} scroll={{ x: 1460 }} pagination={{ current: page, total, pageSize: 10, showTotal: (t) => `共 ${t} 条`, onChange: (p) => { setPage(p); loadData({ page: p }) } }} />
      </Card>

      <SaleOrderFormModal
        open={createOpen}
        editId={editId}
        loading={editLoading}
        customers={customers}
        products={products}
        productMap={productMap}
        onClose={handleCloseCreate}
        onSuccess={loadData}
        initialValues={saleFormInitialValues}
      />

      <SaleOrderDetailModal
        open={detailLoading || !!detailRecord}
        order={detailRecord}
        loading={detailLoading || afterSaleLoading}
        productMap={productMap}
        onClose={() => setDetailRecord(null)}
      />

      <SaleOrderReturnModal
        open={returnOpen}
        order={returnRecord}
        loading={afterSaleLoading}
        productMap={productMap}
        onClose={() => { setReturnOpen(false); setReturnRecord(null) }}
        onSuccess={(order) => { setDetailRecord(order); loadData() }}
      />

      <SaleOrderRefundModal
        open={refundOpen}
        order={refundRecord}
        loading={afterSaleLoading}
        onClose={() => { setRefundOpen(false); setRefundRecord(null) }}
        onSuccess={(order) => { setDetailRecord(order); loadData() }}
      />

      <SaleOrderExchangeModal
        open={exchangeOpen}
        order={exchangeRecord}
        loading={afterSaleLoading}
        products={products}
        productMap={productMap}
        onClose={() => { setExchangeOpen(false); setExchangeRecord(null) }}
        onSuccess={(order) => { setDetailRecord(order); loadData() }}
      />

      <SaleOrderCollectModal
        open={collectOpen}
        target={collectTarget}
        onClose={() => { setCollectOpen(false); setCollectTarget(null) }}
        onSuccess={() => loadData()}
      />

      <SaleOrderReceipt
        open={printOpen}
        order={printOrder}
        shopName={shopName}
        onClose={() => { setPrintOpen(false); setPrintOrder(null) }}
      />
    </div>
  )
}
