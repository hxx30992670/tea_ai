import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class StockOutDto {
  @ApiProperty({ description: '商品 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiPropertyOptional({ description: '出库数量（基准单位）', example: 2 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '包装数量', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packageQty?: number;

  @ApiPropertyOptional({ description: '散数量（基准单位）', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  looseQty?: number;

  @ApiProperty({ description: '出库原因', example: 'sale' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ description: '关联订单 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  relatedOrderId?: number;

  @ApiPropertyOptional({ description: '备注', example: '销售出库' })
  @IsOptional()
  @IsString()
  remark?: string;
}
