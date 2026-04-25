import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { productApi, type ProductUnit } from '@/api/products'

const { Text } = Typography

interface UnitManagementModalProps {
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export default function UnitManagementModal({ open, onClose, onChanged }: UnitManagementModalProps) {
  const [form] = Form.useForm()
  const [units, setUnits] = useState<ProductUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ProductUnit | null>(null)

  const loadUnits = useCallback(async () => {
    setLoading(true)
    try {
      const data = await productApi.units()
      setUnits(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadUnits()
      form.resetFields()
      setEditingRecord(null)
    }
  }, [open, form, loadUnits])

  const resetEditing = () => {
    setEditingRecord(null)
    form.resetFields()
  }

  const saveUnit = async (values: { name: string; sortOrder?: number }) => {
    setSaving(true)
    try {
      if (editingRecord) {
        await productApi.updateUnit(editingRecord.id, values)
        message.success('单位已更新')
      } else {
        await productApi.createUnit(values)
        message.success('单位已新增')
      }
      resetEditing()
      await loadUnits()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const nextName = values.name.trim()
    const isUsedRename = Boolean(
      editingRecord &&
        editingRecord.productCount > 0 &&
        nextName !== editingRecord.name,
    )

    if (!isUsedRename) {
      await saveUnit({ ...values, name: nextName })
      return
    }

    Modal.confirm({
      title: '确认修改已使用的单位？',
      icon: <ExclamationCircleOutlined />,
      content: `当前单位「${editingRecord?.name}」已被 ${editingRecord?.productCount} 个商品使用。修改为「${nextName}」后，这些商品的单位会全部同步改变，是否继续？`,
      okText: '继续修改',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => saveUnit({ ...values, name: nextName }),
    })
  }

  const handleEdit = (record: ProductUnit) => {
    setEditingRecord(record)
    form.setFieldsValue({ name: record.name, sortOrder: record.sortOrder })
  }

  const handleDelete = async (record: ProductUnit) => {
    await productApi.deleteUnit(record.id)
    message.success('单位已删除')
    await loadUnits()
    onChanged()
  }

  return (
    <Modal
      title="单位管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message="单位是商品的基础属性"
        description="已被商品使用的单位不能删除；修改单位名称会同步影响所有使用该单位的商品。"
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="name" rules={[{ required: true, message: '请输入单位名称' }]}>
          <Input placeholder="单位名称，如：斤" maxLength={20} style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="sortOrder">
          <InputNumber placeholder="排序" min={0} precision={0} style={{ width: 110 }} />
        </Form.Item>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={handleSubmit} className="page-primary-button">
            {editingRecord ? '保存修改' : '新增单位'}
          </Button>
          {editingRecord && <Button onClick={resetEditing}>取消编辑</Button>}
        </Space>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={units}
        pagination={false}
        columns={[
          {
            title: '单位名称',
            dataIndex: 'name',
            render: (name: string, record) => (
              <Space>
                <Text strong>{name}</Text>
                {record.productCount > 0 && <Tag color="green">已使用</Tag>}
              </Space>
            ),
          },
          {
            title: '使用商品',
            dataIndex: 'productCount',
            width: 110,
            render: (count: number) => `${count} 个`,
          },
          {
            title: '排序',
            dataIndex: 'sortOrder',
            width: 90,
          },
          {
            title: '操作',
            width: 130,
            render: (_: unknown, record) => (
              <Space>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Tooltip title={record.productCount > 0 ? '该单位已被商品使用，不能删除' : ''}>
                  <span>
                    <Popconfirm
                      title="确认删除该单位？"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      disabled={record.productCount > 0}
                      onConfirm={() => handleDelete(record)}
                    >
                      <Button
                        type="link"
                        size="small"
                        danger
                        disabled={record.productCount > 0}
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  </span>
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  )
}
