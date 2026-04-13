import React, { useEffect } from 'react'
import { Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd'
import { DollarOutlined } from '@ant-design/icons'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'

const { Text } = Typography

interface PaymentModalProps {
  open: boolean
  target: { id: number; orderNo: string; outstanding: number } | null
  onOk: (values: { amount: number; method?: string; remark?: string }) => void
  onCancel: () => void
}

export function PaymentModal({ open, target, onOk, onCancel }: PaymentModalProps) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open && target) {
      form.setFieldsValue({ amount: target.outstanding, method: undefined, remark: undefined })
    } else {
      form.resetFields()
    }
  }, [open, target, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    onOk(values)
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title={<Space><DollarOutlined style={{ color: '#fa8c16' }} /><span>付款：{target?.orderNo}</span></Space>}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="确认付款"
      okButtonProps={{ style: { background: '#fa8c16', borderColor: '#fa8c16' } }}
      width={400}
      destroyOnHidden
    >
      {target && (
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ background: '#fff7e6', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>当前未付款：</Text>
            <Text strong style={{ color: '#fa8c16', fontSize: 16 }}> ¥{target.outstanding.toLocaleString()}</Text>
          </div>
          <Form.Item name="amount" label="本次付款金额" rules={[{ required: true, message: '请填写付款金额' }]}>
            <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} onChange={() => form.validateFields(['method'])} />
          </Form.Item>
          <Form.Item
            name="method"
            label="支付方式"
            dependencies={['amount']}
            rules={[{
              validator(_, value) {
                const amount = Number(form.getFieldValue('amount') ?? 0)
                if (amount > 0 && !value) return Promise.reject(new Error('有付款金额时必须选择支付方式'))
                return Promise.resolve()
              }
            }]}
          >
            <Select placeholder="请选择支付方式" allowClear
              options={PAYMENT_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
