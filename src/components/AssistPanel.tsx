import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildSystemPrompt } from '../ai/prompts'
import { PROVIDER_IDS, PROVIDERS } from '../ai/providers'
import type { ProviderId } from '../ai/types'
import { ASSIST_ACTIONS, buildAssistMessage, modeFor, type AssistActionInfo } from '../manuscript/assist'
import type { Manuscript, ManuscriptSection } from '../store/db'
import { useSettings } from '../store/settings'
import { useVault } from '../store/vault'
import { Markdown } from './Markdown'
import { ModelPicker } from './ModelPicker'
import { Button, Select } from './ui'

/** Models sometimes wrap the whole answer in a ```markdown fence; the section text should not keep it. */
function unfence(text: string): string {
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text)
  return (m ? m[1] : text).trim()
}

export function AssistPanel({
  manuscript,
  section,
  onReplace,
  onAppend,
}: {
  manuscript: Manuscript
  section: ManuscriptSection
  onReplace: (text: string) => void
  onAppend: (text: string) => void
}) {
  const { status, secrets } = useVault()
  const [settings, update] = useSettings()
  const [custom, setCustom] = useState('')
  const [output, setOutput] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [lastAction, setLastAction] = useState<AssistActionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const provider = settings.provider
  const model = settings.models[provider]
  const apiKey = secrets[provider]

  if (status !== 'unlocked') {
    return (
      <div className="space-y-2 p-3 text-sm">
        <p className="font-medium">AI co-author</p>
        <p className="text-stone-500">
          Unlock your key vault to draft, revise and review sections. Your text stays editable while locked.
        </p>
        <Link to="/settings" className="text-amber-700 underline dark:text-amber-500">
          Open Settings
        </Link>
      </div>
    )
  }

  async function run(action: AssistActionInfo) {
    if (!apiKey || !model || busy) return
    if (action.id === 'custom' && !custom.trim()) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    setOutput('')
    setNotice('')
    setError('')
    setLastAction(action)
    let acc = ''
    try {
      const result = await PROVIDERS[provider].streamChat(
        apiKey,
        {
          model,
          system: buildSystemPrompt(modeFor(action, section), manuscript.journal),
          messages: [{ role: 'user', content: buildAssistMessage(manuscript, section, action, custom) }],
          maxTokens: settings.maxTokens,
          effort: settings.anthropicEffort,
          signal: ctrl.signal,
          feature: 'Editor co-author',
        },
        (delta) => {
          acc += delta
          setOutput(acc)
        },
      )
      setNotice([result.notice, result.usage && `${result.usage.inputTokens ?? '?'} in · ${result.usage.outputTokens ?? '?'} out`].filter(Boolean).join(' · '))
    } catch (e) {
      if (ctrl.signal.aborted) setNotice('Stopped.')
      else setError((e as Error).message)
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const result = unfence(output)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-stone-200 p-3 dark:border-stone-800">
        <p className="text-sm font-medium">
          AI co-author <span className="font-normal text-stone-500">· {section.title}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={provider} onChange={(e) => update({ provider: e.target.value as ProviderId })} title="Provider">
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
                {secrets[id] ? '' : ' (no key)'}
              </option>
            ))}
          </Select>
          <ModelPicker provider={provider} apiKey={apiKey} value={model} onChange={(m) => update({ models: { ...settings.models, [provider]: m } })} />
        </div>
        {!apiKey && <p className="text-xs text-amber-700">Add a {PROVIDERS[provider].label} key in Settings.</p>}
        <div className="flex flex-wrap gap-1.5">
          {ASSIST_ACTIONS.filter((a) => a.id !== 'custom').map((a) => (
            <Button key={a.id} variant="ghost" className="text-xs" disabled={busy || !apiKey || !model} onClick={() => run(a)}>
              {a.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(ASSIST_ACTIONS.find((a) => a.id === 'custom')!)
            }}
            rows={2}
            placeholder="Custom instruction, e.g. “Add a paragraph comparing with the Kaiser (2000) burst-damage scale”"
            className="flex-1 resize-y rounded-md border border-stone-300 bg-white p-2 text-xs outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
          />
          {busy ? (
            <Button variant="danger" className="text-xs" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button className="text-xs" disabled={!custom.trim() || !apiKey || !model} onClick={() => run(ASSIST_ACTIONS.find((a) => a.id === 'custom')!)}>
              Run
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!output && !busy && !error && (
          <p className="text-xs text-stone-500">
            The model sees the whole manuscript, the section guidance and your reference keys. It is told not to invent data or citations: gaps
            appear as [DATA NEEDED: …] and unsourced claims as [VERIFY: …].
          </p>
        )}
        {error && <p className="rounded-md border border-red-300 p-2 text-sm text-red-700 dark:border-red-900">{error}</p>}
        {(output || busy) && <Markdown text={result || '…'} />}
        {notice && <p className="mt-2 text-xs text-stone-400">{notice}</p>}
      </div>

      {result && !busy && (
        <div className="flex flex-wrap gap-1.5 border-t border-stone-200 p-3 dark:border-stone-800">
          {lastAction?.replaces && (
            <>
              <Button
                className="text-xs"
                onClick={() => {
                  if (!section.content.trim() || window.confirm('Replace the current section text? You can undo this once from the editor toolbar.')) {
                    onReplace(result)
                  }
                }}
              >
                Replace section
              </Button>
              <Button variant="ghost" className="text-xs" onClick={() => onAppend(result)}>
                Append
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(result)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => setOutput('')}>
            Discard
          </Button>
        </div>
      )}
    </div>
  )
}
