// Section skeletons for Q1 submissions. Body sections are numbered on export; front and back matter are not.
import { JOURNALS, type JournalId } from '../ai/prompts'
import type { Manuscript, ManuscriptSection, SectionRole } from '../store/db'
import { defaultStyle, makeCiter, type CitationStyle, type Citer } from './citations'
import { parseBibtex } from './bibtex'

export interface ArticleType {
  id: string
  label: string
  description: string
  body: { title: string; hint: string }[]
}

export const ARTICLE_TYPES: ArticleType[] = [
  {
    id: 'research',
    label: 'Research article (IMRaD)',
    description: 'Field, laboratory, numerical or ML study with original data.',
    body: [
      {
        title: 'Introduction',
        hint: 'Problem and its importance for mine safety/design → state of the art → specific gap → objective → novelty and contributions. End with a short outline of the paper.',
      },
      {
        title: 'Materials and methods',
        hint: 'Site and geology, data acquisition, test standards (ISRM SM/ASTM), model geometry, boundary conditions, constitutive models and parameters with sources, calibration/validation, ML pipeline with leakage-free splits. Use ## for subsections.',
      },
      {
        title: 'Results',
        hint: 'Report only what the data show, with units and uncertainty. Reference every figure and table (Fig. 3, Table 2).',
      },
      {
        title: 'Discussion',
        hint: 'Mechanisms, comparison with prior studies, implications for support design or mining sequence, limitations.',
      },
      {
        title: 'Conclusions',
        hint: 'Numbered main findings with key values, practical implications, and future work. No new results.',
      },
    ],
  },
  {
    id: 'review',
    label: 'Review article',
    description: 'Systematic or critical review of a research area.',
    body: [
      {
        title: 'Introduction',
        hint: 'Why the topic matters now, scope of the review, how it differs from earlier reviews, and research questions.',
      },
      {
        title: 'Review methodology',
        hint: 'Databases, search strings, time window, inclusion/exclusion criteria, screening (PRISMA flow), number of studies.',
      },
      {
        title: 'Thematic synthesis',
        hint: 'Organise by theme (mechanisms, monitoring, prediction methods, support systems). Compare methods and results critically. Use ## per theme.',
      },
      {
        title: 'Challenges and research gaps',
        hint: 'Open problems, data limitations, validation gaps, transfer to practice.',
      },
      {
        title: 'Future directions',
        hint: 'Concrete research agenda grounded in the gaps identified.',
      },
      {
        title: 'Conclusions',
        hint: 'Main takeaways of the review.',
      },
    ],
  },
]

const ELSEVIER_BACK = [
  { title: 'CRediT authorship contribution statement', hint: 'Role of each author using the CRediT taxonomy (Conceptualization, Methodology, Software, …).' },
  { title: 'Declaration of competing interest', hint: 'State any financial or personal relationships, or that none exist.' },
  { title: 'Data availability', hint: 'Where data and code can be accessed, or why they cannot be shared.' },
  {
    title: 'Declaration of generative AI and AI-assisted technologies in the writing process',
    hint: 'Name the tool and purpose, and state that the authors reviewed and edited the content and take full responsibility.',
  },
  { title: 'Acknowledgements', hint: 'Funding (with grant numbers), mine sites, and people who helped.' },
]

const SPRINGER_BACK = [
  { title: 'Funding', hint: 'Funding sources and grant numbers.' },
  { title: 'Competing interests', hint: 'Financial or non-financial interests, or a statement that none exist.' },
  { title: 'Author contributions', hint: 'Contribution of each author.' },
  { title: 'Data availability', hint: 'Where data and code can be accessed.' },
  { title: 'Use of large language models', hint: 'Disclose the tool and how it was used, as the journal requires.' },
  { title: 'Acknowledgements', hint: 'Mine sites and people who helped.' },
]

export function publisherOf(journal: JournalId | ''): 'Elsevier' | 'Springer' {
  return JOURNALS.find((j) => j.id === journal)?.publisher ?? 'Elsevier'
}

function section(role: SectionRole, title: string, hint?: string): ManuscriptSection {
  return { id: crypto.randomUUID(), role, title, content: '', hint }
}

export function createManuscript(title: string, journal: JournalId | '', articleTypeId: string): Manuscript {
  const type = ARTICLE_TYPES.find((t) => t.id === articleTypeId) ?? ARTICLE_TYPES[0]
  const back = publisherOf(journal) === 'Springer' ? SPRINGER_BACK : ELSEVIER_BACK
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title,
    journal,
    articleType: type.id,
    authors: [{ name: '', affiliation: '', email: '', corresponding: true }],
    sections: [
      section('highlights', 'Highlights', 'One highlight per line, 3–5 lines, each at most 85 characters including spaces.'),
      section('abstract', 'Abstract', 'Single paragraph: context, aim, methods, key quantitative results, implications. Check the word limit.'),
      section('keywords', 'Keywords', 'Comma-separated, typically 4–7. Avoid repeating words from the title.'),
      ...type.body.map((b) => section('body', b.title, b.hint)),
      ...back.map((b) => section('back', b.title, b.hint)),
    ],
    bibtex: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function newSection(role: SectionRole = 'body'): ManuscriptSection {
  return section(role, role === 'back' ? 'New statement' : 'New section')
}

export function countWords(text: string): number {
  const plain = text
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' x ')
    .replace(/\[@[^\]]*\]/g, ' ')
    .replace(/[#*_`>|-]/g, ' ')
  return plain.split(/\s+/).filter(Boolean).length
}

export function keywordList(m: Manuscript): string[] {
  const kw = m.sections.find((s) => s.role === 'keywords')?.content ?? ''
  return kw
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
}

export function highlightList(m: Manuscript): string[] {
  const h = m.sections.find((s) => s.role === 'highlights')?.content ?? ''
  return h
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export function styleOf(m: Pick<Manuscript, 'citationStyle' | 'journal'>): CitationStyle {
  return m.citationStyle ?? defaultStyle(publisherOf(m.journal))
}

/** Citer for a whole manuscript, numbering in reading order (abstract, body, back matter). */
export function citerFor(m: Manuscript): Citer {
  const order = [...m.sections.filter((s) => s.role === 'abstract'), ...m.sections.filter((s) => s.role === 'body'), ...m.sections.filter((s) => s.role === 'back')]
  return makeCiter(styleOf(m), parseBibtex(m.bibtex), order.map((s) => s.content))
}
