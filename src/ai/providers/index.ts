import type { Provider, ProviderId } from '../types'
import { anthropic } from './anthropic'
import { gemini } from './gemini'
import { openai, openrouter } from './openaiCompat'
import { recordUsage } from '../usage'

/** Every request's token usage is logged, whichever page made it. */
function tracked(p: Provider): Provider {
  return {
    ...p,
    async streamChat(apiKey, req, onText) {
      const result = await p.streamChat(apiKey, req, onText)
      if (result.usage) void recordUsage(p.id, result.servedBy ?? req.model, req.feature ?? 'other', result.usage)
      return result
    },
  }
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: tracked(anthropic),
  openai: tracked(openai),
  gemini: tracked(gemini),
  openrouter: tracked(openrouter),
}
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
