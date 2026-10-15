import { Lightbulb } from 'lucide-react'
import { suggestModel } from '../ai/tasks'
import type { LLM } from '../ai/useLLM'
import { Select } from './ui'
import { useModelList } from './useModelList'

const short = (id: string) => id.replace(/^[^/]+\//, '')

/** Model for one AI button: pick any model of the provider for this task, with a suggestion that saves tokens. */
export function TaskModel({ llm, className = '' }: { llm: LLM; className?: string }) {
  const { models } = useModelList(llm.provider, llm.apiKey)
  if (llm.missing && !llm.defaultModel) return null
  const tip = suggestModel(llm.provider, llm.tier, models, llm.model)
  const listed = models.some((m) => m.id === llm.taskModel)

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className}`}>
      <label className="flex items-center gap-1.5 text-stone-500">
        Model
        <Select value={llm.taskModel} onChange={(e) => llm.setModel(e.target.value)} className="min-h-7 w-auto max-w-64 px-1.5 py-0.5 text-xs" title="Model for this task">
          <option value="">Default · {short(llm.defaultModel) || 'none'}</option>
          {llm.taskModel && !listed && <option value={llm.taskModel}>{short(llm.taskModel)}</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name && m.name !== m.id ? m.name : short(m.id)}
            </option>
          ))}
        </Select>
      </label>
      {tip &&
        (tip.id === llm.model ? (
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400" title={tip.why}>
            <Lightbulb className="h-3.5 w-3.5" /> Economical choice for this task
          </span>
        ) : (
          <button type="button" className="flex items-center gap-1 text-amber-800 hover:underline dark:text-amber-400" title={tip.why} onClick={() => llm.setModel(tip.id)}>
            <Lightbulb className="h-3.5 w-3.5" /> Suggested: {short(tip.id)} — {tip.why}
          </button>
        ))}
    </div>
  )
}
