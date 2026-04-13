import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  InputNumber, Card, Row, Col, TreeSelect, Popconfirm, DatePicker,
  Typography, Image, Tree, message, Checkbox,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, SettingOutlined, FolderOutlined, FolderOpenOutlined, ThunderboltOutlined, PrinterOutlined, BarcodeOutlined } from '@ant-design/icons'
import { productApi, type ProductMetaField, type ProductMeta } from '@/api/products'
import type { Product, Category } from '@/types'
import dayjs from 'dayjs'
import PageHeader from '@/components/page/PageHeader'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import '@/styles/page.less'

const { Title, Text } = Typography

const isCode128Safe = (value?: string | null) => !!value && /^[\x20-\x7E]+$/.test(value)

function buildTreeData(categories: Category[]): object[] {
  return categories.map((c) => ({
    title: c.name, value: c.id,
    children: c.children?.length ? buildTreeData(c.children) : undefined,
  }))
}

function buildCategoryTreeNodes(categories: Category[], onEdit: (c: Category) => void): object[] {
  return categories.map((c) => ({
    key: String(c.id),
    title: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>{c.name}</span>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          style={{ padding: 0, height: 'auto', opacity: 0.6 }}
          onClick={(e) => { e.stopPropagation(); onEdit(c) }}
        />
      </div>
    ),
    children: c.children?.length ? buildCategoryTreeNodes(c.children, onEdit) : undefined,
  }))
}

function flattenCategories(categories: Category[]): Category[] {
  return categories.flatMap((category) => [category, ...(category.children ? flattenCategories(category.children) : [])])
}

export default function ProductsPage() {
  const [list, setList] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<Product | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryEditRecord, setCategoryEditRecord] = useState<Category | null>(null)
  const [form] = Form.useForm()
  const [categoryForm] = Form.useForm()
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number>()
  const [productMeta, setProductMeta] = useState<ProductMeta | null>(null)
  const [generatingSku, setGeneratingSku] = useState(false)
  const [printProducts, setPrintProducts] = useState<Product[]>([])
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const printComponentRef = useRef<HTMLDivElement>(null)
  const [qrCodeMap, setQrCodeMap] = useState<Record<number, string>>({})
  const selectedCategoryId = Form.useWatch('categoryId', form)

  const flatCategories = useMemo(() => flattenCategories(categories), [categories])
  const categoryNameMap = useMemo(() => new Map(flatCategories.map((item) => [item.id, item.name])), [flatCategories])
  const selectedCategoryName = selectedCategoryId ? categoryNameMap.get(selectedCategoryId) : undefined
  const extFieldMap = useMemo(() => {
    return new Map((productMeta?.defaultExtFields || []).map((field) => [field.key, field]))
  }, [productMeta])

  const handlePrint = () => {
    if (!printComponentRef.current || printProducts.length === 0) {
      message.warning('暂无可打印的标签')
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1000px;height:800px;border:none;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return
    }

    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>商品标签打印</title><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
      .label-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .label-item {
        width: 142px;
        height: 90px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
      }
      .label-name { font-weight: 600; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .label-sku { font-size: 10px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .label-bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 4px; }
      .label-price { color: #2D6A4F; font-size: 14px; font-weight: 700; white-space: nowrap; }
      @page { margin: 8mm; }
      @media print { body { padding: 0; } }
    </style></head><body>${printComponentRef.current.innerHTML}</body></html>`)
    doc.close()

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()

    setTimeout(() => {
      document.body.removeChild(iframe)
      setPrintModalOpen(false)
    }, 1200)
  }

  const openCreate = () => {
    setEditRecord(null)
    form.resetFields()
    form.setFieldsValue({ stockQty: 0, status: 1 })
    setModalOpen(true)
  }

  const handleGenerateSku = async () => {
    setGeneratingSku(true)
    try {
      const categoryId = form.getFieldValue('categoryId')
      const res = await productApi.generateSku(categoryId)
      form.setFieldValue('sku', res)
      message.success('SKU 已自动生成')
    } catch {
      message.error('生成失败，请重试')
    } finally {
      setGeneratingSku(false)
    }
  }

  const handlePrintSingle = (product: Product) => {
    setPrintProducts([product])
    setPrintModalOpen(true)
  }

  const handleBatchPrint = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要打印的商品')
      return
    }
    const selected = list.filter(item => selectedRowKeys.includes(item.id))
    setPrintProducts(selected)
    setPrintModalOpen(true)
  }

  useEffect(() => {
    let cancelled = false

    const buildQrCodes = async () => {
      const entries = await Promise.all(
        printProducts.map(async (product) => {
          if (!product.sku) return [product.id, ''] as const
          try {
            const url = await QRCode.toDataURL(product.sku, {
              margin: 0,
              width: 72,
              errorCorrectionLevel: 'M',
            })
            return [product.id, url] as const
          } catch {
            return [product.id, ''] as const
          }
        }),
      )

      if (!cancelled) {
        setQrCodeMap(Object.fromEntries(entries))
      }
    }

    if (printProducts.length > 0) {
      void buildQrCodes()
    } else {
      setQrCodeMap({})
    }

    return () => {
      cancelled = true
    }
  }, [printProducts])
  const openEdit = (record: Product) => {
    setEditRecord(record)
    form.setFieldsValue({
      name: record.name,
      sku: record.sku,
      barcode: record.barcode,
      categoryId: record.categoryId,
      costPrice: record.costPrice,
      sellPrice: record.sellPrice,
      stockQty: record.stockQty,
      remark: record.remark,
      imageUrl: record.imageUrl,
      productionDate: record.productionDate ? dayjs(record.productionDate) : record.producedAt ? dayjs(record.producedAt) : undefined,
      extData: record.extData,
      status: record.status,
    })
    setModalOpen(true)
  }

  const dynamicFields = useMemo(() => {
    if (!productMeta) {
      return [] as ProductMetaField[]
    }

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

  const loadData = async () => {
    setLoading(true)
    try {
      const [res, cats, meta] = await Promise.all([
        productApi.list({ keyword, categoryId: categoryFilter, page, pageSize }),
        productApi.categories(),
        productApi.meta(),
      ])
      setList(res.list)
      setTotal(res.total)
      setCategories(cats)
      setProductMeta(meta)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [keyword, categoryFilter, page, pageSize])

  const handleCategoryChange = (value?: number) => {
    if (!value) {
      return
    }

    const categoryName = categoryNameMap.get(value)
    if (!categoryName) {
      return
    }

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

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name,
      sku: values.sku,
      categoryId: values.categoryId,
      costPrice: values.costPrice,
      sellPrice: values.sellPrice,
      stockQty: values.stockQty,
      remark: values.remark,
      productionDate: values.productionDate ? values.productionDate.toISOString() : undefined,
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
    setModalOpen(false)
    loadData()
  }

  const handleDelete = async (id: number) => {
    await productApi.delete(id)
    loadData()
  }

  const openCategoryModal = (category?: Category) => {
    setCategoryEditRecord(category || null)
    categoryForm.resetFields()
    if (category) {
      categoryForm.setFieldsValue({
        name: category.name,
        parentId: category.parentId ?? undefined,
        sortOrder: category.sortOrder ?? 0,
      })
    } else {
      categoryForm.setFieldsValue({ sortOrder: 0 })
    }
    setCategoryModalOpen(true)
  }

  const handleCategorySubmit = async () => {
    const values = await categoryForm.validateFields()
    if (categoryEditRecord) {
      await productApi.updateCategory(categoryEditRecord.id, values)
    } else {
      await productApi.createCategory(values)
    }
    setCategoryModalOpen(false)
    await loadData()
  }

  const columns = [
    { title: 'SKU', dataIndex: 'sku', width: 130, render: (v: string) => <Text code>{v}</Text> },
    {
      title: '商品名称', dataIndex: 'name', width: 200,
      render: (name: string, r: Product) => (
        <Space>
          {r.imageUrl ? <Image src={r.imageUrl} width={32} height={32} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🍵</div>}
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            {(r.extData?.spec || r.spec) && <Text type="secondary" style={{ fontSize: 12 }}>{String(r.extData?.spec || r.spec)}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: '分类', dataIndex: 'categoryId', width: 110,
      render: (v: number) => v ? <Tag color="green">{categoryNameMap.get(v) || v}</Tag> : '-',
    },
    {
      title: '详细信息', dataIndex: 'extData', width: 220,
      render: (_: unknown, r: Product) => {
        const ext = r.extData || {}
        const packaging = r.packageUnit && r.packageSize ? `1${r.packageUnit}=${r.packageSize}${r.unit || ''}` : undefined
        const tags = [ext.origin, ext.year, ext.season, ext.batchNo, packaging].filter(Boolean)
        return tags.length > 0
          ? <Space wrap>{tags.map((item) => <Tag key={String(item)}>{String(item)}</Tag>)}</Space>
          : '-'
      },
    },
    {
      title: '采购价', dataIndex: 'costPrice', width: 90, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#666' }}>¥{v}</Text>,
    },
    {
      title: '销售价', dataIndex: 'sellPrice', width: 90, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: '#2D6A4F' }}>¥{v}</Text>,
    },
    {
      title: '库存', dataIndex: 'stockQty', width: 80, align: 'right' as const,
      render: (v: number, r: Product) => (
        <Text style={{ color: v <= (r.safeStock ?? 0) ? '#ff4d4f' : 'inherit' }}>
          {v} {r.unit || String(r.extData?.unit || '')}
        </Text>
      ),
    },
    {
      title: '生产日期', dataIndex: 'productionDate', width: 120,
      render: (_: unknown, r: Product) => r.productionDate || r.producedAt || '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: number) => <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '在售' : '停售'}</Tag>,
    },
    {
      title: '操作', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: Product) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => handlePrintSingle(record)} />
          <Popconfirm title="确认删除？" okText="确定" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="商品管理"
        description="管理茶叶商品信息，支持茶类、产地、批次等专业字段"
        className="page-header"
        extra={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className="page-primary-button">
            新增商品
          </Button>
        )}
      />

      {/* 筛选栏 */}
      <Card className="page-toolbar-card">
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索商品名称/SKU"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            style={{ width: 220 }}
            allowClear
          />
          <TreeSelect
            placeholder="分类筛选"
            allowClear
            style={{ width: 220 }}
            treeData={buildTreeData(categories)}
            treeDefaultExpandAll
            onChange={(value) => { setCategoryFilter(value as number | undefined); setPage(1) }}
          />
          <Button icon={<PrinterOutlined />} onClick={handleBatchPrint} disabled={selectedRowKeys.length === 0}>
            批量打印标签 ({selectedRowKeys.length})
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => openCategoryModal()}>管理分类</Button>
        </Space>
      </Card>

      <Card className="page-card page-card--flat">
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editRecord ? '编辑商品' : '新增商品'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        afterClose={() => { form.resetFields(); setEditRecord(null) }}
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
              <Form.Item name="categoryId" label="商品分类">
                <TreeSelect
                  treeData={buildTreeData(categories)}
                  placeholder="选择分类"
                  allowClear
                  treeDefaultExpandAll
                  onChange={(value) => handleCategoryChange(value as number | undefined)}
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
                tooltip={editRecord ? '编辑商品时不能直接改库存，请到库存管理里做入库/出库调整' : '仅用于系统首次建档，不会生成采购应付，但会写入一条“期初建账”库存流水'}
              >
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" disabled={!!editRecord} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productionDate" label="生产日期">
                <DatePicker
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD"
                  placeholder="请选择生产日期"
                />
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

      <Modal
        title={categoryEditRecord ? '编辑分类' : '新增分类'}
        open={categoryModalOpen}
        onOk={handleCategorySubmit}
        onCancel={() => { setCategoryModalOpen(false); categoryForm.resetFields(); setCategoryEditRecord(null) }}
        afterClose={() => { categoryForm.resetFields(); setCategoryEditRecord(null) }}
        width={660}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
      >
        <Row gutter={24} style={{ marginTop: 16 }}>
          <Col span={11}>
            <Form form={categoryForm} layout="vertical">
              <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
                <Input placeholder="如：绿茶" autoFocus />
              </Form.Item>
              <Form.Item name="parentId" label="父分类（可选）">
                <TreeSelect
                  treeData={buildTreeData(categories)}
                  allowClear
                  treeDefaultExpandAll
                  placeholder="顶级分类"
                  // 编辑时排除自身，避免循环
                  treeNodeFilterProp="title"
                />
              </Form.Item>
              <Form.Item name="sortOrder" label="排序值" tooltip="数值越小越靠前">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Form>
            {categoryEditRecord && (
              <div style={{ marginTop: 4 }}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => { setCategoryEditRecord(null); categoryForm.resetFields(); categoryForm.setFieldsValue({ sortOrder: 0 }) }}
                >
                  + 切换为新增模式
                </Button>
              </div>
            )}
          </Col>
          <Col span={13}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
              现有分类 <span style={{ color: '#bbb' }}>（点击编辑按钮修改）</span>
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: '4px 0' }}>
              {categories.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#bbb', padding: '24px 0', fontSize: 13 }}>暂无分类</div>
              ) : (
                <Tree
                  treeData={buildCategoryTreeNodes(categories, openCategoryModal)}
                  defaultExpandAll
                  blockNode
                  icon={(props) => props.expanded ? <FolderOpenOutlined style={{ color: '#2D6A4F' }} /> : <FolderOutlined style={{ color: '#2D6A4F' }} />}
                  showIcon
                  style={{ fontSize: 13 }}
                />
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      {/* 打印标签 Modal */}
      <Modal
        title="打印商品标签"
        open={printModalOpen}
        onCancel={() => setPrintModalOpen(false)}
        onOk={handlePrint}
        okText="打印"
        cancelText="取消"
        width={800}
        okButtonProps={{
          icon: <PrinterOutlined />,
          style: { background: '#2D6A4F', borderColor: '#2D6A4F' },
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">共 {printProducts.length} 个标签，将生成 40mm×30mm 标准热敏标签</Text>
        </div>
        <div
          ref={printComponentRef}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            maxHeight: 500,
            overflow: 'auto',
            padding: 16,
            background: '#fafafa',
            borderRadius: 8,
          }}
        >
          {printProducts.map((product) => (
             <div
              key={product.id}
              style={{
                width: 142,
                height: 116,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                padding: '8px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {product.name}
              </div>
              <div style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {product.sku || '-'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minHeight: 42 }}>
                <span style={{ color: '#2D6A4F', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>¥{product.sellPrice}</span>
                {qrCodeMap[product.id] ? (
                  <img src={qrCodeMap[product.id]} alt={`${product.sku}-qrcode`} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 40, height: 40, border: '1px dashed #ddd', borderRadius: 4, flexShrink: 0 }} />
                )}
              </div>
              <div style={{ marginTop: 4, minHeight: 26, display: 'flex', alignItems: 'flex-end' }}>
                {isCode128Safe(product.sku) ? (
                  <svg
                    style={{ width: '100%', height: 24, display: 'block' }}
                    ref={(el) => {
                      if (el && product.sku) {
                        try {
                          JsBarcode(el as SVGSVGElement, product.sku, {
                            format: 'CODE128',
                            width: 1.08,
                            height: 24,
                            displayValue: false,
                            margin: 0,
                          })
                        } catch {
                          // 忽略条形码生成错误
                        }
                      }
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 9, color: '#999' }}>SKU含中文，请改英文数字</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
