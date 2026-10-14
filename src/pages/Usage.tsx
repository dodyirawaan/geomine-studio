import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { PROVIDERS } from '../ai/providers'
import { costOf, loadPrices, savePrices, type Prices } from '../ai/usage'
import { Button, Card, Input, Select } from '../components/ui'
import { db, type UsageRecord } from '../store/db'

const PERIODS = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
] as const

function since(period: string): number {
  if (period === 'all') return 0
  if (period === 'month') {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  }
  return Date.now() - Number(period) * 86_400_000
}

const fmt = (n: number) => n.toLocaleString('en-US')
const usd = (n: number) => (n < 0.01 && n > 0 ? '< $0.01' : `$${n.toFixed(2)}`)

interface Row {
  key: string
  requests: number
  input: number
  output: number
}

function group(records: UsageRecord[], by: (r: UsageRecord) => string): Row[] {
  const map = new Map<string, Row>()
  for (const r of records) {
    const k = by(r)
    const row = map.get(k) ?? { key: k, requests: 0, input: 0, output: 0 }
    row.requests++
    row.input += r.inputTokens
    row.output += r.outputTokens
    map.set(k, row)
  }
  return [...map.values()].sort((a, b) => b.input + b.output - (a.input + a.output))
}

export default function UsagePage() {
  const [period, setPeriod] = useState('30')
  const [prices, setPrices] = useState<Prices>(loadPrices)
  const records = useLiveQuery(() => db.usage.where('at').aboveOrEqual(since(period)).toArray(), [period])

  if (!records) return null
  const byModel = group(records, (r) => `${r.provider}|${r.model}`)
  const byFeature = group(records, (r) => r.feature)
  const totalCost = records.reduce((s, r) => s + (costOf(r.model, r.inputTokens, r.outputTokens, prices) ?? 0), 0)
  const unpriced = byModel.filter((r) => !prices[r.key.split('|')[1]]).length

  function setPrice(model: string, field: 'input' | 'output', value: string) {
    const cur = prices[model] ?? { input: 0, output: 0 }
    const next = { ...prices, [model]: { ...cur, [field]: Number(value) || 0 } }
    setPrices(next)
    savePrices(next)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Usage & cost</h1>
          <p className="text-stone-600 dark:text-stone-400">Tokens reported by each provider for every completed AI request made in this browser.</p>
        </div>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto">
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Requests', fmt(records.length)],
          ['Input tokens', fmt(records.reduce((s, r) => s + r.inputTokens, 0))],
          ['Output tokens', fmt(records.reduce((s, r) => s + r.outputTokens, 0))],
          ['Estimated cost', usd(totalCost) + (unpriced ? '*' : '')],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {unpriced > 0 && <p className="text-xs text-stone-500">* {unpriced} model(s) have no price yet; enter the provider's current price per million tokens below.</p>}

      <Card title="By model">
        {!byModel.length ? (
          <p className="text-sm text-stone-500">No requests in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Model</th>
                  <th className="py-1 pr-2 text-right">Requests</th>
                  <th className="py-1 pr-2 text-right">Input</th>
                  <th className="py-1 pr-2 text-right">Output</th>
                  <th className="py-1 pr-2">$ / 1M in · out</th>
                  <th className="py-1 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((r) => {
                  const [provider, model] = r.key.split('|')
                  const cost = costOf(model, r.input, r.output, prices)
                  return (
                    <tr key={r.key} className="border-t border-stone-200 dark:border-stone-800">
                      <td className="py-1.5 pr-2">
                        {model}
                        <span className="block text-xs text-stone-500">{PROVIDERS[provider as keyof typeof PROVIDERS]?.label ?? provider}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.requests)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.input)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.output)}</td>
                      <td className="py-1.5 pr-2">
                        <span className="flex gap-1">
                          <Input type="number" min={0} step="any" className="w-20 text-xs" value={prices[model]?.input ?? ''} placeholder="in" onChange={(e) => setPrice(model, 'input', e.target.value)} />
                          <Input type="number" min={0} step="any" className="w-20 text-xs" value={prices[model]?.output ?? ''} placeholder="out" onChange={(e) => setPrice(model, 'output', e.target.value)} />
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{cost == null ? '—' : usd(cost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-stone-500">
          Prices are not built in because they change; copy them from each provider's pricing page. Requests that were stopped early, and providers
          that do not report usage, are not counted.
        </p>
      </Card>

      <Card title="By feature">
        <table className="w-full text-sm">
          <tbody>
            {byFeature.map((r) => (
              <tr key={r.key} className="border-t border-stone-200 first:border-0 dark:border-stone-800">
                <td className="py-1.5">{r.key}</td>
                <td className="py-1.5 text-right text-stone-500 tabular-nums">{fmt(r.requests)} req</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(r.input + r.output)} tokens</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Button
        variant="ghost"
        className="text-xs"
        onClick={() => window.confirm('Delete the whole usage log? Prices are kept.') && db.usage.clear()}
      >
        Clear usage log
      </Button>
    </div>
  )
}
