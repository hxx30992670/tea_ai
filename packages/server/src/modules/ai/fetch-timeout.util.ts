const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout:${timeoutMs}`)), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function getTimeoutMessage(error: unknown, label: string, timeoutMs: number) {
  if (error instanceof Error && (error.name === 'AbortError' || error.message.startsWith('timeout:'))) {
    return `${label} 超时（>${Math.round(timeoutMs / 1000)}s）`;
  }

  return error instanceof Error ? error.message : 'unknown error';
}
