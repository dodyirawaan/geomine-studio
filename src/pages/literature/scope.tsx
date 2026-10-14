import { useState } from 'react'
import { Select } from '../../components/ui'
import type { Paper } from '../../store/db'

/** Which library papers a Matrix or Ask run covers. */
export function useScope(papers: Paper[], selected: Set<string>) {
  const tags = [...new Set(papers.flatMap((p) => p.tags))].sort()
  const [scope, setScope] = useState(selected.size ? 'selected' : 'all')
  const inScope = papers.filter((p) =>
    scope === 'all' ? true : scope === 'selected' ? selected.has(p.id) : scope === 'pdf' ? !!p.pdfPages : p.tags.includes(scope.slice(4)),
  )
  const picker = (
    <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-auto" title="Which papers to use">
      <option value="all">All papers ({papers.length})</option>
      <option value="selected" disabled={!selected.size}>
        Selected in Library ({selected.size})
      </option>
      <option value="pdf">Papers with PDF ({papers.filter((p) => p.pdfPages).length})</option>
      {tags.map((t) => (
        <option key={t} value={`tag:${t}`}>
          Tag: {t} ({papers.filter((p) => p.tags.includes(t)).length})
        </option>
      ))}
    </Select>
  )
  return { inScope, picker }
}
