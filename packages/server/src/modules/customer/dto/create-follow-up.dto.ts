import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateFollowUpDto {
  @ApiProperty({ description: '客户 ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId!: number;

  @ApiProperty({ description: '跟进内容', example: '客户反馈春茶礼盒意向较高，下周回访。' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: '跟进方式：call=电话 / wechat=微信 / visit=上门 / other=其他', example: 'call' })
  @IsOptional()
  @IsIn(['call', 'wechat', 'visit', 'other'])
  followType?: 'call' | 'wechat' | 'visit' | 'other';

  @ApiPropertyOptional({ description: '意向等级：high=高意向 / medium=一般 / low=暂无需求 / lost=已流失', example: 'high' })
  @IsOptional()
  @IsIn(['high', 'medium', 'low', 'lost'])
  intentLevel?: 'high' | 'medium' | 'low' | 'lost';

  @ApiPropertyOptional({ description: '下次跟进时间', example: '2026-04-10T10:00:00.000Z' })
  @IsOptional()
  @IsString()
  nextFollowDate?: string;
}
