import React, { useEffect } from 'react'
import { Form, Input, Modal } from 'antd'
import { customerApi } from '@/api/customers'
import type { Customer } from '@/types'

interface CustomerFormModalProps {
  open: boolean
  editRecord: Customer | null
  onClose: () => void
  onSuccess: () => void
}

export function CustomerFormModal({ open, editRecord, onClose, onSuccess }: CustomerFormModalProps) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      if (editRecord) {
        form.setFieldsValue(editRecord)
      } else {
        form.resetFields()
      }
    }
  }, [open, editRecord, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editRecord) {
      await customerApi.update(editRecord.id, values)
    } else {
      await customerApi.create(values)
    }
    onClose()
    onSuccess()
  }

  return (
    <Modal
      title={editRecord ? '编辑客户' : '新增客户'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="保存"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="客户名称" rules={[{ required: true }]}>
          <Input placeholder="如：杭州茶庄" />
        </Form.Item>
        <Form.Item name="contactName" label="联系人">
          <Input placeholder="联系人姓名" />
        </Form.Item>
        <Form.Item name="phone" label="联系电话">
          <Input placeholder="手机号" />
        </Form.Item>
        <Form.Item name="address" label="地址">
          <Input placeholder="详细地址" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}