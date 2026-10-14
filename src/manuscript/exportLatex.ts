// LaTeX project for the publisher's class: elsarticle (Elsevier) or sn-jnl (Springer Nature), plus references.bib.
import JSZip from 'jszip'
import type { List, PhrasingContent, RootContent, Table } from 'mdast'
import { JOURNALS } from '../ai/prompts'
import type { Author, Manuscript } from '../store/db'
import { CITE_RE, citeKeys } from './bibtex'
import { parseMarkdown, subLevel } from './markdown'
import { highlightList, keywordList, publisherOf } from './templates'

// pdflatex cannot typeset these Unicode characters in text mode. Math symbols are grouped into one $…$ run
// so that "σ₁" becomes $\sigma_{1}$ rather than two adjacent math shifts.
const MATH: Record<string, string> = {
  α: '\\alpha ', β: '\\beta ', γ: '\\gamma ', δ: '\\delta ', ε: '\\varepsilon ', η: '\\eta ', θ: '\\theta ', κ: '\\kappa ',
  λ: '\\lambda ', μ: '\\mu ', ν: '\\nu ', π: '\\pi ', ρ: '\\rho ', σ: '\\sigma ', τ: '\\tau ', φ: '\\varphi ', ϕ: '\\phi ',
  ψ: '\\psi ', ω: '\\omega ', Δ: '\\Delta ', Σ: '\\Sigma ', Φ: '\\Phi ', Ω: '\\Omega ', '≤': '\\le ', '≥': '\\ge ',
  '±': '\\pm ', '×': '\\times ', '≈': '\\approx ', '→': '\\rightarrow ', '·': '\\cdot ', '−': '-', '∞': '\\infty ', '≳': '\\gtrsim ', '½': '\\tfrac{1}{2}', '⅓': '\\tfrac{1}{3}', '¼': '\\tfrac{1}{4}', '¾': '\\tfrac{3}{4}', '≲': '\\lesssim ', '≠': '\\neq ', '√': '\\surd ',
  '°': '^{\\circ}', '¹': '^{1}', '²': '^{2}', '³': '^{3}', '⁻': '^{-}',
  '₀': '_{0}', '₁': '_{1}', '₂': '_{2}', '₃': '_{3}', '₄': '_{4}', '₅': '_{5}', '₆': '_{6}', '₇': '_{7}', '₈': '_{8}', '₉': '_{9}',
}
const TEXT: Record<string, string> = { '′': "'", '″': "''", '–': '--', '—': '---', '‘': '`', '’': "'", '“': '``', '”': "''", '\u00a0': '~' }

export function escapeLatex(s: string): string {
  return s
    .replace(/[\\{}&%$#_~^]/g, (c) =>
      c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : `\\${c}`,
    )
    .replace(/[^\p{ASCII}]+/gu, (run) => {
      let out = ''
      let math = ''
      for (const c of run) {
        if (c in MATH) {
          math += MATH[c]
          continue
        }
        if (math) out += `$${math.trim()}$`
        math = ''
        out += TEXT[c] ?? c
      }
      return math ? `${out}$${math.trim()}$` : out
    })
}

function textWithCitations(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(CITE_RE)) {
    out += escapeLatex(text.slice(last, m.index))
    out += `\\citep{${citeKeys(m[1]).join(',')}}`
    last = m.index! + m[0].length
  }
  return out + escapeLatex(text.slice(last))
}

function inline(nodes: PhrasingContent[]): string {
  return nodes.map(phrase).join('')
}

function phrase(n: PhrasingContent): string {
  switch (n.type) {
    case 'text':
      return textWithCitations(n.value)
    case 'emphasis':
      return `\\emph{${inline(n.children)}}`
    case 'strong':
      return `\\textbf{${inline(n.children)}}`
    case 'delete':
      return inline(n.children)
    case 'inlineCode':
      return `\\texttt{${escapeLatex(n.value)}}`
    case 'inlineMath':
      return `$${n.value}$`
    case 'break':
      return '\\\\\n'
    case 'link':
      return `\\href{${n.url.replace(/[%#]/g, (c) => `\\${c}`)}}{${inline(n.children)}}`
    case 'image':
      return `% Figure: ${n.alt ?? ''} (${n.url})\n`
    default:
      return 'children' in n ? inline(n.children as PhrasingContent[]) : ''
  }
}

function blocks(nodes: RootContent[], numbered: boolean): string {
  return nodes.map((n) => block(n, numbered)).filter(Boolean).join('\n\n')
}

function block(n: RootContent, numbered: boolean): string {
  switch (n.type) {
    case 'heading': {
      const cmd = subLevel(n.depth) === 2 ? 'subsection' : 'subsubsection'
      return `\\${cmd}${numbered ? '' : '*'}{${inline(n.children)}}`
    }
    case 'paragraph':
      return inline(n.children)
    case 'math':
      return `\\begin{equation}\n${n.value.trim()}\n\\end{equation}`
    case 'list':
      return list(n)
    case 'table':
      return table(n)
    case 'blockquote':
      return `\\begin{quote}\n${blocks(n.children, numbered)}\n\\end{quote}`
    case 'code':
      return `\\begin{verbatim}\n${n.value}\n\\end{verbatim}`
    case 'thematicBreak':
      return '\\bigskip'
    default:
      return ''
  }
}

function list(n: List): string {
  const env = n.ordered ? 'enumerate' : 'itemize'
  const items = n.children.map((it) => `  \\item ${blocks(it.children, true).replace(/\n/g, '\n  ')}`)
  return `\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}`
}

function table(n: Table): string {
  const cols = Math.max(...n.children.map((r) => r.children.length))
  const spec = Array.from({ length: cols }, (_, i) => (n.align?.[i] === 'center' ? 'c' : n.align?.[i] === 'right' ? 'r' : 'l')).join('')
  const rows = n.children.map((r) => Array.from({ length: cols }, (_, i) => (r.children[i] ? inline(r.children[i].children) : '')).join(' & ') + ' \\\\')
  return [
    '\\begin{table}[htbp]',
    '\\centering',
    '\\caption{[Caption]}',
    `\\begin{tabular}{${spec}}`,
    '\\toprule',
    rows[0],
    '\\midrule',
    ...rows.slice(1),
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n')
}

function md(text: string, numbered = true): string {
  return blocks(parseMarkdown(text).children, numbered)
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/)
  const sur = parts.pop() ?? ''
  return [parts.join(' '), sur]
}

function affiliationIndex(authors: Author[]): string[] {
  return [...new Set(authors.map((a) => a.affiliation.trim()).filter(Boolean))]
}

function elsevier(m: Manuscript): string {
  const journal = JOURNALS.find((j) => j.id === m.journal)
  const authors = m.authors.filter((a) => a.name.trim())
  const affs = affiliationIndex(authors)
  const authorTex = authors
    .map((a) => {
      const idx = affs.indexOf(a.affiliation.trim()) + 1
      return [
        `\\author[${idx || 1}]{${escapeLatex(a.name)}${a.corresponding ? '\\corref{cor1}' : ''}}`,
        a.email ? `\\ead{${a.email}}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
  const hl = highlightList(m)
  return `\\documentclass[preprint,12pt,authoryear]{elsarticle}

\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{lineno}
\\usepackage{hyperref}
\\linenumbers

\\journal{${escapeLatex(journal?.name ?? '[Journal]')}}

\\begin{document}

\\begin{frontmatter}

\\title{${escapeLatex(m.title)}}

${authorTex}
${authors.some((a) => a.corresponding) ? '\\cortext[cor1]{Corresponding author}' : ''}
${affs.map((a, i) => `\\affiliation[${i + 1}]{organization={${escapeLatex(a)}}}`).join('\n')}

\\begin{abstract}
${md(abstractOf(m))}
\\end{abstract}
${hl.length ? `\n\\begin{highlights}\n${hl.map((h) => `\\item ${md(h)}`).join('\n')}\n\\end{highlights}\n` : ''}
\\begin{keyword}
${keywordList(m).map(escapeLatex).join(' \\sep ')}
\\end{keyword}

\\end{frontmatter}

${bodyTex(m)}

${backTex(m, (t) => `\\section*{${escapeLatex(t)}}`)}

\\bibliographystyle{elsarticle-harv}
\\bibliography{references}

\\end{document}
`
}

function springer(m: Manuscript): string {
  const authors = m.authors.filter((a) => a.name.trim())
  const affs = affiliationIndex(authors)
  const corrAff = affs.indexOf(authors.find((a) => a.corresponding)?.affiliation.trim() ?? '')
  const authorTex = authors
    .map((a) => {
      const [fnm, sur] = splitName(a.name)
      const idx = affs.indexOf(a.affiliation.trim()) + 1
      return `\\author${a.corresponding ? '*' : ''}[${idx || 1}]{\\fnm{${escapeLatex(fnm)}} \\sur{${escapeLatex(sur)}}}${a.email ? `\\email{${a.email}}` : ''}`
    })
    .join('\n')
  const hl = highlightList(m)
  return `\\documentclass[pdflatex,sn-basic]{sn-jnl}

\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}

\\begin{document}

\\title{${escapeLatex(m.title)}}

${authorTex}

${affs.map((a, i) => `\\affil${i === corrAff ? '*' : ''}[${i + 1}]{\\orgname{${escapeLatex(a)}}}`).join('\n')}

\\abstract{${md(abstractOf(m))}}

\\keywords{${keywordList(m).map(escapeLatex).join(', ')}}

\\maketitle
${hl.length ? `\n% Highlights (submit as a separate file if the journal asks for them):\n${hl.map((h) => `% - ${h}`).join('\n')}\n` : ''}
${bodyTex(m)}

\\backmatter

\\section*{Declarations}

${backTex(m, (t) => `\\bmhead{${escapeLatex(t)}}`)}

\\bibliography{references}

\\end{document}
`
}

function abstractOf(m: Manuscript): string {
  return m.sections.find((s) => s.role === 'abstract')?.content ?? ''
}

function bodyTex(m: Manuscript): string {
  return m.sections
    .filter((s) => s.role === 'body')
    .map((s) => `\\section{${escapeLatex(s.title)}}\n\n${md(s.content)}`)
    .join('\n\n')
}

function backTex(m: Manuscript, head: (title: string) => string): string {
  return m.sections
    .filter((s) => s.role === 'back' && s.content.trim())
    .map((s) => `${head(s.title)}\n\n${md(s.content, false)}`)
    .join('\n\n')
}

export function manuscriptLatex(m: Manuscript): string {
  return publisherOf(m.journal) === 'Springer' ? springer(m) : elsevier(m)
}

export async function exportLatexZip(m: Manuscript): Promise<Blob> {
  const springerClass = publisherOf(m.journal) === 'Springer'
  const zip = new JSZip()
  zip.file('main.tex', manuscriptLatex(m))
  zip.file('references.bib', m.bibtex.trim() + '\n')
  zip.file(
    'README.txt',
    `Compile with: pdflatex main && bibtex main && pdflatex main && pdflatex main

This project expects the publisher's class file next to main.tex:
${springerClass
  ? '  sn-jnl.cls and sn-basic.bst from the Springer Nature LaTeX template\n  (https://www.springernature.com/gp/authors/campaigns/latex-author-support).'
  : '  elsarticle.cls and elsarticle-harv.bst (included in TeX Live/MiKTeX, or from\n  https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions).'}

Overleaf: upload this zip as a new project; the Elsevier class is already installed there.
Tables use booktabs; replace each [Caption] and add \\label{} as needed.
`,
  )
  return zip.generateAsync({ type: 'blob' })
}
