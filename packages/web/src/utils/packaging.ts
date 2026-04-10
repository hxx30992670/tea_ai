/**
 * 茶叶多单位数量格式化工具
 * 茶叶批发常使用“件+散”的复合单位（如 3箱 + 5斤）
 * 本文件负责格式化、解析及展示此类数量
 */
import type { Product } from '@/types'

/** 格式化复合数量：优先显示“包装+散装”，否则显示普通数量 */
export function formatCompositeQuantity(item: {
  quantity?: number
  packageQty?: number | null
  looseQty?: number | null
  packageUnit?: string | null
  unit?: string | null
}) {
  const packageQty = Number(item.packageQty ?? 0)
  const looseQty = Number(item.looseQty ?? 0)

  // 如果有包装单位且数量有效，显示复合格式
  if (item.packageUnit && (packageQty > 0 || looseQty > 0)) {
    const parts: string[] = []
    if (packageQty > 0) parts.push(`${packageQty}${item.packageUnit}`)
    if (looseQty > 0) parts.push(`${looseQty}${item.unit ?? ''}`)
    return parts.join(' + ')
  }

  // 降级为普通数量显示
  return `${Number(item.quantity ?? 0)}${item.unit ?? ''}`
}

/** 获取商品的包装配置（包装单位、规格、基础单位） */
export function getProductPackageConfig(product?: Product | null) {
  return {
    unit: product?.packageUnit || String(product?.extData?.packageUnit || ''),
    size: Number(product?.packageSize ?? product?.extData?.packageSize ?? 0) || 0,
    baseUnit: product?.unit || String(product?.extData?.unit || ''),
  }
}
