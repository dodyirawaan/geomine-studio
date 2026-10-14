import type { Provider, ProviderId } from '../types'
import { anthropic } from './anthropic'
import { gemini } from './gemini'
import { openai, openrouter } from './openaiCompat'

export const PROVIDERS: Record<ProviderId, Provider> = { anthropic, openai, gemini, openrouter }
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
