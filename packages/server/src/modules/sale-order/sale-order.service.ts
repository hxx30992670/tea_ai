import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { PAYMENT_RECORD_TYPE, SALE_ORDER_STATUS } from '../../common/constants/order-status';
import { ROLE_ADMIN } from '../../common/constants/roles';
import { getProductPackageConfig, resolveCompositeQuantity } from '../../common/utils/packaging.util';
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
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { OperationLogService } from '../system/operation-log.service';
import { CreateSaleExchangeDto } from './dto/create-sale-exchange.dto';
import { CreateSaleOrderDto } from './dto/create-sale-order.dto';
import { QuickCompleteSaleOrderDto } from './dto/quick-complete-sale-order.dto';
import { CreateSaleRefundDto } from './dto/create-sale-refund.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleOrderQueryDto } from './dto/sale-order-query.dto';

@Injectable()
export class SaleOrderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
  ) {}

  private recalculateStatus(
    order: Pick<SaleOrderEntity, 'receivedAmount' | 'returnedAmount' | 'totalAmount' | 'status'>,
  ) {
    const effectiveTotal = Math.max(order.totalAmount - order.returnedAmount, 0);
    const isShipped =
      order.status === SALE_ORDER_STATUS.SHIPPED ||
      order.status === SALE_ORDER_STATUS.DONE ||
      order.status === SALE_ORDER_STATUS.RETURNED;

    if (order.returnedAmount >= order.totalAmount && order.totalAmount > 0) {
      return SALE_ORDER_STATUS.RETURNED;
    }

    if (isShipped && order.receivedAmount >= effectiveTotal) {
      return SALE_ORDER_STATUS.DONE;
    }

    if (isShipped) {
      return SALE_ORDER_STATUS.SHIPPED;
    }

    return SALE_ORDER_STATUS.DRAFT;
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
      .createQueryBuilder(SaleReturnItemEntity, 'saleReturnItem')
      .innerJoin(SaleReturnEntity, 'saleReturn', 'saleReturn.id = saleReturnItem.return_id')
      .select('saleReturnItem.sale_order_item_id', 'saleOrderItemId')
      .addSelect('SUM(saleReturnItem.quantity)', 'returnedQuantity')
      .where('saleReturn.sale_order_id = :orderId', { orderId })
      .groupBy('saleReturnItem.sale_order_item_id')
      .getRawMany<{ saleOrderItemId: number; returnedQuantity: string }>();

    const exchangeRows = await manager
      .createQueryBuilder(SaleExchangeItemEntity, 'saleExchangeItem')
      .innerJoin(SaleExchangeEntity, 'saleExchange', 'saleExchange.id = saleExchangeItem.exchange_id')
      .select('saleExchangeItem.sale_order_item_id', 'saleOrderItemId')
      .addSelect('SUM(saleExchangeItem.quantity)', 'returnedQuantity')
      .where('saleExchange.sale_order_id = :orderId', { orderId })
      .andWhere("saleExchangeItem.direction = 'return'")
      .groupBy('saleExchangeItem.sale_order_item_id')
      .getRawMany<{ saleOrderItemId: number; returnedQuantity: string }>();

    const quantityMap = new Map<number, number>();
    for (const row of [...rows, ...exchangeRows]) {
      const itemId = Number(row.saleOrderItemId);
      quantityMap.set(itemId, (quantityMap.get(itemId) ?? 0) + Number(row.returnedQuantity));
    }

    return quantityMap;
  }

  private async buildSaleOrderDetail(order: SaleOrderEntity, user: AuthUser, manager: EntityManager) {
    const items = await manager
      .createQueryBuilder(SaleOrderItemEntity, 'item')
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
        'item.cost_price AS costPrice',
        'item.subtotal AS subtotal',
      ])
      .where('item.order_id = :orderId', { orderId: order.id })
      .getRawMany<Record<string, unknown>>();

    const returnedQuantityMap = await this.getReturnedQuantityMap(order.id, manager);
    const detailItems = items.map((item) => {
      const returnedQuantity = returnedQuantityMap.get(Number(item.id)) ?? 0;
      const quantity = Number(item.quantity);

      return {
        ...item,
        returnedQuantity,
        remainingQuantity: quantity - returnedQuantity,
      };
    });

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
          .select([
            'saleExchangeItem.id AS id',
            'saleExchangeItem.exchange_id AS exchangeId',
            'saleExchangeItem.direction AS direction',
            'saleExchangeItem.sale_order_item_id AS saleOrderItemId',
            'saleExchangeItem.product_id AS productId',
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
        items: detailItems,
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

    qb.orderBy('saleOrder.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);

    return {
      list: list.map((order) => this.serializeSaleOrder(order, user)),
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
        totalAmount += normalized.quantity * item.unitPrice;
        costAmount += normalized.quantity * product.costPrice;
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
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
          subtotal: normalized.quantity * item.unitPrice,
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
        totalAmount += normalized.quantity * item.unitPrice;
        costAmount += normalized.quantity * product.costPrice;
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
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
          subtotal: normalized.quantity * item.unitPrice,
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
        if (product.stockQty < item.quantity) {
          throw new BadRequestException(`商品 ${product.name} 库存不足`);
        }

        const beforeQty = product.stockQty;
        product.stockQty -= item.quantity;
        await manager.save(ProductEntity, product);

        const stockRecord = manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'out',
          reason: 'sale',
          quantity: item.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: order.id,
          operatorId: user.sub,
          remark: remark ?? order.remark ?? null,
        });

        await manager.save(StockRecordEntity, stockRecord);
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
        if (product.stockQty < normalized.quantity) throw new BadRequestException(`商品 ${product.name} 库存不足`);
        totalAmount += normalized.quantity * item.unitPrice;
        costAmount += normalized.quantity * product.costPrice;
      }

      // 3. 创建订单（直接 shipped 状态）
      let saleOrder = manager.create(SaleOrderEntity, {
        customerId: dto.customerId ?? null,
        totalAmount,
        costAmount,
        receivedAmount: dto.paidAmount,
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
        orderItems.push(manager.create(SaleOrderItemEntity, {
          orderId: saleOrder.id,
          productId: item.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: item.unitPrice,
          costPrice: product.costPrice,
          subtotal: normalized.quantity * item.unitPrice,
        }));

        const beforeQty = product.stockQty;
        product.stockQty -= normalized.quantity;
        await manager.save(ProductEntity, product);

        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
          type: 'out',
          reason: 'sale',
          quantity: normalized.quantity,
          beforeQty,
          afterQty: product.stockQty,
          relatedOrderId: saleOrder.id,
          operatorId: user.sub,
          remark: dto.remark ?? null,
        }));
      }
      await manager.save(SaleOrderItemEntity, orderItems);

      // 5. 写收款记录
      await manager.save(PaymentRecordEntity, manager.create(PaymentRecordEntity, {
        type: PAYMENT_RECORD_TYPE.RECEIVE,
        relatedType: 'sale_order',
        relatedId: saleOrder.id,
        amount: dto.paidAmount,
        method: dto.method ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      }));

      // 6. 重算最终状态（可能直接变 done）
      saleOrder.status = this.recalculateStatus({
        receivedAmount: dto.paidAmount,
        returnedAmount: 0,
        totalAmount,
        status: SALE_ORDER_STATUS.SHIPPED,
      });
      await manager.save(SaleOrderEntity, saleOrder);

      await this.operationLogService.createLog({
        module: 'sale',
        action: 'quick_complete',
        operatorId: user.sub,
        detail: `${saleOrder.orderNo}｜金额 ${totalAmount}｜收款 ${dto.paidAmount}`,
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
          (requestedQuantityMap.get(item.saleOrderItemId) ?? 0) + normalized.quantity,
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
        const remainingQuantity = orderItem.quantity - returnedQuantity;
        if (quantity > remainingQuantity) {
          throw new BadRequestException('退货数量不能超过原销售单的剩余可退数量');
        }

        totalAmount += quantity * orderItem.unitPrice;
      }

      const refundAmount = dto.refundAmount ?? 0;
      if (refundAmount > totalAmount) {
        throw new BadRequestException('退款金额不能超过本次退货金额');
      }
      if (refundAmount > order.receivedAmount) {
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
          subtotal: quantity * orderItem.unitPrice,
        });
        returnItems.push(returnItem);

        const beforeQty = product.stockQty;
        product.stockQty += quantity;
        await manager.save(ProductEntity, product);

        const stockRecord = manager.create(StockRecordEntity, {
          productId: product.id,
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

      order.returnedAmount += totalAmount;
      if (refundAmount > 0) {
        order.receivedAmount -= refundAmount;
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
      if (dto.amount > order.receivedAmount) {
        throw new BadRequestException('退款金额不能超过该订单当前已收款金额');
      }

      let saleRefund = manager.create(SaleRefundEntity, {
        saleOrderId: id,
        amount: dto.amount,
        method: dto.method ?? null,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      saleRefund = await manager.save(SaleRefundEntity, saleRefund);
      saleRefund.refundNo = this.generateOrderNo('TF', saleRefund.id);
      saleRefund = await manager.save(SaleRefundEntity, saleRefund);

      order.receivedAmount -= dto.amount;
      order.status = this.recalculateStatus({
        receivedAmount: order.receivedAmount,
        returnedAmount: order.returnedAmount,
        totalAmount: order.totalAmount,
        status: order.status,
      });
      order.operatorId = user.sub;
      await manager.save(SaleOrderEntity, order);

      const refundRecord = manager.create(PaymentRecordEntity, {
        type: PAYMENT_RECORD_TYPE.REFUND,
        relatedType: 'sale_order',
        relatedId: order.id,
        amount: dto.amount,
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
        detail: `${order.orderNo}｜退款 ${dto.amount}`,
      });
      return detail;
    });
  }

  async createSaleExchange(id: number, dto: CreateSaleExchangeDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.validateSaleOrderForAfterSale(id, manager);
      const orderItems = await manager.find(SaleOrderItemEntity, { where: { orderId: id } });
      const orderItemMap = new Map(orderItems.map((item) => [item.id, item]));
      const returnedQuantityMap = await this.getReturnedQuantityMap(id, manager);
      const productMap = new Map<number, ProductEntity>();

      const ensureProductLoaded = async (productId: number) => {
        if (productMap.has(productId)) {
          return productMap.get(productId)!;
        }
        const product = await manager.findOne(ProductEntity, {
          where: { id: productId, deletedAt: IsNull() },
        });
        if (!product) {
          throw new BadRequestException('商品不存在、已删除或已停售');
        }
        productMap.set(productId, product);
        return product;
      };

      const normalizedReturnItemMap = new Map<number, ReturnType<SaleOrderService['normalizeLineItemQuantity']>>();

      let returnAmount = 0;
      for (const item of dto.returnItems) {
        const orderItem = orderItemMap.get(item.saleOrderItemId);
        if (!orderItem) {
          throw new BadRequestException('换货换回明细中存在无效的原销售商品');
        }
        const product = await ensureProductLoaded(orderItem.productId);
        const normalized = this.normalizeLineItemQuantity(product, item);
        normalizedReturnItemMap.set(item.saleOrderItemId, normalized);
        const returnedQty = returnedQuantityMap.get(item.saleOrderItemId) ?? 0;
        const remainingQty = orderItem.quantity - returnedQty;
        if (normalized.quantity > remainingQty) {
          throw new BadRequestException('换货换回数量不能超过原销售单剩余可退数量');
        }
        returnAmount += normalized.quantity * orderItem.unitPrice;
      }

      let exchangeAmount = 0;
      const normalizedExchangeOutItems: Array<ReturnType<SaleOrderService['normalizeLineItemQuantity']> & { productId: number; unitPrice: number }> = [];
      for (const item of dto.exchangeItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }
        const normalized = this.normalizeLineItemQuantity(product, item);
        if (product.stockQty < normalized.quantity) {
          throw new BadRequestException(`换出商品 ${product.name} 库存不足`);
        }
        exchangeAmount += normalized.quantity * item.unitPrice;
        normalizedExchangeOutItems.push({ ...normalized, productId: item.productId, unitPrice: item.unitPrice });
      }

      const differenceAmount = exchangeAmount - returnAmount;
      const maxRefundAmount = Math.max(returnAmount - exchangeAmount, 0);
      const refundAmount = dto.refundAmount ?? 0;
      if (refundAmount > maxRefundAmount) {
        throw new BadRequestException('换货退款金额不能超过本次换货差额');
      }
      if (refundAmount > order.receivedAmount) {
        throw new BadRequestException('换货退款金额不能超过该订单当前已收款金额');
      }

      const maxReceiveAmount = Math.max(differenceAmount, 0);
      const receiveAmount = dto.receiveAmount ?? 0;
      if (receiveAmount > maxReceiveAmount) {
        throw new BadRequestException('换货补差收款金额不能超过本次换货应补差额');
      }

      let saleExchange = manager.create(SaleExchangeEntity, {
        saleOrderId: id,
        returnAmount,
        exchangeAmount,
        refundAmount,
        receiveAmount,
        reasonCode: dto.reasonCode ?? null,
        reasonNote: dto.reasonNote ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });
      saleExchange = await manager.save(SaleExchangeEntity, saleExchange);
      saleExchange.exchangeNo = this.generateOrderNo('HH', saleExchange.id);
      saleExchange = await manager.save(SaleExchangeEntity, saleExchange);

      const exchangeItems: SaleExchangeItemEntity[] = [];
      for (const item of dto.returnItems) {
        const orderItem = orderItemMap.get(item.saleOrderItemId)!;
        const product = await ensureProductLoaded(orderItem.productId);
        if (!product) {
          throw new BadRequestException('换回商品不存在或已删除，无法回库');
        }
        const normalized = normalizedReturnItemMap.get(item.saleOrderItemId)!;
        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'return',
          saleOrderItemId: orderItem.id,
          productId: orderItem.productId,
          quantity: normalized.quantity,
          packageQty: normalized.packageQty,
          looseQty: normalized.looseQty,
          packageUnit: normalized.packageUnit,
          packageSize: normalized.packageSize,
          unitPrice: orderItem.unitPrice,
          subtotal: normalized.quantity * orderItem.unitPrice,
        }));

        const beforeQty = product.stockQty;
        product.stockQty += normalized.quantity;
        await manager.save(ProductEntity, product);
        await manager.save(StockRecordEntity, manager.create(StockRecordEntity, {
          productId: product.id,
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

      for (const item of normalizedExchangeOutItems) {
        const product = await ensureProductLoaded(item.productId);
        if (!product || product.status !== 1) {
          throw new BadRequestException(`换出商品 ${item.productId} 不存在、已删除或已停售`);
        }
        exchangeItems.push(manager.create(SaleExchangeItemEntity, {
          exchangeId: saleExchange.id,
          direction: 'out',
          saleOrderItemId: null,
          productId: item.productId,
          quantity: item.quantity,
          packageQty: item.packageQty,
          looseQty: item.looseQty,
          packageUnit: item.packageUnit,
          packageSize: item.packageSize,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
        }));

        const beforeQty = product.stockQty;
        product.stockQty -= item.quantity;
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
          remark: dto.remark ?? `销售换货换出 ${saleExchange.exchangeNo ?? saleExchange.id}`,
        }));
      }
      await manager.save(SaleExchangeItemEntity, exchangeItems);

      if (differenceAmount > 0) {
        order.totalAmount += differenceAmount;
      } else {
        order.returnedAmount += returnAmount - exchangeAmount;
      }

      if (refundAmount > 0) {
        order.receivedAmount -= refundAmount;
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
      if (receiveAmount > 0) {
        order.receivedAmount += receiveAmount;
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
