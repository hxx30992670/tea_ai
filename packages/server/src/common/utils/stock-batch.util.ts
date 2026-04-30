import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';
import { StockBatchEntity } from '../../entities/stock-batch.entity';
import { StockLocationEntity } from '../../entities/stock-location.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { STOCK_BATCH_STATUS } from '../constants/stock-batch-status';
import { addQuantity, compareQuantity, roundQuantity, subtractQuantity } from './precision.util';
import { computeProductBatchExpireAt } from './batch-auto-pick.util';

export function generateStockBatchNo(product: ProductEntity, prefix?: string) {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const code = (product.sku || `P${product.id}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || `P${product.id}`;
  return prefix ? `${prefix}-${code}` : `${datePart}-${code}-01`;
}

export async function ensureDefaultWarehouseLocation(manager: EntityManager) {
  const warehouseRepository = manager.getRepository(WarehouseEntity);
  const locationRepository = manager.getRepository(StockLocationEntity);

  let warehouse =
    await warehouseRepository.findOne({ where: { isDefault: 1 } }) ??
    await warehouseRepository.findOne({ where: { status: 1 }, order: { id: 'ASC' } });

  if (!warehouse) {
    warehouse = await warehouseRepository.save(
      warehouseRepository.create({
        code: 'WH-MAIN',
        name: '主仓',
        type: 'main',
        isDefault: 1,
        status: 1,
        address: null,
        remark: null,
      }),
    );
  }

  let location = await locationRepository.findOne({
    where: { warehouseId: warehouse.id, status: 1 },
    order: { id: 'ASC' },
  });

  if (!location) {
    location = await locationRepository.save(
      locationRepository.create({
        warehouseId: warehouse.id,
        code: 'DEFAULT',
        name: '默认仓位',
        status: 1,
        remark: null,
      }),
    );
  }

  return { warehouse, location };
}

export async function resolveWarehouseLocation(
  manager: EntityManager,
  warehouseId?: number,
  locationId?: number | null,
) {
  const warehouseRepository = manager.getRepository(WarehouseEntity);
  const locationRepository = manager.getRepository(StockLocationEntity);
  const fallback = await ensureDefaultWarehouseLocation(manager);

  const warehouse = warehouseId
    ? await warehouseRepository.findOne({ where: { id: warehouseId } })
    : fallback.warehouse;
  if (!warehouse || warehouse.status !== 1) {
    throw new BadRequestException('仓库不存在或已停用');
  }

  if (locationId) {
    const location = await locationRepository.findOne({ where: { id: locationId, warehouseId: warehouse.id } });
    if (!location || location.status !== 1) {
      throw new BadRequestException('仓位不存在、已停用或不属于所选仓库');
    }
    return { warehouse, location };
  }

  const location = await locationRepository.findOne({
    where: { warehouseId: warehouse.id, status: 1 },
    order: { id: 'ASC' },
  });
  return { warehouse, location: location ?? null };
}

export async function findBatchByScope(
  manager: EntityManager,
  productId: number,
  batchNo: string,
  warehouseId: number,
  locationId?: number | null,
  status?: number | null,
) {
  const qb = manager
    .getRepository(StockBatchEntity)
    .createQueryBuilder('batch')
    .where('batch.product_id = :productId', { productId })
    .andWhere('batch.batch_no = :batchNo', { batchNo })
    .andWhere('batch.warehouse_id = :warehouseId', { warehouseId });

  if (status != null) {
    qb.andWhere('batch.status = :status', { status });
  }

  if (locationId) {
    qb.andWhere('batch.location_id = :locationId', { locationId });
  } else {
    qb.andWhere('batch.location_id IS NULL');
  }

  return qb.getOne();
}

export async function resolveInboundStockBatch(
  manager: EntityManager,
  product: ProductEntity,
  options: {
    batchId?: number | null;
    batchNo?: string | null;
    warehouseId?: number | null;
    locationId?: number | null;
    status?: number | null;
    costPrice?: number | null;
    remark?: string | null;
  },
) {
  const batchRepository = manager.getRepository(StockBatchEntity);

  if (options.batchId) {
    const batch = await batchRepository.findOne({ where: { id: options.batchId } });
    if (!batch || batch.productId !== product.id) {
      throw new BadRequestException('入库批次不存在或不属于该商品');
    }
    return batch;
  }

  const scope = await resolveWarehouseLocation(manager, options.warehouseId ?? undefined, options.locationId ?? null);
  const batchNo = options.batchNo?.trim() || product.batchNo || generateStockBatchNo(product);
  const batchStatus = options.status ?? STOCK_BATCH_STATUS.SELLABLE;
  let batch = await findBatchByScope(
    manager,
    product.id,
    batchNo,
    scope.warehouse.id,
    scope.location?.id ?? null,
    batchStatus,
  );
  if (!batch) {
    batch = batchRepository.create({
      productId: product.id,
      batchNo,
      warehouseId: scope.warehouse.id,
      locationId: scope.location?.id ?? null,
      quantity: 0,
      lockedQty: 0,
      costPrice: options.costPrice ?? product.costPrice ?? 0,
      productionDate: product.producedAt ?? null,
      expireAt: computeProductBatchExpireAt(product),
      status: batchStatus,
      remark: options.remark ?? null,
    });
  }

  return batch;
}

export async function ensureLegacyStockBatchConsistency(manager: EntityManager, product: ProductEntity) {
  const stockQty = roundQuantity(product.stockQty ?? 0);
  if (compareQuantity(stockQty, 0) <= 0) {
    return null;
  }

  const row = await manager
    .getRepository(StockBatchEntity)
    .createQueryBuilder('batch')
    .select('COALESCE(SUM(batch.quantity), 0)', 'batchQty')
    .where('batch.product_id = :productId', { productId: product.id })
    .getRawOne<{ batchQty: string | number }>();

  const batchQty = roundQuantity(row?.batchQty ?? 0);
  const missingQty = subtractQuantity(stockQty, batchQty);
  if (compareQuantity(missingQty, 0) <= 0) {
    return null;
  }

  let batch = await resolveInboundStockBatch(manager, product, {
    batchNo: product.batchNo || generateStockBatchNo(product, 'LEGACY'),
    costPrice: product.costPrice,
    remark: '历史商品库存自动补齐批次',
  });
  batch.quantity = addQuantity(batch.quantity ?? 0, missingQty);
  if (!batch.remark) {
    batch.remark = '历史商品库存自动补齐批次';
  }
  batch = await manager.getRepository(StockBatchEntity).save(batch);
  return batch;
}

export async function syncProductAvailableStockQty(manager: EntityManager, product: ProductEntity) {
  await ensureLegacyStockBatchConsistency(manager, product);

  const row = await manager
    .getRepository(StockBatchEntity)
    .createQueryBuilder('batch')
    .select('COALESCE(SUM(batch.quantity), 0)', 'availableStockQty')
    .where('batch.product_id = :productId', { productId: product.id })
    .andWhere('batch.status = :status', { status: STOCK_BATCH_STATUS.SELLABLE })
    .getRawOne<{ availableStockQty: string | number }>();

  const availableStockQty = roundQuantity(row?.availableStockQty ?? 0);
  if (compareQuantity(product.availableStockQty, availableStockQty) !== 0) {
    product.availableStockQty = availableStockQty;
    await manager.getRepository(ProductEntity).save(product);
  }

  return availableStockQty;
}
