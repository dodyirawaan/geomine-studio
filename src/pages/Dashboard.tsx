import { Link } from 'react-router-dom'
import { PROVIDER_IDS, PROVIDERS } from '../ai/providers'
import { JOURNALS, MODES } from '../ai/prompts'
import { Card } from '../components/ui'
import { useVault } from '../store/vault'

const ROADMAP = [
  { phase: 1, title: 'Foundation', items: 'Encrypted key vault, multi-provider streaming chat, mining-oriented agents', done: true },
  { phase: 2, title: 'Manuscript editor & templates', items: 'IMRaD editor, Q1 journal templates, DOCX + LaTeX + BibTeX export', done: false },
  { phase: 3, title: 'Literature', items: 'OpenAlex/Crossref search, DOI verification, literature matrix, PDF RAG', done: false },
  { phase: 4, title: 'Methods library', items: 'RMR/Q/GSI/Hoek–Brown, rockburst criteria, support design calculators → Methods text', done: false },
  { phase: 5, title: 'Automation pipeline', items: 'Idea → draft → Reviewer 2 → revision, consistency checker, Q1 checklist', done: false },
  { phase: 6, title: 'Sync & polish', items: 'Private GitHub sync, version history, cost tracking, offline PWA', done: false },
]

export default function Dashboard() {
  const { status, secrets } = useVault()
  const configured = PROVIDER_IDS.filter((id) => secrets[id])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">GeoMine Studio</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Research writing workspace for underground mining geotechnics — rockburst &amp; seismicity, ground support &amp;
          tunnels, and ML/DL modelling — aimed at Q1 journals.
        </p>
      </div>

      <Card title="Getting started">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            <Link to="/settings" className="text-amber-700 underline dark:text-amber-500">
              Create your key vault
            </Link>{' '}
            and add at least one API key ({status === 'unlocked' ? `${configured.length} configured` : status}).
          </li>
          <li>Load the model list for each provider and pick defaults.</li>
          <li>
            Open the{' '}
            <Link to="/chat" className="text-amber-700 underline dark:text-amber-500">
              assistant
            </Link>
            , choose an agent mode and target journal, and start writing.
          </li>
        </ol>
        {status === 'unlocked' && configured.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">Ready: {configured.map((id) => PROVIDERS[id].label).join(', ')}</p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Agent modes">
          <ul className="space-y-1.5 text-sm">
            {MODES.map((m) => (
              <li key={m.id}>
                <span className="font-medium">{m.label}</span>
                <span className="text-stone-500"> — {m.description}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Target journals">
          <ul className="space-y-1.5 text-sm">
            {JOURNALS.map((j) => (
              <li key={j.id}>
                <a href={j.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {j.name}
                </a>
                <span className="text-stone-500"> · {j.publisher}</span>
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

      <Card title="Roadmap">
        <ul className="space-y-2 text-sm">
          {ROADMAP.map((r) => (
            <li key={r.phase} className="flex gap-3">
              <span
                className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-xs leading-5 ${
                  r.done ? 'bg-green-600 text-white' : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                }`}
              >
                {r.done ? '✓' : r.phase}
              </span>
              <span>
                <span className="font-medium">
                  Phase {r.phase} · {r.title}
                </span>
                <span className="block text-stone-500">{r.items}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
