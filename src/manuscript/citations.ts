// Citation styles: in-text citations and reference lists for Elsevier Harvard, APA 7, Springer basic author–year and
// numbered (order of first citation). One "citer" serves the editor preview and every exporter, so all agree.
import { CITE_RE, citeKeys, type BibEntry } from './bibtex'

export type CitationStyle = 'harvard' | 'apa' | 'springer' | 'numeric'

export const CITATION_STYLES: { id: CitationStyle; label: string; example: string }[] = [
  { id: 'harvard', label: 'Elsevier Harvard (author–year)', example: '(Hoek and Brown, 2019; Cai et al., 2021)' },
  { id: 'apa', label: 'APA 7th', example: '(Hoek & Brown, 2019; Cai et al., 2021)' },
  { id: 'springer', label: 'Springer basic (author–year)', example: '(Hoek and Brown 2019; Cai et al. 2021)' },
  { id: 'numeric', label: 'Numbered [1] (Elsevier / IEEE-like)', example: '[1], [2–4]' },
]

/** A piece of a formatted reference; italic parts are rendered in italics where the output supports it. */
export interface Seg {
  text: string
  italic?: boolean
}

interface Person {
  family: string
  initials: string[]
}

function people(e: BibEntry): Person[] {
  const raw = e.fields.author ?? e.fields.editor ?? ''
  return raw
    .split(/\s+and\s+/i)
    .filter(Boolean)
    .map((a) => {
      let family: string
      let given: string
      if (a.includes(',')) {
        ;[family, given = ''] = a.split(',').map((x) => x.trim())
      } else {
        const parts = a.trim().split(/\s+/)
        family = parts.pop() ?? ''
        given = parts.join(' ')
      }
      const initials = given
        .replace(/\./g, ' ')
        .split(/\s+|(?=-)/)
        .filter(Boolean)
        .map((g) => (g.startsWith('-') ? `-${g[1] ?? ''}` : g[0]))
      return { family: family.replace(/^\{|\}$/g, ''), initials }
    })
}

const year = (e: BibEntry) => e.fields.year ?? 'n.d.'
const pages = (e: BibEntry) => e.fields.pages?.replace(/\s*-+\s*/, '–')
const doiUrl = (e: BibEntry) => (e.fields.doi ? `https://doi.org/${e.fields.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : e.fields.url)
const venue = (e: BibEntry) => e.fields.journal ?? e.fields.booktitle ?? ''
const title = (e: BibEntry) => (e.fields.title ?? e.key).replace(/\.$/, '')

function inTextNames(e: BibEntry, and: string): string {
  const p = people(e)
  if (!p.length) return e.fields.organization ?? e.key
  if (p.length === 1) return p[0].family
  if (p.length === 2) return `${p[0].family} ${and} ${p[1].family}`
  return `${p[0].family} et al.`
}

function joinAuthors(list: string[], last: string): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')}${last}${list[list.length - 1]}`
}

/** Book, thesis, proceedings or article tail after the title. */
function containerSegs(e: BibEntry, style: CitationStyle): Seg[] {
  const f = e.fields
  const v = venue(e)
  const pg = pages(e)
  if (e.type === 'book' || e.type === 'manual') {
    const pub = [f.publisher ?? f.organization, f.address].filter(Boolean).join(', ')
    if (style === 'numeric') return [{ text: `, ${pub ? `${pub}, ` : ''}${year(e)}.` }]
    return pub ? [{ text: ` ${pub}.` }] : []
  }
  if (e.type === 'phdthesis' || e.type === 'mastersthesis') return [{ text: ` ${e.type === 'phdthesis' ? 'PhD thesis' : 'Master’s thesis'}, ${f.school ?? ''}.` }]
  if (e.type === 'techreport') return [{ text: ` ${f.institution ?? ''}${f.number ? `, Report ${f.number}` : ''}.` }]
  if (!v) return []
  switch (style) {
    case 'apa':
      return [{ text: ' ' }, { text: v, italic: true }, ...(f.volume ? [{ text: ', ' }, { text: f.volume, italic: true }] : []), { text: `${f.number ? `(${f.number})` : ''}${pg ? `, ${pg}` : ''}.` }]
    case 'springer':
      return [{ text: ` ${v}${f.volume ? ` ${f.volume}` : ''}${f.number ? `(${f.number})` : ''}${pg ? `:${pg}` : ''}` }]
    case 'numeric':
      return [{ text: `, ${v}${f.volume ? ` ${f.volume}` : ''} (${year(e)})${pg ? ` ${pg}` : ''}.` }]
    default:
      return [{ text: ` ${v}${f.volume ? ` ${f.volume}` : ''}${f.number ? ` (${f.number})` : ''}${pg ? `, ${pg}` : ''}.` }]
  }
}

function referenceSegs(e: BibEntry, style: CitationStyle, suffix: string): Seg[] {
  const p = people(e)
  const url = doiUrl(e)
  const y = `${year(e)}${suffix}`
  const t = title(e)
  switch (style) {
    case 'apa': {
      // APA 7: a comma before "&" even with two authors; book titles in italics.
      const names = joinAuthors(p.map((x) => `${x.family}, ${x.initials.map((i) => `${i}.`).join(' ').replace(/ -/g, '-')}`.trim()), ', & ')
      const book = e.type === 'book' || e.type === 'manual'
      return [{ text: `${names || e.key} (${y}). ` }, { text: `${t}.`, italic: book }, ...containerSegs(e, style), ...(url ? [{ text: ` ${url}` }] : [])]
    }
    case 'springer': {
      const names = p.map((x) => `${x.family} ${x.initials.join('')}`).join(', ')
      return [{ text: `${names || e.key} (${y}) ${t}.` }, ...containerSegs(e, style), ...(url ? [{ text: `. ${url}` }] : [{ text: '' }])]
    }
    case 'numeric': {
      const names = p.map((x) => `${x.initials.map((i) => `${i}.`).join('')} ${x.family}`).join(', ')
      const tail = containerSegs(e, style)
      return [{ text: `${names || e.key}, ${t}` }, ...(tail.length ? tail : [{ text: ` (${year(e)}).` }]), ...(url ? [{ text: ` ${url}` }] : [])]
    }
    default: {
      const names = p.map((x) => `${x.family}, ${x.initials.map((i) => `${i}.`).join('')}`).join(', ')
      return [{ text: `${names || e.key}, ${y}. ${t}.` }, ...containerSegs(e, style), ...(url ? [{ text: ` ${url}` }] : [])]
    }
  }
}

export interface Citer {
  style: CitationStyle
  /** In-text citation for a `[@a; @b]` group (without the brackets). */
  cite: (group: string) => string
  /** Cited entries in reference-list order. */
  references: BibEntry[]
  /** Formatted reference, as segments (italics for APA). */
  format: (e: BibEntry) => Seg[]
  /** Formatted reference as plain text; `md` wraps italics in asterisks. */
  formatText: (e: BibEntry, md?: boolean) => string
  /** Label shown before each reference ("[3] ") for numbered styles. */
  label: (e: BibEntry) => string
}

/**
 * Builds a citer for the cited keys in `texts` (in document order). Missing keys show as "key?" so they are easy to
 * spot. Author–year styles add a/b suffixes when two references share authors and year.
 */
export function makeCiter(style: CitationStyle, entries: BibEntry[], texts: string[]): Citer {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const order: string[] = []
  for (const t of texts) for (const m of t.matchAll(CITE_RE)) for (const k of citeKeys(m[1])) if (!order.includes(k)) order.push(k)
  const cited = order.map((k) => byKey.get(k)).filter((e): e is BibEntry => !!e)

  const sortKey = (e: BibEntry) => `${people(e).map((p) => p.family).join(' ') || e.key} ${year(e)} ${title(e)}`.toLowerCase()
  const references = style === 'numeric' ? cited : [...cited].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

  // a/b suffixes for identical author–year labels.
  const suffix = new Map<string, string>()
  if (style !== 'numeric') {
    const groups = new Map<string, BibEntry[]>()
    for (const e of references) {
      const k = `${inTextNames(e, 'and')}|${year(e)}`
      groups.set(k, [...(groups.get(k) ?? []), e])
    }
    for (const g of groups.values()) if (g.length > 1) g.forEach((e, i) => suffix.set(e.key, String.fromCharCode(97 + i)))
  }
  const number = new Map(cited.map((e, i) => [e.key, i + 1]))

  const cite = (group: string): string => {
    const keys = citeKeys(group)
    if (style === 'numeric') {
      const nums = [...new Set(keys.map((k) => number.get(k) ?? NaN))]
      const known = nums.filter(Number.isFinite).sort((a, b) => a - b)
      const missing = keys.filter((k) => !number.has(k)).map((k) => `${k}?`)
      // Compress runs of three or more: [2–4].
      const parts: string[] = []
      for (let i = 0; i < known.length; ) {
        let j = i
        while (j + 1 < known.length && known[j + 1] === known[j] + 1) j++
        parts.push(j - i >= 2 ? `${known[i]}–${known[j]}` : known.slice(i, j + 1).join(', '))
        i = j + 1
      }
      return `[${[...parts, ...missing].join(', ')}]`
    }
    const sep = style === 'springer' ? ' ' : ', '
    const and = style === 'apa' ? '&' : 'and'
    const items = keys.map((k) => {
      const e = byKey.get(k)
      return e ? `${inTextNames(e, and)}${sep}${year(e)}${suffix.get(k) ?? ''}` : `${k}?`
    })
    return `(${items.join('; ')})`
  }

  const format = (e: BibEntry) => referenceSegs(e, style, suffix.get(e.key) ?? '')
  return {
    style,
    cite,
    references,
    format,
    formatText: (e, md = false) => format(e).map((s) => (md && s.italic ? `*${s.text}*` : s.text)).join('').replace(/\s+/g, ' ').trim(),
    label: (e) => (style === 'numeric' ? `[${number.get(e.key)}] ` : ''),
  }
}

/** Default style of a publisher's journals. */
export function defaultStyle(publisher: 'Elsevier' | 'Springer'): CitationStyle {
  return publisher === 'Springer' ? 'springer' : 'harvard'
}
