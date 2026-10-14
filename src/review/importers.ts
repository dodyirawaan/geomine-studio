// Imports records exported from Scopus, Web of Science and similar databases (BibTeX or RIS) into a review.
import { parseBibtex } from '../manuscript/bibtex'
import { bareDoi, type PaperMeta } from '../literature/openalex'

function nameFromBib(a: string): string {
  // "Family, Given" → "Given Family"
  const [family, given] = a.split(',').map((x) => x.trim())
  return given ? `${given} ${family}` : family
}

export function fromBibtex(text: string): PaperMeta[] {
  return parseBibtex(text)
    .filter((e) => e.fields.title)
    .map((e) => {
      const f = e.fields
      return {
        title: f.title,
        authors: (f.author ?? '').split(/\s+and\s+/i).filter(Boolean).map(nameFromBib),
        year: Number(f.year) || undefined,
        venue: f.journal ?? f.booktitle,
        volume: f.volume,
        issue: f.number,
        pages: f.pages?.replace(/-+/, '–'),
        abstract: f.abstract,
        doi: f.doi ? bareDoi(f.doi) : undefined,
        url: f.doi ? `https://doi.org/${bareDoi(f.doi)}` : f.url,
      }
    })
}

export function fromRis(text: string): PaperMeta[] {
  const out: PaperMeta[] = []
  let cur: Record<string, string[]> = {}
  const flush = () => {
    const g = (k: string) => cur[k]?.[0]
    const title = g('TI') ?? g('T1')
    if (title) {
      const doi = g('DO')
      out.push({
        title,
        authors: [...(cur.AU ?? []), ...(cur.A1 ?? [])].map(nameFromBib),
        year: Number((g('PY') ?? g('Y1') ?? '').slice(0, 4)) || undefined,
        venue: g('T2') ?? g('JO') ?? g('JF'),
        volume: g('VL'),
        issue: g('IS'),
        pages: g('SP') ? `${g('SP')}${g('EP') ? `–${g('EP')}` : ''}` : undefined,
        abstract: g('AB') ?? g('N2'),
        doi: doi ? bareDoi(doi) : undefined,
        url: doi ? `https://doi.org/${bareDoi(doi)}` : g('UR'),
      })
    }
    cur = {}
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9]) {2}- ?(.*)$/.exec(line)
    if (!m) continue
    if (m[1] === 'ER') flush()
    else (cur[m[1]] ??= []).push(m[2].trim())
  }
  if (Object.keys(cur).length) flush()
  return out
}

/** Detects the format and parses an export file. */
export function parseExport(text: string): PaperMeta[] {
  return /^TY {2}- /m.test(text) ? fromRis(text) : fromBibtex(text)
}
