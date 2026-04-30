import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { saleOrderApi } from '@/api/sale'
import { stockApi } from '@/api/stock'
import type { Customer, Product, SaleOrder, StockBatch } from '@/types'
import { getBatchAutoPickPlaceholder, getBatchAutoPickStrategy } from '@/utils/batch-strategy'
import { formatQuantityByUnitMode, getProductPackageConfig } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import { filterBatchSelectOption, makeBatchSelectOption, renderBatchSelectOption } from '@/components/BatchSelectOption'
import ProductSelect from '@/components/ProductSelect'
import CustomerSelect from '@/components/CustomerSelect'

const { Text } = Typography
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4
type UnitMode = 'base' | 'package'

function roundAmount(value: number) {
  return Math.round(value * 100) / 100
}

interface SaleOrderFormModalProps {
  open: boolean
  editId: number | null
  loading: boolean
  customers: Customer[]
  products: Product[]
  productMap: Map<number, Product>
  onClose: () => void
  onSuccess: () => void
  initialValues?: {
    customerId?: number
    items?: Array<{
      productId?: number
      batchId?: number
      warehouseId?: number
      locationId?: number
      quantity?: number
      packageQty?: number
      looseQty?: number
      unitPrice?: number
    }>
    remark?: string
    paidAmount?: number
    method?: string
  } | null
}

export function SaleOrderFormModal({
  open,
  editId,
  loading,
  customers,
  products,
  productMap,
  onClose,
  onSuccess,
  initialValues,
}: SaleOrderFormModalProps) {
  const [form] = Form.useForm()
  const saleItems = Form.useWatch('items', form) as Array<{
    productId?: number
    batchId?: number
    warehouseId?: number
    locationId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _unitMode?: UnitMode
    _product?: Product
  }> | undefined
  const autoPaidAmountRef = useRef<number | undefined>(undefined)
  const syncingPaidAmountRef = useRef(false)
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  const [adjustTotalPrice, setAdjustTotalPrice] = useState<number | undefined>(undefined)
  const [batchOptionsMap, setBatchOptionsMap] = useState<Record<number, StockBatch[]>>({})
  const [currentTotal, setCurrentTotal] = useState(0)

  const loadProductBatches = async (productId: number) => {
    if (batchOptionsMap[productId]) {
      return batchOptionsMap[productId]
    }
    const res = await stockApi.batches({ productId, availableOnly: '1', status: 1, pageSize: 50 })
    const list = res.list ?? []
    setBatchOptionsMap((prev) => ({ ...prev, [productId]: list }))
    return list
  }

  const setRowBatch = (rowIndex: number, batch?: StockBatch) => {
    form.setFieldValue(['items', rowIndex, 'batchId'], batch?.id)
    form.setFieldValue(['items', rowIndex, 'warehouseId'], batch?.warehouseId)
    form.setFieldValue(['items', rowIndex, 'locationId'], batch?.locationId ?? undefined)
  }

  const getSaleItemQuantity = (item: {
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    _unitMode?: UnitMode
    _product?: Product
  }) => {
    const product = item._product ?? (item.productId ? productMap.get(item.productId) : undefined)
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

  const getSaleItemBaseUnitPrice = (item: {
    productId?: number
    unitPrice?: number
    _unitMode?: UnitMode
    _product?: Product
  }) => {
    const product = item._product ?? (item.productId ? productMap.get(item.productId) : undefined)
    const packageConfig = getProductPackageConfig(product)
    const price = Number(item.unitPrice ?? 0)
    if (packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package') {
      return roundAmount(price / packageConfig.size)
    }
    return price
  }

  const calculateSaleItemsTotal = (items?: Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _unitMode?: UnitMode
    _product?: Product
  }>) => {
    const total = (items ?? []).reduce(
      (sum, item) => sum + getSaleItemQuantity(item) * getSaleItemBaseUnitPrice(item),
      0,
    )
    return total > 0 ? Number(total.toFixed(2)) : undefined
  }

  const syncComputedAmounts = (items?: Array<Record<string, unknown>>) => {
    const nextTotal = calculateSaleItemsTotal(items as typeof saleItems) ?? 0
    setCurrentTotal(nextTotal)

    if (!open || editId || paidAmountTouched) return
    const nextPaidAmount = nextTotal > 0 ? nextTotal : undefined
    if (nextPaidAmount === autoPaidAmountRef.current) return

    syncingPaidAmountRef.current = true
    autoPaidAmountRef.current = nextPaidAmount
    form.setFieldValue('paidAmount', nextPaidAmount)
    queueMicrotask(() => {
      syncingPaidAmountRef.current = false
    })
  }

  const handleSaleUnitModeChange = (rowIndex: number, nextMode: UnitMode) => {
    const items = ([...(form.getFieldValue('items') ?? [])]) as Array<Record<string, unknown>>
    const currentItem = { ...(items[rowIndex] ?? {}) }
    const product = (currentItem._product as Product | undefined) ?? productMap.get(Number(currentItem.productId))
    const packageConfig = getProductPackageConfig(product)
    if (!packageConfig.unit || packageConfig.size <= 0) return

    const currentMode: UnitMode = nextMode === 'package' ? 'base' : 'package'

    const currentPrice = Number(currentItem.unitPrice ?? 0)
    const currentBaseQty = currentMode === 'package'
      ? Number(currentItem.packageQty ?? 0) * packageConfig.size
      : Number(currentItem.quantity ?? 0)

    if (nextMode === 'package') {
      items[rowIndex] = {
        ...currentItem,
        _unitMode: nextMode,
        unitPrice: roundAmount(currentPrice * packageConfig.size),
        packageQty: currentBaseQty > 0 ? Number((currentBaseQty / packageConfig.size).toFixed(4)) : undefined,
        quantity: undefined,
        looseQty: undefined,
      }
      form.setFieldsValue({ items })
      syncComputedAmounts(items)
      return
    }

    items[rowIndex] = {
      ...currentItem,
      _unitMode: nextMode,
      unitPrice: roundAmount(currentPrice / packageConfig.size),
      quantity: currentBaseQty > 0 ? Number(currentBaseQty.toFixed(4)) : undefined,
      packageQty: undefined,
      looseQty: undefined,
    }
    form.setFieldsValue({ items })
    syncComputedAmounts(items)
  }

  const normalizeSaleItemForSubmit = (item: Record<string, unknown>) => {
    const productId = Number(item.productId)
    const product = (item._product as Product | undefined) ?? productMap.get(productId)
    const packageConfig = getProductPackageConfig(product)
    const unitMode = item._unitMode as UnitMode | undefined
    const baseUnitPrice = getSaleItemBaseUnitPrice({
      productId,
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

  useEffect(() => {
    if (!open || editId || paidAmountTouched) return

    const nextTotal = calculateSaleItemsTotal(saleItems) ?? 0
    setCurrentTotal(nextTotal)
    const nextPaidAmount = nextTotal > 0 ? nextTotal : undefined
    if (nextPaidAmount === autoPaidAmountRef.current) return

    syncingPaidAmountRef.current = true
    autoPaidAmountRef.current = nextPaidAmount
    form.setFieldValue('paidAmount', nextPaidAmount)
    queueMicrotask(() => {
      syncingPaidAmountRef.current = false
    })
  }, [open, editId, paidAmountTouched, saleItems, form])

  useEffect(() => {
    if (!initialValues || !open) return

    form.resetFields()
    const itemsWithProduct = (initialValues.items ?? []).map((item) => ({
      ...item,
      _unitMode: 'base',
      _product: item.productId ? productMap.get(item.productId) : undefined,
    }))
    form.setFieldsValue({
      customerId: initialValues.customerId,
      items: itemsWithProduct.length > 0 ? itemsWithProduct : [{}],
      remark: initialValues.remark,
      paidAmount: initialValues.paidAmount,
      method: initialValues.method,
    })
  }, [initialValues, open, form, productMap])

  useEffect(() => {
    if (open && editId) {
      handleOpenEdit(editId)
    }
  }, [open, editId])

  const handleOpenEdit = async (id: number) => {
    const order: SaleOrder = await saleOrderApi.getById(id)
    form.setFieldsValue({
      customerId: order.customerId,
      remark: order.remark,
      items:
        order.items?.map((item) => ({
          productId: item.productId,
          batchId: item.batchId ?? undefined,
          warehouseId: item.warehouseId ?? undefined,
          locationId: item.locationId ?? undefined,
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          unitPrice: item.unitPrice,
          _unitMode: 'base',
          _product: productMap.get(item.productId),
        })) ?? [{}],
    })
    await Promise.all((order.items ?? []).map((item) => loadProductBatches(item.productId)))
  }

  const handleClose = () => {
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    setAdjustTotalPrice(undefined)
    form.resetFields()
    onClose()
  }

  const handleSaveDraft = async () => {
    const values = await form.validateFields(['customerId', 'items'])
    const remark = form.getFieldValue('remark')
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => normalizeSaleItemForSubmit(item))
    const payload = { customerId: values.customerId, remark, items: cleanedItems }
    if (editId) {
      await saleOrderApi.update(editId, payload)
    } else {
      await saleOrderApi.create(payload)
    }
    handleClose()
    onSuccess()
  }

  const handleQuickComplete = async () => {
    const values = await form.validateFields()
    const total = calculateSaleItemsTotal(values.items) ?? 0
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => normalizeSaleItemForSubmit(item))
    const paidAmount = values.paidAmount != null ? values.paidAmount : total
    await saleOrderApi.quickComplete({
      customerId: values.customerId,
      items: cleanedItems,
      remark: values.remark,
      paidAmount,
      method: values.method,
    })
    message.success('销售完成！订单已出库并记录收款')
    handleClose()
    onSuccess()
  }

  const handleAdjustPrices = () => {
    const items = form.getFieldValue('items') || []
    if (items.length === 0 || adjustTotalPrice == null) return

    const originalTotal = items.reduce((sum: number, item: any) => {
      const product = form.getFieldValue(['items', items.indexOf(item), '_product'])
      const row = { ...item, _product: product }
      return sum + getSaleItemQuantity(row) * getSaleItemBaseUnitPrice(row)
    }, 0)

    if (originalTotal <= 0) return

    const ratio = adjustTotalPrice / originalTotal
    const adjustedItems = items.map((item: any, index: number) => {
      const product = form.getFieldValue(['items', index, '_product'])
      const packageConfig = getProductPackageConfig(product)
      const row = { ...item, _product: product }
      const qty = getSaleItemQuantity(row)
      const basePrice = getSaleItemBaseUnitPrice(row)
      let adjustedBasePrice = roundAmount(basePrice * ratio)

      if (index === items.length - 1) {
        const prevTotal = items.slice(0, index).reduce((sum: number, i: any) => {
          const p = form.getFieldValue(['items', items.indexOf(i), '_product'])
          const iRow = { ...i, _product: p }
          const q = getSaleItemQuantity(iRow)
          const adjP = roundAmount(getSaleItemBaseUnitPrice(iRow) * ratio)
          return sum + roundAmount(q * adjP)
        }, 0)
        const lastTotal = roundAmount(adjustTotalPrice - prevTotal)
        adjustedBasePrice = qty > 0 ? roundAmount(lastTotal / qty) : 0
      }

      return {
        ...item,
        unitPrice: packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package'
          ? roundAmount(adjustedBasePrice * packageConfig.size)
          : adjustedBasePrice,
      }
    })

    form.setFieldValue('items', adjustedItems)
    setAdjustTotalPrice(undefined)
    message.success('已按总价调整单价')
  }

  return (
    <Modal
      title={editId ? '编辑销售订单' : '新建销售订单'}
      open={open}
      onCancel={handleClose}
      width={900}
      destroyOnHidden
      footer={
        editId ? undefined : (
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button onClick={handleSaveDraft} style={{ borderColor: '#2D6A4F', color: '#2D6A4F' }}>
              保存草稿
            </Button>
            <Button
              type="primary"
              onClick={handleQuickComplete}
              style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
            >
              保存并完成
            </Button>
          </Space>
        )
      }
      okText="保存"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      onOk={editId ? handleSaveDraft : undefined}
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changedValues, values) => {
            syncComputedAmounts(values.items)
            if (
              Object.prototype.hasOwnProperty.call(changedValues, 'paidAmount') &&
              !syncingPaidAmountRef.current
            ) {
              setPaidAmountTouched(true)
              void form.validateFields(['method']).catch(() => {})
            }
          }}
        >
          <Form.Item name="customerId" label="客户（可为空，即散客）">
            <CustomerSelect customers={customers} placeholder="选择客户（散客可不填）" />
          </Form.Item>
          <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              商品明细（保存后为草稿，点击出库才会扣库存）
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
                        {...fieldProps}
                        name={[fieldProps.name, 'productId']}
                        rules={[{ required: true, message: '请选择商品' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <ProductSelect
                          lazy
                          onProductChange={(p) => {
                            if (p) {
                              form.setFieldValue(
                                ['items', fieldProps.name, 'unitPrice'],
                                p.sellPrice,
                              )
                              form.setFieldValue(['items', fieldProps.name, '_unitMode'], 'base')
                              form.setFieldValue(['items', fieldProps.name, 'quantity'], undefined)
                              form.setFieldValue(['items', fieldProps.name, 'packageQty'], undefined)
                              form.setFieldValue(['items', fieldProps.name, 'looseQty'], undefined)
                              form.setFieldValue(['items', fieldProps.name, '_product'], p)
                              setRowBatch(fieldProps.name, undefined)
                              void loadProductBatches(p.id)
                            }
                          }}
                        />
                      </Form.Item>
                      {(() => {
                        const row = saleItems?.[fieldProps.name]
                        const productId = row?.productId
                        const selectedProduct = row?._product ?? (productId ? productMap.get(Number(productId)) : undefined)
                        const options = productId ? batchOptionsMap[productId] ?? [] : []
                        return (
                          <Form.Item
                            {...fieldProps}
                            name={[fieldProps.name, 'batchId']}
                            label=""
                            style={{ marginBottom: 0 }}
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
                              style={{ width: 185 }}
                              options={options.map((batch) => makeBatchSelectOption(batch))}
                              onChange={(value) => {
                                const batch = options.find((item) => item.id === value)
                                setRowBatch(fieldProps.name, batch)
                              }}
                            />
                          </Form.Item>
                        )
                      })()}
                      <Form.Item {...fieldProps} name={[fieldProps.name, 'warehouseId']} hidden>
                        <Input type="hidden" />
                      </Form.Item>
                      <Form.Item {...fieldProps} name={[fieldProps.name, 'locationId']} hidden>
                        <Input type="hidden" />
                      </Form.Item>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                          prev?.items?.[fieldProps.name]?.productId !==
                          cur?.items?.[fieldProps.name]?.productId ||
                          prev?.items?.[fieldProps.name]?.batchId !==
                          cur?.items?.[fieldProps.name]?.batchId ||
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
                          const stockQty = Number(selectedProduct?.availableStockQty ?? selectedProduct?.stockQty ?? 0)
                          const selectedBatchId = getFieldValue(['items', fieldProps.name, 'batchId'])
                          const selectedBatch = selectedProduct?.id
                            ? batchOptionsMap[selectedProduct.id]?.find((batch) => batch.id === selectedBatchId)
                            : undefined
                          const availableQty = Number(selectedBatch?.quantity ?? stockQty)
                          const packageConfig = getProductPackageConfig(selectedProduct)
                          const unitMode = (getFieldValue(['items', fieldProps.name, '_unitMode']) ?? 'base') as UnitMode
                          const availableText = formatQuantityByUnitMode(availableQty, packageConfig, unitMode)
                          return (
                            <>
                              {packageConfig.unit && packageConfig.size > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: 174 }}>
                                  <Form.Item
                                    {...fieldProps}
                                    name={[fieldProps.name, '_unitMode']}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Radio.Group
                                      size="small"
                                      value={unitMode}
                                      onChange={(event) => handleSaleUnitModeChange(fieldProps.name, event.target.value)}
                                    >
                                      <Radio.Button value="base">{packageConfig.baseUnit || '散'}</Radio.Button>
                                      <Radio.Button value="package">{packageConfig.unit}</Radio.Button>
                                    </Radio.Group>
                                  </Form.Item>
                                  <Form.Item
                                    key={`${key}-${unitMode}`}
                                    {...fieldProps}
                                    name={[fieldProps.name, unitMode === 'package' ? 'packageQty' : 'quantity']}
                                    rules={[
                                      { required: true, message: '数量必填' },
                                      {
                                        validator: (_, value) => {
                                          const num = Number(value)
                                          if (!Number.isFinite(num) || num <= 0) {
                                            return Promise.reject(new Error('数量需大于 0'))
                                          }
                                          const baseQty = unitMode === 'package' ? num * packageConfig.size : num
                                          if (selectedProduct?.id && baseQty > availableQty) {
                                            return Promise.reject(
                                              new Error(`数量不能超过所选批次库存（${availableText}）`),
                                            )
                                          }
                                          return Promise.resolve()
                                        },
                                      },
                                    ]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber
                                      placeholder={unitMode === 'package' ? packageConfig.unit : packageConfig.baseUnit || '数量'}
                                      min={0}
                                      max={unitMode === 'package' ? availableQty / packageConfig.size : availableQty}
                                      step={QUANTITY_STEP}
                                      precision={QUANTITY_PRECISION}
                                      style={{ width: 82 }}
                                    />
                                  </Form.Item>
                                </div>
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
                                        if (selectedProduct?.id && num > availableQty) {
                                          return Promise.reject(
                                            new Error(`数量不能超过所选批次库存（${availableText}）`),
                                          )
                                        }
                                        return Promise.resolve()
                                      },
                                    },
                                  ]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <InputNumber
                                    placeholder="数量"
                                    min={QUANTITY_STEP}
                                    max={availableQty}
                                    step={QUANTITY_STEP}
                                    precision={QUANTITY_PRECISION}
                                    style={{ width: 90 }}
                                  />
                                </Form.Item>
                              )}
                              <Text
                                type="secondary"
                                style={{
                                  width: 80,
                                  lineHeight: '32px',
                                  textAlign: 'center',
                                }}
                              >
                                库存 {availableText}
                              </Text>
                            </>
                          )
                        }}
                      </Form.Item>
                      <Form.Item
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
                              rules={[{ required: true, message: '售价必填' }]}
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber
                                placeholder={`售价/${priceUnit}`}
                                prefix="¥"
                                addonAfter={`/${priceUnit}`}
                                min={0}
                                style={{ width: 130 }}
                              />
                            </Form.Item>
                          )
                        }}
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button danger type="link" onClick={() => remove(fieldProps.name)}>
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
          <div
            style={{
              background: '#f0f5ff',
              border: '1px solid #adc6ff',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Space align="center" wrap>
              <Text type="secondary">当前总价：</Text>
              <Text strong style={{ fontSize: 16 }}>
                ¥{currentTotal.toFixed(2)}
              </Text>
              <Divider type="vertical" />
              <Text type="secondary">调整总价：</Text>
              <InputNumber
                prefix="¥"
                min={0}
                precision={2}
                style={{ width: 140 }}
                placeholder="输入总价"
                value={adjustTotalPrice}
                onChange={(v) => setAdjustTotalPrice(v ?? undefined)}
              />
              <Button
                type="primary"
                size="small"
                disabled={
                  adjustTotalPrice == null ||
                  (saleItems?.length ?? 0) === 0 ||
                  adjustTotalPrice === currentTotal
                }
                onClick={handleAdjustPrices}
              >
                按总价调整单价
              </Button>
              {adjustTotalPrice != null && adjustTotalPrice !== currentTotal && (
                <Text type="warning" style={{ fontSize: 12 }}>
                  差额：¥{(adjustTotalPrice - currentTotal).toFixed(2)}
                </Text>
              )}
            </Space>
          </div>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
          {!editId && (
            <div
              style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 10,
                padding: 16,
                marginTop: 4,
              }}
            >
              <Text
                style={{ fontSize: 12, color: '#ad6800', display: 'block', marginBottom: 12 }}
              >
                快捷完成时会自动出库并登记收款；会根据商品与数量自动计算实收金额，必须要选择收款方式。
              </Text>
              <Space>
                <Form.Item name="paidAmount" label="实收金额" style={{ marginBottom: 0 }}>
                  <InputNumber
                    prefix="¥"
                    min={0}
                    precision={2}
                    style={{ width: 160 }}
                    placeholder="按订单金额自动填充"
                    onChange={() => form.validateFields(['method']).catch(() => {})}
                  />
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
                  <Select
                    style={{ width: 140 }}
                    placeholder="选择方式"
                    allowClear
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
