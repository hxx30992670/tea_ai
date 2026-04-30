import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class StockInDto {
  @ApiProperty({ description: '商品 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiPropertyOptional({ description: '并入已有批次 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchId?: number;

  @ApiPropertyOptional({ description: '新批次号', example: '20260430-LJ-01' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional({ description: '仓库 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '仓位 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @ApiPropertyOptional({ description: '入库数量（基准单位）', example: 10 })
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

  @ApiProperty({ description: '入库原因', example: 'purchase' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ description: '关联订单 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  relatedOrderId?: number;

  @ApiPropertyOptional({ description: '备注', example: '采购入库' })
  @IsOptional()
  @IsString()
  remark?: string;
}
