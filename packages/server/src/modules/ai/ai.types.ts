export type AiRuntimeConfig = {
  provider: string;
  modelName: string;
  modelApiKey: string;
  modelBaseUrl: string;
  apiKey: string;
  serviceUniqueId: string;
  instanceToken: string;
  promptServiceUrl: string;
  industry: string;
};

export type AiCapabilityCode =
  | 'OK'
  | 'AI_PROVIDER_MISSING'
  | 'AI_AUTH_KEY_MISSING'
  | 'AI_MODEL_API_KEY_MISSING'
  | 'SERVICE_ID_MISSING'
  | 'PROMPT_SERVICE_URL_MISSING'
  | 'PROMPT_SERVICE_UNAVAILABLE'
  | 'PROMPT_SERVICE_REQUEST_FAILED'
  | 'PROMPT_RESPONSE_INVALID'
  | 'INDUSTRY_MISMATCH'
  | 'API_KEY_NOT_FOUND'
  | 'API_KEY_DISABLED'
  | 'API_KEY_EXPIRED'
  | 'LICENSE_UNBOUND'
  | 'SERVICE_ID_REQUIRED'
  | 'SERVICE_ID_MISMATCH'
  | 'SERVICE_ALREADY_BOUND'
  | 'INSTANCE_LEASE_CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'PROMPT_INJECTION_BLOCKED'
  | 'REQUEST_SIGNATURE_MISSING'
  | 'REQUEST_TIMESTAMP_INVALID'
  | 'REQUEST_SIGNATURE_INVALID'
  | 'REQUEST_REPLAYED'
  | 'REQUEST_RATE_LIMITED'
  | 'REQUEST_COOLDOWN_ACTIVE'
  | 'FEATURE_DISABLED'
  | 'PROVIDER_NOT_SUPPORTED'
  | 'ATTACHMENT_INVALID'
  | 'MODEL_RESPONSE_INVALID'
  | 'MODEL_RESULT_INVALID'
  | 'MODEL_INVOKE_FAILED'
  | 'AI_RUNTIME_ERROR'
  | 'AI_INTERNAL_ERROR'

export type AiFeatureFlags = {
  allowLocalQuery: boolean;
  allowStrategyMode: boolean;
  allowWebSearch: boolean;
  allowThinking: boolean;
  allowLocalGrounding: boolean;
  allowAttachmentRecognition: boolean;
};

export type AiAuthorizationResult = {
  ok: boolean;
  reason: string;
  code: AiCapabilityCode;
  features: AiFeatureFlags | null;
};

export type AiModelInvokeOptions = {
  enableSearch?: boolean;
  enableThinking?: boolean;
};

export type AiAvailability = {
  enabled: boolean;
  reason: string;
  code?: AiCapabilityCode;
  config: AiRuntimeConfig | null;
};

export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type AiPromptMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | AiContentPart[];
};

export type AiAttachment = {
  /** image = base64 数据 URL（data:image/...;base64,...），text = 文件原始文字内容 */
  type: 'image' | 'text';
  content: string;
  mimeType?: string;
  filename?: string;
};

export type AiChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiStructuredContext = {
  orderNos?: string[];
  returnNos?: string[];
  refundNos?: string[];
  exchangeNos?: string[];
  customerNames?: string[];
  customerContacts?: string[];
  customerPhones?: string[];
  supplierNames?: string[];
  productNames?: string[];
  reasonCodes?: string[];
  /** product.ext_data 的可用 key 列表（提示 prompt-center 可用 json_extract 精准过滤） */
  productExtKeys?: string[];
  /** product.ext_data 每个 key 对应的枚举示例值（去重后取前若干个） */
  productExtValues?: Record<string, string[]>;
  /** product 主表中可能承载专业属性描述的列（spec/remark/origin/...）及其样值 */
  productAttributeColumns?: Record<string, string[]>;
};

export type AiPromptFetchResult =
  | {
      ok: true;
      messages: AiPromptMessage[];
      promptVersion?: string;
    }
  | {
      ok: false;
      reason: string;
      code?: AiCapabilityCode;
    };

export type AiModelInvokeResult =
  | {
      ok: true;
      content: string;
      raw?: unknown;
    }
  | {
      ok: false;
      reason: string;
      code?: AiCapabilityCode;
    };

export type AiQueryExecutionResult =
  | {
      ok: true;
      sql: string;
      rows: Record<string, unknown>[];
    }
  | {
      ok: false;
      reason: string;
      code?: AiCapabilityCode;
      sql?: string;
    };
