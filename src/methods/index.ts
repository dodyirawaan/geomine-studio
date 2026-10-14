import { parseBibtex } from '../manuscript/bibtex'
import { db } from '../store/db'
import { gsi, qSystem, rmr89 } from './classification'
import { METHOD_REFS } from './refs'
import { rockburstMethod } from './rockburst'
import { hoekBrownMethod } from './strength'
import { ccmMethod, dynamicMethod, stabilityMethod } from './support'
import { optionLabel, type Category, type Method, type Result, type Values } from './types'

export const METHODS: Method[] = [rmr89, qSystem, gsi, hoekBrownMethod, rockburstMethod, ccmMethod, dynamicMethod, stabilityMethod]

export const CATEGORIES: Category[] = ['Rock mass classification', 'Strength & deformability', 'Stress & rockburst', 'Support design']

/** Inputs and results as a Markdown table for the manuscript. */
export function parameterTable(m: Method, v: Values, r: Result): string {
  // Optional inputs left at 0 ("Leave 0 to …", "0 to skip") were not used, so they are not reported.
  const used = m.inputs.filter((i) => !(i.kind === 'number' && Number(v[i.id]) === 0 && /\b0 to\b|Leave 0/.test(i.help ?? '')))
  const inputs = used.map((i) => {
    const val = i.kind === 'select' ? optionLabel(m, i.id, v[i.id]) : String(v[i.id])
    return `| ${i.label} | ${val}${i.kind === 'number' && i.unit ? ` ${i.unit}` : ''} |`
  })
  const outputs = r.outputs.map((o) => `| **${o.label}** | **${o.value}${o.unit ? ` ${o.unit}` : ''}** |`)
  return `| Parameter | Value |\n|:--|--:|\n${[...inputs, ...outputs].join('\n')}\n\nTable [X]. ${m.name}: input parameters and results.`
}

export function fullMethodsText(m: Method, v: Values, r: Result, withTable: boolean): string {
  const text = m.methodsText(v, r)
  return withTable ? `${text}\n\n${parameterTable(m, v, r)}` : text
}

/**
 * Appends the text to a manuscript section and adds the BibTeX entries it cites that the manuscript lacks.
 * Returns the number of references added.
 */
export async function insertIntoManuscript(manuscriptId: string, sectionId: string, text: string, refKeys: string[]): Promise<number> {
  const m = await db.manuscripts.get(manuscriptId)
  if (!m) throw new Error('Manuscript not found')
  const have = new Set(parseBibtex(m.bibtex).map((e) => e.key))
  const cited = refKeys.filter((k) => text.includes(`@${k}`) && !have.has(k) && METHOD_REFS[k])
  const bibtex = cited.length ? `${m.bibtex.trimEnd()}${m.bibtex.trim() ? '\n\n' : ''}${cited.map((k) => METHOD_REFS[k]).join('\n\n')}\n` : m.bibtex
  await db.manuscripts.update(manuscriptId, {
    bibtex,
    sections: m.sections.map((s) => (s.id === sectionId ? { ...s, content: s.content.trim() ? `${s.content.trimEnd()}\n\n${text}` : text } : s)),
    updatedAt: Date.now(),
  })
  return cited.length
}
