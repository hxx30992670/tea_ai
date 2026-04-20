import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteFollowUpDto {
  @ApiProperty({ description: '本次真实跟进反馈', example: '已电话沟通，客户对老班章散茶有兴趣，准备本周发报价单。' })
  @IsString()
  feedback!: string;

  @ApiPropertyOptional({ description: '实际跟进方式：call=电话 / wechat=微信 / visit=上门 / other=其他', example: 'call' })
  @IsOptional()
  @IsIn(['call', 'wechat', 'visit', 'other'])
  followType?: 'call' | 'wechat' | 'visit' | 'other';

  @ApiPropertyOptional({ description: '跟进后的客户意向：high=高意向 / medium=一般 / low=暂无需求 / lost=已流失', example: 'high' })
  @IsOptional()
  @IsIn(['high', 'medium', 'low', 'lost'])
  intentLevel?: 'high' | 'medium' | 'low' | 'lost';
}
