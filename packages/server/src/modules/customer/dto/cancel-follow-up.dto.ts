import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelFollowUpDto {
  @ApiPropertyOptional({ description: '取消原因', example: '客户主动取消本周拜访，待下月重新约时间。' })
  @IsOptional()
  @IsString()
  reason?: string;
}
