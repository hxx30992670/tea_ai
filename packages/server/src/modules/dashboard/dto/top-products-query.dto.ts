import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class TopProductsQueryDto {
  @ApiPropertyOptional({ description: '排行类型', example: 'top', enum: ['top', 'slow'], default: 'top' })
  @IsOptional()
  @IsIn(['top', 'slow'])
  type?: 'top' | 'slow' = 'top';

  @ApiPropertyOptional({ description: '返回数量', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}
