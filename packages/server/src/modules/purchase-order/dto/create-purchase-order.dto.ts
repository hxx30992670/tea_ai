import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class PurchaseOrderItemDto {
  @ApiProperty({ description: '商品 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiPropertyOptional({ description: '采购数量（基准单位）', example: 5 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '包装数量', example: 10 })
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

  @ApiProperty({ description: '采购单价', example: 28 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({ description: '供应商 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;

  @ApiPropertyOptional({ description: '备注', example: '采购订单联调' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({ description: '采购明细', type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export { PurchaseOrderItemDto };
