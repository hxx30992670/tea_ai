import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AiTestDto {
  @ApiProperty({ description: 'AI 授权 Key', example: 'sk-tea-demo-local' })
  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @ApiProperty({ description: 'AI Agent 服务地址', example: 'http://127.0.0.1:3010' })
  @IsString()
  @IsNotEmpty()
  promptServiceUrl!: string;

  @ApiPropertyOptional({ description: '服务实例唯一标识，由后端自动生成并持久化', example: 'smartstock-shop-001' })
  @IsOptional()
  @IsString()
  serviceUniqueId?: string;

  @ApiPropertyOptional({ description: '实例令牌，由后端自动生成并持久化', example: 'inst-demo-001' })
  @IsOptional()
  @IsString()
  instanceToken?: string;

  @ApiProperty({ description: '提供商', example: 'qwen' })
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @ApiProperty({ description: '模型 API Key' })
  @IsString()
  @IsNotEmpty()
  modelApiKey!: string;

  @ApiProperty({ description: '模型名称', example: 'qwen-plus' })
  @IsString()
  @IsNotEmpty()
  modelName!: string;

  @ApiProperty({ description: 'Base URL', example: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
  @IsString()
  @IsNotEmpty()
  modelBaseUrl!: string;
}
