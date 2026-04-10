/**
 * AI 模型提供商注册表
 * 统一管理不同 AI 提供商（如 Qwen、DeepSeek）的客户端实例
 * 通过依赖注入自动注册所有已实现的 Provider，按需获取对应客户端
 */
import { Injectable } from '@nestjs/common';
import { DeepSeekProviderClient } from './providers/deepseek.provider';
import { ModelProviderClient } from './model-provider.interface';
import { QwenProviderClient } from './providers/qwen.provider';

@Injectable()
export class ModelProviderRegistry {
  private readonly providers: ModelProviderClient[];

  constructor(
    qwenProviderClient: QwenProviderClient,
    deepSeekProviderClient: DeepSeekProviderClient,
  ) {
    // 自动注册所有已实现的 Provider 客户端
    this.providers = [qwenProviderClient, deepSeekProviderClient];
  }

  /** 根据提供商名称获取对应的客户端实例 */
  get(provider: string) {
    return this.providers.find((item) => item.provider === provider) ?? null;
  }
}
