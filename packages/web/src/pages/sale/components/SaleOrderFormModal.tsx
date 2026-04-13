import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { saleOrderApi } from '@/api/sale'
import type { Customer, Product, SaleOrder } from '@/types'
import { getProductPackageConfig } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import ProductSelect from '@/components/ProductSelect'
import CustomerSelect from '@/components/CustomerSelect'

const { Text } = Typography
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4

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
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _product?: Product
  }> | undefined
  const autoPaidAmountRef = useRef<number | undefined>(undefined)
  const syncingPaidAmountRef = useRef(false)
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  const [adjustTotalPrice, setAdjustTotalPrice] = useState<number | undefined>(undefined)

  const getSaleItemQuantity = (item: {
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    _product?: Product
  }) => {
    const product = item._product ?? (item.productId ? productMap.get(item.productId) : undefined)
    const packageConfig = getProductPackageConfig(product)
    if (packageConfig.unit && packageConfig.size > 0) {
      return Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
    }
    return Number(item.quantity ?? 0)
  }

  const calculateSaleItemsTotal = (items?: Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _product?: Product
  }>) => {
    const total = (items ?? []).reduce(
      (sum, item) => sum + getSaleItemQuantity(item) * Number(item.unitPrice ?? 0),
      0,
    )
    return total > 0 ? Number(total.toFixed(2)) : undefined
  }

  useEffect(() => {
    if (!open || editId || paidAmountTouched) return

    const nextPaidAmount = calculateSaleItemsTotal(saleItems)
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
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          unitPrice: item.unitPrice,
          _product: productMap.get(item.productId),
        })) ?? [{}],
    })
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
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => {
      const { _product, ...rest } = item
      return rest
    })
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
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => {
      const { _product, ...rest } = item
      return rest
    })
    const total = calculateSaleItemsTotal(cleanedItems) ?? 0
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
      const pkgSize = product?.packageSize ?? 1
      const qty = item.packageQty != null || item.looseQty != null
        ? (item.packageQty ?? 0) * pkgSize + (item.looseQty ?? 0)
        : (item.quantity ?? 0)
      return sum + qty * (item.unitPrice ?? 0)
    }, 0)

    if (originalTotal <= 0) return

    const ratio = adjustTotalPrice / originalTotal
    const adjustedItems = items.map((item: any, index: number) => {
      const product = form.getFieldValue(['items', index, '_product'])
      const pkgSize = product?.packageSize ?? 1
      const qty = item.packageQty != null || item.looseQty != null
        ? (item.packageQty ?? 0) * pkgSize + (item.looseQty ?? 0)
        : (item.quantity ?? 0)
      let adjustedPrice = Math.round((item.unitPrice ?? 0) * ratio * 100) / 100

      if (index === items.length - 1) {
        const prevTotal = items.slice(0, index).reduce((sum: number, i: any) => {
          const p = form.getFieldValue(['items', items.indexOf(i), '_product'])
          const ps = p?.packageSize ?? 1
          const q = i.packageQty != null || i.looseQty != null
            ? (i.packageQty ?? 0) * ps + (i.looseQty ?? 0)
            : (i.quantity ?? 0)
          const adjP = Math.round((i.unitPrice ?? 0) * ratio * 100) / 100
          return sum + Math.round(q * adjP * 100) / 100
        }, 0)
        const lastTotal = Math.round((adjustTotalPrice - prevTotal) * 100) / 100
        adjustedPrice = qty > 0 ? Math.round((lastTotal / qty) * 100) / 100 : 0
      }

      return { ...item, unitPrice: adjustedPrice }
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
      width={620}
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
          onValuesChange={(changedValues) => {
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
                              form.setFieldValue(['items', fieldProps.name, '_product'], p)
                            }
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                          prev?.items?.[fieldProps.name]?.productId !==
                          cur?.items?.[fieldProps.name]?.productId
                        }
                      >
                        {({ getFieldValue }) => {
                          const selectedProduct = getFieldValue([
                            'items',
                            fieldProps.name,
                            '_product',
                          ])
                          const stockQty = Number(selectedProduct?.stockQty ?? 0)
                          const packageConfig = getProductPackageConfig(selectedProduct)
                          return (
                            <>
                              {packageConfig.unit && packageConfig.size > 0 ? (
                                <>
                                  <Form.Item
                                    {...fieldProps}
                                    name={[fieldProps.name, 'packageQty']}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber
                                      placeholder={packageConfig.unit}
                                      min={0}
                                      step={QUANTITY_STEP}
                                      precision={QUANTITY_PRECISION}
                                      style={{ width: 82 }}
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    {...fieldProps}
                                    name={[fieldProps.name, 'looseQty']}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber
                                      placeholder={packageConfig.baseUnit || '散'}
                                      min={0}
                                      step={QUANTITY_STEP}
                                      precision={QUANTITY_PRECISION}
                                      style={{ width: 82 }}
                                    />
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
                                        if (selectedProduct?.id && num > stockQty) {
                                          return Promise.reject(
                                            new Error(`数量不能超过库存（${stockQty}）`),
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
                                    max={stockQty}
                                    step={QUANTITY_STEP}
                                    precision={QUANTITY_PRECISION}
                                    style={{ width: 90 }}
                                  />
                                </Form.Item>
                              )}
                              <Text
                                type="secondary"
                                style={{
                                  width: 90,
                                  lineHeight: '32px',
                                  textAlign: 'center',
                                }}
                              >
                                库存 {stockQty}
                              </Text>
                            </>
                          )
                        }}
                      </Form.Item>
                      <Form.Item
                        {...fieldProps}
                        name={[fieldProps.name, 'unitPrice']}
                        rules={[{ required: true, message: '售价必填' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          placeholder="实际售价"
                          prefix="¥"
                          min={0}
                          style={{ width: 120 }}
                        />
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
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.items !== cur?.items}>
            {({ getFieldValue }) => {
              const items = getFieldValue('items') || []
              const currentTotal = items.reduce((sum: number, item: any) => {
                const product = getFieldValue(['items', items.indexOf(item), '_product'])
                const pkgSize = product?.packageSize ?? 1
                const qty =
                  item.packageQty != null || item.looseQty != null
                    ? (item.packageQty ?? 0) * pkgSize + (item.looseQty ?? 0)
                    : (item.quantity ?? 0)
                return sum + qty * (item.unitPrice ?? 0)
              }, 0)
              return (
                <div
                  style={{
                    background: '#f0f5ff',
                    border: '1px solid #adc6ff',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <Space align="center">
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
                        items.length === 0 ||
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
              )
            }}
          </Form.Item>
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