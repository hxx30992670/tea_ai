import React, { useEffect, useState } from 'react'
import {
  Table, Button, Space, Tag, Card, Modal, Form, Input, Select,
  Switch, Popconfirm, Typography, Badge,
} from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { systemApi } from '@/api/system'
import type { SysUser } from '@/types'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'

const { Title, Text } = Typography

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员（全部权限）' },
  { value: 'manager', label: '店长（业务操作）' },
  { value: 'staff', label: '店员（录入+查看）' },
]

const ROLE_MAP: Record<string, { color: string; label: string }> = {
  admin: { color: 'red', label: '管理员' },
  manager: { color: 'blue', label: '店长' },
  staff: { color: 'green', label: '店员' },
}

export default function UsersPage() {
  const [list, setList] = useState<SysUser[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<SysUser | null>(null)
  const [form] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    const res = await systemApi.users()
    setList(res.list)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const openEdit = (r?: SysUser) => {
    setEditRecord(r || null)
    form.setFieldsValue(r ? { ...r, password: '' } : { status: 1 })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editRecord) await systemApi.updateUser(editRecord.id, values)
    else await systemApi.createUser(values)
    setModalOpen(false)
    loadData()
  }

  const toggleStatus = async (id: number, checked: boolean) => {
    await systemApi.toggleStatus(id, checked ? 1 : 0)
    loadData()
  }

  const columns = [
    { title: '账号', dataIndex: 'username', width: 120, render: (v: string) => <Text code>{v}</Text> },
    { title: '姓名', dataIndex: 'realName', width: 100 },
    {
      title: '角色', dataIndex: 'role', width: 90,
      render: (v: string) => <Tag color={ROLE_MAP[v]?.color}>{ROLE_MAP[v]?.label}</Tag>,
    },
    { title: '手机号', dataIndex: 'phone', width: 130, render: (v?: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: number, r: SysUser) => (
        <Switch
          checked={v === 1}
          size="small"
          onChange={(checked) => toggleStatus(r.id, checked)}
          disabled={r.role === 'admin'}
        />
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 110 },
    {
      title: '操作', width: 90, fixed: 'right' as const,
      render: (_: unknown, r: SysUser) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理系统账号和角色权限"
        className="page-header"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); openEdit() }} className="page-primary-button">
            新增用户
          </Button>
        )}
      />

      <Card className="page-card page-card--flat">
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading}
          pagination={{ pageSize: 10 }} />
      </Card>

      <Modal title={editRecord ? '编辑用户' : '新增用户'} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} okText="保存"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true }]}>
            <Input disabled={!!editRecord} placeholder="登录账号（不可修改）" />
          </Form.Item>
          {!editRecord && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true }, { min: 8, message: '密码至少8位' }]}>
              <Input.Password placeholder="至少8位，建议含字母+数字" />
            </Form.Item>
          )}
          <Form.Item name="realName" label="真实姓名" rules={[{ required: true }]}>
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
