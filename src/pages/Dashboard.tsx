import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, ChevronRight, Circle, ExternalLink, FilePlus2, Search, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { JOURNALS } from '../ai/prompts'
import { PROVIDER_IDS, PROVIDERS } from '../ai/providers'
import { LogoMark } from '../components/Logo'
import { ButtonLink, Card } from '../components/ui'
import { NAV } from '../nav'
import { db } from '../store/db'
import { loadSettings } from '../store/settings'
import { useVault } from '../store/vault'

const TOPICS = [
  'Rockburst & mining-induced seismicity',
  'Ground support & tunnels',
  'Water-conservation mining',
  'Backfill & CO₂ mineralisation',
  'Infrared & acoustic-emission monitoring',
  'ML / DL in geomechanics',
]

const WORKFLOW = [
  { step: 'Idea & gap', to: '/chat', hint: 'Gap & Novelty Finder' },
  { step: 'Literature', to: '/literature', hint: 'Search, matrix, verify DOIs' },
  { step: 'Methods', to: '/methods', hint: 'Calculators → Methods text' },
  { step: 'Modelling', to: '/vlab', hint: 'ML/DL with a full report' },
  { step: 'Draft', to: '/manuscripts', hint: 'Section-by-section co-author' },
  { step: 'Check & submit', to: '/manuscripts', hint: 'Reviewer 2, Q1 checklist' },
]

export default function Dashboard() {
  const { status, secrets } = useVault()
  const counts = useLiveQuery(async () => ({
    manuscripts: await db.manuscripts.count(),
    papers: await db.papers.count(),
    experiments: await db.experiments.count(),
    chats: await db.conversations.count(),
  }))
  const recent = useLiveQuery(async () => {
    const ms = (await db.manuscripts.orderBy('updatedAt').reverse().limit(4).toArray()).map((m) => ({ kind: 'Manuscript', title: m.title || 'Untitled', to: `/manuscripts/${m.id}`, at: m.updatedAt }))
    const ex = (await db.experiments.orderBy('updatedAt').reverse().limit(4).toArray()).map((e) => ({ kind: 'Experiment', title: e.name, to: `/vlab/${e.id}`, at: e.updatedAt }))
    const ch = (await db.conversations.orderBy('updatedAt').reverse().limit(3).toArray()).map((c) => ({ kind: 'Chat', title: c.title, to: `/chat/${c.id}`, at: c.updatedAt }))
    return [...ms, ...ex, ...ch].sort((a, b) => b.at - a.at).slice(0, 6)
  })

  const settings = loadSettings()
  const configured = PROVIDER_IDS.filter((id) => secrets[id])
  const setup = [
    { done: status !== 'empty', label: 'Create your encrypted key vault', to: '/settings' },
    { done: status === 'unlocked' ? configured.length > 0 : status === 'locked', label: 'Add an API key (Claude, OpenAI, Gemini or OpenRouter)', to: '/settings' },
    // A default model only counts once its provider has a key.
    { done: !!settings.models[settings.provider] && (status === 'unlocked' ? !!secrets[settings.provider] : status === 'locked'), label: 'Choose a default model', to: '/settings' },
  ]
  const setupDone = setup.every((s) => s.done)
  const countFor: Record<string, string | undefined> = counts
    ? {
        '/manuscripts': `${counts.manuscripts} manuscript${counts.manuscripts === 1 ? '' : 's'}`,
        '/literature': `${counts.papers} paper${counts.papers === 1 ? '' : 's'} in library`,
        '/vlab': `${counts.experiments} experiment${counts.experiments === 1 ? '' : 's'}`,
        '/chat': `${counts.chats} conversation${counts.chats === 1 ? '' : 's'}`,
        '/methods': '8 calculators',
      }
    : {}

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-5 py-8 shadow-xs sm:px-10 sm:py-12 dark:border-stone-800 dark:bg-stone-900">
        <Strata />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <LogoMark size={88} className="shrink-0 drop-shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-400">Underground mining geotechnics</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              GeoMine <span className="font-normal text-stone-500 dark:text-stone-400">Studio</span>
            </h1>
            <p className="mt-3 max-w-2xl text-base text-stone-600 dark:text-stone-300">
              One workspace to find the gap, verify the literature, compute the rock mechanics, train the models and write the paper — prepared for Q1
              journals, with every number traceable.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink to="/manuscripts">
                <FilePlus2 className="h-4 w-4" />
                New manuscript
              </ButtonLink>
              <ButtonLink to="/literature" variant="ghost">
                <Search className="h-4 w-4" />
                Search literature
              </ButtonLink>
              <ButtonLink to="/chat" variant="ghost">
                <Sparkles className="h-4 w-4" />
                Ask the assistant
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* Setup */}
      {!setupDone && (
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight">Get started in three steps</h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">Writing, calculators and exports work right away. AI features need your own API key, kept encrypted in this browser.</p>
            </div>
            <ButtonLink to="/settings" variant="ghost">
              Open settings <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {setup.map((s, i) => (
              <li key={s.label}>
                <Link to={s.to} className={`flex h-full items-start gap-3 rounded-lg border p-3 text-sm ${s.done ? 'border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30' : 'border-stone-200 hover:border-amber-400 dark:border-stone-800'}`}>
                  {s.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />}
                  <span>
                    <span className="block text-xs text-stone-500">Step {i + 1}</span>
                    {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Modules */}
      <section aria-labelledby="modules">
        <h2 id="modules" className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">
          Workspace
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.filter((n) => n.to !== '/').map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="group flex items-start gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-800"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                <n.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium">
                  {n.label}
                  <ChevronRight className="h-4 w-4 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-amber-700" />
                </span>
                <span className="block text-sm text-stone-600 dark:text-stone-400">{n.description}</span>
                {countFor[n.to] && <span className="mt-1.5 block text-xs text-stone-500">{countFor[n.to]}</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Workflow */}
        <Card title="From idea to submission">
          <ol className="relative space-y-1">
            {WORKFLOW.map((w, i) => (
              <li key={w.step}>
                <Link to={w.to} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{w.step}</span>
                    <span className="ml-2 text-sm text-stone-500">{w.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        {/* Recent */}
        <Card title="Recent work">
          {!recent?.length ? (
            <p className="text-sm text-stone-500">Nothing yet. Start with a manuscript, a literature search or a VLab template.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {recent.map((r) => (
                <li key={r.to}>
                  <Link to={r.to} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60">
                    <span className="w-20 shrink-0 text-xs text-stone-500">{r.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                    <span className="shrink-0 text-xs text-stone-400 tabular-nums">{new Date(r.at).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {status === 'unlocked' && configured.length > 0 && <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800">AI ready: {configured.map((id) => PROVIDERS[id].label).join(', ')}</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Research focus">
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <span key={t} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {t}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">The assistant, literature presets, calculators and VLab templates are tuned to these topics.</p>
        </Card>
        <Card title="Target journals">
          <ul className="-mx-2 space-y-0.5 text-sm">
            {JOURNALS.map((j) => (
              <li key={j.id}>
                <a href={j.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/60">
                  <span className="w-14 shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-400">{j.id.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate">{j.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            Quartiles change yearly — confirm on{' '}
            <a className="underline" href="https://www.scimagojr.com/" target="_blank" rel="noreferrer">
              SJR
            </a>
            .
          </p>
        </Card>
      </div>
    </div>
  )
}

/** Faint rock strata behind the hero, echoing the logo's seams. */
function Strata() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full text-amber-600/[0.045] dark:text-amber-400/[0.05]" preserveAspectRatio="none" viewBox="0 0 800 300" aria-hidden="true">
      <path d="M0 250 L800 150 L800 178 L0 282Z" fill="currentColor" />
      <path d="M0 292 L800 196 L800 210 L0 300Z" fill="currentColor" />
    </svg>
  )
}
