import React, { useEffect, useMemo } from 'react'
import {
  Card,
  Col,
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
import type { Product, SaleOrder } from '@/types'
import { formatCompositeQuantity, formatQuantityNumber } from '@/utils/packaging'

const { Text } = Typography

interface SaleOrderReturnModalProps {
  open: boolean
  order: SaleOrder | null
  loading: boolean
  productMap: Map<number, Product>
  onClose: () => void
  onSuccess: (order: SaleOrder) => void
}

export function SaleOrderReturnModal({
  open,
  order,
  loading,
  productMap,
  onClose,
  onSuccess,
}: SaleOrderReturnModalProps) {
  const [form] = Form.useForm()

  const quantities = Form.useWatch('quantities', form) as Record<string, number> | undefined
  const packageQuantities = Form.useWatch('packageQuantities', form) as Record<string, number> | undefined
  const looseQuantities = Form.useWatch('looseQuantities', form) as Record<string, number> | undefined

  const previewAmount = useMemo(
    () =>
      (order?.items ?? []).reduce((sum, item) => {
        const qty =
          item.packageUnit && item.packageSize
            ? Number(packageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) +
              Number(looseQuantities?.[String(item.id)] ?? 0)
            : Number(quantities?.[String(item.id)] ?? 0)
        return sum + qty * item.unitPrice
      }, 0),
    [looseQuantities, packageQuantities, quantities, order],
  )

  useEffect(() => {
    if (open && order) {
      form.setFieldsValue({
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
  }, [open, order, form])

  useEffect(() => {
    if (open) {
      form.setFieldValue('refundAmount', previewAmount)
    }
  }, [previewAmount, open, form])

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

  const handleOk = async () => {
    if (!order) return
    const values = await form.validateFields()
    const items = (order.items ?? [])
      .map((item) => ({
        saleOrderItemId: item.id,
        quantity: Number(values.quantities?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number(values.packageQuantities?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number(values.looseQuantities?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter(
        (item) =>
          Number(item.quantity ?? 0) > 0 ||
          Number(item.packageQty ?? 0) > 0 ||
          Number(item.looseQty ?? 0) > 0,
      )

    if (items.length === 0) {
      message.error('请至少填写一条退货数量')
      return
    }

    const updatedOrder = await saleOrderApi.createReturn(order.id, {
      items,
      refundAmount: values.refundAmount ?? 0,
      method: values.method,
      reasonCode: values.reasonCode,
      reasonNote: values.reasonNote,
      remark: values.remark,
    })
    message.success('退货处理成功')
    onClose()
    onSuccess(updatedOrder)
  }

  return (
    <Modal
      title={`销售退货：${order?.orderNo ?? ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      width={700}
      okText="确认退货"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {order && (
          <Form form={form} layout="vertical">
            <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
              <Space direction="vertical" size={6}>
                <Text>客户：{order.customerName || '散客'}</Text>
                <Text>原销售金额：¥{order.totalAmount.toLocaleString()}</Text>
                <Text>当前已收款：¥{order.receivedAmount.toLocaleString()}</Text>
                <Text strong>本次退货预估金额：¥{previewAmount.toLocaleString()}</Text>
              </Space>
            </Card>
            <div
              style={{
                background: '#f9f9f9',
                borderRadius: 10,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                填写每个商品的本次退货数量，不能超过可退数量
              </Text>
              <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                {(order.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 110px 90px 180px',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <Text strong>{item.productName}</Text>
                      <div>
                        <Text type="secondary">
                          已售 {formatCompositeQuantity(item)}，可退
                          {formatQuantityNumber(item.remainingQuantity ?? 0)}{item.unit || ''}
                        </Text>
                      </div>
                    </div>
                    <div>{renderPriceWithRef(item.unitPrice, item.productId)}</div>
                    <Text type="secondary">
                      可退 {formatQuantityNumber(item.remainingQuantity ?? 0)}{item.unit || ''}
                    </Text>
                    {item.packageUnit && item.packageSize ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Form.Item
                          name={['packageQuantities', String(item.id)]}
                          style={{ marginBottom: 0, flex: 1 }}
                        >
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary" style={{ flexShrink: 0 }}>
                          {item.packageUnit}
                        </Text>
                        <Form.Item
                          name={['looseQuantities', String(item.id)]}
                          style={{ marginBottom: 0, flex: 1 }}
                        >
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary" style={{ flexShrink: 0 }}>
                          {item.unit || '散'}
                        </Text>
                      </div>
                    ) : (
                      <Form.Item
                        name={['quantities', String(item.id)]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          min={0}
                          max={item.remainingQuantity ?? 0}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    )}
                  </div>
                ))}
              </Space>
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="refundAmount" label="本次退款金额">
                  <InputNumber
                    style={{ width: '100%' }}
                    prefix="¥"
                    min={0}
                    precision={2}
                    onChange={() => form.validateFields(['method'])}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="method"
                  label="退款方式"
                  dependencies={['refundAmount']}
                  rules={[
                    {
                      validator(_, value) {
                        const amount = Number(form.getFieldValue('refundAmount') ?? 0)
                        if (amount > 0 && !value)
                          return Promise.reject(new Error('有退款金额时必须选择退款方式'))
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <Select
                    allowClear
                    options={PAYMENT_METHOD_OPTIONS}
                    placeholder="请选择退款方式"
                  />
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
                  <Input placeholder="例如：客户口感不适合" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="备注">
              <Input.TextArea
                rows={3}
                placeholder="例如：客户反馈口感不符，退回 2 包并微信退款"
              />
            </Form.Item>
          </Form>
        )}
      </Spin>
    </Modal>
  )
}