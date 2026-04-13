import React, { useEffect } from 'react'
import { Form, Input, InputNumber, Modal, Select, Space, Typography, message } from 'antd'
import { DollarOutlined } from '@ant-design/icons'
import { paymentApi } from '@/api/payments'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'

const { Text } = Typography

interface CollectTarget {
  id: number
  orderNo: string
  outstanding: number
}

interface SaleOrderCollectModalProps {
  open: boolean
  target: CollectTarget | null
  onClose: () => void
  onSuccess: () => void
}

export function SaleOrderCollectModal({ open, target, onClose, onSuccess }: SaleOrderCollectModalProps) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open && target) {
      form.resetFields()
    }
  }, [open, target, form])

  const handleOk = async () => {
    if (!target) return
    const values = await form.validateFields()
    await paymentApi.create({
      type: 'receive',
      relatedType: 'sale_order',
      relatedId: target.id,
      amount: values.amount,
      method: values.method ?? null,
      remark: values.remark ?? null,
    })
    message.success('收款成功')
    onClose()
    onSuccess()
  }

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined style={{ color: '#1677ff' }} />
          <span>收款：{target?.orderNo}</span>
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="确认收款"
      okButtonProps={{ style: { background: '#1677ff', borderColor: '#1677ff' } }}
      width={400}
      destroyOnHidden
    >
      {target && (
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ background: '#e6f4ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>当前欠款：</Text>
            <Text strong style={{ color: '#1677ff', fontSize: 16 }}> ¥{target.outstanding.toLocaleString()}</Text>
          </div>
          <Form.Item name="amount" label="本次收款金额" rules={[{ required: true, message: '请填写收款金额' }]}>
            <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => form.validateFields(['method'])} />
          </Form.Item>
          <Form.Item
            name="method"
            label="支付方式"
            dependencies={['amount']}
            rules={[
              {
                validator(_, value) {
                  const amount = Number(form.getFieldValue('amount') ?? 0)
                  if (amount > 0 && !value) return Promise.reject(new Error('有收款金额时必须选择支付方式'))
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Select placeholder="请选择支付方式" allowClear options={PAYMENT_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}