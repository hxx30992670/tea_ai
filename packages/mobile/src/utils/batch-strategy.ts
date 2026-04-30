import type { Product } from '@/types'

export type BatchAutoPickStrategy =
  | 'expiry_first'
  | 'manual_only'
  | 'production_date_oldest'
  | 'production_date_newest'

export const DEFAULT_BATCH_AUTO_PICK_STRATEGY: BatchAutoPickStrategy = 'expiry_first'

export function getBatchAutoPickStrategy(product?: Pick<Product, 'batchAutoPickStrategy' | 'extData'> | null): BatchAutoPickStrategy {
  const extDataStrategy = typeof product?.extData?.batchAutoPickStrategy === 'string'
    ? product.extData.batchAutoPickStrategy
    : undefined
  const rawStrategy = product?.batchAutoPickStrategy ?? extDataStrategy

  if (
    rawStrategy === 'manual_only' ||
    rawStrategy === 'production_date_oldest' ||
    rawStrategy === 'production_date_newest' ||
    rawStrategy === 'expiry_first'
  ) {
    return rawStrategy
  }

  return DEFAULT_BATCH_AUTO_PICK_STRATEGY
}

export function getBatchAutoPickPlaceholder(product?: Pick<Product, 'batchAutoPickStrategy' | 'extData'> | null) {
  const strategy = getBatchAutoPickStrategy(product)
  if (strategy === 'manual_only') {
    return '该商品必须手选批次'
  }
  if (strategy === 'production_date_oldest') {
    return '按生产日期较早自动选择'
  }
  if (strategy === 'production_date_newest') {
    return '按生产日期较新自动选择'
  }
  return '按临期优先自动选择'
}
