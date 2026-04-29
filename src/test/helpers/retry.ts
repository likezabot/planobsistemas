/**
 * Retry helpers for E2E tests against Supabase/PostgREST.
 *
 * Only retries on PGRST002 (PostgREST schema cache reload after migrations).
 * All other errors — including business-rule failures and permission denials —
 * are returned as-is so test assertions still see the real error.
 */

const RETRYABLE_CODES = new Set(['PGRST002']);

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_DELAY_MS = 500;

function isRetryableError(error: any): boolean {
  if (!error) return false;
  // STRICT: only retry when PostgREST explicitly says PGRST002.
  // Do not match on message text — empty/permission errors should NOT retry.
  return error.code === 'PGRST002';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

export async function withRetry<T extends { error: any; data: any }>(
  factory: () => PromiseLike<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;

  let lastResult: T | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    const result = await factory();
    lastResult = result;
    if (!isRetryableError(result.error)) {
      return result;
    }
    if (attempt < max) {
      // eslint-disable-next-line no-console
      console.warn(
        `[withRetry] PGRST002 schema cache (attempt ${attempt}/${max}); retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  return lastResult as T;
}

export async function rpcWithRetry(
  client: any,
  name: string,
  params?: Record<string, any>,
  opts?: RetryOptions
) {
  return withRetry(() => client.rpc(name, params), opts);
}

export async function queryWithRetry<T extends { error: any; data: any }>(
  builder: () => PromiseLike<T>,
  opts?: RetryOptions
): Promise<T> {
  return withRetry(builder, opts);
}
