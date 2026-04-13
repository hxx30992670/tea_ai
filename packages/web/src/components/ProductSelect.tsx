/**
 * 商品选择器组件
 * 用于销售单、采购单等表单中快速选择商品
 * 支持茶叶类型标签展示及价格字段自动匹配
 * 
 * 支持两种模式：
 * - 普通模式：接受 products 参数，父组件一次性加载，本地搜索
 * - 懒加载模式：不传 products，组件内部远程搜索，适合商品数量多的场景
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Select, Tag, Spin } from 'antd'
import type { SelectProps } from 'antd'
import { productApi } from '@/api/products'
import type { Product } from '@/types'

interface ProductSelectProps extends Omit<SelectProps, 'options' | 'loading' | 'filterOption' | 'value' | 'onChange'> {
  /** 商品列表（普通模式必需，懒加载模式不传） */
  products?: Product[]
  /** Form.Item 注入的受控值（商品 ID） */
  value?: number
  /** Form.Item 注入的 onChange */
  onChange?: (id: number | undefined) => void
  /** 额外回调：选中商品变化时触发，用于父组件自动填写单价等 */
  onProductChange?: (product: Product | undefined) => void
  /** 展示哪个价格字段（销售单用 sellPrice，采购单用 costPrice） */
  priceField?: 'sellPrice' | 'costPrice'
  /** 是否启用懒加载模式（商品数量多时推荐） */
  lazy?: boolean
}

const TEA_TYPE_COLORS: Record<string, string> = {
  '生茶': 'green',
  '熟茶': 'volcano',
  '白茶': 'default',
  '乌龙茶': 'gold',
  '岩茶': 'orange',
  '红茶': 'red',
  '绿茶': 'lime',
  '黑茶': 'purple',
  '花茶': 'pink',
  '黄茶': 'yellow',
}

function buildSearchText(p: Product): string {
  const categoryPathText = Array.isArray(p.categoryPath) ? p.categoryPath.join(' ') : ''
  return [p.name, categoryPathText, p.categoryName, p.teaType, p.year, p.origin, p.batchNo, p.spec, p.season, p.sku]
    .filter(Boolean)
    .join(' ')
}

function getCategoryLabel(product: Product): string | undefined {
  if (Array.isArray(product.categoryPath) && product.categoryPath.length > 0) {
    return product.categoryPath[product.categoryPath.length - 1]
  }
  return product.categoryName || product.teaType || undefined
}

function getCategoryPathText(product: Product): string | undefined {
  if (Array.isArray(product.categoryPath) && product.categoryPath.length > 0) {
    return product.categoryPath.join(' / ')
  }
  if (product.categoryName) {
    return product.categoryName
  }
  return product.teaType || undefined
}

export default function ProductSelect({
  products: externalProducts,
  value,
  onChange,
  onProductChange,
  placeholder = '选择商品',
  priceField = 'sellPrice',
  lazy = false,
  ...restProps
}: ProductSelectProps) {
  const [internalProducts, setInternalProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<number | null>(null)

  const isLazyMode = lazy || !externalProducts

  const products = isLazyMode ? internalProducts : (externalProducts || [])

  useEffect(() => {
    if (isLazyMode) {
      loadProducts()
    }
  }, [])

  const loadProducts = async (keyword?: string) => {
    setLoading(true)
    try {
      const res = await productApi.list({ keyword, pageSize: 100 })
      setInternalProducts(res.list || [])
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (input: string) => {
    if (!isLazyMode) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      loadProducts(input)
    }, 300)
  }

  const handleClear = () => {
    if (!isLazyMode) return
    loadProducts()
  }

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  /** 表单预填了商品 ID 但懒加载列表里还没有该条时，拉取详情以便正确展示标签 */
  useEffect(() => {
    if (!isLazyMode || value == null) return
    if (productMap.has(value)) return

    let cancelled = false
    ;(async () => {
      try {
        const p = await productApi.get(value)
        if (cancelled) return
        setInternalProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]))
      } catch {
        // 忽略：用户仍可通过搜索选择商品
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLazyMode, value, productMap])

  const options = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: buildSearchText(p),
        product: p,
      })),
    [products],
  )

  const handleChange = (id: number | undefined) => {
    onChange?.(id)
    onProductChange?.(id != null ? productMap.get(id) : undefined)
  }

  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      style={{ width: 280, ...restProps.style }}
      filterOption={isLazyMode ? false : (input, option) =>
        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      onSearch={isLazyMode ? handleSearch : undefined}
      onClear={isLazyMode ? handleClear : undefined}
      loading={isLazyMode ? loading : false}
      notFoundContent={isLazyMode && loading ? <Spin size="small" /> : '暂无商品'}
      labelRender={(opt) => {
        if (!opt.value) return <span style={{ color: '#bbb' }}>{placeholder}</span>
        const p = productMap.get(Number(opt.value))
        if (!p) return <span>{String(opt.label ?? opt.value)}</span>
        const px = p[priceField]
        const categoryLabel = getCategoryLabel(p)
        const categoryPathText = getCategoryPathText(p)
        const tags = [
          categoryLabel && (
            <Tag key="c" color={TEA_TYPE_COLORS[categoryLabel] ?? 'default'} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
              {categoryLabel}
            </Tag>
          ),
          p.year && (
            <Tag key="y" color="cyan" style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
              {p.year}年
            </Tag>
          ),
        ].filter(Boolean)
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <span style={{ fontWeight: 500, flexShrink: 0 }}>{p.name}</span>
            {tags}
            {categoryPathText && (
              <span style={{ color: '#777', fontSize: 11, whiteSpace: 'nowrap' }}>
                {categoryPathText}
              </span>
            )}
            <span style={{ color: '#2D6A4F', fontSize: 12, flexShrink: 0 }}>
              ¥{px}/{p.unit}
            </span>
          </span>
        )
      }}
      optionRender={(opt) => {
        const p = (opt.data as { product: Product }).product
        if (!p) return <span>{opt.label}</span>
        const px = p[priceField]
        const categoryLabel = getCategoryLabel(p)
        const categoryPathText = getCategoryPathText(p)
        const stock = p.stockQty ?? 0
        const isLowStock = p.safeStock != null && stock <= p.safeStock

        const metaParts = [
          p.origin && `产地：${p.origin}`,
          p.batchNo && `批次 ${p.batchNo}`,
          p.spec && p.spec,
        ].filter(Boolean)

        const typeTags = [
          categoryLabel && (
            <Tag key="category" color={TEA_TYPE_COLORS[categoryLabel] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
              {categoryLabel}
            </Tag>
          ),
          p.year && (
            <Tag key="year" color="cyan" style={{ margin: 0, fontSize: 11 }}>
              {p.year}年
            </Tag>
          ),
          p.season && (
            <Tag key="season" color="lime" style={{ margin: 0, fontSize: 11, borderStyle: 'dashed' }}>
              {p.season}
            </Tag>
          ),
        ].filter(Boolean)

        return (
          <div style={{ padding: '4px 0', lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
              {typeTags}
            </div>
            {categoryPathText && (
              <div style={{ color: '#777', fontSize: 11, marginTop: 2 }}>
                分类：{categoryPathText}
              </div>
            )}
            {metaParts.length > 0 && (
              <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>
                {metaParts.join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 12 }}>
              <span style={{ color: '#2D6A4F', fontWeight: 500 }}>
                ¥{px}/{p.unit}
              </span>
              <span style={{ color: isLowStock ? '#ff4d4f' : '#aaa' }}>
                库存 {stock}{p.unit}{isLowStock ? ' ⚠️' : ''}
              </span>
            </div>
          </div>
        )
      }}
      options={options}
      {...restProps}
    />
  )
}
