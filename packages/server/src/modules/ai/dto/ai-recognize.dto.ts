import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AiAttachmentDto } from './ai-chat.dto';

export class AiRecognizeProductDto {
  @IsNumber()
  @Type(() => Number)
  id!: number;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  teaType?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  spec?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sellPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  packageUnit?: string;

  @IsOptional()
  @IsString()
  matchText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

export class AiRecognizeDto {
  @ApiProperty({ description: '要识别的模块', example: 'sale-order', enum: ['sale-order'] })
  @IsString()
  @IsIn(['sale-order'])
  module!: 'sale-order';

  @ApiProperty({ description: '附件（图片 base64 或文本内容）', type: AiAttachmentDto })
  @ValidateNested()
  @Type(() => AiAttachmentDto)
  attachment!: AiAttachmentDto;

  @ApiPropertyOptional({ description: '商品目录（用于 AI 精准匹配商品 ID）', type: [AiRecognizeProductDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AiRecognizeProductDto)
  products?: AiRecognizeProductDto[];
}
