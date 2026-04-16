import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../src/common/types/auth-user.type';
import { PAYMENT_RECORD_TYPE, PURCHASE_ORDER_STATUS, SALE_ORDER_STATUS } from '../src/common/constants/order-status';
import { CategoryEntity } from '../src/entities/category.entity';
import { CustomerEntity } from '../src/entities/customer.entity';
import { PaymentRecordEntity } from '../src/entities/payment-record.entity';
import { ProductEntity } from '../src/entities/product.entity';
import { SupplierEntity } from '../src/entities/supplier.entity';
import { CustomerService } from '../src/modules/customer/customer.service';
import { PurchaseOrderService } from '../src/modules/purchase-order/purchase-order.service';
import { SaleOrderService } from '../src/modules/sale-order/sale-order.service';

type TestContext = {
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  dataSource: DataSource;
  saleOrderService: SaleOrderService;
  purchaseOrderService: PurchaseOrderService;
  customerService: CustomerService;
  categoryRepository: Repository<CategoryEntity>;
  customerRepository: Repository<CustomerEntity>;
  paymentRepository: Repository<PaymentRecordEntity>;
  productRepository: Repository<ProductEntity>;
  supplierRepository: Repository<SupplierEntity>;
  user: AuthUser;
};

type TestCase = {
  name: string;
  run: (ctx: TestContext) => Promise<void>;
};

let sequence = 0;

function nextName(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function createTestContext(): Promise<{ ctx: TestContext; cleanup: () => Promise<void> }> {
  const tempDir = mkdtempSync(join(tmpdir(), 'tea-manager-order-flows-'));
  const dbPath = join(tempDir, 'app.db');

  process.env.DB_PATH = dbPath;
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN ??= '3600s';
  process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';
  process.env.DEFAULT_ADMIN_USERNAME ??= 'admin';
  process.env.DEFAULT_ADMIN_PASSWORD ??= 'Admin@123456';

  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);

  const ctx: TestContext = {
    app,
    dataSource,
    saleOrderService: app.get(SaleOrderService),
    purchaseOrderService: app.get(PurchaseOrderService),
    customerService: app.get(CustomerService),
    categoryRepository: dataSource.getRepository(CategoryEntity),
    customerRepository: dataSource.getRepository(CustomerEntity),
    paymentRepository: dataSource.getRepository(PaymentRecordEntity),
    productRepository: dataSource.getRepository(ProductEntity),
    supplierRepository: dataSource.getRepository(SupplierEntity),
    user: {
      sub: 1,
      username: process.env.DEFAULT_ADMIN_USERNAME ?? 'admin',
      role: 'admin',
    },
  };

  return {
    ctx,
    cleanup: async () => {
      await app.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function getDefaultCategoryId(ctx: TestContext) {
  const category = await ctx.categoryRepository.findOne({ where: {}, order: { id: 'ASC' } });
  assert.ok(category, '测试环境未初始化默认商品分类');
  return category.id;
}

async function createProduct(
  ctx: TestContext,
  options?: Partial<Pick<ProductEntity, 'stockQty' | 'costPrice' | 'sellPrice' | 'unit' | 'extData'>>,
) {
  const categoryId = await getDefaultCategoryId(ctx);
  return ctx.productRepository.save(
    ctx.productRepository.create({
      name: nextName('商品'),
      sku: nextName('SKU'),
      categoryId,
      unit: options?.unit ?? '两',
      costPrice: options?.costPrice ?? 50,
      sellPrice: options?.sellPrice ?? 100,
      stockQty: options?.stockQty ?? 0,
      safeStock: 5,
      status: 1,
      extData: options?.extData ?? null,
      remark: null,
      barcode: null,
      spec: null,
      imageUrl: null,
      productionDate: null,
      teaType: null,
      origin: null,
      year: null,
      batchNo: null,
      season: null,
      shelfLife: 0,
      producedAt: null,
      storageCond: null,
      deletedAt: null,
    }),
  );
}

async function createCustomer(ctx: TestContext) {
  return ctx.customerRepository.save(
    ctx.customerRepository.create({
      name: nextName('客户'),
      contactName: '测试联系人',
      phone: null,
      address: null,
      remark: null,
    }),
  );
}

async function createSupplier(ctx: TestContext) {
  return ctx.supplierRepository.save(
    ctx.supplierRepository.create({
      name: nextName('供应商'),
      contactName: '测试供应商',
      phone: null,
      address: null,
      supplyCategory: null,
      paymentTermsType: null,
      paymentDays: null,
      remark: null,
    }),
  );
}

async function expectReject(action: () => Promise<unknown>, message: string | RegExp) {
  let error: unknown;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, '预期抛出异常，但实际执行成功');
  const actualMessage = error instanceof Error ? error.message : String(error);
  if (typeof message === 'string') {
    assert.ok(actualMessage.includes(message), `异常信息不符合预期: ${actualMessage}`);
  } else {
    assert.match(actualMessage, message);
  }
}

const tests: TestCase[] = [
  {
    name: '销售订单出库与退货应正确回写库存和状态',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 10, costPrice: 60, sellPrice: 120, unit: '两' });
      const customer = await createCustomer(ctx);
      const order = await ctx.saleOrderService.createSaleOrder(
        {
          customerId: customer.id,
          remark: '销售主链路测试',
          items: [{ productId: product.id, quantity: 2, unitPrice: 120 }],
        },
        ctx.user,
      ) as { id: number };

      await ctx.saleOrderService.stockOutSaleOrder(order.id, '销售出库测试', ctx.user);
      const shipped = await ctx.saleOrderService.getSaleOrderById(order.id, ctx.user) as Record<string, unknown>;
      const productAfterStockOut = await ctx.productRepository.findOneByOrFail({ id: product.id });

      assert.equal(shipped.status, SALE_ORDER_STATUS.SHIPPED);
      assert.equal(productAfterStockOut.stockQty, 8);

      const firstItem = (shipped.items as Array<Record<string, unknown>>)[0];
      await ctx.saleOrderService.createSaleReturn(
        order.id,
        {
          items: [{ saleOrderItemId: Number(firstItem.id), quantity: 1 }],
          refundAmount: 0,
          remark: '销售退货测试',
        },
        ctx.user,
      );

      const afterReturn = await ctx.saleOrderService.getSaleOrderById(order.id, ctx.user) as Record<string, unknown>;
      const productAfterReturn = await ctx.productRepository.findOneByOrFail({ id: product.id });

      assert.equal(productAfterReturn.stockQty, 9);
      assert.equal(Number(afterReturn.returnedAmount), 120);
      assert.equal(afterReturn.status, SALE_ORDER_STATUS.SHIPPED);
    },
  },
  {
    name: '采购订单入库与退货应正确回写库存和状态',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 5, costPrice: 40, sellPrice: 90, unit: '两' });
      const supplier = await createSupplier(ctx);
      const order = await ctx.purchaseOrderService.createPurchaseOrder(
        {
          supplierId: supplier.id,
          remark: '采购主链路测试',
          items: [{ productId: product.id, quantity: 3, unitPrice: 40 }],
        },
        ctx.user,
      ) as { id: number };

      await ctx.purchaseOrderService.stockInPurchaseOrder(order.id, { remark: '采购入库测试' }, ctx.user);
      let stored = await ctx.purchaseOrderService.getPurchaseOrderById(order.id) as Record<string, unknown>;
      let productAfterStockIn = await ctx.productRepository.findOneByOrFail({ id: product.id });

      assert.equal(stored.status, PURCHASE_ORDER_STATUS.STOCKED);
      assert.equal(productAfterStockIn.stockQty, 8);

      const firstItem = (stored.items as Array<Record<string, unknown>>)[0];
      await ctx.purchaseOrderService.createPurchaseReturn(
        order.id,
        {
          items: [{ purchaseOrderItemId: Number(firstItem.id), quantity: 1 }],
          refundAmount: 0,
          remark: '采购退货测试',
        },
        ctx.user,
      );

      stored = await ctx.purchaseOrderService.getPurchaseOrderById(order.id) as Record<string, unknown>;
      productAfterStockIn = await ctx.productRepository.findOneByOrFail({ id: product.id });

      assert.equal(productAfterStockIn.stockQty, 7);
      assert.equal(Number(stored.returnedAmount), 40);
      assert.equal(stored.status, PURCHASE_ORDER_STATUS.STOCKED);
    },
  },
  {
    name: '销售快捷完成不应允许实收金额超过订单总额',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 5, sellPrice: 100, costPrice: 50, unit: '两' });
      const customer = await createCustomer(ctx);

      await expectReject(
        () =>
          ctx.saleOrderService.quickCompleteSaleOrder(
            {
              customerId: customer.id,
              paidAmount: 200,
              method: '现金',
              items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
            },
            ctx.user,
          ),
        '超过',
      );
    },
  },
  {
    name: '采购快捷完成不应允许实付金额超过订单总额',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 0, costPrice: 80, sellPrice: 120, unit: '两' });
      const supplier = await createSupplier(ctx);

      await expectReject(
        () =>
          ctx.purchaseOrderService.quickCompletePurchaseOrder(
            {
              supplierId: supplier.id,
              paidAmount: 300,
              method: '现金',
              items: [{ productId: product.id, quantity: 2, unitPrice: 80 }],
            },
            ctx.user,
          ),
        '超过',
      );
    },
  },
  {
    name: '销售快捷完成在 0 元收款时不应生成收款流水',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 5, sellPrice: 88, costPrice: 30, unit: '两' });
      const customer = await createCustomer(ctx);
      const order = await ctx.saleOrderService.quickCompleteSaleOrder(
        {
          customerId: customer.id,
          paidAmount: 0,
          items: [{ productId: product.id, quantity: 1, unitPrice: 88 }],
        },
        ctx.user,
      ) as { id: number };

      const records = await ctx.paymentRepository.find({
        where: { relatedType: 'sale_order', relatedId: order.id, type: PAYMENT_RECORD_TYPE.RECEIVE },
      });

      assert.equal(records.length, 0, '0 元快捷完成不应生成收款流水');
    },
  },
  {
    name: '客户欠款统计应扣除销售退货金额',
    async run(ctx) {
      const product = await createProduct(ctx, { stockQty: 6, sellPrice: 100, costPrice: 40, unit: '两' });
      const customer = await createCustomer(ctx);
      const order = await ctx.saleOrderService.createSaleOrder(
        {
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 2, unitPrice: 100 }],
        },
        ctx.user,
      ) as { id: number };

      await ctx.saleOrderService.stockOutSaleOrder(order.id, '客户欠款口径测试', ctx.user);
      const detail = await ctx.saleOrderService.getSaleOrderById(order.id, ctx.user) as Record<string, unknown>;
      const firstItem = (detail.items as Array<Record<string, unknown>>)[0];

      await ctx.saleOrderService.createSaleReturn(
        order.id,
        {
          items: [{ saleOrderItemId: Number(firstItem.id), quantity: 1 }],
          refundAmount: 0,
        },
        ctx.user,
      );

      const customers = await ctx.customerService.getCustomers({ page: 1, pageSize: 200 });
      const target = (customers.list as Array<Record<string, unknown>>).find((item) => Number(item.id) === customer.id);

      assert.ok(target, '未找到目标客户');
      assert.equal(Number(target.receivableAmount), 100, '客户欠款应按净额统计');
    },
  },
];

async function main() {
  const { ctx, cleanup } = await createTestContext();
  const failures: Array<{ name: string; error: unknown }> = [];

  try {
    for (const test of tests) {
      try {
        await test.run(ctx);
        console.log(`✔ ${test.name}`);
      } catch (error) {
        failures.push({ name: test.name, error });
        const message = error instanceof Error ? error.message : String(error);
        console.error(`✘ ${test.name}`);
        console.error(`  ${message}`);
      }
    }
  } finally {
    await cleanup();
  }

  if (failures.length > 0) {
    console.error(`\n共 ${failures.length} 条用例失败，${tests.length - failures.length} 条通过。`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n全部 ${tests.length} 条用例通过。`);
}

void main();
