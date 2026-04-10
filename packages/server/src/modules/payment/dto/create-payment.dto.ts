import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_RECORD_TYPE } from '../../../common/constants/order-status';

export class CreatePaymentDto {
  @ApiProperty({ description: '记录类型', example: 'receive', enum: [PAYMENT_RECORD_TYPE.RECEIVE, PAYMENT_RECORD_TYPE.PAY] })
  @IsString()
  @IsIn([PAYMENT_RECORD_TYPE.RECEIVE, PAYMENT_RECORD_TYPE.PAY])
  type!: 'receive' | 'pay';

  @ApiProperty({ description: '关联类型', example: 'sale_order', enum: ['sale_order', 'purchase_order'] })
  @IsString()
  @IsIn(['sale_order', 'purchase_order'])
  relatedType!: 'sale_order' | 'purchase_order';

  @ApiProperty({ description: '关联订单 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  relatedId!: number;

  @ApiProperty({ description: '金额', example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: '支付方式', example: '微信' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: '备注', example: '客户已支付部分货款' })
  @IsOptional()
  @IsString()
  remark?: string;
}
