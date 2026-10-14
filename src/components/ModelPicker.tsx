import { useEffect, useState } from 'react'
import { PROVIDERS } from '../ai/providers'
import type { ModelInfo, ProviderId } from '../ai/types'
import { loadModelCache, saveModelCache } from '../store/settings'
import { Button, Input, Select } from './ui'

const CUSTOM = '__custom__'

/** Dropdown of the provider's models, fetched automatically when a key is available; a custom id is a fallback. */
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
  const [custom, setCustom] = useState(false)

  if (cachedFor !== provider) {
    setCachedFor(provider)
    setModels(loadModelCache()[provider] ?? [])
    setError('')
    setCustom(false)
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

  // Load the list the first time a key is available for this provider.
  useEffect(() => {
    if (apiKey && !(loadModelCache()[provider] ?? []).length) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, apiKey])

  const known = models.some((m) => m.id === value)
  const showInput = custom || (!!value && !known && models.length === 0)

  return (
    <div>
      <div className="flex gap-2">
        {showInput ? (
          <Input value={value} placeholder="model id" onChange={(e) => onChange(e.target.value.trim())} autoFocus={custom} />
        ) : (
          <Select
            value={known ? value : value ? value : ''}
            onChange={(e) => {
              if (e.target.value === CUSTOM) setCustom(true)
              else onChange(e.target.value)
            }}
            title="Model"
          >
            <option value="" disabled>
              {busy ? 'Loading models…' : models.length ? 'Choose a model…' : apiKey ? 'Press ↻ to load models' : 'Add an API key first'}
            </option>
            {value && !known && <option value={value}>{value}</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
              </option>
            ))}
            <option value={CUSTOM}>Custom model id…</option>
          </Select>
        )}
        {showInput && models.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => setCustom(false)} title="Back to the list">
            ☰
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={refresh} disabled={busy || !apiKey} title="Reload the model list from the provider">
          {busy ? '…' : '↻'}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
