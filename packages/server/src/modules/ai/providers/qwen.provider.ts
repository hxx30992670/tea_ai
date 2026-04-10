import { Injectable, Logger } from '@nestjs/common';
import { AiModelInvokeResult, AiPromptMessage, AiRuntimeConfig } from '../ai.types';
import { ModelProviderClient } from '../model-provider.interface';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function buildEndpoint(baseUrl: string) {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

@Injectable()
export class QwenProviderClient implements ModelProviderClient {
  readonly provider = 'qwen';
  private readonly logger = new Logger(QwenProviderClient.name);

  /** 非流式调用（SQL 生成阶段） */
  async invoke(messages: AiPromptMessage[], config: AiRuntimeConfig): Promise<AiModelInvokeResult> {
    const url = buildEndpoint(config.modelBaseUrl);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.modelApiKey}`,
        },
        body: JSON.stringify({
          model: config.modelName || 'qwen-plus',
          messages,
          temperature: 0.1,
          enable_thinking: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.logger.warn(`Qwen invoke HTTP ${response.status}: ${errText}`);
        return { ok: false, reason: `Qwen 调用失败 (HTTP ${response.status}): ${errText}` };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) return { ok: false, reason: 'Qwen 返回内容为空' };

      return { ok: true, content, raw: data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Qwen invoke 异常: ${msg}`);
      return { ok: false, reason: `Qwen 调用异常: ${msg}` };
    }
  }

  /** 流式调用（总结阶段） */
  async invokeStream(
    messages: AiPromptMessage[],
    config: AiRuntimeConfig,
    onChunk: (chunk: string) => void,
  ): Promise<AiModelInvokeResult> {
    const url = buildEndpoint(config.modelBaseUrl);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.modelApiKey}`,
        },
        body: JSON.stringify({
          model: config.modelName || 'qwen-plus',
          messages,
          temperature: 0.3,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return { ok: false, reason: `Qwen 流式调用失败 (HTTP ${response.status}): ${errText}` };
      }
      if (!response.body) return { ok: false, reason: 'Qwen 返回流为空' };

      return await this.readStream(response.body, onChunk);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Qwen invokeStream 异常: ${msg}`);
      return { ok: false, reason: `Qwen 流式调用异常: ${msg}` };
    }
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void,
  ): Promise<AiModelInvokeResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const chunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (chunk) { fullContent += chunk; onChunk(chunk); }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent
      ? { ok: true, content: fullContent }
      : { ok: false, reason: 'Qwen 流式返回内容为空' };
  }
}
