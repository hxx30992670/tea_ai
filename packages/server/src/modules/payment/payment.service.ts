import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PAYMENT_RECORD_TYPE,
  PURCHASE_ORDER_STATUS,
  SALE_ORDER_STATUS,
} from '../../common/constants/order-status';
import { AuthUser } from '../../common/types/auth-user.type';
import { CustomerEntity } from '../../entities/customer.entity';
import { PaymentRecordEntity } from '../../entities/payment-record.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SaleOrderEntity } from '../../entities/sale-order.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { addAmount, compareAmount, roundAmount, subtractAmount } from '../../common/utils/precision.util';
import { OperationLogService } from '../system/operation-log.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
  ) {}

  private recalculatePurchaseOrderStatus(
    order: Pick<PurchaseOrderEntity, 'paidAmount' | 'returnedAmount' | 'totalAmount' | 'status'>,
  ) {
    const effectiveTotal = Math.max(subtractAmount(order.totalAmount, order.returnedAmount), 0);
    const isStocked =
      order.status === PURCHASE_ORDER_STATUS.STOCKED ||
      order.status === PURCHASE_ORDER_STATUS.DONE ||
      order.status === PURCHASE_ORDER_STATUS.RETURNED;

    if (compareAmount(order.returnedAmount, order.totalAmount) >= 0 && compareAmount(order.totalAmount, 0) > 0) {
      return PURCHASE_ORDER_STATUS.RETURNED;
    }

    if (isStocked && compareAmount(order.paidAmount, effectiveTotal) >= 0) {
      return PURCHASE_ORDER_STATUS.DONE;
    }

    if (isStocked) {
      return PURCHASE_ORDER_STATUS.STOCKED;
    }

    return PURCHASE_ORDER_STATUS.DRAFT;
  }

  private recalculateSaleOrderStatus(
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

  async createPayment(dto: CreatePaymentDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const amount = roundAmount(dto.amount);

      if (dto.type === PAYMENT_RECORD_TYPE.RECEIVE && dto.relatedType !== 'sale_order') {
        throw new BadRequestException('收款只能关联销售订单');
      }

      if (dto.type === PAYMENT_RECORD_TYPE.PAY && dto.relatedType !== 'purchase_order') {
        throw new BadRequestException('付款只能关联采购订单');
      }

      if (dto.relatedType === 'sale_order') {
        const order = await manager.findOne(SaleOrderEntity, { where: { id: dto.relatedId } });
        if (!order) {
          throw new NotFoundException('销售订单不存在');
        }

        const effectiveTotal = Math.max(subtractAmount(order.totalAmount, order.returnedAmount), 0);
        if (compareAmount(addAmount(order.receivedAmount, amount), effectiveTotal) > 0) {
          throw new BadRequestException('收款金额超过销售订单应收总额');
        }

        order.receivedAmount = addAmount(order.receivedAmount, amount);
        order.status = this.recalculateSaleOrderStatus(order);
        await manager.save(SaleOrderEntity, order);
      }

      if (dto.relatedType === 'purchase_order') {
        const order = await manager.findOne(PurchaseOrderEntity, {
          where: { id: dto.relatedId },
        });
        if (!order) {
          throw new NotFoundException('采购订单不存在');
        }

        const effectiveTotal = Math.max(subtractAmount(order.totalAmount, order.returnedAmount), 0);
        if (compareAmount(addAmount(order.paidAmount, amount), effectiveTotal) > 0) {
          throw new BadRequestException('付款金额超过采购订单应付总额');
        }

        order.paidAmount = addAmount(order.paidAmount, amount);
        order.status = this.recalculatePurchaseOrderStatus(order);
        await manager.save(PurchaseOrderEntity, order);
      }

      const payment = manager.create(PaymentRecordEntity, {
        type: dto.type,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        amount,
        method: dto.method ?? null,
        operatorId: user.sub,
        remark: dto.remark ?? null,
      });

      const saved = await manager.save(PaymentRecordEntity, payment);
      await this.operationLogService.createLog({
        module: 'payment',
        action: dto.type === PAYMENT_RECORD_TYPE.RECEIVE ? 'create_receive' : 'create_pay',
        operatorId: user.sub,
        detail: `${dto.relatedType}:${dto.relatedId}｜金额 ${amount}`,
      });
      return saved;
    });
  }

  async getPayments(query: PaymentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.dataSource
      .getRepository(PaymentRecordEntity)
      .createQueryBuilder('payment')
      .leftJoin(SaleOrderEntity, 'saleOrder', "payment.related_type = 'sale_order' AND saleOrder.id = payment.related_id")
      .leftJoin(PurchaseOrderEntity, 'purchaseOrder', "payment.related_type = 'purchase_order' AND purchaseOrder.id = payment.related_id")
      .select([
        'payment.id AS id',
        'payment.type AS type',
        'payment.related_type AS relatedType',
        'payment.related_id AS relatedId',
        'payment.amount AS amount',
        'payment.method AS method',
        'payment.remark AS remark',
        'payment.created_at AS createdAt',
        "COALESCE(saleOrder.order_no, purchaseOrder.order_no) AS orderNo",
      ]);

    if (query.type) {
      qb.andWhere('payment.type = :type', { type: query.type });
    }

    if (query.relatedType) {
      qb.andWhere('payment.related_type = :relatedType', {
        relatedType: query.relatedType,
      });
    }

    if (query.method) {
      qb.andWhere('payment.method = :method', { method: query.method });
    }

    if (query.dateFrom) {
      qb.andWhere('DATE(payment.created_at) >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('DATE(payment.created_at) <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('payment.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return { list, total, page, pageSize };
  }

  async getReceivables() {
    const rows = await this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .leftJoin(CustomerEntity, 'customer', 'customer.id = saleOrder.customer_id')
      .select([
        'saleOrder.id AS id',
        'saleOrder.order_no AS orderNo',
        'saleOrder.customer_id AS customerId',
        'customer.name AS customerName',
        '(saleOrder.total_amount - saleOrder.returned_amount) AS totalAmount',
        'saleOrder.received_amount AS receivedAmount',
        '(saleOrder.total_amount - saleOrder.returned_amount - saleOrder.received_amount) AS receivableAmount',
        'saleOrder.status AS status',
        'saleOrder.created_at AS createdAt',
      ])
      .where('(saleOrder.total_amount - saleOrder.returned_amount) > saleOrder.received_amount')
      .orderBy('saleOrder.id', 'DESC')
      .getRawMany();

    return rows;
  }

  async getPayables() {
    const rows = await this.dataSource
      .getRepository(PurchaseOrderEntity)
      .createQueryBuilder('purchaseOrder')
      .leftJoin(SupplierEntity, 'supplier', 'supplier.id = purchaseOrder.supplier_id')
      .select([
        'purchaseOrder.id AS id',
        'purchaseOrder.order_no AS orderNo',
        'purchaseOrder.supplier_id AS supplierId',
        'supplier.name AS supplierName',
        '(purchaseOrder.total_amount - purchaseOrder.returned_amount) AS totalAmount',
        'purchaseOrder.paid_amount AS paidAmount',
        '(purchaseOrder.total_amount - purchaseOrder.returned_amount - purchaseOrder.paid_amount) AS payableAmount',
        'purchaseOrder.status AS status',
        'purchaseOrder.created_at AS createdAt',
      ])
      .where('(purchaseOrder.total_amount - purchaseOrder.returned_amount) > purchaseOrder.paid_amount')
      .orderBy('purchaseOrder.id', 'DESC')
      .getRawMany();

    return rows;
  }
}
