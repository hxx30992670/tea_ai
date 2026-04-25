/**
 * 茶掌柜 - 应用根模块
 * 负责组装所有业务模块、配置全局环境变量及数据库连接
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProductModule } from './modules/product/product.module';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module';
import { SaleOrderModule } from './modules/sale-order/sale-order.module';
import { StockModule } from './modules/stock/stock.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { SystemModule } from './modules/system/system.module';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_ROOT = path.resolve(__dirname, '..');
const ENV_FILE_PATHS = [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(SERVER_ROOT, '.env'),
  path.join(SERVER_ROOT, '.env.local'),
];

@Module({
  imports: [
    // 全局配置模块：加载环境变量、校验必要配置
    ConfigModule.forRoot({
      isGlobal: true,           // 全局可用，无需在其他模块重复导入
      envFilePath: ENV_FILE_PATHS,  // 同时支持仓库根目录和 server 包目录的环境变量文件
      load: [appConfig, databaseConfig],    // 加载自定义配置
      validate: validateEnv,    // 启动时校验必要环境变量
    }),
    DatabaseModule,             // 数据库连接模块（SQLite）
    AuthModule,                 // 用户认证与鉴权
    ProductModule,              // 商品与分类管理
    StockModule,                // 库存出入库管理
    CustomerModule,             // 客户档案与跟进记录
    SupplierModule,             // 供应商管理
    PurchaseOrderModule,        // 采购订单管理
    SaleOrderModule,            // 销售订单管理
    PaymentModule,              // 收付款记录
    DashboardModule,            // 数据看板与统计
    SystemModule,               // 系统管理（用户、设置、日志）
    AiModule,                   // AI 智能问答模块
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
