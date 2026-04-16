import React, { useEffect, useState } from 'react'
import { Table, Card, Tag, Typography, Select, Space, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { systemApi } from '@/api/system'
import type { OperationLog } from '@/types'
import PageHeader from '@/components/page/PageHeader'
import { formatDateTime } from '@/utils/date'
import '@/styles/page.less'

const { Title, Text } = Typography

const MODULE_COLORS: Record<string, string> = {
  auth: 'green',
  system: 'red',
  user: 'magenta',
  product: 'green',
  stock: 'cyan',
  sale: 'blue',
  purchase: 'purple',
  customer: 'orange',
  supplier: 'gold',
  payment: 'volcano',
}

const MODULE_LABELS: Record<string, string> = {
  auth: '认证',
  system: '系统设置',
  user: '用户管理',
  product: '商品管理',
  stock: '库存管理',
  sale: '销售订单',
  purchase: '采购订单',
  customer: '客户管理',
  supplier: '供应商管理',
  payment: '收付款',
}

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  refresh_token: '刷新令牌',
  create_order: '创建订单',
  update_order: '编辑订单',
  delete_order: '删除订单',
  stock_in_order: '采购入库',
  stock_out_order: '销售出库',
  create_return: '创建退货',
  create_return_with_refund: '退货并退款',
  create_refund_only: '仅退款',
  create_exchange: '换货',
  create_exchange_with_refund: '换货并退款',
  create_receive: '登记收款',
  create_pay: '登记付款',
}

export default function LogsPage() {
  const [list, setList] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [moduleFilter, setModuleFilter] = useState<string | undefined>()

  const loadData = async (kw?: string, mod?: string) => {
    setLoading(true)
    const params: Record<string, unknown> = {}
    if (kw) params.keyword = kw
    if (mod) params.module = mod
    const res = await systemApi.logs(params)
    setList(res.list)
    setLoading(false)
  }

  useEffect(() => { loadData(keyword, moduleFilter) }, [keyword, moduleFilter])

  const columns = [
    { title: '操作人', dataIndex: 'realName', width: 120, render: (v?: string, r?: OperationLog) => v || r?.username || '-' },
    {
      title: '模块', dataIndex: 'module', width: 110,
      render: (v: string) => <Tag color={MODULE_COLORS[v] || 'default'}>{MODULE_LABELS[v] || v}</Tag>,
    },
    { title: '操作', dataIndex: 'action', width: 140, render: (v: string) => ACTION_LABELS[v] || v },
    { title: '详情', dataIndex: 'detail', ellipsis: true, render: (v?: string) => v ? <Text type="secondary">{v}</Text> : '-' },
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v?: string) => formatDateTime(v) },
  ]

  return (
    <div>
      <PageHeader title="操作日志" description="记录关键操作，支持审计和追溯" className="page-header" />

      <Card className="page-toolbar-card">
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索操作人/动作/详情"
            style={{ width: 180 }}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            placeholder="模块筛选"
            style={{ width: 140 }}
            allowClear
            value={moduleFilter}
            onChange={(v) => setModuleFilter(v)}
            options={Object.keys(MODULE_COLORS).map((m) => ({ value: m, label: MODULE_LABELS[m] || m }))}
          />
        </Space>
      </Card>

      <Card className="page-card page-card--flat">
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }} />
      </Card>
    </div>
  )
}
