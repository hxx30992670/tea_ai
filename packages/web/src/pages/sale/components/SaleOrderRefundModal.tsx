import React, { useEffect } from 'react'
import { Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Spin, Typography, message } from 'antd'
import { saleOrderApi } from '@/api/sale'
import { AFTER_SALE_REASON_OPTIONS } from '@/constants/after-sale'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import type { SaleOrder } from '@/types'

const { Text } = Typography

interface SaleOrderRefundModalProps {
  open: boolean
  order: SaleOrder | null
  loading: boolean
  onClose: () => void
  onSuccess: (order: SaleOrder) => void
}

export function SaleOrderRefundModal({ open, order, loading, onClose, onSuccess }: SaleOrderRefundModalProps) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open && order) {
      form.resetFields()
    }
  }, [open, order, form])

  const handleOk = async () => {
    if (!order) return
    const values = await form.validateFields()
    const updatedOrder = await saleOrderApi.createRefund(order.id, values)
    message.success('仅退款处理成功')
    onClose()
    onSuccess(updatedOrder)
  }

  return (
    <Modal
      title={`销售仅退款：${order?.orderNo ?? ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      width={560}
      okText="确认退款"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {order && (
          <Form form={form} layout="vertical">
            <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
              <Space direction="vertical" size={6}>
                <Text>客户：{order.customerName || '散客'}</Text>
                <Text>当前已收款：¥{order.receivedAmount.toLocaleString()}</Text>
                <Text>当前净销售金额：¥{(order.totalAmount - order.returnedAmount).toLocaleString()}</Text>
              </Space>
            </Card>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="amount" label="退款金额" rules={[{ required: true, message: '请输入退款金额' }]}>
                  <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => form.validateFields(['method'])} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="method"
                  label="退款方式"
                  dependencies={['amount']}
                  rules={[
                    {
                      validator(_, value) {
                        const amount = Number(form.getFieldValue('amount') ?? 0)
                        if (amount > 0 && !value) return Promise.reject(new Error('有退款金额时必须选择退款方式'))
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="请选择退款方式" />
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
                  <Input placeholder="例如：补差价、服务补偿" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="例如：顾客不退货，仅退差价 20 元" />
            </Form.Item>
          </Form>
        )}
      </Spin>
    </Modal>
  )
}