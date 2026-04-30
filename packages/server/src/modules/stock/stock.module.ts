import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryCountEntity } from '../../entities/inventory-count.entity';
import { InventoryCountItemEntity } from '../../entities/inventory-count-item.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockBatchEntity } from '../../entities/stock-batch.entity';
import { StockLocationEntity } from '../../entities/stock-location.entity';
import { StockRecordEntity } from '../../entities/stock-record.entity';
import { StockTransferEntity } from '../../entities/stock-transfer.entity';
import { StockTransferItemEntity } from '../../entities/stock-transfer-item.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEntity,
      StockRecordEntity,
      WarehouseEntity,
      StockLocationEntity,
      StockBatchEntity,
      InventoryCountEntity,
      InventoryCountItemEntity,
      StockTransferEntity,
      StockTransferItemEntity,
    ]),
  ],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
