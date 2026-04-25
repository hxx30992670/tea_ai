import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductUnitDto {
  @ApiProperty({ description: '单位名称', example: '斤' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '排序值', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
