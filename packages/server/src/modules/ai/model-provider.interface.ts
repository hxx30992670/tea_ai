import { AiModelInvokeOptions, AiModelInvokeResult, AiPromptMessage, AiRuntimeConfig } from './ai.types';

export interface ModelProviderClient {
  provider: string;
  /** 非流式调用，用于 SQL 生成阶段（需要完整结果才能执行） */
  invoke(messages: AiPromptMessage[], config: AiRuntimeConfig, options?: AiModelInvokeOptions): Promise<AiModelInvokeResult>;
  /** 流式调用，用于总结阶段（逐 token 回调，实现 SSE 效果） */
  invokeStream?(
    messages: AiPromptMessage[],
    config: AiRuntimeConfig,
    onChunk: (chunk: string) => void,
    options?: AiModelInvokeOptions,
  ): Promise<AiModelInvokeResult>;
}
