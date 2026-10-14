import Anthropic from '@anthropic-ai/sdk'
import type { ChatResult, ModelInfo, Provider } from '../types'

function client(apiKey: string) {
  // The key never leaves the user's browser except to api.anthropic.com.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
}

/** Claude models that accept `output_config.effort`. */
const SUPPORTS_EFFORT = /^claude-(opus-4-[5-9]|opus-5|sonnet-5|fable-5|haiku-5|mythos-5)/
/** Models where the server-side refusal fallback (`fallbacks: "default"`) is available. */
const SUPPORTS_FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5-1)/

export const anthropic: Provider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  keyHint: 'sk-ant-...',
  keyUrl: 'https://console.anthropic.com/settings/keys',

  async listModels(apiKey) {
    const out: ModelInfo[] = []
    for await (const m of client(apiKey).models.list()) {
      out.push({ id: m.id, name: m.display_name, contextLength: m.max_input_tokens ?? undefined })
    }
    return out
  },

  async streamChat(apiKey, req, onText): Promise<ChatResult> {
    const useFallback = SUPPORTS_FALLBACK.test(req.model)
    const stream = client(apiKey).beta.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        ...(SUPPORTS_EFFORT.test(req.model) && req.effort ? { output_config: { effort: req.effort } } : {}),
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: req.signal },
    )
    stream.on('text', onText)
    const msg = await stream.finalMessage()

    const result: ChatResult = {
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    }
    if (msg.model !== req.model) result.servedBy = msg.model
    if (msg.stop_reason === 'max_tokens') result.notice = 'Output stopped at the max token limit.'
    if (msg.stop_reason === 'refusal') {
      result.notice = `Claude declined this request${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`
    }
    return result
  },
}
