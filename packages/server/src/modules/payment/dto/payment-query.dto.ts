import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaymentQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @ApiPropertyOptional({ description: '记录类型 receive/pay', example: 'receive' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '关联类型', example: 'sale_order' })
  @IsOptional()
  @IsString()
  relatedType?: string;

  @ApiPropertyOptional({ description: '支付方式', example: '微信' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: '开始日期 YYYY-MM-DD', example: '2026-04-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD', example: '2026-04-30' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
