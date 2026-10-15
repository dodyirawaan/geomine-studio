import { useEffect, useState } from 'react'
import { explainError } from '../ai/errors'
import { PROVIDERS } from '../ai/providers'
import type { ModelInfo, ProviderId } from '../ai/types'
import { loadModelCache, saveModelCache } from '../store/settings'

/** The provider's model list: cached, fetched automatically the first time a key is available, reloadable. */
export function useModelList(provider: ProviderId, apiKey?: string) {
  const [models, setModels] = useState<ModelInfo[]>(() => loadModelCache()[provider] ?? [])
  const [cachedFor, setCachedFor] = useState(provider)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (cachedFor !== provider) {
    setCachedFor(provider)
    setModels(loadModelCache()[provider] ?? [])
    setError('')
  }

  async function refresh() {
    if (!apiKey) return setError('Add an API key first.')
    setBusy(true)
    setError('')
    try {
      const list = await PROVIDERS[provider].listModels(apiKey)
      setModels(list)
      saveModelCache(provider, list)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  // Load the list the first time a key is available for this provider.
  useEffect(() => {
    if (apiKey && !(loadModelCache()[provider] ?? []).length) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, apiKey])

  return { models, busy, error, refresh }
}
