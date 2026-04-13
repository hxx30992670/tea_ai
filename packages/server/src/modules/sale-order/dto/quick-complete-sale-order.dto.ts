import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_METHOD_VALUES, type PaymentMethod } from '../../../common/constants/order-status';
import { CreateSaleOrderDto } from './create-sale-order.dto';

export class QuickCompleteSaleOrderDto extends CreateSaleOrderDto {
  @ApiProperty({ description: '实收金额', example: 200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount!: number;

  @ApiPropertyOptional({ description: '支付方式', example: '微信', enum: PAYMENT_METHOD_VALUES })
  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHOD_VALUES)
  method?: PaymentMethod;
}
