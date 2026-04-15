import React, { useEffect, useState } from 'react'
import {
  Table, Button, Space, Tag, Card, Modal, Form, Input, Select,
  Switch, Typography, message,
} from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { systemApi } from '@/api/system'
import type { RoleProfile, SysUser } from '@/types'
import PageHeader from '@/components/page/PageHeader'
import { DEMO_UNSUPPORTED_MESSAGE } from '@/constants/demo'
import '@/styles/page.less'
import dayjs from 'dayjs'
const { Text } = Typography

const FALLBACK_ROLE_OPTIONS: RoleProfile[] = [
  { code: 'admin', name: '老板', description: '系统最高权限，管理财务、AI 与系统设置' },
  { code: 'manager', name: '店长/主管', description: '负责日常业务运营和进销存流程' },
  { code: 'staff', name: '店员/销售', description: '负责扫码销售、库存查询和简单客户录入' },
]

const ROLE_MAP: Record<string, { color: string; label: string }> = {
  admin: { color: 'red', label: '老板' },
  manager: { color: 'blue', label: '店长/主管' },
  staff: { color: 'green', label: '店员/销售' },
}

export default function UsersPage() {
  const [list, setList] = useState<SysUser[]>([])
  const [roleOptions, setRoleOptions] = useState<RoleProfile[]>(FALLBACK_ROLE_OPTIONS)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<SysUser | null>(null)
  const [form] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    const res = await systemApi.users()
    setList(res.list)
    setRoleOptions(res.roleOptions?.length ? res.roleOptions : FALLBACK_ROLE_OPTIONS)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const openEdit = (r?: SysUser) => {
    setEditRecord(r || null)
    form.setFieldsValue(r ? { ...r, password: '' } : { status: 1 })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    await form.validateFields()
    message.warning(DEMO_UNSUPPORTED_MESSAGE)
  }

  const toggleStatus = async (id: number, checked: boolean) => {
    void id
    void checked
    message.warning(DEMO_UNSUPPORTED_MESSAGE)
  }

  const columns = [
    { title: '账号', dataIndex: 'username', render: (v: string) => <Text code>{v}</Text> },
    { title: '姓名', dataIndex: 'realName', },
    {
      title: '角色', dataIndex: 'role',
      render: (_: string, r: SysUser) => {
        const label = r.roleProfile?.name ?? ROLE_MAP[r.role]?.label ?? r.role
        return <Tag color={ROLE_MAP[r.role]?.color}>{label}</Tag>
      },
    },
    { title: '手机号', dataIndex: 'phone', render: (v?: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: (v: number, r: SysUser) => (
        <Switch
          checked={v === 1}
          size="small"
          onChange={(checked) => toggleStatus(r.id, checked)}
          disabled={r.role === 'admin'}
        />
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    {
      title: '操作', width: 140, fixed: 'right' as const,
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
            <Select options={roleOptions.map((role) => ({ value: role.code, label: `${role.name}（${role.description}）` }))} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
