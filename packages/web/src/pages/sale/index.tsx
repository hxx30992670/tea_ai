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
  List,
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
import { paymentApi } from '@/api/payments'
import { systemApi } from '@/api/system'
import { aiApi } from '@/api/ai'
import { AFTER_SALE_REASON_LABELS, AFTER_SALE_REASON_OPTIONS } from '@/constants/after-sale'
import { SALE_ORDER_STATUS } from '@/constants/order'
import { customerApi } from '@/api/customers'
import { productApi } from '@/api/products'
import SaleOrderReceipt from '@/components/SaleOrderReceipt'
import ProductSelect from '@/components/ProductSelect'
import AiRecognizeLoading from '@/components/AiRecognizeLoading'
import type { Category, Customer, Product, SaleOrder } from '@/types'
import { matchCustomerByRecognizedName } from '@/utils/customerMatching'
import { formatCompositeQuantity, getProductPackageConfig } from '@/utils/packaging'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'
const { Title, Text } = Typography
const { RangePicker } = DatePicker

const PAYMENT_METHOD_OPTIONS = ['现金', '微信', '支付宝', '转账', '赊账', '其他'].map((m) => ({ value: m, label: m }))

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: SALE_ORDER_STATUS.DRAFT, label: '草稿' },
  { value: SALE_ORDER_STATUS.SHIPPED, label: '已出货' },
  { value: SALE_ORDER_STATUS.DONE, label: '已完成' },
  { value: SALE_ORDER_STATUS.RETURNED, label: '已退完' },
]

const STATUS_MAP: Record<string, { label: string; color: string; step: number }> = {
  [SALE_ORDER_STATUS.DRAFT]: { label: '草稿', color: 'default', step: 0 },
  [SALE_ORDER_STATUS.SHIPPED]: { label: '已出货', color: 'blue', step: 1 },
  [SALE_ORDER_STATUS.DONE]: { label: '已完成', color: 'success', step: 2 },
  [SALE_ORDER_STATUS.RETURNED]: { label: '已退完', color: 'purple', step: 2 },
}

export default function SalePage() {
  const [list, setList] = useState<SaleOrder[]>([])
  const [total, setTotal] = useState(0)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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
  const [collectForm] = Form.useForm()
  const [returnForm] = Form.useForm()
  const [refundForm] = Form.useForm()
  const [exchangeForm] = Form.useForm()

  const returnQuantities = Form.useWatch('quantities', returnForm) as Record<string, number> | undefined
  const returnPackageQuantities = Form.useWatch('packageQuantities', returnForm) as Record<string, number> | undefined
  const returnLooseQuantities = Form.useWatch('looseQuantities', returnForm) as Record<string, number> | undefined
  const exchangeReturnQuantities = Form.useWatch('returnQuantities', exchangeForm) as Record<string, number> | undefined
  const exchangeReturnPackageQuantities = Form.useWatch('returnPackageQuantities', exchangeForm) as Record<string, number> | undefined
  const exchangeReturnLooseQuantities = Form.useWatch('returnLooseQuantities', exchangeForm) as Record<string, number> | undefined
  const exchangeItems = Form.useWatch('exchangeItems', exchangeForm) as Array<{ productId?: number; quantity?: number; packageQty?: number; looseQty?: number; unitPrice?: number }> | undefined
  const saleItems = Form.useWatch('items', form) as Array<{ productId?: number; quantity?: number; packageQty?: number; looseQty?: number; unitPrice?: number }> | undefined

  const [aiRecognizing, setAiRecognizing] = useState(false)
  const aiFileInputRef = React.useRef<HTMLInputElement>(null)
  const autoPaidAmountRef = React.useRef<number | undefined>(undefined)
  const syncingPaidAmountRef = React.useRef(false)
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products])
  const categoryNameMap = useMemo(() => {
    const map = new Map<number, string>()
    const flatten = (cats: Category[]) => {
      for (const c of cats) {
        map.set(c.id, c.name)
        if (c.children?.length) flatten(c.children)
      }
    }
    flatten(categories)
    return map
  }, [categories])

  const buildParams = (overrides?: Record<string, unknown>) => ({
    keyword: keyword || undefined,
    status: filterStatus || undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    page,
    pageSize: 10,
    ...overrides,
  })

  const getSaleItemQuantity = (item: { productId?: number; quantity?: number; packageQty?: number; looseQty?: number }) => {
    const product = item.productId ? productMap.get(item.productId) : undefined
    const packageConfig = getProductPackageConfig(product)
    if (packageConfig.unit && packageConfig.size > 0) {
      return Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
    }
    return Number(item.quantity ?? 0)
  }

  const calculateSaleItemsTotal = (items?: Array<{ productId?: number; quantity?: number; packageQty?: number; looseQty?: number; unitPrice?: number }>) => {
    const total = (items ?? []).reduce((sum, item) => sum + getSaleItemQuantity(item) * Number(item.unitPrice ?? 0), 0)
    return total > 0 ? Number(total.toFixed(2)) : undefined
  }

  useEffect(() => {
    if (!createOpen || editId || paidAmountTouched) {
      return
    }

    const nextPaidAmount = calculateSaleItemsTotal(saleItems)
    if (nextPaidAmount === autoPaidAmountRef.current) {
      return
    }

    syncingPaidAmountRef.current = true
    autoPaidAmountRef.current = nextPaidAmount
    form.setFieldValue('paidAmount', nextPaidAmount)
    void form.validateFields(['method']).catch(() => {})
    queueMicrotask(() => {
      syncingPaidAmountRef.current = false
    })
  }, [createOpen, editId, paidAmountTouched, saleItems, form])

  const loadData = async (overrides?: Record<string, unknown>) => {
    setLoading(true)
    const res = await saleOrderApi.list(buildParams(overrides))
    setList(res.list)
    setTotal(res.total ?? 0)
    setLoading(false)
  }

  const loadMeta = async () => {
    const [custRes, prodRes, settingsRes, catRes] = await Promise.all([
      customerApi.list(),
      productApi.list(),
      systemApi.getSettings(),
      productApi.categories(),
    ])
    setCustomers(custRes.list)
    setProducts(prodRes.list)
    setShopName(settingsRes.shopName)
    setCategories(catRes)
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
    loadData({ keyword: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })
  }

  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isImage = file.type.startsWith('image/')
    const maxSize = isImage ? 5 * 1024 * 1024 : 500 * 1024
    if (file.size > maxSize) {
      void message.warning(isImage ? '图片不能超过 5MB' : '文件不能超过 500KB')
      return
    }

    setAiRecognizing(true)
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        if (isImage) reader.readAsDataURL(file)
        else reader.readAsText(file)
      })

      // 把商品目录传给 AI（过滤掉 null/undefined，避免后端校验失败）
      const productCatalog = products.map((p) => ({
        id: p.id,
        name: p.name,
        ...(p.teaType ? { teaType: p.teaType } : {}),
        ...(p.year != null ? { year: String(p.year) } : {}),
        ...(p.spec ? { spec: p.spec } : {}),
        ...(p.sellPrice != null ? { sellPrice: p.sellPrice } : {}),
        ...(p.unit ? { unit: p.unit } : {}),
        ...(p.packageUnit ? { packageUnit: p.packageUnit } : {}),
      }))

      const res = await aiApi.recognizeSaleOrder(
        { type: isImage ? 'image' : 'text', content, mimeType: file.type, filename: file.name },
        productCatalog,
      )

      if (!res.ok || !res.data) {
        const reason = res.reason ?? '识别失败，请换一张更清晰的图片'
        // AI 未开通/未授权时给出和 AI 助手一致的提示
        if (reason.includes('禁用') || reason.includes('授权') || reason.includes('apiKey') || reason.includes('配置')) {
          void message.warning(`AI 功能不可用：${reason}，请前往系统设置 > AI配置 完成配置`)
        } else {
          void message.error(reason)
        }
        return
      }

      const recognized = res.data

      // ── 匹配客户 ──────────────────────────────────────────────────────
      let customerId: number | undefined
      if (recognized.customerName) {
        const matched = matchCustomerByRecognizedName(recognized.customerName, customers)
        customerId = matched?.id
      }

      // ── 构建商品行（AI 已匹配 productId，按单位填对字段）────────────────
      const items = recognized.items.map((item) => {
        // 优先用 AI 返回的 productId
        let matched = item.productId != null ? productMap.get(item.productId) : undefined

        // 如果 AI 给的 productId 对应商品单位与识别单位不符，重新按单位+名称匹配
        const qUnit = item.quantityUnit ?? ''
        if (matched && qUnit) {
          const unitMatch = (p: typeof matched) =>
            p && (qUnit === p.unit || qUnit === p.packageUnit ||
              (p.unit && p.unit.includes(qUnit)) || (p.packageUnit && p.packageUnit.includes(qUnit)) ||
              (qUnit && p.unit && qUnit.includes(p.unit)) || (qUnit && p.packageUnit && qUnit.includes(p.packageUnit)))
          if (!unitMatch(matched)) {
            // 单位不符，重新从同名商品里找单位匹配的
            const sameNameProducts = products.filter(
              (p) => item.productName.includes(p.name) || p.name.includes(item.productName),
            )
            const unitMatched = sameNameProducts.find(unitMatch)
            if (unitMatched) matched = unitMatched
          }
        }

        // 还是没匹配，模糊匹配名称
        if (!matched && item.productName) {
          matched = products.find((p) => item.productName.includes(p.name) || p.name.includes(item.productName))
        }

        const qty = item.quantity ?? undefined
        const pkgUnit = matched?.packageUnit ?? ''
        const baseUnit = matched?.unit ?? ''

        // 判断识别到的数量单位属于包装单位还是散装单位
        const isPackageUnit = pkgUnit && (qUnit === pkgUnit || qUnit.includes(pkgUnit) || pkgUnit.includes(qUnit))
        const isBaseUnit = baseUnit && (qUnit === baseUnit || qUnit.includes(baseUnit) || baseUnit.includes(qUnit))

        // 包装单位数量，若为小数（如 0.5 斤），换算成基准单位直接填 looseQty
        const packageSize = matched?.packageSize ?? null
        const pkgQtyRaw = isPackageUnit ? qty : undefined
        const pkgQtyIsDecimal = pkgQtyRaw != null && !Number.isInteger(pkgQtyRaw)
        const pkgQtyConverted = pkgQtyIsDecimal && packageSize ? Math.round(pkgQtyRaw! * packageSize) : undefined

        return {
          productId: matched?.id,
          // 有包装规格的商品用 packageQty/looseQty，否则用 quantity
          ...(pkgUnit
            ? {
                // 非整数包装数量（如 0.5 斤）→ 换算为基准单位填入 looseQty
                packageQty: pkgQtyIsDecimal ? undefined : (isPackageUnit ? qty : undefined),
                looseQty: pkgQtyIsDecimal ? pkgQtyConverted : (isBaseUnit ? qty : undefined),
                // 两者都不匹配时（如 g/kg）暂放 packageQty
                ...(!isPackageUnit && !isBaseUnit && qty != null ? { packageQty: qty } : {}),
              }
            : { quantity: qty }),
          unitPrice: item.unitPrice ?? matched?.sellPrice ?? undefined,
        }
      })

      const unmatchedCount = items.filter((i) => !i.productId).length

      // ── 打开弹窗并填表 ────────────────────────────────────────────────
      setPaidAmountTouched(false)
      autoPaidAmountRef.current = undefined
      form.resetFields()
      form.setFieldsValue({
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

  const handleCreate = async () => {
    const values = await form.validateFields()
    if (editId) {
      await saleOrderApi.update(editId, values)
    } else {
      await saleOrderApi.create(values)
    }
    setCreateOpen(false)
    setEditId(null)
    form.resetFields()
    loadData()
  }

  const handleQuickComplete = async () => {
    const values = await form.validateFields()
    // AI 识别可能填入 packageQty/looseQty，这里统一按实际净数量计算订单金额。
    const total = calculateSaleItemsTotal(values.items) ?? 0
    const paidAmount = values.paidAmount != null ? values.paidAmount : total
    await saleOrderApi.quickComplete({ ...values, paidAmount })
    message.success('销售完成！订单已出库并记录收款')
    setCreateOpen(false)
    setEditId(null)
    form.resetFields()
    loadData()
  }

  const handleOpenCreate = () => {
    setEditId(null)
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    form.resetFields()
    form.setFieldsValue({ items: [{}] })
    setCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setCreateOpen(false)
    setEditId(null)
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    form.resetFields()
  }

  const openAfterSaleRecord = async (id: number, type: 'detail' | 'return' | 'refund' | 'exchange') => {
    setAfterSaleLoading(true)
    const order = await saleOrderApi.getById(id)
    if (type === 'detail') setDetailRecord(order)
    if (type === 'return') {
      setReturnRecord(order)
      setReturnOpen(true)
      returnForm.setFieldsValue({
        quantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        packageQuantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        looseQuantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        refundAmount: 0,
        reasonCode: undefined,
        reasonNote: undefined,
        method: undefined,
        remark: undefined,
      })
    }
    if (type === 'refund') {
      setRefundRecord(order)
      setRefundOpen(true)
      refundForm.setFieldsValue({
        amount: 0,
        reasonCode: undefined,
        reasonNote: undefined,
        method: undefined,
        remark: undefined,
      })
    }
    if (type === 'exchange') {
      setExchangeRecord(order)
      setExchangeOpen(true)
      exchangeForm.setFieldsValue({
        returnQuantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        returnPackageQuantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        returnLooseQuantities: Object.fromEntries((order.items ?? []).map((item) => [String(item.id), 0])),
        exchangeItems: [{}],
        refundAmount: 0,
        reasonCode: undefined,
        reasonNote: undefined,
        method: undefined,
        remark: undefined,
      })
    }
    setAfterSaleLoading(false)
  }

  const handleOpenEdit = async (id: number) => {
    setEditId(id)
    setEditLoading(true)
    setCreateOpen(true)
    const order = await saleOrderApi.getById(id)
    form.setFieldsValue({
      customerId: order.customerId,
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

  const handleOpenCollect = (r: SaleOrder) => {
    const outstanding = r.totalAmount - (r.returnedAmount ?? 0) - r.receivedAmount
    setCollectTarget({ id: r.id, orderNo: r.orderNo, outstanding })
    collectForm.setFieldsValue({ amount: outstanding, method: undefined, remark: undefined })
    setCollectOpen(true)
  }

  const handleCollect = async () => {
    if (!collectTarget) return
    const values = await collectForm.validateFields()
    await paymentApi.create({
      type: 'receive',
      relatedType: 'sale_order',
      relatedId: collectTarget.id,
      amount: values.amount,
      method: values.method ?? null,
      remark: values.remark ?? null,
    })
    message.success('收款成功')
    setCollectOpen(false)
    setCollectTarget(null)
    loadData()
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

  const handleCreateReturn = async () => {
    if (!returnRecord) return
    const values = await returnForm.validateFields()
    const items = (returnRecord.items ?? [])
      .map((item) => ({
        saleOrderItemId: item.id,
        quantity: Number(values.quantities?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number(values.packageQuantities?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number(values.looseQuantities?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0)

    if (items.length === 0) {
      message.error('请至少填写一条退货数量')
      return
    }

    const order = await saleOrderApi.createReturn(returnRecord.id, {
      items,
      refundAmount: values.refundAmount ?? 0,
      method: values.method,
      reasonCode: values.reasonCode,
      reasonNote: values.reasonNote,
      remark: values.remark,
    })
    message.success('退货处理成功')
    setReturnOpen(false)
    setReturnRecord(null)
    setDetailRecord(order)
    loadData()
  }

  const handleCreateRefund = async () => {
    if (!refundRecord) return
    const values = await refundForm.validateFields()
    const order = await saleOrderApi.createRefund(refundRecord.id, values)
    message.success('仅退款处理成功')
    setRefundOpen(false)
    setRefundRecord(null)
    setDetailRecord(order)
    loadData()
  }

  const handleCreateExchange = async () => {
    if (!exchangeRecord) return
    const values = await exchangeForm.validateFields()
    const returnItems = (exchangeRecord.items ?? [])
      .map((item) => ({
        saleOrderItemId: item.id,
        quantity: Number(values.returnQuantities?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number(values.returnPackageQuantities?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number(values.returnLooseQuantities?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0)
    const outItems = (values.exchangeItems ?? [])
      .map((item: Record<string, unknown>) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity) || undefined,
        packageQty: Number(item.packageQty) || undefined,
        looseQty: Number(item.looseQty) || undefined,
        unitPrice: Number(item.unitPrice),
      }))
      .filter((item: { productId: number; quantity?: number; packageQty?: number; looseQty?: number; unitPrice: number }) => item.productId && (Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0))

    if (returnItems.length === 0) {
      message.error('请至少填写一条换回商品数量')
      return
    }
    if (outItems.length === 0) {
      message.error('请至少填写一条换出商品')
      return
    }

    const order = await saleOrderApi.createExchange(exchangeRecord.id, {
      returnItems,
      exchangeItems: outItems,
      refundAmount: values.refundAmount ?? 0,
      receiveAmount: values.receiveAmount ?? 0,
      method: values.method,
      reasonCode: values.reasonCode,
      reasonNote: values.reasonNote,
      remark: values.remark,
    })
    message.success('换货处理成功')
    setExchangeOpen(false)
    setExchangeRecord(null)
    setDetailRecord(order)
    loadData()
  }

  const returnPreviewAmount = useMemo(() => (returnRecord?.items ?? []).reduce((sum, item) => {
    const qty = item.packageUnit && item.packageSize
      ? Number(returnPackageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) + Number(returnLooseQuantities?.[String(item.id)] ?? 0)
      : Number(returnQuantities?.[String(item.id)] ?? 0)
    return sum + qty * item.unitPrice
  }, 0), [returnLooseQuantities, returnPackageQuantities, returnQuantities, returnRecord])

  const exchangeReturnAmount = useMemo(() => (exchangeRecord?.items ?? []).reduce((sum, item) => {
    const qty = item.packageUnit && item.packageSize
      ? Number(exchangeReturnPackageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) + Number(exchangeReturnLooseQuantities?.[String(item.id)] ?? 0)
      : Number(exchangeReturnQuantities?.[String(item.id)] ?? 0)
    return sum + qty * item.unitPrice
  }, 0), [exchangeRecord, exchangeReturnLooseQuantities, exchangeReturnPackageQuantities, exchangeReturnQuantities])

  const exchangeOutAmount = useMemo(() => (exchangeItems ?? []).reduce((sum, item) => {
    const product = productMap.get(Number(item.productId))
    const packageConfig = getProductPackageConfig(product)
    const qty = packageConfig.unit && packageConfig.size > 0
      ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
      : Number(item.quantity ?? 0)
    return sum + qty * Number(item.unitPrice ?? 0)
  }, 0), [exchangeItems, productMap])

  // 退货数量变化时自动回填退款金额（可手动覆盖）
  useEffect(() => {
    if (returnOpen) returnForm.setFieldValue('refundAmount', returnPreviewAmount)
  }, [returnPreviewAmount])

  useEffect(() => {
    if (!exchangeOpen) return
    const diff = exchangeReturnAmount - exchangeOutAmount
    if (diff > 0) {
      exchangeForm.setFieldValue('refundAmount', diff)
      exchangeForm.setFieldValue('receiveAmount', 0)
    } else if (diff < 0) {
      exchangeForm.setFieldValue('refundAmount', 0)
      exchangeForm.setFieldValue('receiveAmount', -diff)
    } else {
      exchangeForm.setFieldValue('refundAmount', 0)
      exchangeForm.setFieldValue('receiveAmount', 0)
    }
    exchangeForm.validateFields(['method']).catch(() => {})
  }, [exchangeReturnAmount, exchangeOutAmount])

  const renderProductCell = (productName: string | undefined, productId: number) => {
    const product = productMap.get(productId)
    const attrs: { label: string; value: string }[] = []
    const categoryName = product?.categoryId ? categoryNameMap.get(product.categoryId) : undefined
    if (categoryName) attrs.push({ label: '分类', value: categoryName })
    if (product?.origin) attrs.push({ label: '产地', value: product.origin })
    if (product?.year) attrs.push({ label: '年份', value: `${product.year}年` })
    if (product?.season) attrs.push({ label: '采摘季', value: product.season })
    if (product?.spec) attrs.push({ label: '规格', value: product.spec })
    if (product?.batchNo) attrs.push({ label: '批次', value: product.batchNo })
    return (
      <div>
        <div>{productName || product?.name || '-'}</div>
        {attrs.length > 0 && (
          <Space size={[4, 2]} wrap style={{ marginTop: 2 }}>
            {attrs.map((a, i) => (
              <Tag key={i} style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', color: '#595959', background: '#f5f5f5', border: 'none' }}>
                <span style={{ color: '#aaa' }}>{a.label}：</span>{a.value}
              </Tag>
            ))}
          </Space>
        )}
      </div>
    )
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
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label}</Tag> },
    { title: '下单时间', dataIndex: 'createdAt', width: 170, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
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
      <AiRecognizeLoading visible={aiRecognizing} />

      {/* 隐藏的 AI 识别文件选择框 */}
      <input
        ref={aiFileInputRef}
        type="file"
        accept="image/*,.txt,.md,.csv"
        style={{ display: 'none' }}
        onChange={(e) => void handleAiFileSelect(e)}
      />

      <PageHeader
        title="销售订单"
        description={'先建单、再出库、再收款。售后统一从"售后"入口处理，适合散客和常规客户。'}
        className="page-header"
        extra={
          <Space>
            <Button
              icon={<RobotOutlined />}
              loading={aiRecognizing}
              onClick={() => aiFileInputRef.current?.click()}
            >
              AI 识别录单
            </Button>
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

      <Modal
        title={editId ? '编辑销售订单' : '新建销售订单'}
        open={createOpen}
        onCancel={handleCloseCreate}
        width={620}
        destroyOnHidden
        footer={editId ? undefined : (
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleCloseCreate}>取消</Button>
            <Button onClick={handleCreate} style={{ borderColor: '#2D6A4F', color: '#2D6A4F' }}>保存草稿</Button>
              <Button type="primary" onClick={handleQuickComplete}
                style={{ background: '#fa8c16', borderColor: '#fa8c16' }}>
                保存并完成
              </Button>
          </Space>
        )}
        okText="保存"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
        onOk={editId ? handleCreate : undefined}
      >
        <Spin spinning={editLoading}>
          <Form
            form={form}
            layout="vertical"
            style={{ marginTop: 16 }}
            onValuesChange={(changedValues) => {
              if (Object.prototype.hasOwnProperty.call(changedValues, 'paidAmount') && !syncingPaidAmountRef.current) {
                setPaidAmountTouched(true)
                void form.validateFields(['method']).catch(() => {})
              }
            }}
          >
            <Form.Item name="customerId" label="客户（可为空，即散客）">
              <Select placeholder="选择客户（散客可不填）" allowClear showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>商品明细（保存后为草稿，点击出库才会扣库存）</Text>
              <Form.List name="items" initialValue={[{}]}>
                {(fields, { add, remove }) => (
                  <div style={{ marginTop: 12 }}>
                    {fields.map(({ key, ...fieldProps }) => (
                      <Space key={`${key}-${fieldProps.name}`} style={{ width: '100%', marginBottom: 8 }} align="start">
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'productId']} rules={[{ required: true, message: '请选择商品' }]} style={{ flex: 1, marginBottom: 0 }}>
                          <ProductSelect
                            products={products}
                            onProductChange={(p) => {
                              if (p) form.setFieldValue(['items', fieldProps.name, 'unitPrice'], p.sellPrice)
                            }}
                          />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.items?.[fieldProps.name]?.productId !== cur?.items?.[fieldProps.name]?.productId}>
                          {({ getFieldValue }) => {
                            const selectedProductId = getFieldValue(['items', fieldProps.name, 'productId'])
                            const selectedProduct = productMap.get(selectedProductId)
                            const stockQty = Number(selectedProduct?.stockQty ?? 0)
                            const packageConfig = getProductPackageConfig(selectedProduct)
                            return (
                              <>
                                {packageConfig.unit && packageConfig.size > 0 ? (
                                  <>
                                    <Form.Item {...fieldProps} name={[fieldProps.name, 'packageQty']} style={{ marginBottom: 0 }}>
                                      <InputNumber placeholder={packageConfig.unit} min={0} style={{ width: 82 }} />
                                    </Form.Item>
                                    <Form.Item {...fieldProps} name={[fieldProps.name, 'looseQty']} style={{ marginBottom: 0 }}>
                                      <InputNumber placeholder={packageConfig.baseUnit || '散'} min={0} style={{ width: 82 }} />
                                    </Form.Item>
                                  </>
                                ) : (
                                  <Form.Item
                                    {...fieldProps}
                                    name={[fieldProps.name, 'quantity']}
                                    rules={[
                                      { required: true, message: '数量必填' },
                                      {
                                        validator: (_, value) => {
                                          const num = Number(value)
                                          if (!Number.isFinite(num) || num <= 0) {
                                            return Promise.reject(new Error('数量需大于 0'))
                                          }
                                          if (selectedProductId && num > stockQty) {
                                            return Promise.reject(new Error(`数量不能超过库存（${stockQty}）`))
                                          }
                                          return Promise.resolve()
                                        },
                                      },
                                    ]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber placeholder="数量" min={1} max={stockQty} style={{ width: 90 }} />
                                  </Form.Item>
                                )}
                                <Text type="secondary" style={{ width: 90, lineHeight: '32px', textAlign: 'center' }}>
                                  库存 {stockQty}
                                </Text>
                              </>
                            )
                          }}
                        </Form.Item>
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'unitPrice']} rules={[{ required: true, message: '售价必填' }]} style={{ marginBottom: 0 }}><InputNumber placeholder="实际售价" prefix="¥" min={0} style={{ width: 120 }} /></Form.Item>
                        {fields.length > 1 && <Button danger type="link" onClick={() => remove(fieldProps.name)}>删除</Button>}
                      </Space>
                    ))}
                    <Button type="dashed" block style={{ marginTop: 8 }} size="small" onClick={() => add({})}>+ 添加商品行</Button>
                  </div>
                )}
              </Form.List>
            </div>
            <Form.Item name="remark" label="备注"><Input.TextArea rows={2} placeholder="备注信息" /></Form.Item>
            {!editId && (
              <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 10, padding: 16, marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: '#ad6800', display: 'block', marginBottom: 12 }}>
                  快捷完成时会自动出库并登记收款；不填实收金额时，默认按订单总金额收款。
                </Text>
                <Space>
                  <Form.Item name="paidAmount" label="实收金额" style={{ marginBottom: 0 }}>
                    <InputNumber prefix="¥" min={0} precision={2} style={{ width: 160 }} placeholder="按订单金额自动填充" onChange={() => form.validateFields(['method']).catch(() => {})} />
                  </Form.Item>
                  <Form.Item
                    name="method"
                    label="支付方式"
                    style={{ marginBottom: 0 }}
                    dependencies={['paidAmount']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const paidAmount = Number(getFieldValue('paidAmount') ?? 0)
                          if (paidAmount > 0 && !value) {
                            return Promise.reject(new Error('实收金额大于 0 时请选择支付方式'))
                          }
                          return Promise.resolve()
                        },
                      }),
                    ]}
                  >
                    <Select style={{ width: 140 }} placeholder="选择方式" allowClear
                      options={['现金', '微信', '支付宝', '转账', '其他'].map((m) => ({ value: m, label: m }))} />
                  </Form.Item>
                </Space>
              </div>
            )}
          </Form>
        </Spin>
      </Modal>

      <Modal title={`销售单详情：${detailRecord?.orderNo ?? ''}`} open={detailLoading || !!detailRecord} footer={null} onCancel={() => setDetailRecord(null)} width={860} destroyOnHidden>
        <Spin spinning={detailLoading || afterSaleLoading}>
          {detailRecord && (
            <>
              <Steps current={STATUS_MAP[detailRecord.status]?.step} style={{ margin: '20px 0' }} size="small" items={[{ title: '草稿' }, { title: '已出货' }, { title: '已结束' }]} />
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="客户">{detailRecord.customerName || '散客'}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detailRecord.status]?.color}>{STATUS_MAP[detailRecord.status]?.label}</Tag></Descriptions.Item>
                <Descriptions.Item label="原销售金额">¥{detailRecord.totalAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="累计退货净额">¥{detailRecord.returnedAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="净销售金额">¥{(detailRecord.totalAmount - detailRecord.returnedAmount).toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="已收款">¥{detailRecord.receivedAmount.toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="欠款" span={2}><Text type={detailRecord.totalAmount - detailRecord.returnedAmount - detailRecord.receivedAmount > 0 ? 'danger' : 'success'}>¥{(detailRecord.totalAmount - detailRecord.returnedAmount - detailRecord.receivedAmount).toLocaleString()}</Text></Descriptions.Item>
                <Descriptions.Item label="备注" span={2}>{detailRecord.remark || '-'}</Descriptions.Item>
                <Descriptions.Item label="时间" span={2}>{dayjs(detailRecord.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              </Descriptions>

              <Divider orientation="left">销售明细</Divider>
              {(detailRecord.items?.length ?? 0) > 0 ? <Table size="small" rowKey="id" pagination={false} dataSource={detailRecord.items} columns={[{ title: '商品', render: (_: unknown, row) => renderProductCell(row.productName, row.productId) }, { title: '销售数量', width: 120, render: (_: unknown, row) => formatCompositeQuantity(row) }, { title: '已退数量', dataIndex: 'returnedQuantity', width: 100, render: (v: number) => v || 0 }, { title: '可退数量', dataIndex: 'remainingQuantity', width: 100, render: (v: number) => v || 0 }, { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` }, { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` }]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无销售明细" />}

              <Divider orientation="left">退货记录</Divider>
              {(detailRecord.returns?.length ?? 0) > 0 ? detailRecord.returns?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.returnNo}</Text>
                      <Text type="secondary">退货金额 ¥{item.totalAmount.toLocaleString()}</Text>
                      <Text type="secondary">退款金额 ¥{item.refundAmount.toLocaleString()}</Text>
                      <Tag>{AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}</Tag>
                    </Space>
                    <Text type="secondary">原因说明：{item.reasonNote || '-'}</Text>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table size="small" rowKey="id" pagination={false} dataSource={item.items ?? []} columns={[{ title: '商品', render: (_: unknown, row) => renderProductCell(row.productName, row.productId) }, { title: '退货数量', width: 120, render: (_: unknown, row) => formatCompositeQuantity(row) }, { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` }, { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` }]} />
                  </Space>
                </Card>
              )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无退货记录" />}

              <Divider orientation="left">仅退款记录</Divider>
              {(detailRecord.refunds?.length ?? 0) > 0 ? <List dataSource={detailRecord.refunds} renderItem={(item) => <List.Item><Space style={{ width: '100%', justifyContent: 'space-between' }}><div><div><Text strong>{item.refundNo}</Text> <Tag>{AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}</Tag></div><Text type="secondary">原因说明：{item.reasonNote || '-'}</Text><div><Text type="secondary">备注：{item.remark || '-'}</Text></div></div><Text strong>¥{item.amount.toLocaleString()}</Text></Space></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无仅退款记录" />}

              <Divider orientation="left">换货记录</Divider>
              {(detailRecord.exchanges?.length ?? 0) > 0 ? detailRecord.exchanges?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.exchangeNo}</Text>
                      <Text type="secondary">换回金额 ¥{item.returnAmount.toLocaleString()}</Text>
                      <Text type="secondary">换出金额 ¥{item.exchangeAmount.toLocaleString()}</Text>
                      <Text type="secondary">退款金额 ¥{item.refundAmount.toLocaleString()}</Text>
                      <Text type="secondary">补差收款 ¥{(item.receiveAmount ?? 0).toLocaleString()}</Text>
                      <Tag>{AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}</Tag>
                    </Space>
                    <Text type="secondary">原因说明：{item.reasonNote || '-'}</Text>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table size="small" rowKey="id" pagination={false} dataSource={item.items ?? []} columns={[{ title: '方向', dataIndex: 'direction', width: 60, render: (v: string) => v === 'return' ? '换回' : '换出' }, { title: '商品', render: (_: unknown, row) => renderProductCell(row.productName, row.productId) }, { title: '数量', width: 120, render: (_: unknown, row) => formatCompositeQuantity(row) }, { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` }, { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` }]} />
                  </Space>
                </Card>
              )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无换货记录" />}
            </>
          )}
        </Spin>
      </Modal>

      <Modal title={`销售退货：${returnRecord?.orderNo ?? ''}`} open={returnOpen} onOk={handleCreateReturn} onCancel={() => { setReturnOpen(false); setReturnRecord(null) }} width={700} okText="确认退货" okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }} destroyOnHidden>
        <Spin spinning={afterSaleLoading}>
          {returnRecord && (
            <Form form={returnForm} layout="vertical">
              <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}><Space direction="vertical" size={6}><Text>客户：{returnRecord.customerName || '散客'}</Text><Text>原销售金额：¥{returnRecord.totalAmount.toLocaleString()}</Text><Text>当前已收款：¥{returnRecord.receivedAmount.toLocaleString()}</Text><Text strong>本次退货预估金额：¥{returnPreviewAmount.toLocaleString()}</Text></Space></Card>
              <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>填写每个商品的本次退货数量，不能超过可退数量</Text>
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                  {(returnRecord.items ?? []).map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 180px', gap: 12, alignItems: 'center' }}>
                      <div><Text strong>{item.productName}</Text><div><Text type="secondary">已售 {formatCompositeQuantity(item)}，可退 {item.remainingQuantity ?? 0}{item.unit || ''}</Text></div></div>
                      <Text>¥{item.unitPrice.toLocaleString()}</Text>
                      <Text type="secondary">可退 {item.remainingQuantity ?? 0}</Text>
                      {item.packageUnit && item.packageSize ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Form.Item name={['packageQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>{item.packageUnit}</Text>
                          <Form.Item name={['looseQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>{item.unit || '散'}</Text>
                        </div>
                      ) : (
                        <Form.Item name={['quantities', String(item.id)]} style={{ marginBottom: 0 }}><InputNumber min={0} max={item.remainingQuantity ?? 0} style={{ width: '100%' }} /></Form.Item>
                      )}
                    </div>
                  ))}
                </Space>
              </div>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="refundAmount" label="本次退款金额"><InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => returnForm.validateFields(['method'])} /></Form.Item></Col>
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
                    <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="请选择退款方式" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="reasonCode" label="售后原因"><Select allowClear options={AFTER_SALE_REASON_OPTIONS as never} /></Form.Item></Col>
                <Col span={12}><Form.Item name="reasonNote" label="原因说明"><Input placeholder="例如：客户口感不适合" /></Form.Item></Col>
              </Row>
              <Form.Item name="remark" label="备注"><Input.TextArea rows={3} placeholder="例如：客户反馈口感不符，退回 2 包并微信退款" /></Form.Item>
            </Form>
          )}
        </Spin>
      </Modal>

      <Modal title={`销售仅退款：${refundRecord?.orderNo ?? ''}`} open={refundOpen} onOk={handleCreateRefund} onCancel={() => { setRefundOpen(false); setRefundRecord(null) }} width={560} okText="确认退款" okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }} destroyOnHidden>
        <Spin spinning={afterSaleLoading}>
          {refundRecord && (
            <Form form={refundForm} layout="vertical">
              <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}><Space direction="vertical" size={6}><Text>客户：{refundRecord.customerName || '散客'}</Text><Text>当前已收款：¥{refundRecord.receivedAmount.toLocaleString()}</Text><Text>当前净销售金额：¥{(refundRecord.totalAmount - refundRecord.returnedAmount).toLocaleString()}</Text></Space></Card>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="amount" label="退款金额" rules={[{ required: true, message: '请输入退款金额' }]}><InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => refundForm.validateFields(['method'])} /></Form.Item></Col>
                <Col span={12}>
                  <Form.Item
                    name="method"
                    label="退款方式"
                    dependencies={['amount']}
                    rules={[{ validator(_, value) {
                      const amount = Number(refundForm.getFieldValue('amount') ?? 0)
                      if (amount > 0 && !value) return Promise.reject(new Error('有退款金额时必须选择退款方式'))
                      return Promise.resolve()
                    } }]}
                  >
                    <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="请选择退款方式" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="reasonCode" label="售后原因"><Select allowClear options={AFTER_SALE_REASON_OPTIONS as never} /></Form.Item></Col>
                <Col span={12}><Form.Item name="reasonNote" label="原因说明"><Input placeholder="例如：补差价、服务补偿" /></Form.Item></Col>
              </Row>
              <Form.Item name="remark" label="备注"><Input.TextArea rows={3} placeholder="例如：顾客不退货，仅退差价 20 元" /></Form.Item>
            </Form>
          )}
        </Spin>
      </Modal>

      <Modal title={`销售换货：${exchangeRecord?.orderNo ?? ''}`} open={exchangeOpen} onOk={handleCreateExchange} onCancel={() => { setExchangeOpen(false); setExchangeRecord(null) }} width={820} okText="确认换货" okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }} destroyOnHidden>
        <Spin spinning={afterSaleLoading}>
          {exchangeRecord && (
            <Form form={exchangeForm} layout="vertical">
              <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
                {/* 结算摘要：三格展示 */}
                <Row gutter={0} style={{ textAlign: 'center', marginBottom: 12 }}>
                  <Col span={8} style={{ borderRight: '1px solid #f0f0f0', paddingRight: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>换回金额</Text>
                    <div><Text strong style={{ fontSize: 16 }}>¥{exchangeReturnAmount.toLocaleString()}</Text></div>
                  </Col>
                  <Col span={8} style={{ borderRight: '1px solid #f0f0f0', padding: '0 12px' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>换出金额</Text>
                    <div><Text strong style={{ fontSize: 16 }}>¥{exchangeOutAmount.toLocaleString()}</Text></div>
                  </Col>
                  <Col span={8} style={{ paddingLeft: 12 }}>
                    {exchangeReturnAmount > exchangeOutAmount ? (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>应退给客户</Text>
                        <div><Text strong style={{ fontSize: 16, color: '#52c41a' }}>¥{(exchangeReturnAmount - exchangeOutAmount).toLocaleString()}</Text></div>
                      </>
                    ) : exchangeOutAmount > exchangeReturnAmount ? (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>客户应补差</Text>
                        <div><Text strong style={{ fontSize: 16, color: '#fa8c16' }}>¥{(exchangeOutAmount - exchangeReturnAmount).toLocaleString()}</Text></div>
                      </>
                    ) : (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>结算差额</Text>
                        <div><Text strong style={{ fontSize: 16, color: '#8c8c8c' }}>¥0</Text></div>
                      </>
                    )}
                  </Col>
                </Row>
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, display: 'flex', gap: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>客户：<Text>{exchangeRecord.customerName || '散客'}</Text></Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>当前已收款：<Text>¥{exchangeRecord.receivedAmount.toLocaleString()}</Text></Text>
                </div>
              </Card>

              <Divider orientation="left">换回商品</Divider>
              <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {(exchangeRecord.items ?? []).map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 180px', gap: 12, alignItems: 'center' }}>
                      <div><Text strong>{item.productName}</Text><div><Text type="secondary">已售 {formatCompositeQuantity(item)}，可换回 {item.remainingQuantity ?? 0}{item.unit || ''}</Text></div></div>
                      <Text>¥{item.unitPrice.toLocaleString()}</Text>
                      <Text type="secondary">可退 {item.remainingQuantity ?? 0}</Text>
                      {item.packageUnit && item.packageSize ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Form.Item name={['returnPackageQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>{item.packageUnit}</Text>
                          <Form.Item name={['returnLooseQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>{item.unit || '散'}</Text>
                        </div>
                      ) : (
                        <Form.Item name={['returnQuantities', String(item.id)]} style={{ marginBottom: 0 }}><InputNumber min={0} max={item.remainingQuantity ?? 0} style={{ width: '100%' }} /></Form.Item>
                      )}
                    </div>
                  ))}
                </Space>
              </div>

              <Divider orientation="left">换出商品</Divider>
              <Form.List name="exchangeItems">
                {(fields, { add, remove }) => (
                  <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    {fields.map(({ key, ...fieldProps }) => {
                      const selectedProductId = exchangeForm.getFieldValue(['exchangeItems', fieldProps.name, 'productId'])
                      const selectedProduct = productMap.get(selectedProductId)
                      const packageConfig = getProductPackageConfig(selectedProduct)
                      return <Space key={`${key}-${fieldProps.name}`} style={{ width: '100%', marginBottom: 8 }} align="start">
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'productId']} rules={[{ required: true, message: '请选择商品' }]} style={{ flex: 1, marginBottom: 0 }}>
                          <ProductSelect
                            products={products}
                            placeholder="选择换出商品"
                            onProductChange={(p) => {
                              if (p) exchangeForm.setFieldValue(['exchangeItems', fieldProps.name, 'unitPrice'], p.sellPrice)
                            }}
                          />
                        </Form.Item>
                        {packageConfig.unit && packageConfig.size > 0 ? (
                          <>
                            <Form.Item {...fieldProps} name={[fieldProps.name, 'packageQty']} style={{ marginBottom: 0 }}><InputNumber placeholder={packageConfig.unit} min={0} style={{ width: 82 }} /></Form.Item>
                            <Form.Item {...fieldProps} name={[fieldProps.name, 'looseQty']} style={{ marginBottom: 0 }}><InputNumber placeholder={packageConfig.baseUnit || '散'} min={0} style={{ width: 82 }} /></Form.Item>
                          </>
                        ) : (
                          <Form.Item {...fieldProps} name={[fieldProps.name, 'quantity']} rules={[{ required: true, message: '数量必填' }]} style={{ marginBottom: 0 }}><InputNumber placeholder="数量" min={1} style={{ width: 90 }} /></Form.Item>
                        )}
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'unitPrice']} rules={[{ required: true, message: '售价必填' }]} style={{ marginBottom: 0 }}><InputNumber placeholder="单价" prefix="¥" min={0} style={{ width: 120 }} /></Form.Item>
                        {fields.length > 1 && <Button danger type="link" onClick={() => remove(fieldProps.name)}>删除</Button>}
                      </Space>
                    })}
                    <Button type="dashed" block size="small" onClick={() => add({})}>+ 添加换出商品</Button>
                  </div>
                )}
              </Form.List>

              <Row gutter={12}>
                <Col span={8}><Form.Item name="refundAmount" label="本次退款金额"><InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => exchangeForm.validateFields(['method'])} /></Form.Item></Col>
                <Col span={8}><Form.Item name="receiveAmount" label="本次补差收款"><InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => exchangeForm.validateFields(['method'])} /></Form.Item></Col>
                <Col span={8}>
                  <Form.Item
                    name="method"
                    label="结算方式"
                    dependencies={['refundAmount', 'receiveAmount']}
                    rules={[{ validator(_, value) {
                      const refund = Number(exchangeForm.getFieldValue('refundAmount') ?? 0)
                      const receive = Number(exchangeForm.getFieldValue('receiveAmount') ?? 0)
                      if ((refund > 0 || receive > 0) && !value) return Promise.reject(new Error('有退款或收款金额时必须选择结算方式'))
                      return Promise.resolve()
                    } }]}
                  >
                    <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="请选择结算方式" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="reasonCode" label="售后原因"><Select allowClear options={AFTER_SALE_REASON_OPTIONS as never} /></Form.Item></Col>
                <Col span={12}><Form.Item name="reasonNote" label="原因说明"><Input placeholder="例如：发错货，换同价位商品" /></Form.Item></Col>
              </Row>
              <Form.Item name="remark" label="备注"><Input.TextArea rows={3} placeholder="例如：顾客将大红袍换成同价位铁观音" /></Form.Item>
            </Form>
          )}
        </Spin>
      </Modal>

      <Modal
        title={<Space><DollarOutlined style={{ color: '#1677ff' }} /><span>收款：{collectTarget?.orderNo}</span></Space>}
        open={collectOpen}
        onOk={handleCollect}
        onCancel={() => { setCollectOpen(false); setCollectTarget(null) }}
        okText="确认收款"
        okButtonProps={{ style: { background: '#1677ff', borderColor: '#1677ff' } }}
        width={400}
        destroyOnHidden
      >
        {collectTarget && (
          <Form form={collectForm} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ background: '#e6f4ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>当前欠款：</Text>
              <Text strong style={{ color: '#1677ff', fontSize: 16 }}> ¥{collectTarget.outstanding.toLocaleString()}</Text>
            </div>
            <Form.Item name="amount" label="本次收款金额" rules={[{ required: true, message: '请填写收款金额' }]}>
              <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => collectForm.validateFields(['method'])} />
            </Form.Item>
            <Form.Item
              name="method"
              label="支付方式"
              dependencies={['amount']}
              rules={[{ validator(_, value) {
                const amount = Number(collectForm.getFieldValue('amount') ?? 0)
                if (amount > 0 && !value) return Promise.reject(new Error('有收款金额时必须选择支付方式'))
                return Promise.resolve()
              } }]}
            >
              <Select placeholder="请选择支付方式" allowClear options={PAYMENT_METHOD_OPTIONS} />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} placeholder="备注信息（选填）" />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <SaleOrderReceipt
        open={printOpen}
        order={printOrder}
        shopName={shopName}
        onClose={() => { setPrintOpen(false); setPrintOrder(null) }}
      />
    </div>
  )
}
