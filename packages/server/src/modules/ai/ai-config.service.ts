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
  private cachedResult: AiAvailability | null = null;
  private cachedAt = 0;
  private readonly CACHE_TTL = 60_000; // 60 秒

  constructor(private readonly systemService: SystemService) {}

  async getAvailability(): Promise<AiAvailability> {
    const now = Date.now();
    if (this.cachedResult && now - this.cachedAt < this.CACHE_TTL) {
      return this.cachedResult;
    }

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
      const r = { enabled: false as const, reason: '未配置 AI 提供商', config: null };
      this.cachedResult = r; this.cachedAt = now;
      return r;
    }

    if (!config.apiKey) {
      const r = { enabled: false as const, reason: '未配置 AI 授权 Key', config: null };
      this.cachedResult = r; this.cachedAt = now;
      return r;
    }

    if (!config.modelApiKey) {
      const r = { enabled: false as const, reason: '未配置模型 API Key', config: null };
      this.cachedResult = r; this.cachedAt = now;
      return r;
    }

    const result: AiAvailability = { enabled: true, reason: '', config };
    this.cachedResult = result;
    this.cachedAt = now;
    return result;
  }

  /** 配置变更时清除缓存 */
  invalidateCache() {
    this.cachedResult = null;
    this.cachedAt = 0;
  }
}
