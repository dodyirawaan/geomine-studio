import { Calculator as CalculatorIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { Button, Card, Input, Label, PageHeader, Select } from '../components/ui'
import { readJson, writeJson } from '../lib/storage'
import { CITE_RE, citeKeys, citeLabel, parseBibtex } from '../manuscript/bibtex'
import { CATEGORIES, fullMethodsText, insertIntoManuscript, METHODS } from '../methods'
import { METHOD_REFS } from '../methods/refs'
import { defaults, type Method, type MethodInput, type Values } from '../methods/types'
import { db } from '../store/db'

const VALUES_KEY = 'gm.methods.values'
const REF_ENTRIES = parseBibtex(Object.values(METHOD_REFS).join('\n'))
const REF_BY_KEY = new Map(REF_ENTRIES.map((e) => [e.key, e]))

export default function MethodsPage() {
  const [params, setParams] = useSearchParams()
  const method = METHODS.find((m) => m.id === params.get('m')) ?? METHODS[0]
  const [allValues, setAllValues] = useState<Record<string, Values>>(() => readJson(VALUES_KEY, {}))
  const values: Values = { ...defaults(method), ...allValues[method.id] }

  function set(id: string, value: number | string) {
    const next = { ...allValues, [method.id]: { ...values, [id]: value } }
    setAllValues(next)
    writeJson(VALUES_KEY, next)
  }

  function reset() {
    const next = { ...allValues }
    delete next[method.id]
    setAllValues(next)
    writeJson(VALUES_KEY, next)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader icon={CalculatorIcon} title="Methods library" description="Rock-engineering calculators that write their own Methods paragraph — equations, parameter table and citations — ready to insert into a manuscript." />
      <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
        <nav className="hidden space-y-3 text-sm md:block">
          {CATEGORIES.map((c) => (
            <div key={c}>
              <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{c}</p>
              {METHODS.filter((m) => m.category === c).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setParams({ m: m.id })}
                  className={`block w-full rounded px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${m.id === method.id ? 'bg-stone-200 font-medium dark:bg-stone-800' : ''}`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Select className="md:hidden" value={method.id} onChange={(e) => setParams({ m: e.target.value })}>
          {CATEGORIES.map((c) => (
            <optgroup key={c} label={c}>
              {METHODS.filter((m) => m.category === c).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Calculator key={method.id} method={method} values={values} set={set} reset={reset} />
      </div>
    </div>
  )
}

function Calculator({ method, values, set, reset }: { method: Method; values: Values; set: (id: string, v: number | string) => void; reset: () => void }) {
  const result = useMemo(() => {
    try {
      return method.compute(values)
    } catch (e) {
      return { outputs: [], warnings: [`Could not compute: ${(e as Error).message}`] }
    }
  }, [method, values])
  const groups = method.groups ?? [['Inputs', method.inputs.map((i) => i.id)] as [string, string[]]]
  const byId = new Map(method.inputs.map((i) => [i.id, i]))
  const main = result.outputs.filter((o) => o.main)

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{method.name}</h2>
            <p className="text-sm text-stone-500">{method.summary}</p>
          </div>
          <Button variant="ghost" className="text-xs" onClick={reset}>
            Reset inputs
          </Button>
        </div>
        <div className="space-y-4">
          {groups.map(([title, ids]) => (
            <fieldset key={title}>
              {groups.length > 1 && <legend className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</legend>}
              <div className="grid gap-3 sm:grid-cols-2">
                {ids.map((id) => {
                  const inp = byId.get(id)
                  return inp ? <Field key={id} input={inp} value={values[id]} set={(v) => set(id, v)} /> : null
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Card>

      <Card title="Results">
        {main.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-3">
            {main.map((o) => (
              <div key={o.label} className="min-w-32 rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
                <p className="text-xs text-stone-600 dark:text-stone-400">{o.label}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {o.value}
                  {o.unit && <span className="ml-1 text-sm font-normal">{o.unit}</span>}
                </p>
                {o.note && <p className="text-xs text-stone-600 dark:text-stone-400">{o.note}</p>}
              </div>
            ))}
          </div>
        )}
        <table className="w-full text-sm">
          <tbody>
            {result.outputs
              .filter((o) => !o.main)
              .map((o) => (
                <tr key={o.label} className="border-t border-stone-200 align-top dark:border-stone-800">
                  <td className="py-1.5 pr-3 text-stone-600 dark:text-stone-400">{o.label}</td>
                  <td className="py-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                    {o.value}
                    {o.unit && <span className="ml-1 font-normal text-stone-500">{o.unit}</span>}
                  </td>
                  <td className="hidden py-1.5 pl-3 text-xs text-stone-500 sm:table-cell">{o.note}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {result.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-400">
            {result.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </Card>

      <MethodsTextCard method={method} values={values} result={result} />
    </div>
  )
}

function Field({ input, value, set }: { input: MethodInput; value: number | string; set: (v: number | string) => void }) {
  if (input.kind === 'select') {
    return (
      <label className="block">
        <Label>{input.label}</Label>
        <Select value={String(value)} onChange={(e) => set(e.target.value)}>
          {input.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {input.help && <span className="mt-0.5 block text-xs text-stone-500">{input.help}</span>}
      </label>
    )
  }
  return (
    <label className="block">
      <Label hint={input.unit}>{input.label}</Label>
      <div className="flex gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          min={input.min}
          max={input.max}
          step={input.step ?? 'any'}
          onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        {input.presets && (
          <Select value="" onChange={(e) => e.target.value !== '' && set(Number(e.target.value))} className="w-28 shrink-0 text-xs" title="Typical values">
            <option value="">Typical…</option>
            {input.presets.map((p) => (
              <option key={p.label} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
      </div>
      {input.help && <span className="mt-0.5 block text-xs text-stone-500">{input.help}</span>}
    </label>
  )
}

function MethodsTextCard({ method, values, result }: { method: Method; values: Values; result: ReturnType<Method['compute']> }) {
  const [withTable, setWithTable] = useState(true)
  const [copied, setCopied] = useState(false)
  const [target, setTarget] = useState({ ms: '', section: '' })
  const [status, setStatus] = useState('')
  const manuscripts = useLiveQuery(() => db.manuscripts.orderBy('updatedAt').reverse().toArray(), [])

  const text = fullMethodsText(method, values, result, withTable)
  const preview = text.replace(CITE_RE, (_, g: string) => `(${citeKeys(g).map((k) => (REF_BY_KEY.get(k) ? citeLabel(REF_BY_KEY.get(k)!) : k)).join('; ')})`)
  const ms = manuscripts?.find((m) => m.id === target.ms) ?? manuscripts?.[0]
  const sections = ms?.sections.filter((s) => s.role === 'body') ?? []
  const section = sections.find((s) => s.id === target.section) ?? sections.find((s) => /method/i.test(s.title)) ?? sections[0]

  async function insert() {
    if (!ms || !section) return
    const added = await insertIntoManuscript(ms.id, section.id, text, method.refs)
    setStatus(`Inserted into "${section.title}" of "${ms.title}"${added ? `, with ${added} reference${added === 1 ? '' : 's'} added to its library` : ''}.`)
  }

  return (
    <Card title="Methods text">
      <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
        <Markdown text={preview} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={withTable} onChange={(e) => setWithTable(e.target.checked)} />
          Include parameter table
        </label>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={() => navigator.clipboard.writeText(method.refs.map((k) => METHOD_REFS[k]).join('\n\n'))}
          title="BibTeX for the references this text cites"
        >
          Copy BibTeX
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
        {!manuscripts?.length ? (
          <p className="text-xs text-stone-500">
            <Link to="/manuscripts" className="underline">
              Create a manuscript
            </Link>{' '}
            to insert this text directly.
          </p>
        ) : (
          <>
            <Select value={ms?.id ?? ''} onChange={(e) => setTarget({ ms: e.target.value, section: '' })} className="w-auto max-w-64" title="Manuscript">
              {manuscripts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title || 'Untitled'}
                </option>
              ))}
            </Select>
            <Select value={section?.id ?? ''} onChange={(e) => setTarget({ ...target, ms: ms?.id ?? '', section: e.target.value })} className="w-auto max-w-56" title="Section">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
            <Button className="text-xs" disabled={!section} onClick={insert}>
              Insert into manuscript
            </Button>
          </>
        )}
        {status && (
          <span className="text-xs text-green-700 dark:text-green-500">
            {status}{' '}
            {ms && (
              <Link to={`/manuscripts/${ms.id}`} className="underline">
                Open
              </Link>
            )}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Check every value against your own data and the original sources before submission; adapt the wording so it reads as your study, not a
        template. Replace "Table [X]" with the table number.
      </p>
    </Card>
  )
}
