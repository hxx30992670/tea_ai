import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CategoryEntity } from '../../entities/category.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { compareQuantity } from '../../common/utils/precision.util';
import { ensureLegacyStockBatchConsistency } from '../../common/utils/stock-batch.util';

const DEFAULT_CATEGORIES = [
  '绿茶',
  '红茶',
  '乌龙茶',
  '普洱',
  '白茶',
  '黄茶',
  '黑茶',
  '花茶',
];

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly systemSettingRepository: Repository<SystemSettingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedCategories();
    await this.seedLegacyStockBatches();
    await this.seedAvailableStockQty();
  }

  private async seedAdmin() {
    const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
    const existingUser = await this.userRepository.findOne({ where: { username } });

    if (existingUser) {
      return;
    }

    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'Admin@123456';
    const passwordHash = await bcrypt.hash(password, 10);

    await this.userRepository.save(
      this.userRepository.create({
        username,
        passwordHash,
        realName: process.env.DEFAULT_ADMIN_REAL_NAME ?? '系统管理员',
        role: 'admin',
        status: 1,
      }),
    );
  }

  private async seedCategories() {
    const categoryCount = await this.categoryRepository.count();

    if (categoryCount > 0) {
      return;
    }

    await this.categoryRepository.save(
      DEFAULT_CATEGORIES.map((name, index) =>
        this.categoryRepository.create({
          name,
          sortOrder: index + 1,
        }),
      ),
    );
  }

  private async seedLegacyStockBatches() {
    await this.dataSource.transaction(async (manager) => {
      const products = await manager.getRepository(ProductEntity).find({
        where: { deletedAt: IsNull() },
      });

      for (const product of products) {
        if (compareQuantity(product.stockQty ?? 0, 0) > 0) {
          await ensureLegacyStockBatchConsistency(manager, product);
        }
      }
    });
  }

  private async seedAvailableStockQty() {
    await this.dataSource.query(`
      UPDATE product SET available_stock_qty = (
        SELECT COALESCE(SUM(quantity), 0) FROM stock_batch
        WHERE stock_batch.product_id = product.id AND stock_batch.status = 1
      )
    `);
  }
}
