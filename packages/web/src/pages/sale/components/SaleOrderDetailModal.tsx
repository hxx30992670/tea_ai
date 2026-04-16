import React from 'react'
import {
  Card,
  Descriptions,
  Divider,
  Empty,
  List,
  Modal,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import { SALE_ORDER_STATUS } from '@/constants/order'
import { AFTER_SALE_REASON_LABELS } from '@/constants/after-sale'
import type { SaleOrder } from '@/types'
import type { Product } from '@/types'
import { formatCompositeQuantity, formatQuantityNumber } from '@/utils/packaging'
import { formatDateTime } from '@/utils/date'

const { Text } = Typography

const STATUS_MAP: Record<string, { label: string; color: string; step: number }> = {
  [SALE_ORDER_STATUS.DRAFT]: { label: '草稿', color: 'default', step: 0 },
  [SALE_ORDER_STATUS.SHIPPED]: { label: '已出货', color: 'blue', step: 1 },
  processing: { label: '售后处理中', color: 'orange', step: 1 },
  [SALE_ORDER_STATUS.DONE]: { label: '已完成', color: 'success', step: 2 },
  [SALE_ORDER_STATUS.RETURNED]: { label: '已退完', color: 'purple', step: 2 },
}

const EXCHANGE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
}

interface SaleOrderDetailModalProps {
  open: boolean
  order: SaleOrder | null
  loading: boolean
  productMap: Map<number, Product>
  onClose: () => void
}

export function SaleOrderDetailModal({
  open,
  order,
  loading,
  productMap,
  onClose,
}: SaleOrderDetailModalProps) {
  const renderProductCell = (productName: string | undefined, productId: number) => {
    const product = productMap.get(productId)
    const attrs: { label: string; value: string }[] = []
    if (product?.categoryId) {
      const categoryName = product.categoryId ? productMap.get(product.categoryId)?.name : undefined
      if (categoryName) attrs.push({ label: '分类', value: categoryName })
    }
    if (product?.origin) attrs.push({ label: '产地', value: product.origin })
    if (product?.year) attrs.push({ label: '年份', value: `${product.year}年` })
    if (product?.season) attrs.push({ label: '采摘季', value: product.season })
    if (product?.spec) attrs.push({ label: '规格', value: product.spec })
    if (product?.batchNo) attrs.push({ label: '批次', value: product.batchNo })
    return (
      <div>
        <div>{productName || product?.name || '-'}</div>
        {attrs.length > 0 && (
          <Space size={[4, 2]} wrap style={{ marginTop: 2 }}>
            {attrs.map((a, i) => (
              <Tag
                key={i}
                style={{
                  margin: 0,
                  fontSize: 11,
                  padding: '0 4px',
                  lineHeight: '18px',
                  color: '#595959',
                  background: '#f5f5f5',
                  border: 'none',
                }}
              >
                <span style={{ color: '#aaa' }}>{a.label}：</span>
                {a.value}
              </Tag>
            ))}
          </Space>
        )}
      </div>
    )
  }

  const renderPriceWithRef = (unitPrice: number, productId?: number) => {
    const sellPrice = productId ? productMap.get(productId)?.sellPrice : undefined
    if (sellPrice == null || unitPrice === sellPrice) {
      return `¥${unitPrice.toLocaleString()}`
    }
    const diff = unitPrice - sellPrice
    const color = diff > 0 ? '#52c41a' : '#ff4d4f'
    const arrow = diff > 0 ? '↑' : '↓'
    return (
      <div>
        <div>¥{unitPrice.toLocaleString()}</div>
        <div style={{ fontSize: 11, color, lineHeight: '16px' }}>
          {arrow}¥{Math.abs(diff).toLocaleString()}
          <span style={{ color: '#999', marginLeft: 4 }}>参考 ¥{sellPrice.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <Modal
      title={`销售单详情：${order?.orderNo ?? ''}`}
      open={open}
      footer={null}
      onCancel={onClose}
      width={860}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {order && (
          <>
            <Steps
              current={STATUS_MAP[order.displayStatus || order.status]?.step}
              style={{ margin: '20px 0' }}
              size="small"
              items={[{ title: '草稿' }, { title: '已出货' }, { title: '已结束' }]}
            />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="客户">
                {order.customerName || '散客'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[order.displayStatus || order.status]?.color}>
                  {STATUS_MAP[order.displayStatus || order.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="原销售金额">
                ¥{order.totalAmount.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="累计退货净额">
                ¥{order.returnedAmount.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="净销售金额">
                ¥{(order.totalAmount - order.returnedAmount).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="已收款">
                ¥{order.receivedAmount.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="欠款" span={2}>
                <Text
                  type={
                    order.totalAmount - order.returnedAmount - order.receivedAmount > 0
                      ? 'danger'
                      : 'success'
                  }
                >
                  ¥{(order.totalAmount - order.returnedAmount - order.receivedAmount).toLocaleString()}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {order.remark || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="时间" span={2}>
                {formatDateTime(order.createdAt)}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">销售明细</Divider>
            {(order.items?.length ?? 0) > 0 ? (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={order.items}
                columns={[
                  {
                    title: '商品',
                    render: (_: unknown, row) => renderProductCell(row.productName, row.productId),
                  },
                  {
                    title: '销售数量',
                    width: 120,
                    render: (_: unknown, row) => formatCompositeQuantity(row),
                  },
                  {
                    title: '已退数量',
                    dataIndex: 'returnedQuantity',
                    width: 120,
                    render: (v: number, row) => `${formatQuantityNumber(v || 0)}${row.unit || ''}`,
                  },
                  {
                    title: '可退数量',
                    dataIndex: 'remainingQuantity',
                    width: 120,
                    render: (v: number, row) => `${formatQuantityNumber(v || 0)}${row.unit || ''}`,
                  },
                  {
                    title: '单价',
                    width: 140,
                    render: (_: unknown, row) => renderPriceWithRef(row.unitPrice, row.productId),
                  },
                  {
                    title: '小计',
                    dataIndex: 'subtotal',
                    width: 120,
                    render: (v: number) => `¥${v.toLocaleString()}`,
                  },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无销售明细" />
            )}

            <Divider orientation="left">退货记录</Divider>
            {(order.returns?.length ?? 0) > 0 ? (
              order.returns?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.returnNo}</Text>
                      <Text type="secondary">退货金额 ¥{item.totalAmount.toLocaleString()}</Text>
                      <Text type="secondary">退款金额 ¥{item.refundAmount.toLocaleString()}</Text>
                      <Tag>
                        {AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}
                      </Tag>
                    </Space>
                    <Text type="secondary">原因说明：{item.reasonNote || '-'}</Text>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={item.items ?? []}
                      columns={[
                        {
                          title: '商品',
                          render: (_: unknown, row) =>
                            renderProductCell(row.productName, row.productId),
                        },
                        {
                          title: '退货数量',
                          width: 120,
                          render: (_: unknown, row) => formatCompositeQuantity(row),
                        },
                        {
                          title: '单价',
                          width: 140,
                          render: (_: unknown, row) =>
                            renderPriceWithRef(row.unitPrice, row.productId),
                        },
                        {
                          title: '小计',
                          dataIndex: 'subtotal',
                          width: 120,
                          render: (v: number) => `¥${v.toLocaleString()}`,
                        },
                      ]}
                    />
                  </Space>
                </Card>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无退货记录" />
            )}

            <Divider orientation="left">仅退款记录</Divider>
            {(order.refunds?.length ?? 0) > 0 ? (
              <List
                dataSource={order.refunds}
                renderItem={(item) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <div>
                        <div>
                          <Text strong>{item.refundNo}</Text>
                          <Tag>
                            {AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}
                          </Tag>
                        </div>
                        <Text type="secondary">原因说明：{item.reasonNote || '-'}</Text>
                        <div>
                          <Text type="secondary">备注：{item.remark || '-'}</Text>
                        </div>
                      </div>
                      <Text strong>¥{item.amount.toLocaleString()}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无仅退款记录" />
            )}

            <Divider orientation="left">换货记录</Divider>
            {(order.exchanges?.length ?? 0) > 0 ? (
              order.exchanges?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space wrap>
                        <Text strong>{item.exchangeNo}</Text>
                        <Tag color={EXCHANGE_STATUS_MAP[item.status || 'completed']?.color || 'default'}>
                          {EXCHANGE_STATUS_MAP[item.status || 'completed']?.label || item.status || '已完成'}
                        </Tag>
                        <Text type="secondary">换回金额 ¥{item.returnAmount.toLocaleString()}</Text>
                        <Text type="secondary">换出金额 ¥{item.exchangeAmount.toLocaleString()}</Text>
                        <Text type="secondary">退款金额 ¥{item.refundAmount.toLocaleString()}</Text>
                        <Text type="secondary">
                          补差收款 ¥{(item.receiveAmount ?? 0).toLocaleString()}
                        </Text>
                        <Tag>{AFTER_SALE_REASON_LABELS[item.reasonCode || ''] || '未分类'}</Tag>
                      </Space>
                    </Space>
                    <Text type="secondary">原因说明：{item.reasonNote || '-'}</Text>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={item.items ?? []}
                      columns={[
                        {
                          title: '方向',
                          dataIndex: 'direction',
                          width: 60,
                          render: (v: string) => (v === 'return' ? '换回' : '换出'),
                        },
                        {
                          title: '商品',
                          render: (_: unknown, row) =>
                            renderProductCell(row.productName, row.productId),
                        },
                        {
                          title: '数量',
                          width: 120,
                          render: (_: unknown, row) => formatCompositeQuantity(row),
                        },
                        {
                          title: '单价',
                          width: 140,
                          render: (_: unknown, row) =>
                            renderPriceWithRef(row.unitPrice, row.productId),
                        },
                        {
                          title: '小计',
                          dataIndex: 'subtotal',
                          width: 120,
                          render: (v: number) => `¥${v.toLocaleString()}`,
                        },
                      ]}
                    />
                  </Space>
                </Card>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无换货记录" />
            )}
          </>
        )}
      </Spin>
    </Modal>
  )
}
