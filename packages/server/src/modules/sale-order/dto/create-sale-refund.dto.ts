import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_METHOD_VALUES, type PaymentMethod } from '../../../common/constants/order-status';

export class CreateSaleRefundDto {
  @ApiProperty({ description: '退款金额', example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: '退款方式', example: '微信', enum: PAYMENT_METHOD_VALUES })
  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHOD_VALUES)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: '售后原因编码', example: 'price_adjustment' })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '原因说明', example: '客户投诉口感偏淡，补差价 20 元' })
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiPropertyOptional({ description: '备注', example: '仅退款不退货' })
  @IsOptional()
  @IsString()
  remark?: string;
}
