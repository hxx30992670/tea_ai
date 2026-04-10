/**
 * 商品选择器组件
 * 用于销售单、采购单等表单中快速选择商品
 * 支持茶叶类型标签展示及价格字段自动匹配
 */
import React from 'react'
import { Select, Tag } from 'antd'
import type { Product } from '@/types'

interface ProductSelectProps {
  products: Product[]
  /** Form.Item 注入的受控值（商品 ID） */
  value?: number
  /** Form.Item 注入的 onChange */
  onChange?: (id: number | undefined) => void
  /** 额外回调：选中商品变化时触发，用于父组件自动填写单价等 */
  onProductChange?: (product: Product | undefined) => void
  placeholder?: string
  /** 展示哪个价格字段（销售单用 sellPrice，采购单用 costPrice） */
  priceField?: 'sellPrice' | 'costPrice'
  style?: React.CSSProperties
}

// 茶叶类型 → 标签颜色
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

/** 构建用于搜索的文本（联合所有茶叶属性） */
function buildSearchText(p: Product): string {
  return [p.name, p.teaType, p.year, p.origin, p.batchNo, p.spec, p.season, p.sku]
    .filter(Boolean)
    .join(' ')
}

export default function ProductSelect({
  products,
  value,
  onChange,
  onProductChange,
  placeholder = '选择商品',
  priceField = 'sellPrice',
  style,
}: ProductSelectProps) {
  const productMap = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  const options = React.useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        // label 用于 filterOption 全字段搜索
        label: buildSearchText(p),
        // data 传给 optionRender / labelRender 使用
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
      style={{ width: 280, ...style }}
      filterOption={(input, option) =>
        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      // ── 已选中状态的紧凑展示 ──────────────────────────────────────
      labelRender={(opt) => {
        if (!opt.value) return <span style={{ color: '#bbb' }}>{placeholder}</span>
        const p = productMap.get(Number(opt.value))
        if (!p) return <span>{String(opt.label ?? opt.value)}</span>
        const px = p[priceField]
        const tags = [
          p.teaType && (
            <Tag key="t" color={TEA_TYPE_COLORS[p.teaType] ?? 'default'} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
              {p.teaType}
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
            <span style={{ color: '#2D6A4F', fontSize: 12, flexShrink: 0 }}>
              ¥{px}/{p.unit}
            </span>
          </span>
        )
      }}
      // ── 下拉列表中的富文本选项 ─────────────────────────────────────
      optionRender={(opt) => {
        const p = (opt.data as { product: Product }).product
        if (!p) return <span>{opt.label}</span>
        const px = p[priceField]
        const stock = p.stockQty ?? 0
        const isLowStock = p.safeStock != null && stock <= p.safeStock

        const metaParts = [
          p.origin && `产地：${p.origin}`,
          p.batchNo && `批次 ${p.batchNo}`,
          p.spec && p.spec,
        ].filter(Boolean)

        const typeTags = [
          p.teaType && (
            <Tag key="type" color={TEA_TYPE_COLORS[p.teaType] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
              {p.teaType}
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
            {/* 第一行：名称 + 属性标签 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
              {typeTags}
            </div>
            {/* 第二行：产地 / 批次 / 规格 */}
            {metaParts.length > 0 && (
              <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>
                {metaParts.join(' · ')}
              </div>
            )}
            {/* 第三行：价格 + 库存 */}
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
    />
  )
}
