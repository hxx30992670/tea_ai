/**
 * AI 配置服务
 * 从系统设置中读取 AI 配置（提供商、模型、API Key 等）
 * 校验配置完整性，返回 AI 模块运行所需的全部参数
 */
import { Injectable } from '@nestjs/common';
import { SystemService } from '../system/system.service';
import { AiAvailability, AiRuntimeConfig } from './ai.types';

@Injectable()
export class AiConfigService {
  constructor(private readonly systemService: SystemService) {}

  async getAvailability(): Promise<AiAvailability> {
    const settings = await this.systemService.getAllSettings();
    const config: AiRuntimeConfig = {
      provider: settings.aiProvider?.trim() ?? '',
      modelName: settings.aiModelName?.trim() ?? '',
      modelApiKey: settings.aiModelApiKey?.trim() ?? '',
      modelBaseUrl: settings.aiModelBaseUrl?.trim() ?? '',
      apiKey: settings.aiApiKey?.trim() ?? '',
      promptServiceUrl: settings.aiPromptServiceUrl?.trim() ?? '',
      industry: settings.aiIndustry?.trim() || 'tea',
    };

    if (!config.provider) {
      return { enabled: false, reason: '未配置 AI 提供商', config: null };
    }

    if (!config.apiKey) {
      return { enabled: false, reason: '未配置 AI 授权 Key', config: null };
    }

    if (!config.modelApiKey) {
      return { enabled: false, reason: '未配置模型 API Key', config: null };
    }

    return { enabled: true, reason: '', config };
  }
}
