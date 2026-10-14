import { httpError, sseData } from '../sse'
import type { ChatRequest, ChatResult, ModelInfo, Provider } from '../types'

interface CompatOptions {
  id: 'openai' | 'openrouter'
  label: string
  baseUrl: string
  keyHint: string
  keyUrl: string
  extraHeaders?: Record<string, string>
  filterModels: (raw: RawModel[]) => ModelInfo[]
}

export interface RawModel {
  id: string
  name?: string
  context_length?: number
}

/** OpenAI Chat Completions wire format, shared by OpenAI and OpenRouter. */
function createCompatProvider(o: CompatOptions): Provider {
  return {
    id: o.id,
    label: o.label,
    keyHint: o.keyHint,
    keyUrl: o.keyUrl,

    async listModels(apiKey) {
      const res = await fetch(`${o.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, ...o.extraHeaders },
      })
      if (!res.ok) throw await httpError(res, o.label)
      const body = (await res.json()) as { data: RawModel[] }
      return o.filterModels(body.data)
    },

    async streamChat(apiKey, req: ChatRequest, onText): Promise<ChatResult> {
      const res = await fetch(`${o.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: req.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...o.extraHeaders,
        },
        body: JSON.stringify({
          model: req.model,
          stream: true,
          stream_options: { include_usage: true },
          // OpenAI reasoning models reject `max_tokens`; OpenRouter normalises both.
          ...(o.id === 'openai' ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }),
          messages: [{ role: 'system', content: req.system }, ...req.messages],
        }),
      })
      if (!res.ok) throw await httpError(res, o.label)

      const result: ChatResult = {}
      for await (const data of sseData(res)) {
        if (data === '[DONE]') break
        const chunk = JSON.parse(data)
        if (chunk.error) throw new Error(`${o.label}: ${chunk.error.message ?? JSON.stringify(chunk.error)}`)
        const choice = chunk.choices?.[0]
        if (choice?.delta?.content) onText(choice.delta.content)
        if (choice?.finish_reason === 'length') result.notice = 'Output stopped at the max token limit.'
        if (choice?.finish_reason === 'content_filter') result.notice = 'Output was stopped by the provider content filter.'
        if (chunk.model && chunk.model !== req.model) result.servedBy = chunk.model
        if (chunk.usage) {
          result.usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens }
        }
      }
      return result
    },
  }
}

const NON_CHAT = /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|davinci|babbage|codex)/i

export const openai = createCompatProvider({
  id: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  keyHint: 'sk-...',
  keyUrl: 'https://platform.openai.com/api-keys',
  filterModels: (raw) =>
    raw
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !NON_CHAT.test(m.id))
      .map((m) => ({ id: m.id }))
      .sort((a, b) => b.id.localeCompare(a.id)),
})

export const openrouter = createCompatProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  keyHint: 'sk-or-...',
  keyUrl: 'https://openrouter.ai/keys',
  extraHeaders: {
    'HTTP-Referer': 'https://dodyirawaan.github.io/geomine-studio/',
    'X-Title': 'GeoMine Studio',
  },
  filterModels: (raw) =>
    raw
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => a.id.localeCompare(b.id)),
})
