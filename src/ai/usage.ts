// Token usage log and user-entered prices. Prices change often, so none are built in.
import { readJson, writeJson } from '../lib/storage'
import { db } from '../store/db'
import type { ProviderId, Usage } from './types'

const PRICES_KEY = 'gm.prices'

/** USD per million tokens, keyed by model id. */
export type Prices = Record<string, { input: number; output: number }>

export function loadPrices(): Prices {
  return readJson<Prices>(PRICES_KEY, {})
}

export function savePrices(p: Prices): void {
  writeJson(PRICES_KEY, p)
}

export function costOf(model: string, inputTokens: number, outputTokens: number, prices: Prices): number | null {
  const p = prices[model]
  if (!p) return null
  return (inputTokens * p.input + outputTokens * p.output) / 1e6
}

export async function recordUsage(provider: ProviderId, model: string, feature: string, usage: Usage): Promise<void> {
  if (usage.inputTokens == null && usage.outputTokens == null) return
  try {
    await db.usage.add({ at: Date.now(), provider, model, feature, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 })
  } catch {
    // Usage logging must never break a request.
  }
}
