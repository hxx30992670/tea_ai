import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CreateSaleOrderDto } from './create-sale-order.dto';

export class QuickCompleteSaleOrderDto extends CreateSaleOrderDto {
  @ApiProperty({ description: '实收金额', example: 200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount!: number;

  @ApiPropertyOptional({ description: '支付方式', example: '微信' })
  @IsOptional()
  @IsString()
  method?: string;
}
