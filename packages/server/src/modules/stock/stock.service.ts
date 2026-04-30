/**
 * 库存服务
 * 负责库存出入库管理、流水记录、低库存预警及临期商品检测
 * 支持茶叶"件+散"复合单位转换
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { applyBatchAutoPickOrder, computeProductBatchExpireAt, DEFAULT_BATCH_AUTO_PICK_STRATEGY, requiresManualBatchSelection } from '../../common/utils/batch-auto-pick.util';
import { STOCK_BATCH_STATUS, STOCK_BATCH_STATUS_VALUES } from '../../common/constants/stock-batch-status';
import { resolveCompositeQuantity, getProductPackageConfig } from '../../common/utils/packaging.util';
import { addQuantity, compareQuantity, roundQuantity, subtractQuantity } from '../../common/utils/precision.util';
import { ensureLegacyStockBatchConsistency, findBatchByScope, resolveInboundStockBatch, resolveWarehouseLocation, syncProductAvailableStockQty } from '../../common/utils/stock-batch.util';
import { InventoryCountEntity } from '../../entities/inventory-count.entity';
import { InventoryCountItemEntity } from '../../entities/inventory-count-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockBatchEntity } from '../../entities/stock-batch.entity';
import { StockLocationEntity } from '../../entities/stock-location.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { StockTransferEntity } from '../../entities/stock-transfer.entity';
import { StockTransferItemEntity } from '../../entities/stock-transfer-item.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateInventoryCountDto } from './dto/inventory-count.dto';
import { ProcessAfterSaleStockDto } from './dto/after-sale-stock.dto';
import { StockBatchQueryDto } from './dto/stock-batch-query.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockRecordQueryDto } from './dto/stock-record-query.dto';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';
import { CreateStockLocationDto, CreateWarehouseDto, UpdateStockLocationDto, UpdateWarehouseDto } from './dto/warehouse.dto';

type WarningLevel = 'critical' | 'high' | 'medium';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    @InjectRepository(StockRecordEntity)
    private readonly stockRecordRepository: Repository<StockRecordEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private resolveStockQuantity(product: ProductEntity, dto: { quantity?: number; packageQty?: number; looseQty?: number }) {
    const resolved = resolveCompositeQuantity(dto, getProductPackageConfig(product));
    if (resolved.quantity <= 0) {
      throw new BadRequestException('数量需大于 0');
    }

    return resolved;
  }

  private generateBatchNo(product: ProductEntity) {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const code = (product.sku || `P${product.id}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || `P${product.id}`;
    return `${datePart}-${code}-01`;
  }

  private generateBusinessNo(prefix: string) {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    return `${prefix}${datePart}${String(now.getMilliseconds()).padStart(3, '0')}`;
  }

  private async ensureDefaultWarehouse(manager: EntityManager) {
    const warehouseRepository = manager.getRepository(WarehouseEntity);
    const locationRepository = manager.getRepository(StockLocationEntity);

    let warehouse =
      await warehouseRepository.findOne({ where: { isDefault: 1 } }) ??
      await warehouseRepository.findOne({ where: { status: 1 }, order: { id: 'ASC' } });

    if (!warehouse) {
      warehouse = warehouseRepository.create({
        code: 'WH-MAIN',
        name: '主仓',
        type: 'main',
        isDefault: 1,
        status: 1,
        address: null,
        remark: null,
      });
      warehouse = await warehouseRepository.save(warehouse);
    }

    let location = await locationRepository.findOne({
      where: { warehouseId: warehouse.id, status: 1 },
      order: { id: 'ASC' },
    });

    if (!location) {
      location = locationRepository.create({
        warehouseId: warehouse.id,
        code: 'DEFAULT',
        name: '默认仓位',
        status: 1,
        remark: null,
      });
      location = await locationRepository.save(location);
    }

    return { warehouse, location };
  }

  private async resolveWarehouseLocation(
    manager: EntityManager,
    warehouseId?: number,
    locationId?: number | null,
  ) {
    const warehouseRepository = manager.getRepository(WarehouseEntity);
    const locationRepository = manager.getRepository(StockLocationEntity);
    const fallback = await this.ensureDefaultWarehouse(manager);

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

  private async findBatchByScope(
    manager: EntityManager,
    productId: number,
    batchNo: string,
    warehouseId: number,
    locationId?: number | null,
  ) {
    const qb = manager
      .getRepository(StockBatchEntity)
      .createQueryBuilder('batch')
      .where('batch.product_id = :productId', { productId })
      .andWhere('batch.batch_no = :batchNo', { batchNo })
      .andWhere('batch.warehouse_id = :warehouseId', { warehouseId });

    if (locationId) {
      qb.andWhere('batch.location_id = :locationId', { locationId });
    } else {
      qb.andWhere('batch.location_id IS NULL');
    }

    return qb.getOne();
  }

  private mapBatchRow(row: Record<string, unknown>) {
    return {
      id: Number(row.id),
      productId: Number(row.productId),
      productName: String(row.productName ?? ''),
      productSku: row.productSku == null ? null : String(row.productSku),
      productSpec: row.productSpec == null ? null : String(row.productSpec),
      teaType: row.teaType == null ? null : String(row.teaType),
      origin: row.origin == null ? null : String(row.origin),
      year: row.year == null ? null : Number(row.year),
      season: row.season == null ? null : String(row.season),
      productBatchNo: row.productBatchNo == null ? null : String(row.productBatchNo),
      batchNo: String(row.batchNo ?? ''),
      warehouseId: Number(row.warehouseId),
      warehouseName: String(row.warehouseName ?? ''),
      locationId: row.locationId == null ? null : Number(row.locationId),
      locationName: row.locationName == null ? null : String(row.locationName),
      quantity: roundQuantity(Number(row.quantity ?? 0)),
      lockedQty: roundQuantity(Number(row.lockedQty ?? 0)),
      availableQty: roundQuantity(Number(row.quantity ?? 0) - Number(row.lockedQty ?? 0)),
      costPrice: Number(row.costPrice ?? 0),
      productionDate: row.productionDate ?? null,
      expireAt: row.expireAt ?? null,
      unit: row.unit ?? null,
      packageUnit: row.packageUnit ?? null,
      packageSize: row.packageSize == null ? null : Number(row.packageSize),
      status: Number(row.status ?? 1),
      remark: row.remark ?? null,
      createdAt: row.createdAt,
    };
  }

  async stockIn(dto: StockInDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(ProductEntity);
      const stockRecordRepository = manager.getRepository(StockRecordEntity);

      const product = await productRepository.findOne({
        where: { id: dto.productId, deletedAt: IsNull() },
      });
      if (!product || product.status !== 1) {
        throw new NotFoundException('商品不存在、已删除或已停售');
      }

      const resolvedQuantity = this.resolveStockQuantity(product, dto);
      const quantity = resolvedQuantity.quantity;
      const batchRepository = manager.getRepository(StockBatchEntity);
      let batch: StockBatchEntity | null = null;
      let warehouseId = dto.warehouseId ?? null;
      let locationId = dto.locationId ?? null;

      if (dto.batchId) {
        batch = await batchRepository.findOne({ where: { id: dto.batchId } });
        if (!batch || batch.productId !== product.id || batch.status !== 1) {
          throw new BadRequestException('入库批次不存在或不属于该商品');
        }
        warehouseId = batch.warehouseId;
        locationId = batch.locationId;
      } else {
        const scope = await this.resolveWarehouseLocation(manager, dto.warehouseId, dto.locationId ?? null);
        warehouseId = scope.warehouse.id;
        locationId = scope.location?.id ?? null;
        const batchNo = dto.batchNo?.trim() || product.batchNo || this.generateBatchNo(product);
        batch = await this.findBatchByScope(manager, product.id, batchNo, warehouseId, locationId);
        if (!batch) {
          batch = batchRepository.create({
            productId: product.id,
            batchNo,
            warehouseId,
            locationId,
            quantity: 0,
            lockedQty: 0,
            costPrice: product.costPrice ?? 0,
            productionDate: product.producedAt ?? null,
            expireAt: computeProductBatchExpireAt(product),
            status: 1,
            remark: null,
          });
        }
      }

      batch.quantity = addQuantity(batch.quantity ?? 0, quantity);
      batch = await batchRepository.save(batch);

      const beforeQty = roundQuantity(product.stockQty);
      const afterQty = addQuantity(beforeQty, quantity);

      product.stockQty = afterQty;
      product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), quantity);
      await productRepository.save(product);

      const stockRecord = stockRecordRepository.create({
        productId: product.id,
        batchId: batch.id,
        batchNo: batch.batchNo,
        warehouseId,
        locationId,
        type: 'in',
        reason: dto.reason,
        quantity,
        packageQty: resolvedQuantity.packageQty,
        looseQty: resolvedQuantity.looseQty,
        packageUnit: resolvedQuantity.packageUnit,
        packageSize: resolvedQuantity.packageSize,
        beforeQty,
        afterQty,
        unit: product.unit ?? null,
        relatedOrderId: dto.relatedOrderId ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });

      await stockRecordRepository.save(stockRecord);

      return {
        productId: product.id,
        stockQty: product.stockQty,
        recordId: stockRecord.id,
      };
    });
  }

  async stockOut(dto: StockOutDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(ProductEntity);
      const stockRecordRepository = manager.getRepository(StockRecordEntity);

      const product = await productRepository.findOne({
        where: { id: dto.productId, deletedAt: IsNull() },
      });
      if (!product || product.status !== 1) {
        throw new NotFoundException('商品不存在、已删除或已停售');
      }

      const resolvedQuantity = this.resolveStockQuantity(product, dto);
      const quantity = resolvedQuantity.quantity;
      await syncProductAvailableStockQty(manager, product);
      const beforeQty = roundQuantity(product.stockQty);
      if (compareQuantity(product.availableStockQty, quantity) < 0) {
        throw new BadRequestException('可售库存不足，无法出库');
      }

      const afterQty = subtractQuantity(beforeQty, quantity);
      const batchRepository = manager.getRepository(StockBatchEntity);
      await ensureLegacyStockBatchConsistency(manager, product);
      const batchQb = batchRepository
        .createQueryBuilder('batch')
        .where('batch.product_id = :productId', { productId: product.id })
        .andWhere('batch.status = 1')
        .andWhere('batch.quantity > 0');

      if (requiresManualBatchSelection(product) && !dto.batchId) {
        throw new BadRequestException(`商品 ${product.name} 必须手选批次后才能出库`);
      }

      if (dto.batchId) {
        batchQb.andWhere('batch.id = :batchId', { batchId: dto.batchId });
      }
      if (dto.warehouseId) {
        batchQb.andWhere('batch.warehouse_id = :warehouseId', { warehouseId: dto.warehouseId });
      }
      if (dto.locationId) {
        batchQb.andWhere('batch.location_id = :locationId', { locationId: dto.locationId });
      }

      const batches = await applyBatchAutoPickOrder(batchQb, 'batch', product).getMany();

      let remainingQty = quantity;
      const deductions: Array<{ batch: StockBatchEntity; quantity: number }> = [];
      for (const batch of batches) {
        if (compareQuantity(remainingQty, 0) <= 0) break;
        const deductQty = Math.min(roundQuantity(batch.quantity), remainingQty);
        if (compareQuantity(deductQty, 0) <= 0) continue;
        batch.quantity = subtractQuantity(batch.quantity, deductQty);
        await batchRepository.save(batch);
        deductions.push({ batch, quantity: deductQty });
        remainingQty = subtractQuantity(remainingQty, deductQty);
      }

      if (compareQuantity(remainingQty, 0) > 0) {
        throw new BadRequestException(dto.batchId ? '所选批次库存不足，无法出库' : '批次库存不足，无法出库');
      }

      product.stockQty = afterQty;
      product.availableStockQty = subtractQuantity(roundQuantity(product.availableStockQty), quantity);
      await productRepository.save(product);

      let runningBeforeQty = beforeQty;
      const stockRecords: StockRecordEntity[] = [];
      for (const deduction of deductions) {
        const runningAfterQty = subtractQuantity(runningBeforeQty, deduction.quantity);
        stockRecords.push(stockRecordRepository.create({
          productId: product.id,
          batchId: deduction.batch.id,
          batchNo: deduction.batch.batchNo,
          warehouseId: deduction.batch.warehouseId,
          locationId: deduction.batch.locationId,
          type: 'out',
          reason: dto.reason,
          quantity: deduction.quantity,
          packageQty: deductions.length === 1 ? resolvedQuantity.packageQty : null,
          looseQty: deductions.length === 1 ? resolvedQuantity.looseQty : null,
          packageUnit: resolvedQuantity.packageUnit,
          packageSize: resolvedQuantity.packageSize,
          beforeQty: runningBeforeQty,
          afterQty: runningAfterQty,
          unit: product.unit ?? null,
          relatedOrderId: dto.relatedOrderId ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? null,
        }));
        runningBeforeQty = runningAfterQty;
      }

      await stockRecordRepository.save(stockRecords);

      return {
        productId: product.id,
        stockQty: product.stockQty,
        recordId: stockRecords[0]?.id,
        recordIds: stockRecords.map((record) => record.id),
      };
    });
  }

  async getStockRecords(query: StockRecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.stockRecordRepository
      .createQueryBuilder('record')
      .leftJoin(ProductEntity, 'product', 'product.id = record.product_id')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = record.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = record.location_id')
      .select([
        'record.id AS id',
        'record.product_id AS productId',
        'record.batch_id AS batchId',
        'record.batch_no AS batchNo',
        'record.warehouse_id AS warehouseId',
        'record.location_id AS locationId',
        'record.type AS type',
        'record.reason AS reason',
        'record.quantity AS quantity',
        'record.package_qty AS packageQty',
        'record.loose_qty AS looseQty',
        'record.package_unit AS packageUnit',
        'record.package_size AS packageSize',
        'record.before_qty AS beforeQty',
        'record.after_qty AS afterQty',
        'record.related_order_id AS relatedOrderId',
        'record.operator_id AS operatorId',
        'record.unit AS unit',
        'record.remark AS remark',
        'record.created_at AS createdAt',
        'product.name AS productName',
        'product.sku AS productSku',
        'product.unit AS productUnit',
        'product.ext_data AS productExtData',
        'warehouse.name AS warehouseName',
        'location.name AS locationName',
      ]);

    if (query.productId) {
      qb.andWhere('record.product_id = :productId', { productId: query.productId });
    }

    if (query.type) {
      qb.andWhere('record.type = :type', { type: query.type });
    }

    if (query.reason) {
      qb.andWhere('record.reason = :reason', { reason: query.reason });
    }

    if (query.keyword) {
      qb.andWhere(
        '(product.name LIKE :kw OR record.batch_no LIKE :kw OR warehouse.name LIKE :kw OR location.name LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    if (query.dateFrom) {
      qb.andWhere('DATE(record.created_at) >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('DATE(record.created_at) <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('record.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rawList, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);

    const list = rawList.map((r) => {
      let extData: Record<string, unknown> = {};
      try {
        extData = r.productExtData ? JSON.parse(r.productExtData) : {};
      } catch {
        extData = {};
      }
      const packageUnit = r.packageUnit ?? String(extData.packageUnit ?? '');
      const packageSize = Number(r.packageSize ?? extData.packageSize ?? 0);
      // unit 兜底：记录保存时的 unit → 商品当前 unit
      const unit = r.unit ?? r.productUnit ?? null;
      return {
        id: r.id,
        productId: r.productId,
        batchId: r.batchId ?? null,
        batchNo: r.batchNo ?? null,
        warehouseId: r.warehouseId ?? null,
        warehouseName: r.warehouseName ?? null,
        locationId: r.locationId ?? null,
        locationName: r.locationName ?? null,
        type: r.type,
        reason: r.reason,
        quantity: r.quantity,
        packageQty: r.packageQty ?? null,
        looseQty: r.looseQty ?? null,
        beforeQty: r.beforeQty,
        afterQty: r.afterQty,
        relatedOrderId: r.relatedOrderId,
        operatorId: r.operatorId,
        unit,
        packageUnit: packageUnit || null,
        packageSize: packageSize || null,
        remark: r.remark,
        createdAt: r.createdAt,
        productName: r.productName,
        productSku: r.productSku,
      };
    });

    return {
      list,
      total,
      page,
      pageSize,
    };
  }

  async getBatches(query: StockBatchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortProduct = query.productId
      ? await this.productRepository.findOne({ where: { id: query.productId, deletedAt: IsNull() } })
      : null;
    if (sortProduct) {
      await this.dataSource.transaction((manager) => ensureLegacyStockBatchConsistency(manager, sortProduct));
    }
    const qb = this.dataSource
      .getRepository(StockBatchEntity)
      .createQueryBuilder('batch')
      .leftJoin(ProductEntity, 'product', 'product.id = batch.product_id')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = batch.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = batch.location_id')
      .select([
        'batch.id AS id',
        'batch.product_id AS productId',
        'batch.batch_no AS batchNo',
        'batch.warehouse_id AS warehouseId',
        'batch.location_id AS locationId',
        'batch.quantity AS quantity',
        'batch.locked_qty AS lockedQty',
        'batch.cost_price AS costPrice',
        'batch.production_date AS productionDate',
        'batch.expire_at AS expireAt',
        'batch.status AS status',
        'batch.remark AS remark',
        'batch.created_at AS createdAt',
        'product.name AS productName',
        'product.sku AS productSku',
        'product.spec AS productSpec',
        'product.tea_type AS teaType',
        'product.origin AS origin',
        'product.year AS year',
        'product.season AS season',
        'product.batch_no AS productBatchNo',
        'product.unit AS unit',
        'product.ext_data AS productExtData',
        'warehouse.name AS warehouseName',
        'location.name AS locationName',
      ]);

    if (query.productId) {
      qb.andWhere('batch.product_id = :productId', { productId: query.productId });
    }
    if (query.warehouseId) {
      qb.andWhere('batch.warehouse_id = :warehouseId', { warehouseId: query.warehouseId });
    }
    if (query.locationId) {
      qb.andWhere('batch.location_id = :locationId', { locationId: query.locationId });
    }
    if (query.status) {
      qb.andWhere('batch.status = :status', { status: query.status });
    }
    if (query.availableOnly === '1' || query.availableOnly === 'true') {
      qb.andWhere('batch.quantity > 0');
    }
    if (query.keyword) {
      qb.andWhere(
        '(product.name LIKE :kw OR batch.batch_no LIKE :kw OR warehouse.name LIKE :kw OR location.name LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    applyBatchAutoPickOrder(
      qb,
      'batch',
      sortProduct ?? {
        extData: JSON.stringify({ batchAutoPickStrategy: DEFAULT_BATCH_AUTO_PICK_STRATEGY }),
        producedAt: null,
        productionDate: null,
        shelfLife: 0,
      },
    );

    qb.offset((page - 1) * pageSize)
      .limit(pageSize);

    const [rows, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return {
      list: rows.map((row) => {
        let extData: Record<string, unknown> = {};
        try {
          extData = row.productExtData ? JSON.parse(String(row.productExtData)) : {};
        } catch {
          extData = {};
        }
        return this.mapBatchRow({
          ...row,
          productSpec: row.productSpec ?? extData.spec,
          teaType: row.teaType ?? extData.teaType,
          origin: row.origin ?? extData.origin,
          year: row.year ?? extData.year,
          season: row.season ?? extData.season,
          productBatchNo: row.productBatchNo ?? extData.batchNo,
          packageUnit: extData.packageUnit,
          packageSize: extData.packageSize,
        });
      }),
      total,
      page,
      pageSize,
    };
  }

  async getWarehouses(query?: { includeDisabled?: string }) {
    const includeDisabled = query?.includeDisabled === '1' || query?.includeDisabled === 'true';
    const warehouseRepository = this.dataSource.getRepository(WarehouseEntity);
    const locationRepository = this.dataSource.getRepository(StockLocationEntity);
    const warehouseQb = warehouseRepository.createQueryBuilder('warehouse').orderBy('warehouse.is_default', 'DESC').addOrderBy('warehouse.id', 'ASC');
    const locationQb = locationRepository.createQueryBuilder('location').orderBy('location.id', 'ASC');

    if (!includeDisabled) {
      warehouseQb.where('warehouse.status = 1');
      locationQb.where('location.status = 1');
    }

    const [warehouses, locations] = await Promise.all([warehouseQb.getMany(), locationQb.getMany()]);
    const locationMap = new Map<number, StockLocationEntity[]>();
    for (const location of locations) {
      locationMap.set(location.warehouseId, [...(locationMap.get(location.warehouseId) ?? []), location]);
    }

    return warehouses.map((warehouse) => ({
      ...warehouse,
      locations: locationMap.get(warehouse.id) ?? [],
    }));
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WarehouseEntity);
      if (dto.isDefault) {
        await repository.update({}, { isDefault: 0 });
      }
      const warehouse = repository.create({
        code: dto.code?.trim() || `WH-${Date.now()}`,
        name: dto.name.trim(),
        type: dto.type?.trim() || 'main',
        address: dto.address?.trim() || null,
        isDefault: dto.isDefault ? 1 : 0,
        status: 1,
        remark: dto.remark?.trim() || null,
      });
      return repository.save(warehouse);
    });
  }

  async updateWarehouse(id: number, dto: UpdateWarehouseDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WarehouseEntity);
      const warehouse = await repository.findOne({ where: { id } });
      if (!warehouse) throw new NotFoundException('仓库不存在');
      if (dto.isDefault) {
        await repository.update({}, { isDefault: 0 });
      }
      Object.assign(warehouse, {
        code: dto.code?.trim() || warehouse.code,
        name: dto.name?.trim() || warehouse.name,
        type: dto.type?.trim() || warehouse.type,
        address: dto.address?.trim() || null,
        isDefault: dto.isDefault == null ? warehouse.isDefault : dto.isDefault ? 1 : 0,
        remark: dto.remark?.trim() || null,
      });
      return repository.save(warehouse);
    });
  }

  async updateWarehouseStatus(id: number, status: number) {
    const repository = this.dataSource.getRepository(WarehouseEntity);
    const warehouse = await repository.findOne({ where: { id } });
    if (!warehouse) throw new NotFoundException('仓库不存在');
    warehouse.status = status;
    return repository.save(warehouse);
  }

  async createLocation(dto: CreateStockLocationDto) {
    const warehouse = await this.dataSource.getRepository(WarehouseEntity).findOne({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('仓库不存在');
    const repository = this.dataSource.getRepository(StockLocationEntity);
    return repository.save(repository.create({
      warehouseId: dto.warehouseId,
      code: dto.code?.trim() || `LOC-${Date.now()}`,
      name: dto.name.trim(),
      status: 1,
      remark: dto.remark?.trim() || null,
    }));
  }

  async updateLocation(id: number, dto: UpdateStockLocationDto) {
    const repository = this.dataSource.getRepository(StockLocationEntity);
    const location = await repository.findOne({ where: { id } });
    if (!location) throw new NotFoundException('仓位不存在');
    if (dto.warehouseId) {
      const warehouse = await this.dataSource.getRepository(WarehouseEntity).findOne({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException('仓库不存在');
      location.warehouseId = dto.warehouseId;
    }
    location.code = dto.code?.trim() || location.code;
    location.name = dto.name?.trim() || location.name;
    location.remark = dto.remark?.trim() || null;
    return repository.save(location);
  }

  async updateLocationStatus(id: number, status: number) {
    const repository = this.dataSource.getRepository(StockLocationEntity);
    const location = await repository.findOne({ where: { id } });
    if (!location) throw new NotFoundException('仓位不存在');
    location.status = status;
    return repository.save(location);
  }

  async updateBatchStatus(id: number, status: number) {
    if (!STOCK_BATCH_STATUS_VALUES.includes(status as (typeof STOCK_BATCH_STATUS_VALUES)[number])) {
      throw new BadRequestException('批次库存状态不合法');
    }

    const repository = this.dataSource.getRepository(StockBatchEntity);
    const batch = await repository.findOne({ where: { id } });
    if (!batch) throw new NotFoundException('批次不存在');
    batch.status = status;
    return repository.save(batch);
  }

  async processAfterSaleBatch(id: number, dto: ProcessAfterSaleStockDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const batchRepository = manager.getRepository(StockBatchEntity);
      const batch = await batchRepository.findOne({ where: { id } });
      if (!batch) throw new NotFoundException('售后库存不存在');
      if (batch.status !== STOCK_BATCH_STATUS.PENDING_INSPECTION) {
        throw new BadRequestException('只有售后处理中库存可以执行售后处理');
      }
      if (compareQuantity(batch.quantity, 0) <= 0) {
        throw new BadRequestException('该售后库存数量为 0，无法处理');
      }

      const product = await manager.findOne(ProductEntity, { where: { id: batch.productId, deletedAt: IsNull() } });
      if (!product) throw new NotFoundException('商品不存在或已删除');

      const remark = dto.remark?.trim() || null;
      if (dto.result === 'unsellable') {
        batch.status = STOCK_BATCH_STATUS.UNSELLABLE;
        batch.remark = remark ?? batch.remark;
        return batchRepository.save(batch);
      }

      const batchMode = dto.batchMode ?? 'same_batch';
      const targetBatchNo = batchMode === 'new_batch'
        ? dto.batchNo?.trim()
        : batch.batchNo;
      if (!targetBatchNo) {
        throw new BadRequestException('新建批次时必须填写批次号');
      }

      const targetScope = await resolveWarehouseLocation(
        manager,
        dto.warehouseId ?? batch.warehouseId,
        dto.locationId ?? batch.locationId ?? null,
      );
      const targetLocationId = targetScope.location?.id ?? null;
      const sameScope =
        targetBatchNo === batch.batchNo &&
        targetScope.warehouse.id === batch.warehouseId &&
        targetLocationId === (batch.locationId ?? null);
      const existingSellableBatch = await findBatchByScope(
        manager,
        product.id,
        targetBatchNo,
        targetScope.warehouse.id,
        targetLocationId,
        STOCK_BATCH_STATUS.SELLABLE,
      );

      const sellableQuantity = roundQuantity(batch.quantity);

      if (sameScope && (!existingSellableBatch || existingSellableBatch.id === batch.id)) {
        batch.status = STOCK_BATCH_STATUS.SELLABLE;
        batch.remark = remark ?? batch.remark;
        product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), sellableQuantity);
        await manager.getRepository(ProductEntity).save(product);
        return batchRepository.save(batch);
      }

      const targetBatch = existingSellableBatch ?? await resolveInboundStockBatch(manager, product, {
        batchNo: targetBatchNo,
        warehouseId: targetScope.warehouse.id,
        locationId: targetLocationId,
        status: STOCK_BATCH_STATUS.SELLABLE,
        costPrice: batch.costPrice ?? product.costPrice ?? 0,
        remark,
      });
      targetBatch.quantity = addQuantity(targetBatch.quantity ?? 0, sellableQuantity);
      await batchRepository.save(targetBatch);

      batch.quantity = 0;
      batch.status = STOCK_BATCH_STATUS.SELLABLE;
      batch.remark = remark ?? batch.remark;
      await batchRepository.save(batch);

      product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), sellableQuantity);
      await manager.getRepository(ProductEntity).save(product);
      return targetBatch;
    });
  }

  async getInventoryCounts() {
    const rows = await this.dataSource
      .getRepository(InventoryCountEntity)
      .createQueryBuilder('count')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = count.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = count.location_id')
      .select([
        'count.id AS id',
        'count.count_no AS countNo',
        'count.warehouse_id AS warehouseId',
        'count.location_id AS locationId',
        'count.status AS status',
        'count.total_diff_qty AS totalDiffQty',
        'count.remark AS remark',
        'count.created_at AS createdAt',
        'warehouse.name AS warehouseName',
        'location.name AS locationName',
      ])
      .orderBy('count.id', 'DESC')
      .limit(100)
      .getRawMany();

    return rows.map((row) => ({
      id: Number(row.id),
      countNo: row.countNo,
      warehouseId: row.warehouseId == null ? null : Number(row.warehouseId),
      warehouseName: row.warehouseName ?? null,
      locationId: row.locationId == null ? null : Number(row.locationId),
      locationName: row.locationName ?? null,
      status: row.status,
      totalDiffQty: roundQuantity(row.totalDiffQty ?? 0),
      remark: row.remark,
      createdAt: row.createdAt,
    }));
  }

  async createInventoryCount(dto: CreateInventoryCountDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const countRepository = manager.getRepository(InventoryCountEntity);
      const countItemRepository = manager.getRepository(InventoryCountItemEntity);
      const batchRepository = manager.getRepository(StockBatchEntity);
      const productRepository = manager.getRepository(ProductEntity);
      const stockRecordRepository = manager.getRepository(StockRecordEntity);

      let count = countRepository.create({
        countNo: this.generateBusinessNo('PD'),
        warehouseId: dto.warehouseId ?? null,
        locationId: dto.locationId ?? null,
        status: 'done',
        totalDiffQty: 0,
        operatorId: user.sub,
        remark: dto.remark ?? null,
        completedAt: new Date().toISOString(),
      });
      count = await countRepository.save(count);

      let totalDiffQty = 0;
      for (const item of dto.items) {
        const product = await productRepository.findOne({ where: { id: item.productId, deletedAt: IsNull() } });
        if (!product) throw new NotFoundException('盘点商品不存在');
        let batch = item.batchId ? await batchRepository.findOne({ where: { id: item.batchId } }) : null;
        if (!batch) {
          const scope = await this.resolveWarehouseLocation(manager, dto.warehouseId, dto.locationId ?? null);
          batch = batchRepository.create({
            productId: product.id,
            batchNo: item.batchNo?.trim() || this.generateBatchNo(product),
            warehouseId: scope.warehouse.id,
            locationId: scope.location?.id ?? null,
            quantity: 0,
            lockedQty: 0,
            costPrice: product.costPrice ?? 0,
            productionDate: product.producedAt ?? null,
            expireAt: computeProductBatchExpireAt(product),
            status: 1,
            remark: null,
          });
        }

        const bookQty = roundQuantity(batch.quantity ?? 0);
        const countedQty = roundQuantity(item.countedQty ?? 0);
        const diffQty = roundQuantity(countedQty - bookQty);
        batch.quantity = countedQty;
        batch = await batchRepository.save(batch);

        const productBeforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(productBeforeQty, diffQty);
        if (batch.status === STOCK_BATCH_STATUS.SELLABLE) {
          product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), diffQty);
        }
        await productRepository.save(product);

        await countItemRepository.save(countItemRepository.create({
          countId: count.id,
          productId: product.id,
          batchId: batch.id,
          warehouseId: batch.warehouseId,
          locationId: batch.locationId,
          bookQty,
          countedQty,
          diffQty,
          unit: product.unit ?? null,
          remark: item.remark ?? null,
        }));

        if (diffQty !== 0) {
          await stockRecordRepository.save(stockRecordRepository.create({
            productId: product.id,
            batchId: batch.id,
            batchNo: batch.batchNo,
            warehouseId: batch.warehouseId,
            locationId: batch.locationId,
            type: diffQty > 0 ? 'in' : 'out',
            reason: diffQty > 0 ? 'surplus' : 'shortage',
            quantity: Math.abs(diffQty),
            beforeQty: productBeforeQty,
            afterQty: product.stockQty,
            unit: product.unit ?? null,
            operatorId: user.sub,
            remark: item.remark ?? dto.remark ?? null,
          }));
        }

        totalDiffQty = addQuantity(totalDiffQty, diffQty);
      }

      count.totalDiffQty = totalDiffQty;
      return countRepository.save(count);
    });
  }

  async getTransfers() {
    const rows = await this.dataSource
      .getRepository(StockTransferEntity)
      .createQueryBuilder('transfer')
      .leftJoin(WarehouseEntity, 'fromWarehouse', 'fromWarehouse.id = transfer.from_warehouse_id')
      .leftJoin(StockLocationEntity, 'fromLocation', 'fromLocation.id = transfer.from_location_id')
      .leftJoin(WarehouseEntity, 'toWarehouse', 'toWarehouse.id = transfer.to_warehouse_id')
      .leftJoin(StockLocationEntity, 'toLocation', 'toLocation.id = transfer.to_location_id')
      .select([
        'transfer.id AS id',
        'transfer.transfer_no AS transferNo',
        'transfer.from_warehouse_id AS fromWarehouseId',
        'transfer.from_location_id AS fromLocationId',
        'transfer.to_warehouse_id AS toWarehouseId',
        'transfer.to_location_id AS toLocationId',
        'transfer.status AS status',
        'transfer.total_qty AS totalQty',
        'transfer.remark AS remark',
        'transfer.created_at AS createdAt',
        'fromWarehouse.name AS fromWarehouseName',
        'fromLocation.name AS fromLocationName',
        'toWarehouse.name AS toWarehouseName',
        'toLocation.name AS toLocationName',
      ])
      .orderBy('transfer.id', 'DESC')
      .limit(100)
      .getRawMany();

    return rows.map((row) => ({
      id: Number(row.id),
      transferNo: row.transferNo,
      fromWarehouseId: Number(row.fromWarehouseId),
      fromWarehouseName: row.fromWarehouseName ?? null,
      fromLocationId: row.fromLocationId == null ? null : Number(row.fromLocationId),
      fromLocationName: row.fromLocationName ?? null,
      toWarehouseId: Number(row.toWarehouseId),
      toWarehouseName: row.toWarehouseName ?? null,
      toLocationId: row.toLocationId == null ? null : Number(row.toLocationId),
      toLocationName: row.toLocationName ?? null,
      status: row.status,
      totalQty: roundQuantity(row.totalQty ?? 0),
      remark: row.remark,
      createdAt: row.createdAt,
    }));
  }

  async createTransfer(dto: CreateStockTransferDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const transferRepository = manager.getRepository(StockTransferEntity);
      const transferItemRepository = manager.getRepository(StockTransferItemEntity);
      const batchRepository = manager.getRepository(StockBatchEntity);
      const stockRecordRepository = manager.getRepository(StockRecordEntity);
      const productRepository = manager.getRepository(ProductEntity);
      const toScope = await this.resolveWarehouseLocation(manager, dto.toWarehouseId, dto.toLocationId ?? null);

      let transfer = transferRepository.create({
        transferNo: this.generateBusinessNo('DB'),
        fromWarehouseId: dto.fromWarehouseId,
        fromLocationId: dto.fromLocationId ?? null,
        toWarehouseId: toScope.warehouse.id,
        toLocationId: toScope.location?.id ?? null,
        status: 'done',
        totalQty: 0,
        operatorId: user.sub,
        remark: dto.remark ?? null,
        completedAt: new Date().toISOString(),
      });
      transfer = await transferRepository.save(transfer);

      let totalQty = 0;
      for (const item of dto.items) {
        const fromBatch = await batchRepository.findOne({ where: { id: item.batchId } });
        if (!fromBatch) throw new NotFoundException('调拨批次不存在');
        if (fromBatch.warehouseId !== dto.fromWarehouseId || (dto.fromLocationId ?? null) !== fromBatch.locationId) {
          throw new BadRequestException('调拨批次与调出仓库/仓位不一致');
        }
        if (compareQuantity(fromBatch.quantity, item.quantity) < 0) {
          throw new BadRequestException('调拨批次库存不足');
        }
        const product = await productRepository.findOne({ where: { id: fromBatch.productId } });
        if (!product) throw new NotFoundException('调拨商品不存在');

        fromBatch.quantity = subtractQuantity(fromBatch.quantity, item.quantity);
        await batchRepository.save(fromBatch);

        let toBatch = await this.findBatchByScope(manager, fromBatch.productId, fromBatch.batchNo, toScope.warehouse.id, toScope.location?.id ?? null);
        if (!toBatch) {
          toBatch = batchRepository.create({
            productId: fromBatch.productId,
            batchNo: fromBatch.batchNo,
            warehouseId: toScope.warehouse.id,
            locationId: toScope.location?.id ?? null,
            quantity: 0,
            lockedQty: 0,
            costPrice: fromBatch.costPrice,
            productionDate: fromBatch.productionDate,
            expireAt: fromBatch.expireAt,
            status: 1,
            remark: fromBatch.remark,
          });
        }
        toBatch.quantity = addQuantity(toBatch.quantity, item.quantity);
        await batchRepository.save(toBatch);

        await transferItemRepository.save(transferItemRepository.create({
          transferId: transfer.id,
          productId: fromBatch.productId,
          batchId: fromBatch.id,
          quantity: item.quantity,
          unit: product.unit ?? null,
          remark: item.remark ?? null,
        }));

        const stockBase = {
          productId: product.id,
          batchNo: fromBatch.batchNo,
          quantity: item.quantity,
          beforeQty: product.stockQty,
          afterQty: product.stockQty,
          unit: product.unit ?? null,
          relatedOrderId: transfer.id,
          operatorId: user.sub,
          remark: item.remark ?? dto.remark ?? null,
        };
        await stockRecordRepository.save([
          stockRecordRepository.create({
            ...stockBase,
            batchId: fromBatch.id,
            warehouseId: fromBatch.warehouseId,
            locationId: fromBatch.locationId,
            type: 'out',
            reason: 'transfer_out',
          }),
          stockRecordRepository.create({
            ...stockBase,
            batchId: toBatch.id,
            warehouseId: toBatch.warehouseId,
            locationId: toBatch.locationId,
            type: 'in',
            reason: 'transfer_in',
          }),
        ]);
        totalQty = addQuantity(totalQty, item.quantity);
      }

      transfer.totalQty = totalQty;
      return transferRepository.save(transfer);
    });
  }

  async getStats() {
    const rows = await this.stockRecordRepository
      .createQueryBuilder('record')
      .select('record.type', 'type')
      .addSelect('COALESCE(SUM(record.quantity), 0)', 'totalQuantity')
      .where('DATE(record.created_at) = DATE(:today)', { today: new Date().toISOString().slice(0, 10) })
      .groupBy('record.type')
      .getRawMany<{ type: string; totalQuantity: string }>();

    return rows.reduce(
      (acc, row) => {
        const quantity = roundQuantity(row.totalQuantity ?? 0);
        if (row.type === 'in') acc.todayIn = quantity;
        if (row.type === 'out') acc.todayOut = quantity;
        return acc;
      },
      { todayIn: 0, todayOut: 0 },
    );
  }

  async getWarnings() {
    const products = await this.productRepository.find({
      where: { status: 1, deletedAt: IsNull() },
      order: { stockQty: 'ASC', id: 'DESC' },
    });

    const now = new Date();
    const warnings = products.flatMap((product) => {
      const productWarnings = [] as Array<Record<string, unknown>>;

      if (product.availableStockQty <= product.safeStock) {
        productWarnings.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          teaType: product.teaType,
          warningType: 'safe_stock',
          level: product.availableStockQty === 0 ? 'critical' : 'high',
          stockQty: product.stockQty,
          availableStockQty: product.availableStockQty,
          safeStock: product.safeStock,
          message:
            product.availableStockQty === 0
              ? '可售库存已为 0，请尽快补货'
              : `可售库存低于安全库存线，当前 ${product.availableStockQty}，安全库存 ${product.safeStock}`,
        });
      }

      const expiryWarning = this.buildExpiryWarning(product, now);
      if (expiryWarning) {
        productWarnings.push(expiryWarning);
      }

      return productWarnings;
    });

    return warnings;
  }

  private buildExpiryWarning(product: ProductEntity, now: Date) {
    if (!product.producedAt || !product.shelfLife || product.shelfLife <= 0) {
      return null;
    }

    const producedAt = new Date(product.producedAt);
    if (Number.isNaN(producedAt.getTime())) {
      return null;
    }

    const expireAt = new Date(producedAt);
    expireAt.setMonth(expireAt.getMonth() + product.shelfLife);

    const remainingDays = Math.ceil(
      (expireAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (remainingDays > 90) {
      return null;
    }

    let level: WarningLevel;
    if (remainingDays <= 30) {
      level = 'critical';
    } else if (remainingDays <= 60) {
      level = 'high';
    } else {
      level = 'medium';
    }

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      teaType: product.teaType,
      warningType: 'expiry',
      level,
      stockQty: product.stockQty,
      expireAt: expireAt.toISOString(),
      remainingDays,
      batchNo: product.batchNo,
      message:
        remainingDays < 0
          ? `商品已过期 ${Math.abs(remainingDays)} 天`
          : `距离保质期还有 ${remainingDays} 天`,
    };
  }
}
