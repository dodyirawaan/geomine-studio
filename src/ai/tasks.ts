// AI tasks that can each use their own model, and which model to suggest for each to save tokens and quota.
import type { ModelInfo, ProviderId } from './types'

/** light: short classification or extraction, repeated many times. standard: reading and reasoning. writing: publication prose. */
export type Tier = 'light' | 'standard' | 'writing'

export type TaskId =
  | 'screening'
  | 'eligibility'
  | 'extraction'
  | 'appraisal'
  | 'matrix'
  | 'synthesis'
  | 'ask'
  | 'protocol'
  | 'reviewWriting'
  | 'pipeline'
  | 'consistency'
  | 'vlabReport'
  | 'topicIdeas'

export const TASKS: Record<TaskId, { label: string; tier: Tier }> = {
  screening: { label: 'Title/abstract screening', tier: 'light' },
  eligibility: { label: 'Full-text eligibility', tier: 'light' },
  extraction: { label: 'Data extraction', tier: 'light' },
  appraisal: { label: 'Quality appraisal', tier: 'light' },
  matrix: { label: 'Literature matrix', tier: 'light' },
  synthesis: { label: 'Literature synthesis', tier: 'writing' },
  ask: { label: 'Ask your library', tier: 'standard' },
  protocol: { label: 'Review protocol', tier: 'standard' },
  reviewWriting: { label: 'Review writing', tier: 'writing' },
  pipeline: { label: 'Manuscript pipeline', tier: 'writing' },
  consistency: { label: 'Consistency check', tier: 'standard' },
  vlabReport: { label: 'Virtual Lab report', tier: 'standard' },
  topicIdeas: { label: 'Review topic titles', tier: 'light' },
}

const WHY: Record<Tier, string> = {
  light: 'a small, fast model is enough for short structured answers repeated over many records',
  standard: 'a mid-size model reads and reasons well at a fraction of the cost of the largest models',
  writing: 'a strong model for publication prose, without the price of the very largest one',
}

/** Preferred model families per provider and tier, best first. OpenRouter ids carry a vendor prefix. */
const PREFS: Record<Exclude<ProviderId, 'openrouter'>, Record<Tier, RegExp[]>> = {
  anthropic: {
    light: [/haiku/],
    standard: [/sonnet/, /haiku/],
    writing: [/sonnet/, /opus/],
  },
  gemini: {
    light: [/flash-lite/, /flash(?!-lite)/],
    standard: [/flash(?!-lite)/, /pro/],
    writing: [/pro/, /flash(?!-lite)/],
  },
  openai: {
    light: [/^gpt-[\d.]+-nano/, /^gpt-[\d.]+-mini/, /^gpt-4o-mini/],
    standard: [/^gpt-[\d.]+-mini/, /^gpt-4o-mini/],
    writing: [/^gpt-[\d.]+$/, /^gpt-[\d.]+-chat/, /^gpt-4o$/],
  },
}

const SKIP = /(tts|image|audio|live|embed|vision|computer|search|realtime|transcribe|codex|deep-research|robotics|learnlm|gemma)/i
const UNSTABLE = /(preview|exp|experimental|latest)/i

/** Version numbers in an id (dates left out), for picking the newest of a family. */
function version(id: string): number[] {
  return (id.match(/\d+/g) ?? []).filter((n) => n.length < 6).map(Number)
}

function newer(a: string, b: string): number {
  const va = version(a)
  const vb = version(b)
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? 0) - (va[i] ?? 0)
    if (d) return d
  }
  return a.length - b.length
}

/** The model to suggest for a task from the provider's list, or null when the list has nothing suitable. */
export function suggestModel(provider: ProviderId, tier: Tier, models: ModelInfo[], current: string): { id: string; why: string } | null {
  const vendor = provider === 'openrouter' ? (current.split('/')[0] as string) : ''
  const prefs = provider === 'openrouter' ? PREFS[vendor === 'google' ? 'gemini' : vendor === 'openai' ? 'openai' : 'anthropic'][tier] : PREFS[provider][tier]
  // On OpenRouter stay with the vendor and with free models when the current model is one.
  const free = current.endsWith(':free')
  const pool = models.filter(
    (m) => !SKIP.test(m.id) && (provider !== 'openrouter' || (m.id.startsWith(`${vendor}/`) && m.id.endsWith(':free') === free)),
  )
  for (const re of prefs) {
    const local = (id: string) => (provider === 'openrouter' ? id.slice(id.indexOf('/') + 1).replace(/:free$/, '') : id)
    const hits = pool.filter((m) => re.test(local(m.id))).sort((a, b) => Number(UNSTABLE.test(a.id)) - Number(UNSTABLE.test(b.id)) || newer(a.id, b.id))
    if (hits.length) return { id: hits[0].id, why: WHY[tier] }
  }
  return null
}
