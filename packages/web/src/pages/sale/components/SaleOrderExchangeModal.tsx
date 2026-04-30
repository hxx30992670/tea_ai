import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { saleOrderApi } from '@/api/sale'
import { stockApi } from '@/api/stock'
import { AFTER_SALE_REASON_OPTIONS } from '@/constants/after-sale'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import { filterBatchSelectOption, makeBatchSelectOption, renderBatchSelectOption } from '@/components/BatchSelectOption'
import ProductSelect from '@/components/ProductSelect'
import { getBatchAutoPickPlaceholder, getBatchAutoPickStrategy } from '@/utils/batch-strategy'
import {
  formatCompositeQuantity,
  formatQuantityByUnitMode,
  formatQuantityNumber,
  getProductPackageConfig,
} from '@/utils/packaging'
import type { Product, SaleExchangeableItem, SaleOrder, StockBatch } from '@/types'

const { Text } = Typography
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4
const RETURN_STOCK_STATUS_PENDING_INSPECTION = 2
type UnitMode = 'base' | 'package'
type ExchangeFormItem = {
  productId?: number
  quantity?: number
  packageQty?: number
  looseQty?: number
  unitPrice?: number
  _unitMode?: UnitMode
  batchId?: number
  warehouseId?: number
  locationId?: number
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100
}

interface SaleOrderExchangeModalProps {
  open: boolean
  order: SaleOrder | null
  loading: boolean
  products: Product[]
  productMap: Map<number, Product>
  onClose: () => void
  onSuccess: (order: SaleOrder) => void
}

export function SaleOrderExchangeModal({
  open,
  order,
  loading,
  products,
  productMap,
  onClose,
  onSuccess,
}: SaleOrderExchangeModalProps) {
  const [form] = Form.useForm()

  const returnQuantities = Form.useWatch('returnQuantities', form) as Record<string, number> | undefined
  const returnPackageQuantities = Form.useWatch('returnPackageQuantities', form) as Record<string, number> | undefined
  const returnUnitModes = Form.useWatch('returnUnitModes', form) as Record<string, UnitMode> | undefined
  const exchangeItems = Form.useWatch('exchangeItems', form) as
    | ExchangeFormItem[]
    | undefined
  const [currentOutAmount, setCurrentOutAmount] = useState(0)
  const [batchOptionsMap, setBatchOptionsMap] = useState<Record<number, StockBatch[]>>({})
  const returnableItems = useMemo<SaleExchangeableItem[]>(
    () =>
      ((order?.exchangeableItems ?? order?.items ?? []) as SaleExchangeableItem[]).map((item) => ({
        ...item,
        sourceType: item.sourceType ?? 'sale_order_item',
        sourceKey: item.sourceKey ?? `sale-order-item-${item.id}`,
        saleOrderItemId: item.saleOrderItemId ?? item.id,
        sourceExchangeItemId: item.sourceExchangeItemId ?? null,
      })),
    [order],
  )

  const loadProductBatches = async (productId: number) => {
    if (batchOptionsMap[productId]) return batchOptionsMap[productId]
    const res = await stockApi.batches({ productId, availableOnly: '1', status: 1, pageSize: 50 })
    const list = res.list ?? []
    setBatchOptionsMap((prev) => ({ ...prev, [productId]: list }))
    return list
  }

  const returnAmount = useMemo(
    () =>
      returnableItems.reduce((sum, item) => {
        const itemKey = item.sourceKey
        const packageSize = Number(item.packageSize ?? 0)
        const hasPack = !!(item.packageUnit && packageSize > 0)
        const unitMode = returnUnitModes?.[itemKey] ?? 'base'
        const qty = hasPack && unitMode === 'package'
          ? Number(returnPackageQuantities?.[itemKey] ?? 0) * packageSize
          : hasPack
            ? Number(returnQuantities?.[itemKey] ?? 0)
          : Number(returnQuantities?.[itemKey] ?? 0)
        return sum + qty * item.unitPrice
      }, 0),
    [returnableItems, returnQuantities, returnPackageQuantities, returnUnitModes]
  )

  const calculateExchangeOutAmount = (items?: ExchangeFormItem[]) =>
    (items ?? []).reduce((sum, item) => {
      const product = productMap.get(Number(item.productId))
      const packageConfig = getProductPackageConfig(product)
      const qty =
        packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package'
          ? Number(item.packageQty ?? 0) * packageConfig.size
          : packageConfig.unit && packageConfig.size > 0 && item._unitMode !== 'base' && (item.packageQty != null || item.looseQty != null)
            ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
          : Number(item.quantity ?? 0)
      const unitPrice = packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package'
        ? roundAmount(Number(item.unitPrice ?? 0) / packageConfig.size)
        : Number(item.unitPrice ?? 0)
      return sum + qty * unitPrice
    }, 0)

  const syncExchangeAmounts = (items?: Array<Record<string, unknown>>) => {
    setCurrentOutAmount(calculateExchangeOutAmount(items as ExchangeFormItem[] | undefined))
  }

  const outAmount = currentOutAmount

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldValue('exchangeItems', [{}])
    setCurrentOutAmount(0)
    setBatchOptionsMap({})
  }, [open, form])

  useEffect(() => {
    setCurrentOutAmount(calculateExchangeOutAmount(exchangeItems))
  }, [exchangeItems, productMap])

  useEffect(() => {
    if (!open) return
    const diff = returnAmount - outAmount
    if (diff > 0) {
      form.setFieldValue('refundAmount', diff)
      form.setFieldValue('receiveAmount', 0)
    } else if (diff < 0) {
      form.setFieldValue('refundAmount', 0)
      form.setFieldValue('receiveAmount', -diff)
    } else {
      form.setFieldValue('refundAmount', 0)
      form.setFieldValue('receiveAmount', 0)
    }
    form.validateFields(['method']).catch(() => {})
  }, [open, returnAmount, outAmount, form])

  const renderPriceWithRef = (unitPrice: number, productId?: number) => {
    const sellPrice = productId ? productMap.get(productId)?.sellPrice : undefined
    if (sellPrice == null || unitPrice === sellPrice) {
      return `¥${unitPrice.toLocaleString()}`
    }
    return (
      <Space>
        <Text strong style={{ color: '#faad14' }}>¥{unitPrice.toLocaleString()}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>原价 ¥{sellPrice.toLocaleString()}</Text>
      </Space>
    )
  }

  const handleExchangeUnitModeChange = (rowIndex: number, nextMode: UnitMode) => {
    const items = ([...(form.getFieldValue('exchangeItems') ?? [])]) as Array<Record<string, unknown>>
    const currentItem = { ...(items[rowIndex] ?? {}) }
    const product = productMap.get(Number(currentItem.productId))
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
      form.setFieldsValue({ exchangeItems: items })
      syncExchangeAmounts(items)
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
    form.setFieldsValue({ exchangeItems: items })
    syncExchangeAmounts(items)
  }

  const getExchangeBaseUnitPrice = (item: Record<string, unknown>) => {
    const product = productMap.get(Number(item.productId))
    const packageConfig = getProductPackageConfig(product)
    const price = Number(item.unitPrice ?? 0)
    if (packageConfig.unit && packageConfig.size > 0 && item._unitMode === 'package') {
      return roundAmount(price / packageConfig.size)
    }
    return price
  }

  const handleReturnQtyChange = (itemId: string, maxQty: number, unit: string, newQty: number | null) => {
    const qty = Number(newQty ?? 0)
    if (qty > maxQty) {
      form.setFieldValue(['returnQuantities', itemId], maxQty)
      void message.warning(`超过可换回数量，已调整为 ${formatQuantityNumber(maxQty)}${unit}`)
    }
  }

  const buildPayload = (values: Record<string, unknown>) => {
    const returnUnitModesMap = (values.returnUnitModes ?? {}) as Record<string, UnitMode>
    const returnItems = returnableItems
      .map((item) => {
        const hasPack = !!(item.packageUnit && Number(item.packageSize ?? 0) > 0)
        const unitMode = returnUnitModesMap[item.sourceKey] ?? 'base'
        const baseQty = Number((values.returnQuantities as Record<string, number> | undefined)?.[item.sourceKey] ?? 0)
        const packQty = Number((values.returnPackageQuantities as Record<string, number> | undefined)?.[item.sourceKey] ?? 0)
        return {
          saleOrderItemId: item.sourceType === 'sale_order_item' ? item.saleOrderItemId ?? item.id : undefined,
          sourceExchangeItemId: item.sourceType === 'exchange_out_item'
            ? item.sourceExchangeItemId ?? item.id
            : undefined,
          quantity: hasPack && unitMode === 'package' ? undefined : baseQty || undefined,
          packageQty: hasPack && unitMode === 'package' ? packQty || undefined : undefined,
          looseQty: undefined,
          stockStatus: RETURN_STOCK_STATUS_PENDING_INSPECTION,
        }
      })
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0)

    const outItems = ((values.exchangeItems as Array<Record<string, unknown>> | undefined) ?? [])
      .map((item) => {
        const unitMode = item._unitMode as UnitMode | undefined
        return {
          productId: Number(item.productId),
          quantity: unitMode === 'package' ? undefined : Number(item.quantity) || undefined,
          packageQty: unitMode === 'package' ? Number(item.packageQty) || undefined : undefined,
          looseQty: undefined,
          unitPrice: getExchangeBaseUnitPrice(item),
          batchId: Number(item.batchId) || undefined,
          warehouseId: Number(item.warehouseId) || undefined,
          locationId: Number(item.locationId) || undefined,
        }
      })
      .filter((item) => item.productId && (Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0))

    return {
      returnItems,
      exchangeItems: outItems,
      refundAmount: Number(values.refundAmount ?? 0),
      receiveAmount: Number(values.receiveAmount ?? 0),
      method: (values.method as string | undefined),
      reasonCode: (values.reasonCode as string | undefined),
      reasonNote: (values.reasonNote as string | undefined),
      remark: (values.remark as string | undefined),
    }
  }

  const handleOk = async () => {
    if (!order) return
    const values = await form.validateFields()
    const payload = buildPayload(values as Record<string, unknown>)

    if (payload.returnItems.length === 0) {
      message.error('请至少填写一条换回商品数量')
      return
    }
    if (payload.exchangeItems.length === 0) {
      message.error('请至少填写一条换出商品')
      return
    }

    const updatedOrder = await saleOrderApi.createExchange(order.id, payload)
    message.success('换货处理成功')
    onClose()
    onSuccess(updatedOrder)
  }

  return (
    <Modal
      title={`销售换货：${order?.orderNo ?? ''}`}
      open={open}
      onCancel={onClose}
      width={1000}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleOk} style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>
            确认换货
          </Button>
        </div>
      }
    >
      <Spin spinning={loading}>
        {order && (
          <Form
            form={form}
            layout="vertical"
            onValuesChange={(_, values) => {
              syncExchangeAmounts(values.exchangeItems)
            }}
          >
            <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
              <Row gutter={0} style={{ textAlign: 'center', marginBottom: 12 }}>
                <Col span={8} style={{ borderRight: '1px solid #f0f0f0', paddingRight: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>换回金额</Text>
                  <div><Text strong style={{ fontSize: 16 }}>¥{returnAmount.toLocaleString()}</Text></div>
                </Col>
                <Col span={8} style={{ borderRight: '1px solid #f0f0f0', padding: '0 12px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>换出金额</Text>
                  <div><Text strong style={{ fontSize: 16 }}>¥{outAmount.toLocaleString()}</Text></div>
                </Col>
                <Col span={8} style={{ paddingLeft: 12 }}>
                  {returnAmount > outAmount ? (
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>应退给客户</Text>
                      <div><Text strong style={{ fontSize: 16, color: '#52c41a' }}>¥{(returnAmount - outAmount).toLocaleString()}</Text></div>
                    </>
                  ) : outAmount > returnAmount ? (
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>客户应补差</Text>
                      <div><Text strong style={{ fontSize: 16, color: '#fa8c16' }}>¥{(outAmount - returnAmount).toLocaleString()}</Text></div>
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
                <Text type="secondary" style={{ fontSize: 12 }}>客户：<Text>{order.customerName || '散客'}</Text></Text>
                <Text type="secondary" style={{ fontSize: 12 }}>当前已收款：<Text>¥{order.receivedAmount.toLocaleString()}</Text></Text>
              </div>
            </Card>

            <Divider orientation="left">换回商品</Divider>
            <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {returnableItems.length > 0 ? returnableItems.map((item) => {
                  const itemKey = item.sourceKey
                  const sourceText = item.sourceType === 'exchange_out_item' ? '已换出' : '已售'
                  const sourceHint = item.sourceType === 'exchange_out_item'
                    ? `来自换货 ${item.exchangeNo || `#${item.exchangeId ?? item.id}`}`
                    : undefined
                  return (
                  <div
                    key={itemKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(180px, 1fr) 90px 110px minmax(152px, 220px)',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Text strong ellipsis>{item.productName}</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {sourceText} {formatCompositeQuantity(item)}，可换回 {formatQuantityNumber(item.remainingQuantity ?? 0)}{item.unit || ''}
                        </Text>
                      </div>
                      {sourceHint ? <div><Text type="secondary" style={{ fontSize: 12 }}>{sourceHint}</Text></div> : null}
                    </div>
                    <div style={{ minWidth: 0, textAlign: 'right' }}>{renderPriceWithRef(item.unitPrice, item.productId)}</div>
                    <Text type="secondary" style={{ minWidth: 0, whiteSpace: 'nowrap', fontSize: 13 }}>
                      {item.packageUnit && item.packageSize
                        ? formatQuantityByUnitMode(
                            item.remainingQuantity ?? 0,
                            { unit: item.packageUnit, size: item.packageSize, baseUnit: item.unit },
                            returnUnitModes?.[itemKey] ?? 'base',
                          )
                        : `${formatQuantityNumber(item.remainingQuantity ?? 0)}${item.unit || ''}`}
                    </Text>
                    {item.packageUnit && item.packageSize ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(72px, 1fr)', alignItems: 'center', gap: 0, minWidth: 0 }}>
                          <Form.Item name={['returnUnitModes', itemKey]} style={{ marginBottom: 0 }} initialValue="base">
                            <Radio.Group
                              size="small"
                              onChange={(e) => {
                                const nextMode = e.target.value as UnitMode
                                const packageSize = Number(item.packageSize ?? 0)
                                const prevMode: UnitMode = nextMode === 'package' ? 'base' : 'package'
                                const prevPkgQty = Number(form.getFieldValue(['returnPackageQuantities', itemKey]) ?? 0)
                                const prevQty = Number(form.getFieldValue(['returnQuantities', itemKey]) ?? 0)
                                const currentBaseQty = prevMode === 'package' ? prevPkgQty * packageSize : prevQty

                                if (nextMode === 'package') {
                                  form.setFieldValue(['returnPackageQuantities', itemKey], currentBaseQty > 0 ? Number((currentBaseQty / packageSize).toFixed(4)) : undefined)
                                  form.setFieldValue(['returnQuantities', itemKey], undefined)
                                } else {
                                  form.setFieldValue(['returnQuantities', itemKey], currentBaseQty > 0 ? Number(currentBaseQty.toFixed(4)) : undefined)
                                  form.setFieldValue(['returnPackageQuantities', itemKey], undefined)
                                }
                              }}
                            >
                              <Radio.Button value="base">{item.unit || '散'}</Radio.Button>
                              <Radio.Button value="package">{item.packageUnit}</Radio.Button>
                            </Radio.Group>
                          </Form.Item>
                          {(() => {
                            const unitMode = returnUnitModes?.[itemKey] ?? 'base'
                            const returnPackageSize = Number(item.packageSize ?? 0)
                            const maxBase = item.remainingQuantity ?? 0
                            const maxText = formatQuantityByUnitMode(
                              maxBase,
                              { unit: item.packageUnit, size: item.packageSize, baseUnit: item.unit },
                              unitMode,
                            )
                            return (
                              <Form.Item
                                key={`ret-qty-${itemKey}-${unitMode}`}
                                name={[unitMode === 'package' ? 'returnPackageQuantities' : 'returnQuantities', itemKey]}
                                rules={[
                                  {
                                    validator: (_, value) => {
                                      const num = Number(value)
                                      if (num != null && num !== 0 && (!Number.isFinite(num) || num <= 0)) {
                                        return Promise.reject(new Error('数量需大于 0'))
                                      }
                                      const baseQty = unitMode === 'package' ? num * returnPackageSize : num
                                      if (num > 0 && baseQty > maxBase) {
                                        return Promise.reject(new Error(`不能超过可换回数量（${maxText}）`))
                                      }
                                      return Promise.resolve()
                                    },
                                  },
                                ]}
                                style={{ marginBottom: 0 }}
                              >
                                <InputNumber
                                  placeholder={unitMode === 'package' ? item.packageUnit : item.unit || '数量'}
                                  min={0}
                                  max={unitMode === 'package' ? maxBase / returnPackageSize : maxBase}
                                  step={QUANTITY_STEP}
                                  precision={QUANTITY_PRECISION}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            )
                          })()}
                        </div>
                      </>
                    ) : (
                      <Form.Item name={['returnQuantities', itemKey]} style={{ marginBottom: 0 }}>
                        <InputNumber
                          min={0}
                          max={item.remainingQuantity ?? 0}
                          style={{ width: 152 }}
                          onChange={(v) => handleReturnQtyChange(
                            itemKey,
                            item.remainingQuantity ?? 0,
                            item.unit ?? '',
                            v,
                          )}
                        />
                      </Form.Item>
                    )}
                    <Text type="secondary" style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                      换回商品统一进入售后处理台，检查后再决定可售入库、调仓或报损。
                    </Text>
                  </div>
                )}) : (
                  <Text type="secondary">当前没有可换回的商品来源</Text>
                )}
              </Space>
            </div>

            <Divider orientation="left">换出商品</Divider>
            <Form.List name="exchangeItems">
              {(fields, { add, remove }) => (
                <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  {fields.map(({ key, ...fieldProps }) => {
                    return (
                      <Space key={`${key}-${fieldProps.name}`} wrap size={[8, 8]} style={{ width: '100%', marginBottom: 8 }} align="start">
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'productId']} rules={[{ required: true, message: '请选择商品' }]} style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
                          <ProductSelect
                            products={products}
                            placeholder="选择换出商品"
                            onProductChange={(p: Product | undefined) => {
                              const items = ([...(form.getFieldValue('exchangeItems') ?? [])]) as Array<Record<string, unknown>>
                              const currentItem = { ...(items[fieldProps.name] ?? {}) }
                              items[fieldProps.name] = {
                                ...currentItem,
                                productId: p?.id,
                                unitPrice: p?.sellPrice,
                                _unitMode: 'base',
                                quantity: undefined,
                                packageQty: undefined,
                                looseQty: undefined,
                                batchId: undefined,
                                warehouseId: undefined,
                                locationId: undefined,
                              }
                              form.setFieldsValue({ exchangeItems: items })
                              syncExchangeAmounts(items)
                              if (p) void loadProductBatches(p.id)
                            }}
                          />
                        </Form.Item>
                        {(() => {
                          const row = exchangeItems?.[fieldProps.name]
                          const productId = Number(row?.productId)
                          const product = productMap.get(productId)
                          const options = productId ? (batchOptionsMap[productId] ?? []) : []
                          return (
                            <Form.Item
                              {...fieldProps}
                              name={[fieldProps.name, 'batchId']}
                              style={{ marginBottom: 0 }}
                              rules={[
                                {
                                  validator: (_, value) => {
                                    if (getBatchAutoPickStrategy(product) === 'manual_only' && !value) {
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
                                placeholder={getBatchAutoPickPlaceholder(product)}
                                style={{ width: 220, maxWidth: '100%' }}
                                optionLabelProp="label"
                                options={options.map((batch) => makeBatchSelectOption(batch))}
                                optionRender={renderBatchSelectOption}
                                onChange={(val) => {
                                  const b = options.find((o) => o.id === val)
                                  form.setFieldValue(['exchangeItems', fieldProps.name, 'warehouseId'], b?.warehouseId)
                                  form.setFieldValue(['exchangeItems', fieldProps.name, 'locationId'], b?.locationId ?? undefined)
                                }}
                              />
                            </Form.Item>
                          )
                        })()}
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'warehouseId']} hidden><Input type="hidden" /></Form.Item>
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'locationId']} hidden><Input type="hidden" /></Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, cur) =>
                            prev?.exchangeItems?.[fieldProps.name]?.productId !== cur?.exchangeItems?.[fieldProps.name]?.productId ||
                            prev?.exchangeItems?.[fieldProps.name]?._unitMode !== cur?.exchangeItems?.[fieldProps.name]?._unitMode
                          }
                        >
                          {({ getFieldValue }) => {
                            const product = productMap.get(Number(getFieldValue(['exchangeItems', fieldProps.name, 'productId'])))
                            const packageConfig = getProductPackageConfig(product)
                            const unitMode = (getFieldValue(['exchangeItems', fieldProps.name, '_unitMode']) ?? 'base') as UnitMode
                            const availableQty = Number(product?.availableStockQty ?? product?.stockQty ?? 0)
                            const availableText = formatQuantityByUnitMode(availableQty, packageConfig, unitMode)

                            if (packageConfig.unit && packageConfig.size > 0) {
                              return (
                                <>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(88px, 1fr)', alignItems: 'center', gap: 0, width: 174, maxWidth: '100%' }}>
                                    <Form.Item {...fieldProps} name={[fieldProps.name, '_unitMode']} style={{ marginBottom: 0 }}>
                                      <Radio.Group
                                        size="small"
                                        value={unitMode}
                                        onChange={(event) => handleExchangeUnitModeChange(fieldProps.name, event.target.value)}
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
                                            if (product?.id && baseQty > availableQty) {
                                              return Promise.reject(new Error(`数量不能超过库存（${availableText}）`))
                                            }
                                            return Promise.resolve()
                                          },
                                        },
                                      ]}
                                      style={{ marginBottom: 0 }}
                                    >
                                      <InputNumber
                                        placeholder={unitMode === 'package' ? packageConfig.unit : packageConfig.baseUnit || '数量'}
                                        min={QUANTITY_STEP}
                                        max={unitMode === 'package' ? availableQty / packageConfig.size : availableQty}
                                        step={QUANTITY_STEP}
                                        precision={QUANTITY_PRECISION}
                                        style={{ width: '100%' }}
                                      />
                                    </Form.Item>
                                  </div>
                                  <Text
                                    type="secondary"
                                    style={{ minWidth: 96, lineHeight: '32px', textAlign: 'center' }}
                                  >
                                    库存 {availableText}
                                  </Text>
                                </>
                              )
                            }

                            return (
                              <>
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
                                        if (product?.id && num > availableQty) {
                                          return Promise.reject(new Error(`数量不能超过库存（${availableText}）`))
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
                                  style={{ width: 96, maxWidth: '100%' }}
                                />
                              </Form.Item>
                              <Text
                                type="secondary"
                                style={{ minWidth: 96, lineHeight: '32px', textAlign: 'center' }}
                              >
                                库存 {availableText}
                              </Text>
                              </>
                            )
                          }}
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, cur) =>
                          prev?.exchangeItems?.[fieldProps.name]?.productId !== cur?.exchangeItems?.[fieldProps.name]?.productId ||
                          prev?.exchangeItems?.[fieldProps.name]?._unitMode !== cur?.exchangeItems?.[fieldProps.name]?._unitMode
                        }>
                          {({ getFieldValue }) => {
                            const product = productMap.get(Number(getFieldValue(['exchangeItems', fieldProps.name, 'productId'])))
                            const currentPackageConfig = getProductPackageConfig(product)
                            const unitMode = (getFieldValue(['exchangeItems', fieldProps.name, '_unitMode']) ?? 'base') as UnitMode
                            const priceUnit = currentPackageConfig.unit && currentPackageConfig.size > 0 && unitMode === 'package'
                              ? currentPackageConfig.unit
                              : currentPackageConfig.baseUnit || product?.unit || '单位'
                            return (
                              <Form.Item {...fieldProps} name={[fieldProps.name, 'unitPrice']} rules={[{ required: true, message: '售价必填' }]} style={{ marginBottom: 0 }}>
                                <InputNumber placeholder={`单价/${priceUnit}`} prefix="¥" addonAfter={`/${priceUnit}`} min={0} style={{ width: 160, maxWidth: '100%' }} />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                        <Button danger type="link" style={{ visibility: fields.length > 1 ? 'visible' : 'hidden' }} onClick={() => remove(fieldProps.name)}>删除</Button>
                      </Space>
                    )
                  })}
                  <Button type="dashed" block size="small" onClick={() => add({})}>+ 添加换出商品</Button>
                </div>
              )}
            </Form.List>

            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="refundAmount" label="本次退款金额">
                  <InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => form.validateFields(['method'])} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="receiveAmount" label="本次补差收款">
                  <InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} onChange={() => form.validateFields(['method'])} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="method"
                  label="结算方式"
                  dependencies={['refundAmount', 'receiveAmount']}
                  rules={[
                    {
                      validator(_, value) {
                        const refund = Number(form.getFieldValue('refundAmount') ?? 0)
                        const receive = Number(form.getFieldValue('receiveAmount') ?? 0)
                        if ((refund > 0 || receive > 0) && !value) return Promise.reject(new Error('有退款或收款金额时必须选择结算方式'))
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="请选择结算方式" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="reasonCode" label="售后原因">
                  <Select allowClear options={AFTER_SALE_REASON_OPTIONS as never} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="reasonNote" label="原因说明">
                  <Input placeholder="例如：发错货，换同价位商品" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="例如：顾客将大红袍换成同价位铁观音" />
            </Form.Item>
          </Form>
        )}
      </Spin>
    </Modal>
  )
}
