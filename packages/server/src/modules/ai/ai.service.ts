import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthUser } from '../../common/types/auth-user.type';
import { AiConversationEntity } from '../../entities/ai-conversation.entity';
import { ProductEntity } from '../../entities/product.entity';
import { DashboardService } from '../dashboard/dashboard.service';
import { AiConfigService } from './ai-config.service';
import { AiPromptClientService } from './ai-prompt-client.service';
import { AiSqlService } from './ai-sql.service';
import { extractSqlFromContent, formatRowsForSummary } from './ai-sql.util';
import { AiHistoryQueryDto } from './dto/ai-history-query.dto';
import { AiTestDto } from './dto/ai-test.dto';
import { AiAttachment, AiChatHistoryItem, AiContentPart, AiPromptMessage, AiRuntimeConfig, AiStructuredContext } from './ai.types';
import { ModelProviderClient } from './model-provider.interface';
import { ModelProviderRegistry } from './model-provider.registry';

/** SSE 事件发射器类型 */
type SseEmitter = (event: string, data: unknown) => void;

type AiSuggestion = {
  type: string;
  productId?: number;
  content: string;
};

type AiRecognizedSaleOrderItem = {
  customerName: string | null;
  lineText: string | null;
  productName: string;
  productId: number | null;
  quantity: number | null;
  quantityUnit: string | null;
  subtotal: number | null;
  unitPrice: number | null;
};

type AiRecognizedSaleOrder = {
  customerName: string | null;
  items: AiRecognizedSaleOrderItem[];
  remark: string | null;
  paidAmount: number | null;
  paymentMethod: string | null;
};

type AiAttachmentIntent =
  | 'recognize'
  | 'query_sale_order'
  | 'query_purchase_order'
  | 'query_customer'
  | 'query_supplier'
  | 'query_general';

type AiAttachmentRoute = {
  intent: AiAttachmentIntent;
  recognizedText: string;
  queryRewrite: string | null;
};

type AiQuestionMode = 'data' | 'strategy';

type StrategyQuestionResolution = {
  mode: AiQuestionMode;
  effectiveQuestion: string;
  summaryQuestion?: string;
};

const STRATEGY_CITY_CLARIFY_ANSWER = '要按当前城市做本地化方案，我先需要知道城市名。请直接告诉我是哪个城市，比如“贵阳市”或“昆明市”，我再一次性结合销量、天气和当地茶文化给您生成方案。';
const MUNICIPALITY_CITY_NAMES = ['北京', '上海', '天津', '重庆', '香港', '澳门'];
const STRATEGY_CITY_KEYWORD_RE = /(当前城市|哪个城市|本地|当地|同城|地域|按城市|城市情况|天气|茶文化|商圈)/;
const STRATEGY_CITY_FOLLOWUP_HINTS = [
  STRATEGY_CITY_CLARIFY_ANSWER,
  '补充城市名后，可进一步细化到天气、茶文化和活动节奏',
];
const LOCAL_GROUNDING_FOLLOWUP_RE = /(落地|具体怎么弄|怎么落地|哪边比较好|预算|费用|多少钱|对接|联系人|联系电话|公开电话|商圈|茶城|商场|广场|摆点|快闪|地推|物业|招商)/;

function buildCurrentDateAnchor() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `【系统当前日期】${year}-${month}-${day}`;
}

function detectQuestionMode(question: string): AiQuestionMode {
  const normalized = question.trim();
  if (!normalized) return 'data';

  const strategyRe = /(营销|促销|活动|推广|运营|经营).*(方案|建议|策略|计划)|根据.*(销售|销量|订单|经营|客户|退货|复购).*(方案|建议|策略|计划)|怎么做活动|怎么促销|如何提高销量|如何提升复购|哪里适合搞活动|去哪里搞活动|哪些商圈|哪些茶城|哪些商场|哪些广场|人流量|租金|租一块|摆点|快闪|地推|对接部门|联系人|联系电话|怎么落地|具体落地/;
  return strategyRe.test(normalized) ? 'strategy' : 'data';
}

function isLocalGroundingStrategy(question: string) {
  return /(哪里适合搞活动|去哪里搞活动|哪些商圈|哪些茶城|哪些商场|哪些广场|人流量|租金|租一块|摆点|快闪|地推|对接部门|联系人|联系电话|公开电话|招商|物业|市场部|怎么落地|具体落地|哪边比较好)/.test(question);
}

function findRecentStrategyQuestion(history: AiChatHistoryItem[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'user' && detectQuestionMode(item.content) === 'strategy') {
      return item.content;
    }
  }

  return undefined;
}

function findRecentCityInHistory(history: AiChatHistoryItem[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== 'user') {
      continue;
    }

    const city = extractCityFromQuestion(item.content, true);
    if (city) {
      return city;
    }
  }

  return undefined;
}

function shouldAskCityBeforeStrategy(question: string) {
  return STRATEGY_CITY_KEYWORD_RE.test(question);
}

function normalizeCityName(candidate: string) {
  return candidate
    .trim()
    .replace(/^[根据结合按针对围绕就在去了解一下说下讲讲关于的情况是]+/, '')
    .replace(/(的情况|情况|当地情况|本地情况|天气情况|茶文化|促销活动计划|经营方案|营销方案|方案|计划|活动|当地|本地|当前城市|城市)$/g, '')
    .trim();
}

function extractCityFromQuestion(question: string, permissive = false) {
  const municipality = MUNICIPALITY_CITY_NAMES.find((item) => question.includes(item));
  if (municipality) {
    return `${municipality}市`;
  }

  const explicitPatterns = [
    /([\u4e00-\u9fa5]{2,10}?(?:市|自治州|州|地区|盟))/,
    /(?:根据|结合|按|针对|围绕)?([\u4e00-\u9fa5]{2,8})(?:的情况|当地情况|本地情况|天气|茶文化)/,
  ];

  for (const pattern of explicitPatterns) {
    const match = question.match(pattern);
    const city = normalizeCityName(match?.[1] ?? '');
    if (city && !/当前|本地|当地|城市|天气|茶文化/.test(city)) {
      return /市|州|地区|盟$/.test(city) ? city : `${city}市`;
    }
  }

  if (!permissive) {
    return undefined;
  }

  const plain = normalizeCityName(question).replace(/[，。！？、,.!?"]+/g, '').trim();
  if (/^[\u4e00-\u9fa5]{2,8}$/.test(plain) && !/当前|本地|当地|城市|天气|茶文化|方案|计划/.test(plain)) {
    return /市|州|地区|盟$/.test(plain) ? plain : `${plain}市`;
  }

  return undefined;
}

function findPendingStrategyCityQuestion(history: AiChatHistoryItem[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (
      item.role !== 'assistant'
      || !STRATEGY_CITY_FOLLOWUP_HINTS.some((hint) => item.content.includes(hint))
    ) {
      continue;
    }

    for (let prevIndex = index - 1; prevIndex >= 0; prevIndex -= 1) {
      const prev = history[prevIndex];
      if (prev.role === 'user' && detectQuestionMode(prev.content) === 'strategy') {
        return prev.content;
      }
    }
  }

  return undefined;
}

function resolveStrategyQuestion(question: string, history: AiChatHistoryItem[]): StrategyQuestionResolution | 'need_city' {
  const questionMode = detectQuestionMode(question);
  if (questionMode === 'strategy') {
    const city = extractCityFromQuestion(question) ?? findRecentCityInHistory(history);
    if (shouldAskCityBeforeStrategy(question) && !city) {
      return 'need_city';
    }

    const localGroundingMark = isLocalGroundingStrategy(question) ? '\n【本地落地模式】请优先结合公开网络信息给出真实可执行的本地点位、预算区间、对接对象与可核实线索' : '';
    const effectiveQuestion = city ? `${question}\n【当前城市】${city}${localGroundingMark}` : `${question}${localGroundingMark}`;
    return { mode: 'strategy', effectiveQuestion, summaryQuestion: effectiveQuestion };
  }

  const pendingQuestion = findPendingStrategyCityQuestion(history);
  if (!pendingQuestion) {
    const recentStrategyQuestion = findRecentStrategyQuestion(history);
    const recentCity = findRecentCityInHistory(history);
    if (recentStrategyQuestion && recentCity && LOCAL_GROUNDING_FOLLOWUP_RE.test(question)) {
      const localGroundingMark = isLocalGroundingStrategy(question) || isLocalGroundingStrategy(recentStrategyQuestion)
        ? '\n【本地落地模式】请优先结合公开网络信息给出真实可执行的本地点位、预算区间、对接对象与可核实线索'
        : '';
      const summaryQuestion = `${recentStrategyQuestion}\n【延续追问】${question}\n【当前城市】${recentCity}${localGroundingMark}`;
      return { mode: 'strategy', effectiveQuestion: summaryQuestion, summaryQuestion };
    }

    return { mode: 'data', effectiveQuestion: question };
  }

  const city = extractCityFromQuestion(question, true);
  if (!city) {
    return 'need_city';
  }

  const localGroundingMark = isLocalGroundingStrategy(pendingQuestion) ? '\n【本地落地模式】请优先结合公开网络信息给出真实可执行的本地点位、预算区间、对接对象与可核实线索' : '';
  const summaryQuestion = `${pendingQuestion}\n【用户补充城市】${city}${localGroundingMark}`;
  return { mode: 'strategy', effectiveQuestion: summaryQuestion, summaryQuestion };
}

type AttachmentSaleOrderCandidateRow = {
  orderId: number;
  orderNo: string;
  createdAt: string;
  customerId: number | null;
  customerName: string;
  contactName: string | null;
  customerPhone: string | null;
  totalAmount: number;
  receivedAmount: number;
  returnedAmount: number;
  unpaidAmount: number;
  status: string;
  remark: string | null;
  productId: number;
  productName: string;
  teaType: string | null;
  quantity: number;
  packageQty: number | null;
  looseQty: number | null;
  packageUnit: string | null;
  packageSize: number | null;
  unit: string | null;
  unitPrice: number;
  itemSubtotal: number;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiConversationEntity)
    private readonly aiConversationRepository: Repository<AiConversationEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    private readonly aiConfigService: AiConfigService,
    private readonly aiPromptClientService: AiPromptClientService,
    private readonly aiSqlService: AiSqlService,
    private readonly modelProviderRegistry: ModelProviderRegistry,
    private readonly dashboardService: DashboardService,
  ) {}

  async getSuggestions() {
    const availability = await this.aiConfigService.getAvailability();

    if (!availability.enabled) {
      return { enabled: false, reason: availability.reason, suggestions: [] };
    }

    if (!availability.config) {
      return { enabled: false, reason: 'AI 配置不可用', suggestions: [] };
    }

    const authCheck = await this.aiPromptClientService.verifyAuthorization(availability.config);
    if (!authCheck.ok) {
      return { enabled: false, reason: authCheck.reason, suggestions: [] };
    }

    const lowStockProducts = await this.productRepository.find({
      where: { status: 1, deletedAt: IsNull() },
      order: { stockQty: 'ASC', id: 'DESC' },
      take: 3,
    });

    const suggestions: AiSuggestion[] = lowStockProducts
      .filter((product) => product.stockQty <= product.safeStock)
      .map((product) => ({
        type: 'restock',
        productId: product.id,
        content: `${product.name} 库存 ${product.stockQty}${product.unit ?? ''}，建议尽快补货`,
      }));

    if (suggestions.length === 0) {
      suggestions.push({ type: 'info', content: 'AI 助手已启用，当前暂无紧急补货建议' });
    }

    return { enabled: true, reason: '', suggestions };
  }

  async getHistory(user: AuthUser, query: AiHistoryQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [list, total] = await this.aiConversationRepository.findAndCount({
      where: { userId: user.sub },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: list.map((item) => this.serializeConversation(item)), total, page, pageSize };
  }

  /** 获取用户的会话列表（最多10条，最新的在前） */
  async getSessions(user: AuthUser) {
    const rows = await this.aiConversationRepository
      .createQueryBuilder('c')
      .select('c.session_id', 'sessionId')
      .addSelect('MIN(c.question)', 'title')
      .addSelect('MAX(c.created_at)', 'lastAt')
      .where('c.user_id = :userId', { userId: user.sub })
      .andWhere('c.session_id IS NOT NULL')
      .groupBy('c.session_id')
      .orderBy('MAX(c.id)', 'DESC')
      .limit(10)
      .getRawMany<{ sessionId: string; title: string; lastAt: string }>();
    return rows;
  }

  /** 获取某个会话的所有消息 */
  async getSessionMessages(user: AuthUser, sessionId: string) {
    const list = await this.aiConversationRepository.find({
      where: { userId: user.sub, sessionId },
      order: { id: 'ASC' },
    });
    return list.map((item) => this.serializeConversation(item));
  }

  /**
   * 构建 AI 对话响应
   *
   * @param emitter - SSE 事件回调，undefined 时静默运行（如批处理场景）
   *
   * 事件类型：
   *   status  → { phase: 'sql'|'execute'|'summary', message: string }  阶段提示
   *   token   → { content: string }                                    流式文字块
   *   error   → { message: string }                                    错误信息
   */
  async buildChatResponse(
    question: string,
    user: AuthUser,
    history: AiChatHistoryItem[] = [],
    emitter?: SseEmitter,
    sessionId?: string,
  ) {
    const currentSessionId = sessionId || `sess_${Date.now()}`;
    const resolvedQuestion = resolveStrategyQuestion(question, history);
    if (resolvedQuestion === 'need_city') {
      await this.saveConversation(user.sub, question, STRATEGY_CITY_CLARIFY_ANSWER, null, undefined, currentSessionId);
      emitter?.('token', { content: STRATEGY_CITY_CLARIFY_ANSWER });
      return { enabled: true, reason: '', answer: STRATEGY_CITY_CLARIFY_ANSWER };
    }

    const questionMode = resolvedQuestion.mode;
    return this.runDatabaseChatResponse({
      effectiveQuestion: resolvedQuestion.effectiveQuestion,
      saveQuestion: question,
      user,
      history,
      emitter,
      sessionId: currentSessionId,
      questionMode,
      summaryQuestionOverride: resolvedQuestion.summaryQuestion,
    });
  }

  private async runDatabaseChatResponse(params: {
    effectiveQuestion: string;
    saveQuestion: string;
    user: AuthUser;
    history?: AiChatHistoryItem[];
    emitter?: SseEmitter;
    sessionId?: string;
    useRecentStructuredContext?: boolean;
    questionMode?: AiQuestionMode;
    summaryQuestionOverride?: string;
  }) {
    const {
      effectiveQuestion,
      saveQuestion,
      user,
      history = [],
      emitter,
      sessionId,
      useRecentStructuredContext = true,
      questionMode = 'data',
      summaryQuestionOverride,
    } = params;
    const currentSessionId = sessionId || `sess_${Date.now()}`;
    const emit = (event: string, data: unknown) => emitter?.(event, data);
    // ── 1. 并行获取上下文 + AI 配置 ─────────────────────────────────────────
    const [structuredContext, availability] = await Promise.all([
      useRecentStructuredContext ? this.getRecentStructuredContext(user.sub) : Promise.resolve({}),
      this.aiConfigService.getAvailability(),
    ]);

    if (!availability.enabled || !availability.config) {
      const answer = `AI 模块当前已禁用：${availability.reason}`;
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: availability.reason });
      return { enabled: false, reason: availability.reason, answer };
    }

    const providerClient = this.modelProviderRegistry.get(availability.config.provider);
    if (!providerClient) {
      const reason = `当前提供商 ${availability.config.provider} 暂未接入`;
      const answer = `AI 模块当前已禁用：${reason}`;
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: reason });
      return { enabled: false, reason, answer };
    }

    const authCheck = await this.aiPromptClientService.verifyAuthorization(availability.config);
    if (!authCheck.ok) {
      const answer = `AI 模块当前已禁用：${authCheck.reason}`;
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: authCheck.reason });
      return { enabled: false, reason: authCheck.reason, answer };
    }

    const attachmentFollowUpResult = await this.tryResolveSaleOrderFollowUp(user.sub, saveQuestion);
    if (attachmentFollowUpResult) {
      emit('rows', { rows: attachmentFollowUpResult.rows });
      emit('token', { content: attachmentFollowUpResult.answer });
      await this.saveConversation(
        user.sub,
        saveQuestion,
        attachmentFollowUpResult.answer,
        '[attachment-sale-order-follow-up-match]',
        attachmentFollowUpResult.context,
        currentSessionId,
        attachmentFollowUpResult.rows,
      );
      return { enabled: true, reason: '', answer: attachmentFollowUpResult.answer };
    }

    const queryResult = questionMode === 'strategy'
      ? await this.buildStrategySnapshotResult(saveQuestion)
      : await this.buildSqlQueryResult(
        effectiveQuestion,
        saveQuestion,
        providerClient,
        availability.config,
        history,
        structuredContext,
        user.sub,
        currentSessionId,
        emit,
      );

    if ('enabled' in queryResult) {
      return queryResult;
    }

    // ── 3.5 把原始查询结果推给前端（用于渲染图表/表格）─────────────────────────
    if (questionMode === 'data') {
      emit('rows', { rows: queryResult.rows });
    }

    if (this.isContactQuestion(`${saveQuestion}\n${effectiveQuestion}`) && !this.hasContactColumns(queryResult.rows)) {
      const answer = this.buildUnavailableContactAnswer(questionMode);
      await this.saveConversation(user.sub, saveQuestion, answer, queryResult.sql, undefined, currentSessionId);
      emit('token', { content: answer });
      return { enabled: true, reason: '', answer };
    }

    const deterministicAnswer = questionMode === 'data'
      ? this.buildDeterministicBusinessAnswer(`${saveQuestion}\n${effectiveQuestion}`, queryResult.rows)
      : null;
    if (deterministicAnswer) {
      const nextStructuredContext = await this.aiPromptClientService.buildStructuredContext(
        availability.config,
        structuredContext,
        queryResult.rows,
      );
      await this.saveConversation(user.sub, saveQuestion, deterministicAnswer, queryResult.sql, nextStructuredContext, currentSessionId, queryResult.rows);
      emit('token', { content: deterministicAnswer });
      return { enabled: true, reason: '', answer: deterministicAnswer };
    }

    // ── 4. 总结回答（流式）────────────────────────────────────────────────────

    emit('status', { phase: 'summary', message: questionMode === 'strategy' ? '正在生成经营方案...' : '正在整理回答...' });

    const summaryQuestionBody = summaryQuestionOverride ?? (
      questionMode === 'strategy' || saveQuestion === effectiveQuestion
        ? saveQuestion
        : `${saveQuestion}\n【附件识别线索】${effectiveQuestion}`
    );
    const summaryQuestion = `${buildCurrentDateAnchor()}\n${summaryQuestionBody}`;

    // 统计类问题 SQL 已做聚合，明细类问题前端图表已有完整数据
    // 只需前 30 行供 LLM 描述，减少 token 消耗和传输延迟
    const summaryRows = queryResult.rows.length > 30 ? queryResult.rows.slice(0, 30) : queryResult.rows;

    const summaryPromptResult = await this.aiPromptClientService.fetchSummaryMessages(
      summaryQuestion,
      queryResult.sql,
      summaryRows,
      availability.config,
      history,
      structuredContext,
      user.sub,
    );

    let answer: string;

    // 提前启动 buildStructuredContext，与 LLM 总结并行
    const contextPromise = this.aiPromptClientService.buildStructuredContext(
      availability.config,
      structuredContext,
      queryResult.rows,
    );

    const summaryOptions = questionMode === 'strategy' && availability.config.provider === 'qwen'
      ? { enableSearch: true, enableThinking: true }
      : undefined;

    if (!summaryPromptResult.ok) {
      // 提示词获取失败，降级展示原始结果
      answer = this.buildRawResultAnswer(queryResult.sql, queryResult.rows);
      emit('token', { content: answer });
    } else if (providerClient.invokeStream) {
      // 流式总结（SSE 逐 token 推送）
      const streamResult = await providerClient.invokeStream(
        summaryPromptResult.messages,
        availability.config,
        (chunk) => emit('token', { content: chunk }),
        summaryOptions,
      );
      answer = streamResult.ok ? streamResult.content : this.buildRawResultAnswer(queryResult.sql, queryResult.rows);
      if (!streamResult.ok) {
        emit('token', { content: answer });
      }
    } else {
      // 非流式降级
      const summaryResult = await providerClient.invoke(
        summaryPromptResult.messages,
        availability.config,
        summaryOptions,
      );
      answer = summaryResult.ok ? summaryResult.content : this.buildRawResultAnswer(queryResult.sql, queryResult.rows);
      emit('token', { content: answer });
    }

    const nextStructuredContext = await contextPromise;

    await this.saveConversation(
      user.sub,
      saveQuestion,
      answer,
      queryResult.sql,
      nextStructuredContext,
      currentSessionId,
      questionMode === 'data' ? queryResult.rows : undefined,
    );

    // 异步检测用户是否设定了回答偏好规则（不阻塞返回）
    this.detectAndSaveUserRule(saveQuestion, answer, user.sub, availability.config, history, structuredContext).catch(() => {});

    return { enabled: true, reason: '', answer };
  }

  /**
   * 结构化识别（用于 AI 填表）
   *
   * 不走 SQL，不流式，直接让模型返回 JSON，供前端解析后填入表单。
   */
  async buildRecognizeResponse(
    module: 'sale-order',
    attachment: AiAttachment,
    products?: Array<{ id: number; name: string; teaType?: string; year?: string; spec?: string; sellPrice?: number; unit?: string; packageUnit?: string }>,
  ) {
    const availability = await this.aiConfigService.getAvailability();
    if (!availability.enabled || !availability.config) {
      return { ok: false as const, reason: availability.reason };
    }

    const providerClient = this.modelProviderRegistry.get(availability.config.provider);
    if (!providerClient) {
      return { ok: false as const, reason: `提供商 ${availability.config.provider} 暂未接入` };
    }

    const attachmentValidation = this.validateAttachment(attachment);
    if (!attachmentValidation.ok) {
      return { ok: false as const, reason: attachmentValidation.reason };
    }

    const authCheck = await this.aiPromptClientService.verifyAuthorization(availability.config);
    if (!authCheck.ok) {
      return { ok: false as const, reason: authCheck.reason };
    }

    // 从 prompt-center 获取 system prompt + user 文字部分
    const promptResult = await this.aiPromptClientService.fetchRecognizeMessages(products ?? [], availability.config);
    if (!promptResult.ok || promptResult.messages.length < 2) {
      const reason = promptResult.ok ? 'Prompt 服务未返回有效消息' : promptResult.reason;
      return { ok: false as const, reason };
    }

    const systemPrompt = String(promptResult.messages.find((m) => m.role === 'system')?.content ?? '');
    const userTextContent = String(promptResult.messages.find((m) => m.role === 'user')?.content ?? '');

    const messages: AiPromptMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildAttachmentUserContent(userTextContent, attachment) },
    ];

    const result = await providerClient.invoke(messages, availability.config);
    if (!result.ok) {
      return { ok: false as const, reason: result.reason };
    }

    // 从模型输出中提取 JSON（有时模型会包裹 markdown 代码块）
    const jsonText = this.extractJson(result.content);
    if (!jsonText) {
      return { ok: false as const, reason: '模型未返回有效 JSON，请换一张更清晰的图片' };
    }

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const normalized = this.normalizeRecognizeResult(module, parsed);
      if (!normalized.ok) {
        return { ok: false as const, reason: normalized.reason };
      }
      return { ok: true as const, data: normalized.data };
    } catch {
      return { ok: false as const, reason: '模型返回的 JSON 格式有误，请重试' };
    }
  }

  private extractJson(text: string): string | null {
    // 尝试直接解析
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

    // 提取 markdown 代码块中的 JSON
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) return match[1].trim();

    // 提取第一个 [...] 或 { ... } 块（优先数组）
    const startArr = trimmed.indexOf('[');
    const endArr = trimmed.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      return trimmed.slice(startArr, endArr + 1);
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);

    return null;
  }

  private validateAttachment(attachment: AiAttachment): { ok: true } | { ok: false; reason: string } {
    if (attachment.type === 'image') {
      if (!attachment.content.startsWith('data:image/')) {
        return { ok: false, reason: '图片附件格式无效，请重新上传图片' };
      }

      const size = this.estimateImageBytes(attachment.content);
      if (size <= 0) {
        return { ok: false, reason: '图片内容无效，请重新上传图片' };
      }

      if (size > 5 * 1024 * 1024) {
        return { ok: false, reason: '图片不能超过 5MB' };
      }

      return { ok: true };
    }

    const size = Buffer.byteLength(attachment.content ?? '', 'utf8');
    if (size === 0) {
      return { ok: false, reason: '文件内容为空，请重新上传' };
    }

    if (size > 500 * 1024) {
      return { ok: false, reason: '文件不能超过 500KB' };
    }

    return { ok: true };
  }

  private estimateImageBytes(dataUrl: string) {
    const base64 = dataUrl.split(',', 2)[1] ?? '';
    if (!base64) return 0;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  private normalizeRecognizeResult(
    module: 'sale-order',
    payload: unknown,
  ): { ok: true; data: AiRecognizedSaleOrder } | { ok: false; reason: string } {
    if (module !== 'sale-order') {
      return { ok: false, reason: `暂不支持模块 ${module}` };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, reason: '模型返回的数据结构无效，请重试' };
    }

    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.items) || record.items.length === 0) {
      return { ok: false, reason: 'AI 未识别到有效商品明细，请换一张更清晰的图片或文件' };
    }

    const items: AiRecognizedSaleOrderItem[] = [];
    for (const item of record.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, reason: '模型返回的商品明细格式有误，请重试' };
      }

      const current = item as Record<string, unknown>;
      const productName = this.toOptionalString(current.productName);
      if (!productName) {
        return { ok: false, reason: '模型返回的商品名称缺失，请重试' };
      }

      items.push({
        customerName: this.toOptionalString(current.customerName),
        lineText: this.toOptionalString(current.lineText),
        productName,
        productId: this.toOptionalNumber(current.productId),
        quantity: this.toOptionalNumber(current.quantity),
        quantityUnit: this.toOptionalString(current.quantityUnit),
        subtotal: this.toOptionalNumber(current.subtotal),
        unitPrice: this.toOptionalNumber(current.unitPrice),
      });
    }

    return {
      ok: true,
      data: {
        customerName: this.toOptionalString(record.customerName),
        items,
        remark: this.toOptionalString(record.remark),
        paidAmount: this.toOptionalNumber(record.paidAmount),
        paymentMethod: this.toOptionalString(record.paymentMethod),
      },
    };
  }

  private toOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const normalized = Number(value.trim());
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }

    return null;
  }

  private buildAttachmentUserContent(userTextContent: string, attachment: AiAttachment): string | AiContentPart[] {
    if (attachment.type === 'image') {
      return [
        { type: 'text', text: userTextContent },
        { type: 'image_url', image_url: { url: attachment.content, detail: 'high' } },
      ] satisfies AiContentPart[];
    }

    const fileLabel = attachment.filename ? `【文件：${attachment.filename}】\n` : '';
    return `${userTextContent}\n\n${fileLabel}文件内容如下：\n${attachment.content}`;
  }

  private normalizeAttachmentRoute(payload: unknown): { ok: true; data: AiAttachmentRoute } | { ok: false; reason: string } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, reason: '附件路由结果格式无效' };
    }

    const record = payload as Record<string, unknown>;
    const allowedIntents: AiAttachmentIntent[] = [
      'recognize',
      'query_sale_order',
      'query_purchase_order',
      'query_customer',
      'query_supplier',
      'query_general',
    ];
    const intent = typeof record.intent === 'string' ? record.intent.trim() as AiAttachmentIntent : null;
    if (!intent || !allowedIntents.includes(intent)) {
      return { ok: false, reason: '附件路由未返回有效意图' };
    }

    const recognizedText = this.toOptionalString(record.recognizedText) ?? '';
    const queryRewrite = this.toOptionalString(record.queryRewrite);
    if (intent !== 'recognize' && !queryRewrite) {
      return { ok: false, reason: '附件路由未返回可执行的查询指令' };
    }

    return {
      ok: true,
      data: {
        intent,
        recognizedText,
        queryRewrite,
      },
    };
  }

  private async routeAttachmentIntent(
    question: string,
    attachment: AiAttachment,
    providerClient: ModelProviderClient,
    config: AiRuntimeConfig,
  ): Promise<{ ok: true; data: AiAttachmentRoute } | { ok: false; reason: string }> {
    const promptResult = await this.aiPromptClientService.fetchAttachmentRouteMessages(question, config);
    if (!promptResult.ok || promptResult.messages.length < 2) {
      return { ok: false, reason: promptResult.ok ? 'Prompt 服务未返回有效消息' : promptResult.reason };
    }

    const systemPrompt = String(promptResult.messages.find((m) => m.role === 'system')?.content ?? '');
    const userTextContent = String(promptResult.messages.find((m) => m.role === 'user')?.content ?? '');
    const messages: AiPromptMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildAttachmentUserContent(userTextContent, attachment) },
    ];
    const result = await providerClient.invoke(messages, config);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    const jsonText = this.extractJson(result.content);
    if (!jsonText) {
      return { ok: false, reason: '附件路由未返回有效 JSON' };
    }

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      return this.normalizeAttachmentRoute(parsed);
    } catch {
      return { ok: false, reason: '附件路由返回的 JSON 格式有误' };
    }
  }

  private async getRecognizeProductCatalog() {
    const products = await this.productRepository.find({
      where: { status: 1, deletedAt: IsNull() },
      order: { id: 'DESC' },
      take: 200,
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      teaType: product.teaType ?? undefined,
      year: product.year != null ? String(product.year) : undefined,
      spec: product.spec ?? undefined,
      sellPrice: product.sellPrice,
      unit: product.unit ?? undefined,
      packageUnit: undefined,
    }));
  }

  private async tryResolveSaleOrderFromAttachment(
    attachment: AiAttachment,
  ): Promise<
    | { ok: true; answer: string; rows: AttachmentSaleOrderCandidateRow[] }
    | { ok: false; reason: string }
  > {
    const catalog = await this.getRecognizeProductCatalog();
    const recognizeResult = await this.buildRecognizeResponse('sale-order', attachment, catalog);
    if (!recognizeResult.ok || !recognizeResult.data) {
      return { ok: false, reason: recognizeResult.reason ?? '附件识别失败' };
    }

    const candidateRows = await this.productRepository.manager.query(`
      SELECT
        so.id AS orderId,
        so.order_no AS orderNo,
        so.created_at AS createdAt,
        so.customer_id AS customerId,
        COALESCE(c.name, '散客') AS customerName,
        c.contact_name AS contactName,
        c.phone AS customerPhone,
        so.total_amount AS totalAmount,
        so.received_amount AS receivedAmount,
        so.returned_amount AS returnedAmount,
        (so.total_amount - so.received_amount - so.returned_amount) AS unpaidAmount,
        so.status AS status,
        so.remark AS remark,
        p.id AS productId,
        p.name AS productName,
        p.tea_type AS teaType,
        soi.quantity AS quantity,
        soi.package_qty AS packageQty,
        soi.loose_qty AS looseQty,
        soi.package_unit AS packageUnit,
        soi.package_size AS packageSize,
        p.unit AS unit,
        soi.unit_price AS unitPrice,
        soi.subtotal AS itemSubtotal
      FROM sale_order so
      JOIN sale_order_item soi ON soi.order_id = so.id
      JOIN product p ON p.id = soi.product_id
      LEFT JOIN customer c ON c.id = so.customer_id
      WHERE so.created_at >= datetime('now', 'localtime', '-30 day')
      ORDER BY so.created_at DESC, soi.id ASC
      LIMIT 300
    `) as AttachmentSaleOrderCandidateRow[];

    if (candidateRows.length === 0) {
      return { ok: false, reason: '系统中暂无可匹配的销售订单' };
    }

    const grouped = new Map<number, AttachmentSaleOrderCandidateRow[]>();
    for (const row of candidateRows) {
      grouped.set(row.orderId, [...(grouped.get(row.orderId) ?? []), row]);
    }

    const recognized = recognizeResult.data;
    const scoredOrders = [...grouped.values()]
      .map((rows) => ({ rows, score: this.scoreSaleOrderCandidate(recognized, rows) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.rows[0].createdAt) - Date.parse(a.rows[0].createdAt));

    const best = scoredOrders[0];
    if (!best || best.score < 6) {
      return { ok: false, reason: '未找到足够匹配的销售订单候选' };
    }

    return {
      ok: true,
      rows: best.rows,
      answer: this.buildAttachmentSaleOrderAnswer(best.rows),
    };
  }

  private scoreSaleOrderCandidate(recognized: AiRecognizedSaleOrder, rows: AttachmentSaleOrderCandidateRow[]) {
    const order = rows[0];
    let score = 0;

    if (!recognized.customerName && (order.customerId == null || order.customerName === '散客')) {
      score += 2;
    }

    if (recognized.customerName) {
      score += this.scoreCustomerIdentity(recognized.customerName, order.customerName, order.contactName, order.customerPhone);
    }

    if (recognized.paidAmount != null && order.receivedAmount > 0 && Math.abs(order.receivedAmount - recognized.paidAmount) <= 50) {
      score += 2;
    }

    if (recognized.items.length > 0 && Math.abs(order.totalAmount - recognized.items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0)) <= 200) {
      score += 2;
    }

    for (const recognizedItem of recognized.items) {
      let itemBestScore = 0;
      for (const row of rows) {
        let current = 0;
        if (recognizedItem.productName.includes(row.productName) || row.productName.includes(recognizedItem.productName)) {
          current += 4;
        }
        if (recognizedItem.quantityUnit && row.teaType && recognizedItem.productName.includes(row.teaType)) {
          current += 1;
        }
        const recognizedSubtotal = (recognizedItem.quantity ?? 0) * (recognizedItem.unitPrice ?? 0);
        if (recognizedSubtotal > 0 && Math.abs(row.itemSubtotal - recognizedSubtotal) <= Math.max(200, recognizedSubtotal * 0.2)) {
          current += 4;
        }
        if (recognizedItem.unitPrice != null && Math.abs(row.unitPrice - recognizedItem.unitPrice) <= Math.max(200, recognizedItem.unitPrice * 0.2)) {
          current += 1;
        }
        itemBestScore = Math.max(itemBestScore, current);
      }
      score += itemBestScore;
    }

    return score;
  }

  private buildAttachmentSaleOrderAnswer(rows: AttachmentSaleOrderCandidateRow[]) {
    const order = rows[0];
    const itemLines = rows.map((row) => {
      const teaSuffix = row.teaType ? `（${row.teaType}）` : '';
      return `- ${row.productName}${teaSuffix} ${this.formatQuantityText(row as unknown as Record<string, unknown>)}，单价 ¥${row.unitPrice.toLocaleString()}，小计 ¥${row.itemSubtotal.toLocaleString()}`;
    });

    const createdAt = order.createdAt ? order.createdAt.replace('T', ' ') : '未知';
    const unpaidAmount = Math.max(order.unpaidAmount, 0);

    return [
      `已为你匹配到最可能的销售订单：${order.orderNo}`,
      `- 开单时间：${createdAt}`,
      `- 客户：${order.customerName || '散客'}`,
      `- 订单状态：${order.status}`,
      `- 订单总额：¥${order.totalAmount.toLocaleString()}，已收：¥${order.receivedAmount.toLocaleString()}，欠款：¥${unpaidAmount.toLocaleString()}`,
      `- 备注：${order.remark || '无'}`,
      ...itemLines,
    ].join('\n');
  }

  private buildSaleOrderStructuredContext(rows: AttachmentSaleOrderCandidateRow[]): AiStructuredContext {
    const order = rows[0];
    return {
      orderNos: order?.orderNo ? [order.orderNo] : [],
      customerNames: order?.customerName ? [order.customerName] : [],
      customerContacts: order?.contactName ? [order.contactName] : [],
      customerPhones: order?.customerPhone ? [order.customerPhone] : [],
      productNames: [...new Set(rows.map((row) => row.productName).filter(Boolean))],
    };
  }

  private async tryResolveSaleOrderFollowUp(userId: number, question: string) {
    if (!/(重新查|重查|手动调|改成|单价|录入时|那个订单)/.test(question)) {
      return null;
    }

    const latestMatchedConversation = await this.aiConversationRepository.findOne({
      where: { userId, sqlGenerated: '[attachment-sale-order-match]' },
      order: { id: 'DESC' },
    });
    if (!latestMatchedConversation) {
      return null;
    }

    const productNames = [...latestMatchedConversation.answer.matchAll(/-\s*([^\s（]+)/g)].map((match) => match[1]).filter(Boolean);
    const priceHints = [...question.matchAll(/单价\s*([0-9]+(?:\.[0-9]+)?)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    const quantityHints = [...question.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(斤|两|饼|提|件|g|kg)/g)]
      .map((match) => ({ value: Number(match[1]), unit: match[2] }))
      .filter((item) => Number.isFinite(item.value));
    if (productNames.length === 0 || (priceHints.length === 0 && quantityHints.length === 0)) {
      return null;
    }

    const candidateRows = await this.productRepository.manager.query(`
      SELECT
        so.id AS orderId,
        so.order_no AS orderNo,
        so.created_at AS createdAt,
        so.customer_id AS customerId,
        COALESCE(c.name, '散客') AS customerName,
        c.contact_name AS contactName,
        c.phone AS customerPhone,
        so.total_amount AS totalAmount,
        so.received_amount AS receivedAmount,
        so.returned_amount AS returnedAmount,
        (so.total_amount - so.received_amount - so.returned_amount) AS unpaidAmount,
        so.status AS status,
        so.remark AS remark,
        p.id AS productId,
        p.name AS productName,
        p.tea_type AS teaType,
        soi.quantity AS quantity,
        soi.package_qty AS packageQty,
        soi.loose_qty AS looseQty,
        soi.package_unit AS packageUnit,
        soi.package_size AS packageSize,
        p.unit AS unit,
        soi.unit_price AS unitPrice,
        soi.subtotal AS itemSubtotal
      FROM sale_order so
      JOIN sale_order_item soi ON soi.order_id = so.id
      JOIN product p ON p.id = soi.product_id
      LEFT JOIN customer c ON c.id = so.customer_id
      WHERE so.created_at >= datetime('now', 'localtime', '-30 day')
      ORDER BY so.created_at DESC, soi.id ASC
      LIMIT 300
    `) as AttachmentSaleOrderCandidateRow[];
    const grouped = new Map<number, AttachmentSaleOrderCandidateRow[]>();
    for (const row of candidateRows) {
      grouped.set(row.orderId, [...(grouped.get(row.orderId) ?? []), row]);
    }

    const scoredOrders = [...grouped.values()]
      .map((rows) => ({ rows, score: this.scoreSaleOrderFollowUpCandidate(rows, productNames, priceHints, quantityHints) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.rows[0].createdAt) - Date.parse(a.rows[0].createdAt));

    const best = scoredOrders[0];
    if (!best || best.score < 8) {
      return null;
    }

    return {
      rows: best.rows,
      answer: this.buildAttachmentSaleOrderAnswer(best.rows),
      context: this.buildSaleOrderStructuredContext(best.rows),
    };
  }

  private scoreSaleOrderFollowUpCandidate(
    rows: AttachmentSaleOrderCandidateRow[],
    productNames: string[],
    priceHints: number[],
    quantityHints: Array<{ value: number; unit: string }>,
  ) {
    let score = 0;
    for (const productName of productNames) {
      if (rows.some((row) => row.productName.includes(productName) || productName.includes(row.productName))) {
        score += 3;
      }
    }

    for (const priceHint of priceHints) {
      if (rows.some((row) => Math.abs(row.unitPrice - priceHint) <= Math.max(1, priceHint * 0.05))) {
        score += 8;
      }
    }

    for (const hint of quantityHints) {
      if (rows.some((row) => {
        const text = this.formatQuantityText(row as unknown as Record<string, unknown>);
        return text.includes(`${hint.value}${hint.unit}`) || ((row.quantity === hint.value || row.looseQty === hint.value || row.packageQty === hint.value) && (row.unit === hint.unit || row.packageUnit === hint.unit));
      })) {
        score += 4;
      }
    }

    return score;
  }

  private scoreCustomerIdentity(
    recognizedName: string,
    customerName: string | null,
    contactName: string | null,
    phone: string | null,
  ) {
    const recognized = recognizedName.trim();
    if (!recognized) return 0;

    let score = 0;
    const customerVariants = this.buildNameVariants(customerName);
    const contactVariants = this.buildNameVariants(contactName);
    const recognizedVariants = this.buildNameVariants(recognized);

    if (this.hasNameOverlap(recognizedVariants, customerVariants)) {
      score = Math.max(score, 4);
    }

    if (this.hasNameOverlap(recognizedVariants, contactVariants)) {
      score = Math.max(score, 6);
    }

    const recognizedDigits = recognized.replace(/\D/g, '');
    const phoneDigits = (phone ?? '').replace(/\D/g, '');
    if (recognizedDigits.length >= 6 && phoneDigits && phoneDigits.includes(recognizedDigits)) {
      score = Math.max(score, 8);
    }

    return score;
  }

  private buildNameVariants(value: string | null | undefined) {
    if (!value) {
      return [] as string[];
    }

    const normalized = this.normalizeEntityName(value);
    const compact = normalized.replace(/\s+/g, '');
    const variants = new Set<string>([normalized, compact]);
    if (compact.length >= 2) {
      variants.add(compact.slice(0, Math.min(compact.length, 4)));
      variants.add(compact.slice(-Math.min(compact.length, 4)));
    }
    return [...variants].filter((item) => item.length >= 2);
  }

  private hasNameOverlap(left: string[], right: string[]) {
    return left.some((leftItem) => right.some((rightItem) => leftItem.includes(rightItem) || rightItem.includes(leftItem)));
  }

  private normalizeEntityName(value: string) {
    return value
      .trim()
      .replace(/[（(].*?[）)]/g, '')
      .replace(/有限公司|有限责任公司|股份有限公司|公司|集团|贸易|科技|实业|商行|茶业|茶行|茶厂|门市部|店铺|经营部/g, '')
      .replace(/省|市|区|县|镇/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  /**
   * 构建视觉/文件识别响应（跳过 SQL 流程，直接用多模态模型识别）
   *
   * 适用场景：用户上传图片（发票、订单截图）或文本文件，让 AI 识别后自动录单
   */
  async buildVisionChatResponse(
    question: string,
    attachment: AiAttachment,
    user: AuthUser,
    history: AiChatHistoryItem[] = [],
    emitter?: SseEmitter,
    sessionId?: string,
  ) {
    const currentSessionId = sessionId || `sess_${Date.now()}`;
    const emit = (event: string, data: unknown) => emitter?.(event, data);

    // ── 1. 检查 AI 配置 ──────────────────────────────────────────────────────
    const availability = await this.aiConfigService.getAvailability();
    if (!availability.enabled || !availability.config) {
      const answer = `AI 模块当前已禁用：${availability.reason}`;
      await this.saveConversation(user.sub, question, answer, null, undefined, currentSessionId);
      emit('error', { message: availability.reason });
      return { enabled: false, reason: availability.reason, answer };
    }

    const providerClient = this.modelProviderRegistry.get(availability.config.provider);
    if (!providerClient) {
      const reason = `当前提供商 ${availability.config.provider} 暂未接入`;
      const answer = `AI 模块当前已禁用：${reason}`;
      await this.saveConversation(user.sub, question, answer, null, undefined, currentSessionId);
      emit('error', { message: reason });
      return { enabled: false, reason, answer };
    }

    const attachmentValidation = this.validateAttachment(attachment);
    if (!attachmentValidation.ok) {
      await this.saveConversation(user.sub, question, attachmentValidation.reason, null, undefined, currentSessionId);
      emit('error', { message: attachmentValidation.reason });
      return { enabled: false, reason: attachmentValidation.reason, answer: attachmentValidation.reason };
    }

    emit('status', { phase: 'attachment-route', message: '正在理解附件内容和查询意图...' });
    const routeResult = await this.routeAttachmentIntent(
      question,
      attachment,
      providerClient,
      availability.config,
    );
    if (!routeResult.ok) {
      this.logger.warn(`附件路由失败，降级为纯识别模式。question=${question}; reason=${routeResult.reason}`);
    }
    if (routeResult.ok && routeResult.data.intent !== 'recognize' && routeResult.data.queryRewrite) {
      if (routeResult.data.intent === 'query_sale_order') {
        const localMatch = await this.tryResolveSaleOrderFromAttachment(attachment);
        if (localMatch.ok) {
          emit('rows', { rows: localMatch.rows });
          emit('token', { content: localMatch.answer });
          await this.saveConversation(
            user.sub,
            question,
            localMatch.answer,
            '[attachment-sale-order-match]',
            this.buildSaleOrderStructuredContext(localMatch.rows),
            currentSessionId,
            localMatch.rows,
          );
          return { enabled: true, reason: '', answer: localMatch.answer };
        }
      }

      return this.runDatabaseChatResponse({
        effectiveQuestion: routeResult.data.queryRewrite,
        saveQuestion: question,
        user,
        history,
        emitter,
        sessionId: currentSessionId,
        useRecentStructuredContext: false,
      });
    }

    const promptResult = await this.aiPromptClientService.fetchVisionMessages(question, availability.config);
    if (!promptResult.ok || promptResult.messages.length < 2) {
      const reason = promptResult.ok ? 'Prompt 服务未返回有效消息' : promptResult.reason;
      const answer = `AI 模块当前不可用：${reason}`;
      await this.saveConversation(user.sub, question, answer, null, undefined, currentSessionId);
      emit('error', { message: reason });
      return { enabled: false, reason, answer };
    }

    // ── 2. 构建多模态消息 ─────────────────────────────────────────────────────
    emit('status', { phase: 'vision', message: '正在识别内容...' });

    const systemPrompt = String(promptResult.messages.find((m) => m.role === 'system')?.content ?? '');
    const userTextContent = String(promptResult.messages.find((m) => m.role === 'user')?.content ?? '');

    const historyMessages: AiPromptMessage[] = history.map((h) => ({
      role: h.role,
      content: h.content,
    }));

    const messages: AiPromptMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: this.buildAttachmentUserContent(userTextContent, attachment) },
    ];

    // ── 3. 调用模型（流式）────────────────────────────────────────────────────
    emit('status', { phase: 'vision', message: '正在整理识别结果...' });

    let answer: string;

    if (providerClient.invokeStream) {
      const streamResult = await providerClient.invokeStream(
        messages,
        availability.config,
        (chunk) => emit('token', { content: chunk }),
      );
      answer = streamResult.ok ? streamResult.content : `识别失败：${streamResult.reason}`;
      if (!streamResult.ok) {
        emit('error', { message: streamResult.reason });
      }
    } else {
      const result = await providerClient.invoke(messages, availability.config);
      answer = result.ok ? result.content : `识别失败：${result.reason}`;
      emit('token', { content: answer });
      if (!result.ok) {
        emit('error', { message: result.reason });
      }
    }

    await this.saveConversation(user.sub, question || '(文件识别)', answer, null, undefined, currentSessionId);
    return { enabled: true, reason: '', answer };
  }

  /** 测试大模型连接（使用表单直传参数，不依赖已保存配置） */
  async testConnection(dto: AiTestDto): Promise<{
    ok: boolean;
    message: string;
    checks: Array<{ key: string; label: string; ok: boolean; message: string }>;
  }> {
    const availability = await this.aiConfigService.getAvailability();
    const checks: Array<{ key: string; label: string; ok: boolean; message: string }> = [];

    if (!dto.apiKey) {
      return {
        ok: false,
        message: '请先填写 AI 授权 Key',
        checks: [{ key: 'apiKey', label: 'AI 授权 Key', ok: false, message: 'AI 授权 Key 为空' }],
      };
    }

    const runtimeConfig: AiRuntimeConfig = {
      provider: dto.provider,
      modelApiKey: dto.modelApiKey,
      modelName: dto.modelName,
      modelBaseUrl: dto.modelBaseUrl,
      apiKey: dto.apiKey,
      promptServiceUrl: dto.promptServiceUrl,
      industry: availability.config?.industry ?? 'tea',
    };

    const authCheck = await this.aiPromptClientService.verifyAuthorization(runtimeConfig);
    checks.push({
      key: 'authorization',
      label: '授权 Key 校验',
      ok: authCheck.ok,
      message: authCheck.ok ? '授权 Key 有效，Agent 服务可访问' : authCheck.reason,
    });

    const providerClient = this.modelProviderRegistry.get(dto.provider);
    if (!providerClient) {
      checks.push({
        key: 'provider',
        label: '模型提供商',
        ok: false,
        message: `提供商 "${dto.provider}" 暂不支持`,
      });
      return { ok: false, message: `提供商 "${dto.provider}" 暂不支持`, checks };
    }

    checks.push({
      key: 'provider',
      label: '模型提供商',
      ok: true,
      message: `提供商 ${dto.provider} 已支持`,
    });

    const result = await providerClient.invoke(
      [{ role: 'user', content: '请只回复两个字："ok"' }],
      runtimeConfig,
    );

    if (result.ok) {
      checks.push({
        key: 'model',
        label: '模型连接',
        ok: true,
        message: `模型已响应：${result.content.slice(0, 30)}`,
      });
      const ok = checks.every((item) => item.ok);
      return { ok, message: 'AI 全链路检查通过', checks };
    }

    checks.push({
      key: 'model',
      label: '模型连接',
      ok: false,
      message: result.reason,
    });
    return { ok: false, message: result.reason, checks };
  }

  /**
   * 调用 prompt-center 提取用户长期回答偏好，并在识别成功后异步落库
   */
  private async detectAndSaveUserRule(
    question: string,
    answer: string,
    userId: number,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[],
    structuredContext: AiStructuredContext | undefined,
  ) {
    const promptResult = await this.aiPromptClientService.fetchUserRuleExtractMessages(
      question,
      answer,
      config,
      history,
      structuredContext,
      userId,
    );
    if (!promptResult.ok) return;

    const providerClient = this.modelProviderRegistry.get(config.provider);
    if (!providerClient) return;

    const result = await providerClient.invoke(promptResult.messages, config);
    if (!result.ok) return;

    const jsonText = this.extractJson(result.content);
    if (!jsonText) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText) as unknown;
    } catch {
      return;
    }

    const normalized = this.normalizeUserRuleExtractResult(parsed);
    if (!normalized.ok || !normalized.data.shouldSave) return;

    const rule = normalized.data.rule;

    this.logger.log(`检测到用户偏好规则: userId=${userId}, rule="${rule}"`);

    await this.aiPromptClientService.pushUserRule(
      config,
      userId,
      rule,
      question,
      normalized.data.phase,
    );
  }

  private normalizeUserRuleExtractResult(payload: unknown):
    | { ok: true; data: { shouldSave: boolean; rule: string; phase?: string } }
    | { ok: false } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false };
    }

    const record = payload as Record<string, unknown>;
    const shouldSave = record.shouldSave === true;
    const rule = typeof record.rule === 'string' ? record.rule.trim() : '';
    const phase = typeof record.phase === 'string' && record.phase.trim() ? record.phase.trim() : undefined;
    if (!shouldSave) {
      return { ok: true, data: { shouldSave: false, rule: '', phase } };
    }

    if (rule.length < 4 || rule.length > 200) {
      return { ok: false };
    }

    return { ok: true, data: { shouldSave: true, rule, phase } };
  }

  private buildRawResultAnswer(sql: string, rows: Record<string, unknown>[]) {
    return [
      `查询成功，命中 ${rows.length} 条记录。`,
      `执行语句：${sql}`,
      formatRowsForSummary(rows),
    ].join('\n');
  }

  private async buildStrategySnapshotResult(question: string) {
    const rows = await this.buildStrategySnapshotRows();
    if (rows.length > 0) {
      return { ok: true as const, sql: '[strategy-snapshot]', rows };
    }

    this.logger.warn(`AI strategy snapshot empty. question=${question}`);
    return {
      ok: true as const,
      sql: '[strategy-snapshot-empty]',
      rows: [{ section: 'meta', label: 'snapshot_status', value: 'empty', question }],
    };
  }

  private async buildSqlQueryResult(
    effectiveQuestion: string,
    saveQuestion: string,
    providerClient: ModelProviderClient,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[],
    structuredContext: AiStructuredContext,
    userId: number,
    sessionId: string,
    emit: SseEmitter,
  ) {
    emit('status', { phase: 'sql', message: '正在理解问题，生成查询语句...' });

    const sqlPromptResult = await this.aiPromptClientService.fetchSqlMessages(
      effectiveQuestion,
      config,
      history,
      structuredContext,
      userId,
    );

    if (!sqlPromptResult.ok) {
      const answer = `提示词获取失败：${sqlPromptResult.reason}`;
      await this.saveConversation(userId, saveQuestion, answer, null, undefined, sessionId);
      emit('error', { message: sqlPromptResult.reason });
      return { enabled: false, reason: sqlPromptResult.reason, answer };
    }

    const sqlModelResult = await providerClient.invoke(sqlPromptResult.messages, config);

    if (!sqlModelResult.ok) {
      const answer = `模型调用失败：${sqlModelResult.reason}`;
      await this.saveConversation(userId, saveQuestion, answer, null, undefined, sessionId);
      emit('error', { message: sqlModelResult.reason });
      return { enabled: false, reason: sqlModelResult.reason, answer };
    }

    const sql = extractSqlFromContent(sqlModelResult.content);
    if (!sql) {
      const answer = 'AI 未能生成有效的查询语句，请换一种问法试试';
      await this.saveConversation(userId, saveQuestion, answer, null, undefined, sessionId);
      emit('error', { message: answer });
      return { enabled: false, reason: 'AI 未生成有效 SQL', answer };
    }

    emit('status', { phase: 'execute', message: '正在查询数据库...' });

    const queryResult = await this.executeSqlWithRetry(
      sql,
      effectiveQuestion,
      providerClient,
      config,
      history,
      structuredContext,
      userId,
      emit,
    );

    if (!queryResult.ok) {
      this.logger.warn(`AI SQL 执行失败。question=${effectiveQuestion}; sql=${queryResult.sql ?? sql}; reason=${queryResult.reason}`);
      const answer = await this.buildFriendlyQueryErrorAnswer(
        saveQuestion,
        queryResult.reason,
        providerClient,
        config,
        history,
        structuredContext,
        userId,
      );
      await this.saveConversation(userId, saveQuestion, answer, queryResult.sql ?? sql, undefined, sessionId);
      emit('error', { message: answer });
      return { enabled: false, reason: answer, answer };
    }

    return queryResult;
  }

  private async buildStrategySnapshotRows() {
    const [overview, salesTrend, topProducts, stockWarnings, afterSalesReasons] = await Promise.all([
      this.dashboardService.getOverview(),
      this.dashboardService.getSalesTrend({ period: 'day' }),
      this.dashboardService.getTopProducts({ type: 'top', limit: 5 }),
      this.dashboardService.getStockWarnings(),
      this.dashboardService.getAfterSalesReasonStats(),
    ]);

    return [
      { section: 'overview', metric: 'todayRevenue', label: '今日营收', value: overview.todayRevenue },
      { section: 'overview', metric: 'monthRevenue', label: '本月营收', value: overview.monthRevenue },
      { section: 'overview', metric: 'inventoryValue', label: '库存价值', value: overview.inventoryValue },
      { section: 'overview', metric: 'receivableTotal', label: '当前应收', value: overview.receivableTotal },
      { section: 'overview', metric: 'saleReturnTotal', label: '销售退货金额', value: overview.saleReturnTotal },
      { section: 'overview', metric: 'refundTotal', label: '退款金额', value: overview.refundTotal },
      ...salesTrend.points.map((point) => ({
        section: 'sales_trend',
        label: point.label,
        amount: point.amount,
        orderCount: point.orderCount,
      })),
      ...topProducts.list.map((item, index) => ({
        section: 'top_product',
        rank: index + 1,
        productName: item.productName,
        teaType: item.teaType,
        totalQuantity: Number(item.totalQuantity ?? 0),
        totalSales: Number(item.totalSales ?? 0),
      })),
      ...stockWarnings.slice(0, 5).map((warning, index) => ({
        section: 'stock_warning',
        rank: index + 1,
        productName: typeof warning.productName === 'string' ? warning.productName : '',
        warningType: typeof warning.warningType === 'string' ? warning.warningType : '',
        stockQty: Number(warning.stockQty ?? 0),
        safeStock: Number(warning.safeStock ?? 0),
        level: typeof warning.level === 'string' ? warning.level : '',
      })),
      ...afterSalesReasons.slice(0, 5).map((item, index) => ({
        section: 'after_sales_reason',
        rank: index + 1,
        reasonCode: item.reasonCode,
        count: item.count,
        amount: item.amount,
      })),
    ];
  }

  private async executeSqlWithRetry(
    sql: string,
    question: string,
    providerClient: ModelProviderClient,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[],
    structuredContext: AiStructuredContext | undefined,
    userId: number,
    emit: SseEmitter,
  ) {
    const firstResult = await this.aiSqlService.executeSelect(sql);
    if (firstResult.ok) {
      return firstResult;
    }

    this.logger.warn(`AI SQL 首次执行失败，准备重试。question=${question}; sql=${firstResult.sql ?? sql}; reason=${firstResult.reason}`);
    emit('status', { phase: 'execute', message: '第一次查询失败，正在自动修正后重试...' });

    const retryPromptResult = await this.aiPromptClientService.fetchSqlRetryMessages(
      question,
      firstResult.sql ?? sql,
      firstResult.reason,
      config,
      history,
      structuredContext,
      userId,
    );
    if (!retryPromptResult.ok) {
      return firstResult;
    }

    const retryModelResult = await providerClient.invoke(retryPromptResult.messages, config);
    if (!retryModelResult.ok) {
      return firstResult;
    }

    const retrySql = extractSqlFromContent(retryModelResult.content);
    if (!retrySql) {
      return firstResult;
    }

    const secondResult = await this.aiSqlService.executeSelect(retrySql);
    if (!secondResult.ok) {
      this.logger.warn(`AI SQL 二次执行仍失败。question=${question}; sql=${secondResult.sql ?? retrySql}; reason=${secondResult.reason}`);
      return secondResult;
    }

    this.logger.log(`AI SQL 自动修正重试成功。question=${question}; sql=${secondResult.sql}`);
    return secondResult;
  }

  private async buildFriendlyQueryErrorAnswer(
    question: string,
    reason: string,
    providerClient: ModelProviderClient,
    config: AiRuntimeConfig,
    history: AiChatHistoryItem[],
    structuredContext: AiStructuredContext | undefined,
    userId: number,
  ) {
    const promptResult = await this.aiPromptClientService.fetchQueryErrorMessages(
      question,
      reason,
      config,
      history,
      structuredContext,
      userId,
    );
    if (!promptResult.ok) {
      return this.buildGenericQueryErrorAnswer();
    }

    const result = await providerClient.invoke(promptResult.messages, config);
    if (!result.ok) {
      return this.buildGenericQueryErrorAnswer();
    }

    const answer = result.content.trim();
    return answer || this.buildGenericQueryErrorAnswer();
  }

  private buildGenericQueryErrorAnswer() {
    return '我刚刚没有成功查到这条数据。请换一种更具体的问法再试一次，比如带上订单号、客户名、供应商名或时间范围。';
  }

  private async getRecentStructuredContext(userId: number): Promise<AiStructuredContext> {
    const conversations = await this.aiConversationRepository.find({
      where: { userId },
      order: { id: 'DESC' },
      take: 6,
    });

    return conversations.reduce<AiStructuredContext>((merged, conversation) => {
      if (!conversation.contextJson) {
        return merged;
      }

      try {
        const context = JSON.parse(conversation.contextJson) as AiStructuredContext;
        return {
          orderNos: this.mergeContextList(merged.orderNos, context.orderNos),
          returnNos: this.mergeContextList(merged.returnNos, context.returnNos),
          refundNos: this.mergeContextList(merged.refundNos, context.refundNos),
          exchangeNos: this.mergeContextList(merged.exchangeNos, context.exchangeNos),
          customerNames: this.mergeContextList(merged.customerNames, context.customerNames),
          customerContacts: this.mergeContextList(merged.customerContacts, context.customerContacts),
          customerPhones: this.mergeContextList(merged.customerPhones, context.customerPhones),
          supplierNames: this.mergeContextList(merged.supplierNames, context.supplierNames),
          productNames: this.mergeContextList(merged.productNames, context.productNames),
          reasonCodes: this.mergeContextList(merged.reasonCodes, context.reasonCodes),
        };
      } catch {
        return merged;
      }
    }, {});
  }

  private mergeContextList(current: string[] | undefined, next: string[] | undefined) {
    return [...new Set([...(current ?? []), ...(next ?? [])])].slice(0, 6);
  }

  private isContactQuestion(question: string) {
    return /(联系人|电话|手机号|联系方式)/.test(question);
  }

  private buildUnavailableContactAnswer(questionMode: AiQuestionMode) {
    if (questionMode === 'strategy') {
      return '暂时不能直接给出联系人或联系电话。当前这类本地落地方案里的公开联系方式还没有经过结构化核验，建议优先通过官方公众号、地图商户页、商场/茶城服务台或现场招商主管再次确认。';
    }

    return '暂无相关数据。当前查询结果里没有该客户的联系人或电话信息，建议先在客户档案里补全联系人资料。';
  }

  private hasContactColumns(rows: Record<string, unknown>[]) {
    if (rows.length === 0) {
      return false;
    }

    return rows.some((row) => 'contact_name' in row || 'contactName' in row || 'phone' in row);
  }

  private buildDeterministicBusinessAnswer(question: string, rows: Record<string, unknown>[]) {
    if (rows.length === 0) {
      return null;
    }

    const exchangeAnswer = this.buildExchangeAnswer(question, rows);
    if (exchangeAnswer) {
      return exchangeAnswer;
    }

    return null;
  }

  private buildExchangeAnswer(question: string, rows: Record<string, unknown>[]) {
    const hasExchange = rows.some((row) => this.getText(row, ['exchange_no', 'exchangeNo']) || 'exchange_amount' in row);
    if (!hasExchange) {
      return null;
    }

    const isSingleExchange = new Set(rows.map((row) => this.getText(row, ['exchange_no', 'exchangeNo']) || '__single__')).size === 1;
    const hasDirectionRows = rows.some((row) => this.getText(row, ['direction']) === 'return' || this.getText(row, ['direction']) === 'out');
    const isSpecificExchangeQuestion = /(这单|这个|买的是|换的是什么|退的是|补差|退钱|退款|补钱|还欠|还要)/.test(question);

    if (!isSpecificExchangeQuestion && !(isSingleExchange && hasDirectionRows)) {
      return null;
    }

    const orderNo = this.getText(rows[0], ['order_no', 'orderNo']);
    const customerName = this.getText(rows[0], ['customer_name', 'customerName']) || '散客';
    const returnAmount = this.getNumber(rows[0], ['return_amount', 'returnAmount']);
    const exchangeAmount = this.getNumber(rows[0], ['exchange_amount', 'exchangeAmount']);
    const refundAmount = this.getNumber(rows[0], ['refund_amount', 'refundAmount']);
    const receiveAmount = this.getNumber(rows[0], ['receive_amount', 'receiveAmount']);
    const unpaidAmount = this.getNumber(rows[0], ['unpaid_amount', 'unpaidAmount']);
    const receivedAmount = this.getNumber(rows[0], ['received_amount', 'receivedAmount']);
    const theoreticalDiff = Math.abs(exchangeAmount - returnAmount);

    const returnLines = rows
      .filter((row) => this.getText(row, ['direction']) === 'return')
      .map((row) => `${this.getText(row, ['product_name', 'productName']) || '未知商品'} ${this.formatQuantityText(row)}`);
    const outLines = rows
      .filter((row) => this.getText(row, ['direction']) === 'out')
      .map((row) => `${this.getText(row, ['product_name', 'productName']) || '未知商品'} ${this.formatQuantityText(row)}`);

    const details: string[] = [];
    if (returnLines.length > 0) {
      details.push(`客户退回：${returnLines.join('，')}`);
    }
    if (outLines.length > 0) {
      details.push(`客户换走：${outLines.join('，')}`);
    }

    const settlement = this.buildExchangeSettlementText({
      returnAmount,
      exchangeAmount,
      refundAmount,
      receiveAmount,
      unpaidAmount,
      receivedAmount,
    });

    if (!/(换货|换走|退回|退的是|买的是|补差|退钱|退款)/.test(question)) {
      return null;
    }

    return [
      orderNo ? `${orderNo} 的换货情况如下：` : `${customerName} 这笔换货情况如下：`,
      ...details.map((item) => `- ${item}`),
      settlement,
    ].filter(Boolean).join('\n');
  }

  private buildExchangeSettlementText(params: {
    returnAmount: number;
    exchangeAmount: number;
    refundAmount: number;
    receiveAmount: number;
    unpaidAmount: number | null;
    receivedAmount: number | null;
  }) {
    const { returnAmount, exchangeAmount, refundAmount, receiveAmount, unpaidAmount, receivedAmount } = params;

    if (receiveAmount > 0) {
      return `这次换货客户实际补差 ¥${receiveAmount.toLocaleString()}。`;
    }

    if (refundAmount > 0) {
      return `这次换货已实际退款给客户 ¥${refundAmount.toLocaleString()}。`;
    }

    if (exchangeAmount > returnAmount) {
      const shouldReceive = exchangeAmount - returnAmount;
      if ((unpaidAmount ?? 0) > 0) {
        return `这次换货理论上应补差 ¥${shouldReceive.toLocaleString()}，目前订单还剩 ¥${(unpaidAmount ?? 0).toLocaleString()} 未收，通常表示差额仍在订单欠款里。`;
      }

      return `这次换货理论上应补差 ¥${shouldReceive.toLocaleString()}；当前未看到单独补差收款记录，建议再核对订单收款情况。`;
    }

    if (exchangeAmount < returnAmount) {
      const shouldOffset = returnAmount - exchangeAmount;
      if ((unpaidAmount ?? 0) > 0 || (receivedAmount ?? 0) === 0) {
        return `虽然换回金额比换出金额多 ¥${shouldOffset.toLocaleString()}，但这单没有显示实际退款记录；更合理的口径是先冲减原订单应收，客户最后按调整后的净额付款，不需要另外退现金。`;
      }

      return `这次换货理论上形成 ¥${shouldOffset.toLocaleString()} 的退差，但当前没有看到实际退款记录，建议再核对是否已线下处理。`;
    }

    if ((unpaidAmount ?? 0) > 0) {
      return `这次属于等价换货，没有额外退补差价；订单当前还剩 ¥${(unpaidAmount ?? 0).toLocaleString()} 未收。`;
    }

    return '这次属于等价换货，没有额外退补差价。';
  }

  private getText(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private getNumber(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }

    return 0;
  }

  private formatQuantityText(row: Record<string, unknown>) {
    const packageUnit = this.getText(row, ['package_unit', 'packageUnit']);
    const baseUnit = this.getText(row, ['unit']);
    const packageQty = this.getNumber(row, ['package_qty', 'packageQty']);
    const looseQty = this.getNumber(row, ['loose_qty', 'looseQty']);

    if (packageUnit && (packageQty > 0 || looseQty > 0)) {
      const parts: string[] = [];
      if (packageQty > 0) parts.push(`${packageQty}${packageUnit}`);
      if (looseQty > 0) parts.push(`${looseQty}${baseUnit}`);
      return parts.join(' + ');
    }

    return `${this.getNumber(row, ['quantity'])}${baseUnit || '件'}`;
  }

  private async saveConversation(
    userId: number,
    question: string,
    answer: string,
    sqlGenerated: string | null,
    structuredContext?: AiStructuredContext,
    sessionId?: string,
    rows?: Record<string, unknown>[],
  ) {
    await this.aiConversationRepository.save(
      this.aiConversationRepository.create({
        userId,
        sessionId: sessionId ?? null,
        question,
        answer,
        sqlGenerated,
        contextJson:
          structuredContext && Object.values(structuredContext).some((value) => (value?.length ?? 0) > 0)
            ? JSON.stringify(structuredContext)
            : null,
        rowsJson: rows && rows.length > 0 ? JSON.stringify(rows) : null,
      }),
    );

    // 保持每个用户最多 10 个 session，超出的删除最旧的
    if (sessionId) {
      await this.pruneOldSessions(userId);
    }
  }

  private async pruneOldSessions(userId: number) {
    const sessions = await this.aiConversationRepository
      .createQueryBuilder('c')
      .select('c.session_id', 'sessionId')
      .addSelect('MAX(c.id)', 'maxId')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.session_id IS NOT NULL')
      .groupBy('c.session_id')
      .orderBy('MAX(c.id)', 'DESC')
      .getRawMany<{ sessionId: string; maxId: number }>();

    if (sessions.length <= 10) {
      return;
    }

    const oldSessionIds = sessions.slice(10).map((s) => s.sessionId);
    await this.aiConversationRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId AND session_id IN (:...ids)', { userId, ids: oldSessionIds })
      .execute();
  }

  private serializeConversation(item: AiConversationEntity) {
    const { rowsJson, ...rest } = item;
    return {
      ...rest,
      rows: this.parseConversationRows(rowsJson),
    };
  }

  private parseConversationRows(rowsJson: string | null) {
    if (!rowsJson) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(rowsJson) as unknown;
      return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : undefined;
    } catch {
      return undefined;
    }
  }
}
