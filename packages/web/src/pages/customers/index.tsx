import React, { useEffect, useState } from 'react'
import {
  Table, Button, Space, Card, Modal, Form, Input,
  Typography, Statistic, Row, Col, Tag, List, DatePicker, Select, Badge, Popconfirm, message,
} from 'antd'
import { PlusOutlined, PhoneOutlined, EnvironmentOutlined, ClockCircleOutlined, FileTextOutlined } from '@ant-design/icons'
import { customerApi, type FollowUp } from '@/api/customers'
import { saleOrderApi } from '@/api/sale'
import { systemApi } from '@/api/system'
import CustomerStatement from '@/components/CustomerStatement'
import type { Customer, SaleOrder } from '@/types'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import '@/styles/page.less'

const { Title, Text } = Typography

const FOLLOW_TYPE_OPTIONS = [
  { label: '📞 电话', value: 'call' },
  { label: '💬 微信', value: 'wechat' },
  { label: '🚪 上门', value: 'visit' },
  { label: '其他', value: 'other' },
]

const INTENT_OPTIONS = [
  { label: '高意向', value: 'high' },
  { label: '一般', value: 'medium' },
  { label: '暂无需求', value: 'low' },
  { label: '已流失', value: 'lost' },
]

const INTENT_CONFIG: Record<string, { color: string; text: string }> = {
  high: { color: 'green', text: '高意向' },
  medium: { color: 'blue', text: '一般' },
  low: { color: 'default', text: '暂无需求' },
  lost: { color: 'red', text: '已流失' },
}

const FOLLOW_TYPE_LABEL: Record<string, string> = {
  call: '📞 电话', wechat: '💬 微信', visit: '🚪 上门', other: '其他',
}

function IntentTag({ level }: { level?: string }) {
  if (!level) return null
  const cfg = INTENT_CONFIG[level]
  return <Tag color={cfg.color}>{cfg.text}</Tag>
}

function isOverdue(dateStr?: string) {
  if (!dateStr) return false
  return dayjs(dateStr).isBefore(dayjs(), 'day')
}

export default function CustomersPage() {
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<Customer | null>(null)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [followUpCustomer, setFollowUpCustomer] = useState<Customer | null>(null)
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null)
  const [statementOpen, setStatementOpen] = useState(false)
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)
  const [statementOrders, setStatementOrders] = useState<SaleOrder[]>([])
  const [shopName, setShopName] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const [followUpForm] = Form.useForm()

  const loadData = async () => {
    setLoading(true)
    const res = await customerApi.list()
    setList(res.list)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    systemApi.getSettings().then(s => setShopName(s.shopName)).catch(() => { })
  }, [])

  const handleOpenStatement = async (customer: Customer) => {
    setStatementCustomer(customer)
    setStatementOpen(true)
    const res = await saleOrderApi.list({ customerId: customer.id, pageSize: 200 })
    // 只展示非草稿订单
    setStatementOrders(res.list.filter(o => o.status !== 'draft'))
  }

  const openEdit = (r?: Customer) => {
    setEditRecord(r || null)
    form.setFieldsValue(r || {})
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editRecord) await customerApi.update(editRecord.id, values)
    else await customerApi.create(values)
    setModalOpen(false)
    loadData()
  }

  const handleDelete = async (id: number) => {
    await customerApi.remove(id)
    message.success('删除成功')
    loadData()
  }

  const openFollowUps = async (customer: Customer) => {
    setFollowUpCustomer(customer)
    setFollowUpOpen(true)
    setEditingFollowUp(null)
    followUpForm.resetFields()
    const res = await customerApi.followUps({ customerId: customer.id, page: 1, pageSize: 20 })
    setFollowUps(res.list)
  }

  const handleSaveFollowUp = async () => {
    if (!followUpCustomer) return
    const values = await followUpForm.validateFields()
    const payload = {
      content: values.content,
      followType: values.followType,
      intentLevel: values.intentLevel,
      nextFollowDate: values.nextFollowDate ? values.nextFollowDate.toISOString() : undefined,
    }

    if (editingFollowUp) {
      await customerApi.updateFollowUp(editingFollowUp.id, payload)
      message.success('跟进记录已更新')
    } else {
      await customerApi.createFollowUp({
        customerId: followUpCustomer.id,
        ...payload,
      })
      message.success('跟进记录已新增')
    }

    setEditingFollowUp(null)
    followUpForm.resetFields()
    await openFollowUps(followUpCustomer)
  }

  const handleEditFollowUp = (record: FollowUp) => {
    setEditingFollowUp(record)
    followUpForm.setFieldsValue({
      followType: record.followType,
      intentLevel: record.intentLevel,
      content: record.content,
      nextFollowDate: record.nextFollowDate ? dayjs(record.nextFollowDate) : undefined,
    })
  }

  const handleCancelEditFollowUp = () => {
    setEditingFollowUp(null)
    followUpForm.resetFields()
  }

  // 从跟进记录推断客户最新意向
  const getLatestIntent = (customer: Customer) => {
    return (customer as unknown as Record<string, unknown>).latestIntentLevel as string | undefined
  }

  const getNextFollowDate = (customer: Customer) => {
    return (customer as unknown as Record<string, unknown>).nextFollowDate as string | undefined
  }

  const columns = [
    {
      title: '客户名称', dataIndex: 'name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    { title: '联系人', dataIndex: 'contactName', },
    {
      title: '电话', dataIndex: 'phone',
      render: (v?: string) => v ? <Space size={4}><PhoneOutlined />{v}</Space> : '-',
    },
    {
      title: '意向',
      render: (_: unknown, r: Customer) => <IntentTag level={getLatestIntent(r)} />,
    },
    {
      title: '计划跟进',
      render: (_: unknown, r: Customer) => {
        const d = getNextFollowDate(r)
        if (!d) return <Text type="secondary">-</Text>
        const overdue = isOverdue(d)
        return (
          <Space size={4}>
            {overdue && <Badge status="error" />}
            <Text type={overdue ? 'danger' : undefined}>{dayjs(d).format('MM-DD HH:mm')}</Text>
          </Space>
        )
      },
    },
    {
      title: '累计交易', dataIndex: 'totalAmount', align: 'right' as const,
      render: (v?: number) => v ? <Text strong>¥{v.toLocaleString()}</Text> : '-',
    },
    {
      title: '应收欠款', dataIndex: 'receivableAmount', align: 'right' as const,
      render: (v?: number) => v && v > 0
        ? <Text type="danger">¥{v.toLocaleString()}</Text>
        : <Text type="success">¥0</Text>,
    },
    {
      title: '地址', dataIndex: 'address', ellipsis: true,
      render: (v?: string) => v ? <Space size={4}><EnvironmentOutlined />{v}</Space> : '-',
    },
    {
      title: '操作', width: 240, fixed: 'right' as const,
      render: (_: unknown, r: Customer) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" size="small" onClick={() => openFollowUps(r)}>跟进</Button>
          <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => handleOpenStatement(r)}>对账单</Button>
          <Popconfirm title="确定删除该客户？" description="有销售订单的客户无法删除" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const totalReceivable = list.reduce((sum, c) => sum + (c.receivableAmount || 0), 0)
  const totalTrade = list.reduce((sum, c) => sum + (c.totalAmount || 0), 0)
  const todayFollowCount = list.filter(c => {
    const d = getNextFollowDate(c)
    return d && dayjs(d).isSame(dayjs(), 'day')
  }).length
  const overdueFollowCount = list.filter(c => isOverdue(getNextFollowDate(c))).length

  return (
    <div>
      <PageHeader
        title="客户管理"
        description="管理客户信息、交易历史和跟进记录"
        className="page-header"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); openEdit() }} className="page-primary-button">
            新增客户
          </Button>
        )}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { title: '客户总数', value: list.length, suffix: '个' },
          { title: '累计交易额', value: `¥${totalTrade.toLocaleString()}` },
          { title: '应收总额', value: `¥${totalReceivable.toLocaleString()}`, valueStyle: totalReceivable > 0 ? { color: '#ff4d4f' } : {} },
          { title: '今日待跟进', value: todayFollowCount, suffix: '个', valueStyle: todayFollowCount > 0 ? { color: '#1677ff' } : {} },
          { title: '已逾期跟进', value: overdueFollowCount, suffix: '个', valueStyle: overdueFollowCount > 0 ? { color: '#ff4d4f' } : {} },
        ].map((s) => (
          <Col key={s.title} span={Math.floor(24 / 5)}>
            <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Statistic title={s.title} value={s.value} suffix={s.suffix} valueStyle={s.valueStyle} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="page-card page-card--flat">
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} scroll={{ x: true }}
          pagination={{ pageSize: 10 }}
          rowClassName={(r) => isOverdue(getNextFollowDate(r)) ? 'overdue-row' : ''}
        />
      </Card>

      {/* 编辑客户 */}
      <Modal title={editRecord ? '编辑客户' : '新增客户'} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} okText="保存"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}>
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

      {/* 跟进记录 */}
      <Modal
        title={
          <Space>
            <ClockCircleOutlined />
            {followUpCustomer ? `客户跟进：${followUpCustomer.name}` : '客户跟进'}
          </Space>
        }
        open={followUpOpen}
        onCancel={() => {
          setFollowUpOpen(false)
          setEditingFollowUp(null)
          followUpForm.resetFields()
        }}
        footer={null}
        width={700}
      >
        <Card size="small" style={{ marginBottom: 16, background: '#f9f9f9' }}>
          <Form form={followUpForm} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="followType" label="跟进方式" rules={[{ required: true, message: '请选择跟进方式' }]}>
                  <Select placeholder="选择方式" options={FOLLOW_TYPE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="intentLevel" label="客户意向" rules={[{ required: true, message: '请选择客户意向' }]}>
                  <Select placeholder="选择意向" options={INTENT_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请填写跟进内容' }]}>
              <Input.TextArea rows={3} placeholder="准备推销的茶叶、预计沟通的重点等" />
            </Form.Item>
            <Row gutter={12} align="bottom">
              <Col span={14}>
                <Form.Item name="nextFollowDate" label="计划跟进时间" rules={[{ required: true, message: '请选择计划时间' }]} style={{ marginBottom: 0 }}>
                  <DatePicker showTime style={{ width: '100%' }} placeholder="选择计划跟进的时间" />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Space.Compact block>
                    <Button type="primary" block onClick={handleSaveFollowUp}
                      style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>
                      {editingFollowUp ? '保存修改' : '新增跟进记录'}
                    </Button>
                    {editingFollowUp && (
                      <Button onClick={handleCancelEditFollowUp}>取消编辑</Button>
                    )}
                  </Space.Compact>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        <List
          dataSource={followUps}
          locale={{ emptyText: '暂无跟进记录，快去记录第一次跟进吧' }}
          renderItem={(item) => (
            <List.Item style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => handleEditFollowUp(item)}>
              <List.Item.Meta
                title={
                  <Space wrap>
                    {item.nextFollowDate ? (
                      <Tag color={isOverdue(item.nextFollowDate) ? 'red' : 'blue'}>
                        计划跟进：{dayjs(item.nextFollowDate).format('YYYY-MM-DD HH:mm')}
                      </Tag>
                    ) : (
                      <Tag>未设置计划时间</Tag>
                    )}
                    <Text type="secondary" style={{ fontSize: 12 }}>创建时间：{dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                    {item.followType && <Tag>{FOLLOW_TYPE_LABEL[item.followType] ?? item.followType}</Tag>}
                    <IntentTag level={item.intentLevel} />
                    {editingFollowUp?.id === item.id && <Tag color="processing">编辑中</Tag>}
                  </Space>
                }
                description={
                  <div>
                    <div style={{ color: 'rgba(0,0,0,0.85)', marginTop: 4 }}>{item.content}</div>
                    <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12 }}>
                      点击该记录可回填到上方表单并编辑
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      <CustomerStatement
        open={statementOpen}
        customerName={statementCustomer?.name || ''}
        orders={statementOrders}
        shopName={shopName}
        onClose={() => { setStatementOpen(false); setStatementCustomer(null); setStatementOrders([]) }}
      />
    </div>
  )
}
