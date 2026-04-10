import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSaleRefundDto {
  @ApiProperty({ description: '退款金额', example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: '退款方式', example: '微信' })
  @IsOptional()
  @IsString()
  method?: string;

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
