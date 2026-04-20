import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FollowUpQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 3;

  @ApiPropertyOptional({ description: '客户 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional({ description: '关键词，匹配计划内容/反馈内容', example: '报价' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '跟进状态：pending/completed/cancelled/overdue', example: 'overdue' })
  @IsOptional()
  @IsIn(['pending', 'completed', 'cancelled', 'overdue'])
  status?: 'pending' | 'completed' | 'cancelled' | 'overdue';

  @ApiPropertyOptional({ description: '跟进方式：call/wechat/visit/other', example: 'wechat' })
  @IsOptional()
  @IsIn(['call', 'wechat', 'visit', 'other'])
  followType?: 'call' | 'wechat' | 'visit' | 'other';

  @ApiPropertyOptional({ description: '计划跟进开始时间', example: '2026-04-01T00:00:00' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '计划跟进结束时间', example: '2026-04-30T23:59:59' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
