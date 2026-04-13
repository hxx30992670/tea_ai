import {
  Card,
  Descriptions,
  Divider,
  Empty,
  Modal,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { PurchaseOrder } from '@/types'
import { formatCompositeQuantity, formatQuantityNumber } from '@/utils/packaging'
import type { PurchaseOrderItem } from '@/types'
import dayjs from 'dayjs'

const { Text } = Typography

export type PurchaseOrderStatusMap = Record<
  string,
  { label: string; color: string; step: number }
>

export interface PurchaseOrderDetailModalProps {
  open: boolean
  loading: boolean
  record: PurchaseOrder | null
  statusMap: PurchaseOrderStatusMap
  onClose: () => void
}

export function PurchaseOrderDetailModal({
  open,
  loading,
  record,
  statusMap,
  onClose,
}: PurchaseOrderDetailModalProps) {
  const columns = [
    { title: '商品', dataIndex: 'productName' },
    { title: '采购数量', width: 120, render: (_: unknown, row: PurchaseOrderItem) => formatCompositeQuantity(row) },
    {
      title: '已退数量',
      dataIndex: 'returnedQuantity',
      width: 100,
      render: (v: number, row: PurchaseOrderItem) => `${formatQuantityNumber(v || 0)}${row.unit || ''}`,
    },
    {
      title: '可退数量',
      dataIndex: 'remainingQuantity',
      width: 100,
      render: (v: number, row: PurchaseOrderItem) => `${formatQuantityNumber(v || 0)}${row.unit || ''}`,
    },
    { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` },
  ]
  const recordColumns = [
    { title: '商品', dataIndex: 'productName' },
    { title: '退货数量', width: 120, render: (_: unknown, row: PurchaseOrderItem) => formatCompositeQuantity(row) },
    { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '小计', dataIndex: 'subtotal', width: 120, render: (v: number) => `¥${v.toLocaleString()}` },
  ]
  return (
    <Modal
      title={`采购单详情：${record?.orderNo ?? ''}`}
      open={open}
      footer={null}
      onCancel={onClose}
      width={760}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {record && (
          <>
            <Steps
              current={statusMap[record.status]?.step}
              style={{ margin: '20px 0' }}
              size="small"
              items={[{ title: '草稿' }, { title: '已入库' }, { title: '已结束' }]}
            />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="供应商">{record.supplierName}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[record.status]?.color}>{statusMap[record.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="原采购金额">¥{record.totalAmount.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="累计退货金额">¥{record.returnedAmount.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="净采购金额">
                ¥{(record.totalAmount - record.returnedAmount).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="已付金额">¥{record.paidAmount.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="未付金额" span={2}>
                <Text
                  type={
                    record.totalAmount - record.returnedAmount - record.paidAmount > 0
                      ? 'danger'
                      : 'success'
                  }
                >
                  ¥{(record.totalAmount - record.returnedAmount - record.paidAmount).toLocaleString()}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">采购明细</Divider>
            {(record.items?.length ?? 0) > 0 ? (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={record.items}
                columns={columns}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购明细" />
            )}

            <Divider orientation="left">退货记录</Divider>
            {(record.returns?.length ?? 0) > 0 ? (
              record.returns?.map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.returnNo}</Text>
                      <Text type="secondary">退货金额 ¥{item.totalAmount.toLocaleString()}</Text>
                      <Text type="secondary">供应商退款 ¥{item.refundAmount.toLocaleString()}</Text>
                      <Text type="secondary">{dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </Space>
                    <Text type="secondary">备注：{item.remark || '-'}</Text>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={item.items?.map((r) => ({ ...r, productName: r.productName ?? '' })) as PurchaseOrderItem[] ?? []}
                      columns={recordColumns}
                    />
                  </Space>
                </Card>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无退货记录" />
            )}
          </>
        )}
      </Spin>
    </Modal>
  )
}
