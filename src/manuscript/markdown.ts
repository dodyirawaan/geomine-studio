import type { Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

/** Parse section Markdown (GFM tables, `$…$` math) into an mdast tree for the exporters. */
export function parseMarkdown(text: string): Root {
  return parser.parse(text) as Root
}

/** Hierarchical numbers for body sections and their `##`/`###` subsections (1, 1.1, 1.1.1). */
export class SectionCounter {
  private n = [0, 0, 0]

  next(level: 1 | 2 | 3): string {
    this.n[level - 1]++
    for (let i = level; i < 3; i++) this.n[i] = 0
    return this.n.slice(0, level).join('.')
  }
}

/** Markdown `#`/`##` inside a section become subsections; `###` and deeper become sub-subsections. */
export function subLevel(depth: number): 2 | 3 {
  return depth <= 2 ? 2 : 3
}
