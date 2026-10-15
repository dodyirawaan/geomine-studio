// AI requests for review projects: protocol drafting, title/abstract screening suggestions, and section writing.
import { JOURNALS } from '../ai/prompts'
import type { Paper } from '../store/db'
import { QUALITY_CRITERIA, REVIEW_METHODS, type OutlineItem, type ReviewMethod } from './methods'
import type { PrismaCounts } from './prisma'
import type { Decision, Protocol, ReviewMethodId, ReviewProject, ReviewRecord } from './types'

function jsonFrom<T>(text: string, open: '{' | '['): T {
  const close = open === '{' ? '}' : ']'
  const a = text.indexOf(open)
  const b = text.lastIndexOf(close)
  if (a === -1 || b <= a) throw new Error('The model did not return the expected JSON.')
  return JSON.parse(text.slice(a, b + 1)) as T
}

// ---------- protocol ----------

export function protocolRequest(topic: string, method: ReviewMethod, journal: string): string {
  return `Draft the protocol of a ${method.name.toLowerCase()} (${method.guideline}) in underground mining geotechnics.

Topic / idea from the researcher:
${topic.trim()}

Target journal: ${JOURNALS.find((j) => j.id === journal)?.name ?? 'not decided'}

Return only a JSON object:
{
  "questions": ["2–4 precise review questions"],
  "framework": {${method.framework.fields.map((f) => `"${f}": "..."`).join(', ')}},
  "inclusion": ["I1 …", "I2 …"],
  "exclusion": ["E1 …", "E2 …"],
  "queries": ["2–4 search strings for OpenAlex title+abstract search"],
  "yearFrom": 2010
}

Rules for the search strings: use AND, OR, NOT, parentheses and "quoted phrases"; include spelling variants and synonyms (e.g. rockburst OR "rock burst"); no commas, no wildcards (the database stems words automatically), no field tags. Each string must be specific enough to return hundreds, not tens of thousands, of records. Criteria must be checkable from a title and abstract where possible, and be numbered I1… and E1….`
}

export function parseProtocol(text: string, base: Protocol): Protocol {
  const j = jsonFrom<Partial<Protocol> & { yearFrom?: number }>(text, '{')
  return {
    ...base,
    questions: (j.questions ?? base.questions).map(String),
    framework: Object.fromEntries(Object.entries(j.framework ?? base.framework).map(([k, v]) => [k, String(v)])),
    inclusion: (j.inclusion ?? base.inclusion).map(String),
    exclusion: (j.exclusion ?? base.exclusion).map(String),
    queries: (j.queries ?? base.queries).map((q) => String(q).replace(/,/g, ' ')),
    yearFrom: Number(j.yearFrom) || base.yearFrom,
  }
}

// ---------- screening ----------

export function screeningRequest(p: Protocol, batch: ReviewRecord[]): string {
  const items = batch
    .map((r) => `### ${r.id}\nTitle: ${r.meta.title}\nYear: ${r.meta.year ?? '?'} · ${r.meta.venue ?? ''}\nAbstract: ${(r.meta.abstract ?? '(no abstract)').slice(0, 1100)}`)
    .join('\n\n')
  return `Screen these records for a literature review using only the title and abstract.

## Review questions
${p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Inclusion criteria
${p.inclusion.join('\n')}

## Exclusion criteria
${p.exclusion.join('\n')}

## Records
${items}

## Output
Return only a JSON array with one object per record, in the same order:
[{"id": "record id", "decision": "include" | "exclude" | "maybe", "reason": "criterion code(s) and a short justification, e.g. 'E2: laboratory study on concrete, not rock'"}]
Use "maybe" when the abstract is missing or does not allow a decision. Be conservative: when in doubt, choose "maybe", not "exclude".`
}

export function parseScreening(text: string): Record<string, { decision: Decision; reason: string }> {
  const arr = jsonFrom<{ id: string; decision: string; reason?: string }[]>(text, '[')
  const out: Record<string, { decision: Decision; reason: string }> = {}
  for (const x of arr) {
    const d = x.decision === 'include' || x.decision === 'exclude' ? x.decision : 'maybe'
    out[String(x.id)] = { decision: d, reason: String(x.reason ?? '') }
  }
  return out
}

// ---------- full-text eligibility ----------

const MAX_ELIGIBILITY_TEXT = 60000

export function eligibilityRequest(p: Protocol, r: ReviewRecord, source: { kind: 'abstract' } | { kind: 'fulltext'; text: string }, reasons: string[]): string {
  const body =
    source.kind === 'fulltext'
      ? `## Full text (extracted from PDF${source.text.length > MAX_ELIGIBILITY_TEXT ? ', truncated' : ''})\n${source.text.slice(0, MAX_ELIGIBILITY_TEXT)}`
      : `## Abstract (the full text is not available)\n${r.meta.abstract ?? '(no abstract available)'}`
  return `Assess whether this report is eligible for a literature review at the full-text stage. It already passed title and abstract screening.

## Review questions
${p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Inclusion criteria
${p.inclusion.join('\n')}

## Exclusion criteria
${p.exclusion.join('\n')}

## Report
${r.meta.title}
${r.meta.authors.slice(0, 6).join(', ')}${r.meta.authors.length > 6 ? ' et al.' : ''} (${r.meta.year ?? 'n.d.'}). ${r.meta.venue ?? ''}

${body}

## Output
Return only a JSON object:
{"decision": "include" | "exclude" | "unclear", "reason": "for exclude: a short exclusion reason for the PRISMA diagram, preferably one of: ${reasons.join('; ')}; or an exclusion criterion code", "note": "one or two sentences on which criteria the report meets or fails, pointing to what the text reports"}
Check every inclusion and exclusion criterion. Use "unclear" when the text does not allow a decision${source.kind === 'abstract' ? ' — only the abstract is available, so exclude only when the abstract clearly fails a criterion' : ''}.`
}

export function parseEligibility(text: string): { decision: 'include' | 'exclude' | 'unclear'; reason: string; note: string } {
  const x = jsonFrom<{ decision?: string; reason?: unknown; note?: unknown }>(text, '{')
  const decision = x.decision === 'include' || x.decision === 'exclude' ? x.decision : 'unclear'
  return { decision, reason: String(x.reason ?? '').trim() || (decision === 'exclude' ? 'Excluded' : ''), note: String(x.note ?? '').trim() }
}

// ---------- quality appraisal ----------

const MAX_APPRAISAL_TEXT = 60000

export function qualityRequest(paper: Paper, source: { kind: 'abstract' } | { kind: 'fulltext'; text: string }): string {
  const body =
    source.kind === 'fulltext'
      ? `## Full text (extracted from PDF${source.text.length > MAX_APPRAISAL_TEXT ? ', truncated' : ''})\n${source.text.slice(0, MAX_APPRAISAL_TEXT)}`
      : `## Abstract (no full text available)\n${paper.abstract ?? '(no abstract available)'}`
  return `Appraise the methodological quality of this study for a systematic review in mining geotechnics.

## Study
${paper.title}
${paper.authors.slice(0, 6).join(', ')}${paper.authors.length > 6 ? ' et al.' : ''} (${paper.year ?? 'n.d.'}). ${paper.venue ?? ''}

${body}

## Criteria (score each 0, 1 or 2)
${QUALITY_CRITERIA.map((q) => `- "${q.id}": ${q.label}. ${q.rubric}`).join('\n')}

## Output
Return only a JSON object: {"<criterion id>": {"score": 0 | 1 | 2, "reason": "one sentence pointing to what the text does or does not report"}} with one entry per criterion.
Judge only from the text above. If the text does not report something, score it lower and say so; never assume it was done.${source.kind === 'abstract' ? ' Only the abstract is available, so say "abstract only" in reasons where the full text might report more.' : ''}`
}

export function parseQuality(text: string): { scores: Record<string, number>; reasons: Record<string, string> } {
  const raw = jsonFrom<Record<string, { score?: unknown; reason?: unknown } | number>>(text, '{')
  const scores: Record<string, number> = {}
  const reasons: Record<string, string> = {}
  for (const q of QUALITY_CRITERIA) {
    const v = raw[q.id]
    const n = Number(typeof v === 'object' && v ? v.score : v)
    if (![0, 1, 2].includes(n)) continue
    scores[q.id] = n
    reasons[q.id] = typeof v === 'object' && v ? String(v.reason ?? '') : ''
  }
  if (Object.keys(scores).length < QUALITY_CRITERIA.length) throw new Error('The model did not score every criterion.')
  return { scores, reasons }
}

// ---------- writing ----------

/** Evidence available to the writer: one line per included study with its citation key and extracted data. */
export function evidenceText(papers: Paper[]): string {
  return papers
    .map((p) => {
      const m = p.matrix
      const facts = m
        ? Object.entries(m)
            .filter(([, v]) => v && !/^not reported/i.test(v))
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        : `abstract: ${(p.abstract ?? '').slice(0, 700)}`
      return `- [@${p.bibKey}] ${p.authors[0]?.split(' ').pop() ?? ''} ${p.year ?? ''}, "${p.title}" (${p.venue ?? ''}). ${facts}`
    })
    .join('\n')
}

export function sectionRequest(project: ReviewProject, method: ReviewMethod, item: OutlineItem, papers: Paper[], counts: PrismaCounts, context: Record<string, string>, facts: string): string {
  const others = method.outline
    .filter((o) => o.id !== item.id && context[o.id]?.trim())
    .map((o) => `### ${o.title}\n${context[o.id].slice(0, 2500)}`)
    .join('\n\n')
  return `Write the "${item.title}" section of a ${method.name.toLowerCase()} for a Q1 journal (${JOURNALS.find((j) => j.id === project.journal)?.name ?? 'target journal not set'}).

## Review
Title: ${project.title}
Questions:
${project.protocol.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
${method.screening ? `Included studies: ${counts.included} (from ${counts.identified} records identified).` : ''}

## Section brief
${item.brief}

## Evidence statistics (computed from the extraction table — quote these numbers exactly when you make quantitative statements)
${facts}

## Evidence: the included studies (cite ONLY these, with their [@key])
${evidenceText(papers)}

${others ? `## Sections already written (for consistency; do not repeat them)\n${others}` : ''}

## Rules
- Synthesise, compare and critique across studies; do not summarise them one by one.
- Cite every statement about a study with its key, e.g. [@key] or [@key1; @key2]. Never cite anything that is not in the list above; for background knowledge that needs a source outside the review, write [VERIFY: topic].
- Use only numbers that appear in the evidence or the statistics. Do not invent results, sites or counts.
- Write at the depth expected by a Q1 review: explain mechanisms, compare approaches, give the reasons for disagreements, and draw practical implications for mine design.
- Return the section text in Markdown without the section heading; use "## " for sub-themes and GFM tables where useful.`
}

export interface ThemePlan {
  title: string
  focus: string
  keys: string[]
}

export function themePlanRequest(project: ReviewProject, method: ReviewMethod, papers: Paper[], facts: string): string {
  return `Plan the thematic synthesis of a ${method.name.toLowerCase()} titled "${project.title}".

## Review questions
${project.protocol.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Evidence statistics
${facts}

## Included studies
${evidenceText(papers)}

## Output
Return only a JSON array of 4–7 themes that together answer the review questions, ordered logically (e.g. mechanisms and indicators → data and monitoring → methods → validation and performance → engineering application):
[{"title": "concise theme heading", "focus": "what this theme must compare and conclude", "keys": ["citation keys of the studies that belong to it"]}]
Every included study must appear in at least one theme; use only the keys above.`
}

export function parseThemePlan(text: string, validKeys: Set<string>): ThemePlan[] {
  return jsonFrom<ThemePlan[]>(text, '[')
    .filter((t) => t && t.title)
    .map((t) => ({ title: String(t.title).replace(/^#+\s*/, ''), focus: String(t.focus ?? ''), keys: (t.keys ?? []).map(String).filter((k) => validKeys.has(k)) }))
}

export function themeRequest(project: ReviewProject, method: ReviewMethod, theme: ThemePlan, all: ThemePlan[], papers: Paper[], facts: string): string {
  const own = papers.filter((p) => theme.keys.includes(p.bibKey))
  return `Write one theme of the thematic synthesis of the ${method.name.toLowerCase()} "${project.title}" for a Q1 journal.

## Theme: ${theme.title}
Focus: ${theme.focus}

## Other themes of the synthesis (do not cover their content)
${all.filter((t) => t !== theme).map((t) => `- ${t.title}`).join('\n')}

## Evidence statistics (computed — quote exactly)
${facts}

## Studies in this theme (cite ONLY these, with their [@key])
${evidenceText(own.length ? own : papers)}

## Rules
- 400–900 words of critical synthesis: group studies by approach, compare their data, methods and results, explain agreements and contradictions by site conditions, data or method, and state what remains unresolved.
- Add one GFM comparison table when it helps (e.g. Study | Data | Method | Validation | Main result), using only facts in the evidence.
- Cite with [@key] or [@a; @b]. For background that needs a source outside these studies, write [VERIFY: topic].
- Do not invent numbers. Return the text only, without the theme heading.`
}

export function abstractRequest(project: ReviewProject, method: ReviewMethod, counts: PrismaCounts, body: string): string {
  return `Write the abstract (one paragraph, at most 250 words), 3–5 highlights (each at most 85 characters) and 5–6 keywords for this ${method.name.toLowerCase()}.

Title: ${project.title}
${method.screening ? `Records identified: ${counts.identified}; studies included: ${counts.included}.` : ''}

Full text of the review:
${body.slice(0, 24000)}

Return exactly three blocks:
ABSTRACT:
<paragraph>
HIGHLIGHTS:
- ...
KEYWORDS:
a, b, c
Do not include citations in the abstract. Use only facts present in the review.`
}

export function parseAbstract(text: string): { abstract: string; highlights: string; keywords: string } {
  const pick = (label: string, next?: string) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)${next ? `(?=${next}:)` : '$'}`, 'i')
    return (re.exec(text)?.[1] ?? '').trim()
  }
  return { abstract: pick('ABSTRACT', 'HIGHLIGHTS'), highlights: pick('HIGHLIGHTS', 'KEYWORDS'), keywords: pick('KEYWORDS') }
}

export function methodById(id: ReviewMethodId): ReviewMethod {
  return REVIEW_METHODS.find((m) => m.id === id)!
}
