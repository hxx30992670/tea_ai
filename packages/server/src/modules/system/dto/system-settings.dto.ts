import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({ description: '店铺名称', example: '茶掌柜测试门店' })
  @IsOptional()
  @IsString()
  shopName?: string;

  @ApiPropertyOptional({ description: 'AI 授权 key', example: 'sk-tea-demo' })
  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @ApiPropertyOptional({ description: 'AI 提供商', example: 'qwen' })
  @IsOptional()
  @IsString()
  aiProvider?: string;

  @ApiPropertyOptional({ description: '客户自己的模型 API Key', example: 'model-demo-key' })
  @IsOptional()
  @IsString()
  aiModelApiKey?: string;

  @ApiPropertyOptional({ description: '模型名称', example: 'qwen-plus' })
  @IsOptional()
  @IsString()
  aiModelName?: string;

  @ApiPropertyOptional({ description: 'Prompt 服务地址', example: 'https://prompt.example.com' })
  @IsOptional()
  @IsString()
  aiPromptServiceUrl?: string;

  @ApiPropertyOptional({ description: '模型 Base URL', example: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
  @IsOptional()
  @IsString()
  aiModelBaseUrl?: string;

  @ApiPropertyOptional({ description: '行业标识', example: 'tea' })
  @IsOptional()
  @IsString()
  aiIndustry?: string;
}
