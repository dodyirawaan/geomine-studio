// Rule-based consistency checks over a whole manuscript. No AI: every finding is reproducible.
import { citedKeys, parseBibtex } from '../manuscript/bibtex'
import { countWords, highlightList, keywordList, publisherOf } from '../manuscript/templates'
import type { Manuscript, ManuscriptSection } from '../store/db'

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  category: string
  message: string
  sectionId?: string
  section?: string
  excerpt?: string
}

/** Text with math, code, citations and links removed, for word-level checks. */
export function proseOf(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[@[^\]]*\]/g, ' ')
    .replace(/\[(?:DATA NEEDED|VERIFY)[^\]]*\]/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, ' ')
}

function excerptAround(text: string, index: number, len = 40): string {
  const start = Math.max(0, index - len)
  const end = Math.min(text.length, index + len)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

const at = (s: ManuscriptSection) => ({ sectionId: s.id, section: s.title })

// ---------- individual checks ----------

function placeholders(m: Manuscript): Issue[] {
  const out: Issue[] = []
  const re = /\[(DATA NEEDED|VERIFY)[^\]]*\]|Table \[X\]|\[Caption\]|\[X\]/g
  for (const s of m.sections) {
    for (const match of s.content.matchAll(re)) {
      out.push({ severity: 'error', category: 'Placeholders', message: `Unresolved placeholder ${match[0].length > 60 ? match[0].slice(0, 60) + '…' : match[0]}`, ...at(s), excerpt: excerptAround(s.content, match.index!) })
    }
  }
  return out
}

function citations(m: Manuscript): Issue[] {
  const out: Issue[] = []
  const entries = parseBibtex(m.bibtex)
  const keys = new Set(entries.map((e) => e.key))
  const cited = citedKeys(m.sections.map((s) => s.content))
  for (const k of cited) {
    if (keys.has(k)) continue
    const s = m.sections.find((x) => x.content.includes(`@${k}`))
    out.push({ severity: 'error', category: 'Citations', message: `[@${k}] is cited but has no BibTeX entry`, ...(s ? at(s) : {}) })
  }
  const dups = entries.map((e) => e.key).filter((k, i, all) => all.indexOf(k) !== i)
  for (const k of new Set(dups)) out.push({ severity: 'warning', category: 'Citations', message: `Duplicate BibTeX key "${k}"` })
  const unused = entries.filter((e) => !cited.has(e.key))
  if (unused.length) out.push({ severity: 'info', category: 'Citations', message: `${unused.length} reference(s) in the library are never cited and will not be exported: ${unused.slice(0, 8).map((e) => e.key).join(', ')}${unused.length > 8 ? '…' : ''}` })
  if (!cited.size && m.sections.some((s) => s.role === 'body' && s.content.trim())) out.push({ severity: 'warning', category: 'Citations', message: 'The main text cites no references yet.' })
  return out
}

function expandNumbers(list: string): number[] {
  const nums: number[] = []
  for (const part of list.split(/\s*(?:,|and|&)\s*/)) {
    const range = /^(\d+)[a-z]?\s*[–-]\s*(\d+)/.exec(part)
    if (range) for (let i = Number(range[1]); i <= Number(range[2]) && i - Number(range[1]) < 50; i++) nums.push(i)
    else if (/^\d+/.test(part)) nums.push(parseInt(part, 10))
  }
  return nums
}

function figuresAndTables(m: Manuscript): Issue[] {
  const out: Issue[] = []
  const body = m.sections.filter((s) => s.role === 'body')
  const kinds = [
    { name: 'Figure', re: /\b(?:Fig(?:ure)?s?\.?)\s*(\d+[a-z]?(?:\s*(?:[–-]|,|and|&)\s*\d+[a-z]?)*)/gi },
    { name: 'Table', re: /\bTables?\s+(\d+[a-z]?(?:\s*(?:[–-]|,|and|&)\s*\d+[a-z]?)*)/g },
  ]
  for (const k of kinds) {
    const order: number[] = []
    for (const s of body) for (const match of proseOf(s.content).matchAll(k.re)) for (const n of expandNumbers(match[1])) if (!order.includes(n)) order.push(n)
    if (!order.length) continue
    const max = Math.max(...order)
    const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !order.includes(n))
    if (missing.length) out.push({ severity: 'warning', category: 'Figures & tables', message: `${k.name} ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} never referenced, but ${k.name} ${max} is.` })
    const outOfOrder = order.findIndex((n, i) => i > 0 && n < order[i - 1])
    if (outOfOrder > 0) out.push({ severity: 'warning', category: 'Figures & tables', message: `${k.name}s are first cited out of order (${order.join(', ')}); journals number them by first mention.` })
  }
  const mdTables = body.reduce((n, s) => n + (s.content.match(/^\s*\|?\s*:?-{2,}:?\s*\|/gm)?.length ?? 0), 0)
  const tableRefs = new Set<number>()
  for (const s of body) for (const match of proseOf(s.content).matchAll(kinds[1].re)) expandNumbers(match[1]).forEach((n) => tableRefs.add(n))
  if (mdTables > tableRefs.size) out.push({ severity: 'warning', category: 'Figures & tables', message: `The main text contains ${mdTables} table(s) but refers to only ${tableRefs.size} by number.` })
  return out
}

const KNOWN_ABBR = new Set(['SI', 'UK', 'USA', 'US', 'EU', 'CO2', 'DOI', 'ID', 'PDF', 'CPU', 'GPU', 'ISRM', 'ASTM', 'ISO', 'GB', 'TB', 'URL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'CRediT', 'NA', 'N/A', 'OK', 'AM', 'PM'])

function abbreviations(m: Manuscript): Issue[] {
  const out: Issue[] = []
  const parts: { scope: 'abstract' | 'main'; s: ManuscriptSection }[] = [
    ...m.sections.filter((s) => s.role === 'abstract').map((s) => ({ scope: 'abstract' as const, s })),
    ...m.sections.filter((s) => s.role === 'body').map((s) => ({ scope: 'main' as const, s })),
  ]
  for (const scope of ['abstract', 'main'] as const) {
    const defined = new Map<string, number>()
    const usedBefore = new Map<string, ManuscriptSection>()
    const used = new Map<string, ManuscriptSection>()
    for (const { s } of parts.filter((p) => p.scope === scope)) {
      const text = proseOf(s.content)
      const defs = [...text.matchAll(/\(([A-Z][A-Za-z0-9]*[A-Z0-9])s?\)/g)].filter((d) => /[A-Z].*[A-Z0-9]|^[A-Z]{2,}/.test(d[1]))
      const events: { i: number; abbr: string; def: boolean }[] = [
        ...defs.map((d) => ({ i: d.index!, abbr: d[1], def: true })),
        ...[...text.matchAll(/\b([A-Z][A-Z0-9]{1,7})s?\b/g)].map((u) => ({ i: u.index!, abbr: u[1], def: false })),
      ].sort((a, b) => a.i - b.i)
      for (const e of events) {
        if (KNOWN_ABBR.has(e.abbr) || /^[IVX]+$/.test(e.abbr) || /^\d/.test(e.abbr)) continue
        if (e.def) {
          defined.set(e.abbr, (defined.get(e.abbr) ?? 0) + 1)
        } else if (!text.slice(e.i - 1, e.i).includes('(')) {
          if (!used.has(e.abbr)) used.set(e.abbr, s)
          if (!defined.has(e.abbr) && !usedBefore.has(e.abbr)) usedBefore.set(e.abbr, s)
        }
      }
    }
    const where = scope === 'abstract' ? 'the Abstract' : 'the main text'
    const undefinedAbbr = [...used.keys()].filter((a) => !defined.has(a))
    if (undefinedAbbr.length) out.push({ severity: 'warning', category: 'Abbreviations', message: `Not defined in ${where}: ${undefinedAbbr.slice(0, 15).join(', ')}${undefinedAbbr.length > 15 ? '…' : ''}`, ...at(used.get(undefinedAbbr[0])!) })
    const early = [...usedBefore.keys()].filter((a) => defined.has(a))
    if (early.length) out.push({ severity: 'warning', category: 'Abbreviations', message: `Used before being defined in ${where}: ${early.join(', ')}`, ...at(usedBefore.get(early[0])!) })
    const twice = [...defined].filter(([, n]) => n > 1).map(([a]) => a)
    if (twice.length) out.push({ severity: 'info', category: 'Abbreviations', message: `Defined more than once in ${where}: ${twice.join(', ')}` })
  }
  return out
}

function units(m: Manuscript): Issue[] {
  const out: Issue[] = []
  for (const s of m.sections) {
    const text = proseOf(s.content)
    const noSpace = [...text.matchAll(/\b\d+(?:\.\d+)?(MPa|GPa|kPa|kN|MN|mm|cm|km|kg|kJ|MJ|Hz|kHz|m)(?![A-Za-z0-9²³])/g)]
    if (noSpace.length) out.push({ severity: 'warning', category: 'Units', message: `Missing space between number and unit (SI style is "120 MPa"): ${[...new Set(noSpace.map((x) => x[0]))].slice(0, 6).join(', ')}`, ...at(s) })
    const badCase = [...text.matchAll(/\b\d*\s?(Mpa|mpa|MPA|Gpa|gpa|GPA|KN|Kn|kpa|KPa|KPA|KJ|Kj)\b/g)]
    if (badCase.length) out.push({ severity: 'warning', category: 'Units', message: `Unit capitalisation: ${[...new Set(badCase.map((x) => x[1]))].join(', ')} (use MPa, GPa, kPa, kN, kJ)`, ...at(s) })
    const plainPower = [...text.matchAll(/\b(?:k?N|kJ|MJ|kg|t|m)\/(?:m|s)[23]\b/g)]
    if (plainPower.length) out.push({ severity: 'info', category: 'Units', message: `Write powers as superscripts: ${[...new Set(plainPower.map((x) => x[0]))].join(', ')} → e.g. kN/m³`, ...at(s) })
  }
  return out
}

const VARIANTS: [RegExp, RegExp, string][] = [
  [/\bmodell(?:ing|ed|er)s?\b/gi, /\bmodel(?:ing|ed|er)s?\b/gi, 'modelling / modeling'],
  [/\bbehaviours?\b/gi, /\bbehaviors?\b/gi, 'behaviour / behavior'],
  [/\banalys(?:e|ed|es|ing)\b/gi, /\banalyz(?:e|ed|es|ing)\b/gi, 'analyse / analyze'],
  [/\bcharacteris(?:e|ed|es|ing|ation)\b/gi, /\bcharacteriz(?:e|ed|es|ing|ation)\b/gi, 'characterise / characterize'],
  [/\boptimis(?:e|ed|es|ing|ation)\b/gi, /\boptimiz(?:e|ed|es|ing|ation)\b/gi, 'optimise / optimize'],
  [/\bnormalis(?:e|ed|es|ing|ation)\b/gi, /\bnormaliz(?:e|ed|es|ing|ation)\b/gi, 'normalise / normalize'],
  [/\bgeneralis(?:e|ed|es|ing|ation)\b/gi, /\bgeneraliz(?:e|ed|es|ing|ation)\b/gi, 'generalise / generalize'],
  [/\butilis(?:e|ed|es|ing|ation)\b/gi, /\butiliz(?:e|ed|es|ing|ation)\b/gi, 'utilise / utilize'],
  [/\bcentres?\b/gi, /\bcenters?\b/gi, 'centre / center'],
  [/\bmetres?\b/gi, /\bmeters?\b/gi, 'metre / meter'],
  [/\bfibres?\b/gi, /\bfibers?\b/gi, 'fibre / fiber'],
  [/\bcolours?\b/gi, /\bcolors?\b/gi, 'colour / color'],
  [/\blabell(?:ed|ing)\b/gi, /\blabel(?:ed|ing)\b/gi, 'labelled / labeled'],
  [/\bfavourabl[ey]\b/gi, /\bfavorabl[ey]\b/gi, 'favourable / favorable'],
]

function spelling(m: Manuscript): Issue[] {
  const text = proseOf(m.sections.filter((s) => s.role !== 'keywords').map((s) => s.content).join('\n'))
  const mixed: string[] = []
  let uk = 0
  let us = 0
  for (const [ukRe, usRe, label] of VARIANTS) {
    const a = text.match(ukRe)?.length ?? 0
    const b = text.match(usRe)?.length ?? 0
    uk += a
    us += b
    if (a && b) mixed.push(`${label} (${a}/${b})`)
  }
  const out: Issue[] = []
  if (mixed.length) out.push({ severity: 'warning', category: 'Spelling', message: `Both spellings used: ${mixed.join('; ')}` })
  else if (uk && us) out.push({ severity: 'info', category: 'Spelling', message: `Mixed British (${uk}) and American (${us}) spelling across different words; pick one as the journal requires.` })
  const doubled = [...text.matchAll(/\b(\w{2,})\s+\1\b/gi)].filter((x) => !/^\d+$/.test(x[1]))
  if (doubled.length) out.push({ severity: 'warning', category: 'Spelling', message: `Repeated words: ${[...new Set(doubled.map((x) => x[0].toLowerCase()))].slice(0, 5).join(', ')}` })
  return out
}

/** Numbers with a decimal point, percentage or unit — the kind of value a summary must not invent. */
const VALUE_RE = /(?<![\w.])(\d+(?:\.\d+)?)\s?(%|MPa|GPa|kPa|kJ\/m[²³23]|kJ|MJ|m\/s|mm|cm|m|°|kN)?(?![\w.])/g

function summaryNumbers(m: Manuscript): Issue[] {
  const out: Issue[] = []
  const main = proseOf(m.sections.filter((s) => s.role === 'body' && !/^conclusions?$/i.test(s.title.trim())).map((s) => s.content).join('\n'))
  const mainAll = main + ' ' + m.sections.filter((s) => s.role === 'body').map((s) => s.content).join(' ')
  const summaries = m.sections.filter((s) => s.role === 'abstract' || s.role === 'highlights' || (s.role === 'body' && /^conclusions?$/i.test(s.title.trim())))
  for (const s of summaries) {
    const missing = new Set<string>()
    for (const match of proseOf(s.content).matchAll(VALUE_RE)) {
      const [whole, n, unit] = match
      const value = Number(n)
      if (!unit && !n.includes('.')) continue
      if (!unit && value >= 1900 && value <= 2100) continue
      if (!new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`).test(mainAll)) missing.add(whole.trim())
    }
    if (missing.size) out.push({ severity: 'warning', category: 'Numbers', message: `Values in ${s.title} not found in the main text: ${[...missing].slice(0, 10).join(', ')}`, ...at(s) })
  }
  return out
}

function structure(m: Manuscript): Issue[] {
  const out: Issue[] = []
  if (!m.title.trim()) out.push({ severity: 'error', category: 'Structure', message: 'The manuscript has no title.' })
  const authors = m.authors.filter((a) => a.name.trim())
  if (!authors.length) out.push({ severity: 'error', category: 'Structure', message: 'No authors listed.' })
  else {
    if (authors.some((a) => !a.affiliation.trim())) out.push({ severity: 'warning', category: 'Structure', message: 'Some authors have no affiliation.' })
    if (!authors.some((a) => a.corresponding && a.email?.trim())) out.push({ severity: 'warning', category: 'Structure', message: 'No corresponding author with an email address.' })
  }
  for (const s of m.sections) {
    if (!s.content.trim()) out.push({ severity: s.role === 'back' ? 'warning' : 'error', category: 'Structure', message: `"${s.title}" is empty.`, ...at(s) })
  }
  const abs = m.sections.find((s) => s.role === 'abstract')
  if (abs?.content.trim()) {
    const w = countWords(abs.content)
    if (w > 250) out.push({ severity: 'info', category: 'Structure', message: `Abstract has ${w} words; many journals limit it to about 250 — confirm in the Guide for Authors.`, ...at(abs) })
    if (abs.content.trim().split(/\n\s*\n/).length > 1) out.push({ severity: 'info', category: 'Structure', message: 'Abstract has more than one paragraph; most journals expect one.', ...at(abs) })
  }
  const kw = keywordList(m)
  const kwSec = m.sections.find((s) => s.role === 'keywords')
  if (kwSec && kw.length && (kw.length < 3 || kw.length > 7)) out.push({ severity: 'warning', category: 'Structure', message: `${kw.length} keywords; most journals ask for 3–7 (often up to 6).`, ...at(kwSec) })
  const hlSec = m.sections.find((s) => s.role === 'highlights')
  if (hlSec && publisherOf(m.journal) === 'Elsevier' && hlSec.content.trim()) {
    const hl = highlightList(m)
    if (hl.length < 3 || hl.length > 5) out.push({ severity: 'warning', category: 'Structure', message: `${hl.length} highlights; Elsevier asks for 3–5.`, ...at(hlSec) })
    const long = hl.filter((h) => h.length > 85)
    if (long.length) out.push({ severity: 'error', category: 'Structure', message: `${long.length} highlight(s) exceed 85 characters.`, ...at(hlSec), excerpt: long[0] })
  }
  return out
}

function readability(m: Manuscript): Issue[] {
  const out: Issue[] = []
  for (const s of m.sections.filter((x) => x.role === 'body' || x.role === 'abstract')) {
    const sentences = proseOf(s.content)
      .replace(/^\s*[#|>-].*$/gm, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .filter((x) => x.split(/\s+/).length > 45)
    if (sentences.length) out.push({ severity: 'info', category: 'Readability', message: `${sentences.length} sentence(s) over 45 words.`, ...at(s), excerpt: sentences[0].slice(0, 120) + '…' })
  }
  return out
}

export function checkManuscript(m: Manuscript): Issue[] {
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  return [
    ...structure(m),
    ...placeholders(m),
    ...citations(m),
    ...figuresAndTables(m),
    ...numbersSafe(m),
    ...abbreviations(m),
    ...units(m),
    ...spelling(m),
    ...readability(m),
  ].sort((a, b) => order[a.severity] - order[b.severity])
}

// Lookbehind support is universal in current browsers, but keep one bad regex from breaking the whole report.
function numbersSafe(m: Manuscript): Issue[] {
  try {
    return summaryNumbers(m)
  } catch {
    return []
  }
}
