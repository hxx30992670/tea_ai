import React, { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import type { Product, Customer } from '@/types'
import ProductSelect from '@/components/ProductSelect'
import { getProductPackageConfig } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'

const { Text } = Typography

export interface BatchFormItem {
  productId?: number
  quantity?: number
  packageQty?: number
  looseQty?: number
  unitPrice?: number
}

export interface BatchRecognizeResult {
  index: number
  filename: string
  success: boolean
  error?: string
  customerId?: number
  customerName?: string | null
  items: BatchFormItem[]
  remark?: string
  paidAmount?: number
  paymentMethod?: string | null
}

interface AiBatchPreviewProps {
  open: boolean
  results: BatchRecognizeResult[]
  products: Product[]
  customers: Customer[]
  loading?: boolean
  onClose: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, updates: Partial<BatchRecognizeResult>) => void
  onUpdateItem: (orderIndex: number, itemIndex: number, updates: Partial<BatchFormItem>) => void
  onSaveDraft: () => void
  onQuickComplete: () => void
}

export default function AiBatchPreview({
  open,
  results,
  products,
  customers,
  loading,
  onClose,
  onRemove,
  onUpdate,
  onUpdateItem,
  onSaveDraft,
  onQuickComplete,
}: AiBatchPreviewProps) {
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 默认展开所有成功行
  useEffect(() => {
    if (open) {
      setExpandedKeys(results.filter((r) => r.success).map((r) => r.index))
    }
  }, [open, results])

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const successCount = results.filter((r) => r.success).length
  const hasUnmatched = results.some((r) => r.success && r.items.some((i) => !i.productId))

  const getOrderTotal = (items: BatchFormItem[]) => {
    return items.reduce((sum, item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined
      const packageConfig = getProductPackageConfig(product)
      const qty = packageConfig.unit && packageConfig.size > 0
        ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
        : Number(item.quantity ?? 0)
      return sum + qty * Number(item.unitPrice ?? 0)
    }, 0)
  }

  const getStatusTag = (r: BatchRecognizeResult) => {
    if (!r.success) return <Tag icon={<CloseCircleOutlined />} color="error">识别失败</Tag>
    const unmatched = r.items.filter((i) => !i.productId).length
    if (unmatched > 0) return <Tag icon={<ExclamationCircleOutlined />} color="warning">{unmatched} 项未匹配</Tag>
    return <Tag icon={<CheckCircleOutlined />} color="success">已匹配</Tag>
  }

  const columns = [
    {
      title: '序号',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => idx + 1,
    },
    {
      title: '文件名',
      dataIndex: 'filename',
      width: 180,
      ellipsis: true,
    },
    {
      title: '客户',
      width: 160,
      render: (_: unknown, r: BatchRecognizeResult) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          placeholder="散客"
          allowClear
          showSearch
          optionFilterProp="label"
          value={r.customerId}
          onChange={(v) => onUpdate(r.index, { customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
          disabled={!r.success}
        />
      ),
    },
    {
      title: '商品数',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, r: BatchRecognizeResult) => r.success ? r.items.length : '-',
    },
    {
      title: '预估金额',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: BatchRecognizeResult) => {
        if (!r.success) return '-'
        const total = getOrderTotal(r.items)
        return total > 0 ? <Text strong>¥{total.toLocaleString()}</Text> : '-'
      },
    },
    {
      title: '收款方式',
      width: 120,
      render: (_: unknown, r: BatchRecognizeResult) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          placeholder="方式"
          allowClear
          value={r.paymentMethod}
          onChange={(v) => onUpdate(r.index, { paymentMethod: v })}
          options={PAYMENT_METHOD_OPTIONS}
          disabled={!r.success}
        />
      ),
    },
    {
      title: '状态',
      width: 130,
      render: (_: unknown, r: BatchRecognizeResult) => getStatusTag(r),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: BatchRecognizeResult) => (
        <Popconfirm title="确认移除？" onConfirm={() => onRemove(r.index)} okText="移除" cancelText="取消">
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
        </Popconfirm>
      ),
    },
  ]

  const expandedRowRender = (record: BatchRecognizeResult) => {
    if (!record.success) return <Text type="danger">{record.error || '识别失败'}</Text>

    /** 计算某行的净数量 */
    const getItemQty = (item: BatchFormItem) => {
      const product = item.productId ? productMap.get(item.productId) : undefined
      const packageConfig = getProductPackageConfig(product)
      return packageConfig.unit && packageConfig.size > 0
        ? Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
        : Number(item.quantity ?? 0)
    }

    const itemColumns = [
      {
        title: '商品',
        width: 280,
        render: (_: unknown, item: BatchFormItem, itemIdx: number) => (
          <ProductSelect
            products={products}
            value={item.productId}
            onChange={(id) => {
              const product = id ? productMap.get(id) : undefined
              onUpdateItem(record.index, itemIdx, {
                productId: id,
                unitPrice: product?.sellPrice ?? item.unitPrice,
              })
            }}
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: '数量',
        width: 180,
        render: (_: unknown, item: BatchFormItem, itemIdx: number) => {
          const product = item.productId ? productMap.get(item.productId) : undefined
          const packageConfig = getProductPackageConfig(product)
          if (packageConfig.unit && packageConfig.size > 0) {
            return (
              <Space size={4}>
                <InputNumber
                  size="small"
                  min={0}
                  placeholder={packageConfig.unit}
                  value={item.packageQty}
                  onChange={(v) => onUpdateItem(record.index, itemIdx, { packageQty: v ?? undefined })}
                  style={{ width: 80 }}
                />
                <InputNumber
                  size="small"
                  min={0}
                  placeholder={packageConfig.baseUnit || '散'}
                  value={item.looseQty}
                  onChange={(v) => onUpdateItem(record.index, itemIdx, { looseQty: v ?? undefined })}
                  style={{ width: 80 }}
                />
              </Space>
            )
          }
          return (
            <InputNumber
              size="small"
              min={0}
              placeholder="数量"
              value={item.quantity}
              onChange={(v) => onUpdateItem(record.index, itemIdx, { quantity: v ?? undefined })}
              style={{ width: 100 }}
            />
          )
        },
      },
      {
        title: '单价',
        width: 140,
        render: (_: unknown, item: BatchFormItem, itemIdx: number) => {
          const product = item.productId ? productMap.get(item.productId) : undefined
          const sellPrice = product?.sellPrice
          const unitPrice = item.unitPrice ?? 0
          const diff = sellPrice != null ? unitPrice - sellPrice : null
          return (
            <div>
              <InputNumber
                size="small"
                min={0}
                prefix="¥"
                value={item.unitPrice}
                onChange={(v) => onUpdateItem(record.index, itemIdx, { unitPrice: v ?? undefined })}
                style={{ width: 110 }}
              />
              {diff != null && diff !== 0 && (
                <div style={{ fontSize: 11, lineHeight: '16px', color: diff > 0 ? '#52c41a' : '#ff4d4f', marginTop: 2 }}>
                  {diff > 0 ? '↑' : '↓'}¥{Math.abs(diff).toLocaleString()}
                  <span style={{ color: '#999', marginLeft: 4 }}>参考 ¥{sellPrice!.toLocaleString()}</span>
                </div>
              )}
            </div>
          )
        },
      },
      {
        title: '小计',
        width: 130,
        render: (_: unknown, item: BatchFormItem, itemIdx: number) => {
          const qty = getItemQty(item)
          const subtotal = qty * Number(item.unitPrice ?? 0)
          return (
            <InputNumber
              size="small"
              min={0}
              prefix="¥"
              value={subtotal > 0 ? Number(subtotal.toFixed(2)) : undefined}
              placeholder="总价"
              onChange={(v) => {
                // 反算单价：总价 / 数量
                if (v != null && qty > 0) {
                  onUpdateItem(record.index, itemIdx, { unitPrice: Number((v / qty).toFixed(2)) })
                }
              }}
              style={{ width: 110 }}
            />
          )
        },
      },
    ]

    return (
      <div style={{ padding: '4px 0' }}>
        {record.remark && <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>备注：{record.remark}</Text>}
        <Table
          columns={itemColumns}
          dataSource={record.items}
          rowKey={(_, idx) => idx!}
          pagination={false}
          size="small"
          style={{ background: '#fff' }}
        />
      </div>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <span>AI 批量识别结果</span>
          <Badge count={successCount} style={{ backgroundColor: '#52c41a' }} overflowCount={99} />
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
            共 {results.length} 条，成功 {successCount} 条
            {hasUnmatched && '，部分商品需手动匹配'}
          </Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1120}
      destroyOnHidden
      footer={
        <Space style={{ justifyContent: 'space-between', width: '100%', display: 'flex' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            仅提交已成功识别的 {successCount} 条订单
          </Text>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              onClick={onSaveDraft}
              loading={loading}
              disabled={successCount === 0}
              style={{ borderColor: '#2D6A4F', color: '#2D6A4F' }}
            >
              全部保存草稿
            </Button>
            <Button
              type="primary"
              onClick={onQuickComplete}
              loading={loading}
              disabled={successCount === 0}
              style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
            >
              全部保存并完成
            </Button>
          </Space>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={results}
        rowKey="index"
        pagination={false}
        size="small"
        scroll={{ y: 420 }}
        expandable={{
          expandedRowRender,
          expandedRowKeys: expandedKeys,
          onExpand: (expanded, record) => {
            setExpandedKeys(expanded
              ? [...expandedKeys, record.index]
              : expandedKeys.filter((k) => k !== record.index))
          },
          rowExpandable: (r) => r.success,
        }}
      />
    </Modal>
  )
}
