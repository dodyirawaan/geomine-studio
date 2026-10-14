// Word manuscript in a neutral submission layout: Times 12 pt, 1.5 spacing, continuous line numbers, page numbers.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  LineNumberRestartFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'
import type { List, PhrasingContent, RootContent, Table as MdTable } from 'mdast'
import { JOURNALS } from '../ai/prompts'
import type { Manuscript } from '../store/db'
import { CITE_RE } from './bibtex'
import type { Citer } from './citations'
import { parseMarkdown, SectionCounter, subLevel } from './markdown'
import { latexToOmml } from './omml'
import { citerFor, highlightList, keywordList } from './templates'

interface Fmt {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
}

class DocxBuilder {
  private eq = 0
  private citer: Citer
  constructor(citer: Citer) {
    this.citer = citer
  }

  inline(nodes: PhrasingContent[], fmt: Fmt = {}): ParagraphChild[] {
    return nodes.flatMap((n) => this.phrase(n, fmt))
  }

  private run(text: string, fmt: Fmt): TextRun {
    return new TextRun({
      text,
      bold: fmt.bold,
      italics: fmt.italics,
      strike: fmt.strike,
      font: fmt.code ? 'Courier New' : undefined,
    })
  }

  private phrase(n: PhrasingContent, fmt: Fmt): ParagraphChild[] {
    switch (n.type) {
      case 'text':
        return this.textWithCitations(n.value, fmt)
      case 'emphasis':
        return this.inline(n.children, { ...fmt, italics: true })
      case 'strong':
        return this.inline(n.children, { ...fmt, bold: true })
      case 'delete':
        return this.inline(n.children, { ...fmt, strike: true })
      case 'inlineCode':
        return [this.run(n.value, { ...fmt, code: true })]
      case 'inlineMath':
        return [latexToOmml(n.value)]
      case 'break':
        return [new TextRun({ break: 1 })]
      case 'link':
        return [new ExternalHyperlink({ link: n.url, children: this.inline(n.children, fmt) as TextRun[] })]
      case 'image':
        return [this.run(`[Figure: ${n.alt ?? n.url}]`, { ...fmt, italics: true })]
      default:
        return 'children' in n ? this.inline(n.children as PhrasingContent[], fmt) : []
    }
  }

  private textWithCitations(text: string, fmt: Fmt): TextRun[] {
    const out: TextRun[] = []
    let last = 0
    for (const m of text.matchAll(CITE_RE)) {
      if (m.index! > last) out.push(this.run(text.slice(last, m.index), fmt))
      out.push(this.run(this.citer.cite(m[1]), fmt))
      last = m.index! + m[0].length
    }
    if (last < text.length) out.push(this.run(text.slice(last), fmt))
    return out
  }

  blocks(nodes: RootContent[], counter: SectionCounter | null, listLevel = 0): (Paragraph | Table)[] {
    return nodes.flatMap((n) => this.block(n, counter, listLevel))
  }

  private block(n: RootContent, counter: SectionCounter | null, listLevel: number): (Paragraph | Table)[] {
    switch (n.type) {
      case 'heading': {
        const level = subLevel(n.depth)
        const num = counter ? `${counter.next(level)} ` : ''
        return [
          new Paragraph({
            heading: level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: [new TextRun(num), ...this.inline(n.children)],
          }),
        ]
      }
      case 'paragraph':
        return [new Paragraph({ children: this.inline(n.children), alignment: AlignmentType.JUSTIFIED })]
      case 'math':
        this.eq++
        return [
          new Paragraph({
            tabStops: [
              { type: TabStopType.CENTER, position: 4680 },
              { type: TabStopType.RIGHT, position: 9360 },
            ],
            children: [new TextRun('\t'), latexToOmml(n.value), new TextRun(`\t(${this.eq})`)],
          }),
        ]
      case 'list':
        return this.list(n, counter, listLevel)
      case 'table':
        return [this.table(n), new Paragraph({})]
      case 'blockquote':
        return this.blocks(n.children, counter, listLevel)
      case 'code':
        return n.value.split('\n').map((line) => new Paragraph({ children: [this.run(line, { code: true })] }))
      case 'thematicBreak':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } })]
      default:
        return []
    }
  }

  private list(n: List, counter: SectionCounter | null, level: number): Paragraph[] {
    const out: Paragraph[] = []
    for (const item of n.children) {
      item.children.forEach((child, idx) => {
        if (child.type === 'paragraph') {
          const bulletProps =
            idx === 0
              ? n.ordered
                ? { numbering: { reference: 'ordered', level, instance: this.listInstance(n) } }
                : { bullet: { level } }
              : { indent: { left: 720 * (level + 1) } }
          out.push(new Paragraph({ ...bulletProps, children: this.inline(child.children) }))
        } else if (child.type === 'list') {
          out.push(...this.list(child, counter, level + 1))
        } else {
          out.push(...(this.block(child, counter, level).filter((p) => p instanceof Paragraph) as Paragraph[]))
        }
      })
    }
    return out
  }

  private lists = new WeakMap<List, number>()
  private listCount = 0
  /** Each ordered list restarts at 1. */
  private listInstance(n: List): number {
    if (!this.lists.has(n)) this.lists.set(n, ++this.listCount)
    return this.lists.get(n)!
  }

  private table(n: MdTable): Table {
    const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    const cols = Math.max(...n.children.map((r) => r.children.length))
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      // Three-line table, as most journals require.
      borders: { top: border, bottom: border, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: n.children.map(
        (row, r) =>
          new TableRow({
            tableHeader: r === 0,
            children: Array.from({ length: cols }, (_, c) => {
              const cell = row.children[c]
              return new TableCell({
                borders: r === 0 ? { bottom: border } : undefined,
                children: [
                  new Paragraph({
                    alignment: n.align?.[c] === 'center' ? AlignmentType.CENTER : n.align?.[c] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: cell ? this.inline(cell.children, { bold: r === 0 }) : [],
                  }),
                ],
              })
            }),
          }),
      ),
    })
  }
}

export async function exportDocx(m: Manuscript): Promise<Blob> {
  const citer = citerFor(m)
  const b = new DocxBuilder(citer)
  const children: (Paragraph | Table)[] = []
  const heading1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })

  children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(m.title || 'Untitled manuscript')] }))

  // Authors with superscript affiliation numbers.
  const authors = m.authors.filter((a) => a.name.trim())
  const affiliations = [...new Set(authors.map((a) => a.affiliation.trim()).filter(Boolean))]
  if (authors.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: authors.flatMap((a, i) => {
          const idx = affiliations.indexOf(a.affiliation.trim()) + 1
          return [
            new TextRun(`${i ? ', ' : ''}${a.name}`),
            new TextRun({ text: `${idx ? idx : ''}${a.corresponding ? '*' : ''}`, superScript: true }),
          ]
        }),
      }),
    )
    affiliations.forEach((aff, i) =>
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `${i + 1}`, superScript: true }), new TextRun({ text: aff, italics: true, size: 20 })],
        }),
      ),
    )
    const corr = authors.find((a) => a.corresponding && a.email)
    if (corr) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `* Corresponding author: ${corr.email}`, size: 20 })] }))
  }

  const highlights = highlightList(m)
  if (highlights.length) {
    children.push(heading1('Highlights'))
    highlights.forEach((h) => children.push(new Paragraph({ bullet: { level: 0 }, children: b.inline(parseInline(h)) })))
  }

  const abstract = m.sections.find((s) => s.role === 'abstract')
  if (abstract?.content.trim()) {
    children.push(heading1('Abstract'))
    children.push(...b.blocks(parseMarkdown(abstract.content).children, null))
  }
  const keywords = keywordList(m)
  if (keywords.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Keywords: ', bold: true }), new TextRun(keywords.join('; '))] }))
  }

  const counter = new SectionCounter()
  for (const s of m.sections.filter((x) => x.role === 'body')) {
    children.push(heading1(`${counter.next(1)}. ${s.title}`))
    children.push(...b.blocks(parseMarkdown(s.content).children, counter))
  }
  for (const s of m.sections.filter((x) => x.role === 'back' && x.content.trim())) {
    children.push(heading1(s.title))
    children.push(...b.blocks(parseMarkdown(s.content).children, null))
  }

  const refs = citer.references
  if (refs.length) {
    children.push(heading1('References'))
    refs.forEach((e) =>
      children.push(
        new Paragraph({
          indent: { left: 720, hanging: 720 },
          spacing: { after: 80 },
          children: [new TextRun(citer.label(e)), ...citer.format(e).map((seg) => new TextRun({ text: seg.text, italics: seg.italic }))],
        }),
      ),
    )
  }

  const journal = JOURNALS.find((j) => j.id === m.journal)
  const doc = new Document({
    creator: authors[0]?.name || 'GeoMine Studio',
    title: m.title,
    description: journal ? `Manuscript for ${journal.name}` : undefined,
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } },
        title: { run: { font: 'Times New Roman', size: 32, bold: true } },
        heading1: { run: { font: 'Times New Roman', size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: 'Times New Roman', size: 24, bold: true, italics: true }, paragraph: { spacing: { before: 200, after: 100 } } },
        heading3: { run: { font: 'Times New Roman', size: 24, italics: true }, paragraph: { spacing: { before: 160, after: 80 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'ordered',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          lineNumbers: { countBy: 1, restart: LineNumberRestartFormat.CONTINUOUS },
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}

function parseInline(text: string): PhrasingContent[] {
  const first = parseMarkdown(text).children[0]
  return first?.type === 'paragraph' ? first.children : [{ type: 'text', value: text }]
}
