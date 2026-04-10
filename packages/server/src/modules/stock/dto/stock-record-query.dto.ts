import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StockRecordQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @ApiPropertyOptional({ description: '商品 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @ApiPropertyOptional({ description: '流水类型 in/out', example: 'in' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '业务原因', example: 'purchase' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '关键字，匹配商品名', example: '冰岛' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '开始日期 YYYY-MM-DD', example: '2026-04-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD', example: '2026-04-30' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
