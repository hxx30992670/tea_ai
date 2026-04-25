/**
 * 商品模块
 * 注册商品及分类实体，提供商品管理服务
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../../entities/category.entity';
import { ProductEntity } from '../../entities/product.entity';
import { ProductUnitEntity } from '../../entities/product-unit.entity';
import { ProductController } from './product.controller';
import { ProductExtSchemaService } from './product-ext-schema.service';
import { ProductService } from './product.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity, ProductUnitEntity, CategoryEntity])],
  controllers: [ProductController],
  providers: [ProductService, ProductExtSchemaService],
  exports: [ProductService, ProductExtSchemaService],
})
export class ProductModule {}
