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

class PurchaseReturnItemDto {
  @ApiProperty({ description: '原采购明细 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseOrderItemId!: number;

  @ApiPropertyOptional({ description: '退货数量（基准单位）', example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '包装数量', example: 1 })
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
}

export class CreatePurchaseReturnDto {
  @ApiProperty({ description: '退货明细', type: [PurchaseReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items!: PurchaseReturnItemDto[];

  @ApiPropertyOptional({ description: '本次供应商退款金额，默认为 0', example: 128 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({ description: '退款方式', example: '转账', enum: PAYMENT_METHOD_VALUES })
  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHOD_VALUES)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: '退货备注', example: '来货瑕疵，退回 2 包并申请退款' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export { PurchaseReturnItemDto };
