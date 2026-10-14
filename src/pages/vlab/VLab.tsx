import { FlaskConical } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, PageHeader } from '../../components/ui'
import { parseCsv } from '../../vlab/data'
import { METRICS } from '../../vlab/metrics'
import { configFor, TEMPLATES, type LabTemplate } from '../../vlab/templates'
import { db, type Experiment } from '../../store/db'

export default function VLabPage() {
  const navigate = useNavigate()
  const experiments = useLiveQuery(() => db.experiments.orderBy('updatedAt').reverse().toArray(), [])
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function create(e: Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = Date.now()
    const id = crypto.randomUUID()
    await db.experiments.add({ ...e, id, createdAt: now, updatedAt: now })
    navigate(`/vlab/${id}`)
  }

  async function fromFile(f: File) {
    setError('')
    try {
      const csv = await f.text()
      const table = parseCsv(csv, f.name)
      const numeric = table.columns.filter((c) => c.kind === 'numeric').map((c) => c.name)
      const target = table.columns[table.columns.length - 1].name
      await create({
        name: f.name.replace(/\.(csv|txt|tsv)$/i, ''),
        synthetic: false,
        datasetName: f.name,
        csv,
        config: { ...configFor(), target, task: table.columns[table.columns.length - 1].kind === 'numeric' ? 'regression' : 'classification', features: numeric.filter((n) => n !== target) },
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function fromTemplate(t: LabTemplate, withDemo: boolean) {
    const seed = 42
    await create({
      name: t.title,
      templateId: t.id,
      synthetic: withDemo,
      datasetName: withDemo ? `${t.id}-synthetic-demo.csv` : '',
      csv: withDemo ? t.demo(seed) : '',
      config: configFor(t),
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        icon={FlaskConical}
        title="Virtual Lab"
        description="Train and compare machine-learning and deep-learning models on your own data, in the browser, with leakage-safe validation and a detailed, publication-oriented report."
        actions={
          <a href="https://github.com/dodyirawaan/geomine-studio/blob/main/docs/VLAB.md" target="_blank" rel="noreferrer" className="text-sm font-medium text-amber-800 hover:underline dark:text-amber-400">
            Step-by-step guide ↗
          </a>
        }
      />

      <Card title="Start from your data">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}>Upload CSV…</Button>
          <span className="text-xs text-stone-500">One row per sample with a header row; keep site / specimen / batch columns for grouped validation. Data stay in this browser.</span>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      <Card title="Research templates">
        <div className="grid gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col rounded-md border border-stone-200 p-3 dark:border-stone-800">
              <p className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-500">{t.topic}</p>
              <p className="font-medium">{t.title}</p>
              <p className="mb-2 flex-1 text-sm text-stone-600 dark:text-stone-400">{t.description}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="text-xs" onClick={() => fromTemplate(t, false)} title="Use the template set-up with your own CSV">
                  Use with my data
                </Button>
                <Button variant="ghost" className="text-xs" onClick={() => fromTemplate(t, true)} title="Synthetic data for trying the lab; never for publication">
                  Try with synthetic demo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Experiments">
        {!experiments?.length ? (
          <p className="text-sm text-stone-500">No experiments yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {experiments.map((e) => {
              const best = e.result?.models.find((m) => m.id === e.result!.ranking[0])
              const pm = e.result?.primary
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link to={`/vlab/${e.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {e.name}
                    {e.synthetic && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300">synthetic</span>}
                  </Link>
                  <span className="text-xs text-stone-500">
                    {best && pm ? `${best.name} · ${METRICS.find((m) => m.id === pm)?.label} ${best.cvSummary[pm]?.mean.toFixed(3)} (CV)` : e.csv ? 'not run yet' : 'no data yet'} · {new Date(e.updatedAt).toLocaleDateString()}
                  </span>
                  <button className="text-xs text-stone-500 hover:text-red-600" onClick={() => window.confirm(`Delete "${e.name}"?`) && db.experiments.delete(e.id)}>
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
