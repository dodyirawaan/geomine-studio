import { Card } from '../../components/ui'
import { methodById } from '../../review/prompts'
import type { ReviewMethodId } from '../../review/types'

const STEPS: { title: string; body: string; when?: (m: ReturnType<typeof methodById>) => boolean }[] = [
  {
    title: 'Protocol',
    body: 'Write the topic, then draft the protocol with AI and edit it: 2–4 precise research questions, the framework (PICO / PCC / scope), numbered inclusion (I1…) and exclusion (E1…) criteria that can be checked from a title and abstract, and 2–4 Boolean search strings with synonyms and spelling variants. Fix the protocol before screening — changing criteria afterwards must be reported.',
  },
  {
    title: 'Search',
    body: 'Run all search strings on OpenAlex. Each string returns up to the record limit; results are merged and duplicates removed by DOI, OpenAlex id and title. Add key papers found by citation chasing with "Add by DOI". Note the date of the final search — it goes into the Methods.',
  },
  {
    title: 'Title and abstract screening',
    body: 'Decide every record: Include, Maybe, or Exclude with the criterion code. Ask the AI for suggestions to speed up, then check them — accept in bulk only after spot-checking. Use the keyboard (I, E, M, arrows). Resolve every Maybe before writing.',
  },
  {
    title: 'Full-text eligibility',
    body: 'Open each included report and confirm it meets all criteria; give a reason for every exclusion (these appear in the PRISMA diagram).',
    when: (m) => m.fullText,
  },
  {
    title: 'Extraction',
    body: 'Add the included studies to the library (they get citation keys), attach PDFs where you have them, then extract site, rock, methods, data, findings and limitations with AI. Check each row against the paper — the extraction table becomes Table 1 of the review.',
  },
  {
    title: 'Quality appraisal',
    body: 'Score each study 0–2 on five criteria (aim, data, reproducible methods, validation, uncertainty). Use the scores to weigh evidence in the synthesis.',
    when: (m) => m.quality,
  },
  {
    title: 'Analysis',
    body: 'Check the PRISMA flow diagram (download it as PNG for Word or SVG for LaTeX), publication trends, leading sources, frequent terms and theme evolution. Download the screening log as supplementary material.',
  },
  {
    title: 'Write',
    body: 'Choose the citation style of the target journal. Methods and the overview are generated from your data; the synthesis, gaps and conclusions are drafted by AI citing only the included studies. Edit every section, then generate the abstract, highlights and keywords.',
  },
  {
    title: 'Manuscript and submission',
    body: 'Create the manuscript, then in the editor: verify references against Crossref, run the consistency check and Reviewer 2 in the Workspace, complete the Q1 checklist, and export to Word or the journal’s LaTeX template. Insert the PRISMA figure where the text says Fig. [X].',
  },
]

export function ReviewGuide({ method }: { method: ReviewMethodId }) {
  const m = methodById(method)
  const steps = STEPS.filter((s) => !s.when || s.when(m))
  return (
    <div className="space-y-4">
      <Card title={`How to write a ${m.name.toLowerCase()} here`}>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
          {m.whenToUse} Reporting guideline: {m.guideline}.
        </p>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">{i + 1}</span>
              <span>
                <span className="font-medium">{s.title}.</span> {s.body}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-stone-500">
          Full tutorial with tips for each method:{' '}
          <a className="underline" href="https://github.com/dodyirawaan/geomine-studio/blob/main/docs/REVIEW.md" target="_blank" rel="noreferrer">
            docs/REVIEW.md
          </a>
        </p>
      </Card>
      <Card title={`What reviewers check in a ${m.name.toLowerCase()}`}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {m.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
