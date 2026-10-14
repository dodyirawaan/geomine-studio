import { useState } from 'react'
import { PROVIDERS } from '../ai/providers'
import type { ModelInfo, ProviderId } from '../ai/types'
import { loadModelCache, saveModelCache } from '../store/settings'
import { Button, Input } from './ui'

/** Free-text model id with suggestions fetched from the provider's model list. */
export function ModelPicker({
  provider,
  apiKey,
  value,
  onChange,
}: {
  provider: ProviderId
  apiKey?: string
  value: string
  onChange: (id: string) => void
}) {
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
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const listId = `models-${provider}`
  return (
    <div>
      <div className="flex gap-2">
        <Input list={listId} value={value} placeholder="model id" onChange={(e) => onChange(e.target.value.trim())} />
        <Button type="button" variant="ghost" onClick={refresh} disabled={busy} title="Fetch available models">
          {busy ? '…' : '↻'}
        </Button>
      </div>
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name && m.name !== m.id ? m.name : ''}
          </option>
        ))}
      </datalist>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && models.length > 0 && <p className="mt-1 text-xs text-stone-500">{models.length} models available</p>}
    </div>
  )
}
