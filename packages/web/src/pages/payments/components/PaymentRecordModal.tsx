import React, { useEffect } from 'react'
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { paymentApi, type PayableSummary, type ReceivableSummary } from '@/api/payments'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'

const METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS

interface PaymentRecordModalProps {
  open: boolean
  receivables: ReceivableSummary[]
  payables: PayableSummary[]
  onCancel: () => void
  onSuccess: () => void
}

export function PaymentRecordModal({ open, receivables, payables, onCancel, onSuccess }: PaymentRecordModalProps) {
  const [form] = Form.useForm()
  const paymentType = Form.useWatch('type', form)
  const relatedType = Form.useWatch('relatedType', form)

  useEffect(() => {
    if (open) {
      form.resetFields()
    }
  }, [open, form])

  const relatedOptions = relatedType === 'sale_order'
    ? receivables.map((item) => ({
      value: item.id,
      label: `${item.orderNo}｜${item.customerName ?? '散客'}｜待收 ¥${item.receivableAmount}`,
    }))
    : payables.map((item) => ({
      value: item.id,
      label: `${item.orderNo}｜${item.supplierName}｜待付 ¥${item.payableAmount}`,
    }))

  const handleSubmit = async () => {
    const values = await form.validateFields()
    await paymentApi.create(values)
    onSuccess()
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title="补录收/付款"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      okText="保存"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select
            options={[{ value: 'receive', label: '💰 收款' }, { value: 'pay', label: '💸 付款' }]}
            placeholder="选择类型"
            onChange={(value) => {
              form.setFieldsValue({
                relatedType: value === 'receive' ? 'sale_order' : 'purchase_order',
                relatedId: undefined,
                amount: undefined,
              })
            }}
          />
        </Form.Item>
        <Form.Item name="relatedType" label="关联类型" rules={[{ required: true }]}>
          <Select
            allowClear
            options={[
              { value: 'sale_order', label: '销售订单' },
              { value: 'purchase_order', label: '采购订单' },
            ]}
            placeholder="选择关联业务"
            onChange={() => {
              form.setFieldsValue({ relatedId: undefined, amount: undefined })
            }}
          />
        </Form.Item>
        <Form.Item name="relatedId" label="关联单据" rules={[{ required: true }]}>
          <Select
            placeholder={relatedType === 'sale_order' ? '选择销售订单' : '选择采购订单'}
            options={relatedOptions}
            disabled={!paymentType || !relatedType}
            showSearch
            optionFilterProp="label"
            onChange={(id: number) => {
              if (relatedType === 'sale_order') {
                const row = receivables.find((r) => r.id === id)
                if (row) form.setFieldsValue({ amount: row.receivableAmount })
                return
              }
              if (relatedType === 'purchase_order') {
                const row = payables.find((p) => p.id === id)
                if (row) form.setFieldsValue({ amount: row.payableAmount })
              }
            }}
          />
        </Form.Item>
        <Form.Item name="amount" label="金额" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} prefix="¥" min={0.01} precision={2} />
        </Form.Item>
        <Form.Item name="method" label="支付方式" rules={[{ required: true, message: '请选择支付方式' }]}>
          <Select options={METHOD_OPTIONS} placeholder="选择支付方式" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
