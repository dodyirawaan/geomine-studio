import { useMemo, useState } from 'react'
import { Chart } from '../../components/Chart'
import { Button, Card, Select } from '../../components/ui'
import { downloadBlob, downloadText, slug } from '../../lib/download'
import { bibliometrics } from '../../review/analysis'
import { screeningCsv } from '../../review/build'
import { includedRecords, prismaCounts, prismaSvg } from '../../review/prisma'
import { methodById } from '../../review/prompts'
import type { ReviewProject } from '../../review/types'
import { barChart, lineChart } from '../../vlab/charts'

/** Renders an SVG string to a PNG at the given scale (for pasting into Word). */
async function svgToPng(svg: string, scale = 3): Promise<Blob> {
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await new Promise((res, rej) => ((img.onload = res), (img.onerror = rej), (img.src = url)))
  const canvas = document.createElement('canvas')
  canvas.width = img.width * scale
  canvas.height = img.height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
}

export function AnalysisTab({ p }: { p: ReviewProject }) {
  const m = methodById(p.method)
  const c = prismaCounts(p, m.fullText)
  const [scope, setScope] = useState<'included' | 'screened'>('included')
  const svg = prismaSvg(c, m.fullText, m.id === 'scoping' ? 'PRISMA-ScR' : 'PRISMA 2020')
  const works = useMemo(() => (scope === 'included' ? includedRecords(p, m.fullText) : p.records).map((r) => r.meta), [p, m.fullText, scope])
  const b = useMemo(() => bibliometrics(works), [works])
  const name = slug(p.title)

  return (
    <div className="space-y-4">
      <Card title="PRISMA flow diagram">
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-2 dark:border-stone-700" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(svg, `${name}-prisma.svg`, 'image/svg+xml')}>
            Download SVG
          </Button>
          <Button variant="ghost" className="text-xs" onClick={async () => downloadBlob(await svgToPng(svg), `${name}-prisma.png`)}>
            Download PNG (300 dpi)
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(screeningCsv(p), `${name}-screening-log.csv`, 'text/csv')}>
            Screening log (CSV)
          </Button>
        </div>
        {(c.awaitingTA > 0 || c.awaitingFT > 0) && <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">Screening is not finished: the diagram shows records still waiting for a decision.</p>}
      </Card>

      <div className="flex items-center gap-2">
        <span className="text-sm text-stone-600 dark:text-stone-400">Bibliometrics of</span>
        <Select value={scope} onChange={(e) => setScope(e.target.value as 'included' | 'screened')} className="w-auto">
          <option value="included">included studies ({includedRecords(p, m.fullText).length})</option>
          <option value="screened">all screened records ({p.records.length})</option>
        </Select>
      </div>

      {!works.length ? (
        <p className="text-sm text-stone-500">No records in this scope yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {b.years.length > 1 && (
            <Chart svg={lineChart([{ name: 'Publications', x: b.years.map((y) => y.year), y: b.years.map((y) => y.n) }], { title: 'Publications per year', xLabel: 'Year', yLabel: 'Publications', yMin: 0 })} caption={`Median year ${b.medianYear}; ${Math.round(b.shareRecent * 100)}% from the last five years.`} />
          )}
          {b.venues.length > 0 && <Chart svg={barChart(b.venues.slice(0, 8).map((v) => ({ label: v.venue, value: v.n })), { title: 'Leading sources', xLabel: 'Publications' })} caption="Journals and proceedings with most publications." />}
          {b.terms.length > 0 && <Chart svg={barChart(b.terms.slice(0, 12).map((t) => ({ label: t.term, value: t.n })), { title: 'Most frequent terms', xLabel: 'Documents containing the term' })} caption="Document frequency of terms and two-word phrases in titles and abstracts." />}
          {b.periods.length > 0 && (
            <Card title="Theme evolution">
              <div className="grid gap-3 sm:grid-cols-3">
                {b.periods.map((x) => (
                  <div key={x.label}>
                    <p className="mb-1 text-xs font-semibold text-stone-500">{x.label}</p>
                    <ol className="list-decimal space-y-0.5 pl-4 text-sm">
                      {x.terms.slice(0, 6).map((t) => (
                        <li key={t.term}>
                          {t.term} <span className="text-xs text-stone-400">({t.n})</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {b.cited.length > 0 && (
            <Card title="Most cited" className="lg:col-span-2">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {b.cited.slice(0, 8).map((w) => (
                  <li key={w.openalexId ?? w.title}>
                    {w.title} <span className="text-xs text-stone-500">· {w.authors[0]} {w.authors.length > 1 ? 'et al.' : ''} {w.year} · {w.citedBy} citations</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
