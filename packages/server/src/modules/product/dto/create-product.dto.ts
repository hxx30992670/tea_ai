import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: '商品名称', example: '西湖龙井 2026 春茶' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'SKU 编码', example: 'LJ-2026-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: '条码', example: '6901234567890' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ description: '商品计量单位', example: '斤' })
  @IsString()
  unit!: string;

  @ApiProperty({ description: '分类 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiPropertyOptional({ description: '采购价', example: 88 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ description: '销售价', example: 128 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice?: number;

  @ApiPropertyOptional({ description: '当前库存', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional({ description: '状态 1 在售 0 停售', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number;

  @ApiPropertyOptional({ description: '生产日期', example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  productionDate?: string;

  @ApiPropertyOptional({ description: '图片地址', example: 'https://example.com/tea.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: '扩展字段 JSON 对象', example: { origin: '浙江杭州', year: 2026, season: '春茶', shelfLife: 18, safeStock: 10 } })
  @IsOptional()
  @IsObject()
  extData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '备注', example: '高端礼盒装' })
  @IsOptional()
  @IsString()
  remark?: string;
}
