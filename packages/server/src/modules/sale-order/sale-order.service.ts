import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { applyBatchAutoPickOrder, computeProductBatchExpireAt, requiresManualBatchSelection } from '../../common/utils/batch-auto-pick.util';
import { STOCK_BATCH_STATUS } from '../../common/constants/stock-batch-status';
import { PAYMENT_RECORD_TYPE, SALE_EXCHANGE_STATUS, SALE_ORDER_STATUS } from '../../common/constants/order-status';
import { ROLE_ADMIN, ROLE_STAFF } from '../../common/constants/roles';
import { getProductPackageConfig, resolveCompositeQuantity } from '../../common/utils/packaging.util';
import { addAmount, addQuantity, compareAmount, compareQuantity, multiplyAmount, roundAmount, roundQuantity, subtractAmount, subtractQuantity } from '../../common/utils/precision.util';
import { ensureLegacyStockBatchConsistency, resolveInboundStockBatch, resolveWarehouseLocation, syncProductAvailableStockQty } from '../../common/utils/stock-batch.util';
import { AuthUser } from '../../common/types/auth-user.type';
import { CustomerEntity } from '../../entities/customer.entity';
import { PaymentRecordEntity } from '../../entities/payment-record.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SaleExchangeEntity } from '../../entities/sale-exchange.entity';
import { SaleExchangeItemEntity } from '../../entities/sale-exchange-item.entity';
import { SaleOrderEntity } from '../../entities/sale-order.entity';
import { SaleOrderItemEntity } from '../../entities/sale-order-item.entity';
import { SaleRefundEntity } from '../../entities/sale-refund.entity';
import { SaleReturnItemEntity } from '../../entities/sale-return-item.entity';
import { SaleReturnEntity } from '../../entities/sale-return.entity';
import { StockBatchEntity } from '../../entities/stock-batch.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockLocationEntity } from '../../entities/stock-location.entity';
import { OperationLogService } from '../system/operation-log.service';
import { CreateSaleExchangeDto } from './dto/create-sale-exchange.dto';
import { UpdateSaleExchangeDraftDto } from './dto/update-sale-exchange.dto';
import { CreateSaleOrderDto } from './dto/create-sale-order.dto';
import { QuickCompleteSaleOrderDto } from './dto/quick-complete-sale-order.dto';
import { CreateSaleRefundDto } from './dto/create-sale-refund.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleOrderQueryDto } from './dto/sale-order-query.dto';

type SaleExchangeReturnRequest = {
  saleOrderItemId?: number;
  sourceExchangeItemId?: number;
  quantity?: number;
  packageQty?: number;
  looseQty?: number;
  warehouseId?: number;
  locationId?: number;
  stockStatus?: number;
};

type SaleExchangeReturnSource = {
  id: number;
  sourceType: 'sale_order_item' | 'exchange_out_item';
  sourceKey: string;
  saleOrderItemId: number | null;
  sourceExchangeItemId: number | null;
  exchangeId?: number | null;
  exchangeNo?: string | null;
  productId: number;
  productName?: string | null;
  batchId?: number | null;
  batchNo?: string | null;
  warehouseId?: number | null;
  warehouseName?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  quantity: number;
  packageQty?: number | null;
  looseQty?: number | null;
  packageUnit?: string | null;
  packageSize?: number | null;
  unit?: string | null;
  unitPrice: number;
  returnedQuantity: number;
  remainingQuantity: number;
};

@Injectable()
export class SaleOrderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
  ) {}

  private recalculateStatus(
    order: Pick<SaleOrderEntity, 'receivedAmount' | 'returnedAmount' | 'totalAmount' | 'status'>,
  ) {
    const effectiveTotal = Math.max(subtractAmount(order.totalAmount, order.returnedAmount), 0);
    const isShipped =
      order.status === SALE_ORDER_STATUS.SHIPPED ||
      order.status === SALE_ORDER_STATUS.DONE ||
      order.status === SALE_ORDER_STATUS.RETURNED;

    if (compareAmount(order.returnedAmount, order.totalAmount) >= 0 && compareAmount(order.totalAmount, 0) > 0) {
      return SALE_ORDER_STATUS.RETURNED;
    }

    if (isShipped && compareAmount(order.receivedAmount, effectiveTotal) >= 0) {
      return SALE_ORDER_STATUS.DONE;
    }

    if (isShipped) {
      return SALE_ORDER_STATUS.SHIPPED;
    }

    return SALE_ORDER_STATUS.DRAFT;
  }

  private recalculateExchangeStatus(exchange: Pick<SaleExchangeEntity, 'status' | 'refundAmount' | 'receiveAmount' | 'returnStockDone' | 'exchangeStockDone' | 'paymentDone'>) {
    if (exchange.status === SALE_EXCHANGE_STATUS.CANCELLED) {
      return SALE_EXCHANGE_STATUS.CANCELLED;
    }

    const stockDone = exchange.returnStockDone === 1 && exchange.exchangeStockDone === 1;
    const needPayment = compareAmount(exchange.refundAmount, 0) > 0 || compareAmount(exchange.receiveAmount, 0) > 0;
    const paymentDone = needPayment ? exchange.paymentDone === 1 : true;

    if (stockDone && paymentDone) {
      return SALE_EXCHANGE_STATUS.COMPLETED;
    }

    if (stockDone || exchange.paymentDone === 1) {
      return SALE_EXCHANGE_STATUS.PROCESSING;
    }

    return SALE_EXCHANGE_STATUS.DRAFT;
  }

  private getDisplayStatus(
    order: Pick<SaleOrderEntity, 'status'>,
    exchanges?: Array<Pick<SaleExchangeEntity, 'status'>>,
  ) {
    if (exchanges?.some((item) => item.status === SALE_EXCHANGE_STATUS.PROCESSING)) {
      return SALE_EXCHANGE_STATUS.PROCESSING;
    }

    return order.status;
  }

  private generateOrderNo(prefix: string, id: number) {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');

    return `${prefix}${datePart}${String(id).padStart(4, '0')}`;
  }

  private normalizeLineItemQuantity(product: ProductEntity, item: { quantity?: number; packageQty?: number; looseQty?: number }) {
    const resolved = resolveCompositeQuantity(item, getProductPackageConfig(product));
    if (resolved.quantity <= 0) {
      throw new BadRequestException(`商品 ${product.name} 的数量必须大于 0`);
    }
    return resolved;
  }

  private async deductProductBatches(
    manager: EntityManager,
    product: ProductEntity,
    item: { quantity: number; batchId?: number | null; warehouseId?: number | null; locationId?: number | null },
    messages?: {
      manualRequired?: string;
      selectedBatchInsufficient?: string;
      autoPickInsufficient?: string;
    },
  ) {
    if (requiresManualBatchSelection(product) && !item.batchId) {
      throw new BadRequestException(messages?.manualRequired ?? `商品 ${product.name} 必须手选批次后才能出库`);
    }

    const batchRepository = manager.getRepository(StockBatchEntity);
    await ensureLegacyStockBatchConsistency(manager, product);
    const batchQb = batchRepository
      .createQueryBuilder('batch')
      .where('batch.product_id = :productId', { productId: product.id })
      .andWhere('batch.status = 1')
      .andWhere('batch.quantity > 0');

    if (item.batchId) {
      batchQb.andWhere('batch.id = :batchId', { batchId: item.batchId });
    }
    if (item.warehouseId) {
      batchQb.andWhere('batch.warehouse_id = :warehouseId', { warehouseId: item.warehouseId });
    }
    if (item.locationId) {
      batchQb.andWhere('batch.location_id = :locationId', { locationId: item.locationId });
    }

    const batches = await applyBatchAutoPickOrder(batchQb, 'batch', product).getMany();

    let remaining = item.quantity;
    const deductions: Array<{ batch: StockBatchEntity; quantity: number }> = [];
    for (const batch of batches) {
      if (compareQuantity(remaining, 0) <= 0) {
        break;
      }

      const deductQty = Math.min(roundQuantity(batch.quantity), remaining);
      if (compareQuantity(deductQty, 0) <= 0) {
        continue;
      }

      batch.quantity = subtractQuantity(batch.quantity, deductQty);
      await batchRepository.save(batch);
      deductions.push({ batch, quantity: deductQty });
      remaining = subtractQuantity(remaining, deductQty);
    }

    if (compareQuantity(remaining, 0) > 0) {
      throw new BadRequestException(
        item.batchId
          ? (messages?.selectedBatchInsufficient ?? '所选批次库存不足，无法出库')
          : (messages?.autoPickInsufficient ?? `商品 ${product.name} 批次库存不足`),
      );
    }

    return deductions;
  }

  private async inferLegacyReturnSourceBatch(manager: EntityManager, product: ProductEntity) {
    await ensureLegacyStockBatchConsistency(manager, product);
    const qb = manager
      .getRepository(StockBatchEntity)
      .createQueryBuilder('batch')
      .where('batch.product_id = :productId', { productId: product.id })
      .andWhere('batch.status = :status', { status: STOCK_BATCH_STATUS.SELLABLE })
      .andWhere('batch.quantity > 0')
      .andWhere("batch.batch_no NOT LIKE 'RETURN-%'");

    return applyBatchAutoPickOrder(qb, 'batch', product).getOne();
  }

  private async getReturnedQuantityMap(orderId: number, manager: EntityManager, excludeExchangeId?: number) {
    const rows = await manager
      .createQueryBuilder(SaleReturnItemEntity, 'saleReturnItem')
      .innerJoin(SaleReturnEntity, 'saleReturn', 'saleReturn.id = saleReturnItem.return_id')
      .select('saleReturnItem.sale_order_item_id', 'saleOrderItemId')
      .addSelect('SUM(saleReturnItem.quantity)', 'returnedQuantity')
      .where('saleReturn.sale_order_id = :orderId', { orderId })
      .groupBy('saleReturnItem.sale_order_item_id')
      .getRawMany<{ saleOrderItemId: number; returnedQuantity: string }>();

    const exchangeQuery = manager
      .createQueryBuilder(SaleExchangeItemEntity, 'saleExchangeItem')
      .innerJoin(SaleExchangeEntity, 'saleExchange', 'saleExchange.id = saleExchangeItem.exchange_id')
      .select('saleExchangeItem.sale_order_item_id', 'saleOrderItemId')
      .addSelect('SUM(saleExchangeItem.quantity)', 'returnedQuantity')
      .where('saleExchange.sale_order_id = :orderId', { orderId })
      .andWhere("saleExchangeItem.direction = 'return'")
      .andWhere('saleExchangeItem.sale_order_item_id IS NOT NULL')
      .groupBy('saleExchangeItem.sale_order_item_id');

    if (excludeExchangeId) {
      exchangeQuery.andWhere('saleExchange.id != :excludeExchangeId', { excludeExchangeId });
    }

    const exchangeRows = await exchangeQuery.getRawMany<{ saleOrderItemId: number; returnedQuantity: string }>();

    const quantityMap = new Map<number, number>();
    for (const row of [...rows, ...exchangeRows]) {
      const itemId = Number(row.saleOrderItemId);
      quantityMap.set(itemId, addQuantity(quantityMap.get(itemId) ?? 0, row.returnedQuantity));
    }

    return quantityMap;
  }

  private async getReturnedExchangeItemQuantityMap(orderId: number, manager: EntityManager, excludeExchangeId?: number) {
    const qb = manager
      .createQueryBuilder(SaleExchangeItemEntity, 'saleExchangeItem')
      .innerJoin(SaleExchangeEntity, 'saleExchange', 'saleExchange.id = saleExchangeItem.exchange_id')
      .select('saleExchangeItem.source_exchange_item_id', 'sourceExchangeItemId')
      .addSelect('SUM(saleExchangeItem.quantity)', 'returnedQuantity')
      .where('saleExchange.sale_order_id = :orderId', { orderId })
      .andWhere("saleExchangeItem.direction = 'return'")
      .andWhere('saleExchangeItem.source_exchange_item_id IS NOT NULL')
      .groupBy('saleExchangeItem.source_exchange_item_id');

    if (excludeExchangeId) {
      qb.andWhere('saleExchange.id != :excludeExchangeId', { excludeExchangeId });
    }

    const rows = await qb.getRawMany<{ sourceExchangeItemId: string; returnedQuantity: string }>();
    const quantityMap = new Map<number, number>();
    for (const row of rows) {
      quantityMap.set(Number(row.sourceExchangeItemId), roundQuantity(row.returnedQuantity));
    }
    return quantityMap;
  }

  private async buildSaleExchangeableItems(orderId: number, manager: EntityManager, excludeExchangeId?: number) {
    const buildSingleBatchSourceMap = async (reason: string) => {
      const rows = await manager
        .createQueryBuilder(StockRecordEntity, 'record')
        .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = record.warehouse_id')
        .leftJoin(StockLocationEntity, 'location', 'location.id = record.location_id')
        .select([
          'record.product_id AS productId',
          'record.batch_id AS batchId',
          'record.batch_no AS batchNo',
          'record.warehouse_id AS warehouseId',
          'warehouse.name AS warehouseName',
          'record.location_id AS locationId',
          'location.name AS locationName',
        ])
        .where('record.related_order_id = :orderId', { orderId })
        .andWhere('record.reason = :reason', { reason })
        .andWhere('record.batch_id IS NOT NULL')
        .getRawMany<Record<string, unknown>>();

      const grouped = new Map<number, Record<string, unknown>[]>();
      for (const row of rows) {
        const productId = Number(row.productId);
        grouped.set(productId, [...(grouped.get(productId) ?? []), row]);
      }

      const result = new Map<number, Record<string, unknown>>();
      for (const [productId, productRows] of grouped) {
        const scopes = new Set(productRows.map((row) => [
          row.batchId ?? '',
          row.warehouseId ?? '',
          row.locationId ?? '',
        ].join('|')));
        if (scopes.size === 1) {
          result.set(productId, productRows[0]);
        }
      }
      return result;
    };

    const saleStockSourceMap = await buildSingleBatchSourceMap('sale');
    const exchangeOutStockSourceMap = await buildSingleBatchSourceMap('sale_exchange_out');

    const originalRows = await manager
      .createQueryBuilder(SaleOrderItemEntity, 'item')
      .leftJoin(ProductEntity, 'product', 'product.id = item.product_id')
      .leftJoin(StockBatchEntity, 'batch', 'batch.id = item.batch_id')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = item.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = item.location_id')
      .select([
        'item.id AS id',
        'item.order_id AS orderId',
        'item.product_id AS productId',
        'item.batch_id AS batchId',
        'batch.batch_no AS batchNo',
        'item.warehouse_id AS warehouseId',
        'warehouse.name AS warehouseName',
        'item.location_id AS locationId',
        'location.name AS locationName',
        'product.name AS productName',
        'item.quantity AS quantity',
        'item.package_qty AS packageQty',
        'item.loose_qty AS looseQty',
        'item.package_unit AS packageUnit',
        'item.package_size AS packageSize',
        'product.unit AS unit',
        'item.unit_price AS unitPrice',
        'item.cost_price AS costPrice',
        'item.subtotal AS subtotal',
      ])
      .where('item.order_id = :orderId', { orderId })
      .getRawMany<Record<string, unknown>>();

    const returnedQuantityMap = await this.getReturnedQuantityMap(orderId, manager, excludeExchangeId);
    const originalSources: SaleExchangeReturnSource[] = originalRows.map((item) => {
      const id = Number(item.id);
      const quantity = roundQuantity(item.quantity as number);
      const returnedQuantity = returnedQuantityMap.get(id) ?? 0;
      const stockSource = saleStockSourceMap.get(Number(item.productId));
      return {
        id,
        sourceType: 'sale_order_item',
        sourceKey: `sale-order-item-${id}`,
        saleOrderItemId: id,
        sourceExchangeItemId: null,
        productId: Number(item.productId),
        productName: String(item.productName ?? ''),
        batchId: item.batchId == null ? (stockSource?.batchId == null ? null : Number(stockSource.batchId)) : Number(item.batchId),
        batchNo: item.batchNo == null ? (stockSource?.batchNo == null ? null : String(stockSource.batchNo)) : String(item.batchNo),
        warehouseId: item.warehouseId == null ? (stockSource?.warehouseId == null ? null : Number(stockSource.warehouseId)) : Number(item.warehouseId),
        warehouseName: item.warehouseName == null ? (stockSource?.warehouseName == null ? null : String(stockSource.warehouseName)) : String(item.warehouseName),
        locationId: item.locationId == null ? (stockSource?.locationId == null ? null : Number(stockSource.locationId)) : Number(item.locationId),
        locationName: item.locationName == null ? (stockSource?.locationName == null ? null : String(stockSource.locationName)) : String(item.locationName),
        quantity,
        packageQty: item.packageQty == null ? null : Number(item.packageQty),
        looseQty: item.looseQty == null ? null : Number(item.looseQty),
        packageUnit: item.packageUnit == null ? null : String(item.packageUnit),
        packageSize: item.packageSize == null ? null : Number(item.packageSize),
        unit: item.unit == null ? null : String(item.unit),
        unitPrice: Number(item.unitPrice),
        returnedQuantity,
        remainingQuantity: subtractQuantity(quantity, returnedQuantity),
      };
    });

    const exchangeOutQb = manager
      .createQueryBuilder(SaleExchangeItemEntity, 'saleExchangeItem')
      .innerJoin(SaleExchangeEntity, 'saleExchange', 'saleExchange.id = saleExchangeItem.exchange_id')
      .leftJoin(ProductEntity, 'product', 'product.id = saleExchangeItem.product_id')
      .leftJoin(StockBatchEntity, 'batch', 'batch.id = saleExchangeItem.batch_id')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = saleExchangeItem.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = saleExchangeItem.location_id')
      .select([
        'saleExchangeItem.id AS id',
        'saleExchangeItem.exchange_id AS exchangeId',
        'saleExchange.exchange_no AS exchangeNo',
        'saleExchangeItem.product_id AS productId',
        'saleExchangeItem.batch_id AS batchId',
        'batch.batch_no AS batchNo',
        'saleExchangeItem.warehouse_id AS warehouseId',
        'warehouse.name AS warehouseName',
        'saleExchangeItem.location_id AS locationId',
        'location.name AS locationName',
        'product.name AS productName',
        'saleExchangeItem.quantity AS quantity',
        'saleExchangeItem.package_qty AS packageQty',
        'saleExchangeItem.loose_qty AS looseQty',
        'saleExchangeItem.package_unit AS packageUnit',
        'saleExchangeItem.package_size AS packageSize',
        'product.unit AS unit',
        'saleExchangeItem.unit_price AS unitPrice',
      ])
      .where('saleExchange.sale_order_id = :orderId', { orderId })
      .andWhere("saleExchangeItem.direction = 'out'")
      .andWhere('saleExchange.exchange_stock_done = 1')
      .andWhere('saleExchange.status != :cancelledStatus', { cancelledStatus: SALE_EXCHANGE_STATUS.CANCELLED });

    if (excludeExchangeId) {
      exchangeOutQb.andWhere('saleExchange.id != :excludeExchangeId', { excludeExchangeId });
    }

    const exchangeOutRows = await exchangeOutQb
      .orderBy('saleExchangeItem.id', 'ASC')
      .getRawMany<Record<string, unknown>>();

    const returnedExchangeItemQuantityMap = await this.getReturnedExchangeItemQuantityMap(orderId, manager, excludeExchangeId);
    const exchangeOutSources: SaleExchangeReturnSource[] = exchangeOutRows.map((item) => {
      const id = Number(item.id);
      const quantity = roundQuantity(item.quantity as number);
      const returnedQuantity = returnedExchangeItemQuantityMap.get(id) ?? 0;
      const stockSource = exchangeOutStockSourceMap.get(Number(item.productId));
      return {
        id,
        sourceType: 'exchange_out_item',
        sourceKey: `exchange-out-item-${id}`,
        saleOrderItemId: null,
        sourceExchangeItemId: id,
        exchangeId: item.exchangeId == null ? null : Number(item.exchangeId),
        exchangeNo: item.exchangeNo == null ? null : String(item.exchangeNo),
        productId: Number(item.productId),
        productName: String(item.productName ?? ''),
        batchId: item.batchId == null ? (stockSource?.batchId == null ? null : Number(stockSource.batchId)) : Number(item.batchId),
        batchNo: item.batchNo == null ? (stockSource?.batchNo == null ? null : String(stockSource.batchNo)) : String(item.batchNo),
        warehouseId: item.warehouseId == null ? (stockSource?.warehouseId == null ? null : Number(stockSource.warehouseId)) : Number(item.warehouseId),
        warehouseName: item.warehouseName == null ? (stockSource?.warehouseName == null ? null : String(stockSource.warehouseName)) : String(item.warehouseName),
        locationId: item.locationId == null ? (stockSource?.locationId == null ? null : Number(stockSource.locationId)) : Number(item.locationId),
        locationName: item.locationName == null ? (stockSource?.locationName == null ? null : String(stockSource.locationName)) : String(item.locationName),
        quantity,
        packageQty: item.packageQty == null ? null : Number(item.packageQty),
        looseQty: item.looseQty == null ? null : Number(item.looseQty),
        packageUnit: item.packageUnit == null ? null : String(item.packageUnit),
        packageSize: item.packageSize == null ? null : Number(item.packageSize),
        unit: item.unit == null ? null : String(item.unit),
        unitPrice: Number(item.unitPrice),
        returnedQuantity,
        remainingQuantity: subtractQuantity(quantity, returnedQuantity),
      };
    });

    return [...originalSources, ...exchangeOutSources];
  }

  private async resolveSaleExchangeReturnSource(
    item: SaleExchangeReturnRequest,
    saleOrderItemSourceMap: Map<number, SaleExchangeReturnSource>,
    exchangeSourceMap: Map<number, SaleExchangeReturnSource>,
    ensureProductLoaded: (productId: number) => Promise<ProductEntity>,
  ) {
    if (!item.saleOrderItemId && !item.sourceExchangeItemId) {
      throw new BadRequestException('换货换回明细缺少来源商品');
    }

    const source = item.sourceExchangeItemId
      ? exchangeSourceMap.get(item.sourceExchangeItemId)
      : saleOrderItemSourceMap.get(item.saleOrderItemId as number);

    if (!source) {
      throw new BadRequestException(
        item.sourceExchangeItemId
          ? '换货换回明细中存在无效的历史换出商品'
          : '换货换回明细中存在无效的原销售商品',
      );
    }

    const product = await ensureProductLoaded(source.productId);
    const normalized = this.normalizeLineItemQuantity(product, item);
    if (compareQuantity(normalized.quantity, source.remainingQuantity) > 0) {
      throw new BadRequestException('换货换回数量不能超过当前可换回数量');
    }

    return { source, product, normalized };
  }

  private async resolveSaleExchangeReturnPlacement(
    manager: EntityManager,
    source: SaleExchangeReturnSource,
    item: SaleExchangeReturnRequest,
  ) {
    let sourceBatchNo = source.batchNo?.trim() || null;
    let sourceWarehouseId = source.warehouseId ?? undefined;
    let sourceLocationId = source.locationId ?? null;

    if (!sourceBatchNo) {
      const product = await manager.findOne(ProductEntity, { where: { id: source.productId, deletedAt: IsNull() } });
      if (product) {
        const inferredBatch = await this.inferLegacyReturnSourceBatch(manager, product);
        sourceBatchNo = inferredBatch?.batchNo ?? null;
        sourceWarehouseId = inferredBatch?.warehouseId ?? sourceWarehouseId;
        sourceLocationId = inferredBatch?.locationId ?? sourceLocationId;
      }
    }

    const resolvedScope = await resolveWarehouseLocation(
      manager,
      item.warehouseId ?? sourceWarehouseId,
      item.locationId ?? sourceLocationId,
    );

    return {
      warehouseId: resolvedScope.warehouse.id,
      locationId: resolvedScope.location?.id ?? null,
      batchNo: sourceBatchNo,
      stockStatus: item.stockStatus ?? STOCK_BATCH_STATUS.PENDING_INSPECTION,
    };
  }

  private async buildSaleOrderDetail(order: SaleOrderEntity, user: AuthUser, manager: EntityManager) {
    const items = await manager
      .createQueryBuilder(SaleOrderItemEntity, 'item')
      .leftJoin(ProductEntity, 'product', 'product.id = item.product_id')
      .leftJoin(StockBatchEntity, 'batch', 'batch.id = item.batch_id')
      .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = item.warehouse_id')
      .leftJoin(StockLocationEntity, 'location', 'location.id = item.location_id')
      .select([
        'item.id AS id',
        'item.order_id AS orderId',
        'item.product_id AS productId',
        'item.batch_id AS batchId',
        'batch.batch_no AS batchNo',
        'item.warehouse_id AS warehouseId',
        'warehouse.name AS warehouseName',
        'item.location_id AS locationId',
        'location.name AS locationName',
        'product.name AS productName',
        'item.quantity AS quantity',
        'item.package_qty AS packageQty',
        'item.loose_qty AS looseQty',
        'item.package_unit AS packageUnit',
        'item.package_size AS packageSize',
        'product.unit AS unit',
        'item.unit_price AS unitPrice',
        'item.cost_price AS costPrice',
        'item.subtotal AS subtotal',
      ])
      .where('item.order_id = :orderId', { orderId: order.id })
      .getRawMany<Record<string, unknown>>();

    const returnedQuantityMap = await this.getReturnedQuantityMap(order.id, manager);
    const detailItems = items.map((item) => {
      const returnedQuantity = returnedQuantityMap.get(Number(item.id)) ?? 0;
      const quantity = roundQuantity(item.quantity as number);

      return {
        ...item,
        returnedQuantity,
        remainingQuantity: subtractQuantity(quantity, returnedQuantity),
      };
    });

    const exchangeableItems = (await this.buildSaleExchangeableItems(order.id, manager))
      .filter((item) => compareQuantity(item.remainingQuantity, 0) > 0);

    const saleReturns = await manager.find(SaleReturnEntity, {
      where: { saleOrderId: order.id },
      order: { id: 'DESC' },
    });

    const returnIds = saleReturns.map((item) => item.id);
    const returnItems = returnIds.length
      ? await manager
          .createQueryBuilder(SaleReturnItemEntity, 'saleReturnItem')
          .leftJoin(ProductEntity, 'product', 'product.id = saleReturnItem.product_id')
          .select([
            'saleReturnItem.id AS id',
            'saleReturnItem.return_id AS returnId',
            'saleReturnItem.sale_order_item_id AS saleOrderItemId',
            'saleReturnItem.product_id AS productId',
            'product.name AS productName',
            'saleReturnItem.quantity AS quantity',
            'saleReturnItem.package_qty AS packageQty',
            'saleReturnItem.loose_qty AS looseQty',
            'saleReturnItem.package_unit AS packageUnit',
            'saleReturnItem.package_size AS packageSize',
            'product.unit AS unit',
            'saleReturnItem.unit_price AS unitPrice',
            'saleReturnItem.subtotal AS subtotal',
          ])
          .where('saleReturnItem.return_id IN (:...returnIds)', { returnIds })
          .orderBy('saleReturnItem.id', 'ASC')
          .getRawMany<Record<string, unknown>>()
      : [];

    const returnItemsMap = new Map<number, Record<string, unknown>[]>();
    for (const item of returnItems) {
      const returnId = Number(item.returnId);
      returnItemsMap.set(returnId, [...(returnItemsMap.get(returnId) ?? []), item]);
    }

    const saleRefunds = await manager.find(SaleRefundEntity, {
      where: { saleOrderId: order.id },
      order: { id: 'DESC' },
    });

    const saleExchanges = await manager.find(SaleExchangeEntity, {
      where: { saleOrderId: order.id },
      order: { id: 'DESC' },
    });

    const exchangeIds = saleExchanges.map((item) => item.id);
    const exchangeItems = exchangeIds.length
      ? await manager
          .createQueryBuilder(SaleExchangeItemEntity, 'saleExchangeItem')
          .leftJoin(ProductEntity, 'product', 'product.id = saleExchangeItem.product_id')
          .leftJoin(StockBatchEntity, 'batch', 'batch.id = saleExchangeItem.batch_id')
          .leftJoin(WarehouseEntity, 'warehouse', 'warehouse.id = saleExchangeItem.warehouse_id')
          .leftJoin(StockLocationEntity, 'location', 'location.id = saleExchangeItem.location_id')
          .select([
            'saleExchangeItem.id AS id',
            'saleExchangeItem.exchange_id AS exchangeId',
            'saleExchangeItem.direction AS direction',
            'saleExchangeItem.sale_order_item_id AS saleOrderItemId',
            'saleExchangeItem.source_exchange_item_id AS sourceExchangeItemId',
            'saleExchangeItem.product_id AS productId',
            'saleExchangeItem.batch_id AS batchId',
            'batch.batch_no AS batchNo',
            'saleExchangeItem.warehouse_id AS warehouseId',
            'warehouse.name AS warehouseName',
            'saleExchangeItem.location_id AS locationId',
            'location.name AS locationName',
            'product.name AS productName',
            'saleExchangeItem.quantity AS quantity',
            'saleExchangeItem.package_qty AS packageQty',
            'saleExchangeItem.loose_qty AS looseQty',
            'saleExchangeItem.package_unit AS packageUnit',
            'saleExchangeItem.package_size AS packageSize',
            'product.unit AS unit',
            'saleExchangeItem.unit_price AS unitPrice',
            'saleExchangeItem.subtotal AS subtotal',
          ])
          .where('saleExchangeItem.exchange_id IN (:...exchangeIds)', { exchangeIds })
          .orderBy('saleExchangeItem.id', 'ASC')
          .getRawMany<Record<string, unknown>>()
      : [];

    const exchangeItemsMap = new Map<number, Record<string, unknown>[]>();
    for (const item of exchangeItems) {
      const exchangeId = Number(item.exchangeId);
      exchangeItemsMap.set(exchangeId, [...(exchangeItemsMap.get(exchangeId) ?? []), item]);
    }

    return this.serializeSaleOrder(
      {
        ...order,
        displayStatus: this.getDisplayStatus(order, saleExchanges),
        items: detailItems,
        exchangeableItems,
        returns: saleReturns.map((item) => ({
          ...item,
          items: returnItemsMap.get(item.id) ?? [],
        })),
        refunds: saleRefunds,
        exchanges: saleExchanges.map((item) => ({
          ...item,
          items: exchangeItemsMap.get(item.id) ?? [],
        })),
      },
      user,
    );
  }

  private async validateSaleOrderForAfterSale(id: number, manager: EntityManager) {
    const order = await manager.findOne(SaleOrderEntity, { where: { id } });
    if (!order) throw new NotFoundException('销售订单不存在');
    if (
      order.status !== SALE_ORDER_STATUS.SHIPPED &&
      order.status !== SALE_ORDER_STATUS.DONE &&
      order.status !== SALE_ORDER_STATUS.RETURNED
    ) {
      throw new BadRequestException('只有已出库的销售订单才能办理售后');
    }

    return order;
  }

  async getSaleOrders(query: SaleOrderQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .leftJoin(CustomerEntity, 'customer', 'customer.id = saleOrder.customer_id')
      .select([
        'saleOrder.id AS id',
        'saleOrder.order_no AS orderNo',
        'saleOrder.customer_id AS customerId',
        'customer.name AS customerName',
        'saleOrder.total_amount AS totalAmount',
        'saleOrder.cost_amount AS costAmount',
        'saleOrder.received_amount AS receivedAmount',
        'saleOrder.received_amount AS paidAmount',
        'saleOrder.returned_amount AS returnedAmount',
        '(saleOrder.total_amount - saleOrder.received_amount - saleOrder.returned_amount) AS receivable',
        'saleOrder.status AS status',
        'saleOrder.remark AS remark',
        'saleOrder.created_at AS createdAt',
      ]);

    if (query.customerId) {
      qb.andWhere('saleOrder.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }

    if (query.status) {
      qb.andWhere('saleOrder.status = :status', { status: query.status });
    }

    const processingExchangeSql = `EXISTS (SELECT 1 FROM sale_exchange saleExchange WHERE saleExchange.sale_order_id = saleOrder.id AND saleExchange.status = :processingExchangeStatus)`;

    if (query.displayStatus) {
      if (query.displayStatus === SALE_EXCHANGE_STATUS.PROCESSING) {
        qb.andWhere(processingExchangeSql, { processingExchangeStatus: SALE_EXCHANGE_STATUS.PROCESSING });
      } else {
        qb.andWhere('saleOrder.status = :displayStatus', { displayStatus: query.displayStatus });
        qb.andWhere(`NOT ${processingExchangeSql}`, { processingExchangeStatus: SALE_EXCHANGE_STATUS.PROCESSING });
      }
    }

    if (query.keyword) {
      qb.andWhere(
        '(saleOrder.order_no LIKE :kw OR customer.name LIKE :kw OR customer.contact_name LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    if (query.dateFrom) {
      qb.andWhere('DATE(saleOrder.created_at) >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('DATE(saleOrder.created_at) <= :dateTo', { dateTo: query.dateTo });
    }

    if (user.role === ROLE_STAFF) {
      qb.andWhere('saleOrder.operator_id = :operatorId', { operatorId: user.sub });
    }

    qb.orderBy('saleOrder.created_at', 'DESC');
    qb.addOrderBy('saleOrder.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);

    const orderIds = list.map((item) => Number(item.id)).filter(Boolean);
    const exchanges = orderIds.length
      ? await this.dataSource.getRepository(SaleExchangeEntity).find({
          where: orderIds.map((id) => ({ saleOrderId: id })),
          select: ['id', 'saleOrderId', 'status'],
        })
      : [];

    const exchangeMap = new Map<number, Array<Pick<SaleExchangeEntity, 'status'>>>();
    for (const item of exchanges) {
      const related = exchangeMap.get(item.saleOrderId) ?? [];
      related.push(item);
      exchangeMap.set(item.saleOrderId, related);
    }

    const serialized = list.map((order) => this.serializeSaleOrder({
      ...order,
      displayStatus: this.getDisplayStatus(order as Pick<SaleOrderEntity, 'status'>, exchangeMap.get(Number(order.id))),
    }, user));

    return {
      list: serialized,
      total,
      page,
      pageSize,
    };
  }

  async createSaleOrder(dto: CreateSaleOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      if (dto.customerId) {
        const customer = await manager.findOne(CustomerEntity, {
          where: { id: dto.customerId },
        });
        if (!customer) {
          throw new BadRequestException('客户不存在');
        }
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((id) => ({ id, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) {
        throw new BadRequestException('销售商品中存在无效商品');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      let totalAmount = 0;
      let costAmount = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`商品 ${item.productId} 不存在、已删除或已停售`);
        }

        const normalized = this.normalizeLineItemQuantity(product, item);
        totalAmount = addAmount(totalAmount, multiplyAmount(normalized.quantity, item.unitPrice));
        costAmount = addAmount(costAmount, multiplyAmount(normalized.quantity, product.costPrice));
      }

      let saleOrder = manager.create(SaleOrderEntity, {
        customerId: dto.customerId ?? null,
        totalAmount,
        costAmount,
        receivedAmount: 0,
        returnedAmount: 0,
        status: SALE_ORDER_STATUS.DRAFT,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });

      saleOrder = await manager.save(SaleOrderEntity, saleOrder);
      saleOrder.orderNo = this.generateOrderNo('XS', saleOrder.id);
      saleOrder = await manager.save(SaleOrderEntity, saleOrder);

      const orderItems = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundException('商品不存在');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);

        return manager.create(SaleOrderItemEntity, {
          orderId: saleOrder.id,
          productId: item.productId,
          batchId: item.batchId ?? null,
          warehouseId: item.warehouseId ?? null,
          locationId: item.locationId ?? null,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
           subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        });
      });

      await manager.save(SaleOrderItemEntity, orderItems);

      const detail = await this.buildSaleOrderDetail(saleOrder, user, manager);
      await this.operationLogService.createLog({
        module: 'sale',
        action: 'create_order',
        operatorId: user.sub,
        detail: `${saleOrder.orderNo}｜金额 ${saleOrder.totalAmount}`,
      });
      return detail;
    });
  }

  async getSaleOrderById(id: number, user: AuthUser) {
    const order = await this.dataSource.getRepository(SaleOrderEntity).findOne({ where: { id } });
    if (!order) throw new NotFoundException('销售订单不存在');
    if (user.role === ROLE_STAFF && order.operatorId !== user.sub) {
      throw new NotFoundException('销售订单不存在');
    }
    return this.buildSaleOrderDetail(order, user, this.dataSource.manager);
  }

  async updateSaleOrder(id: number, dto: CreateSaleOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SaleOrderEntity, { where: { id } });
      if (!order) throw new NotFoundException('销售订单不存在');
      if (order.status !== SALE_ORDER_STATUS.DRAFT) throw new BadRequestException('只有草稿状态的订单可以编辑');
      if (order.receivedAmount > 0) {
        throw new BadRequestException('已收款的销售订单不能编辑，请先处理退款或继续出库');
      }

      if (dto.customerId) {
        const customer = await manager.findOne(CustomerEntity, { where: { id: dto.customerId } });
        if (!customer) throw new BadRequestException('客户不存在');
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((pid) => ({ id: pid, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) throw new BadRequestException('销售商品中存在无效商品');

      const productMap = new Map(products.map((item) => [item.id, item]));
      let totalAmount = 0;
      let costAmount = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) throw new BadRequestException(`商品 ${item.productId} 不可用`);
        const normalized = this.normalizeLineItemQuantity(product, item);
        totalAmount = addAmount(totalAmount, multiplyAmount(normalized.quantity, item.unitPrice));
        costAmount = addAmount(costAmount, multiplyAmount(normalized.quantity, product.costPrice));
      }

      await manager.delete(SaleOrderItemEntity, { orderId: id });

      order.customerId = dto.customerId ?? null;
      order.totalAmount = totalAmount;
      order.costAmount = costAmount;
      order.remark = dto.remark ?? null;
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      const orderItems = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const normalized = this.normalizeLineItemQuantity(product, item);
        return manager.create(SaleOrderItemEntity, {
          orderId: id,
          productId: item.productId,
          batchId: item.batchId ?? null,
          warehouseId: item.warehouseId ?? null,
          locationId: item.locationId ?? null,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
          subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        });
      });
      await manager.save(SaleOrderItemEntity, orderItems);

      const detail = await this.buildSaleOrderDetail(order, user, manager);
      await this.operationLogService.createLog({
        module: 'sale',
        action: 'update_order',
        operatorId: user.sub,
        detail: `${order.orderNo}｜金额 ${order.totalAmount}`,
      });
      return detail;
    });
  }

  async stockOutSaleOrder(id: number, remark: string | undefined, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SaleOrderEntity, { where: { id } });
      if (!order) throw new NotFoundException('销售订单不存在');
      if (user.role === ROLE_STAFF && order.operatorId !== user.sub) {
        throw new NotFoundException('销售订单不存在');
      }
      if (order.status !== SALE_ORDER_STATUS.DRAFT) {
        throw new BadRequestException('只有草稿状态的销售订单可以出库');
      }

      const orderItems = await manager.find(SaleOrderItemEntity, { where: { orderId: id } });
      if (orderItems.length === 0) {
        throw new BadRequestException('销售订单明细为空，无法出库');
      }

      for (const item of orderItems) {
        const product = await manager.findOne(ProductEntity, {
          where: { id: item.productId, deletedAt: IsNull() },
        });
        if (!product || product.status !== 1) {
          throw new BadRequestException(`商品 ${item.productId} 不存在、已删除或已停售`);
        }
        await syncProductAvailableStockQty(manager, product);
        if (compareQuantity(product.availableStockQty, item.quantity) < 0) {
          throw new BadRequestException(`商品 ${product.name} 可售库存不足`);
        }

        const deductions = await this.deductProductBatches(
          manager,
          product,
          {
            quantity: item.quantity,
            batchId: item.batchId,
            warehouseId: item.warehouseId,
            locationId: item.locationId,
          },
          {
            manualRequired: `商品 ${product.name} 必须手选批次后才能出库`,
            selectedBatchInsufficient: '所选批次库存不足，无法出库',
            autoPickInsufficient: `商品 ${product.name} 批次库存不足`,
          },
        );

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = subtractQuantity(beforeQty, item.quantity);
        product.availableStockQty = subtractQuantity(roundQuantity(product.availableStockQty), item.quantity);
        await manager.save(ProductEntity, product);

        if (deductions.length === 1) {
          item.batchId = deductions[0].batch.id;
          item.warehouseId = deductions[0].batch.warehouseId;
          item.locationId = deductions[0].batch.locationId;
          await manager.save(SaleOrderItemEntity, item);
        }

        let runningBeforeQty = beforeQty;
        const stockRecords: StockRecordEntity[] = [];
        for (const deduction of deductions) {
          const runningAfterQty = subtractQuantity(runningBeforeQty, deduction.quantity);
          stockRecords.push(manager.create(StockRecordEntity, {
            productId: product.id,
            batchId: deduction.batch.id,
            batchNo: deduction.batch.batchNo,
            warehouseId: deduction.batch.warehouseId,
            locationId: deduction.batch.locationId,
            type: 'out',
            reason: 'sale',
            quantity: deduction.quantity,
            packageQty: deductions.length === 1 ? item.packageQty : null,
            looseQty: deductions.length === 1 ? item.looseQty : null,
            packageUnit: deductions.length === 1 ? item.packageUnit : null,
            packageSize: deductions.length === 1 ? item.packageSize : null,
            beforeQty: runningBeforeQty,
            afterQty: runningAfterQty,
            unit: product.unit ?? null,
            relatedOrderId: order.id,
            operatorId: user.sub,
            remark: remark ?? order.remark ?? null,
          }));
          runningBeforeQty = runningAfterQty;
        }

        await manager.save(StockRecordEntity, stockRecords);
      }

      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: SALE_ORDER_STATUS.SHIPPED,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'stock_out_order',
        operatorId: user.sub,
        detail: `${order.orderNo}｜状态 ${order.status}`,
      });

      return { success: true, id: order.id, status: order.status };
    });
  }

  async quickCompleteSaleOrder(dto: QuickCompleteSaleOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      // 1. 校验客户
      if (dto.customerId) {
        const customer = await manager.findOne(CustomerEntity, { where: { id: dto.customerId } });
        if (!customer) throw new BadRequestException('客户不存在');
      }

      // 2. 校验商品 & 库存
      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((id) => ({ id, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) throw new BadRequestException('销售商品中存在无效商品');

      const productMap = new Map(products.map((p) => [p.id, p]));
      let totalAmount = 0;
      let costAmount = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) throw new BadRequestException(`商品 ${item.productId} 不存在、已删除或已停售`);
        const normalized = this.normalizeLineItemQuantity(product, item);
        await syncProductAvailableStockQty(manager, product);
        if (compareQuantity(product.availableStockQty, normalized.quantity) < 0) throw new BadRequestException(`商品 ${product.name} 可售库存不足`);
        totalAmount = addAmount(totalAmount, multiplyAmount(normalized.quantity, item.unitPrice));
        costAmount = addAmount(costAmount, multiplyAmount(normalized.quantity, product.costPrice));
      }

      const paidAmount = roundAmount(dto.paidAmount);
      if (compareAmount(paidAmount, totalAmount) > 0) {
        throw new BadRequestException('收款金额不能超过销售订单应收总额');
      }

      // 3. 创建订单（直接 shipped 状态）
      let saleOrder = manager.create(SaleOrderEntity, {
        customerId: dto.customerId ?? null,
        totalAmount,
        costAmount,
        receivedAmount: paidAmount,
        returnedAmount: 0,
        status: SALE_ORDER_STATUS.SHIPPED,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      saleOrder = await manager.save(SaleOrderEntity, saleOrder);
      saleOrder.orderNo = this.generateOrderNo('XS', saleOrder.id);
      saleOrder = await manager.save(SaleOrderEntity, saleOrder);

      // 4. 写订单明细 & 扣库存
      const orderItems = [];
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const normalized = this.normalizeLineItemQuantity(product, item);
        const orderItem = manager.create(SaleOrderItemEntity, {
          orderId: saleOrder.id,
          productId: item.productId,
          batchId: item.batchId ?? null,
          warehouseId: item.warehouseId ?? null,
          locationId: item.locationId ?? null,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
           subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
         });
        orderItems.push(orderItem);

        const deductions = await this.deductProductBatches(
          manager,
          product,
          {
            quantity: normalized.quantity,
            batchId: item.batchId,
            warehouseId: item.warehouseId,
            locationId: item.locationId,
          },
          {
            manualRequired: `商品 ${product.name} 必须手选批次后才能出库`,
            selectedBatchInsufficient: '所选批次库存不足，无法出库',
            autoPickInsufficient: `商品 ${product.name} 批次库存不足`,
          },
        );

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = subtractQuantity(beforeQty, normalized.quantity);
        product.availableStockQty = subtractQuantity(roundQuantity(product.availableStockQty), normalized.quantity);
        await manager.save(ProductEntity, product);

        if (deductions.length === 1) {
          orderItem.batchId = deductions[0].batch.id;
          orderItem.warehouseId = deductions[0].batch.warehouseId;
          orderItem.locationId = deductions[0].batch.locationId;
        }

        let runningBeforeQty = beforeQty;
        const stockRecords: StockRecordEntity[] = [];
        for (const deduction of deductions) {
          const runningAfterQty = subtractQuantity(runningBeforeQty, deduction.quantity);
          stockRecords.push(manager.create(StockRecordEntity, {
            productId: product.id,
            batchId: deduction.batch.id,
            batchNo: deduction.batch.batchNo,
            warehouseId: deduction.batch.warehouseId,
            locationId: deduction.batch.locationId,
            type: 'out',
            reason: 'sale',
            quantity: deduction.quantity,
            packageQty: deductions.length === 1 ? normalized.packageQty : null,
            looseQty: deductions.length === 1 ? normalized.looseQty : null,
            packageUnit: deductions.length === 1 ? normalized.packageUnit : null,
            packageSize: deductions.length === 1 ? normalized.packageSize : null,
            beforeQty: runningBeforeQty,
            afterQty: runningAfterQty,
            unit: product.unit ?? null,
            relatedOrderId: saleOrder.id,
            operatorId: user.sub,
            remark: dto.remark ?? null,
          }));
          runningBeforeQty = runningAfterQty;
        }

        await manager.save(StockRecordEntity, stockRecords);
      }
      await manager.save(SaleOrderItemEntity, orderItems);

      // 5. 写收款记录
      if (compareAmount(paidAmount, 0) > 0) {
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.RECEIVE,
          relatedType: 'sale_order',
          relatedId: saleOrder.id,
          amount: paidAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? null,
        }));
      }

      // 6. 重算最终状态（可能直接变 done）
      saleOrder.status = this.recalculateStatus({
        receivedAmount: paidAmount,
        returnedAmount: 0,
        totalAmount,
        status: SALE_ORDER_STATUS.SHIPPED,
      });
      await manager.save(SaleOrderEntity, saleOrder);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'quick_complete',
        operatorId: user.sub,
        detail: `${saleOrder.orderNo}｜金额 ${totalAmount}｜收款 ${paidAmount}`,
      });

      return this.buildSaleOrderDetail(saleOrder, user, manager);
    });
  }

  async createSaleReturn(id: number, dto: CreateSaleReturnDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SaleOrderEntity, { where: { id } });
      if (!order) throw new NotFoundException('销售订单不存在');
      if (
        order.status !== SALE_ORDER_STATUS.SHIPPED &&
        order.status !== SALE_ORDER_STATUS.DONE &&
        order.status !== SALE_ORDER_STATUS.RETURNED
      ) {
        throw new BadRequestException('只有已出库的销售订单才能办理退货');
      }

      const orderItems = await manager.find(SaleOrderItemEntity, { where: { orderId: id } });
      if (orderItems.length === 0) {
        throw new BadRequestException('销售订单明细为空，无法退货');
      }

      const requestedQuantityMap = new Map<number, number>();
      const requestedDisplayMap = new Map<number, ReturnType<SaleOrderService['normalizeLineItemQuantity']>>();
      for (const item of dto.items) {
        const orderItem = orderItems.find((orderLine) => orderLine.id === item.saleOrderItemId);
        if (!orderItem) {
          throw new BadRequestException('退货明细中存在无效的原销售商品');
        }
        const product = await manager.findOne(ProductEntity, { where: { id: orderItem.productId, deletedAt: IsNull() } });
        if (!product) {
          throw new BadRequestException('退货商品不存在或已删除，无法回库');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        requestedQuantityMap.set(
          item.saleOrderItemId,
          addQuantity(requestedQuantityMap.get(item.saleOrderItemId) ?? 0, normalized.quantity),
        );
        requestedDisplayMap.set(item.saleOrderItemId, normalized);
      }

      const returnedQuantityMap = await this.getReturnedQuantityMap(id, manager);
      const orderItemMap = new Map(orderItems.map((item) => [item.id, item]));
      let totalAmount = 0;

      for (const [saleOrderItemId, quantity] of requestedQuantityMap) {
        const orderItem = orderItemMap.get(saleOrderItemId);
        if (!orderItem) {
          throw new BadRequestException('退货明细中存在无效的原销售商品');
        }

        const returnedQuantity = returnedQuantityMap.get(saleOrderItemId) ?? 0;
        const remainingQuantity = subtractQuantity(orderItem.quantity, returnedQuantity);
        if (compareQuantity(quantity, remainingQuantity) > 0) {
          throw new BadRequestException('退货数量不能超过原销售单的剩余可退数量');
        }

        totalAmount = addAmount(totalAmount, multiplyAmount(quantity, orderItem.unitPrice));
      }

      const refundAmount = roundAmount(dto.refundAmount ?? 0);
      if (compareAmount(refundAmount, totalAmount) > 0) {
        throw new BadRequestException('退款金额不能超过本次退货金额');
      }
      if (compareAmount(refundAmount, order.receivedAmount) > 0) {
        throw new BadRequestException('退款金额不能超过该订单当前已收款金额');
      }

      let saleReturn = manager.create(SaleReturnEntity, {
        saleOrderId: id,
        totalAmount,
        refundAmount,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      saleReturn = await manager.save(SaleReturnEntity, saleReturn);
      saleReturn.returnNo = this.generateOrderNo('XT', saleReturn.id);
      saleReturn = await manager.save(SaleReturnEntity, saleReturn);

      const returnItems: SaleReturnItemEntity[] = [];
      for (const [saleOrderItemId, quantity] of requestedQuantityMap) {
        const orderItem = orderItemMap.get(saleOrderItemId)!;
        const product = await manager.findOne(ProductEntity, {
          where: { id: orderItem.productId, deletedAt: IsNull() },
        });
        if (!product) {
          throw new BadRequestException('退货商品不存在或已删除，无法回库');
        }
        const sourceBatch = orderItem.batchId
          ? await manager.findOne(StockBatchEntity, { where: { id: orderItem.batchId } })
          : null;
        const fallbackRows = sourceBatch ? [] : await manager
          .createQueryBuilder(StockRecordEntity, 'record')
          .select([
            'record.batch_id AS batchId',
            'record.batch_no AS batchNo',
            'record.warehouse_id AS warehouseId',
            'record.location_id AS locationId',
          ])
          .where('record.related_order_id = :orderId', { orderId: id })
          .andWhere('record.reason = :reason', { reason: 'sale' })
          .andWhere('record.product_id = :productId', { productId: orderItem.productId })
          .andWhere('record.batch_id IS NOT NULL')
          .getRawMany<Record<string, unknown>>();
        const fallbackScopes = new Set(fallbackRows.map((row) => [
          row.batchId ?? '',
          row.warehouseId ?? '',
          row.locationId ?? '',
        ].join('|')));
        const fallbackSource = fallbackScopes.size === 1 ? fallbackRows[0] : null;
        const inferredBatch = sourceBatch || fallbackSource ? null : await this.inferLegacyReturnSourceBatch(manager, product);
        const sourceBatchNo = sourceBatch?.batchNo
          ?? (fallbackSource?.batchNo == null ? null : String(fallbackSource.batchNo))
          ?? inferredBatch?.batchNo
          ?? null;
        const sourceWarehouseId = sourceBatch?.warehouseId
          ?? (fallbackSource?.warehouseId == null ? undefined : Number(fallbackSource.warehouseId))
          ?? inferredBatch?.warehouseId;
        const sourceLocationId = sourceBatch?.locationId
          ?? (fallbackSource?.locationId == null ? null : Number(fallbackSource.locationId))
          ?? inferredBatch?.locationId
          ?? null;
        const returnBatch = await resolveInboundStockBatch(manager, product, {
          batchNo: sourceBatchNo || `RETURN-${saleReturn.returnNo ?? saleReturn.id}`,
          warehouseId: sourceWarehouseId,
          locationId: sourceLocationId,
          status: STOCK_BATCH_STATUS.PENDING_INSPECTION,
          costPrice: product.costPrice ?? 0,
          remark: dto.remark ?? `销售退货 ${saleReturn.returnNo ?? saleReturn.id}`,
        });
        returnBatch.quantity = addQuantity(returnBatch.quantity ?? 0, quantity);
        const savedReturnBatch = await manager.getRepository(StockBatchEntity).save(returnBatch);

        const returnItem = manager.create(SaleReturnItemEntity, {
          returnId: saleReturn.id,
          saleOrderItemId,
          productId: orderItem.productId,
          quantity,
          packageQty: requestedDisplayMap.get(saleOrderItemId)?.packageQty ?? null,
          looseQty: requestedDisplayMap.get(saleOrderItemId)?.looseQty ?? quantity,
          packageUnit: requestedDisplayMap.get(saleOrderItemId)?.packageUnit ?? orderItem.packageUnit,
          packageSize: requestedDisplayMap.get(saleOrderItemId)?.packageSize ?? orderItem.packageSize,
          unitPrice: orderItem.unitPrice,
          subtotal: multiplyAmount(quantity, orderItem.unitPrice),
        });
        returnItems.push(returnItem);

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(beforeQty, quantity);
        await manager.save(ProductEntity, product);

        const stockRecord = manager.create(StockRecordEntity, {
          productId: product.id,
          batchId: savedReturnBatch.id,
          batchNo: savedReturnBatch.batchNo,
          warehouseId: savedReturnBatch.warehouseId,
          locationId: savedReturnBatch.locationId,
          type: 'in',
          reason: 'sale_return',
          quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: dto.remark ?? `销售退货 ${saleReturn.returnNo ?? saleReturn.id}`,
        });
        await manager.save(StockRecordEntity, stockRecord);
      }

      await manager.save(SaleReturnItemEntity, returnItems);

      order.returnedAmount = addAmount(order.returnedAmount, totalAmount);
      if (compareAmount(refundAmount, 0) > 0) {
        order.receivedAmount = subtractAmount(order.receivedAmount, refundAmount);
        const refundRecord = manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.REFUND,
          relatedType: 'sale_order',
          relatedId: order.id,
          amount: refundAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? `销售退货退款 ${saleReturn.returnNo ?? saleReturn.id}`,
        });
        await manager.save(PaymentRecordEntity, refundRecord);
      }

      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      const detail = await this.buildSaleOrderDetail(order, user, manager);
      await this.operationLogService.createLog({
        module: 'sale',
        action: refundAmount > 0 ? 'create_return_with_refund' : 'create_return',
        operatorId: user.sub,
        detail: `${order.orderNo}｜退货 ${totalAmount}｜退款 ${refundAmount}`,
      });
      return detail;
    });
  }

  async createSaleRefund(id: number, dto: CreateSaleRefundDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.validateSaleOrderForAfterSale(id, manager);
      const refundAmount = roundAmount(dto.amount);
      if (compareAmount(refundAmount, order.receivedAmount) > 0) {
        throw new BadRequestException('退款金额不能超过该订单当前已收款金额');
      }

      let saleRefund = manager.create(SaleRefundEntity, {
        saleOrderId: id,
        amount: refundAmount,
        method: dto.method ?? null,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      saleRefund = await manager.save(SaleRefundEntity, saleRefund);
      saleRefund.refundNo = this.generateOrderNo('TF', saleRefund.id);
      saleRefund = await manager.save(SaleRefundEntity, saleRefund);

      order.returnedAmount = addAmount(order.returnedAmount, refundAmount);
      order.receivedAmount = subtractAmount(order.receivedAmount, refundAmount);
      const prevStatus = order.status;
      const nextStatus = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      if (prevStatus === SALE_ORDER_STATUS.DONE && nextStatus === SALE_ORDER_STATUS.SHIPPED) {
        order.status = SALE_ORDER_STATUS.DONE;
      } else {
        order.status = nextStatus;
      }
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      const refundRecord = manager.create(PaymentRecordEntity, {
        type: PAYMENT_RECORD_TYPE.REFUND,
        relatedType: 'sale_order',
        relatedId: order.id,
        amount: refundAmount,
        method: dto.method ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? `销售仅退款 ${saleRefund.refundNo ?? saleRefund.id}`,
      });
      await manager.save(PaymentRecordEntity, refundRecord);

      const detail = await this.buildSaleOrderDetail(order, user, manager);
      await this.operationLogService.createLog({
        module: 'sale',
        action: 'create_refund_only',
        operatorId: user.sub,
        detail: `${order.orderNo}｜退款 ${refundAmount}`,
      });
      return detail;
    });
  }

async createSaleExchange(id: number, dto: CreateSaleExchangeDto, user: AuthUser) {
    return this.createSaleExchangeComplete(id, dto, user);
  }

  private async createSaleExchangeDraft(id: number, dto: CreateSaleExchangeDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.validateSaleOrderForAfterSale(id, manager);
      const exchangeableSources = await this.buildSaleExchangeableItems(id, manager);
      const saleOrderItemSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.saleOrderItemId != null)
          .map((source) => [source.saleOrderItemId as number, source]),
      );
      const exchangeSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.sourceExchangeItemId != null)
          .map((source) => [source.sourceExchangeItemId as number, source]),
      );
      const productMap = new Map<number, ProductEntity>();

      const ensureProductLoaded = async (productId: number) => {
        if (productMap.has(productId)) return productMap.get(productId)!;
        const product = await manager.findOne(ProductEntity, { where: { id: productId, deletedAt: IsNull() } });
        if (!product) throw new BadRequestException('商品不存在、已删除或已停售');
        productMap.set(productId, product);
        return product;
      };

      let returnAmount = 0;
      for (const item of dto.returnItems) {
        const { source, normalized } = await this.resolveSaleExchangeReturnSource(
          item,
          saleOrderItemSourceMap,
          exchangeSourceMap,
          ensureProductLoaded,
        );
        returnAmount = addAmount(returnAmount, multiplyAmount(normalized.quantity, source.unitPrice));
      }

      let exchangeAmount = 0;
      for (const item of dto.exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        exchangeAmount = addAmount(exchangeAmount, multiplyAmount(normalized.quantity, item.unitPrice));
      }

      const saleExchange = manager.create(SaleExchangeEntity, {
        saleOrderId: id,
        returnAmount,
        exchangeAmount,
        refundAmount: roundAmount(dto.refundAmount ?? 0),
        receiveAmount: roundAmount(dto.receiveAmount ?? 0),
        method: dto.method ?? null,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
        status: SALE_EXCHANGE_STATUS.DRAFT,
        returnStockDone: 0,
        exchangeStockDone: 0,
        paymentDone: 0,
      });
      await manager.save(SaleExchangeEntity, saleExchange);
      saleExchange.exchangeNo = this.generateOrderNo('HH', saleExchange.id);
      await manager.save(SaleExchangeEntity, saleExchange);

      const exchangeItems: SaleExchangeItemEntity[] = [];
      for (const item of dto.returnItems) {
        const { source, normalized } = await this.resolveSaleExchangeReturnSource(
          item,
          saleOrderItemSourceMap,
          exchangeSourceMap,
          ensureProductLoaded,
        );
        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'return',
          saleOrderItemId: source.saleOrderItemId,
          sourceExchangeItemId: source.sourceExchangeItemId,
          productId: source.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: source.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, source.unitPrice),
        }));
      }
      for (const item of dto.exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        const normalized = this.normalizeLineItemQuantity(product, item);
        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'out',
          saleOrderItemId: null,
          sourceExchangeItemId: null,
          productId: item.productId,
          batchId: item.batchId ?? null,
          warehouseId: item.warehouseId ?? null,
          locationId: item.locationId ?? null,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        }));
      }
      await manager.save(SaleExchangeItemEntity, exchangeItems);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'create_exchange_draft',
        operatorId: user.sub,
        detail: `${order.orderNo}｜换货草稿 ${saleExchange.exchangeNo}`,
      });

      return { exchangeId: saleExchange.id, exchangeNo: saleExchange.exchangeNo, status: saleExchange.status };
    });
  }

  private async createSaleExchangeComplete(id: number, dto: CreateSaleExchangeDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.validateSaleOrderForAfterSale(id, manager);
      const exchangeableSources = await this.buildSaleExchangeableItems(id, manager);
      const saleOrderItemSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.saleOrderItemId != null)
          .map((source) => [source.saleOrderItemId as number, source]),
      );
      const exchangeSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.sourceExchangeItemId != null)
          .map((source) => [source.sourceExchangeItemId as number, source]),
      );
      const productMap = new Map<number, ProductEntity>();

      const ensureProductLoaded = async (productId: number) => {
        if (productMap.has(productId)) return productMap.get(productId)!;
        const product = await manager.findOne(ProductEntity, { where: { id: productId, deletedAt: IsNull() } });
        if (!product) throw new BadRequestException('商品不存在、已删除或已停售');
        productMap.set(productId, product);
        return product;
      };

      const normalizedReturnItemMap = new Map<
        string,
        {
          source: SaleExchangeReturnSource;
          normalized: ReturnType<SaleOrderService['normalizeLineItemQuantity']>;
        }
      >();

      let returnAmount = 0;
      for (const item of dto.returnItems) {
        const resolved = await this.resolveSaleExchangeReturnSource(
          item,
          saleOrderItemSourceMap,
          exchangeSourceMap,
          ensureProductLoaded,
        );
        const sourceKey = item.sourceExchangeItemId
          ? `exchange-out-item-${item.sourceExchangeItemId}`
          : `sale-order-item-${item.saleOrderItemId}`;
        normalizedReturnItemMap.set(sourceKey, resolved);
        returnAmount = addAmount(returnAmount, multiplyAmount(resolved.normalized.quantity, resolved.source.unitPrice));
      }

      let exchangeAmount = 0;
      const normalizedExchangeOutItems: Array<ReturnType<SaleOrderService['normalizeLineItemQuantity']> & { productId: number; unitPrice: number; batchId?: number; warehouseId?: number; locationId?: number }> = [];
      for (const item of dto.exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        await syncProductAvailableStockQty(manager, product);
        if (compareQuantity(product.availableStockQty, normalized.quantity) < 0) {
          throw new BadRequestException(`换出商品 ${product.name} 可售库存不足`);
        }
        exchangeAmount = addAmount(exchangeAmount, multiplyAmount(normalized.quantity, item.unitPrice));
        normalizedExchangeOutItems.push({ ...normalized, productId: item.productId, unitPrice: item.unitPrice, batchId: item.batchId, warehouseId: item.warehouseId, locationId: item.locationId });
      }

      const differenceAmount = subtractAmount(exchangeAmount, returnAmount);
      const maxRefundAmount = Math.max(subtractAmount(returnAmount, exchangeAmount), 0);
      const refundAmount = roundAmount(dto.refundAmount ?? 0);
      if (compareAmount(refundAmount, maxRefundAmount) > 0) {
        throw new BadRequestException('换货退款金额不能超过本次换货差额');
      }
      if (compareAmount(refundAmount, order.receivedAmount) > 0) {
        throw new BadRequestException('换货退款金额不能超过该订单当前已收款金额');
      }

      const maxReceiveAmount = Math.max(differenceAmount, 0);
      const receiveAmount = roundAmount(dto.receiveAmount ?? 0);
      if (compareAmount(receiveAmount, maxReceiveAmount) > 0) {
        throw new BadRequestException('换货补差收款金额不能超过本次换货应补差额');
      }

      let saleExchange = manager.create(SaleExchangeEntity, {
        saleOrderId: id,
        returnAmount,
        exchangeAmount,
        refundAmount,
        receiveAmount,
        method: dto.method ?? null,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
        status: SALE_EXCHANGE_STATUS.COMPLETED,
        returnStockDone: 1,
        exchangeStockDone: 1,
        paymentDone: refundAmount > 0 || receiveAmount > 0 ? 1 : 0,
      });
      saleExchange = await manager.save(SaleExchangeEntity, saleExchange);
      saleExchange.exchangeNo = this.generateOrderNo('HH', saleExchange.id);
      saleExchange = await manager.save(SaleExchangeEntity, saleExchange);

      const exchangeItems: SaleExchangeItemEntity[] = [];

      // 换回商品：入库
      for (const item of dto.returnItems) {
        const sourceKey = item.sourceExchangeItemId
          ? `exchange-out-item-${item.sourceExchangeItemId}`
          : `sale-order-item-${item.saleOrderItemId}`;
        const resolved = normalizedReturnItemMap.get(sourceKey);
        if (!resolved) throw new BadRequestException('换货换回明细数据异常，请重新提交');
        const { source, normalized } = resolved;
        const product = await ensureProductLoaded(source.productId);
        if (!product) throw new BadRequestException('换回商品不存在或已删除，无法回库');

        const placement = await this.resolveSaleExchangeReturnPlacement(manager, source, item);
        const batch = await resolveInboundStockBatch(manager, product, {
          batchNo: placement.batchNo || `RETURN-${saleExchange.exchangeNo ?? saleExchange.id}`,
          warehouseId: placement.warehouseId,
          locationId: placement.locationId,
          status: placement.stockStatus,
          costPrice: product.costPrice ?? 0,
        });
        batch.quantity = addQuantity(batch.quantity ?? 0, normalized.quantity);
        const savedBatch = await manager.getRepository(StockBatchEntity).save(batch);

        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'return',
          saleOrderItemId: source.saleOrderItemId,
          sourceExchangeItemId: source.sourceExchangeItemId,
          productId: source.productId,
          batchId: savedBatch.id,
          warehouseId: savedBatch.warehouseId,
          locationId: savedBatch.locationId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: source.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, source.unitPrice),
        }));

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(beforeQty, normalized.quantity);
        if (placement.stockStatus === STOCK_BATCH_STATUS.SELLABLE) {
          product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), normalized.quantity);
        }
        await manager.save(ProductEntity, product);
        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
          batchId: savedBatch.id,
          batchNo: savedBatch.batchNo,
          warehouseId: savedBatch.warehouseId,
          locationId: savedBatch.locationId,
          type: 'in',
          reason: 'sale_exchange_return',
          quantity: normalized.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: dto.remark ?? `销售换货换回 ${saleExchange.exchangeNo ?? saleExchange.id}`,
        }));
      }

      // 换出商品：出库（按批次 FIFO 扣减）
      for (const item of normalizedExchangeOutItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }

        const deductions = await this.deductProductBatches(
          manager,
          product,
          {
            quantity: item.quantity,
            batchId: item.batchId,
            warehouseId: item.warehouseId,
            locationId: item.locationId,
          },
          {
            manualRequired: `换出商品 ${product.name} 必须手选批次后才能出库`,
            selectedBatchInsufficient: '所选批次库存不足，无法换出',
            autoPickInsufficient: `换出商品 ${product.name} 批次库存不足`,
          },
        );
        const actualOutBatch = deductions.length === 1 ? deductions[0].batch : null;

        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'out',
          saleOrderItemId: null,
          sourceExchangeItemId: null,
          productId: item.productId,
          batchId: actualOutBatch?.id ?? item.batchId ?? null,
          warehouseId: actualOutBatch?.warehouseId ?? item.warehouseId ?? null,
          locationId: actualOutBatch?.locationId ?? item.locationId ?? null,
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          packageUnit: item.packageUnit,
          packageSize: item.packageSize,
          unitPrice: item.unitPrice,
          subtotal: multiplyAmount(item.quantity, item.unitPrice),
        }));

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = subtractQuantity(beforeQty, item.quantity);
        product.availableStockQty = subtractQuantity(roundQuantity(product.availableStockQty), item.quantity);
        await manager.save(ProductEntity, product);

        let runningBefore = beforeQty;
        const stockRecords: StockRecordEntity[] = [];
        for (const d of deductions) {
          const runningAfter = subtractQuantity(runningBefore, d.quantity);
          stockRecords.push(manager.create(StockRecordEntity, {
            productId: product.id,
            batchId: d.batch.id,
            batchNo: d.batch.batchNo,
            warehouseId: d.batch.warehouseId,
            locationId: d.batch.locationId,
            type: 'out',
            reason: 'sale_exchange_out',
            quantity: d.quantity,
            packageQty: deductions.length === 1 ? item.packageQty : null,
            looseQty: deductions.length === 1 ? item.looseQty : null,
            packageUnit: item.packageUnit,
            packageSize: item.packageSize,
            beforeQty: runningBefore,
            afterQty: runningAfter,
            unit: product.unit ?? null,
            relatedOrderId: order.id,
            operatorId: user.sub,
            remark: dto.remark ?? `销售换货换出 ${saleExchange.exchangeNo ?? saleExchange.id}`,
          }));
          runningBefore = runningAfter;
        }
        // 无批次记录时保留原始兜底记录
        if (stockRecords.length === 0) {
          stockRecords.push(manager.create(StockRecordEntity, {
            productId: product.id,
            type: 'out',
            reason: 'sale_exchange_out',
            quantity: item.quantity,
            beforeQty,
            afterQty: product.stockQty,
            relatedOrderId: order.id,
            operatorId: user.sub,
            remark: dto.remark ?? `销售换货换出 ${saleExchange.exchangeNo ?? saleExchange.id}`,
          }));
        }
        await manager.save(StockRecordEntity, stockRecords);
      }
      await manager.save(SaleExchangeItemEntity, exchangeItems);

      if (compareAmount(differenceAmount, 0) > 0) {
        order.totalAmount = addAmount(order.totalAmount, differenceAmount);
      } else {
        order.returnedAmount = addAmount(order.returnedAmount, subtractAmount(returnAmount, exchangeAmount));
      }

      if (compareAmount(refundAmount, 0) > 0) {
        order.receivedAmount = subtractAmount(order.receivedAmount, refundAmount);
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.REFUND,
          relatedType: 'sale_order',
          relatedId: order.id,
          amount: refundAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? `销售换货退款 ${saleExchange.exchangeNo ?? saleExchange.id}`,
        }));
      }
      if (compareAmount(receiveAmount, 0) > 0) {
        order.receivedAmount = addAmount(order.receivedAmount, receiveAmount);
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.RECEIVE,
          relatedType: 'sale_order',
          relatedId: order.id,
          amount: receiveAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? `销售换货补差 ${saleExchange.exchangeNo ?? saleExchange.id}`,
        }));
      }

      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      const detail = await this.buildSaleOrderDetail(order, user, manager);
      await this.operationLogService.createLog({
        module: 'sale',
        action: refundAmount > 0 || receiveAmount > 0 ? 'create_exchange_with_settlement' : 'create_exchange',
        operatorId: user.sub,
        detail: `${order.orderNo}｜换回 ${returnAmount}｜换出 ${exchangeAmount}｜退款 ${refundAmount}｜补差 ${receiveAmount}`,
      });
      return detail;
    });
  }

  async deleteSaleOrder(id: number, user: AuthUser) {
    const order = await this.dataSource.getRepository(SaleOrderEntity).findOne({ where: { id } });
    if (!order) throw new NotFoundException('销售订单不存在');
    if (order.status !== SALE_ORDER_STATUS.DRAFT) {
      throw new BadRequestException('只有草稿状态的订单可以删除');
    }
    if (order.receivedAmount > 0) {
      throw new BadRequestException('销售订单已有收款记录，不能直接删除，请先处理退款');
    }
    await this.dataSource.getRepository(SaleOrderItemEntity).delete({ orderId: id });
    await this.dataSource.getRepository(SaleOrderEntity).delete(id);
    await this.operationLogService.createLog({
      module: 'sale',
      action: 'delete_order',
      operatorId: user.sub,
      detail: `${order.orderNo}`,
    });
    return { success: true };
  }

  async updateSaleExchangeDraft(exchangeId: number, dto: UpdateSaleExchangeDraftDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await manager.findOne(SaleExchangeEntity, { where: { id: exchangeId } });
      if (!exchange) throw new NotFoundException('换货单不存在');
      if (exchange.status !== SALE_EXCHANGE_STATUS.DRAFT) {
        throw new BadRequestException('只有草稿状态的换货单可以编辑');
      }

      const order = await manager.findOne(SaleOrderEntity, { where: { id: exchange.saleOrderId } });
      if (!order) throw new NotFoundException('原销售订单不存在');
      const exchangeableSources = await this.buildSaleExchangeableItems(order.id, manager, exchange.id);
      const saleOrderItemSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.saleOrderItemId != null)
          .map((source) => [source.saleOrderItemId as number, source]),
      );
      const exchangeSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.sourceExchangeItemId != null)
          .map((source) => [source.sourceExchangeItemId as number, source]),
      );
      const productMap = new Map<number, ProductEntity>();

      const ensureProductLoaded = async (productId: number) => {
        if (productMap.has(productId)) return productMap.get(productId)!;
        const product = await manager.findOne(ProductEntity, { where: { id: productId, deletedAt: IsNull() } });
        if (!product) throw new BadRequestException('商品不存在、已删除或已停售');
        productMap.set(productId, product);
        return product;
      };

      const returnItems = dto.returnItems ?? [];
      const exchangeItems = dto.exchangeItems ?? [];

      let returnAmount = 0;
      for (const item of returnItems) {
        const { source, normalized } = await this.resolveSaleExchangeReturnSource(
          item,
          saleOrderItemSourceMap,
          exchangeSourceMap,
          ensureProductLoaded,
        );
        returnAmount = addAmount(returnAmount, multiplyAmount(normalized.quantity, source.unitPrice));
      }

      let exchangeAmount = 0;
      for (const item of exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        exchangeAmount = addAmount(exchangeAmount, multiplyAmount(normalized.quantity, item.unitPrice));
      }

      exchange.returnAmount = returnAmount;
      exchange.exchangeAmount = exchangeAmount;
      if (dto.refundAmount != null) exchange.refundAmount = roundAmount(dto.refundAmount);
      if (dto.receiveAmount != null) exchange.receiveAmount = roundAmount(dto.receiveAmount);
      if (dto.method != null) exchange.method = dto.method;
      if (dto.reasonCode != null) exchange.reasonCode = dto.reasonCode;
      if (dto.reasonNote != null) exchange.reasonNote = dto.reasonNote;
      if (dto.remark != null) exchange.remark = dto.remark;
      await manager.save(SaleExchangeEntity, exchange);

      await manager.delete(SaleExchangeItemEntity, { exchangeId: exchange.id });

      const newItems: SaleExchangeItemEntity[] = [];
      for (const item of returnItems) {
        const { source, normalized } = await this.resolveSaleExchangeReturnSource(
          item,
          saleOrderItemSourceMap,
          exchangeSourceMap,
          ensureProductLoaded,
        );
        newItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: exchange.id,
          direction: 'return',
          saleOrderItemId: source.saleOrderItemId,
          sourceExchangeItemId: source.sourceExchangeItemId,
          productId: source.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: source.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, source.unitPrice),
        }));
      }
      for (const item of exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        const normalized = this.normalizeLineItemQuantity(product, item);
        newItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: exchange.id,
          direction: 'out',
          saleOrderItemId: null,
          sourceExchangeItemId: null,
          productId: item.productId,
          batchId: item.batchId ?? null,
          warehouseId: item.warehouseId ?? null,
          locationId: item.locationId ?? null,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        }));
      }
      await manager.save(SaleExchangeItemEntity, newItems);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'update_exchange_draft',
        operatorId: user.sub,
        detail: `${order.orderNo}｜换货草稿 ${exchange.exchangeNo}`,
      });

      return { exchangeId: exchange.id, exchangeNo: exchange.exchangeNo, status: exchange.status };
    });
  }

  async executeSaleExchangeStock(exchangeId: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await manager.findOne(SaleExchangeEntity, { where: { id: exchangeId } });
      if (!exchange) throw new NotFoundException('换货单不存在');
      if (exchange.status === SALE_EXCHANGE_STATUS.CANCELLED || exchange.status === SALE_EXCHANGE_STATUS.COMPLETED) {
        throw new BadRequestException('当前换货单状态不允许继续发货');
      }
      if (exchange.returnStockDone === 1 || exchange.exchangeStockDone === 1) {
        throw new BadRequestException('该换货单已执行过发货动作');
      }

      const order = await this.validateSaleOrderForAfterSale(exchange.saleOrderId, manager);
      const exchangeItems = await manager.find(SaleExchangeItemEntity, { where: { exchangeId: exchange.id } });
      if (exchangeItems.length === 0) {
        throw new BadRequestException('换货草稿明细为空，不能继续处理');
      }

      const exchangeableSources = await this.buildSaleExchangeableItems(order.id, manager, exchange.id);
      const saleOrderItemSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.saleOrderItemId != null)
          .map((source) => [source.saleOrderItemId as number, source]),
      );
      const exchangeSourceMap = new Map(
        exchangeableSources
          .filter((source) => source.sourceExchangeItemId != null)
          .map((source) => [source.sourceExchangeItemId as number, source]),
      );
      const productIds = [...new Set(exchangeItems.map((item) => item.productId))];
      const products = await manager.findBy(ProductEntity, productIds.map((id) => ({ id, deletedAt: IsNull() })));
      const productMap = new Map(products.map((item) => [item.id, item]));

      const returnItems = exchangeItems.filter((item) => item.direction === 'return');
      const outItems = exchangeItems.filter((item) => item.direction === 'out');

      for (const item of returnItems) {
        if (!item.saleOrderItemId && !item.sourceExchangeItemId) {
          throw new BadRequestException('换货草稿换回明细数据异常，请重新编辑后再处理');
        }
        const source = item.sourceExchangeItemId
          ? exchangeSourceMap.get(item.sourceExchangeItemId)
          : saleOrderItemSourceMap.get(item.saleOrderItemId as number);
        if (!source) {
          throw new BadRequestException('换货草稿中存在无效换回来源商品');
        }
        if (compareQuantity(item.quantity, source.remainingQuantity) > 0) {
          throw new BadRequestException('换货换回数量不能超过当前可换回数量');
        }
      }

      for (const item of outItems) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException('换货草稿中存在无效换出商品');
        }
        await syncProductAvailableStockQty(manager, product);
        if (compareQuantity(product.availableStockQty, item.quantity) < 0) {
          throw new BadRequestException(`换出商品 ${product.name} 可售库存不足`);
        }
      }

      const returnAmount = returnItems.reduce((sum, item) => addAmount(sum, item.subtotal), 0);
      const exchangeAmount = outItems.reduce((sum, item) => addAmount(sum, item.subtotal), 0);
      const differenceAmount = subtractAmount(exchangeAmount, returnAmount);

      for (const item of returnItems) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new BadRequestException('换回商品不存在或已删除，无法回库');
        }
        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(beforeQty, item.quantity);
        if (item.batchId) {
          const returnBatch = await manager.findOne(StockBatchEntity, { where: { id: item.batchId } });
          if (returnBatch?.status === STOCK_BATCH_STATUS.SELLABLE) {
            product.availableStockQty = addQuantity(roundQuantity(product.availableStockQty), item.quantity);
          }
        }
        await manager.save(ProductEntity, product);
        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'in',
          reason: 'sale_exchange_return',
          quantity: item.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: exchange.remark ?? `销售换货换回 ${exchange.exchangeNo ?? exchange.id}`,
        }));
      }

      for (const item of outItems) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException('换出商品不存在、已删除或已停售');
        }
        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = subtractQuantity(beforeQty, item.quantity);
        product.availableStockQty = subtractQuantity(roundQuantity(product.availableStockQty), item.quantity);
        await manager.save(ProductEntity, product);
        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'out',
          reason: 'sale_exchange_out',
          quantity: item.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: exchange.remark ?? `销售换货换出 ${exchange.exchangeNo ?? exchange.id}`,
        }));
      }

      if (compareAmount(differenceAmount, 0) > 0) {
        order.totalAmount = addAmount(order.totalAmount, differenceAmount);
      } else {
        order.returnedAmount = addAmount(order.returnedAmount, subtractAmount(returnAmount, exchangeAmount));
      }

      exchange.returnAmount = returnAmount;
      exchange.exchangeAmount = exchangeAmount;
      exchange.returnStockDone = 1;
      exchange.exchangeStockDone = 1;
      exchange.status = this.recalculateExchangeStatus(exchange);
      exchange.operatorId = user.sub;
      await manager.save(SaleExchangeEntity, exchange);

      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'execute_exchange_stock',
        operatorId: user.sub,
        detail: `${order.orderNo}｜换货发货 ${exchange.exchangeNo}`,
      });

      return { success: true, exchangeId: exchange.id, status: exchange.status };
    });
  }

  async settleSaleExchangeDraft(exchangeId: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await manager.findOne(SaleExchangeEntity, { where: { id: exchangeId } });
      if (!exchange) throw new NotFoundException('换货单不存在');
      if (exchange.status === SALE_EXCHANGE_STATUS.CANCELLED || exchange.status === SALE_EXCHANGE_STATUS.COMPLETED) {
        throw new BadRequestException('当前换货单状态不允许继续结算');
      }
      if (exchange.paymentDone === 1) {
        throw new BadRequestException('该换货单已执行过退款或补差');
      }

      const order = await this.validateSaleOrderForAfterSale(exchange.saleOrderId, manager);
      const refundAmount = roundAmount(exchange.refundAmount);
      const receiveAmount = roundAmount(exchange.receiveAmount);

      if (compareAmount(refundAmount, 0) <= 0 && compareAmount(receiveAmount, 0) <= 0) {
        throw new BadRequestException('该换货单没有需要执行的退款或补差金额');
      }
      if (!exchange.method) {
        throw new BadRequestException('请先编辑换货草稿并选择结算方式');
      }
      if (compareAmount(refundAmount, 0) > 0 && compareAmount(receiveAmount, 0) > 0) {
        throw new BadRequestException('同一张换货单不能同时执行退款和补差收款');
      }
      if (compareAmount(refundAmount, order.receivedAmount) > 0) {
        throw new BadRequestException('换货退款金额不能超过该订单当前已收款金额');
      }

      if (compareAmount(refundAmount, 0) > 0) {
        order.receivedAmount = subtractAmount(order.receivedAmount, refundAmount);
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.REFUND,
          relatedType: 'sale_order',
          relatedId: order.id,
          amount: refundAmount,
          method: exchange.method,
          operatorId: user.sub,
          remark: exchange.remark ?? `销售换货退款 ${exchange.exchangeNo ?? exchange.id}`,
        }));
      }

      if (compareAmount(receiveAmount, 0) > 0) {
        order.receivedAmount = addAmount(order.receivedAmount, receiveAmount);
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.RECEIVE,
          relatedType: 'sale_order',
          relatedId: order.id,
          amount: receiveAmount,
          method: exchange.method,
          operatorId: user.sub,
          remark: exchange.remark ?? `销售换货补差 ${exchange.exchangeNo ?? exchange.id}`,
        }));
      }

      exchange.paymentDone = 1;
      exchange.status = this.recalculateExchangeStatus(exchange);
      exchange.operatorId = user.sub;
      await manager.save(SaleExchangeEntity, exchange);

      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      await this.operationLogService.createLog({
        module: 'sale',
        action: compareAmount(refundAmount, 0) > 0 ? 'execute_exchange_refund' : 'execute_exchange_receive',
        operatorId: user.sub,
        detail: `${order.orderNo}｜换货结算 ${exchange.exchangeNo}｜退款 ${refundAmount}｜补差 ${receiveAmount}`,
      });

      return { success: true, exchangeId: exchange.id, status: exchange.status };
    });
  }

  async cancelSaleExchange(exchangeId: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await manager.findOne(SaleExchangeEntity, { where: { id: exchangeId } });
      if (!exchange) throw new NotFoundException('换货单不存在');
      if (exchange.status !== SALE_EXCHANGE_STATUS.DRAFT) {
        throw new BadRequestException('只有草稿状态的换货单可以取消');
      }
      if (exchange.returnStockDone === 1 || exchange.exchangeStockDone === 1 || exchange.paymentDone === 1) {
        throw new BadRequestException('该换货单已执行库存或支付动作，不能直接取消');
      }

      const order = await manager.findOne(SaleOrderEntity, { where: { id: exchange.saleOrderId } });
      exchange.status = SALE_EXCHANGE_STATUS.CANCELLED;
      await manager.save(SaleExchangeEntity, exchange);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'cancel_exchange',
        operatorId: user.sub,
        detail: `${order?.orderNo ?? ''}｜换货取消 ${exchange.exchangeNo}`,
      });

      return { success: true, exchangeId, status: SALE_EXCHANGE_STATUS.CANCELLED };
    });
  }

  async getSaleExchangesByOrder(orderId: number) {
    const exchanges = await this.dataSource.getRepository(SaleExchangeEntity).find({
      where: { saleOrderId: orderId },
      order: { createdAt: 'DESC' },
    });
    const items = await this.dataSource.getRepository(SaleExchangeItemEntity).find({
      where: exchanges.map((e) => ({ exchangeId: e.id })),
    });
    const itemMap = new Map<number, SaleExchangeItemEntity[]>();
    for (const item of items) {
      const list = itemMap.get(item.exchangeId) ?? [];
      list.push(item);
      itemMap.set(item.exchangeId, list);
    }
    return exchanges.map((e) => ({
      ...e,
      items: itemMap.get(e.id) ?? [],
    }));
  }

  private serializeSaleOrder(saleOrder: object, user: AuthUser) {
    if (user.role === ROLE_ADMIN) {
      return saleOrder;
    }

    const sanitized = { ...saleOrder } as Record<string, unknown>;
    delete sanitized.costAmount;

    if (Array.isArray(sanitized.items)) {
      sanitized.items = sanitized.items.map((item) => {
        const nextItem = { ...(item as Record<string, unknown>) };
        delete nextItem.costPrice;
        return nextItem;
      });
    }

    return sanitized;
  }
}
