import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class StockTransferItemDto {
  @ApiProperty({ description: '批次 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchId!: number;

  @ApiProperty({ description: '调拨数量', example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: '调出仓库 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromWarehouseId!: number;

  @ApiPropertyOptional({ description: '调出仓位 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromLocationId?: number;

  @ApiProperty({ description: '调入仓库 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toWarehouseId!: number;

  @ApiPropertyOptional({ description: '调入仓位 ID', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toLocationId?: number;

  @ApiProperty({ description: '调拨明细', type: [StockTransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items!: StockTransferItemDto[];

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
