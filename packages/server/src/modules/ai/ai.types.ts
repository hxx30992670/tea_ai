export type AiRuntimeConfig = {
  provider: string;
  modelName: string;
  modelApiKey: string;
  modelBaseUrl: string;
  apiKey: string;
  promptServiceUrl: string;
  industry: string;
};

export type AiModelInvokeOptions = {
  enableSearch?: boolean;
  enableThinking?: boolean;
};

export type AiAvailability = {
  enabled: boolean;
  reason: string;
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
      sql?: string;
    };
