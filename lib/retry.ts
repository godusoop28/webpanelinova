/**
 * Generic exponential backoff, shared by every outbound call to
 * EasyBroker/ManyChat and by the "wait for EasyBroker to process the
 * contact_request" polling loop that replaces Make's fixed 8s/4s sleeps
 * (Fase 18/19 of the migration). No "server-only": pure, testable logic.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttemptFailed?: (attempt: number, error: unknown) => void;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

/** Retries `fn` while it throws. Re-throws the last error once attempts are exhausted. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 8000, onAttemptFailed } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onAttemptFailed?.(attempt, error);
      if (attempt === maxAttempts) break;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastError;
}

/**
 * Polls `fn` until it returns a truthy result or attempts run out — for
 * "search for the thing that should exist by now" instead of "retry until
 * this stops throwing". Never throws; returns null on exhaustion so the
 * caller can fall back safely (Fase 18: "si no aparece, NO perder lead").
 */
export async function pollUntil<T>(fn: () => Promise<T | null | undefined>, options: RetryOptions = {}): Promise<T | null> {
  const { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 8000, onAttemptFailed } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      onAttemptFailed?.(attempt, error);
    }
    if (attempt === maxAttempts) return null;
    await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
  }
  return null;
}

/**
 * Long-horizon backoff schedule for lib/services/retry.service.ts's
 * integration_jobs (Fase 20: 1min, 5min, 15min, 1h, then give up). Distinct
 * from backoffDelay above, which is for immediate in-request retries —
 * this one is for a job picked up again later by the cron endpoint.
 *
 * `attempts` is the 1-based count of failures so far (the caller increments
 * before calling this), so attempt 1 maps to scheduleMinutes[0] — the first
 * tier — not scheduleMinutes[1]. Getting this off by one silently skips the
 * fastest retry tier and gives up one attempt early.
 */
export function nextBackoffRetryAt(attempts: number, scheduleMinutes: number[], now: Date = new Date()): Date | null {
  if (attempts > scheduleMinutes.length || attempts < 1) return null;
  return new Date(now.getTime() + scheduleMinutes[attempts - 1] * 60 * 1000);
}
