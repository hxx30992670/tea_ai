import React, { useEffect, useMemo } from 'react'
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { saleOrderApi } from '@/api/sale'
import { AFTER_SALE_REASON_OPTIONS } from '@/constants/after-sale'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import ProductSelect from '@/components/ProductSelect'
import { formatCompositeQuantity, formatQuantityNumber, getProductPackageConfig } from '@/utils/packaging'
import type { Product, SaleOrder } from '@/types'

const { Text } = Typography

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
  const returnLooseQuantities = Form.useWatch('returnLooseQuantities', form) as Record<string, number> | undefined
  const exchangeItems = Form.useWatch('exchangeItems', form) as
    | Array<{ productId?: number; quantity?: number; packageQty?: number; looseQty?: number; unitPrice?: number }>
    | undefined

  const returnAmount = useMemo(
    () =>
      (order?.items ?? []).reduce((sum, item) => {
        const qty =
          item.packageUnit && item.packageSize
            ? Number(returnPackageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) +
              Number(returnLooseQuantities?.[String(item.id)] ?? 0)
            : Number(returnQuantities?.[String(item.id)] ?? 0)
        return sum + qty * item.unitPrice
      }, 0),
    [order, returnLooseQuantities, returnPackageQuantities, returnQuantities]
  )

  const outAmount = useMemo(
    () =>
      (exchangeItems ?? []).reduce((sum, item) => {
        const product = productMap.get(Number(item.productId))
        const packageConfig = getProductPackageConfig(product)
        const qty =
          packageConfig.unit && packageConfig.size > 0
            ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
            : Number(item.quantity ?? 0)
        return sum + qty * Number(item.unitPrice ?? 0)
      }, 0),
    [exchangeItems, productMap]
  )

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldValue('exchangeItems', [{}])
  }, [open, form])

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

  const buildPayload = (values: Record<string, unknown>, order: SaleOrder) => {
    const returnItems = (order.items ?? [])
      .map((item) => ({
        saleOrderItemId: item.id,
        quantity: Number((values.returnQuantities as Record<string, number> | undefined)?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number((values.returnPackageQuantities as Record<string, number> | undefined)?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number((values.returnLooseQuantities as Record<string, number> | undefined)?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter((item) => Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0)

    const outItems = ((values.exchangeItems as Array<Record<string, unknown>> | undefined) ?? [])
      .map((item) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity) || undefined,
        packageQty: Number(item.packageQty) || undefined,
        looseQty: Number(item.looseQty) || undefined,
        unitPrice: Number(item.unitPrice),
      }))
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
    const payload = buildPayload(values as Record<string, unknown>, order)

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
      width={820}
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
          <Form form={form} layout="vertical">
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
                {(order.items ?? []).map((item) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 180px', gap: 12, alignItems: 'center' }}>
                    <div>
                      <Text strong>{item.productName}</Text>
                      <div><Text type="secondary">已售 {formatCompositeQuantity(item)}，可换回 {formatQuantityNumber(item.remainingQuantity ?? 0)}{item.unit || ''}</Text></div>
                    </div>
                    <div>{renderPriceWithRef(item.unitPrice, item.productId)}</div>
                    <Text type="secondary">可退 {formatQuantityNumber(item.remainingQuantity ?? 0)}{item.unit || ''}</Text>
                    {item.packageUnit && item.packageSize ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Form.Item name={['returnPackageQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary" style={{ flexShrink: 0 }}>{item.packageUnit}</Text>
                        <Form.Item name={['returnLooseQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary" style={{ flexShrink: 0 }}>{item.unit || '散'}</Text>
                      </div>
                    ) : (
                      <Form.Item name={['returnQuantities', String(item.id)]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} max={item.remainingQuantity ?? 0} style={{ width: '100%' }} />
                      </Form.Item>
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
                    const selectedProductId = form.getFieldValue(['exchangeItems', fieldProps.name, 'productId'])
                    const selectedProduct = productMap.get(selectedProductId)
                    const packageConfig = getProductPackageConfig(selectedProduct)
                    return (
                      <Space key={`${key}-${fieldProps.name}`} style={{ width: '100%', marginBottom: 8 }} align="start">
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'productId']} rules={[{ required: true, message: '请选择商品' }]} style={{ flex: 1, marginBottom: 0 }}>
                          <ProductSelect products={products} placeholder="选择换出商品" onProductChange={(p: Product | undefined) => { if (p) form.setFieldValue(['exchangeItems', fieldProps.name, 'unitPrice'], p.sellPrice) }} />
                        </Form.Item>
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
                          <Form.Item {...fieldProps} name={[fieldProps.name, 'quantity']} rules={[{ required: true, message: '数量必填' }]} style={{ marginBottom: 0 }}>
                            <InputNumber placeholder="数量" min={1} style={{ width: 90 }} />
                          </Form.Item>
                        )}
                        <Form.Item {...fieldProps} name={[fieldProps.name, 'unitPrice']} rules={[{ required: true, message: '售价必填' }]} style={{ marginBottom: 0 }}>
                          <InputNumber placeholder="单价" prefix="¥" min={0} style={{ width: 120 }} />
                        </Form.Item>
                        {fields.length > 1 && <Button danger type="link" onClick={() => remove(fieldProps.name)}>删除</Button>}
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