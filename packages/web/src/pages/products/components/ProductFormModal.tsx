import React, { useMemo } from 'react'
import { Modal, Form, Input, Select, InputNumber, Row, Col, TreeSelect, DatePicker, Card, Button } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Product, Category } from '@/types'
import { productApi, type ProductMeta, type ProductMetaField } from '@/api/products'
import { toDateOnlyValue } from '@/utils/date'

function buildTreeData(categories: Category[]): object[] {
  return categories.map((c) => ({
    title: c.name,
    value: c.id,
    children: c.children?.length ? buildTreeData(c.children) : undefined,
  }))
}

interface ProductFormModalProps {
  open: boolean
  editRecord: Product | null
  categories: Category[]
  productMeta: ProductMeta | null
  onClose: () => void
  onSuccess: () => void
}

export default function ProductFormModal({ open, editRecord, categories, productMeta, onClose, onSuccess }: ProductFormModalProps) {
  const [form] = Form.useForm()
  const [generatingSku, setGeneratingSku] = React.useState(false)

  const selectedCategoryId = Form.useWatch('categoryId', form)

  const categoryNameMap = useMemo(() => {
    const flat = categories.flatMap((c) => [c, ...(c.children || [])])
    return new Map(flat.map((item) => [item.id, item.name]))
  }, [categories])

  const selectedCategoryName = selectedCategoryId ? categoryNameMap.get(selectedCategoryId) : undefined

  const extFieldMap = useMemo(() => {
    return new Map((productMeta?.defaultExtFields || []).map((field) => [field.key, field]))
  }, [productMeta])

  const dynamicFields = useMemo(() => {
    if (!productMeta) return [] as ProductMetaField[]
    const presetKeys = selectedCategoryName
      ? productMeta.categoryFieldPresets[selectedCategoryName] || productMeta.defaultExtFields.map((field) => field.key)
      : productMeta.defaultExtFields.map((field) => field.key)
    return presetKeys
      .map((key) => extFieldMap.get(key))
      .filter(Boolean)
      .map((field) => ({
        ...(field as ProductMetaField),
        options: field?.source === 'units'
          ? productMeta.units.map((item) => ({ value: item, label: item }))
          : field?.source === 'seasons'
            ? productMeta.seasons.map((item) => ({ value: item, label: item }))
            : undefined,
      })) as ProductMetaField[]
  }, [productMeta, selectedCategoryName, extFieldMap])

  React.useEffect(() => {
    if (open) {
      if (editRecord) {
        form.setFieldsValue({
          name: editRecord.name,
          sku: editRecord.sku,
          barcode: editRecord.barcode,
          unit: editRecord.unit,
          categoryId: editRecord.categoryId,
          costPrice: editRecord.costPrice,
          sellPrice: editRecord.sellPrice,
          stockQty: editRecord.stockQty,
          remark: editRecord.remark,
          imageUrl: editRecord.imageUrl,
          productionDate: editRecord.productionDate ? dayjs(editRecord.productionDate) : editRecord.producedAt ? dayjs(editRecord.producedAt) : undefined,
          extData: editRecord.extData,
          status: editRecord.status,
        })
      } else {
        form.resetFields()
        form.setFieldsValue({ stockQty: 0, status: 1, unit: productMeta?.units[0] })
      }
    }
  }, [open, editRecord, form])

  React.useEffect(() => {
    if (open && !editRecord && !form.getFieldValue('unit') && productMeta?.units[0]) {
      form.setFieldValue('unit', productMeta.units[0])
    }
  }, [open, editRecord, form, productMeta?.units])

  const handleCategoryChange = (value?: number) => {
    if (!value) return
    const categoryName = categoryNameMap.get(value)
    if (!categoryName) return
    const currentExtData = form.getFieldValue('extData') || {}
    const shelfLifePresets = productMeta?.shelfLifePresets || {}
    form.setFieldValue('extData', {
      ...currentExtData,
      teaType: categoryName,
      ...(currentExtData.shelfLife === undefined && shelfLifePresets[categoryName] !== undefined
        ? { shelfLife: shelfLifePresets[categoryName] }
        : {}),
    })
  }

  const handleGenerateSku = async () => {
    setGeneratingSku(true)
    try {
      const categoryId = form.getFieldValue('categoryId')
      const res = await productApi.generateSku(categoryId)
      form.setFieldValue('sku', res)
    } catch {
      // error handled silently
    } finally {
      setGeneratingSku(false)
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name,
      sku: values.sku,
      unit: values.unit,
      categoryId: values.categoryId,
      costPrice: values.costPrice,
      sellPrice: values.sellPrice,
      stockQty: values.stockQty,
      remark: values.remark,
      productionDate: toDateOnlyValue(values.productionDate),
      barcode: values.barcode,
      imageUrl: values.imageUrl,
      extData: values.extData,
      status: values.status ?? 1,
    }
    if (editRecord) {
      await productApi.update(editRecord.id, payload)
    } else {
      await productApi.create(payload)
    }
    onClose()
    onSuccess()
  }

  return (
    <Modal
      title={editRecord ? '编辑商品' : '新增商品'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      afterClose={() => { form.resetFields() }}
      width={720}
      okText="保存"
      cancelText="取消"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="商品名称" rules={[{ required: true }]}>
              <Input placeholder="如：西湖龙井 2026 春茶" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sku" label="商品编码(SKU)">
              <Input
                placeholder="留空将自动生成"
                suffix={
                  <Button
                    type="link"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={handleGenerateSku}
                    loading={generatingSku}
                    style={{ padding: 0 }}
                  >
                    自动生成
                  </Button>
                }
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="barcode" label="条码">
              <Input placeholder="如：6901234567890" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="categoryId" label="商品分类" rules={[{ required: true, message: '请选择商品分类' }]}>
              <TreeSelect
                treeData={buildTreeData(categories)}
                placeholder="选择分类"
                treeDefaultExpandAll
                onChange={(value) => handleCategoryChange(value as number | undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择商品单位' }]}>
              <Select
                options={(productMeta?.units || []).map((unit) => ({ value: unit, label: unit }))}
                placeholder="请选择商品单位"
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sellPrice" label="销售价" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="costPrice" label="采购价" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} prefix="¥" min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="stockQty"
              label={editRecord ? '当前库存（只读）' : '期初库存'}
              tooltip={editRecord ? '编辑商品时不能直接改库存，请到库存管理里做入库/出库调整' : '仅用于系统首次建档，不会生成采购应付，但会写入一条"期初建账"库存流水'}
            >
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0" disabled={!!editRecord} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="productionDate" label="生产日期">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="请选择生产日期" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="imageUrl" label="图片地址">
              <Input placeholder="https://example.com/tea.jpg" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="状态">
              <Select options={[{ value: 1, label: '在售' }, { value: 0, label: '停售' }]} />
            </Form.Item>
          </Col>
          {selectedCategoryName && (
            <Col span={24}>
              <Card size="small" title="详细信息" style={{ background: '#fafafa' }}>
                <Row gutter={16}>
                  {dynamicFields.map((field) => (
                    <Col span={12} key={field.key}>
                      <Form.Item name={['extData', field.key]} label={field.label}>
                        {field.type === 'input' && <Input placeholder={`请输入${field.label}`} />}
                        {field.type === 'number' && <InputNumber style={{ width: '100%' }} min={0} placeholder={`请输入${field.label}`} />}
                        {field.type === 'select' && <Select options={field.options} placeholder={`请选择${field.label}`} allowClear />}
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
          )}
          <Col span={24}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} placeholder="商品描述或备注信息" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
