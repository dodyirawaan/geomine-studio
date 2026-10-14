// BibTeX generation for library papers, and small edits to a manuscript's raw BibTeX.
import type { Paper } from '../store/db'
import type { PaperMeta } from './openalex'

function ascii(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const SKIP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'by', 'from', 'at', 'using', 'via', 'study'])

/** Key like "hoek2019failure", made unique against `taken`. */
export function makeBibKey(p: Pick<PaperMeta, 'authors' | 'year' | 'title'>, taken: Set<string>): string {
  const family = ascii(p.authors[0]?.split(/\s+/).pop() ?? '') || 'anon'
  const word = p.title
    .split(/\s+/)
    .map(ascii)
    .find((w) => w.length > 2 && !SKIP.has(w)) ?? ''
  const base = `${family}${p.year ?? ''}${word}`
  let key = base
  for (let i = 0; taken.has(key); i++) key = `${base}${String.fromCharCode(97 + i)}`
  return key
}

function bibAuthor(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return `{${parts[0]}}`
  const family = parts.pop()!
  return `${family}, ${parts.join(' ')}`
}

export function paperToBibtex(p: Paper): string {
  const fields: [string, string | undefined][] = [
    ['author', p.authors.length ? p.authors.map(bibAuthor).join(' and ') : undefined],
    // Double braces keep acronyms such as GSI and FLAC3D capitalised.
    ['title', `{${p.title}}`],
    ['journal', p.venue],
    ['year', p.year?.toString()],
    ['volume', p.volume],
    ['number', p.issue],
    ['pages', p.pages?.replace(/[–—]/, '--')],
    ['doi', p.doi],
    ['url', p.doi ? undefined : p.url],
  ]
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(',\n')
  return `@article{${p.bibKey},\n${body}\n}`
}

/** Adds or replaces one field of the entry with `key` in raw BibTeX, leaving the rest of the text untouched. */
export function setBibField(bibtex: string, key: string, field: string, value: string): string {
  const head = new RegExp(`@\\w+\\s*\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,`)
  const m = head.exec(bibtex)
  if (!m) return bibtex
  const start = m.index + m[0].length
  // Find the entry's closing brace.
  let depth = 1
  let end = start
  while (end < bibtex.length && depth > 0) {
    if (bibtex[end] === '{') depth++
    else if (bibtex[end] === '}') depth--
    end++
  }
  const body = bibtex.slice(start, end - 1)
  const existing = new RegExp(`(^|,)(\\s*)${field}\\s*=\\s*(\\{[^{}]*\\}|"[^"]*"|[^,}\\n]+)`, 'i')
  const nextBody = existing.test(body)
    ? body.replace(existing, `$1$2${field} = {${value}}`)
    : `${body.replace(/\s*,?\s*$/, '')},\n  ${field} = {${value}}\n`
  return bibtex.slice(0, start) + nextBody + bibtex.slice(end - 1)
}
