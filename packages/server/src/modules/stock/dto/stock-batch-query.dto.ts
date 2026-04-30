import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { STOCK_BATCH_STATUS_VALUES } from '../../../common/constants/stock-batch-status';

export class StockBatchQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ description: '商品 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

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

  @ApiPropertyOptional({ description: '商品/批次/仓位关键字', example: '龙井' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '仅显示有库存批次', example: '1' })
  @IsOptional()
  @IsString()
  availableOnly?: string;

  @ApiPropertyOptional({ description: '批次库存状态', enum: STOCK_BATCH_STATUS_VALUES, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...STOCK_BATCH_STATUS_VALUES])
  status?: number;
}
