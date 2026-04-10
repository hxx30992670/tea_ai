import React, { useEffect, useState } from 'react'
import {
  Table, Button, Card, Modal, Form, Input, Typography, Select, InputNumber, Tag, Space, Popconfirm, message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { supplierApi } from '@/api/suppliers'
import type { Supplier } from '@/types'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'

const { Title, Text } = Typography

const PAYMENT_TYPE_OPTIONS = [
  { label: '现结', value: 'cash' },
  { label: '合同账期', value: 'contract' },
  { label: 'X天后结', value: 'days' },
]

function formatPaymentTerms(type?: string, days?: number) {
  if (!type) return '-'
  if (type === 'cash') return <Tag color="green">现结</Tag>
  if (type === 'contract') return <Tag color="blue">合同账期 {days ?? '-'} 天</Tag>
  if (type === 'days') return <Tag color="orange">{days ?? '-'} 天后结</Tag>
  return '-'
}

export default function SuppliersPage() {
  const [list, setList] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<Supplier | null>(null)
  const [form] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    const res = await supplierApi.list()
    setList(res.list)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const openEdit = (r?: Supplier) => {
    setEditRecord(r || null)
    form.setFieldsValue(r || {})
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (values.paymentTermsType === 'cash') values.paymentDays = null
    if (editRecord) await supplierApi.update(editRecord.id, {
      ...values,
      paymentDays: Number(values.paymentDays),
    })
    else await supplierApi.create(values)
    setModalOpen(false)
    loadData()
  }

  const handleDelete = async (id: number) => {
    await supplierApi.remove(id)
    message.success('删除成功')
    loadData()
  }

  const columns = [
    { title: '供应商名称', dataIndex: 'name', width: 180, render: (v: string) => <Text strong>{v}</Text> },
    { title: '联系人', dataIndex: 'contactName', width: 100 },
    { title: '电话', dataIndex: 'phone', width: 130 },
    { title: '供货品类', dataIndex: 'supplyCategory', width: 100 },
    {
      title: '账期', width: 140,
      render: (_: unknown, r: Supplier) => formatPaymentTerms(r.paymentTermsType, r.paymentDays),
    },
    { title: '地址', dataIndex: 'address', ellipsis: true },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: (_: unknown, r: Supplier) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该供应商？" description="有采购订单的供应商无法删除" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="供应商管理"
        description="管理茶叶供应商信息和账期"
        className="page-header"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); openEdit() }} className="page-primary-button">
            新增供应商
          </Button>
        )}
      />

      <Card className="page-card page-card--flat">
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} scroll={{ x: 800 }}
          pagination={{ pageSize: 10 }} />
      </Card>

      <Modal title={editRecord ? '编辑供应商' : '新增供应商'} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} okText="保存"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="contactName" label="联系人" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="联系电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="paymentTermsType" label="账期类型" rules={[{ required: true }]}>
            <Select placeholder="请选择账期类型" options={PAYMENT_TYPE_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.paymentTermsType !== cur.paymentTermsType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paymentTermsType')
              if (type === 'contract' || type === 'days') {
                return (
                  <Form.Item
                    name="paymentDays"
                    label={type === 'contract' ? '合同账期天数' : '几天后结款'}
                    rules={[{ required: true, message: '请填写天数' }]}
                  >
                    <Space.Compact style={{ width: '100%' }}>
                      <InputNumber min={1} max={365} style={{ width: 'calc(100% - 44px)' }} />
                      <Input
                        readOnly
                        value="天"
                        style={{
                          width: 44,
                          textAlign: 'center',
                          color: 'rgba(0, 0, 0, 0.45)',
                          backgroundColor: 'rgba(0, 0, 0, 0.02)',
                          cursor: 'default',
                        }}
                      />
                    </Space.Compact>
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="supplyCategory" label="供货品类"><Input placeholder="如：绿茶、普洱茶" /></Form.Item>
          
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
