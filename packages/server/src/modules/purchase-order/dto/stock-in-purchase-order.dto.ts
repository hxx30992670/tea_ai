import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StockInPurchaseOrderDto {
  @ApiPropertyOptional({ description: '入库备注', example: '采购到货已入库' })
  @IsOptional()
  @IsString()
  remark?: string;
}
