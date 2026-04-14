import { createHash, createHmac, randomUUID } from 'crypto';
import { AiRuntimeConfig } from './ai.types';

type SignedPayload = Record<string, unknown>;

const SECURITY_FIELDS = new Set(['timestamp', 'nonce', 'signature']);

export function attachRequestSignature(
  config: Pick<AiRuntimeConfig, 'apiKey' | 'serviceUniqueId' | 'instanceToken'>,
  payload: SignedPayload,
) {
  const timestamp = Date.now();
  const nonce = randomUUID().replace(/-/g, '');
  const signedPayload = {
    ...payload,
    timestamp,
    nonce,
  };

  return {
    ...signedPayload,
    signature: buildRequestSignature(config, signedPayload),
  };
}

function buildRequestSignature(
  config: Pick<AiRuntimeConfig, 'apiKey' | 'serviceUniqueId' | 'instanceToken'>,
  payload: SignedPayload,
) {
  const payloadHash = createHash('sha256')
    .update(stableStringify(stripSecurityFields(payload)))
    .digest('hex');

  const timestamp = Number(payload.timestamp ?? 0);
  const nonce = String(payload.nonce ?? '');
  const secret = buildSignatureSecret(config);

  return createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${payloadHash}`)
    .digest('hex');
}

function buildSignatureSecret(config: Pick<AiRuntimeConfig, 'apiKey' | 'serviceUniqueId' | 'instanceToken'>) {
  const envSecret = process.env.PROMPT_REQUEST_SIGNATURE_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  return [
    'prompt-center',
    config.apiKey,
    config.serviceUniqueId ?? '',
    config.instanceToken ?? '',
  ].join('|');
}

function stripSecurityFields(payload: SignedPayload) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SECURITY_FIELDS.has(key) || value === undefined) {
      continue;
    }
    next[key] = normalizeValue(value);
  }
  return next;
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return entries.reduce<Record<string, unknown>>((accumulator, [key, item]) => {
      accumulator[key] = normalizeValue(item);
      return accumulator;
    }, {});
  }

  return value;
}
