import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_METHOD_VALUES, type PaymentMethod } from '../../../common/constants/order-status';

export class SaleExchangeReturnItemDto {
  @ApiProperty({ description: '原销售明细 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleOrderItemId!: number;

  @ApiPropertyOptional({ description: '换回数量（基准单位）', example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '换回包装数量', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packageQty?: number;

  @ApiPropertyOptional({ description: '换回散数量（基准单位）', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  looseQty?: number;
}

export class SaleExchangeOutItemDto {
  @ApiProperty({ description: '换出商品 ID', example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiPropertyOptional({ description: '换出数量（基准单位）', example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '换出包装数量', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packageQty?: number;

  @ApiPropertyOptional({ description: '换出散数量（基准单位）', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  looseQty?: number;

  @ApiProperty({ description: '换出单价', example: 88 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateSaleExchangeDto {
  @ApiPropertyOptional({ description: '保存为草稿（不立即执行库存与支付动作）', example: false, default: false })
  @IsOptional()
  saveAsDraft?: boolean;

  @ApiProperty({ description: '换回明细', type: [SaleExchangeReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleExchangeReturnItemDto)
  returnItems!: SaleExchangeReturnItemDto[];

  @ApiProperty({ description: '换出明细', type: [SaleExchangeOutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleExchangeOutItemDto)
  exchangeItems!: SaleExchangeOutItemDto[];

  @ApiPropertyOptional({ description: '本次退款金额', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({ description: '本次补差收款金额', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receiveAmount?: number;

  @ApiPropertyOptional({ description: '退款或补差收款方式', example: '微信', enum: PAYMENT_METHOD_VALUES })
  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHOD_VALUES)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: '售后原因编码', example: 'wrong_goods' })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '原因说明', example: '顾客收到茶型不符，改换同价位商品' })
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiPropertyOptional({ description: '备注', example: '只支持等价或降价换货' })
  @IsOptional()
  @IsString()
  remark?: string;
}
