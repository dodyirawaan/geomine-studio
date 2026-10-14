// Builds AI requests for one manuscript section, giving the model the rest of the paper and the citation library as context.
import type { ModeId } from '../ai/prompts'
import { ARTICLE_TYPES } from './templates'
import { citeLabel, parseBibtex } from './bibtex'
import type { Manuscript, ManuscriptSection } from '../store/db'
import { JOURNALS } from '../ai/prompts'

export type AssistAction = 'draft' | 'improve' | 'polish' | 'review' | 'custom'

export interface AssistActionInfo {
  id: AssistAction
  label: string
  /** Whether the reply is a replacement for the section text (vs. commentary). */
  replaces: boolean
  mode: ModeId
}

export const ASSIST_ACTIONS: AssistActionInfo[] = [
  { id: 'draft', label: 'Draft from notes', replaces: true, mode: 'general' },
  { id: 'improve', label: 'Revise & strengthen', replaces: true, mode: 'general' },
  { id: 'polish', label: 'Polish language', replaces: true, mode: 'polish' },
  { id: 'review', label: 'Reviewer critique', replaces: false, mode: 'reviewer' },
  { id: 'custom', label: 'Custom instruction', replaces: true, mode: 'general' },
]

const SECTION_MODES: Record<string, ModeId> = {
  'materials and methods': 'methods',
  methods: 'methods',
  methodology: 'methods',
  results: 'results',
  discussion: 'results',
  'results and discussion': 'results',
}

export function modeFor(action: AssistActionInfo, section: ManuscriptSection): ModeId {
  if (action.mode !== 'general') return action.mode
  return SECTION_MODES[section.title.trim().toLowerCase()] ?? 'general'
}

function taskFor(action: AssistAction, section: ManuscriptSection, custom: string): string {
  const what =
    section.role === 'highlights'
      ? 'Highlights: 3–5 lines, one per line starting with "- ", each at most 85 characters including spaces, stating concrete findings.'
      : section.role === 'keywords'
        ? 'Keywords: one comma-separated line of 4–7 keywords that do not repeat the title.'
        : section.role === 'abstract'
          ? 'Abstract: one paragraph with context, aim, methods, key quantitative results (only numbers present in the manuscript), and implications.'
          : `the "${section.title}" section`
  switch (action) {
    case 'draft':
      return `Write ${what} The current content is the researcher's notes and partial text; turn it into publication-ready prose, keeping every fact and number they gave and adding none of your own. If the notes are empty, draft from the other sections and mark every gap with [DATA NEEDED: …].`
    case 'improve':
      return `Revise ${what} Strengthen argument flow, precision, and links to the rest of the manuscript. Keep all facts, numbers, and citations; flag weak claims inline with [VERIFY: reason].`
    case 'polish':
      return `Edit ${what} for grammar, concision, and academic tone only. Preserve meaning, numbers, math, and every [@key] citation exactly.`
    case 'review':
      return `Critique ${what} as a demanding Q1 reviewer: major issues, minor issues, and concrete fixes. Quote the passages you comment on. Consider consistency with the other sections.`
    case 'custom':
      return `${custom.trim()}\n(Apply this to ${what})`
  }
}

const OUTPUT_RULES = `Output rules:
- Return only the new section text in Markdown — no section heading, no preamble, no closing remarks.
- Use "## " for subsections, "$…$" / "$$…$$" for math, and GFM tables.
- Cite only with [@key] using keys from the reference library above; group as [@a; @b]. For a claim that needs a source not in the library, write [VERIFY: Author Year, topic] instead of inventing a key.`

export function buildAssistMessage(m: Manuscript, section: ManuscriptSection, action: AssistActionInfo, custom: string): string {
  const journal = JOURNALS.find((j) => j.id === m.journal)
  const type = ARTICLE_TYPES.find((t) => t.id === m.articleType)
  const refs = parseBibtex(m.bibtex)

  let body = 0
  const outline = m.sections
    .map((s) => `${s.role === 'body' ? `${++body}. ` : ''}${s.title}${s.id === section.id ? '  ← current' : ''}`)
    .join('\n')

  const others = m.sections
    .filter((s) => s.id !== section.id && s.content.trim())
    .map((s) => {
      const t = s.content.trim()
      return `### ${s.title}\n${t.length > 2500 ? `${t.slice(0, 2500)}\n[…truncated]` : t}`
    })
    .join('\n\n')

  const library = refs.length
    ? refs.map((e) => `- ${e.key} — ${citeLabel(e)} — ${e.fields.title ?? ''}`).join('\n')
    : '(empty — use [VERIFY: …] placeholders for any citation)'

  return [
    `# Manuscript: ${m.title || '[untitled]'}`,
    `Target journal: ${journal?.name ?? 'not set'} · Article type: ${type?.label ?? m.articleType}`,
    `## Outline\n${outline}`,
    others && `## Other sections (context for consistency)\n${others}`,
    `## Reference library\n${library}`,
    `## Current section: ${section.title}${section.hint ? `\nGuidance: ${section.hint}` : ''}\n<<<\n${section.content.trim() || '(empty)'}\n>>>`,
    `## Task\n${taskFor(action.id, section, custom)}`,
    action.replaces ? OUTPUT_RULES : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
