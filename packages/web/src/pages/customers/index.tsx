import React, { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  customerApi,
  type FollowUp,
  type FollowUpDisplayStatus,
  type FollowUpQueryParams,
} from '@/api/customers'
import { saleOrderApi } from '@/api/sale'
import CustomerStatement from '@/components/CustomerStatement'
import type { Customer, SaleOrder } from '@/types'
import { DEMO_SHOP_NAME } from '@/constants/demo'
import PageHeader from '@/components/page/PageHeader'
import {
  formatDateTimeMinute,
  formatMonthDayTime,
  toLocalDateTimeValue,
} from '@/utils/date'
import { CustomerFormModal } from './components/CustomerFormModal'
import '@/styles/page.less'
import './index.less'

const { Text, Paragraph } = Typography
const { RangePicker } = DatePicker

const FOLLOW_UP_PAGE_SIZE = 3

const FOLLOW_TYPE_OPTIONS = [
  { label: '📞 电话', value: 'call' },
  { label: '💬 微信', value: 'wechat' },
  { label: '🚪 上门', value: 'visit' },
  { label: '其他', value: 'other' },
] as const

const INTENT_OPTIONS = [
  { label: '高意向', value: 'high' },
  { label: '一般', value: 'medium' },
  { label: '暂无需求', value: 'low' },
  { label: '已流失', value: 'lost' },
] as const

const FOLLOW_UP_STATUS_OPTIONS = [
  { label: '全部状态', value: 'all' },
  { label: '待跟进', value: 'pending' },
  { label: '逾期未跟进', value: 'overdue' },
  { label: '已确认跟进', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
] as const

const INTENT_CONFIG: Record<string, { color: string; text: string }> = {
  high: { color: 'green', text: '高意向' },
  medium: { color: 'blue', text: '一般' },
  low: { color: 'default', text: '暂无需求' },
  lost: { color: 'red', text: '已流失' },
}

const FOLLOW_TYPE_LABEL: Record<string, string> = {
  call: '📞 电话',
  wechat: '💬 微信',
  visit: '🚪 上门',
  other: '其他',
}

const FOLLOW_UP_STATUS_META: Record<FollowUpDisplayStatus, { color: string; text: string }> = {
  pending: { color: 'blue', text: '待跟进' },
  overdue: { color: 'red', text: '逾期未跟进' },
  completed: { color: 'green', text: '已确认跟进' },
  cancelled: { color: 'default', text: '已取消' },
}

type FollowUpWorkspaceMode = 'create' | 'edit' | 'confirm'

function IntentTag({ level }: { level?: string }) {
  if (!level) return null
  const cfg = INTENT_CONFIG[level]
  if (!cfg) return null
  return <Tag color={cfg.color}>{cfg.text}</Tag>
}

function statusTag(status: FollowUpDisplayStatus) {
  const meta = FOLLOW_UP_STATUS_META[status]
  return <Tag color={meta.color}>{meta.text}</Tag>
}

function isOverdueStatus(status?: string) {
  return status === 'overdue'
}

function buildFollowUpSummary(list: FollowUp[]) {
  return list.reduce(
    (acc, item) => {
      acc.total += 1
      acc[item.displayStatus] += 1
      return acc
    },
    {
      total: 0,
      pending: 0,
      overdue: 0,
      completed: 0,
      cancelled: 0,
    },
  )
}

export default function CustomersPage() {
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [customerKeyword, setCustomerKeyword] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<Customer | null>(null)

  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [followUpsLoading, setFollowUpsLoading] = useState(false)
  const [followUpsLoadingMore, setFollowUpsLoadingMore] = useState(false)
  const [followUpsTotal, setFollowUpsTotal] = useState(0)
  const [followUpsPage, setFollowUpsPage] = useState(1)
  const [followUpsHasMore, setFollowUpsHasMore] = useState(false)
  const [followUpCustomer, setFollowUpCustomer] = useState<Customer | null>(null)
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [followUpMode, setFollowUpMode] = useState<FollowUpWorkspaceMode>('create')
  const [followUpKeywordInput, setFollowUpKeywordInput] = useState('')
  const [followUpKeyword, setFollowUpKeyword] = useState('')
  const [followUpStatusFilter, setFollowUpStatusFilter] = useState<'all' | FollowUpDisplayStatus>('all')
  const [followUpTypeFilter, setFollowUpTypeFilter] = useState<string | undefined>()
  const [followUpDateRange, setFollowUpDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const [statementOpen, setStatementOpen] = useState(false)
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)
  const [statementOrders, setStatementOrders] = useState<SaleOrder[]>([])
  const [shopName] = useState<string | undefined>(DEMO_SHOP_NAME)

  const [planForm] = Form.useForm()
  const [confirmForm] = Form.useForm()

  const loadData = async (keyword = customerKeyword) => {
    setLoading(true)
    try {
      const res = await customerApi.list(keyword ? { keyword } : undefined)
      setList(res.list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData('')
  }, [])

  const resetFollowUpWorkspace = () => {
    setFollowUpMode('create')
    setSelectedFollowUp(null)
    planForm.resetFields()
    confirmForm.resetFields()
  }

  const buildFollowUpParams = (
    page: number,
    overrides?: {
      keyword?: string
      status?: 'all' | FollowUpDisplayStatus
      followType?: string
      dateRange?: [Dayjs | null, Dayjs | null] | null
    },
  ): FollowUpQueryParams | undefined => {
    if (!followUpCustomer) return undefined

    const effectiveKeyword = overrides?.keyword ?? followUpKeyword
    const effectiveStatus = overrides?.status ?? followUpStatusFilter
    const effectiveFollowType = overrides?.followType ?? followUpTypeFilter
    const effectiveDateRange = overrides?.dateRange ?? followUpDateRange

    return {
      customerId: followUpCustomer.id,
      page,
      pageSize: FOLLOW_UP_PAGE_SIZE,
      keyword: effectiveKeyword.trim() || undefined,
      status: effectiveStatus === 'all' ? undefined : effectiveStatus,
      followType: effectiveFollowType as FollowUpQueryParams['followType'],
      dateFrom: effectiveDateRange?.[0] ? effectiveDateRange[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss') : undefined,
      dateTo: effectiveDateRange?.[1] ? effectiveDateRange[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss') : undefined,
    }
  }

  const loadFollowUps = async (
    page = 1,
    reset = false,
    overrides?: {
      keyword?: string
      status?: 'all' | FollowUpDisplayStatus
      followType?: string
      dateRange?: [Dayjs | null, Dayjs | null] | null
    },
  ) => {
    if (!followUpCustomer) return

    if (reset) {
      setFollowUpsLoading(true)
    } else {
      setFollowUpsLoadingMore(true)
    }

    try {
      const params = buildFollowUpParams(page, overrides)
      const res = await customerApi.followUps(params)
      setFollowUps((prev) => {
        if (reset) return res.list
        const merged = [...prev]
        for (const item of res.list) {
          if (!merged.some((existing) => existing.id === item.id)) {
            merged.push(item)
          }
        }
        return merged
      })
      setFollowUpsTotal(res.total)
      setFollowUpsPage(page)
      setFollowUpsHasMore(page * res.pageSize < res.total)
    } finally {
      setFollowUpsLoading(false)
      setFollowUpsLoadingMore(false)
    }
  }

  const openFollowUps = async (customer: Customer) => {
    setFollowUpCustomer(customer)
    setFollowUpOpen(true)
    setFollowUps([])
    setFollowUpsPage(1)
    setFollowUpsHasMore(false)
    setFollowUpsTotal(0)
    setFollowUpKeyword('')
    setFollowUpKeywordInput('')
    setFollowUpStatusFilter('all')
    setFollowUpTypeFilter(undefined)
    setFollowUpDateRange(null)
    resetFollowUpWorkspace()

    setFollowUpsLoading(true)
    try {
      const res = await customerApi.followUps({
        customerId: customer.id,
        page: 1,
        pageSize: FOLLOW_UP_PAGE_SIZE,
      })
      setFollowUps(res.list)
      setFollowUpsTotal(res.total)
      setFollowUpsPage(1)
      setFollowUpsHasMore(res.pageSize < res.total)
    } finally {
      setFollowUpsLoading(false)
    }
  }

  const reloadCustomerAndFollowUps = async () => {
    await Promise.all([
      loadData(),
      loadFollowUps(1, true),
    ])
  }

  const handleCustomerSearch = async (keyword?: string) => {
    const nextKeyword = keyword ?? customerKeyword
    setCustomerKeyword(nextKeyword)
    await loadData(nextKeyword)
  }

  const handleOpenStatement = async (customer: Customer) => {
    setStatementCustomer(customer)
    setStatementOpen(true)
    const res = await saleOrderApi.list({ customerId: customer.id, pageSize: 200 })
    setStatementOrders(res.list.filter((order) => order.status !== 'draft'))
  }

  const openEdit = (record?: Customer) => {
    setEditRecord(record || null)
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    await customerApi.remove(id)
    message.success('删除成功')
    await loadData()
  }

  const handleCreateOrUpdateFollowUp = async () => {
    if (!followUpCustomer) return

    const values = await planForm.validateFields()
    const payload = {
      content: values.content,
      followType: values.followType,
      intentLevel: values.intentLevel,
      nextFollowDate: toLocalDateTimeValue(values.nextFollowDate),
    }

    if (followUpMode === 'edit' && selectedFollowUp) {
      await customerApi.updateFollowUp(selectedFollowUp.id, payload)
      message.success('跟进计划已更新')
    } else {
      await customerApi.createFollowUp({
        customerId: followUpCustomer.id,
        ...payload,
      })
      message.success('跟进计划已创建')
    }

    resetFollowUpWorkspace()
    await reloadCustomerAndFollowUps()
  }

  const handleConfirmFollowUp = async () => {
    if (!selectedFollowUp) return

    const values = await confirmForm.validateFields()
    await customerApi.completeFollowUp(selectedFollowUp.id, {
      feedback: values.feedback,
      followType: values.followType,
      intentLevel: values.intentLevel,
    })
    message.success('已确认本次跟进')
    resetFollowUpWorkspace()
    await reloadCustomerAndFollowUps()
  }

  const handleCancelFollowUp = async (record: FollowUp) => {
    await customerApi.cancelFollowUp(record.id, '人工取消跟进计划')
    message.success('跟进计划已取消')
    if (selectedFollowUp?.id === record.id) {
      resetFollowUpWorkspace()
    }
    await reloadCustomerAndFollowUps()
  }

  const activateEditMode = (record: FollowUp) => {
    setFollowUpMode('edit')
    setSelectedFollowUp(record)
    confirmForm.resetFields()
    planForm.setFieldsValue({
      followType: record.followType,
      intentLevel: record.intentLevel,
      content: record.content,
      nextFollowDate: record.nextFollowDate ? dayjs(record.nextFollowDate) : undefined,
    })
  }

  const activateConfirmMode = (record: FollowUp) => {
    setFollowUpMode('confirm')
    setSelectedFollowUp(record)
    planForm.resetFields()
    confirmForm.setFieldsValue({
      followType: record.followType,
      intentLevel: record.intentLevel,
      feedback: record.feedback,
    })
  }

  const handleApplyFollowUpFilters = async () => {
    const nextKeyword = followUpKeywordInput
    setFollowUpKeyword(nextKeyword)
    await loadFollowUps(1, true, { keyword: nextKeyword })
  }

  const handleResetFollowUpFilters = async () => {
    setFollowUpKeyword('')
    setFollowUpKeywordInput('')
    setFollowUpStatusFilter('all')
    setFollowUpTypeFilter(undefined)
    setFollowUpDateRange(null)
    await loadFollowUps(1, true, {
      keyword: '',
      status: 'all',
      followType: undefined,
      dateRange: null,
    })
  }

  const handleFollowUpListScroll = async (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 80
    if (!nearBottom || followUpsLoading || followUpsLoadingMore || !followUpsHasMore) {
      return
    }
    await loadFollowUps(followUpsPage + 1, false)
  }

  const summary = buildFollowUpSummary(followUps)

  const totalReceivable = useMemo(
    () => list.reduce((sum, customer) => sum + (customer.receivableAmount || 0), 0),
    [list],
  )
  const totalTrade = useMemo(
    () => list.reduce((sum, customer) => sum + (customer.totalAmount || 0), 0),
    [list],
  )
  const todayFollowCount = useMemo(
    () => list.filter((customer) => customer.nextFollowDate && dayjs(customer.nextFollowDate).isSame(dayjs(), 'day')).length,
    [list],
  )
  const overdueFollowCount = useMemo(
    () => list.filter((customer) => customer.nextFollowStatus === 'overdue').length,
    [list],
  )

  const columns: ColumnsType<Customer> = [
    {
      title: '客户名称',
      dataIndex: 'name',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    { title: '联系人', dataIndex: 'contactName' },
    {
      title: '电话',
      dataIndex: 'phone',
      render: (value?: string) => (value ? <Space size={4}><PhoneOutlined />{value}</Space> : '-'),
    },
    {
      title: '意向',
      render: (_value, record) => <IntentTag level={record.latestIntentLevel} />,
    },
    {
      title: '计划跟进',
      render: (_value, record) => {
        if (!record.nextFollowDate) return <Text type="secondary">-</Text>
        return (
          <Space size={4}>
            {record.nextFollowStatus === 'overdue' && <Badge status="error" />}
            <Text type={record.nextFollowStatus === 'overdue' ? 'danger' : undefined}>
              {formatMonthDayTime(record.nextFollowDate)}
            </Text>
          </Space>
        )
      },
    },
    {
      title: '累计交易',
      dataIndex: 'totalAmount',
      align: 'right',
      render: (value?: number) => (value ? <Text strong>¥{value.toLocaleString()}</Text> : '-'),
    },
    {
      title: '应收欠款',
      dataIndex: 'receivableAmount',
      align: 'right',
      render: (value?: number) => (
        value && value > 0
          ? <Text type="danger">¥{value.toLocaleString()}</Text>
          : <Text type="success">¥0</Text>
      ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      ellipsis: true,
      render: (value?: string) => (value ? <Space size={4}><EnvironmentOutlined />{value}</Space> : '-'),
    },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button type="link" size="small" onClick={() => void openFollowUps(record)}>跟进</Button>
          <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => void handleOpenStatement(record)}>对账单</Button>
          <Popconfirm title="确定删除该客户？" description="有销售订单的客户无法删除" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const editorTitle = followUpMode === 'confirm'
    ? '确认真实跟进'
    : followUpMode === 'edit'
      ? '编辑待跟进计划'
      : '新建跟进计划'

  return (
    <div>
      <PageHeader
        title="客户管理"
        description="管理客户信息、交易历史和跟进记录"
        className="page-header"
        extra={(
          <Space>
            <Input.Search
              allowClear
              placeholder="搜索客户名称 / 联系人 / 电话"
              value={customerKeyword}
              onChange={(event) => setCustomerKeyword(event.target.value)}
              onSearch={(value) => void handleCustomerSearch(value)}
              style={{ width: 280 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()} className="page-primary-button">
              新增客户
            </Button>
          </Space>
        )}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { title: '客户总数', value: list.length, suffix: '个' },
          { title: '累计交易额', value: `¥${totalTrade.toLocaleString()}` },
          { title: '应收总额', value: `¥${totalReceivable.toLocaleString()}`, valueStyle: totalReceivable > 0 ? { color: '#ff4d4f' } : {} },
          { title: '今日待跟进', value: todayFollowCount, suffix: '个', valueStyle: todayFollowCount > 0 ? { color: '#1677ff' } : {} },
          { title: '已逾期跟进', value: overdueFollowCount, suffix: '个', valueStyle: overdueFollowCount > 0 ? { color: '#ff4d4f' } : {} },
        ].map((item) => (
          <Col key={item.title} span={Math.floor(24 / 5)}>
            <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Statistic title={item.title} value={item.value} suffix={item.suffix} valueStyle={item.valueStyle} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="page-card page-card--flat">
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: true }}
          pagination={{ pageSize: 10 }}
          rowClassName={(record) => (record.nextFollowStatus === 'overdue' ? 'overdue-row' : '')}
        />
      </Card>

      <CustomerFormModal
        open={modalOpen}
        editRecord={editRecord}
        onClose={() => setModalOpen(false)}
        onSuccess={() => void loadData()}
      />

      <Modal
        className="customers-followup-modal"
        title={(
          <Space align="start" size={10}>
            <ClockCircleOutlined />
            <div>
              <div>{followUpCustomer ? `客户跟进工作台：${followUpCustomer.name}` : '客户跟进工作台'}</div>
              {followUpCustomer ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {followUpCustomer.contactName || '未填联系人'}
                  {followUpCustomer.phone ? ` · ${followUpCustomer.phone}` : ''}
                  {followUpCustomer.address ? ` · ${followUpCustomer.address}` : ''}
                </Text>
              ) : null}
            </div>
          </Space>
        )}
        open={followUpOpen}
        onCancel={() => {
          setFollowUpOpen(false)
          resetFollowUpWorkspace()
        }}
        footer={null}
        width={1080}
        destroyOnClose
      >
        <div className="customer-followup-workbench">
          <Row gutter={16}>
            <Col xs={24} xl={9}>
              <Card
                className="customer-followup-workbench__panel customer-followup-workbench__editor-card"
                title={editorTitle}
                extra={(
                  followUpMode !== 'create' ? (
                    <Button type="link" size="small" onClick={resetFollowUpWorkspace}>
                      返回新建
                    </Button>
                  ) : null
                )}
              >
                {followUpMode === 'confirm' && selectedFollowUp ? (
                  <>
                    <Alert
                      type={selectedFollowUp.displayStatus === 'overdue' ? 'error' : 'info'}
                      showIcon
                      message={selectedFollowUp.displayStatus === 'overdue' ? '该计划已逾期，但仍可补充真实跟进反馈并确认完成。' : '请补充本次真实跟进的反馈后提交。'}
                      style={{ marginBottom: 16 }}
                    />

                    <div className="customer-followup-workbench__reference">
                      <div className="customer-followup-workbench__reference-label">原计划内容</div>
                      <Paragraph style={{ marginBottom: 8 }}>{selectedFollowUp.content}</Paragraph>
                      <Space wrap size={[8, 8]}>
                        {statusTag(selectedFollowUp.displayStatus)}
                        {selectedFollowUp.nextFollowDate ? (
                          <Tag icon={<CalendarOutlined />}>原计划时间：{formatDateTimeMinute(selectedFollowUp.nextFollowDate)}</Tag>
                        ) : null}
                        {selectedFollowUp.followType ? <Tag>{FOLLOW_TYPE_LABEL[selectedFollowUp.followType]}</Tag> : null}
                        <IntentTag level={selectedFollowUp.intentLevel} />
                      </Space>
                    </div>

                    <Form form={confirmForm} layout="vertical">
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="followType" label="实际跟进方式" rules={[{ required: true, message: '请选择实际跟进方式' }]}>
                            <Select placeholder="选择方式" options={FOLLOW_TYPE_OPTIONS as unknown as { label: string; value: string }[]} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="intentLevel" label="跟进后客户意向" rules={[{ required: true, message: '请选择客户意向' }]}>
                            <Select placeholder="选择意向" options={INTENT_OPTIONS as unknown as { label: string; value: string }[]} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="feedback" label="真实跟进反馈" rules={[{ required: true, message: '请填写真实跟进反馈' }]}>
                        <Input.TextArea rows={5} placeholder="填写客户的真实反馈、成交阻塞点、后续建议等" />
                      </Form.Item>
                      <Button
                        type="primary"
                        block
                        icon={<CheckCircleOutlined />}
                        onClick={() => void handleConfirmFollowUp()}
                        style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}
                      >
                        确认已完成跟进
                      </Button>
                    </Form>
                  </>
                ) : (
                  <>
                    <Alert
                      type={followUpMode === 'edit' ? 'warning' : 'info'}
                      showIcon
                      message={followUpMode === 'edit' ? '仅允许修改未逾期、未确认的跟进计划。' : '先创建计划，再在实际跟进后点击右侧记录进行确认。'}
                      style={{ marginBottom: 16 }}
                    />

                    <Form form={planForm} layout="vertical">
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="followType" label="计划跟进方式" rules={[{ required: true, message: '请选择跟进方式' }]}>
                            <Select placeholder="选择方式" options={FOLLOW_TYPE_OPTIONS as unknown as { label: string; value: string }[]} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="intentLevel" label="当前客户意向">
                            <Select placeholder="可先记录当前判断" options={INTENT_OPTIONS as unknown as { label: string; value: string }[]} allowClear />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item name="content" label="跟进计划内容" rules={[{ required: true, message: '请填写跟进计划内容' }]}>
                        <Input.TextArea rows={5} placeholder="例如：确认客户对春茶礼盒的预算、规格偏好和下单节点" />
                      </Form.Item>

                      <Form.Item
                        name="nextFollowDate"
                        label="计划跟进时间"
                        rules={[{ required: true, message: '请选择计划时间' }]}
                      >
                        <DatePicker showTime style={{ width: '100%' }} placeholder="选择计划执行的具体时间" />
                      </Form.Item>

                      <Space.Compact block>
                        <Button
                          type="primary"
                          block
                          icon={followUpMode === 'edit' ? <EditOutlined /> : <PlusOutlined />}
                          onClick={() => void handleCreateOrUpdateFollowUp()}
                          style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}
                        >
                          {followUpMode === 'edit' ? '保存计划修改' : '新增跟进计划'}
                        </Button>
                        {followUpMode === 'edit' ? (
                          <Button block onClick={resetFollowUpWorkspace}>
                            取消编辑
                          </Button>
                        ) : null}
                      </Space.Compact>
                    </Form>
                  </>
                )}
              </Card>
            </Col>

            <Col xs={24} xl={15}>
              <Card className="customer-followup-workbench__panel customer-followup-workbench__timeline-card" bodyStyle={{ paddingBottom: 12 }}>
                <div className="customer-followup-workbench__toolbar">
                  <div>
                    <div className="customer-followup-workbench__toolbar-title">跟进记录流</div>
                    <Text type="secondary">支持状态筛选、关键词搜索和滚动到底自动加载更多</Text>
                  </div>
                  <Button icon={<ReloadOutlined />} onClick={() => void loadFollowUps(1, true)}>
                    刷新
                  </Button>
                </div>

                <Row gutter={[12, 12]} className="customer-followup-workbench__summary-row">
                  {[
                    { label: '全部', value: summary.total, color: '#1677ff' },
                    { label: '待跟进', value: summary.pending, color: '#1677ff' },
                    { label: '逾期', value: summary.overdue, color: '#ff4d4f' },
                    { label: '已完成', value: summary.completed, color: '#52c41a' },
                    { label: '已取消', value: summary.cancelled, color: '#8c8c8c' },
                  ].map((item) => (
                    <Col key={item.label} xs={12} md={8} xl={4}>
                      <div className="customer-followup-workbench__summary-card">
                        <div className="customer-followup-workbench__summary-value" style={{ color: item.color }}>
                          {item.value}
                        </div>
                        <div className="customer-followup-workbench__summary-label">{item.label}</div>
                      </div>
                    </Col>
                  ))}
                </Row>

                <div className="customer-followup-workbench__filters">
                  <div className="customer-followup-workbench__filters-row">
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜计划内容 / 跟进反馈"
                      value={followUpKeywordInput}
                      onChange={(event) => setFollowUpKeywordInput(event.target.value)}
                      onPressEnter={() => void handleApplyFollowUpFilters()}
                      className="customer-followup-filter-search"
                    />
                    <Select
                      value={followUpStatusFilter}
                      options={FOLLOW_UP_STATUS_OPTIONS as unknown as { label: string; value: string }[]}
                      onChange={(value) => setFollowUpStatusFilter(value as 'all' | FollowUpDisplayStatus)}
                      className="customer-followup-filter-status"
                    />
                    <Select
                      allowClear
                      placeholder="跟进方式"
                      value={followUpTypeFilter}
                      options={FOLLOW_TYPE_OPTIONS as unknown as { label: string; value: string }[]}
                      onChange={(value) => setFollowUpTypeFilter(value)}
                      className="customer-followup-filter-type"
                    />
                  </div>
                  <div className="customer-followup-workbench__filters-row">
                    <RangePicker
                      showTime={false}
                      value={followUpDateRange}
                      onChange={(value) => setFollowUpDateRange(value as [Dayjs | null, Dayjs | null] | null)}
                      className="customer-followup-filter-date"
                    />
                    <Button type="primary" onClick={() => void handleApplyFollowUpFilters()}>查询</Button>
                    <Button onClick={() => void handleResetFollowUpFilters()}>重置</Button>
                  </div>
                </div>

                <div className="customer-followup-workbench__scroll" onScroll={handleFollowUpListScroll}>
                  {followUpsLoading ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Card key={index} className="customer-followup-record customer-followup-record--skeleton">
                          <Skeleton active paragraph={{ rows: 3 }} title={false} />
                        </Card>
                      ))}
                    </Space>
                  ) : followUps.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="当前筛选条件下暂无跟进记录"
                    />
                  ) : (
                    <List
                      dataSource={followUps}
                      split={false}
                      renderItem={(item) => (
                        <List.Item key={item.id} className="customer-followup-record-item">
                          <Card
                            className={`customer-followup-record${isOverdueStatus(item.displayStatus) ? ' customer-followup-record--overdue' : ''}`}
                            bordered={false}
                          >
                            <div className="customer-followup-record__header">
                              <div className="customer-followup-record__tags">
                                {statusTag(item.displayStatus)}
                                {item.nextFollowDate ? (
                                  <Tag icon={<CalendarOutlined />}>计划：{formatDateTimeMinute(item.nextFollowDate)}</Tag>
                                ) : (
                                  <Tag>未设置计划时间</Tag>
                                )}
                                {item.followType ? <Tag>{FOLLOW_TYPE_LABEL[item.followType] ?? item.followType}</Tag> : null}
                                <IntentTag level={item.intentLevel} />
                              </div>

                              <div className="customer-followup-record__actions">
                                {item.canConfirm ? (
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<CheckCircleOutlined />}
                                    className="customer-followup-record__action-btn customer-followup-record__action-btn--confirm"
                                    onClick={() => activateConfirmMode(item)}
                                  >
                                    确认跟进
                                  </Button>
                                ) : null}
                                {item.canEdit ? (
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    className="customer-followup-record__action-btn customer-followup-record__action-btn--edit"
                                    onClick={() => activateEditMode(item)}
                                  >
                                    编辑
                                  </Button>
                                ) : null}
                                {item.canCancel ? (
                                  <Popconfirm
                                    title="确认取消这条跟进计划？"
                                    description="取消后会保留记录，但不会再作为待跟进事项。"
                                    onConfirm={() => handleCancelFollowUp(item)}
                                  >
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<StopOutlined />}
                                      className="customer-followup-record__action-btn customer-followup-record__action-btn--danger"
                                    >
                                      取消
                                    </Button>
                                  </Popconfirm>
                                ) : null}
                              </div>
                            </div>

                            <div className="customer-followup-record__section">
                              <div className="customer-followup-record__label">计划内容</div>
                              <Paragraph className="customer-followup-record__content">
                                {item.content}
                              </Paragraph>
                            </div>

                            {item.feedback ? (
                              <div className="customer-followup-record__section customer-followup-record__section--feedback">
                                <div className="customer-followup-record__label">真实跟进反馈</div>
                                <Paragraph className="customer-followup-record__content customer-followup-record__content--feedback">
                                  {item.feedback}
                                </Paragraph>
                              </div>
                            ) : null}

                            {item.cancelReason ? (
                              <div className="customer-followup-record__section">
                                <div className="customer-followup-record__label">取消原因</div>
                                <Paragraph className="customer-followup-record__content">
                                  {item.cancelReason}
                                </Paragraph>
                              </div>
                            ) : null}

                            <div className="customer-followup-record__meta">
                              <span>创建时间：{formatDateTimeMinute(item.createdAt)}</span>
                              {item.operatorName ? <span>创建人：{item.operatorName}</span> : null}
                              {item.completedAt ? <span>完成时间：{formatDateTimeMinute(item.completedAt)}</span> : null}
                              {item.completedByName ? <span>确认人：{item.completedByName}</span> : null}
                              {item.cancelledAt ? <span>取消时间：{formatDateTimeMinute(item.cancelledAt)}</span> : null}
                              {item.cancelledByName ? <span>取消人：{item.cancelledByName}</span> : null}
                            </div>
                          </Card>
                        </List.Item>
                      )}
                    />
                  )}

                  {followUpsLoadingMore ? (
                    <div className="customer-followup-workbench__loadmore">
                      <Skeleton active title={false} paragraph={{ rows: 1, width: '40%' }} />
                    </div>
                  ) : null}

                  {!followUpsLoading && followUps.length > 0 && !followUpsHasMore ? (
                    <div className="customer-followup-workbench__loadmore customer-followup-workbench__loadmore--end">
                      已加载全部 {followUpsTotal} 条记录
                    </div>
                  ) : null}
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      </Modal>

      <CustomerStatement
        open={statementOpen}
        customerName={statementCustomer?.name || ''}
        orders={statementOrders}
        shopName={shopName}
        onClose={() => {
          setStatementOpen(false)
          setStatementCustomer(null)
          setStatementOrders([])
        }}
      />
    </div>
  )
}
