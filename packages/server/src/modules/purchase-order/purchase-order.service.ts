import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { PURCHASE_ORDER_STATUS, PAYMENT_RECORD_TYPE } from '../../common/constants/order-status';
import { getProductPackageConfig, resolveCompositeQuantity } from '../../common/utils/packaging.util';
import { addAmount, addQuantity, compareAmount, compareQuantity, multiplyAmount, roundAmount, roundQuantity, subtractAmount, subtractQuantity } from '../../common/utils/precision.util';
import { AuthUser } from '../../common/types/auth-user.type';
import { PaymentRecordEntity } from '../../entities/payment-record.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../../entities/purchase-order-item.entity';
import { PurchaseReturnItemEntity } from '../../entities/purchase-return-item.entity';
import { PurchaseReturnEntity } from '../../entities/purchase-return.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { OperationLogService } from '../system/operation-log.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { QuickCompletePurchaseOrderDto } from './dto/quick-complete-purchase-order.dto';
import { StockInPurchaseOrderDto } from './dto/stock-in-purchase-order.dto';

@Injectable()
export class PurchaseOrderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
  ) {}

  private recalculateStatus(
    purchaseOrder: Pick<PurchaseOrderEntity, 'paidAmount' | 'returnedAmount' | 'totalAmount' | 'status'>,
  ) {
    const effectiveTotal = Math.max(subtractAmount(purchaseOrder.totalAmount, purchaseOrder.returnedAmount), 0);
    const isStocked =
      purchaseOrder.status === PURCHASE_ORDER_STATUS.STOCKED ||
      purchaseOrder.status === PURCHASE_ORDER_STATUS.DONE ||
      purchaseOrder.status === PURCHASE_ORDER_STATUS.RETURNED;

    if (compareAmount(purchaseOrder.returnedAmount, purchaseOrder.totalAmount) >= 0 && compareAmount(purchaseOrder.totalAmount, 0) > 0) {
      return PURCHASE_ORDER_STATUS.RETURNED;
    }

    if (isStocked && compareAmount(purchaseOrder.paidAmount, effectiveTotal) >= 0) {
      return PURCHASE_ORDER_STATUS.DONE;
    }

    if (isStocked) {
      return PURCHASE_ORDER_STATUS.STOCKED;
    }

    return PURCHASE_ORDER_STATUS.DRAFT;
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

  private async getReturnedQuantityMap(orderId: number, manager: EntityManager) {
    const rows = await manager
      .createQueryBuilder(PurchaseReturnItemEntity, 'purchaseReturnItem')
      .innerJoin(PurchaseReturnEntity, 'purchaseReturn', 'purchaseReturn.id = purchaseReturnItem.return_id')
      .select('purchaseReturnItem.purchase_order_item_id', 'purchaseOrderItemId')
      .addSelect('SUM(purchaseReturnItem.quantity)', 'returnedQuantity')
      .where('purchaseReturn.purchase_order_id = :orderId', { orderId })
      .groupBy('purchaseReturnItem.purchase_order_item_id')
      .getRawMany<{ purchaseOrderItemId: number; returnedQuantity: string }>();

    return new Map(rows.map((row) => [Number(row.purchaseOrderItemId), roundQuantity(row.returnedQuantity)]));
  }

  private async buildPurchaseOrderDetail(order: PurchaseOrderEntity, manager: EntityManager) {
    const items = await manager
      .createQueryBuilder(PurchaseOrderItemEntity, 'item')
      .leftJoin(ProductEntity, 'product', 'product.id = item.product_id')
      .select([
        'item.id AS id',
        'item.order_id AS orderId',
        'item.product_id AS productId',
        'product.name AS productName',
        'item.quantity AS quantity',
        'item.package_qty AS packageQty',
        'item.loose_qty AS looseQty',
        'item.package_unit AS packageUnit',
        'item.package_size AS packageSize',
        'product.unit AS unit',
        'item.unit_price AS unitPrice',
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

    const purchaseReturns = await manager.find(PurchaseReturnEntity, {
      where: { purchaseOrderId: order.id },
      order: { id: 'DESC' },
    });

    const returnIds = purchaseReturns.map((item) => item.id);
    const returnItems = returnIds.length
      ? await manager
          .createQueryBuilder(PurchaseReturnItemEntity, 'purchaseReturnItem')
          .leftJoin(ProductEntity, 'product', 'product.id = purchaseReturnItem.product_id')
          .select([
            'purchaseReturnItem.id AS id',
            'purchaseReturnItem.return_id AS returnId',
            'purchaseReturnItem.purchase_order_item_id AS purchaseOrderItemId',
            'purchaseReturnItem.product_id AS productId',
            'product.name AS productName',
            'purchaseReturnItem.quantity AS quantity',
            'purchaseReturnItem.package_qty AS packageQty',
            'purchaseReturnItem.loose_qty AS looseQty',
            'purchaseReturnItem.package_unit AS packageUnit',
            'purchaseReturnItem.package_size AS packageSize',
            'product.unit AS unit',
            'purchaseReturnItem.unit_price AS unitPrice',
            'purchaseReturnItem.subtotal AS subtotal',
          ])
          .where('purchaseReturnItem.return_id IN (:...returnIds)', { returnIds })
          .orderBy('purchaseReturnItem.id', 'ASC')
          .getRawMany<Record<string, unknown>>()
      : [];

    const returnItemsMap = new Map<number, Record<string, unknown>[]>();
    for (const item of returnItems) {
      const returnId = Number(item.returnId);
      returnItemsMap.set(returnId, [...(returnItemsMap.get(returnId) ?? []), item]);
    }

    return {
      ...order,
      items: detailItems,
      returns: purchaseReturns.map((item) => ({
        ...item,
        items: returnItemsMap.get(item.id) ?? [],
      })),
    };
  }

  async getPurchaseOrders(query: PurchaseOrderQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.dataSource
      .getRepository(PurchaseOrderEntity)
      .createQueryBuilder('purchaseOrder')
      .leftJoin(SupplierEntity, 'supplier', 'supplier.id = purchaseOrder.supplier_id')
      .select([
        'purchaseOrder.id AS id',
        'purchaseOrder.order_no AS orderNo',
        'purchaseOrder.supplier_id AS supplierId',
        'supplier.name AS supplierName',
        'purchaseOrder.total_amount AS totalAmount',
        'purchaseOrder.paid_amount AS paidAmount',
        'purchaseOrder.returned_amount AS returnedAmount',
        'purchaseOrder.status AS status',
        'purchaseOrder.remark AS remark',
        'purchaseOrder.created_at AS createdAt',
      ]);

    if (query.supplierId) {
      qb.andWhere('purchaseOrder.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }

    if (query.status) {
      qb.andWhere('purchaseOrder.status = :status', { status: query.status });
    }

    if (query.keyword) {
      qb.andWhere(
        '(purchaseOrder.order_no LIKE :kw OR supplier.name LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    if (query.dateFrom) {
      qb.andWhere('DATE(purchaseOrder.created_at) >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('DATE(purchaseOrder.created_at) <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('purchaseOrder.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);

    return { list, total, page, pageSize };
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      if (dto.supplierId) {
        const supplier = await manager.findOne(SupplierEntity, {
          where: { id: dto.supplierId },
        });
        if (!supplier) {
          throw new BadRequestException('供应商不存在');
        }
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((id) => ({ id, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) {
        throw new BadRequestException('采购商品中存在无效商品');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const totalAmount = dto.items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException('采购商品不存在、已删除或已停售');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        return addAmount(sum, multiplyAmount(normalized.quantity, item.unitPrice));
      }, 0);

      let purchaseOrder = manager.create(PurchaseOrderEntity, {
        supplierId: dto.supplierId ?? null,
        totalAmount,
        paidAmount: 0,
        returnedAmount: 0,
        status: PURCHASE_ORDER_STATUS.DRAFT,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });

      purchaseOrder = await manager.save(PurchaseOrderEntity, purchaseOrder);
      purchaseOrder.orderNo = this.generateOrderNo('CG', purchaseOrder.id);
      purchaseOrder = await manager.save(PurchaseOrderEntity, purchaseOrder);

      const orderItems = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException('采购商品不存在、已删除或已停售');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);

        return manager.create(PurchaseOrderItemEntity, {
          orderId: purchaseOrder.id,
          productId: item.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
           subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        });
      });

      await manager.save(PurchaseOrderItemEntity, orderItems);

      const detail = await this.buildPurchaseOrderDetail(purchaseOrder, manager);
      await this.operationLogService.createLog({
        module: 'purchase',
        action: 'create_order',
        operatorId: user.sub,
        detail: `${purchaseOrder.orderNo}｜金额 ${purchaseOrder.totalAmount}`,
      });
      return detail;
    });
  }

  async stockInPurchaseOrder(id: number, dto: StockInPurchaseOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const purchaseOrder = await manager.findOne(PurchaseOrderEntity, { where: { id } });
      if (!purchaseOrder) {
        throw new NotFoundException('采购订单不存在');
      }

      if (purchaseOrder.status !== PURCHASE_ORDER_STATUS.DRAFT) {
        throw new BadRequestException('只有草稿状态的采购订单可以入库');
      }

      const orderItems = await manager.find(PurchaseOrderItemEntity, {
        where: { orderId: id },
      });
      if (orderItems.length === 0) {
        throw new BadRequestException('采购订单明细为空，无法入库');
      }

      for (const item of orderItems) {
        const product = await manager.findOne(ProductEntity, {
          where: { id: item.productId, deletedAt: IsNull() },
        });
        if (!product || product.status !== 1) {
          throw new BadRequestException(`商品 ${item.productId} 不存在、已删除或已停售`);
        }

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(beforeQty, item.quantity);
        await manager.save(ProductEntity, product);

        const record = manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'in',
          reason: 'purchase',
          quantity: item.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: purchaseOrder.id,
          operatorId: user.sub,
          remark: dto.remark ?? purchaseOrder.remark ?? null,
        });

        await manager.save(StockRecordEntity, record);
      }

      purchaseOrder.status = this.recalculateStatus({
        paidAmount: purchaseOrder.paidAmount,
        returnedAmount: purchaseOrder.returnedAmount,
        totalAmount: purchaseOrder.totalAmount,
        status: PURCHASE_ORDER_STATUS.STOCKED,
      });
      purchaseOrder.operatorId = user.sub;
      await manager.save(PurchaseOrderEntity, purchaseOrder);

      await this.operationLogService.createLog({
        module: 'purchase',
        action: 'stock_in_order',
        operatorId: user.sub,
        detail: `${purchaseOrder.orderNo}｜状态 ${purchaseOrder.status}`,
      });

      return { success: true, id: purchaseOrder.id, status: purchaseOrder.status };
    });
  }

  async getPurchaseOrderById(id: number) {
    const order = await this.dataSource.getRepository(PurchaseOrderEntity).findOne({ where: { id } });
    if (!order) throw new NotFoundException('采购订单不存在');
    return this.buildPurchaseOrderDetail(order, this.dataSource.manager);
  }

  async updatePurchaseOrder(id: number, dto: CreatePurchaseOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PurchaseOrderEntity, { where: { id } });
      if (!order) throw new NotFoundException('采购订单不存在');
      if (order.status !== PURCHASE_ORDER_STATUS.DRAFT) throw new BadRequestException('只有草稿状态的订单可以编辑');
      if (order.paidAmount > 0) {
        throw new BadRequestException('已付款的采购订单不能编辑，请完成入库或先处理退款');
      }

      if (dto.supplierId) {
        const supplier = await manager.findOne(SupplierEntity, { where: { id: dto.supplierId } });
        if (!supplier) throw new BadRequestException('供应商不存在');
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((pid) => ({ id: pid, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) throw new BadRequestException('采购商品中存在无效商品');

      const productMap = new Map(products.map((item) => [item.id, item]));
      const totalAmount = dto.items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) throw new BadRequestException('采购商品不存在、已删除或已停售');
        const normalized = this.normalizeLineItemQuantity(product, item);
        return addAmount(sum, multiplyAmount(normalized.quantity, item.unitPrice));
      }, 0);

      await manager.delete(PurchaseOrderItemEntity, { orderId: id });

      order.supplierId = dto.supplierId ?? null;
      order.totalAmount = totalAmount;
      order.remark = dto.remark ?? null;
      order.operatorId = user.sub;
      await manager.save(PurchaseOrderEntity, order);

      const orderItems = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) throw new BadRequestException('采购商品不存在、已删除或已停售');
        const normalized = this.normalizeLineItemQuantity(product, item);
        return manager.create(PurchaseOrderItemEntity, {
          orderId: id,
          productId: item.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
        });
      });
      await manager.save(PurchaseOrderItemEntity, orderItems);

      const detail = await this.buildPurchaseOrderDetail(order, manager);
      await this.operationLogService.createLog({
        module: 'purchase',
        action: 'update_order',
        operatorId: user.sub,
        detail: `${order.orderNo}｜金额 ${order.totalAmount}`,
      });
      return detail;
    });
  }

  async createPurchaseReturn(id: number, dto: CreatePurchaseReturnDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PurchaseOrderEntity, { where: { id } });
      if (!order) throw new NotFoundException('采购订单不存在');
      if (
        order.status !== PURCHASE_ORDER_STATUS.STOCKED &&
        order.status !== PURCHASE_ORDER_STATUS.DONE &&
        order.status !== PURCHASE_ORDER_STATUS.RETURNED
      ) {
        throw new BadRequestException('只有已入库的采购订单才能办理退货');
      }

      const orderItems = await manager.find(PurchaseOrderItemEntity, { where: { orderId: id } });
      if (orderItems.length === 0) {
        throw new BadRequestException('采购订单明细为空，无法退货');
      }

      const requestedQuantityMap = new Map<number, number>();
      const requestedDisplayMap = new Map<number, ReturnType<PurchaseOrderService['normalizeLineItemQuantity']>>();
      for (const item of dto.items) {
        const orderItem = orderItems.find((orderLine) => orderLine.id === item.purchaseOrderItemId);
        if (!orderItem) {
          throw new BadRequestException('退货明细中存在无效的原采购商品');
        }
        const product = await manager.findOne(ProductEntity, { where: { id: orderItem.productId, deletedAt: IsNull() } });
        if (!product) {
          throw new BadRequestException('退货商品不存在或已删除，无法回退库存');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        requestedQuantityMap.set(
          item.purchaseOrderItemId,
          addQuantity(requestedQuantityMap.get(item.purchaseOrderItemId) ?? 0, normalized.quantity),
        );
        requestedDisplayMap.set(item.purchaseOrderItemId, normalized);
      }

      const returnedQuantityMap = await this.getReturnedQuantityMap(id, manager);
      const orderItemMap = new Map(orderItems.map((item) => [item.id, item]));
      let totalAmount = 0;

      for (const [purchaseOrderItemId, quantity] of requestedQuantityMap) {
        const orderItem = orderItemMap.get(purchaseOrderItemId);
        if (!orderItem) {
          throw new BadRequestException('退货明细中存在无效的原采购商品');
        }

        const returnedQuantity = returnedQuantityMap.get(purchaseOrderItemId) ?? 0;
        const remainingQuantity = subtractQuantity(orderItem.quantity, returnedQuantity);
        if (compareQuantity(quantity, remainingQuantity) > 0) {
          throw new BadRequestException('退货数量不能超过原采购单的剩余可退数量');
        }

        totalAmount = addAmount(totalAmount, multiplyAmount(quantity, orderItem.unitPrice));
      }

      const refundAmount = roundAmount(dto.refundAmount ?? 0);
      if (compareAmount(refundAmount, totalAmount) > 0) {
        throw new BadRequestException('供应商退款金额不能超过本次退货金额');
      }
      if (compareAmount(refundAmount, order.paidAmount) > 0) {
        throw new BadRequestException('供应商退款金额不能超过该订单当前已付款金额');
      }

      let purchaseReturn = manager.create(PurchaseReturnEntity, {
        purchaseOrderId: id,
        totalAmount,
        refundAmount,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      purchaseReturn = await manager.save(PurchaseReturnEntity, purchaseReturn);
      purchaseReturn.returnNo = this.generateOrderNo('CT', purchaseReturn.id);
      purchaseReturn = await manager.save(PurchaseReturnEntity, purchaseReturn);

      const returnItems: PurchaseReturnItemEntity[] = [];
      for (const [purchaseOrderItemId, quantity] of requestedQuantityMap) {
        const orderItem = orderItemMap.get(purchaseOrderItemId)!;
        const product = await manager.findOne(ProductEntity, {
          where: { id: orderItem.productId, deletedAt: IsNull() },
        });
        if (!product) {
          throw new BadRequestException('退货商品不存在或已删除，无法回退库存');
        }
        if (compareQuantity(product.stockQty, quantity) < 0) {
          throw new BadRequestException(`商品 ${product.name} 当前库存不足，无法退回供应商`);
        }

        const returnItem = manager.create(PurchaseReturnItemEntity, {
          returnId: purchaseReturn.id,
          purchaseOrderItemId,
          productId: orderItem.productId,
          quantity,
          packageQty: requestedDisplayMap.get(purchaseOrderItemId)?.packageQty ?? null,
          looseQty: requestedDisplayMap.get(purchaseOrderItemId)?.looseQty ?? quantity,
          packageUnit: requestedDisplayMap.get(purchaseOrderItemId)?.packageUnit ?? orderItem.packageUnit,
          packageSize: requestedDisplayMap.get(purchaseOrderItemId)?.packageSize ?? orderItem.packageSize,
          unitPrice: orderItem.unitPrice,
          subtotal: multiplyAmount(quantity, orderItem.unitPrice),
        });
        returnItems.push(returnItem);

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = subtractQuantity(beforeQty, quantity);
        await manager.save(ProductEntity, product);

        const stockRecord = manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'out',
          reason: 'purchase_return',
          quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: dto.remark ?? `采购退货 ${purchaseReturn.returnNo ?? purchaseReturn.id}`,
        });
        await manager.save(StockRecordEntity, stockRecord);
      }

      await manager.save(PurchaseReturnItemEntity, returnItems);

      order.returnedAmount = addAmount(order.returnedAmount, totalAmount);
      if (compareAmount(refundAmount, 0) > 0) {
        order.paidAmount = subtractAmount(order.paidAmount, refundAmount);
        const refundRecord = manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.SUPPLIER_REFUND,
          relatedType: 'purchase_order',
          relatedId: order.id,
          amount: refundAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? `采购退货退款 ${purchaseReturn.returnNo ?? purchaseReturn.id}`,
        });
        await manager.save(PaymentRecordEntity, refundRecord);
      }

      order.status = this.recalculateStatus({
        paidAmount: order.paidAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(PurchaseOrderEntity, order);

      const detail = await this.buildPurchaseOrderDetail(order, manager);
      await this.operationLogService.createLog({
        module: 'purchase',
        action: refundAmount > 0 ? 'create_return_with_refund' : 'create_return',
        operatorId: user.sub,
        detail: `${order.orderNo}｜退货 ${totalAmount}｜退款 ${refundAmount}`,
      });
      return detail;
    });
  }

  async deletePurchaseOrder(id: number, user: AuthUser) {
    const order = await this.dataSource.getRepository(PurchaseOrderEntity).findOne({ where: { id } });
    if (!order) throw new NotFoundException('采购订单不存在');
    if (order.status !== PURCHASE_ORDER_STATUS.DRAFT) {
      throw new BadRequestException('只有草稿状态的订单可以删除');
    }
    if (order.paidAmount > 0) {
      throw new BadRequestException('采购订单已有付款记录，不能直接删除，请先处理退款');
    }
    await this.dataSource.getRepository(PurchaseOrderItemEntity).delete({ orderId: id });
    await this.dataSource.getRepository(PurchaseOrderEntity).delete(id);
    await this.operationLogService.createLog({
      module: 'purchase',
      action: 'delete_order',
      operatorId: user.sub,
      detail: `${order.orderNo}`,
    });
    return { success: true };
  }

  async quickCompletePurchaseOrder(dto: QuickCompletePurchaseOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      if (dto.supplierId) {
        const supplier = await manager.findOne(SupplierEntity, {
          where: { id: dto.supplierId },
        });
        if (!supplier) {
          throw new BadRequestException('供应商不存在');
        }
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await manager.findBy(
        ProductEntity,
        productIds.map((id) => ({ id, deletedAt: IsNull() })),
      );
      if (products.length !== productIds.length) {
        throw new BadRequestException('采购商品中存在无效商品');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      let totalAmount = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException('采购商品不存在、已删除或已停售');
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        totalAmount = addAmount(totalAmount, multiplyAmount(normalized.quantity, item.unitPrice));
      }

      const paidAmount = roundAmount(dto.paidAmount);
      if (compareAmount(paidAmount, totalAmount) > 0) {
        throw new BadRequestException('付款金额不能超过采购订单应付总额');
      }

      let purchaseOrder = manager.create(PurchaseOrderEntity, {
        supplierId: dto.supplierId ?? null,
        totalAmount,
        paidAmount,
        returnedAmount: 0,
        status: PURCHASE_ORDER_STATUS.STOCKED,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      purchaseOrder = await manager.save(PurchaseOrderEntity, purchaseOrder);
      purchaseOrder.orderNo = this.generateOrderNo('CG', purchaseOrder.id);
      purchaseOrder = await manager.save(PurchaseOrderEntity, purchaseOrder);

      const orderItems = [];
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const normalized = this.normalizeLineItemQuantity(product, item);
        orderItems.push(manager.create(PurchaseOrderItemEntity, {
          orderId: purchaseOrder.id,
          productId: item.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
           subtotal: multiplyAmount(normalized.quantity, item.unitPrice),
         }));

        const beforeQty = roundQuantity(product.stockQty);
        product.stockQty = addQuantity(beforeQty, normalized.quantity);
        await manager.save(ProductEntity, product);

        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'in',
          reason: 'purchase',
          quantity: normalized.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: purchaseOrder.id,
          operatorId: user.sub,
          remark: dto.remark ?? null,
        }));
      }
      await manager.save(PurchaseOrderItemEntity, orderItems);

      if (compareAmount(paidAmount, 0) > 0) {
        await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
          type: PAYMENT_RECORD_TYPE.PAY,
          relatedType: 'purchase_order',
          relatedId: purchaseOrder.id,
          amount: paidAmount,
          method: dto.method ?? null,
          operatorId: user.sub,
          remark: dto.remark ?? null,
        }));
      }

      purchaseOrder.status = this.recalculateStatus({
        paidAmount,
        returnedAmount: 0,
        totalAmount,
        status: PURCHASE_ORDER_STATUS.STOCKED,
      });
      await manager.save(PurchaseOrderEntity, purchaseOrder);

      await this.operationLogService.createLog({
        module: 'purchase',
        action: 'quick_complete',
        operatorId: user.sub,
        detail: `${purchaseOrder.orderNo}｜金额 ${totalAmount}｜付款 ${paidAmount}`,
      });

      return this.buildPurchaseOrderDetail(purchaseOrder, manager);
    });
  }
}
