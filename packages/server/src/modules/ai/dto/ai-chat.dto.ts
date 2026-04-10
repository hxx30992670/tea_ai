import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class AiAttachmentDto {
  @ApiProperty({ enum: ['image', 'text'] })
  @IsString()
  @IsIn(['image', 'text'])
  type!: 'image' | 'text';

  @ApiProperty({ description: 'image: base64 数据URL；text: 文件原始文字内容' })
  @IsString()
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  filename?: string;
}

class AiChatHistoryItemDto {
  @ApiProperty({ description: '消息角色', example: 'user', enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ description: '消息内容', example: '今天的销售有多少？' })
  @IsString()
  @MinLength(1)
  content!: string;
}

export class AiChatDto {
  @ApiProperty({ description: '用户问题', example: '今天哪些商品需要补货？' })
  @IsString()
  @MinLength(1)
  question!: string;

  @ApiPropertyOptional({ description: '会话 ID，不传则自动创建新会话', example: 'sess_1712345678901' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '最近几轮对话上下文，按时间顺序传入，建议最多 6 条',
    type: [AiChatHistoryItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatHistoryItemDto)
  history?: AiChatHistoryItemDto[];

  @ApiPropertyOptional({ description: '上传的图片或文件内容', type: AiAttachmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiAttachmentDto)
  attachment?: AiAttachmentDto;
}
