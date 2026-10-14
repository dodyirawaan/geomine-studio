import { useState } from 'react'
import { PROVIDER_IDS, PROVIDERS } from '../ai/providers'
import type { Effort, ProviderId } from '../ai/types'
import { ModelPicker } from '../components/ModelPicker'
import { UnlockPanel } from '../components/UnlockPanel'
import { Button, Card, Input, Label, Select } from '../components/ui'
import { useSettings } from '../store/settings'
import { useVault, type Secrets } from '../store/vault'

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export default function SettingsPage() {
  const { status, secrets, save, lock } = useVault()
  const [settings, update] = useSettings()
  const [draft, setDraft] = useState<Secrets>(secrets)
  const [syncedFrom, setSyncedFrom] = useState(secrets)
  const [saved, setSaved] = useState(false)

  if (syncedFrom !== secrets) {
    setSyncedFrom(secrets)
    setDraft(secrets)
  }

  if (status !== 'unlocked') return <UnlockPanel />

  async function saveKeys() {
    await save(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card
        title={
          <div className="flex items-center justify-between">
            <span>API keys</span>
            <Button variant="ghost" onClick={lock}>
              Lock vault
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
          Keys are encrypted in this browser and sent only to their own provider. Use a key with a spending limit.
        </p>
        <div className="space-y-3">
          {PROVIDER_IDS.map((id) => {
            const p = PROVIDERS[id]
            return (
              <label key={id} className="block">
                <Label
                  hint={
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="underline">
                      get a key
                    </a>
                  }
                >
                  {p.label}
                </Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={p.keyHint}
                  value={draft[id] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [id]: e.target.value.trim() })}
                />
              </label>
            )
          })}
          <div className="flex items-center gap-3">
            <Button onClick={saveKeys}>Save keys</Button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </div>
      </Card>

      <Card title="Default models">
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
          Press ↻ to load each provider's current model list. You can switch provider and model per message in the chat.
        </p>
        <div className="space-y-3">
          <label className="block">
            <Label>Default provider</Label>
            <Select value={settings.provider} onChange={(e) => update({ provider: e.target.value as ProviderId })}>
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDERS[id].label}
                </option>
              ))}
            </Select>
          </label>
          {PROVIDER_IDS.map((id) => (
            <div key={id}>
              <Label>{PROVIDERS[id].label} model</Label>
              <ModelPicker
                provider={id}
                apiKey={secrets[id]}
                value={settings.models[id]}
                onChange={(m) => update({ models: { ...settings.models, [id]: m } })}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Generation">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label hint="(Claude only)">Reasoning effort</Label>
            <Select value={settings.anthropicEffort} onChange={(e) => update({ anthropicEffort: e.target.value as Effort })}>
              {EFFORTS.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <Label>Max output tokens</Label>
            <Input
              type="number"
              min={1024}
              step={1024}
              value={settings.maxTokens}
              onChange={(e) => update({ maxTokens: Math.max(1024, Number(e.target.value) || 1024) })}
            />
          </label>
        </div>
      </Card>
    </div>
  )
}
