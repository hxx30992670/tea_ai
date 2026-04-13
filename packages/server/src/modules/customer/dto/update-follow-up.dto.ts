import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ description: '跟进内容', example: '客户反馈礼盒规格偏大，计划推荐 200g 小规格。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '跟进方式：call=电话 / wechat=微信 / visit=上门 / other=其他', example: 'wechat' })
  @IsOptional()
  @IsIn(['call', 'wechat', 'visit', 'other'])
  followType?: 'call' | 'wechat' | 'visit' | 'other';

  @ApiPropertyOptional({ description: '意向等级：high=高意向 / medium=一般 / low=暂无需求 / lost=已流失', example: 'medium' })
  @IsOptional()
  @IsIn(['high', 'medium', 'low', 'lost'])
  intentLevel?: 'high' | 'medium' | 'low' | 'lost';

  @ApiPropertyOptional({ description: '计划跟进时间', example: '2026-04-20T09:30:00.000Z' })
  @IsOptional()
  @IsString()
  nextFollowDate?: string;
}
