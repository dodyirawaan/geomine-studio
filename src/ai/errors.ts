import { asRateLimit, DAILY_LIMIT_HELP } from './rateLimit'

/**
 * Turns any error into a plain sentence saying why it failed, without HTTP codes, provider prefixes or JSON.
 * Used for every warning shown to the user.
 */
export function explainError(e: unknown): string {
  const err = e as { name?: string; status?: number; message?: string }
  const msg = String(err?.message ?? e ?? '')
  if (err?.name === 'AbortError') return 'Stopped.'
  const rl = asRateLimit(e) ?? (/\b429\b|rate.?limit|too many requests/i.test(msg) ? { daily: /per[- ]day|daily|quota/i.test(msg) } : null)
  if (rl?.daily) return DAILY_LIMIT_HELP
  if (rl || /Still rate-limited/i.test(msg)) return 'The AI provider is getting too many requests right now. Wait a few minutes and continue; work done so far is saved.'
  const status = err?.status ?? Number(msg.match(/^[\w .()-]+? (\d{3}):/)?.[1] ?? 0)
  if (status === 401 || status === 403 || /api key|unauthori[sz]ed|permission denied/i.test(msg)) return 'The AI provider did not accept the API key. Check the key in Settings.'
  if (status === 402 || /insufficient.?(credit|balance|funds)|billing/i.test(msg)) return 'The AI account has no credit left. Top it up or choose a free model in Settings.'
  if (status === 404 || /model.*not (found|exist|supported)/i.test(msg)) return 'This model is not available from the provider. Choose another model in Settings.'
  if (status === 413 || /context.?length|too (long|large)|maximum.*tokens|token limit/i.test(msg)) return 'The text is too long for this model. Choose a model with a larger context window in Settings.'
  if (/safety|blocked|content.?filter|policy/i.test(msg)) return 'The AI provider declined to answer this request. Try again or choose another model.'
  if (status === 400) return 'The AI provider could not process this request. Try again or choose another model in Settings.'
  if (status >= 500 || /overloaded|unavailable|timeout|timed out/i.test(msg)) return 'The AI provider is busy or down right now. Try again in a few minutes.'
  if (/failed to fetch|networkerror|network error|load failed|ERR_/i.test(msg)) return 'Could not reach the server. Check your internet connection and try again.'
  if (status || /^\s*[{[]/.test(msg)) return 'The AI provider returned an error. Try again or choose another model in Settings.'
  return msg.replace(/^[\w .()-]+? \d{3}:\s*/, '') || 'Something went wrong. Try again.'
}
