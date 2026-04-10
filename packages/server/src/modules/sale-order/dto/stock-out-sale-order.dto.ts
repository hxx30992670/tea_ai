import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StockOutSaleOrderDto {
  @ApiPropertyOptional({ description: '出库备注', example: '客户提货出库' })
  @IsOptional()
  @IsString()
  remark?: string;
}
