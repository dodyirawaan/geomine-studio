// Minimal BibTeX reader: enough to list entries, resolve [@key] citations, and format an author–year reference list.

export interface BibEntry {
  key: string
  type: string
  fields: Record<string, string>
}

/** Matches `[@key]` and `[@a; @b]` citation groups in Markdown text. */
export const CITE_RE = /\[(@[^\]\s;]+(?:\s*;\s*@[^\]\s;]+)*)\]/g

export function citeKeys(group: string): string[] {
  return group
    .split(';')
    .map((k) => k.trim().replace(/^@/, ''))
    .filter(Boolean)
}

export function parseBibtex(src: string): BibEntry[] {
  const entries: BibEntry[] = []
  let i = 0
  while ((i = src.indexOf('@', i)) !== -1) {
    const head = /^@(\w+)\s*([{(])/.exec(src.slice(i))
    if (!head) {
      i++
      continue
    }
    const type = head[1].toLowerCase()
    const close = head[2] === '{' ? '}' : ')'
    let j = i + head[0].length
    const end = matchClose(src, j - 1, head[2], close)
    const body = src.slice(j, end)
    i = end + 1
    if (type === 'comment' || type === 'preamble' || type === 'string') continue

    const comma = body.indexOf(',')
    if (comma === -1) continue
    const key = body.slice(0, comma).trim()
    const fields: Record<string, string> = {}
    j = comma + 1
    while (j < body.length) {
      const m = /^\s*([\w-]+)\s*=\s*/.exec(body.slice(j))
      if (!m) break
      const name = m[1].toLowerCase()
      j += m[0].length
      let value: string
      if (body[j] === '{') {
        const e = matchClose(body, j, '{', '}')
        value = body.slice(j + 1, e)
        j = e + 1
      } else if (body[j] === '"') {
        const e = body.indexOf('"', j + 1)
        value = body.slice(j + 1, e === -1 ? body.length : e)
        j = e === -1 ? body.length : e + 1
      } else {
        const e = /[,\n}]/.exec(body.slice(j))
        value = body.slice(j, e ? j + e.index : body.length).trim()
        j += e ? e.index : body.length
      }
      fields[name] = clean(value)
      const next = body.indexOf(',', j)
      if (next === -1) break
      j = next + 1
    }
    if (key) entries.push({ key, type, fields })
  }
  return entries
}

function matchClose(s: string, openAt: number, open: string, close: string): number {
  let depth = 0
  for (let k = openAt; k < s.length; k++) {
    if (s[k] === open) depth++
    else if (s[k] === close && --depth === 0) return k
  }
  return s.length
}

function clean(v: string): string {
  return v
    .replace(/\\&/g, '&')
    .replace(/\\(?:textit|textbf|emph)\{([^}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Family names of the authors, in order. */
export function familyNames(e: BibEntry): string[] {
  const raw = e.fields.author ?? e.fields.editor ?? ''
  if (!raw) return []
  return raw.split(/\s+and\s+/i).map((a) => {
    const name = a.trim()
    if (name.includes(',')) return name.split(',')[0].trim()
    const parts = name.split(/\s+/)
    return parts[parts.length - 1]
  })
}

/** In-text label, e.g. "Hoek and Brown, 2019" or "Cai et al., 2021". */
export function citeLabel(e: BibEntry): string {
  const names = familyNames(e)
  const year = e.fields.year ?? 'n.d.'
  const who =
    names.length === 0 ? e.key : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} et al.`
  return `${who}, ${year}`
}

export function formatCitation(group: string, byKey: Map<string, BibEntry>): string {
  const labels = citeKeys(group).map((k) => {
    const e = byKey.get(k)
    return e ? citeLabel(e) : `${k}?`
  })
  return `(${labels.join('; ')})`
}

function authorList(e: BibEntry): string {
  const raw = e.fields.author ?? e.fields.editor ?? ''
  const people = raw.split(/\s+and\s+/i).filter(Boolean).map((a) => {
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
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((g) => `${g[0]}.`)
      .join(' ')
    return initials ? `${family}, ${initials}` : family
  })
  if (people.length <= 1) return people[0] ?? ''
  return `${people.slice(0, -1).join(', ')}, ${people[people.length - 1]}`
}

/** One reference-list entry in a neutral author–year style; journals restyle references on acceptance. */
export function formatReference(e: BibEntry): string {
  const f = e.fields
  const parts = [`${authorList(e) || e.key}, ${f.year ?? 'n.d.'}.`, `${f.title ?? ''}.`]
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? f.school ?? f.institution
  if (venue) {
    let v = venue
    if (f.volume) v += ` ${f.volume}`
    if (f.number) v += `(${f.number})`
    if (f.pages) v += `, ${f.pages.replace(/-+/, '–')}`
    parts.push(`${v}.`)
  }
  if (f.doi) parts.push(`https://doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`)
  else if (f.url) parts.push(f.url)
  return parts.join(' ')
}

export function sortedReferences(entries: BibEntry[], cited: Set<string>): BibEntry[] {
  return entries
    .filter((e) => cited.has(e.key))
    .sort((a, b) => (familyNames(a)[0] ?? a.key).localeCompare(familyNames(b)[0] ?? b.key) || (a.fields.year ?? '').localeCompare(b.fields.year ?? ''))
}

export function citedKeys(texts: string[]): Set<string> {
  const keys = new Set<string>()
  for (const t of texts) for (const m of t.matchAll(CITE_RE)) citeKeys(m[1]).forEach((k) => keys.add(k))
  return keys
}
