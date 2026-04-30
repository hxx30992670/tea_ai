import type { ProductEntity } from '../../entities/product.entity';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export type BatchAutoPickStrategy =
  | 'expiry_first'
  | 'manual_only'
  | 'production_date_oldest'
  | 'production_date_newest';

export const DEFAULT_BATCH_AUTO_PICK_STRATEGY: BatchAutoPickStrategy = 'expiry_first';

const VALID_BATCH_AUTO_PICK_STRATEGIES = new Set<BatchAutoPickStrategy>([
  'expiry_first',
  'manual_only',
  'production_date_oldest',
  'production_date_newest',
]);

type ProductBatchRuleSource = Pick<ProductEntity, 'extData' | 'producedAt' | 'productionDate' | 'shelfLife'> & {
  batchAutoPickStrategy?: string | null;
};

function parseProductExtData(extData: string | Record<string, unknown> | null | undefined) {
  if (!extData) {
    return {};
  }

  if (typeof extData === 'object') {
    return extData;
  }

  try {
    const parsed = JSON.parse(extData) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function getProductBatchAutoPickStrategy(product: ProductBatchRuleSource): BatchAutoPickStrategy {
  const extData = parseProductExtData(product.extData);
  const rawStrategy =
    (typeof product.batchAutoPickStrategy === 'string' ? product.batchAutoPickStrategy : null) ??
    (typeof extData.batchAutoPickStrategy === 'string' ? extData.batchAutoPickStrategy : null);

  if (rawStrategy && VALID_BATCH_AUTO_PICK_STRATEGIES.has(rawStrategy as BatchAutoPickStrategy)) {
    return rawStrategy as BatchAutoPickStrategy;
  }

  return DEFAULT_BATCH_AUTO_PICK_STRATEGY;
}

export function requiresManualBatchSelection(product: ProductBatchRuleSource) {
  return getProductBatchAutoPickStrategy(product) === 'manual_only';
}

export function applyBatchAutoPickOrder<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  product: ProductBatchRuleSource,
) {
  const strategy = getProductBatchAutoPickStrategy(product);

  if (strategy === 'production_date_oldest') {
    return qb
      .orderBy(`${alias}.production_date IS NULL`, 'ASC')
      .addOrderBy(`${alias}.production_date`, 'ASC')
      .addOrderBy(`${alias}.id`, 'ASC');
  }

  if (strategy === 'production_date_newest') {
    return qb
      .orderBy(`${alias}.production_date IS NULL`, 'ASC')
      .addOrderBy(`${alias}.production_date`, 'DESC')
      .addOrderBy(`${alias}.id`, 'ASC');
  }

  return qb
    .orderBy(`${alias}.expire_at IS NULL`, 'ASC')
    .addOrderBy(`${alias}.expire_at`, 'ASC')
    .addOrderBy(`${alias}.id`, 'ASC');
}

export function computeProductBatchExpireAt(product: ProductBatchRuleSource) {
  if (!product.shelfLife || product.shelfLife <= 0) {
    return null;
  }

  const producedAtValue = product.producedAt ?? product.productionDate;
  if (!producedAtValue) {
    return null;
  }

  const producedAt = new Date(producedAtValue);
  if (Number.isNaN(producedAt.getTime())) {
    return null;
  }

  const expireAt = new Date(producedAt);
  expireAt.setMonth(expireAt.getMonth() + product.shelfLife);
  return expireAt.toISOString();
}
