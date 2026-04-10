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
import { DataSource, IsNull, Repository } from 'typeorm';
import { resolveCompositeQuantity, getProductPackageConfig } from '../../common/utils/packaging.util';
import { ProductEntity } from '../../entities/product.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { AuthUser } from '../../common/types/auth-user.type';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockRecordQueryDto } from './dto/stock-record-query.dto';

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
      const beforeQty = product.stockQty;
      const afterQty = beforeQty + quantity;

      product.stockQty = afterQty;
      await productRepository.save(product);

      const stockRecord = stockRecordRepository.create({
        productId: product.id,
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
      const beforeQty = product.stockQty;
      if (beforeQty < quantity) {
        throw new BadRequestException('库存不足，无法出库');
      }

      const afterQty = beforeQty - quantity;

      product.stockQty = afterQty;
      await productRepository.save(product);

      const stockRecord = stockRecordRepository.create({
        productId: product.id,
        type: 'out',
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

  async getStockRecords(query: StockRecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.stockRecordRepository
      .createQueryBuilder('record')
      .leftJoin(ProductEntity, 'product', 'product.id = record.product_id')
      .select([
        'record.id AS id',
        'record.product_id AS productId',
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
      qb.andWhere('product.name LIKE :kw', { kw: `%${query.keyword}%` });
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
        const quantity = Number(row.totalQuantity ?? 0);
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

      if (product.stockQty <= product.safeStock) {
        productWarnings.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          teaType: product.teaType,
          warningType: 'safe_stock',
          level: product.stockQty === 0 ? 'critical' : 'high',
          stockQty: product.stockQty,
          safeStock: product.safeStock,
          message:
            product.stockQty === 0
              ? '库存已为 0，请尽快补货'
              : `库存低于安全库存线，当前 ${product.stockQty}，安全库存 ${product.safeStock}`,
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
