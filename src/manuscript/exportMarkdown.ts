import type { Manuscript } from '../store/db'
import { CITE_RE, citedKeys, formatCitation, formatReference, parseBibtex, sortedReferences } from './bibtex'
import { highlightList, keywordList } from './templates'

/** Section text sits under a level-2 heading, so its own headings move down one level. */
function demote(text: string): string {
  return text.replace(/^(#{1,5})(?=\s)/gm, (h) => (h.length < 3 ? '###' : `${h}#`))
}

/** Whole manuscript as one Markdown file, citations resolved to author–year. */
export function exportMarkdown(m: Manuscript, resolveCitations = true): string {
  const entries = parseBibtex(m.bibtex)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const cite = (t: string) => (resolveCitations ? t.replace(CITE_RE, (_, g: string) => formatCitation(g, byKey)) : t)
  const out: string[] = [`# ${m.title || 'Untitled manuscript'}`]

  const authors = m.authors.filter((a) => a.name.trim())
  if (authors.length) out.push(authors.map((a) => `${a.name}${a.corresponding ? '*' : ''}${a.affiliation ? ` (${a.affiliation})` : ''}`).join(', '))

  const hl = highlightList(m)
  if (hl.length) out.push('## Highlights', hl.map((h) => `- ${h}`).join('\n'))
  const abs = m.sections.find((s) => s.role === 'abstract')?.content.trim()
  if (abs) out.push('## Abstract', cite(abs))
  const kw = keywordList(m)
  if (kw.length) out.push(`**Keywords:** ${kw.join('; ')}`)

  let n = 0
  for (const s of m.sections) {
    if (s.role === 'body') out.push(`## ${++n}. ${s.title}`, cite(demote(s.content.trim())))
    else if (s.role === 'back' && s.content.trim()) out.push(`## ${s.title}`, cite(demote(s.content.trim())))
  }

  const refs = sortedReferences(entries, citedKeys(m.sections.map((s) => s.content)))
  if (refs.length && resolveCitations) out.push('## References', refs.map((e) => `- ${formatReference(e)}`).join('\n'))
  return out.filter(Boolean).join('\n\n') + '\n'
}
