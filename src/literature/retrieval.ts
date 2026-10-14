// Lexical retrieval (BM25) over PDF passages and abstracts. It needs no embedding API, so it works with every provider.
import type { Chunk } from '../store/db'

const STOP = new Set(
  'a an the and or of in on for to with by from at as is are was were be been this that these those it its into than then which who whom what when where how we our their there such can may also not no using used use based between within both each per via'.split(
    ' ',
  ),
)

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/** Splits page texts into ~1,200-character passages on paragraph or sentence boundaries. */
export function chunkPages(pages: string[], size = 1200): Omit<Chunk, 'paperId'>[] {
  const out: Omit<Chunk, 'paperId'>[] = []
  pages.forEach((text, i) => {
    const parts = text.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/)
    let buf = ''
    for (const p of parts) {
      if (buf && buf.length + p.length > size) {
        out.push({ page: i + 1, text: buf.trim() })
        buf = ''
      }
      buf += (buf ? ' ' : '') + p
    }
    if (buf.trim().length > 40) out.push({ page: i + 1, text: buf.trim() })
  })
  return out
}

export interface Passage {
  paperId: string
  /** 0 means the abstract. */
  page: number
  text: string
}

export function bm25(passages: Passage[], query: string, k = 8): (Passage & { score: number })[] {
  const q = [...new Set(tokenize(query))]
  if (!q.length || !passages.length) return []
  const docs = passages.map((p) => tokenize(p.text))
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) if (q.includes(t)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length
  const k1 = 1.4
  const b = 0.75
  return docs
    .map((d, i) => {
      const tf = new Map<string, number>()
      for (const t of d) if (df.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1)
      let score = 0
      for (const t of q) {
        const f = tf.get(t)
        if (!f) continue
        const n = df.get(t)!
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg))
      }
      return { ...passages[i], score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
