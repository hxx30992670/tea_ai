import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleExchangeReturnItemDto, SaleExchangeOutItemDto } from './create-sale-exchange.dto';

export class UpdateSaleExchangeDraftDto {
  @ApiPropertyOptional({ description: '换回明细', type: [SaleExchangeReturnItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleExchangeReturnItemDto)
  returnItems?: SaleExchangeReturnItemDto[];

  @ApiPropertyOptional({ description: '换出明细', type: [SaleExchangeOutItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleExchangeOutItemDto)
  exchangeItems?: SaleExchangeOutItemDto[];

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

  @ApiPropertyOptional({ description: '支付方式', example: 'wechat' })
  @IsOptional()
  method?: string;

  @ApiPropertyOptional({ description: '售后原因编码', example: 'wrong_goods' })
  @IsOptional()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '原因说明' })
  @IsOptional()
  reasonNote?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  remark?: string;
}
