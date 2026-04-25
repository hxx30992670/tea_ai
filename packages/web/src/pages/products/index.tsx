import React, { useEffect, useMemo, useState } from 'react'
import { Table, Button, Space, Tag, Card, Popconfirm, Typography, Image, Tree, Input, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, FolderOpenOutlined, PrinterOutlined, AppstoreOutlined, TagsOutlined } from '@ant-design/icons'
import { productApi, type ProductMeta } from '@/api/products'
import type { Product, Category } from '@/types'
import PageHeader from '@/components/page/PageHeader'
import { formatDate } from '@/utils/date'
import ProductFormModal from './components/ProductFormModal'
import CategoryFormModal from './components/CategoryFormModal'
import PrintLabelsModal from './components/PrintLabelsModal'
import UnitManagementModal from './components/UnitManagementModal'
import '@/styles/page.less'

const { Text } = Typography

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
  const [categoryDefaultParentId, setCategoryDefaultParentId] = useState<number | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined)
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('all')
  const [productMeta, setProductMeta] = useState<ProductMeta | null>(null)
  const [printProducts, setPrintProducts] = useState<Product[]>([])
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [categoryHovered, setCategoryHovered] = useState<string | null>(null)

  const flatCategories = useMemo(() => flattenCategories(categories), [categories])
  const categoryNameMap = useMemo(() => new Map(flatCategories.map((item) => [item.id, item.name])), [flatCategories])

  const openCreate = () => {
    setEditRecord(null)
    setModalOpen(true)
  }

  const openEdit = (record: Product) => {
    setEditRecord(record)
    setModalOpen(true)
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

  const handleDelete = async (id: number) => {
    await productApi.delete(id)
    loadData()
  }

  const openCategoryModal = (category?: Category, defaultParentId?: number) => {
    setCategoryEditRecord(category || null)
    setCategoryDefaultParentId(defaultParentId)
    setCategoryModalOpen(true)
  }

  const handleCategoryDelete = async (category: Category) => {
    try {
      await productApi.deleteCategory(category.id)
      message.success('分类已删除')
      if (categoryFilter === category.id) {
        setCategoryFilter(undefined)
        setSelectedCategoryKey('all')
      }
      await loadData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      message.error(msg || '删除失败')
    }
  }

  const buildSidebarTreeData = (cats: Category[]): object[] => {
    return cats.map((c) => ({
      key: String(c.id),
      title: (
        <div
          className="category-tree-node"
          style={{ justifyContent: 'space-between' }}
          onMouseEnter={() => setCategoryHovered(String(c.id))}
          onMouseLeave={() => setCategoryHovered(null)}
        >
          <span className="category-tree-node-name">{c.name}</span>
          <Space
            size={0}
            style={{ flexShrink: 0, opacity: categoryHovered === String(c.id) ? 1 : 0, transition: 'opacity 0.15s' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined style={{ fontSize: 11 }} />}
              style={{ padding: '0 3px', height: 20, color: '#52c41a' }}
              title="新增子分类"
              onClick={() => openCategoryModal(undefined, c.id)}
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 11 }} />}
              style={{ padding: '0 3px', height: 20, color: '#1677ff' }}
              title="编辑分类"
              onClick={() => openCategoryModal(c)}
            />
            <Popconfirm
              title="确认删除该分类？"
              description="删除前请确保该分类下无子分类和商品"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleCategoryDelete(c)}
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                style={{ padding: '0 3px', height: 20, color: '#ff4d4f' }}
                title="删除分类"
              />
            </Popconfirm>
          </Space>
        </div>
      ),
      children: c.children?.length ? buildSidebarTreeData(c.children) : undefined,
    }))
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
      render: (_: unknown, r: Product) => formatDate(r.productionDate || r.producedAt),
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

  const selectedCategoryName2 = categoryFilter ? categoryNameMap.get(categoryFilter) : undefined

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

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {/* 左侧分类树：与右侧同高；树过深时横向滚动 */}
        <Card
          style={{
            width: 300,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
          styles={{
            header: { flexShrink: 0, minHeight: 40, padding: '0 12px', fontSize: 13 },
            body: {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '4px 0 8px',
              overflow: 'hidden',
            },
          }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>商品分类</span>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined style={{ fontSize: 11 }} />}
                style={{ padding: '0 4px', height: 22, color: '#52c41a' }}
                title="新增顶级分类"
                onClick={() => openCategoryModal(undefined, undefined)}
              />
            </div>
          }
        >
          <div
            role="button"
            tabIndex={0}
            className={`products-category-sidebar-all-row${selectedCategoryKey === 'all' ? ' products-category-sidebar-all-row--selected' : ''}`}
            onClick={() => { setCategoryFilter(undefined); setSelectedCategoryKey('all'); setPage(1) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setCategoryFilter(undefined)
                setSelectedCategoryKey('all')
                setPage(1)
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
          >
            <AppstoreOutlined style={{ fontSize: 13 }} />
            <span style={{ fontSize: 13 }}>全部商品</span>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {categories.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 12 }}>暂无分类</div>
            ) : (
              <Tree
                className="products-category-sidebar-tree"
                treeData={buildSidebarTreeData(categories)}
                selectedKeys={[selectedCategoryKey]}
                defaultExpandAll
                blockNode
                showIcon
                icon={(props: { expanded?: boolean; selected?: boolean }) => props.expanded
                  ? <FolderOpenOutlined style={{ color: props.selected ? '#2d6a4f' : '#6b9080', fontSize: 12 }} />
                  : <FolderOutlined style={{ color: props.selected ? '#2d6a4f' : '#8c9b94', fontSize: 12 }} />
                }
                style={{ fontSize: 13, minWidth: 'max-content', background: 'transparent' }}
                onSelect={(keys) => {
                  if (keys.length === 0) return
                  const key = keys[0] as string
                  setSelectedCategoryKey(key)
                  setCategoryFilter(Number(key))
                  setPage(1)
                }}
              />
            )}
          </div>
        </Card>

        {/* 右侧内容区 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Card className="page-toolbar-card" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Input.Search
                placeholder="搜索商品名称/SKU"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                style={{ width: 220 }}
                allowClear
              />
              {selectedCategoryName2 && (
                <Tag
                  color="green"
                  closable
                  onClose={() => { setCategoryFilter(undefined); setSelectedCategoryKey('all'); setPage(1) }}
                >
                  {selectedCategoryName2}
                </Tag>
              )}
              <Button icon={<PrinterOutlined />} onClick={handleBatchPrint} disabled={selectedRowKeys.length === 0}>
                批量打印标签 ({selectedRowKeys.length})
              </Button>
              <Button icon={<TagsOutlined />} onClick={() => setUnitModalOpen(true)}>
                单位管理
              </Button>
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
        </div>
      </div>

      <ProductFormModal
        open={modalOpen}
        editRecord={editRecord}
        categories={categories}
        productMeta={productMeta}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
      />

      <CategoryFormModal
        open={categoryModalOpen}
        editRecord={categoryEditRecord}
        categories={categories}
        defaultParentId={categoryDefaultParentId}
        onClose={() => setCategoryModalOpen(false)}
        onSuccess={loadData}
      />

      <PrintLabelsModal
        open={printModalOpen}
        products={printProducts}
        onClose={() => setPrintModalOpen(false)}
      />

      <UnitManagementModal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        onChanged={loadData}
      />
    </div>
  )
}
