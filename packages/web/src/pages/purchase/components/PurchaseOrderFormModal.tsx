import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { PURCHASE_ORDER_STATUS } from '@/constants/order'
import { purchaseOrderApi, type QuickCompletePurchasePayload } from '@/api/purchase'
import { productApi } from '@/api/products'
import type { Product, PurchaseOrder, Supplier } from '@/types'
import { getProductPackageConfig } from '@/utils/packaging'
import { PAYMENT_METHOD_OPTIONS } from '@shared/constants/payment'
import ProductSelect from '@/components/ProductSelect'
import SupplierSelect from '@/components/SupplierSelect'

const { Text } = Typography
const QUANTITY_STEP = 0.0001
const QUANTITY_PRECISION = 4

interface PurchaseOrderFormModalProps {
  open: boolean
  editId: number | null
  loading: boolean
  suppliers: Supplier[]
  onClose: () => void
  onSuccess: () => void
  /** 从外部预填表单（如库存预警跳转） */
  initialValues?: {
    productId: number
    suggestQty: number
  } | null
}

export function PurchaseOrderFormModal({
  open,
  editId,
  loading,
  suppliers,
  onClose,
  onSuccess,
  initialValues,
}: PurchaseOrderFormModalProps) {
  const [form] = Form.useForm()
  const purchaseItems = Form.useWatch('items', form) as Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _product?: Product
  }> | undefined
  const autoPaidAmountRef = useRef<number | undefined>(undefined)
  const syncingPaidAmountRef = useRef(false)
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)

  const getPurchaseItemQuantity = (item: {
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    _product?: Product
  }) => {
    const product = item._product
    const packageConfig = getProductPackageConfig(product)
    if (packageConfig.unit && packageConfig.size > 0) {
      return Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)
    }
    return Number(item.quantity ?? 0)
  }

  const calculatePurchaseItemsTotal = (items?: Array<{
    productId?: number
    quantity?: number
    packageQty?: number
    looseQty?: number
    unitPrice?: number
    _product?: Product
  }>) => {
    const total = (items ?? []).reduce(
      (sum, item) => sum + getPurchaseItemQuantity(item) * Number(item.unitPrice ?? 0), 0
    )
    return total > 0 ? Number(total.toFixed(2)) : undefined
  }

  // 自动填充实付金额
  useEffect(() => {
    if (!open || editId || paidAmountTouched) {
      return
    }

    const nextPaidAmount = calculatePurchaseItemsTotal(purchaseItems)
    if (nextPaidAmount === autoPaidAmountRef.current) {
      return
    }

    syncingPaidAmountRef.current = true
    autoPaidAmountRef.current = nextPaidAmount
    form.setFieldValue('paidAmount', nextPaidAmount)
    //void form.validateFields(['method']).catch(() => {})
    queueMicrotask(() => {
      syncingPaidAmountRef.current = false
    })
  }, [open, editId, paidAmountTouched, purchaseItems, form])

  // 处理从库存预警跳转的预填
  useEffect(() => {
    if (!initialValues || !open) return

    let cancelled = false
      ; (async () => {
        form.resetFields()
        try {
          const p: Product = await productApi.get(initialValues.productId)
          if (cancelled) return

          const pkg = getProductPackageConfig(p)
          const item: Record<string, unknown> = {
            productId: p.id,
            unitPrice: p.costPrice ?? 0,
            _product: p,
          }

          if (pkg.unit && pkg.size > 0) {
            const totalBase = initialValues.suggestQty
            const fullPkgs = Math.floor(totalBase / pkg.size)
            const loose = totalBase % pkg.size
            item.packageQty = fullPkgs
            item.looseQty = fullPkgs === 0 && loose === 0 ? initialValues.suggestQty : loose
          } else {
            item.quantity = initialValues.suggestQty
          }

          form.setFieldsValue({
            supplierId: undefined,
            remark: undefined,
            items: [item],
          })
        } catch {
          if (!cancelled) {
            message.error('加载商品失败')
            onClose()
          }
        }
      })()

    return () => {
      cancelled = true
    }
  }, [initialValues, open, form, onClose])

  const handleClose = () => {
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    form.resetFields()
    onClose()
  }

  const handleSave = async () => {
    const values = await form.validateFields(['supplierId', 'items'])
    const remark = form.getFieldValue('remark')
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => {
      const { _product, ...rest } = item
      return rest
    })
    const payload = { supplierId: values.supplierId, remark, items: cleanedItems }
    if (editId) {
      await purchaseOrderApi.update(editId, payload)
    } else {
      await purchaseOrderApi.create(payload)
    }
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    onSuccess()
  }

  const handleQuickComplete = async () => {
    const values = await form.validateFields()
    const cleanedItems = (values.items ?? []).map((item: Record<string, unknown>) => {
      const { _product, ...rest } = item
      return rest
    })
    const total = cleanedItems.reduce((sum: number, item: Record<string, unknown>) => {
      const product = form.getFieldValue([
        'items',
        (item as { productId: number }).productId ? cleanedItems.indexOf(item) : 0,
        '_product',
      ])
      const packageConfig = getProductPackageConfig(product)
      if (packageConfig.unit && packageConfig.size > 0) {
        return (
          sum +
          (Number(item.packageQty ?? 0) * packageConfig.size + Number(item.looseQty ?? 0)) *
          Number(item.unitPrice ?? 0)
        )
      }
      return sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)
    }, 0)
    const paidAmount = values.paidAmount != null ? values.paidAmount : total
    const payload: QuickCompletePurchasePayload = {
      supplierId: values.supplierId,
      remark: values.remark,
      items: cleanedItems as QuickCompletePurchasePayload['items'],
      paidAmount,
      method: values.method,
    }
    await purchaseOrderApi.quickComplete(payload)
    message.success('采购完成！订单已入库并记录付款')
    setPaidAmountTouched(false)
    autoPaidAmountRef.current = undefined
    onSuccess()
  }

  const handleOpenEdit = async (id: number) => {
    const order: PurchaseOrder = await purchaseOrderApi.getById(id)
    form.setFieldsValue({
      supplierId: order.supplierId,
      remark: order.remark,
      items:
        order.items?.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          unitPrice: item.unitPrice,
        })) ?? [{}],
    })
  }

  useEffect(() => {
    if (open && editId) {
      handleOpenEdit(editId)
    }
  }, [open, editId])

  return (
    <Modal
      title={editId ? '编辑采购订单' : '新建采购订单'}
      open={open}
      onCancel={handleClose}
      width={600}
      destroyOnHidden
      footer={
        editId ? undefined : (
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button onClick={handleSave} style={{ borderColor: '#2D6A4F', color: '#2D6A4F' }}>
              保存草稿
            </Button>
            <Button
              type="primary"
              onClick={handleQuickComplete}
              style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
            >
              保存并完成
            </Button>
          </Space>
        )
      }
      okText="保存"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      onOk={editId ? handleSave : undefined}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="supplierId" label="供应商" rules={[{ required: true }]}>
            <SupplierSelect suppliers={suppliers} />
          </Form.Item>
          <div
            style={{
              background: '#f9f9f9',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              商品明细
            </Text>
            <Form.List name="items" initialValue={[{}]}>
              {(fields, { add, remove }) => (
                <div style={{ marginTop: 12 }}>
                  {fields.map(({ key, ...fieldProps }) => (
                    <Space
                      key={`${key}-${fieldProps.name}`}
                      style={{ width: '100%', marginBottom: 8 }}
                      align="start"
                    >
                      <Form.Item
                        key={`${key}-product`}
                        {...fieldProps}
                        name={[fieldProps.name, 'productId']}
                        rules={[{ required: true, message: '请选择商品' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <ProductSelect
                          lazy
                          priceField="costPrice"
                          onProductChange={(p) => {
                            if (p) {
                              form.setFieldValue(['items', fieldProps.name, 'unitPrice'], p.costPrice)
                              form.setFieldValue(['items', fieldProps.name, '_product'], p)
                            }
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        noStyle
                        shouldUpdate={
                          (prev, cur) =>
                            prev?.items?.[fieldProps.name]?.productId !==
                            cur?.items?.[fieldProps.name]?.productId
                        }
                      >
                        {({ getFieldValue }) => {
                          const selectedProduct = getFieldValue([
                            'items',
                            fieldProps.name,
                            '_product',
                          ])
                          const packageConfig = getProductPackageConfig(selectedProduct)
                          if (packageConfig.unit && packageConfig.size > 0) {
                            return (
                              <>
                                <Form.Item
                                  key={`${key}-pkg`}
                                  {...fieldProps}
                                  name={[fieldProps.name, 'packageQty']}
                                  style={{ marginBottom: 0 }}
                                >
                                  <InputNumber
                                    placeholder={packageConfig.unit}
                                    min={0}
                                    step={QUANTITY_STEP}
                                    precision={QUANTITY_PRECISION}
                                    style={{ width: 82 }}
                                  />
                                </Form.Item>
                                <Form.Item
                                  key={`${key}-loose`}
                                  {...fieldProps}
                                  name={[fieldProps.name, 'looseQty']}
                                  style={{ marginBottom: 0 }}
                                >
                                  <InputNumber
                                    placeholder={packageConfig.baseUnit || '散'}
                                    min={0}
                                    step={QUANTITY_STEP}
                                    precision={QUANTITY_PRECISION}
                                    style={{ width: 82 }}
                                  />
                                </Form.Item>
                              </>
                            )
                          }
                          return (
                            <Form.Item
                              key={`${key}-qty`}
                              {...fieldProps}
                              name={[fieldProps.name, 'quantity']}
                              rules={[{ required: true, message: '数量必填' }]}
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber
                                placeholder="数量"
                                min={QUANTITY_STEP}
                                step={QUANTITY_STEP}
                                precision={QUANTITY_PRECISION}
                                style={{ width: 90 }}
                              />
                            </Form.Item>
                          )
                        }}
                      </Form.Item>
                      <Form.Item
                        key={`${key}-price`}
                        {...fieldProps}
                        name={[fieldProps.name, 'unitPrice']}
                        rules={[{ required: true, message: '单价必填' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          placeholder="单价"
                          prefix="¥"
                          min={0}
                          style={{ width: 120 }}
                        />
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button
                          danger
                          type="link"
                          onClick={() => remove(fieldProps.name)}
                        >
                          删除
                        </Button>
                      )}
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    block
                    style={{ marginTop: 8 }}
                    size="small"
                    onClick={() => add({})}
                  >
                    + 添加商品行
                  </Button>
                </div>
              )}
            </Form.List>
          </div>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          {!editId && (
            <div
              style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 10,
                padding: 16,
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: '#ad6800', display: 'block', marginBottom: 12 }}>
                快捷完成时会自动入库并登记付款；会根据商品与数量自动计算应付金额，必须要选择支付方式。
              </Text>
              <Space>
                <Form.Item name="paidAmount" label="实付金额" style={{ marginBottom: 0 }}>
                  <InputNumber
                    prefix="¥"
                    min={0}
                    precision={2}
                    style={{ width: 160 }}
                    placeholder="按订单金额自动填充"
                    onChange={() => {
                      if (!syncingPaidAmountRef.current) {
                        setPaidAmountTouched(true)
                      }
                      form.validateFields(['method']).catch(() => { })
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="method"
                  label="支付方式"
                  style={{ marginBottom: 0 }}
                  rules={[{ required: true, message: '请选择支付方式' }]}
                >
                  <Select
                    style={{ width: 140 }}
                    placeholder="选择方式"
                    options={PAYMENT_METHOD_OPTIONS}
                  />
                </Form.Item>
              </Space>
            </div>
          )}
        </Form>
      </Spin>
    </Modal>
  )
}
