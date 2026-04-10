import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ description: '账号状态 1 启用 0 停用', example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status!: number;
}
