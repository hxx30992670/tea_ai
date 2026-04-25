/**
 * 数据库模块
 * 配置 TypeORM 连接 SQLite 数据库，注册所有实体
 * 启动时自动同步表结构并初始化默认管理员账号
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabasePath } from '../config/database.config';
import { AiConversationEntity } from '../entities/ai-conversation.entity';
import { CategoryEntity } from '../entities/category.entity';
import { CustomerEntity } from '../entities/customer.entity';
import { FollowUpEntity } from '../entities/follow-up.entity';
import { OperationLogEntity } from '../entities/operation-log.entity';
import { PaymentRecordEntity } from '../entities/payment-record.entity';
import { ProductEntity } from '../entities/product.entity';
import { ProductUnitEntity } from '../entities/product-unit.entity';
import { PurchaseOrderEntity } from '../entities/purchase-order.entity';
import { PurchaseOrderItemEntity } from '../entities/purchase-order-item.entity';
import { PurchaseReturnEntity } from '../entities/purchase-return.entity';
import { PurchaseReturnItemEntity } from '../entities/purchase-return-item.entity';
import { SaleOrderEntity } from '../entities/sale-order.entity';
import { SaleOrderItemEntity } from '../entities/sale-order-item.entity';
import { SaleExchangeEntity } from '../entities/sale-exchange.entity';
import { SaleExchangeItemEntity } from '../entities/sale-exchange-item.entity';
import { SaleRefundEntity } from '../entities/sale-refund.entity';
import { SaleReturnEntity } from '../entities/sale-return.entity';
import { SaleReturnItemEntity } from '../entities/sale-return-item.entity';
import { StockRecordEntity } from '../entities/stock-record.entity';
import { SupplierEntity } from '../entities/supplier.entity';
import { SysUserEntity } from '../entities/sys-user.entity';
import { SystemSettingEntity } from '../entities/system-setting.entity';
import { DatabaseSeedService } from './seeds/database-seed.service';

export const ENTITIES = [
  SysUserEntity,
  CategoryEntity,
  ProductEntity,
  ProductUnitEntity,
  StockRecordEntity,
  CustomerEntity,
  SupplierEntity,
  PurchaseOrderEntity,
  PurchaseOrderItemEntity,
  PurchaseReturnEntity,
  PurchaseReturnItemEntity,
  SaleOrderEntity,
  SaleOrderItemEntity,
  SaleRefundEntity,
  SaleReturnEntity,
  SaleReturnItemEntity,
  SaleExchangeEntity,
  SaleExchangeItemEntity,
  PaymentRecordEntity,
  FollowUpEntity,
  AiConversationEntity,
  SystemSettingEntity,
  OperationLogEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      location: getDatabasePath(),
      autoSave: true,
      entities: ENTITIES,
      synchronize: true,
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: [DatabaseSeedService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
