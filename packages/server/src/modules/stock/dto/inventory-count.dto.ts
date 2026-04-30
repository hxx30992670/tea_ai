import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class InventoryCountItemDto {
  @ApiProperty({ description: '商品 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiPropertyOptional({ description: '批次 ID，不传则按商品+仓库+仓位+批次号创建/匹配', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchId?: number;

  @ApiPropertyOptional({ description: '批次号', example: '2026-CQ-001' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiProperty({ description: '实盘数量', example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQty!: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateInventoryCountDto {
  @ApiPropertyOptional({ description: '仓库 ID，默认主仓', example: 1 })
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

  @ApiProperty({ description: '盘点明细', type: [InventoryCountItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryCountItemDto)
  items!: InventoryCountItemDto[];

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
