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

class SaleReturnItemDto {
  @ApiProperty({ description: '原销售明细 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleOrderItemId!: number;

  @ApiPropertyOptional({ description: '退货数量（基准单位）', example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '包装数量', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  packageQty?: number;

  @ApiPropertyOptional({ description: '散数量（基准单位）', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  looseQty?: number;
}

export class CreateSaleReturnDto {
  @ApiProperty({ description: '退货明细', type: [SaleReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnItemDto)
  items!: SaleReturnItemDto[];

  @ApiPropertyOptional({ description: '本次退款金额，默认为 0', example: 128 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({ description: '售后原因编码', example: 'taste_issue' })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '原因说明', example: '客户反馈口感不适合' })
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiPropertyOptional({ description: '退款方式', example: '微信' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: '退货备注', example: '客户反馈部分茶叶口感不符，退回 1 份' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export { SaleReturnItemDto };
