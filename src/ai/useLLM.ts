import { useCallback } from 'react'
import { PROVIDERS } from './providers'
import type { ChatResult } from './types'
import { useSettings } from '../store/settings'
import { useVault } from '../store/vault'

/** One-shot requests with the user's current provider and model, for features outside the chat. */
export function useLLM() {
  const { status, secrets } = useVault()
  const [settings] = useSettings()
  const provider = settings.provider
  const model = settings.models[provider]
  const apiKey = secrets[provider]
  const ready = status === 'unlocked' && !!apiKey && !!model

  const run = useCallback(
    async (system: string, user: string, opts: { onText?: (acc: string) => void; signal?: AbortSignal } = {}): Promise<{ text: string } & ChatResult> => {
      if (!apiKey || !model) throw new Error('Unlock the vault and choose a provider and model first.')
      let text = ''
      const result = await PROVIDERS[provider].streamChat(
        apiKey,
        { model, system, messages: [{ role: 'user', content: user }], maxTokens: settings.maxTokens, effort: settings.anthropicEffort, signal: opts.signal },
        (d) => {
          text += d
          opts.onText?.(text)
        },
      )
      return { text, ...result }
    },
    [apiKey, model, provider, settings.maxTokens, settings.anthropicEffort],
  )

  const missing =
    status !== 'unlocked' ? 'Unlock your key vault in Settings to use AI features.' : !apiKey ? `Add a ${PROVIDERS[provider].label} key in Settings.` : !model ? 'Choose a model in Settings.' : ''

  return { ready, run, missing, label: `${PROVIDERS[provider].label} · ${model || 'no model'}` }
}
