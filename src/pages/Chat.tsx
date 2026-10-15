import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { explainError } from '../ai/errors'
import { recentHistory } from '../ai/history'
import { buildSystemPrompt, journalsByTopic, MODES, type JournalId, type ModeId } from '../ai/prompts'
import { PROVIDER_IDS, PROVIDERS } from '../ai/providers'
import type { ChatMessage, ProviderId } from '../ai/types'
import { Markdown } from '../components/Markdown'
import { ModelPicker } from '../components/ModelPicker'
import { UnlockPanel } from '../components/UnlockPanel'
import { Button, Select } from '../components/ui'
import { db, type Conversation, type StoredMessage } from '../store/db'
import { useSettings } from '../store/settings'
import { useVault } from '../store/vault'

export default function ChatPage() {
  const { convId } = useParams()
  const navigate = useNavigate()
  const { status, secrets } = useVault()
  const [settings, update] = useSettings()

  const conversations = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), [])
  const conv = useLiveQuery(() => (convId ? db.conversations.get(convId) : undefined), [convId])
  const messages = useLiveQuery(
    () => (convId ? db.messages.where('convId').equals(convId).sortBy('createdAt') : Promise.resolve([] as StoredMessage[])),
    [convId],
  )

  // Mode and journal for a chat that has not been created yet.
  const [pendingMode, setPendingMode] = useState<ModeId>('general')
  const [pendingJournal, setPendingJournal] = useState<JournalId | ''>('')
  const mode = conv?.mode ?? pendingMode
  const journal = conv?.journal ?? pendingJournal

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const provider = settings.provider
  const model = settings.models[provider]
  const apiKey = secrets[provider]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length, streaming])

  if (status !== 'unlocked') return <UnlockPanel />

  async function setMode(m: ModeId) {
    if (conv) await db.conversations.update(conv.id, { mode: m })
    else setPendingMode(m)
  }

  async function setJournal(j: JournalId | '') {
    if (conv) await db.conversations.update(conv.id, { journal: j })
    else setPendingJournal(j)
  }

  async function send(text = input) {
    const content = text.trim()
    if (!content || streaming !== null || !apiKey || !model) return

    let id = convId
    if (!id) {
      id = crypto.randomUUID()
      const now = Date.now()
      const c: Conversation = { id, title: content.slice(0, 60), mode, journal, createdAt: now, updatedAt: now }
      await db.conversations.add(c)
      navigate(`/chat/${id}`)
    }
    await db.messages.add({ convId: id, role: 'user', content, createdAt: Date.now() })
    await db.conversations.update(id, { updatedAt: Date.now() })
    setInput('')

    const history: ChatMessage[] = recentHistory([
      ...(messages ?? []).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ])

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''
    setStreaming('')
    try {
      const result = await PROVIDERS[provider].streamChat(
        apiKey,
        {
          model,
          system: buildSystemPrompt(mode, journal),
          messages: history,
          maxTokens: settings.maxTokens,
          effort: settings.anthropicEffort,
          signal: ctrl.signal,
          feature: 'Assistant chat',
          conversation: true,
        },
        (delta) => {
          acc += delta
          setStreaming(acc)
        },
      )
      const notes = [result.notice, result.servedBy && `Served by ${result.servedBy}.`].filter(Boolean)
      await db.messages.add({
        convId: id,
        role: 'assistant',
        content: acc + (notes.length ? `\n\n> ${notes.join(' ')}` : ''),
        provider,
        model,
        usage: result.usage,
        createdAt: Date.now(),
      })
    } catch (e) {
      const aborted = ctrl.signal.aborted
      await db.messages.add({
        convId: id,
        role: 'assistant',
        content: aborted ? `${acc}\n\n> Stopped.` : `${acc ? `${acc}\n\n` : ''}**Error:** ${explainError(e)}`,
        provider,
        model,
        // A failed reply is shown but not sent back as context; a stopped one keeps its partial text.
        error: !aborted || !acc,
        createdAt: Date.now(),
      })
    } finally {
      setStreaming(null)
      abortRef.current = null
      await db.conversations.update(id, { updatedAt: Date.now() })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      send()
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm('Delete this conversation?')) return
    await db.transaction('rw', db.conversations, db.messages, async () => {
      await db.messages.where('convId').equals(id).delete()
      await db.conversations.delete(id)
    })
    if (id === convId) navigate('/chat')
  }

  const currentMode = MODES.find((m) => m.id === mode)!
  const empty = !messages?.length && streaming === null

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      {/* Conversation list */}
      <aside
        className={`${sidebarOpen ? 'flex' : 'hidden'} absolute inset-y-14 left-0 z-20 w-64 flex-col border-r border-stone-200 bg-white md:static md:flex dark:border-stone-800 dark:bg-stone-900`}
      >
        <div className="p-3">
          <Button
            className="w-full"
            onClick={() => {
              navigate('/chat')
              setSidebarOpen(false)
            }}
          >
            + New chat
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-3 text-sm">
          {conversations?.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => {
                  navigate(`/chat/${c.id}`)
                  setSidebarOpen(false)
                }}
                className={`flex-1 truncate rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  c.id === convId ? 'bg-stone-100 font-medium dark:bg-stone-800' : ''
                }`}
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                className="px-1.5 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
                title="Delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Controls */}
        <div className="grid grid-cols-2 gap-2 border-b border-stone-200 p-3 lg:grid-cols-[1fr_1fr_1fr_1.4fr] dark:border-stone-800">
          <Button variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰ Chats
          </Button>
          <Select value={mode} onChange={(e) => setMode(e.target.value as ModeId)} title="Agent mode">
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select value={journal} onChange={(e) => setJournal(e.target.value as JournalId | '')} title="Target journal">
            <option value="">No target journal</option>
            {journalsByTopic().map(([topic, list]) => (
              <optgroup key={topic} label={topic}>
                {list.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select value={provider} onChange={(e) => update({ provider: e.target.value as ProviderId })} title="Provider">
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
                {secrets[id] ? '' : ' (no key)'}
              </option>
            ))}
          </Select>
          <div className="col-span-2 lg:col-span-1">
            <ModelPicker
              provider={provider}
              apiKey={apiKey}
              value={model}
              onChange={(m) => update({ models: { ...settings.models, [provider]: m } })}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 p-4">
            {empty && (
              <div className="pt-8 text-center">
                <h2 className="text-lg font-semibold">{currentMode.label}</h2>
                <p className="mb-4 text-sm text-stone-500">{currentMode.description}</p>
                <div className="grid gap-2 text-left">
                  {currentMode.starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-md border border-stone-200 p-3 text-sm hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages?.map((m) => <MessageView key={m.id} m={m} />)}
            {streaming !== null && (
              <MessageView m={{ convId: '', role: 'assistant', content: streaming || '…', createdAt: 0, model }} />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-stone-200 p-3 dark:border-stone-800">
          <div className="mx-auto max-w-3xl">
            {!apiKey && (
              <p className="mb-2 text-sm text-amber-700">Add a {PROVIDERS[provider].label} key in Settings to chat.</p>
            )}
            {apiKey && !model && <p className="mb-2 text-sm text-amber-700">Choose a model from the list.</p>}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                placeholder="Ask, paste a draft, or describe your study… (Ctrl+Enter to send)"
                className="flex-1 resize-y rounded-md border border-stone-300 bg-white p-2.5 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
              />
              {streaming !== null ? (
                <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                  Stop
                </Button>
              ) : (
                <Button onClick={() => send()} disabled={!input.trim() || !apiKey || !model}>
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageView({ m }: { m: StoredMessage }) {
  const [copied, setCopied] = useState(false)
  if (m.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
        {m.content}
      </div>
    )
  }
  return (
    <div className={m.error ? 'rounded-md border border-red-300 p-3 dark:border-red-900' : ''}>
      <Markdown text={m.content} />
      {m.createdAt > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-400">
          {m.model && <span>{m.model}</span>}
          {m.usage && (
            <span>
              {m.usage.inputTokens ?? '?'} in · {m.usage.outputTokens ?? '?'} out
            </span>
          )}
          <button
            className="hover:text-stone-700 dark:hover:text-stone-200"
            onClick={async () => {
              await navigator.clipboard.writeText(m.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
