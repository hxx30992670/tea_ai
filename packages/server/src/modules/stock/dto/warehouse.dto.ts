import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ description: '仓库名称', example: '主仓' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '仓库编码', example: 'WH-MAIN' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: '仓库类型', example: 'main' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '地址', example: '茶城 A 区 2 楼' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '是否默认仓库', example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateStockLocationDto {
  @ApiProperty({ description: '仓库 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId!: number;

  @ApiProperty({ description: '仓位名称', example: 'A-01' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '仓位编码', example: 'A-01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ description: '仓库名称', example: '主仓' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '仓库编码', example: 'WH-MAIN' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: '仓库类型', example: 'main' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '地址', example: '茶城 A 区 2 楼' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '是否默认仓库', example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateStockLocationDto {
  @ApiPropertyOptional({ description: '仓库 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '仓位名称', example: 'A-01' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '仓位编码', example: 'A-01' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateWarehouseStatusDto {
  @ApiPropertyOptional({ description: '状态：1 启用，0 停用', example: 0 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status!: number;
}

export class UpdateStockLocationStatusDto {
  @ApiPropertyOptional({ description: '状态：1 启用，0 停用', example: 0 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status!: number;
}
