/**
 * AI 提示词客户端服务
 * 负责与外部 Prompt 服务通信，获取 SQL 生成和总结阶段的提示词
 * 支持授权验证、结构化上下文构建及本地降级处理
 */
import { Injectable, Logger } from '@nestjs/common';
import { AiChatHistoryItem, AiPromptFetchResult, AiRuntimeConfig, AiStructuredContext } from './ai.types';

@Injectable()
export class AiPromptClientService {
  private readonly logger = new Logger(AiPromptClientService.name);

  /** 授权验证缓存：key → { ok, reason, expireAt } */
  private readonly authCache = new Map<string, { ok: boolean; reason: string; expireAt: number }>();
  private readonly AUTH_CACHE_TTL = 5 * 60_000; // 5 分钟

  async fetchSqlMessages(
    question: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'sql',
      question,
      history,
      structuredContext,
    }, config, userId);
  }

  async fetchSummaryMessages(
    question: string,
    sql: string,
    rows: Record<string, unknown>[],
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'summary', question, sql, rows, history, structuredContext }, config, userId);
  }

  async fetchSqlRetryMessages(
    question: string,
    failedSql: string,
    errorReason: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'sql-retry',
      question,
      failedSql,
      errorReason,
      history,
      structuredContext,
    }, config, userId);
  }

  async fetchQueryErrorMessages(
    question: string,
    errorReason: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'query-error',
      question,
      errorReason,
      history,
      structuredContext,
    }, config, userId);
  }

  async fetchUserRuleExtractMessages(
    question: string,
    answer: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'user-rule-extract',
      question,
      answer,
      history,
      structuredContext,
    }, config, userId);
  }

  async fetchRecognizeMessages(
    products: Array<{ id: number; name: string; teaType?: string; year?: string; spec?: string; sellPrice?: number; unit?: string; packageUnit?: string }>,
    config: AiRuntimeConfig,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'recognize',
      question: '',
      products,
    }, config);
  }

  async fetchVisionMessages(
    question: string,
    config: AiRuntimeConfig,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'vision', question }, config);
  }

  async fetchAttachmentRouteMessages(
    question: string,
    config: AiRuntimeConfig,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'attachment-route', question }, config);
  }

  async verifyAuthorization(config: AiRuntimeConfig): Promise<{ ok: boolean; reason: string }> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    // 命中缓存则直接返回
    const cacheKey = config.apiKey;
    const cached = this.authCache.get(cacheKey);
    if (cached && Date.now() < cached.expireAt) {
      return { ok: cached.ok, reason: cached.reason };
    }

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/key/verify');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: config.apiKey }),
      });

      if (!response.ok) {
        return { ok: false, reason: `Agent 授权服务不可用: HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        data?: { valid?: boolean; reason?: string; industry?: string };
      };

      if (!data?.data?.valid) {
        const reason = data?.data?.reason || 'AI 授权 Key 无效';
        this.authCache.set(cacheKey, { ok: false, reason, expireAt: Date.now() + 30_000 }); // 失败缓存 30s
        return { ok: false, reason };
      }

      if (data.data.industry && data.data.industry !== config.industry) {
        const reason = `AI 行业不匹配：当前 key 属于 ${data.data.industry}`;
        return { ok: false, reason };
      }

      this.authCache.set(cacheKey, { ok: true, reason: '', expireAt: Date.now() + this.AUTH_CACHE_TTL });
      return { ok: true, reason: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return { ok: false, reason: `Agent 授权服务不可用: ${message}` };
    }
  }

  async buildStructuredContext(
    config: AiRuntimeConfig,
    previousContext: AiStructuredContext,
    rows: Record<string, unknown>[],
  ): Promise<AiStructuredContext> {
    if (!config.promptServiceUrl) {
      return this.localBuildStructuredContext(previousContext, rows);
    }

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/context/build');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: config.apiKey,
          industry: config.industry,
          previousContext,
          rows,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Context 服务请求失败，降级为本地模式: HTTP ${response.status}`);
        return this.localBuildStructuredContext(previousContext, rows);
      }

      const data = (await response.json()) as { data?: AiStructuredContext };
      return data?.data ?? this.localBuildStructuredContext(previousContext, rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Context 服务不可用，降级为本地模式: ${message}`);
      return this.localBuildStructuredContext(previousContext, rows);
    }
  }

  private async fetchFromService(
    payload: Record<string, unknown>,
    config: AiRuntimeConfig,
    userId?: number,
  ): Promise<AiPromptFetchResult> {
    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/prompt/generate');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: config.apiKey,
          industry: config.industry,
          ...(userId != null ? { userId } : {}),
          ...payload,
        }),
      });

      if (!response.ok) {
        return { ok: false, reason: `Prompt 服务请求失败: HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        code?: number;
        data?: {
          messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
          version?: string;
        };
      };

      const messages = data?.data?.messages;
      if (!messages || messages.length === 0) {
        return { ok: false, reason: 'Prompt 服务未返回有效 messages' };
      }

      return {
        ok: true,
        messages,
        promptVersion: data?.data?.version,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Prompt 服务不可用: ${message}`);
      return { ok: false, reason: `Prompt 服务不可用: ${message}` };
    }
  }

  /** 向 prompt-center 推送用户自定义规则 */
  async pushUserRule(
    config: AiRuntimeConfig,
    userId: number,
    rule: string,
    sourceMessage?: string,
    phase?: string,
  ): Promise<{ ok: boolean }> {
    if (!config.promptServiceUrl) return { ok: false };

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/user-rule/create');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.apiKey,
          userId,
          rule,
          sourceMessage,
          phase,
        }),
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  private normalizeUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private localBuildStructuredContext(
    previousContext: AiStructuredContext,
    rows: Record<string, unknown>[],
  ): AiStructuredContext {
    const currentContext: AiStructuredContext = {
      orderNos: this.collectRowValues(rows, ['orderNo', 'order_no']),
      returnNos: this.collectRowValues(rows, ['returnNo', 'return_no']),
      refundNos: this.collectRowValues(rows, ['refundNo', 'refund_no']),
      exchangeNos: this.collectRowValues(rows, ['exchangeNo', 'exchange_no']),
      customerNames: this.collectRowValues(rows, ['customerName', 'customer_name']),
      customerContacts: this.collectRowValues(rows, ['contactName', 'contact_name']),
      customerPhones: this.collectRowValues(rows, ['phone']),
      supplierNames: this.collectRowValues(rows, ['supplierName', 'supplier_name']),
      productNames: this.collectRowValues(rows, ['productName', 'product_name']),
      reasonCodes: this.collectRowValues(rows, ['reasonCode', 'reason_code']),
    };

    return {
      orderNos: this.mergeContextList(previousContext.orderNos, currentContext.orderNos),
      returnNos: this.mergeContextList(previousContext.returnNos, currentContext.returnNos),
      refundNos: this.mergeContextList(previousContext.refundNos, currentContext.refundNos),
      exchangeNos: this.mergeContextList(previousContext.exchangeNos, currentContext.exchangeNos),
      customerNames: this.mergeContextList(previousContext.customerNames, currentContext.customerNames),
      customerContacts: this.mergeContextList(previousContext.customerContacts, currentContext.customerContacts),
      customerPhones: this.mergeContextList(previousContext.customerPhones, currentContext.customerPhones),
      supplierNames: this.mergeContextList(previousContext.supplierNames, currentContext.supplierNames),
      productNames: this.mergeContextList(previousContext.productNames, currentContext.productNames),
      reasonCodes: this.mergeContextList(previousContext.reasonCodes, currentContext.reasonCodes),
    };
  }

  private mergeContextList(current: string[] | undefined, next: string[] | undefined) {
    return [...new Set([...(current ?? []), ...(next ?? [])])].slice(0, 6);
  }

  private collectRowValues(rows: Record<string, unknown>[], keys: string[]) {
    const values = rows.flatMap((row) =>
      keys
        .map((key) => row[key])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    );

    return [...new Set(values)].slice(0, 6);
  }
}
