// Requests for the automated writing pipeline: outline → draft → Reviewer 2 → revision, plus an AI consistency pass.
import { JOURNALS } from '../ai/prompts'
import { citeLabel, parseBibtex } from '../manuscript/bibtex'
import { exportMarkdown } from '../manuscript/exportMarkdown'
import { ARTICLE_TYPES } from '../manuscript/templates'
import type { Manuscript, ManuscriptSection, ReviewComment } from '../store/db'

function header(m: Manuscript): string {
  const j = JOURNALS.find((x) => x.id === m.journal)
  const t = ARTICLE_TYPES.find((x) => x.id === m.articleType)
  return `Target journal: ${j?.name ?? 'not set'} · Article type: ${t?.label ?? m.articleType}`
}

function library(m: Manuscript): string {
  const refs = parseBibtex(m.bibtex)
  return refs.length ? refs.map((e) => `- ${e.key} — ${citeLabel(e)} — ${e.fields.title ?? ''}`).join('\n') : '(empty)'
}

/** The manuscript as Markdown with [@key] citations kept, for review prompts. */
export function manuscriptForReview(m: Manuscript): string {
  return exportMarkdown(m, false)
}

// ---------- 1. Outline ----------

export function outlineRequest(m: Manuscript, idea: string): string {
  const body = m.sections.filter((s) => s.role === 'body')
  return `Plan a Q1 manuscript from the researcher's idea.

${header(m)}
Working title: ${m.title || '(none)'}

## Idea, data and notes from the researcher
${idea.trim()}

## Reference library (cite only these keys as [@key]; otherwise write [VERIFY: topic])
${library(m)}

## Output format (Markdown, exactly these headings)
## Title options
Three specific, informative titles.
## Research questions
2–3 questions.
## Novelty statement
One paragraph stating the gap and the contribution.
${body.map((s) => `## Section: ${s.title}\nBullet-point notes for this section: what to say, in order, which data/figures/tables it needs, and which [DATA NEEDED: …] items the researcher must supply.`).join('\n')}

Base the plan only on the researcher's notes. Do not invent results, sites or numbers.`
}

/** Splits an outline reply into notes per body-section title. */
export function parseOutline(text: string): { titles: string[]; sections: Record<string, string> } {
  const sections: Record<string, string> = {}
  for (const m of text.matchAll(/^##\s*Section:\s*(.+?)\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)) sections[m[1].trim().toLowerCase()] = m[2].trim()
  const titleBlock = /^##\s*Title options\s*$([\s\S]*?)(?=^##\s)/m.exec(text)?.[1] ?? ''
  const titles = titleBlock
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').replace(/^\*\*|\*\*$/g, '').trim())
    .filter((l) => l.length > 10)
  return { titles, sections }
}

// ---------- 3. Reviewer 2 ----------

export function reviewRequest(m: Manuscript): string {
  const titles = ['General', ...m.sections.map((s) => s.title)]
  return `Review this manuscript as a demanding but fair Reviewer 2 for the target journal. ${header(m)}

${manuscriptForReview(m)}

## Output
Return only a JSON array. Each element:
{"severity": "major" | "minor", "section": one of ${JSON.stringify(titles)}, "quote": "exact short passage you comment on, or empty", "comment": "the problem", "suggestion": "a concrete fix"}

Cover novelty and positioning against prior work, methodological validity, calibration/validation, statistics and data leakage (for ML), overgeneralisation, consistency between sections, figures/tables, units and notation. Give 6–15 comments, major ones first. Do not invent facts about the study.`
}

export function parseReview(text: string): ReviewComment[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('The model did not return a JSON array of comments.')
  const raw = JSON.parse(text.slice(start, end + 1)) as Partial<ReviewComment>[]
  return raw
    .filter((c) => c && c.comment)
    .map((c, i) => ({
      id: `C${i + 1}`,
      severity: c.severity === 'minor' ? 'minor' : 'major',
      section: String(c.section ?? 'General'),
      quote: c.quote ? String(c.quote) : undefined,
      comment: String(c.comment),
      suggestion: c.suggestion ? String(c.suggestion) : undefined,
      selected: c.severity !== 'minor',
    }))
}

/** Which section a comment belongs to; general comments go to the section the quote comes from, else the Introduction. */
export function sectionForComment(m: Manuscript, c: ReviewComment): ManuscriptSection | undefined {
  const byTitle = m.sections.find((s) => s.title.toLowerCase() === c.section.toLowerCase())
  if (byTitle) return byTitle
  if (c.quote) {
    const q = c.quote.slice(0, 40)
    const byQuote = m.sections.find((s) => s.content.includes(q))
    if (byQuote) return byQuote
  }
  return undefined
}

// ---------- 4. Revision ----------

export const RESPONSES_MARK = '=== RESPONSES ==='

export function revisionRequest(m: Manuscript, section: ManuscriptSection, comments: ReviewComment[]): string {
  const others = m.sections
    .filter((s) => s.id !== section.id && s.content.trim())
    .map((s) => `### ${s.title}\n${s.content.trim().slice(0, 2000)}${s.content.length > 2000 ? '\n[…]' : ''}`)
    .join('\n\n')
  return `Revise one section of the manuscript to address reviewer comments. ${header(m)}

## Other sections (context)
${others || '(none)'}

## Reference library (cite only these keys as [@key]; otherwise write [VERIFY: topic])
${library(m)}

## Section to revise: ${section.title}
<<<
${section.content.trim() || '(empty)'}
>>>

## Reviewer comments to address
${comments.map((c) => `${c.id} (${c.severity}): ${c.comment}${c.quote ? `\n  Quoted: "${c.quote}"` : ''}${c.suggestion ? `\n  Suggested fix: ${c.suggestion}` : ''}`).join('\n')}

## Output
First the complete revised section text in Markdown (no heading, "## " for subsections, $…$ math). Keep everything that the comments do not require changing. Never invent data: where a comment needs new data or analysis, insert [DATA NEEDED: …] and say so in the response.
Then a line containing exactly:
${RESPONSES_MARK}
Then one line per comment: "<id>: <response to the reviewer stating what was changed, or why not>".`
}

export function parseRevision(text: string): { text: string; responses: Record<string, string> } {
  const i = text.indexOf(RESPONSES_MARK)
  const body = (i === -1 ? text : text.slice(0, i)).trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, '$1').trim()
  const responses: Record<string, string> = {}
  if (i !== -1) {
    for (const line of text.slice(i + RESPONSES_MARK.length).split('\n')) {
      const m = /^\s*[-*]?\s*\**(C\d+)\**\s*[:–-]\s*(.+)$/.exec(line)
      if (m) responses[m[1]] = m[2].trim()
    }
  }
  return { text: body, responses }
}

export function responseLetter(m: Manuscript, comments: ReviewComment[]): string {
  const addressed = comments.filter((c) => c.response)
  return `# Response to reviewers

**Manuscript:** ${m.title || 'Untitled'}

We thank the reviewer for the careful reading and constructive comments. Our responses follow; changes in the manuscript are described for each comment.

${addressed
  .map(
    (c) => `## ${c.id} (${c.severity}) — ${c.section}

> ${c.comment.replace(/\n/g, '\n> ')}

**Response:** ${c.response}`,
  )
  .join('\n\n')}
`
}

// ---------- AI consistency check ----------

export function consistencyRequest(m: Manuscript): string {
  return `Check this manuscript for internal inconsistencies only — not style. ${header(m)}

${manuscriptForReview(m)}

Look for: numbers or units that differ between sections (e.g. Abstract vs Results vs Tables), claims in the Abstract/Conclusions that the Results do not support, parameters stated differently in Methods and Results, inconsistent terminology or symbols for the same quantity, sample sizes that do not add up, and contradictory statements.

Return only a JSON array; each element: {"section": "section title", "quote": "exact short passage", "problem": "what is inconsistent and with what", "fix": "suggested correction"}. Return [] if you find nothing. Report only real inconsistencies you can point to in the text.`
}

export interface AiFinding {
  section: string
  quote?: string
  problem: string
  fix?: string
}

export function parseFindings(text: string): AiFinding[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end < start) throw new Error('The model did not return a JSON array.')
  return (JSON.parse(text.slice(start, end + 1)) as AiFinding[]).filter((f) => f && f.problem)
}
