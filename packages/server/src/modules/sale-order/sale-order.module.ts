import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { SaleOrderController } from './sale-order.controller';
import { SaleOrderService } from './sale-order.service';

@Module({
  imports: [SystemModule],
  controllers: [SaleOrderController],
  providers: [SaleOrderService],
  exports: [SaleOrderService],
})
export class SaleOrderModule {}
