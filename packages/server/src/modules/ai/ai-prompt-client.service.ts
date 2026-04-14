/**
 * AI 提示词客户端服务
 * 负责与外部 Prompt 服务通信，获取 SQL 生成和总结阶段的提示词
 * 支持授权验证、结构化上下文构建及本地降级处理
 */
import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { fetchWithTimeout, getTimeoutMessage } from './fetch-timeout.util';
import { attachRequestSignature } from './request-signature.util';
import { AiAuthorizationResult, AiChatHistoryItem, AiPromptFetchResult, AiRuntimeConfig, AiStructuredContext } from './ai.types';

const PROMPT_SERVICE_TIMEOUT_MS = 15_000;

type PromptRequestMetadata = {
  sessionId?: string;
  questionMode?: 'data' | 'strategy';
  provider?: string;
  model?: string;
  usedSearch?: boolean;
  usedThinking?: boolean;
};

type UsageReportPayload = {
  phase: string;
  sessionId?: string;
  question?: string;
  answer?: string;
  questionMode?: 'data' | 'strategy';
  usedSearch?: boolean;
  usedThinking?: boolean;
  decisionTrace?: Record<string, unknown>;
  latencyMs?: number;
  status?: 'success' | 'rejected' | 'error';
  rejectReason?: string;
  errorMessage?: string;
};

type GuardAnswerPayload = {
  phase: 'summary' | 'vision';
  sessionId?: string;
  question: string;
  answer: string;
  questionMode?: 'data' | 'strategy';
};

@Injectable()
export class AiPromptClientService {
  private readonly logger = new Logger(AiPromptClientService.name);

  /** 授权验证缓存：key → { ok, reason, expireAt } */
  private readonly authCache = new Map<string, { ok: boolean; reason: string; code: AiAuthorizationResult['code']; features: AiAuthorizationResult['features']; expireAt: number }>();
  private readonly AUTH_CACHE_TTL = 5 * 60_000; // 5 分钟

  private toCapabilityCode(code?: string): AiAuthorizationResult['code'] {
    const allowedCodes = new Set<AiAuthorizationResult['code']>([
      'OK',
      'AI_PROVIDER_MISSING',
      'AI_AUTH_KEY_MISSING',
      'AI_MODEL_API_KEY_MISSING',
      'SERVICE_ID_MISSING',
      'PROMPT_SERVICE_URL_MISSING',
      'PROMPT_SERVICE_UNAVAILABLE',
      'PROMPT_SERVICE_REQUEST_FAILED',
      'PROMPT_RESPONSE_INVALID',
      'INDUSTRY_MISMATCH',
      'API_KEY_NOT_FOUND',
      'API_KEY_DISABLED',
      'API_KEY_EXPIRED',
      'LICENSE_UNBOUND',
      'SERVICE_ID_REQUIRED',
      'SERVICE_ID_MISMATCH',
      'SERVICE_ALREADY_BOUND',
      'INSTANCE_LEASE_CONFLICT',
      'QUOTA_EXCEEDED',
      'PROMPT_INJECTION_BLOCKED',
      'REQUEST_SIGNATURE_MISSING',
      'REQUEST_TIMESTAMP_INVALID',
      'REQUEST_SIGNATURE_INVALID',
      'REQUEST_REPLAYED',
      'REQUEST_RATE_LIMITED',
      'REQUEST_COOLDOWN_ACTIVE',
      'FEATURE_DISABLED',
      'PROVIDER_NOT_SUPPORTED',
      'ATTACHMENT_INVALID',
      'MODEL_RESPONSE_INVALID',
      'MODEL_RESULT_INVALID',
      'MODEL_INVOKE_FAILED',
      'AI_RUNTIME_ERROR',
      'AI_INTERNAL_ERROR',
    ]);

    return code && allowedCodes.has(code as AiAuthorizationResult['code'])
      ? (code as AiAuthorizationResult['code'])
      : 'AI_RUNTIME_ERROR';
  }

  async fetchSqlMessages(
    question: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
    metadata?: PromptRequestMetadata,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'sql',
      question,
      history,
      structuredContext,
      ...metadata,
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
    metadata?: PromptRequestMetadata,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'summary', question, sql, rows, history, structuredContext, ...metadata }, config, userId);
  }

  async fetchSqlRetryMessages(
    question: string,
    failedSql: string,
    errorReason: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
    metadata?: PromptRequestMetadata,
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
      ...metadata,
    }, config, userId);
  }

  async fetchQueryErrorMessages(
    question: string,
    errorReason: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
    metadata?: PromptRequestMetadata,
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
      ...metadata,
    }, config, userId);
  }

  async fetchUserRuleExtractMessages(
    question: string,
    answer: string,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[] = [],
    structuredContext?: AiStructuredContext,
    userId?: number,
    metadata?: PromptRequestMetadata,
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
      ...metadata,
    }, config, userId);
  }

  async fetchRecognizeMessages(
    products: Array<{ id: number; name: string; teaType?: string; year?: string; spec?: string; sellPrice?: number; unit?: string; packageUnit?: string }>,
    config: AiRuntimeConfig,
    metadata?: PromptRequestMetadata,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({
      phase: 'recognize',
      question: '',
      products,
      ...metadata,
    }, config);
  }

  async fetchVisionMessages(
    question: string,
    config: AiRuntimeConfig,
    metadata?: PromptRequestMetadata,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'vision', question, ...metadata }, config);
  }

  async fetchAttachmentRouteMessages(
    question: string,
    config: AiRuntimeConfig,
    metadata?: PromptRequestMetadata,
  ): Promise<AiPromptFetchResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, reason: '请在系统设置中配置 AI Agent 服务地址' };
    }

    return this.fetchFromService({ phase: 'attachment-route', question, ...metadata }, config);
  }

  async reportUsageLog(config: AiRuntimeConfig, payload: UsageReportPayload): Promise<void> {
    if (!config.promptServiceUrl) {
      return;
    }

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/usage/report');
    try {
      await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          industry: config.industry,
          provider: config.provider,
          model: config.modelName,
          ...payload,
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);
    } catch (error) {
      const message = getTimeoutMessage(error, 'Usage 服务', PROMPT_SERVICE_TIMEOUT_MS);
      this.logger.warn(`Usage 日志补写失败: ${message}`);
    }
  }

  async guardAnswer(config: AiRuntimeConfig, payload: GuardAnswerPayload): Promise<string> {
    if (!config.promptServiceUrl) {
      return payload.answer;
    }

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/prompt/guard-answer');

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          industry: config.industry,
          ...payload,
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);

      if (!response.ok) {
        return payload.answer;
      }

      const data = (await response.json()) as { data?: { answer?: string } };
      return data?.data?.answer ?? payload.answer;
    } catch {
      return payload.answer;
    }
  }

  async verifyAuthorization(
    config: AiRuntimeConfig,
    requiredFeature?: 'allowLocalQuery' | 'allowStrategyMode' | 'allowWebSearch' | 'allowThinking' | 'allowLocalGrounding' | 'allowAttachmentRecognition',
  ): Promise<AiAuthorizationResult> {
    if (!config.promptServiceUrl) {
      return { ok: false, code: 'PROMPT_SERVICE_URL_MISSING', reason: '请在系统设置中配置 AI Agent 服务地址', features: null };
    }

    if (!config.serviceUniqueId) {
      return { ok: false, code: 'SERVICE_ID_MISSING', reason: '请先配置服务实例标识', features: null };
    }

    // 命中缓存则直接返回
    const cacheKey = `${config.apiKey}:${config.serviceUniqueId}:${config.instanceToken}:${requiredFeature ?? 'none'}`;
    const cached = this.authCache.get(cacheKey);
    if (cached && Date.now() < cached.expireAt) {
      return { ok: cached.ok, reason: cached.reason, code: cached.code, features: cached.features };
    }

    try {
      let data = await this.postLicense(config, '/api/license/verify', requiredFeature);

      if (!data.valid && /尚未绑定服务实例/.test(data.reason || '')) {
        data = await this.postLicense(config, '/api/license/bind', requiredFeature);
      }

      if (!data.valid) {
        const reason = data.reason || 'AI 授权 Key 无效';
        const result: AiAuthorizationResult = { ok: false, code: this.toCapabilityCode(data.code), reason, features: data.features };
        this.authCache.set(cacheKey, { ...result, expireAt: Date.now() + 30_000 });
        return result;
      }

      if (data.industry && data.industry !== config.industry) {
        const reason = `AI 行业不匹配：当前 key 属于 ${data.industry}`;
        return { ok: false, code: 'INDUSTRY_MISMATCH', reason, features: data.features };
      }

      const result: AiAuthorizationResult = { ok: true, code: 'OK', reason: '', features: data.features };
      this.authCache.set(cacheKey, { ...result, expireAt: Date.now() + this.AUTH_CACHE_TTL });
      return result;
    } catch (error) {
      const message = getTimeoutMessage(error, 'Agent 授权服务', PROMPT_SERVICE_TIMEOUT_MS);
      return { ok: false, code: 'PROMPT_SERVICE_UNAVAILABLE', reason: `Agent 授权服务不可用: ${message}`, features: null };
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
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          industry: config.industry,
          previousContext,
          rows,
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);

      if (!response.ok) {
        this.logger.warn(`Context 服务请求失败，降级为本地模式: HTTP ${response.status}`);
        return this.localBuildStructuredContext(previousContext, rows);
      }

      const data = (await response.json()) as { data?: AiStructuredContext };
      return data?.data ?? this.localBuildStructuredContext(previousContext, rows);
    } catch (error) {
      const message = getTimeoutMessage(error, 'Context 服务', PROMPT_SERVICE_TIMEOUT_MS);
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
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          industry: config.industry,
          ...(userId != null ? { userId } : {}),
          ...payload,
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);

      if (!response.ok) {
        const errorBody = await this.readErrorBody(response);
        return {
          ok: false,
          code: this.toCapabilityCode(errorBody.code ?? 'PROMPT_SERVICE_REQUEST_FAILED'),
          reason: errorBody.reason ?? `Prompt 服务请求失败: HTTP ${response.status}`,
        };
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
        return { ok: false, code: 'PROMPT_RESPONSE_INVALID', reason: 'Prompt 服务未返回有效 messages' };
      }

      return {
        ok: true,
        messages,
        promptVersion: data?.data?.version,
      };
    } catch (error) {
      const message = getTimeoutMessage(error, 'Prompt 服务', PROMPT_SERVICE_TIMEOUT_MS);
      this.logger.error(`Prompt 服务不可用: ${message}`);
      return { ok: false, code: 'PROMPT_SERVICE_UNAVAILABLE', reason: `Prompt 服务不可用: ${message}` };
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
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          userId,
          rule,
          sourceMessage,
          phase,
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  private normalizeUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private buildSecurePayload(config: AiRuntimeConfig, payload: Record<string, unknown>) {
    return attachRequestSignature(config, payload);
  }

  private async postLicense(
    config: AiRuntimeConfig,
    path: string,
    requiredFeature?: 'allowLocalQuery' | 'allowStrategyMode' | 'allowWebSearch' | 'allowThinking' | 'allowLocalGrounding' | 'allowAttachmentRecognition',
  ) {
    const endpoint = this.normalizeUrl(config.promptServiceUrl, path);
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildSecurePayload(config, {
        apiKey: config.apiKey,
        serviceUniqueId: config.serviceUniqueId,
        instanceToken: config.instanceToken,
        hostname: hostname(),
        requiredFeature,
      })),
    }, PROMPT_SERVICE_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: {
        valid?: boolean;
        code?: string;
        reason?: string;
        industry?: string;
        features?: AiAuthorizationResult['features'];
      };
    };

    return {
      valid: !!data?.data?.valid,
      code: data?.data?.code ?? '',
      reason: data?.data?.reason ?? '',
      industry: data?.data?.industry ?? '',
      features: data?.data?.features ?? null,
    };
  }

  async heartbeatLicense(config: AiRuntimeConfig): Promise<void> {
    if (!config.promptServiceUrl || !config.apiKey || !config.serviceUniqueId || !config.instanceToken) {
      return;
    }

    const endpoint = this.normalizeUrl(config.promptServiceUrl, '/api/license/heartbeat');

    try {
      await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildSecurePayload(config, {
          apiKey: config.apiKey,
          serviceUniqueId: config.serviceUniqueId,
          instanceToken: config.instanceToken,
          hostname: hostname(),
        })),
      }, PROMPT_SERVICE_TIMEOUT_MS);
    } catch (error) {
      const message = getTimeoutMessage(error, 'Agent 心跳服务', PROMPT_SERVICE_TIMEOUT_MS);
      this.logger.warn(`License 心跳上报失败: ${message}`);
    }
  }

  private async readErrorBody(response: { json: () => Promise<unknown> }) {
    try {
      const payload = (await response.json()) as {
        message?: string | { code?: string; reason?: string };
      };
      if (typeof payload?.message === 'string') {
        return { reason: payload.message };
      }

      return {
        code: payload?.message?.code,
        reason: payload?.message?.reason,
      };
    } catch {
      return {};
    }
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
