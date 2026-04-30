import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Col,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { purchaseOrderApi, type CreatePurchaseOrderPayload, type QuickCompletePurchasePayload } from '@/api/purchase'
import { productApi } from '@/api/products'
import { stockApi } from '@/api/stock'
import type { Product, PurchaseOrder, StockBatch, Supplier, Warehouse } from '@/types'
import { getProductPackageConfig } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import { filterBatchSelectOption, makeBatchSelectOption, renderBatchSelectOption } from '@/components/BatchSelectOption'
import ProductSelect from '@/components/ProductSelect'
import SupplierSelect from '@/components/SupplierSelect'

const { Text } = Typography
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4
type PurchaseProcessMode = 'draft' | 'stocked' | 'paid'
type UnitMode = 'base' | 'package'

function roundAmount(value: number) {
  return Math.round(value * 100) / 100
}

interface PurchaseOrderFormModalProps {
  open: boolean
  editId: number | null
  loading: boolean
  suppliers: Supplier[]
  onClose: () => void
  onSuccess: () => void
  /** 从外部预填表单（如库存预警跳转） */
  initialValues?: {
    productId: number
    suggestQty: number
  } | null
}

export function PurchaseOrderFormModal({
  open,
  editId,
  loading,
  suppliers,
  onClose,
  onSuccess,
  initialValues,
}: PurchaseOrderFormModalProps) {
  const [form] = Form.useForm()
  const purchaseItems = Form.useWatch('items', form) as Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _unitMode?: UnitMode
    batchMode?: 'new' | 'existing'
    batchId?: number
    batchNo?: string
    _product?: Product
  }> | undefined
  const processMode = Form.useWatch('processMode', form) as PurchaseProcessMode | undefined
  const inboundWarehouseId = Form.useWatch('warehouseId', form) as number | undefined
  const inboundLocationId = Form.useWatch('locationId', form) as number | undefined
  const autoPaidAmountRef = useRef<number | undefined>(undefined)
  const syncingPaidAmountRef = useRef(false)
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [batchOptionsMap, setBatchOptionsMap] = useState<Record<number, StockBatch[]>>({})

  const clearInboundBatchIds = () => {
    const items = (form.getFieldValue('items') ?? []) as Array<Record<string, unknown>>
    form.setFieldValue('items', items.map((item) => ({
      ...item,
      batchId: undefined,
      warehouseId: undefined,
      locationId: undefined,
    })))
  }

  const getPurchaseItemQuantity = (item: {
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    _unitMode?: UnitMode
    _product?: Product
  }) => {
    const product = item._product
    const packageConfig = getProductPackageConfig(product)
    if (packageConfig.unit && packageConfig.size > 0) {
      if (item._unitMode === 'package') {
        return Number(item.packageQty ?? 0) * packageConfig.size
      }
      if (item._unitMode === 'base') {
        return Number(item.quantity ?? 0)
      }
      return Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
    }
    return Number(item.quantity ?? 0)
  }

  const getPurchaseItemBaseUnitPrice = (item: {
    unitPrice?: number
    _unitMode?: UnitMode
    _product?: Product
  }) => {
    const packageConfig = getProductPackageConfig(item._product)
    const price = Number(item.unitPrice ?? 0)
    if (packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package') {
      return roundAmount(price / packageConfig.size)
    }
    return price
  }

  const calculatePurchaseItemsTotal = (items?: Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _unitMode?: UnitMode
    _product?: Product
  }>) => {
    const total = (items ?? []).reduce(
      (sum, item) => sum + getPurchaseItemQuantity(item) * getPurchaseItemBaseUnitPrice(item), 0
    )
    return total > 0 ? Number(total.toFixed(2)) : undefined
  }

  const handlePurchaseUnitModeChange = (rowIndex: number, nextMode: UnitMode) => {
    const product = form.getFieldValue(['items', rowIndex, '_product']) as Product | undefined
    const packageConfig = getProductPackageConfig(product)
    if (!packageConfig.unit || packageConfig.size <= 0) return

    const currentMode: UnitMode = nextMode === 'package' ? 'base' : 'package'

    const currentPrice = Number(form.getFieldValue(['items', rowIndex, 'unitPrice']) ?? 0)
    const currentBaseQty = currentMode === 'package'
      ? Number(form.getFieldValue(['items', rowIndex, 'packageQty']) ?? 0) * packageConfig.size
      : Number(form.getFieldValue(['items', rowIndex, 'quantity']) ?? 0)

    form.setFieldValue(['items', rowIndex, '_unitMode'], nextMode)
    form.setFieldValue(
      ['items', rowIndex, 'unitPrice'],
      nextMode === 'package'
        ? roundAmount(currentPrice * packageConfig.size)
        : roundAmount(currentPrice / packageConfig.size),
    )

    if (nextMode === 'package') {
      form.setFieldValue(['items', rowIndex, 'packageQty'], currentBaseQty > 0 ? Number((currentBaseQty / packageConfig.size).toFixed(4)) : undefined)
      form.setFieldValue(['items', rowIndex, 'quantity'], undefined)
      form.setFieldValue(['items', rowIndex, 'looseQty'], undefined)
      return
    }

    form.setFieldValue(['items', rowIndex, 'quantity'], currentBaseQty > 0 ? Number(currentBaseQty.toFixed(4)) : undefined)
    form.setFieldValue(['items', rowIndex, 'packageQty'], undefined)
    form.setFieldValue(['items', rowIndex, 'looseQty'], undefined)
  }

  const normalizePurchaseItemForSubmit = (item: Record<string, unknown>): Record<string, unknown> => {
    const product = item._product as Product | undefined
    const packageConfig = getProductPackageConfig(product)
    const unitMode = item._unitMode as UnitMode | undefined
    const baseUnitPrice = getPurchaseItemBaseUnitPrice({
      unitPrice: Number(item.unitPrice ?? 0),
      _unitMode: unitMode,
      _product: product,
    })
    const { _product, _unitMode, ...rest } = item
    void _product
    void _unitMode

    if (packageConfig.unit && packageConfig.size > 0 && unitMode === 'package') {
      return {
        ...rest,
        quantity: undefined,
        packageQty: rest.packageQty,
        looseQty: undefined,
        unitPrice: baseUnitPrice,
      }
    }

    return {
      ...rest,
      packageQty: undefined,
      looseQty: undefined,
      unitPrice: baseUnitPrice,
    }
  }

  const buildSuggestedBatchNo = (product: Product, rowIndex: number) => {
    const now = new Date()
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('')
    const code = (product.sku || `P${product.id}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || `P${product.id}`
    return `${date}-${code}-${String(rowIndex + 1).padStart(2, '0')}`
  }

  const loadProductBatches = async (productId: number) => {
    const res = await stockApi.batches({ productId, pageSize: 100 })
    setBatchOptionsMap((prev) => ({ ...prev, [productId]: res.list ?? [] }))
    return res.list ?? []
  }

  // 自动填充实付金额
  useEffect(() => {
    if (!open || editId || processMode !== 'paid' || paidAmountTouched) {
      return
    }

    const nextPaidAmount = calculatePurchaseItemsTotal(purchaseItems)
    if (nextPaidAmount === autoPaidAmountRef.current) {
      return
    }

    syncingPaidAmountRef.current = true
    autoPaidAmountRef.current = nextPaidAmount
    form.setFieldValue('paidAmount', nextPaidAmount)
    //void form.validateFields(['method']).catch(() => {})
    queueMicrotask(() => {
      syncingPaidAmountRef.current = false
    })
  }, [open, editId, processMode, paidAmountTouched, purchaseItems, form])

  useEffect(() => {
    if (!open || editId) return

    let cancelled = false
    ;(async () => {
      try {
        const list = await stockApi.warehouses()
        if (cancelled) return
        setWarehouses(list)
        form.setFieldsValue({
          warehouseId: undefined,
          locationId: undefined,
        })
      } catch {
        if (!cancelled) setWarehouses([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, editId, form])

  // 处理从库存预警跳转的预填
  useEffect(() => {
    if (!initialValues || !open) return

    let cancelled = false
      ; (async () => {
        form.resetFields()
        try {
          const p: Product = await productApi.get(initialValues.productId)
          if (cancelled) return

          const pkg = getProductPackageConfig(p)
          const item: Record<string, unknown> = {
            productId: p.id,
            unitPrice: p.costPrice ?? 0,
            _unitMode: 'base',
            _product: p,
          }

          if (pkg.unit && pkg.size > 0) {
            item.quantity = initialValues.suggestQty
          } else {
            item.quantity = initialValues.suggestQty
          }

          form.setFieldsValue({
            supplierId: undefined,
            remark: undefined,
          processMode: 'draft',
          items: [item],
        })
        void loadProductBatches(p.id)
      } catch {
          if (!cancelled) {
            message.error('加载商品失败')
            onClose()
          }
        }
      })()

    return () => {
      cancelled = true
    }
  }, [initialValues, open, form, onClose])

  useEffect(() => {
    if (open && !editId && !initialValues && !form.getFieldValue('processMode')) {
      form.setFieldValue('processMode', 'draft')
    }
  }, [open, editId, initialValues, form])

  const handleClose = () => {
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    form.resetFields()
    onClose()
  }

  const cleanDraftItems = (items: Array<Record<string, unknown>> = []) => (
    items.map((item) => {
      const normalized = normalizePurchaseItemForSubmit(item)
      const { batchMode, batchId, batchNo, warehouseId, locationId, ...rest } = normalized
      void batchMode
      void batchId
      void batchNo
      void warehouseId
      void locationId
      return rest
    })
  )

  const cleanStockItems = (items: Array<Record<string, unknown>> = []) => (
    items.map((item) => {
      const { batchMode, ...rest } = normalizePurchaseItemForSubmit(item)
      const base = {
        productId: rest.productId,
        quantity: rest.quantity,
        packageQty: rest.packageQty,
        looseQty: rest.looseQty,
        unitPrice: rest.unitPrice,
      }
      if (batchMode === 'existing') {
        return {
          ...base,
          batchId: rest.batchId,
          warehouseId: rest.warehouseId,
          locationId: rest.locationId,
        }
      }
      return {
        ...base,
        batchNo: typeof rest.batchNo === 'string' ? rest.batchNo.trim() : rest.batchNo,
      }
    })
  )

  const handleSave = async () => {
    const values = await form.validateFields(['supplierId', 'items'])
    const remark = form.getFieldValue('remark')
    const cleanedItems = cleanDraftItems(values.items)
    const payload = { supplierId: values.supplierId, remark, items: cleanedItems } as CreatePurchaseOrderPayload
    if (editId) {
      await purchaseOrderApi.update(editId, payload)
    } else {
      await purchaseOrderApi.create(payload)
    }
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    onSuccess()
  }

  const handleSubmitByMode = async () => {
    const mode = (form.getFieldValue('processMode') ?? 'draft') as PurchaseProcessMode
    if (mode === 'draft') {
      await handleSave()
      message.success('采购单已保存')
      return
    }

    const values = await form.validateFields()
    const cleanedItems = cleanStockItems(values.items)
    const total = calculatePurchaseItemsTotal(values.items) ?? 0
    const paidAmount = mode === 'paid' ? (values.paidAmount != null ? values.paidAmount : total) : 0
    const payload: QuickCompletePurchasePayload = {
      supplierId: values.supplierId,
      remark: values.remark,
      warehouseId: values.warehouseId,
      locationId: values.locationId,
      items: cleanedItems as QuickCompletePurchasePayload['items'],
      paidAmount,
      method: mode === 'paid' ? values.method : undefined,
    }
    await purchaseOrderApi.quickComplete(payload)
    message.success(mode === 'paid' ? '采购完成，已入库并记录付款' : '采购单已保存并入库')
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    onSuccess()
  }

  const handleOpenEdit = async (id: number) => {
    const order: PurchaseOrder = await purchaseOrderApi.getById(id)
    form.setFieldsValue({
      supplierId: order.supplierId,
      remark: order.remark,
      items:
        order.items?.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          unitPrice: item.unitPrice,
          _unitMode: 'base',
        })) ?? [{}],
    })
    await Promise.all((order.items ?? []).map((item) => loadProductBatches(item.productId)))
  }

  useEffect(() => {
    if (open && editId) {
      handleOpenEdit(editId)
    }
  }, [open, editId])

  const warehouseOptions = warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))
  const locationOptions = (
    warehouses.find((warehouse) => warehouse.id === inboundWarehouseId)?.locations ?? []
  ).map((location) => ({ label: location.name, value: location.id }))
  const submitText =
    processMode === 'paid'
      ? '保存并入库并付款'
      : processMode === 'stocked'
        ? '保存并入库'
        : '保存采购单'

  return (
    <Modal
      title={editId ? '编辑采购订单' : '新建采购订单'}
      open={open}
      onCancel={handleClose}
      width={860}
      destroyOnHidden
      footer={
        editId ? undefined : (
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              onClick={handleSubmitByMode}
              style={{ background: processMode === 'paid' ? '#fa8c16' : '#2D6A4F', borderColor: processMode === 'paid' ? '#fa8c16' : '#2D6A4F' }}
            >
              {submitText}
            </Button>
          </Space>
        )
      }
      okText="保存"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      onOk={editId ? handleSave : undefined}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="supplierId" label="供应商" rules={[{ required: true }]}>
            <SupplierSelect suppliers={suppliers} />
          </Form.Item>
          {!editId && (
            <Form.Item name="processMode" label="采购处理方式" initialValue="draft">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={(event) => {
                  const nextMode = event.target.value as PurchaseProcessMode
                  if (nextMode === 'paid' && !form.getFieldValue('paidAmount')) {
                    form.setFieldValue('paidAmount', calculatePurchaseItemsTotal(form.getFieldValue('items')) ?? undefined)
                  }
                }}
              >
                <Radio.Button value="draft">保存采购单</Radio.Button>
                <Radio.Button value="stocked">保存并入库</Radio.Button>
                <Radio.Button value="paid">保存并入库并付款</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}
          <div
            style={{
              background: '#f9f9f9',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              商品明细
            </Text>
            <Form.List name="items" initialValue={[{}]}>
              {(fields, { add, remove }) => (
                <div style={{ marginTop: 12 }}>
                  {fields.map(({ key, ...fieldProps }) => (
                    <Space
                      key={`${key}-${fieldProps.name}`}
                      style={{ width: '100%', marginBottom: 8 }}
                      align="start"
                    >
                      <Form.Item
                        key={`${key}-product`}
                        {...fieldProps}
                        name={[fieldProps.name, 'productId']}
                        rules={[{ required: true, message: '请选择商品' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <ProductSelect
                          lazy
                          priceField="costPrice"
                          onProductChange={(p) => {
                            if (p) {
                              form.setFieldValue(['items', fieldProps.name, 'unitPrice'], p.costPrice)
                              form.setFieldValue(['items', fieldProps.name, '_unitMode'], 'base')
                              form.setFieldValue(['items', fieldProps.name, 'quantity'], undefined)
                              form.setFieldValue(['items', fieldProps.name, 'packageQty'], undefined)
                              form.setFieldValue(['items', fieldProps.name, 'looseQty'], undefined)
                              form.setFieldValue(['items', fieldProps.name, '_product'], p)
                              form.setFieldValue(['items', fieldProps.name, 'batchMode'], 'new')
                              form.setFieldValue(['items', fieldProps.name, 'batchId'], undefined)
                              form.setFieldValue(['items', fieldProps.name, 'batchNo'], buildSuggestedBatchNo(p, fieldProps.name))
                              void loadProductBatches(p.id)
                            }
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        noStyle
                        shouldUpdate={
                          (prev, cur) =>
                            prev?.items?.[fieldProps.name]?.productId !==
                            cur?.items?.[fieldProps.name]?.productId ||
                            prev?.items?.[fieldProps.name]?._unitMode !==
                            cur?.items?.[fieldProps.name]?._unitMode
                        }
                      >
                        {({ getFieldValue }) => {
                          const selectedProduct = getFieldValue([
                            'items',
                            fieldProps.name,
                            '_product',
                          ])
                          const packageConfig = getProductPackageConfig(selectedProduct)
                          const unitMode = (getFieldValue(['items', fieldProps.name, '_unitMode']) ?? 'base') as UnitMode
                          if (packageConfig.unit && packageConfig.size > 0) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: 174 }}>
                                <Form.Item
                                  {...fieldProps}
                                  name={[fieldProps.name, '_unitMode']}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Radio.Group
                                    size="small"
                                    value={unitMode}
                                    onChange={(event) => handlePurchaseUnitModeChange(fieldProps.name, event.target.value)}
                                  >
                                    <Radio.Button value="base">{packageConfig.baseUnit || '散'}</Radio.Button>
                                    <Radio.Button value="package">{packageConfig.unit}</Radio.Button>
                                  </Radio.Group>
                                </Form.Item>
                                <Form.Item
                                  key={`${key}-${unitMode}`}
                                  {...fieldProps}
                                  name={[fieldProps.name, unitMode === 'package' ? 'packageQty' : 'quantity']}
                                  rules={[{ required: true, message: '数量必填' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <InputNumber
                                    placeholder={unitMode === 'package' ? packageConfig.unit : packageConfig.baseUnit || '数量'}
                                    min={0}
                                    step={QUANTITY_STEP}
                                    precision={QUANTITY_PRECISION}
                                    style={{ width: 82 }}
                                  />
                                </Form.Item>
                              </div>
                            )
                          }
                          return (
                            <Form.Item
                              key={`${key}-qty`}
                              {...fieldProps}
                              name={[fieldProps.name, 'quantity']}
                              rules={[{ required: true, message: '数量必填' }]}
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber
                                placeholder="数量"
                                min={QUANTITY_STEP}
                                step={QUANTITY_STEP}
                                precision={QUANTITY_PRECISION}
                                style={{ width: 90 }}
                              />
                            </Form.Item>
                          )
                        }}
                      </Form.Item>
                      <Form.Item
                        key={`${key}-price`}
                        noStyle
                        shouldUpdate={(prev, cur) =>
                          prev?.items?.[fieldProps.name]?._product !== cur?.items?.[fieldProps.name]?._product ||
                          prev?.items?.[fieldProps.name]?._unitMode !== cur?.items?.[fieldProps.name]?._unitMode
                        }
                      >
                        {({ getFieldValue }) => {
                          const selectedProduct = getFieldValue(['items', fieldProps.name, '_product'])
                          const packageConfig = getProductPackageConfig(selectedProduct)
                          const unitMode = (getFieldValue(['items', fieldProps.name, '_unitMode']) ?? 'base') as UnitMode
                          const priceUnit = packageConfig.unit && packageConfig.size > 0 && unitMode === 'package'
                            ? packageConfig.unit
                            : packageConfig.baseUnit || selectedProduct?.unit || '单位'
                          return (
                            <Form.Item
                              {...fieldProps}
                              name={[fieldProps.name, 'unitPrice']}
                              rules={[{ required: true, message: '单价必填' }]}
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber
                                placeholder={`单价/${priceUnit}`}
                                prefix="¥"
                                addonAfter={`/${priceUnit}`}
                                min={0}
                                style={{ width: 150 }}
                              />
                            </Form.Item>
                          )
                        }}
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button
                          danger
                          type="link"
                          onClick={() => remove(fieldProps.name)}
                        >
                          删除
                        </Button>
                      )}
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    block
                    style={{ marginTop: 8 }}
                    size="small"
                    onClick={() => add({})}
                  >
                    + 添加商品行
                  </Button>
                </div>
              )}
            </Form.List>
          </div>
          {!editId && processMode !== 'draft' && (
            <div
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 10,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                入库信息：新建批次需选择入库仓库/仓位；并入已有批次时可先选批次，系统会自动带出仓库/仓位。
              </Text>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true, message: '请选择入库仓库' }]}>
                    <Select
                      allowClear
                      placeholder="选择仓库"
                      options={warehouseOptions}
                      onChange={() => {
                        form.setFieldValue('locationId', undefined)
                        clearInboundBatchIds()
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="locationId" label="入库仓位" rules={[{ required: true, message: '请选择入库仓位' }]}>
                    <Select allowClear placeholder="选择仓位" options={locationOptions} onChange={clearInboundBatchIds} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.List name="items">
                {(fields) => (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {fields.map((field) => (
                      <Form.Item key={field.key} noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                          const product = getFieldValue(['items', field.name, '_product']) as Product | undefined
                          const productId = getFieldValue(['items', field.name, 'productId']) as number | undefined
                          const mode = getFieldValue(['items', field.name, 'batchMode']) ?? 'new'
                          const options = (productId ? batchOptionsMap[productId] ?? [] : [])
                            .filter((batch) => !inboundWarehouseId || batch.warehouseId === inboundWarehouseId)
                            .filter((batch) => !inboundLocationId || batch.locationId === inboundLocationId)
                          const selectOptions = options.map((batch) => makeBatchSelectOption(batch))
                          return (
                            <Row gutter={12} align="middle">
                              <Col span={8}>
                                <Text strong>{product?.name || `第 ${field.name + 1} 行商品`}</Text>
                              </Col>
                              <Col span={7}>
                                <Form.Item name={[field.name, 'batchMode']} style={{ marginBottom: 0 }} initialValue="new">
                                  <Radio.Group size="small">
                                    <Radio.Button value="new">新建批次</Radio.Button>
                                    <Radio.Button value="existing" disabled={selectOptions.length === 0}>并入已有</Radio.Button>
                                  </Radio.Group>
                                </Form.Item>
                              </Col>
                              <Col span={9}>
                                {mode === 'existing' ? (
                                  <Form.Item name={[field.name, 'batchId']} rules={[{ required: true, message: '请选择已有批次' }]} style={{ marginBottom: 0 }}>
                                    <Select
                                      showSearch
                                      filterOption={filterBatchSelectOption}
                                      optionLabelProp="label"
                                      optionRender={renderBatchSelectOption}
                                      placeholder="搜索并选择已有批次"
                                      options={selectOptions}
                                      onChange={(batchId) => {
                                        const batch = options.find((item) => item.id === batchId)
                                        form.setFieldValue(['items', field.name, 'warehouseId'], batch?.warehouseId)
                                        form.setFieldValue(['items', field.name, 'locationId'], batch?.locationId ?? undefined)
                                        if (batch) {
                                          form.setFieldsValue({
                                            warehouseId: batch.warehouseId,
                                            locationId: batch.locationId ?? undefined,
                                          })
                                        }
                                      }}
                                    />
                                  </Form.Item>
                                ) : (
                                  <Form.Item
                                    name={[field.name, 'batchNo']}
                                    rules={[{ required: true, message: '请输入入库批次号' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Input placeholder="可修改系统建议批次号" />
                                  </Form.Item>
                                )}
                              </Col>
                            </Row>
                          )
                        }}
                      </Form.Item>
                    ))}
                  </Space>
                )}
              </Form.List>
            </div>
          )}
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          {!editId && processMode === 'paid' && (
            <div
              style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 10,
                padding: 16,
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: '#ad6800', display: 'block', marginBottom: 12 }}>
                现结采购会自动入库并登记付款；实付金额默认按采购总额填充。
              </Text>
              <Space>
                <Form.Item name="paidAmount" label="实付金额" style={{ marginBottom: 0 }}>
                  <InputNumber
                    prefix="¥"
                    min={0}
                    precision={2}
                    style={{ width: 160 }}
                    placeholder="按订单金额自动填充"
                    onChange={() => {
                      if (!syncingPaidAmountRef.current) {
                        setPaidAmountTouched(true)
                      }
                      form.validateFields(['method']).catch(() => { })
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="method"
                  label="支付方式"
                  style={{ marginBottom: 0 }}
                  rules={[{ required: true, message: '请选择支付方式' }]}
                >
                  <Select
                    style={{ width: 140 }}
                    placeholder="选择方式"
                    options={PAYMENT_METHOD_OPTIONS}
                  />
                </Form.Item>
              </Space>
            </div>
          )}
        </Form>
      </Spin>
    </Modal>
  )
}
