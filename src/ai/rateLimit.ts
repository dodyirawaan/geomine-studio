// Rate limits (HTTP 429): free tiers allow only a few requests per minute and per day. A per-minute limit is waited out;
// a daily limit stops with a clear message, since retrying cannot help until the quota resets.

export class RateLimitError extends Error {
  /** Seconds the provider asks us to wait, when it says. */
  readonly retryAfter?: number
  /** The daily (or other long-period) quota is used up. */
  readonly daily: boolean

  constructor(message: string, retryAfter?: number, daily = false) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
    this.daily = daily
  }
}

function seconds(s: unknown): number | undefined {
  const n = parseFloat(String(s ?? ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Builds a RateLimitError from a 429 response body (Gemini, OpenAI, OpenRouter shapes) and headers. */
export function rateLimitFrom(provider: string, body: unknown, headers?: Headers): RateLimitError {
  const err = (body as { error?: { message?: string; details?: Record<string, unknown>[] } })?.error
  const details = err?.details ?? []
  const retry = details.find((d) => String(d['@type']).endsWith('RetryInfo'))?.retryDelay
  const quota = details.find((d) => String(d['@type']).endsWith('QuotaFailure')) as { violations?: { quotaId?: string; quotaMetric?: string }[] } | undefined
  const ids = (quota?.violations ?? []).map((v) => `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`).join(' ')
  const message = err?.message ?? 'Too many requests'
  const daily = /PerDay|per day|daily/i.test(ids) || /per day|daily/i.test(message) || /insufficient_quota|billing|credit/i.test(message)
  const retryAfter = seconds(retry) ?? seconds(headers?.get('retry-after')) ?? seconds(message.match(/retry in ([\d.]+)s/i)?.[1])
  return new RateLimitError(`${provider} 429: ${message}`, retryAfter, daily)
}

/** Recognises rate-limit errors from our fetch providers and from the Anthropic SDK. */
export function asRateLimit(e: unknown): RateLimitError | null {
  if (e instanceof RateLimitError) return e
  const x = e as { status?: number; headers?: Headers | Record<string, string>; message?: string }
  if (x?.status !== 429) return null
  const h = x.headers instanceof Headers ? x.headers.get('retry-after') : x.headers?.['retry-after']
  return new RateLimitError(x.message ?? 'Too many requests', seconds(h))
}

export const DAILY_LIMIT_HELP =
  'The daily quota of this model is used up. Work done so far is saved. Continue after the quota resets (usually midnight Pacific time for Gemini), pick a model with a larger free quota (for example a Flash-Lite model), or switch provider in Settings.'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('Aborted', 'AbortError'))), { once: true })
  })
}

/**
 * Runs a request, waiting out per-minute rate limits (up to `tries` attempts) and reporting the wait.
 * A daily limit is rethrown at once with an explanation.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, opts: { signal?: AbortSignal; onWait?: (secondsLeft: number) => void; tries?: number } = {}): Promise<T> {
  const tries = opts.tries ?? 5
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const rl = asRateLimit(e)
      if (!rl) throw e
      if (rl.daily) throw new RateLimitError(`${rl.message}\n\n${DAILY_LIMIT_HELP}`, undefined, true)
      if (attempt >= tries) throw new Error(`${rl.message}\n\nStill rate-limited after ${tries} attempts. Wait a few minutes and continue; work done so far is saved.`)
      let wait = Math.ceil(Math.min(120, Math.max(5, rl.retryAfter ?? 15 * attempt)) + 1)
      while (wait > 0) {
        opts.onWait?.(wait)
        await sleep(1000, opts.signal)
        wait--
      }
      opts.onWait?.(0)
    }
  }
}
