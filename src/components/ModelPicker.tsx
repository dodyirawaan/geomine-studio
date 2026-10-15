import { useState } from 'react'
import type { ProviderId } from '../ai/types'
import { useModelList } from './useModelList'
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
  const { models, busy, error, refresh } = useModelList(provider, apiKey)
  const [custom, setCustom] = useState(false)
  const [customFor, setCustomFor] = useState(provider)

  if (customFor !== provider) {
    setCustomFor(provider)
    setCustom(false)
  }

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
