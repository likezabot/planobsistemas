/**
 * Retry helpers for E2E tests against Supabase/PostgREST.
 *
 * Only retries on PGRST002 (PostgREST schema cache reload after migrations).
 * All other errors — including business-rule failures — are returned as-is
 * so test assertions still see the real error.
 */

const RETRYABLE_CODES = new Set(['PGRST002']);
const RETRYABLE_MESSAGE_HINTS = [
  'schema cache',
  'Could not query the database for the schema cache',
];

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 600;

function isRetryableError(error: any): boolean {
  if (!error) return false;
  if (error.code && RETRYABLE_CODES.has(error.code)) return true;
  const msg: string = error.message || '';
  return RETRYABLE_MESSAGE_HINTS.some((h) => msg.includes(h));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Execute a Supabase query/RPC builder and retry only on PGRST002.
 * The factory is invoked on every attempt so the underlying request is fresh.
 */
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

/** Convenience wrapper for client.rpc(name, params). */
export async function rpcWithRetry(
  client: any,
  name: string,
  params?: Record<string, any>,
  opts?: RetryOptions
) {
  return withRetry(() => client.rpc(name, params), opts);
}

/**
 * Convenience wrapper for table queries.
 * Pass a function that builds the query — it's re-invoked on each attempt.
 *   await queryWithRetry(() => client.from('orders').select('*'))
 */
export async function queryWithRetry<T extends { error: any; data: any }>(
  builder: () => PromiseLike<T>,
  opts?: RetryOptions
): Promise<T> {
  return withRetry(builder, opts);
}
