// Requests for the literature matrix, its synthesis, and questions answered from the library.
import type { Paper } from '../store/db'
import type { Passage } from './retrieval'

export interface MatrixColumn {
  id: string
  label: string
  instruction: string
}

export const MATRIX_COLUMNS: MatrixColumn[] = [
  { id: 'site', label: 'Site / depth', instruction: 'Mine or site, country, mining method, and depth (m).' },
  { id: 'rock', label: 'Rock & properties', instruction: 'Rock types and reported properties (UCS, E, GSI, RMR/Q, mi, in-situ stress, K ratio) with values and units.' },
  { id: 'problem', label: 'Problem', instruction: 'The engineering problem or research question.' },
  { id: 'method', label: 'Methods', instruction: 'Lab, field, numerical (software, constitutive model) and/or ML/DL methods (model types, inputs).' },
  { id: 'data', label: 'Data', instruction: 'Data source, number of cases/events/samples, monitoring period, train/test split and validation.' },
  { id: 'findings', label: 'Key findings', instruction: 'Main quantitative findings with values exactly as reported (e.g. accuracy, energy, displacement).' },
  { id: 'limitations', label: 'Limitations', instruction: 'Limitations stated by the authors or evident from the method (e.g. small dataset, no external validation).' },
  { id: 'relevance', label: 'Relevance', instruction: 'How the paper relates to the researcher\'s topic (given below), in one sentence.' },
]

const MAX_FULLTEXT = 60000

export function matrixRequest(p: Paper, source: { kind: 'abstract' } | { kind: 'fulltext'; text: string }, topic: string): string {
  const cols = MATRIX_COLUMNS.map((c) => `- "${c.id}": ${c.instruction}`).join('\n')
  const body =
    source.kind === 'fulltext'
      ? `## Full text (extracted from PDF${source.text.length > MAX_FULLTEXT ? ', truncated' : ''})\n${source.text.slice(0, MAX_FULLTEXT)}`
      : `## Abstract\n${p.abstract ?? '(no abstract available)'}`
  return `Extract a literature-matrix row for this paper.

## Paper
${p.title}
${p.authors.slice(0, 6).join(', ')}${p.authors.length > 6 ? ' et al.' : ''} (${p.year ?? 'n.d.'}). ${p.venue ?? ''}${p.doi ? ` https://doi.org/${p.doi}` : ''}

${body}

## Researcher's topic
${topic.trim() || '(not given — write "n/a" for relevance)'}

## Output
Return only a JSON object with exactly these string fields:
${cols}

Rules: use only information in the text above. Write "not reported" when the text does not say. Keep each value under 60 words, keep numbers and units exactly as written, no Markdown.`
}

/** Parses the JSON object from a model reply that may include fences or extra prose. */
export function parseMatrixReply(text: string): Record<string, string> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The model did not return a JSON object.')
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  const row: Record<string, string> = {}
  for (const c of MATRIX_COLUMNS) {
    const v = raw[c.id]
    row[c.id] = Array.isArray(v) ? v.join('; ') : v == null ? 'not reported' : String(v)
  }
  return row
}

export function matrixMarkdown(papers: Paper[]): string {
  const head = `| Study | ${MATRIX_COLUMNS.map((c) => c.label).join(' | ')} |\n|${'---|'.repeat(MATRIX_COLUMNS.length + 1)}`
  const rows = papers.map(
    (p) => `| [@${p.bibKey}] | ${MATRIX_COLUMNS.map((c) => (p.matrix?.[c.id] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`,
  )
  return [head, ...rows].join('\n')
}

export function synthesisRequest(papers: Paper[], topic: string): string {
  return `Here is a literature matrix of ${papers.length} studies${topic.trim() ? ` for a manuscript on: ${topic.trim()}` : ''}.

${matrixMarkdown(papers)}

Write a critical synthesis for the researcher:
1. Main themes and how approaches have evolved (cite studies as [@key]).
2. Points of agreement and contradiction, with likely reasons (site conditions, methods, data).
3. Methodological weaknesses common across the set.
4. Concrete research gaps that a Q1 paper could address, ranked by defensibility.
5. A draft "state of the art → gap" paragraph for an Introduction, citing only these studies with [@key].

Base every statement on the matrix. Where the matrix says "not reported", do not fill it in.`
}

export function askRequest(question: string, passages: (Passage & { key: string })[]): string {
  const ctx = passages
    .map((p, i) => `[S${i + 1}] @${p.key}, ${p.page === 0 ? 'abstract' : `p. ${p.page}`}\n${p.text}`)
    .join('\n\n')
  return `Answer the question using only the source passages below, which were retrieved from the researcher's own library.

## Sources
${ctx}

## Question
${question}

## Rules
- Support each claim with a citation in the form [@key, p. N] (or [@key, abstract]).
- If the passages do not contain the answer, say so plainly and suggest what to look for — do not answer from general knowledge without labelling it as such.
- Report numbers exactly as the sources give them.`
}
