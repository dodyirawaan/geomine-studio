// Deterministic parts of the review (Methods, overview, evidence table) and assembly into a manuscript.
import { JOURNALS } from '../ai/prompts'
import { paperToBibtex } from '../literature/bib'
import { addPaper } from '../literature/library'
import { createManuscript } from '../manuscript/templates'
import { db, type Manuscript, type Paper } from '../store/db'
import { bibliometrics } from './analysis'
import { evidenceStats, evidenceStatsTable } from './evidence'
import { QUALITY_CRITERIA, REVIEW_REFS, type ReviewMethod } from './methods'
import type { PrismaCounts } from './prisma'
import type { ReviewProject, ReviewRecord } from './types'

const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10)
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function methodsText(p: ReviewProject, m: ReviewMethod, c: PrismaCounts): string {
  const pr = p.protocol
  const date = p.searches.length ? fmtDate(Math.max(...p.searches.map((s) => s.at))) : '[DATA NEEDED: search date]'
  const years = pr.yearFrom || pr.yearTo ? `published ${pr.yearFrom ? `from ${pr.yearFrom}` : ''}${pr.yearTo ? ` to ${pr.yearTo}` : ' onwards'}` : 'without a date limit'
  const queries = p.searches.map((s, i) => `(${i + 1}) ${s.query} [${s.found.toLocaleString()} records, ${s.fetched.toLocaleString()} retrieved]`)
  const imports = p.imports ?? []
  const q = (x: string) => x.trim().replace(/[.?!]+$/, '')
  const aiUsed = p.records.some((r) => r.ai)
  const guideline =
    m.id === 'systematic'
      ? 'The review was conducted and reported following the PRISMA 2020 statement [@page2021].'
      : m.id === 'scoping'
        ? 'The review followed the five-stage framework of Arksey and O’Malley [@arksey2005] and was reported according to PRISMA-ScR [@tricco2018].'
        : m.id === 'bibliometric'
          ? 'The study followed a science-mapping workflow [@zupic2015]: data retrieval, cleaning, descriptive indicators and analysis of research themes.'
          : 'The literature for this critical review was identified through a documented database search, complemented by the authors’ knowledge of the field.'
  const framework = Object.entries(pr.framework)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k.split(' (')[0].toLowerCase()}: ${v}`)
  const parts: string[] = [
    `## Protocol and research questions\n\n${guideline} The review addressed ${pr.questions.length} question${pr.questions.length === 1 ? '' : 's'}: ${pr.questions.map((x, i) => `(RQ${i + 1}) ${q(x)}?`.replace(/\?\?$/, '?')).join('; ')}${framework.length ? ` The scope was defined by the ${m.framework.name} framework (${framework.join('; ')}).` : ''}`,
    `## Search strategy\n\nThe OpenAlex database, which indexes Crossref, PubMed, institutional repositories and publisher records, was searched on ${date} using ${p.searches.length} Boolean search string${p.searches.length === 1 ? '' : 's'} applied to titles and abstracts: ${queries.join('; ')}. The search was limited to ${pr.articlesOnly ? 'journal articles and reviews ' : ''}${years}${pr.language ? ` in ${pr.language}` : ''}.${
    imports.length ? ` In addition, ${imports.map((x) => `${x.database} (${x.fetched.toLocaleString()} records${x.query ? `; ${x.query}` : ''}; exported on ${fmtDate(x.at)})`).join(' and ')} ${imports.length === 1 ? 'was' : 'were'} searched with equivalent strings and the exports imported.` : ''
  }${c.otherSources ? ` A further ${c.otherSources} record${c.otherSources === 1 ? ' was' : 's were'} identified through citation tracking and expert suggestion.` : ''} Records were de-duplicated by DOI, OpenAlex identifier and normalised title, removing ${c.duplicates} duplicate${c.duplicates === 1 ? '' : 's'}.`,
  ]
  if (m.screening) {
    parts.push(
      `## Eligibility criteria and study selection\n\nStudies were included when they met all inclusion criteria (${pr.inclusion.join('; ')}) and excluded when any exclusion criterion applied (${pr.exclusion.join('; ')}). Titles and abstracts of ${c.screened} records were screened, of which ${c.excludedTA} were excluded.${
        aiUsed ? ' An AI assistant proposed a screening decision with a reason for each record; every decision was checked and made by the authors.' : ''
      }${
        m.fullText
          ? ` The full texts of ${c.soughtFT} reports were assessed for eligibility and ${c.excludedFT} were excluded${c.ftReasons.length ? ` (${c.ftReasons.map(([r, n]) => `${r}: ${n}`).join('; ')})` : ''}.`
          : ''
      } In total, ${c.included} studies were included. The selection process is summarised in the ${m.id === 'scoping' ? 'PRISMA-ScR' : 'PRISMA'} flow diagram (Fig. [X]).`,
    )
  }
  if (m.id !== 'bibliometric') {
    parts.push(
      `## Data ${m.id === 'scoping' ? 'charting' : 'extraction'}\n\nFor each included study, the mine or site and depth, rock type and properties, problem addressed, methods (laboratory, field, numerical or machine learning), data, key quantitative findings and stated limitations were extracted into a standardised form (Table [X]).`,
    )
  }
  if (m.quality) {
    parts.push(
      `## Quality appraisal\n\nThe quality of each study was appraised against ${QUALITY_CRITERIA.length} criteria — ${QUALITY_CRITERIA.map((q) => q.label.toLowerCase()).join('; ')} — each scored 0 (not met), 1 (partly met) or 2 (fully met), giving a total of 0–${QUALITY_CRITERIA.length * 2}. Scores informed the weight given to each study in the synthesis rather than excluding studies.`,
    )
  }
  parts.push(
    `## Synthesis\n\n${
      m.id === 'bibliometric'
        ? 'Descriptive indicators (annual output, sources and citation counts) were computed, and research themes were identified from the document frequency of terms and two-word phrases in titles and abstracts, compared across three consecutive periods.'
        : m.id === 'scoping'
          ? 'The charted data were summarised descriptively and mapped by concept and context to show the extent and distribution of the evidence and the gaps.'
          : 'Given the heterogeneity of sites, methods and outcomes, the findings were synthesised thematically rather than statistically: studies were grouped by theme, compared, and their agreement, contradictions and limitations were examined.'
    }`,
  )
  return parts.join('\n\n')
}

/** Evidence table of the included studies, from extracted matrix rows where available. */
export function evidenceTable(papers: Paper[]): string {
  const cell = (v?: string) => (v && !/^not reported/i.test(v) ? v.replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 160) : '—')
  const rows = [...papers]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    .map((p) => `| [@${p.bibKey}] | ${p.year ?? ''} | ${cell(p.matrix?.site)} | ${cell(p.matrix?.method)} | ${cell(p.matrix?.findings ?? p.abstract?.slice(0, 160))} |`)
  return `| Study | Year | Site / setting | Methods | Key findings |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nTable [X]. Characteristics of the included studies.`
}

export function overviewText(p: ReviewProject, m: ReviewMethod, papers: Paper[]): string {
  const b = bibliometrics(papers)
  if (!papers.length) return '[DATA NEEDED: include studies first]'
  const byOa = new Map(papers.map((x) => [x.openalexId ?? x.doi ?? x.id, x]))
  const keyOf = (w: { openalexId?: string; doi?: string }) => byOa.get(w.openalexId ?? '') ?? byOa.get(w.doi ?? '')
  const first = b.years[0]?.year
  const last = b.years[b.years.length - 1]?.year
  const peak = [...b.years].sort((x, y) => y.n - x.n)[0]
  const venues = b.venues.slice(0, 4).map((v) => `${v.venue} (n = ${v.n})`)
  const cited = b.cited
    .slice(0, 3)
    .map((w) => {
      const k = keyOf(w)
      return k ? `[@${k.bibKey}] (${w.citedBy} citations)` : ''
    })
    .filter(Boolean)
  const parts = [
    `The ${papers.length} included studies were published between ${first} and ${last} (median ${b.medianYear}), with the largest number in ${peak?.year} (n = ${peak?.n}); ${Math.round(b.shareRecent * 100)}% appeared in the last five years. The most frequent sources were ${list(venues)}.${cited.length ? ` The most cited studies were ${list(cited)}.` : ''}`,
  ]
  if (m.id === 'bibliometric' && b.periods.length) {
    parts.push(`The dominant terms shifted over time: ${b.periods.map((x) => `in ${x.label}, ${list(x.terms.slice(0, 4).map((t) => `“${t.term}”`))}`).join('; ')}.`)
  }
  if (m.quality) {
    const scores = papers.map((x) => Object.values(p.quality[x.id] ?? {}).reduce((s, v) => s + v, 0)).filter((v) => v > 0)
    if (scores.length) {
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length
      parts.push(`Study quality scores averaged ${mean.toFixed(1)} of ${QUALITY_CRITERIA.length * 2} (range ${Math.min(...scores)}–${Math.max(...scores)}).`)
    }
  }
  if (m.id !== 'bibliometric') parts.push(evidenceStatsTable(evidenceStats(papers)))
  parts.push(evidenceTable(papers))
  return parts.join('\n\n')
}

/** Limitations written from the facts of the project. */
export function limitationsText(p: ReviewProject, m: ReviewMethod, papers: Paper[]): string {
  const dbs = [...new Set([...p.searches, ...(p.imports ?? [])].map((s) => s.database ?? 'OpenAlex'))]
  const fullText = papers.filter((x) => x.matrixSource === 'fulltext').length
  const abstractsOnly = papers.filter((x) => x.matrixSource === 'abstract').length
  const parts = [
    dbs.length === 1
      ? `The search relied on a single database (${dbs[0]}); although it indexes most journals in the field, some studies indexed only elsewhere may have been missed.`
      : `The search covered ${list(dbs)}; studies indexed only in other databases or in grey literature may still have been missed.`,
    p.protocol.language ? `Only studies in ${p.protocol.language} were considered, so work published in other languages — notably the large Chinese-language literature on mining — is under-represented.` : '',
    p.records.some((r) => r.ai) ? 'Title and abstract screening was supported by AI suggestions; all decisions were checked by the authors, but residual misclassification cannot be excluded.' : '',
    abstractsOnly ? `Data for ${abstractsOnly} of the ${papers.length} included studies were extracted from abstracts rather than full texts${fullText ? ` (${fullText} from full texts)` : ''}, which limits the detail available for those studies.` : '',
    m.quality ? '' : 'In line with the review type, the quality of the included studies was not formally appraised.',
    'Positive results are more likely to be published, so the performance reported across studies may be optimistic (publication bias).',
  ]
  return parts.filter(Boolean).join(' ')
}

/** Adds every finally included record to the literature library (tagged with the review) and returns the papers. */
export async function syncIncludedToLibrary(p: ReviewProject, included: ReviewRecord[]): Promise<{ records: ReviewRecord[]; papers: Paper[] }> {
  const tag = `review: ${p.title.slice(0, 40)}`
  const records = p.records.map((r) => ({ ...r }))
  const papers: Paper[] = []
  for (const r of included) {
    const target = records.find((x) => x.id === r.id)!
    let paper = target.paperId ? await db.papers.get(target.paperId) : undefined
    if (!paper) {
      paper = (await addPaper(r.meta)).paper
      target.paperId = paper.id
    }
    if (!paper.tags.includes(tag)) {
      await db.papers.update(paper.id, { tags: [...paper.tags, tag], updatedAt: Date.now() })
      paper = { ...paper, tags: [...paper.tags, tag] }
    }
    papers.push(paper)
  }
  return { records, papers }
}

/** Creates (or refreshes) a manuscript from the review's drafts, with the included studies as references. */
export async function writeManuscript(p: ReviewProject, m: ReviewMethod, papers: Paper[]): Promise<Manuscript> {
  const base = createManuscript(p.title, (JOURNALS.find((j) => j.id === p.journal)?.id ?? '') as Manuscript['journal'], 'review')
  const existing = p.manuscriptId ? await db.manuscripts.get(p.manuscriptId) : undefined
  const front = base.sections.filter((s) => s.role !== 'body' && s.role !== 'back')
  const back = base.sections.filter((s) => s.role === 'back')
  const sections = [
    ...front.map((s) => ({
      ...s,
      content: s.role === 'abstract' ? (p.drafts.abstract ?? '') : s.role === 'highlights' ? (p.drafts.highlights ?? '') : s.role === 'keywords' ? (p.drafts.keywords ?? '') : s.content,
    })),
    ...m.outline.map((o) => ({ id: crypto.randomUUID(), role: 'body' as const, title: o.title, content: p.drafts[o.id] ?? '', hint: o.brief })),
    ...back.map((s) => (/data availability/i.test(s.title) ? { ...s, content: 'All studies analysed in this review are published and cited; the screening log and extraction table are available as supplementary material.' } : s)),
  ]
  const bibtex = [...papers.map(paperToBibtex), ...m.refs.map((k) => REVIEW_REFS[k])].join('\n\n') + '\n'
  const now = Date.now()
  const manuscript: Manuscript = existing
    ? { ...existing, title: p.title, sections, bibtex, updatedAt: now }
    : { ...base, sections, bibtex, createdAt: now, updatedAt: now }
  if (existing) {
    const { takeSnapshot } = await import('../pipeline/snapshots')
    await takeSnapshot(existing, 'Before refreshing from the review project')
  }
  await db.manuscripts.put(manuscript)
  return manuscript
}

/** Screening log (all records with decisions and reasons) for supplementary material. */
export function screeningCsv(p: ReviewProject): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['id', 'title', 'year', 'venue', 'doi', 'queries', 'title_abstract_decision', 'title_abstract_reason', 'ai_suggestion', 'ai_reason', 'full_text_decision', 'full_text_reason']
  const rows = p.records.map((r) => [r.id, r.meta.title, r.meta.year, r.meta.venue, r.meta.doi, r.manual ? 'manual' : r.queries.map((q) => q + 1).join(' '), r.ta, r.taReason, r.ai?.decision, r.ai?.reason, r.ft, r.ftReason].map(esc).join(','))
  return [head.join(','), ...rows].join('\n')
}
