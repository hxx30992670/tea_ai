import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PAYMENT_RECORD_TYPE } from '../../common/constants/order-status';
import { PaymentRecordEntity } from '../../entities/payment-record.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SaleExchangeEntity } from '../../entities/sale-exchange.entity';
import { SaleOrderItemEntity } from '../../entities/sale-order-item.entity';
import { SaleOrderEntity } from '../../entities/sale-order.entity';
import { SaleRefundEntity } from '../../entities/sale-refund.entity';
import { SaleReturnEntity } from '../../entities/sale-return.entity';
import { SalesTrendQueryDto } from './dto/sales-trend-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

type TrendBucket = {
  label: string;
  start: Date;
  end: Date;
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todayRevenue,
      monthRevenue,
      purchaseAmount,
      inventoryValue,
      receivableTotal,
      saleReturnTotal,
      purchaseReturnTotal,
      refundTotal,
      supplierRefundTotal,
    ] = await Promise.all([
      this.sumSaleAmount(todayStart, now),
      this.sumSaleAmount(monthStart, now),
      this.sumPurchaseAmount(),
      this.sumInventoryValue(),
      this.sumReceivables(),
      this.sumSaleReturnedAmount(),
      this.sumPurchaseReturnedAmount(),
      this.sumPaymentByType(PAYMENT_RECORD_TYPE.REFUND),
      this.sumPaymentByType(PAYMENT_RECORD_TYPE.SUPPLIER_REFUND),
    ]);

    return {
      todayRevenue,
      monthRevenue,
      purchaseAmount,
      inventoryValue,
      receivableTotal,
      saleReturnTotal,
      purchaseReturnTotal,
      refundTotal,
      supplierRefundTotal,
    };
  }

  async getSalesTrend(query: SalesTrendQueryDto) {
    const period = query.period ?? 'day';
    const buckets = this.buildTrendBuckets(period);
    const start = buckets[0]?.start;
    const end = buckets[buckets.length - 1]?.end;

    if (!start || !end) {
      return {
        period,
        points: [],
      };
    }

    const rows = await this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .select(["datetime(saleOrder.created_at, 'localtime') AS createdAt", 'saleOrder.total_amount AS totalAmount'])
      .where("datetime(saleOrder.created_at, 'localtime') >= :start", {
        start: this.formatSqliteDateTime(start),
      })
      .andWhere("datetime(saleOrder.created_at, 'localtime') <= :end", {
        end: this.formatSqliteDateTime(end),
      })
      .getRawMany<{ createdAt: string; totalAmount: number }>();

    const result = buckets.map((bucket) => ({
      label: bucket.label,
      amount: 0,
      orderCount: 0,
    }));

    rows.forEach((row) => {
      const createdAt = new Date(row.createdAt);
      const bucketIndex = buckets.findIndex(
        (bucket) => createdAt >= bucket.start && createdAt <= bucket.end,
      );

      if (bucketIndex >= 0) {
        result[bucketIndex].amount += Number(row.totalAmount ?? 0);
        result[bucketIndex].orderCount += 1;
      }
    });

    return {
      period,
      points: result,
    };
  }

  async getTopProducts(query: TopProductsQueryDto) {
    const limit = query.limit ?? 10;
    const sortDirection = query.type === 'slow' ? 'ASC' : 'DESC';
    const rows = await this.dataSource
      .getRepository(SaleOrderItemEntity)
      .createQueryBuilder('item')
      .leftJoin(ProductEntity, 'product', 'product.id = item.product_id')
      .select([
        'item.product_id AS productId',
        'product.name AS productName',
        'product.sku AS sku',
        'product.tea_type AS teaType',
        'SUM(item.quantity) AS totalQuantity',
        'SUM(item.subtotal) AS totalSales',
      ])
      .groupBy('item.product_id')
      .addGroupBy('product.name')
      .addGroupBy('product.sku')
      .addGroupBy('product.tea_type')
      .orderBy('SUM(item.quantity)', sortDirection)
      .limit(limit)
      .getRawMany();

    return {
      type: query.type ?? 'top',
      list: rows,
    };
  }

  async getStockWarnings() {
    const products = await this.productRepository.find({
      where: { status: 1, deletedAt: IsNull() },
      order: { stockQty: 'ASC', id: 'DESC' },
    });

    const now = new Date();

    return products.flatMap((product) => {
      const warnings: Array<Record<string, unknown>> = [];

      if (product.stockQty <= product.safeStock) {
        warnings.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          teaType: product.teaType,
          warningType: 'safe_stock',
          stockQty: product.stockQty,
          safeStock: product.safeStock,
          level: product.stockQty === 0 ? 'critical' : 'high',
        });
      }

      const expiryWarning = this.buildExpiryWarning(product, now);
      if (expiryWarning) {
        warnings.push(expiryWarning);
      }

      return warnings;
    });
  }

  async getAfterSalesReasonStats() {
    const [returns, refunds, exchanges] = await Promise.all([
      this.dataSource.getRepository(SaleReturnEntity).find(),
      this.dataSource.getRepository(SaleRefundEntity).find(),
      this.dataSource.getRepository(SaleExchangeEntity).find(),
    ]);

    const statsMap = new Map<string, { reasonCode: string; count: number; amount: number }>();

    const pushStat = (reasonCode: string | null | undefined, amount: number) => {
      const code = reasonCode || 'other';
      const current = statsMap.get(code) ?? { reasonCode: code, count: 0, amount: 0 };
      current.count += 1;
      current.amount += amount;
      statsMap.set(code, current);
    };

    returns.forEach((item) => pushStat(item.reasonCode, Number(item.totalAmount ?? 0)));
    refunds.forEach((item) => pushStat(item.reasonCode, Number(item.amount ?? 0)));
    exchanges.forEach((item) => pushStat(item.reasonCode, Number(item.returnAmount ?? 0)));

    return Array.from(statsMap.values()).sort((a, b) => b.count - a.count || b.amount - a.amount);
  }

  private async sumSaleAmount(start: Date, end: Date) {
    const row = await this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .select('COALESCE(SUM(saleOrder.total_amount), 0)', 'amount')
      .where("datetime(saleOrder.created_at, 'localtime') >= :start", {
        start: this.formatSqliteDateTime(start),
      })
      .andWhere("datetime(saleOrder.created_at, 'localtime') <= :end", {
        end: this.formatSqliteDateTime(end),
      })
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumInventoryValue() {
    const row = await this.dataSource
      .getRepository(ProductEntity)
      .createQueryBuilder('product')
      .select('COALESCE(SUM(product.stock_qty * product.cost_price), 0)', 'amount')
      .where('product.status = :status', { status: 1 })
      .andWhere('product.deleted_at IS NULL')
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumPurchaseAmount() {
    const row = await this.dataSource
      .getRepository(PurchaseOrderEntity)
      .createQueryBuilder('purchaseOrder')
      .select('COALESCE(SUM(purchaseOrder.total_amount), 0)', 'amount')
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumReceivables() {
    const row = await this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .select('COALESCE(SUM(saleOrder.total_amount - saleOrder.returned_amount - saleOrder.received_amount), 0)', 'amount')
      .where('(saleOrder.total_amount - saleOrder.returned_amount) > saleOrder.received_amount')
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumSaleReturnedAmount() {
    const row = await this.dataSource
      .getRepository(SaleOrderEntity)
      .createQueryBuilder('saleOrder')
      .select('COALESCE(SUM(saleOrder.returned_amount), 0)', 'amount')
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumPurchaseReturnedAmount() {
    const row = await this.dataSource
      .getRepository(PurchaseOrderEntity)
      .createQueryBuilder('purchaseOrder')
      .select('COALESCE(SUM(purchaseOrder.returned_amount), 0)', 'amount')
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private async sumPaymentByType(type: string) {
    const row = await this.dataSource
      .getRepository(PaymentRecordEntity)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'amount')
      .where('payment.type = :type', { type })
      .getRawOne<{ amount: number }>();

    return Number(row?.amount ?? 0);
  }

  private buildTrendBuckets(period: 'day' | 'week' | 'month'): TrendBucket[] {
    const now = new Date();

    if (period === 'week') {
      return Array.from({ length: 8 }, (_, index) => {
        const start = new Date(now);
        start.setDate(now.getDate() - (7 - index) * 7);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return {
          label: `${start.getMonth() + 1}/${start.getDate()}`,
          start,
          end,
        };
      });
    }

    if (period === 'month') {
      return Array.from({ length: 12 }, (_, index) => {
        const start = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);

        return {
          label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
          start,
          end,
        };
      });
    }

    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      return {
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        start,
        end,
      };
    });
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

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      teaType: product.teaType,
      warningType: 'expiry',
      level: remainingDays <= 30 ? 'critical' : remainingDays <= 60 ? 'high' : 'medium',
      stockQty: product.stockQty,
      batchNo: product.batchNo,
      remainingDays,
      expireAt: expireAt.toISOString(),
    };
  }

  private formatSqliteDateTime(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
