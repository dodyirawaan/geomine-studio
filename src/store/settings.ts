import { useCallback, useState } from 'react'
import { readJson, writeJson } from '../lib/storage'
import type { Effort, ModelInfo, ProviderId } from '../ai/types'

const SETTINGS_KEY = 'gm.settings'
const MODELS_KEY = 'gm.models'

export interface Settings {
  provider: ProviderId
  models: Record<ProviderId, string>
  /** Reasoning depth for Claude models that support `output_config.effort`. */
  anthropicEffort: Effort
  maxTokens: number
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  models: {
    anthropic: 'claude-opus-5-5',
    openai: '',
    gemini: '',
    openrouter: '',
  },
  anthropicEffort: 'high',
  maxTokens: 32000,
}

export function loadSettings(): Settings {
  const s = readJson<Partial<Settings>>(SETTINGS_KEY, {})
  return { ...DEFAULT_SETTINGS, ...s, models: { ...DEFAULT_SETTINGS.models, ...s.models } }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(loadSettings)
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeJson(SETTINGS_KEY, next)
      return next
    })
  }, [])
  return [settings, update]
}

/** Cached model lists, so the picker works without refetching every visit. */
export function loadModelCache(): Partial<Record<ProviderId, ModelInfo[]>> {
  return readJson(MODELS_KEY, {})
}

export function saveModelCache(provider: ProviderId, models: ModelInfo[]): void {
  writeJson(MODELS_KEY, { ...loadModelCache(), [provider]: models })
}
