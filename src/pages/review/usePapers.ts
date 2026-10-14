import { useLiveQuery } from 'dexie-react-hooks'
import { includedRecords } from '../../review/prisma'
import { methodById } from '../../review/prompts'
import type { ReviewProject } from '../../review/types'
import { db, type Paper } from '../../store/db'

/** Library papers of the finally included studies (those already added to the library). */
export function useIncludedPapers(p: ReviewProject): { included: number; papers: Paper[] | undefined } {
  const m = methodById(p.method)
  const inc = includedRecords(p, m.fullText)
  const ids = inc.map((r) => r.paperId).filter(Boolean) as string[]
  const papers = useLiveQuery(async () => (await db.papers.bulkGet(ids)).filter((x): x is Paper => !!x), [ids.join(',')])
  return { included: inc.length, papers }
}
