import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AiTestDto {
  @ApiProperty({ description: 'AI 授权 Key', example: 'sk-tea-demo-local' })
  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @ApiProperty({ description: 'AI Agent 服务地址', example: 'http://127.0.0.1:3010' })
  @IsString()
  @IsNotEmpty()
  promptServiceUrl!: string;

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
