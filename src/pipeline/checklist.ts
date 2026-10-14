// Pre-submission checklist: items the app can verify, and items only the author can confirm.
import { parseBibtex } from '../manuscript/bibtex'
import { publisherOf } from '../manuscript/templates'
import type { Manuscript } from '../store/db'
import type { Issue } from './check'

export interface ChecklistItem {
  id: string
  group: 'Content' | 'Integrity' | 'Declarations' | 'Submission'
  label: string
  /** Automatic verdict, or undefined for a manual item. */
  auto?: (m: Manuscript, issues: Issue[]) => { ok: boolean; detail?: string }
  publisher?: 'Elsevier' | 'Springer'
}

const none = (issues: Issue[], category: string, severities: Issue['severity'][] = ['error', 'warning']) => {
  const found = issues.filter((i) => i.category === category && severities.includes(i.severity))
  return { ok: found.length === 0, detail: found.length ? `${found.length} issue(s) in Check` : undefined }
}

const backFilled = (m: Manuscript, re: RegExp) => {
  const s = m.sections.find((x) => x.role === 'back' && re.test(x.title))
  return { ok: !!s?.content.trim(), detail: s ? (s.content.trim() ? undefined : `"${s.title}" is empty`) : 'Section missing' }
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'structure', group: 'Content', label: 'Title, authors, abstract, keywords and all sections are complete', auto: (_, i) => none(i, 'Structure', ['error']) },
  { id: 'highlights', group: 'Content', label: 'Highlights: 3–5 bullets, each ≤ 85 characters', publisher: 'Elsevier', auto: (_, i) => none(i.filter((x) => /highlight/i.test(x.message)), 'Structure') },
  { id: 'figtab', group: 'Content', label: 'Figures and tables are cited in order and none is missing', auto: (_, i) => none(i, 'Figures & tables') },
  { id: 'abbr', group: 'Content', label: 'Abbreviations are defined at first use in the abstract and again in the main text', auto: (_, i) => none(i, 'Abbreviations') },
  { id: 'units', group: 'Content', label: 'SI units written consistently ("120 MPa", kN/m³)', auto: (_, i) => none(i, 'Units') },
  { id: 'spelling', group: 'Content', label: 'One spelling convention (British or American) throughout', auto: (_, i) => none(i, 'Spelling', ['warning', 'info']) },
  {
    id: 'novelty',
    group: 'Content',
    label: 'Introduction states the research gap and the novelty/contribution explicitly',
    auto: (m) => {
      const intro = m.sections.find((s) => s.role === 'body' && /introduction/i.test(s.title))?.content ?? ''
      const ok = /\b(gap|novel|novelty|contribution|for the first time|has not been|remains? (unclear|unknown|limited))/i.test(intro)
      return { ok, detail: ok ? undefined : 'No gap or novelty statement detected (heuristic)' }
    },
  },
  { id: 'placeholders', group: 'Integrity', label: 'No [DATA NEEDED], [VERIFY], [X] or [Caption] placeholders remain', auto: (_, i) => none(i, 'Placeholders') },
  { id: 'citations', group: 'Integrity', label: 'Every citation resolves to a reference entry', auto: (_, i) => none(i.filter((x) => x.severity === 'error'), 'Citations') },
  { id: 'numbers', group: 'Integrity', label: 'Every value in the Abstract, Highlights and Conclusions appears in the main text', auto: (_, i) => none(i, 'Numbers') },
  {
    id: 'recent',
    group: 'Integrity',
    label: 'At least a quarter of the references are from the last 5 years (rule of thumb)',
    auto: (m) => {
      const years = parseBibtex(m.bibtex).map((e) => Number(e.fields.year)).filter(Boolean)
      if (!years.length) return { ok: false, detail: 'No references yet' }
      const recent = years.filter((y) => y >= new Date().getFullYear() - 5).length
      return { ok: recent / years.length >= 0.25, detail: `${recent}/${years.length} recent` }
    },
  },
  { id: 'verified', group: 'Integrity', label: 'All references verified against Crossref (References → Verify) or checked by hand' },
  { id: 'aiReviewed', group: 'Integrity', label: 'Every AI-drafted passage has been read, fact-checked and rewritten in your own words' },
  { id: 'credit', group: 'Declarations', label: 'CRediT authorship contribution statement', publisher: 'Elsevier', auto: (m) => backFilled(m, /credit|contribution/i) },
  { id: 'contrib', group: 'Declarations', label: 'Author contributions statement', publisher: 'Springer', auto: (m) => backFilled(m, /contribution/i) },
  { id: 'coi', group: 'Declarations', label: 'Competing interests declared', auto: (m) => backFilled(m, /compet/i) },
  { id: 'data', group: 'Declarations', label: 'Data availability statement', auto: (m) => backFilled(m, /data availability/i) },
  { id: 'aiUse', group: 'Declarations', label: 'Use of generative AI / language models disclosed', auto: (m) => backFilled(m, /generative|language model|\bAI\b/i) },
  { id: 'funding', group: 'Declarations', label: 'Funding and acknowledgements (including mine-site permission to publish)', auto: (m) => backFilled(m, /acknowledg|funding/i) },
  { id: 'guide', group: 'Submission', label: "Word, abstract, figure and reference limits confirmed in the journal's current Guide for Authors" },
  { id: 'refstyle', group: 'Submission', label: "Reference style matches the journal (the LaTeX export uses the publisher's style; Word needs restyling)" },
  { id: 'figures', group: 'Submission', label: 'Figures at ≥ 300 dpi (line art ≥ 1000 dpi), readable fonts, units on axes, captions and permissions' },
  { id: 'similarity', group: 'Submission', label: 'Similarity check run and self-overlap with earlier papers resolved' },
  { id: 'language', group: 'Submission', label: 'Language edited (Language Polisher or a native-speaking colleague)' },
  { id: 'cover', group: 'Submission', label: 'Cover letter: fit with the journal scope, novelty, no simultaneous submission' },
  { id: 'reviewers', group: 'Submission', label: 'Suggested reviewers (no conflicts of interest) prepared, if requested' },
  { id: 'orcid', group: 'Submission', label: 'All authors approved the final version; ORCID iDs ready' },
]

export function checklistFor(m: Manuscript): ChecklistItem[] {
  const pub = publisherOf(m.journal)
  return CHECKLIST.filter((c) => !c.publisher || c.publisher === pub)
}
