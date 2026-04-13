import { useEffect, useMemo } from 'react'
import {
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import type { PurchaseOrder } from '@/types'
import { formatCompositeQuantity, formatQuantityNumber } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import { purchaseOrderApi } from '@/api/purchase'

const { Text } = Typography

export interface PurchaseReturnModalProps {
  open: boolean
  loading: boolean
  record: PurchaseOrder | null
  onClose: () => void
  onSuccess: (order: PurchaseOrder) => void
}

export function PurchaseReturnModal({
  open,
  loading,
  record,
  onClose,
  onSuccess,
}: PurchaseReturnModalProps) {
  const [form] = Form.useForm()
  const quantities = Form.useWatch('quantities', form) as Record<string, number> | undefined
  const packageQuantities = Form.useWatch('packageQuantities', form) as Record<string, number> | undefined
  const looseQuantities = Form.useWatch('looseQuantities', form) as Record<string, number> | undefined

  useEffect(() => {
    if (!open || !record) return
    const quantitiesValue = Object.fromEntries((record.items ?? []).map((item) => [String(item.id), 0]))
    form.setFieldsValue({
      quantities: quantitiesValue,
      packageQuantities: quantitiesValue,
      looseQuantities: quantitiesValue,
      refundAmount: 0,
      method: undefined,
      remark: undefined,
    })
  }, [open, record?.id, form, record])

  const returnPreviewAmount = useMemo(
    () =>
      (record?.items ?? []).reduce((sum, item) => {
        const qty =
          item.packageUnit && item.packageSize
            ? Number(packageQuantities?.[String(item.id)] ?? 0) * Number(item.packageSize ?? 0) +
              Number(looseQuantities?.[String(item.id)] ?? 0)
            : Number(quantities?.[String(item.id)] ?? 0)
        return sum + qty * item.unitPrice
      }, 0),
    [record?.items, quantities, packageQuantities, looseQuantities],
  )

  useEffect(() => {
    if (open) form.setFieldValue('refundAmount', returnPreviewAmount)
  }, [returnPreviewAmount, open, form])

  const handleOk = async () => {
    if (!record) return
    const values = await form.validateFields()
    const items = (record.items ?? [])
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Number(values.quantities?.[String(item.id)] ?? 0) || undefined,
        packageQty: Number(values.packageQuantities?.[String(item.id)] ?? 0) || undefined,
        looseQty: Number(values.looseQuantities?.[String(item.id)] ?? 0) || undefined,
      }))
      .filter(
        (item) =>
          Number(item.quantity ?? 0) > 0 || Number(item.packageQty ?? 0) > 0 || Number(item.looseQty ?? 0) > 0,
      )

    if (items.length === 0) {
      message.error('请至少填写一条退货数量')
      return
    }

    const order = await purchaseOrderApi.createReturn(record.id, {
      items,
      refundAmount: values.refundAmount ?? 0,
      method: values.method,
      remark: values.remark,
    })
    message.success('采购退货处理成功')
    onClose()
    onSuccess(order)
  }

  return (
    <Modal
      title={`采购退货：${record?.orderNo ?? ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      width={700}
      okText="确认退货"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {record && (
          <>
            <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
              <Space direction="vertical" size={6}>
                <Text>供应商：{record.supplierName}</Text>
                <Text>原采购金额：¥{record.totalAmount.toLocaleString()}</Text>
                <Text>当前已付款：¥{record.paidAmount.toLocaleString()}</Text>
                <Text>累计已退货：¥{record.returnedAmount.toLocaleString()}</Text>
                <Text strong>本次退货预估金额：¥{returnPreviewAmount.toLocaleString()}</Text>
              </Space>
            </Card>
            <Form form={form} layout="vertical">
              <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  填写每个商品的本次退货数量，不能超过可退数量
                </Text>
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                  {(record.items ?? []).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 90px 180px',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <Text strong>{item.productName}</Text>
                        <div>
                          <Text type="secondary">
                            已采 {formatCompositeQuantity(item)}，可退 {formatQuantityNumber(item.remainingQuantity ?? 0)}
                            {item.unit || ''}
                          </Text>
                        </div>
                      </div>
                      <Text>¥{item.unitPrice.toLocaleString()}</Text>
                      <Text type="secondary">
                        可退 {formatQuantityNumber(item.remainingQuantity ?? 0)}
                        {item.unit || ''}
                      </Text>
                      {item.packageUnit && item.packageSize ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Form.Item name={['packageQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>
                            {item.packageUnit || '包装'}
                          </Text>
                          <Form.Item name={['looseQuantities', String(item.id)]} style={{ marginBottom: 0, flex: 1 }}>
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Text type="secondary" style={{ flexShrink: 0 }}>
                            {item.unit || '散'}
                          </Text>
                        </div>
                      ) : (
                        <Form.Item name={['quantities', String(item.id)]} style={{ marginBottom: 0 }}>
                          <InputNumber min={0} max={item.remainingQuantity ?? 0} style={{ width: '100%' }} />
                        </Form.Item>
                      )}
                    </div>
                  ))}
                </Space>
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="refundAmount" label="本次供应商退款金额">
                    <InputNumber
                      style={{ width: '100%' }}
                      prefix="¥"
                      min={0}
                      precision={2}
                      onChange={() => form.validateFields(['method'])}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="method"
                    label="退款方式"
                    dependencies={['refundAmount']}
                    rules={[
                      {
                        validator(_, value) {
                          const amount = Number(form.getFieldValue('refundAmount') ?? 0)
                          if (amount > 0 && !value) return Promise.reject(new Error('有退款金额时必须选择退款方式'))
                          return Promise.resolve()
                        },
                      },
                    ]}
                  >
                    <Select allowClear placeholder="请选择退款方式" options={PAYMENT_METHOD_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="remark" label="退货备注">
                <Input.TextArea rows={3} placeholder="比如：来货受潮，退回 2 包并申请供应商转账退款" />
              </Form.Item>
            </Form>
          </>
        )}
      </Spin>
    </Modal>
  )
}
