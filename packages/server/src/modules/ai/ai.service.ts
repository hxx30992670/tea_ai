import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthUser } from '../../common/types/auth-user.type';
import { AiConversationEntity } from '../../entities/ai-conversation.entity';
import { ProductEntity } from '../../entities/product.entity';
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
  productName: string;
  productId: number | null;
  quantity: number | null;
  quantityUnit: string | null;
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
    return this.runDatabaseChatResponse({
      effectiveQuestion: question,
      saveQuestion: question,
      user,
      history,
      emitter,
      sessionId,
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
  }) {
    const {
      effectiveQuestion,
      saveQuestion,
      user,
      history = [],
      emitter,
      sessionId,
      useRecentStructuredContext = true,
    } = params;
    const currentSessionId = sessionId || `sess_${Date.now()}`;
    const emit = (event: string, data: unknown) => emitter?.(event, data);
    const structuredContext = useRecentStructuredContext
      ? await this.getRecentStructuredContext(user.sub)
      : {};

    // ── 1. 检查 AI 配置 ──────────────────────────────────────────────────────

    const availability = await this.aiConfigService.getAvailability();

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

    // ── 2. 生成 SQL ───────────────────────────────────────────────────────────

    emit('status', { phase: 'sql', message: '正在理解问题，生成查询语句...' });

    const sqlPromptResult = await this.aiPromptClientService.fetchSqlMessages(
      effectiveQuestion,
      availability.config,
      history,
      structuredContext,
    );

    if (!sqlPromptResult.ok) {
      const answer = `提示词获取失败：${sqlPromptResult.reason}`;
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: sqlPromptResult.reason });
      return { enabled: false, reason: sqlPromptResult.reason, answer };
    }

    const sqlModelResult = await providerClient.invoke(sqlPromptResult.messages, availability.config);

    if (!sqlModelResult.ok) {
      const answer = `模型调用失败：${sqlModelResult.reason}`;
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: sqlModelResult.reason });
      return { enabled: false, reason: sqlModelResult.reason, answer };
    }

    const sql = extractSqlFromContent(sqlModelResult.content);
    if (!sql) {
      const answer = 'AI 未能生成有效的查询语句，请换一种问法试试';
      await this.saveConversation(user.sub, saveQuestion, answer, null, undefined, currentSessionId);
      emit('error', { message: answer });
      return { enabled: false, reason: 'AI 未生成有效 SQL', answer };
    }

    // ── 3. 执行 SQL ───────────────────────────────────────────────────────────

    emit('status', { phase: 'execute', message: '正在查询数据库...' });

    const queryResult = await this.executeSqlWithRetry(
      sql,
      effectiveQuestion,
      providerClient,
      availability.config,
      sqlPromptResult.messages,
      emit,
    );

    if (!queryResult.ok) {
      this.logger.warn(`AI SQL 执行失败。question=${effectiveQuestion}; sql=${queryResult.sql ?? sql}; reason=${queryResult.reason}`);
      const answer = this.buildFriendlyQueryErrorAnswer(saveQuestion, queryResult.reason);
      await this.saveConversation(user.sub, saveQuestion, answer, queryResult.sql ?? sql, undefined, currentSessionId);
      emit('error', { message: answer });
      return { enabled: false, reason: answer, answer };
    }

    // ── 3.5 把原始查询结果推给前端（用于渲染图表/表格）─────────────────────────
    emit('rows', { rows: queryResult.rows });

    if (this.isContactQuestion(`${saveQuestion}\n${effectiveQuestion}`) && !this.hasContactColumns(queryResult.rows)) {
      const answer = '暂无相关数据。当前查询结果里没有该客户的联系人或电话信息，建议先在客户档案里补全联系人资料。';
      await this.saveConversation(user.sub, saveQuestion, answer, queryResult.sql, undefined, currentSessionId);
      emit('token', { content: answer });
      return { enabled: true, reason: '', answer };
    }

    const deterministicAnswer = this.buildDeterministicBusinessAnswer(`${saveQuestion}\n${effectiveQuestion}`, queryResult.rows);
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

    emit('status', { phase: 'summary', message: '正在整理回答...' });

    const summaryQuestion = saveQuestion === effectiveQuestion
      ? saveQuestion
      : `${saveQuestion}\n【附件识别线索】${effectiveQuestion}`;

    const summaryPromptResult = await this.aiPromptClientService.fetchSummaryMessages(
      summaryQuestion,
      queryResult.sql,
      queryResult.rows,
      availability.config,
      history,
      structuredContext,
    );

    let answer: string;

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
      );
      answer = summaryResult.ok ? summaryResult.content : this.buildRawResultAnswer(queryResult.sql, queryResult.rows);
      emit('token', { content: answer });
    }

    const nextStructuredContext = await this.aiPromptClientService.buildStructuredContext(
      availability.config,
      structuredContext,
      queryResult.rows,
    );

    await this.saveConversation(user.sub, saveQuestion, answer, queryResult.sql, nextStructuredContext, currentSessionId, queryResult.rows);
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
    if (trimmed.startsWith('{')) return trimmed;

    // 提取 markdown 代码块中的 JSON
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) return match[1].trim();

    // 提取第一个 { ... } 块
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
        productName,
        productId: this.toOptionalNumber(current.productId),
        quantity: this.toOptionalNumber(current.quantity),
        quantityUnit: this.toOptionalString(current.quantityUnit),
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
      promptServiceUrl: availability.config?.promptServiceUrl ?? '',
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

  private buildRawResultAnswer(sql: string, rows: Record<string, unknown>[]) {
    return [
      `查询成功，命中 ${rows.length} 条记录。`,
      `执行语句：${sql}`,
      formatRowsForSummary(rows),
    ].join('\n');
  }

  private async executeSqlWithRetry(
    sql: string,
    question: string,
    providerClient: ModelProviderClient,
    config: AiRuntimeConfig,
    originalMessages: AiPromptMessage[],
    emit: SseEmitter,
  ) {
    const firstResult = await this.aiSqlService.executeSelect(sql);
    if (firstResult.ok) {
      return firstResult;
    }

    this.logger.warn(`AI SQL 首次执行失败，准备重试。question=${question}; sql=${firstResult.sql ?? sql}; reason=${firstResult.reason}`);
    emit('status', { phase: 'execute', message: '第一次查询失败，正在自动修正后重试...' });

    const retryMessages = this.buildSqlRetryMessages(question, firstResult.sql ?? sql, firstResult.reason, originalMessages);
    const retryModelResult = await providerClient.invoke(retryMessages, config);
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

  private buildSqlRetryMessages(
    question: string,
    failedSql: string,
    reason: string,
    originalMessages: AiPromptMessage[],
  ): AiPromptMessage[] {
    const systemMessage = originalMessages.find((item) => item.role === 'system');
    const userMessage = [...originalMessages].reverse().find((item) => item.role === 'user');

    return [
      ...(systemMessage ? [systemMessage] : []),
      {
        role: 'user',
        content: [
          userMessage?.content ?? `【当前问题】${question}`,
          '',
          '【上一次失败的 SQL】',
          failedSql,
          '',
          '【失败原因】',
          reason,
          '',
          '请重新生成一条更保守、更兼容 SQLite 的 SELECT 语句，并严格遵守下面规则：',
          '1. 只能输出一条 SELECT 语句',
          '2. 结果列必须显式命名，不要使用 SELECT *',
          '3. 如果用了 UNION / UNION ALL，ORDER BY 只能使用最终结果列名，不能使用表别名列名',
          '4. 查询 sale_order 时，涉及欠款请使用 total_amount - received_amount - returned_amount',
          '5. 查询 purchase_order 时，涉及欠款请使用 total_amount - paid_amount - returned_amount',
          '6. 查询 sale_order 与 customer 的关系时，优先使用 LEFT JOIN customer，避免漏掉散客',
          '7. 换货明细 direction 使用 return / out，不要使用 in',
          '8. 查询库存调整、盘盈、盘亏、报损、领用时，优先查询 stock_record，并使用准确的 reason 代码：surplus=盘盈入库、shortage=盘亏出库、damage=报损出库、usage=内部领用',
          '9. 如果用户问“亏损出库”或“损耗出库”，优先覆盖 damage、shortage 这两类出库原因',
          '10. 语句尽量简单，优先保证能执行成功',
        ].join('\n'),
      },
    ];
  }

  private buildFriendlyQueryErrorAnswer(question: string, reason: string) {
    if (/(售后|退货|退款|换货)/.test(question)) {
      return '我刚刚在整理售后数据时没有成功查到完整结果。你可以换一种问法试试，比如“最近有哪些退货”“最近有哪些仅退款”“最近有哪些换货”。';
    }

    if (/(电话|联系人|手机号|联系方式)/.test(question)) {
      return '我这次没能顺利查到联系人信息。你可以换一种更明确的问法试试，比如“贺超的联系电话是多少”或“这个客户的联系人和电话是什么”。';
    }

    if (/(欠款|应收|应付|付款|收款)/.test(question)) {
      return '我这次没能顺利算出这笔账款结果。你可以换一种更明确的问法试试，比如“哪个客户还欠我钱”“这张单还欠多少钱”或“哪些供应商还没付款”。';
    }

    if (/(库存|入库|出库|盘盈|盘亏|盘点|报损|领用|损耗|亏损)/.test(question)) {
      return '我这次没能顺利查到库存流水。你可以换一种更明确的问法试试，比如“最近有哪些盘盈入库”“最近有哪些盘亏出库”“报损出库有哪些”“内部领用明细”或“某商品近 30 天库存流水”。';
    }

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
