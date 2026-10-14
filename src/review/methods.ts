// Review methodologies: what each requires, how it is reported, and how the manuscript is structured.
import type { ReviewMethodId } from './types'

export interface OutlineItem {
  id: string
  title: string
  /** What the section must contain; given to the AI as the brief. */
  brief: string
  /** Written from the protocol and the counts, without AI. */
  deterministic?: boolean
}

export interface ReviewMethod {
  id: ReviewMethodId
  name: string
  short: string
  guideline: string
  whenToUse: string
  framework: { name: string; fields: string[] }
  /** Steps shown in the workflow. */
  screening: boolean
  fullText: boolean
  quality: boolean
  bibliometrics: boolean
  outline: OutlineItem[]
  /** Items a reviewer checks; shown as a checklist. */
  checklist: string[]
  /** Reference for the reporting guideline, cited in the Methods. */
  refs: string[]
}

const intro = (focus: string): OutlineItem => ({
  id: 'introduction',
  title: 'Introduction',
  brief: `Importance of the topic for underground mining safety and design; why a review is needed now; how this review differs from earlier reviews (name them from the evidence and state precisely what they did not cover); ${focus}; the research questions; outline of the paper.`,
})

const discussion: OutlineItem = {
  id: 'discussion',
  title: 'Challenges, research gaps and future directions',
  brief: 'Synthesise across themes: unresolved problems, data and validation gaps, transfer to engineering practice, and a concrete, prioritised research agenda (## per gap). Support every gap with the counts in the evidence statistics (e.g. "only 7 of 89 studies …") and with citations; end with a table "Gap | Evidence | Recommended research".',
}

const limitations: OutlineItem = {
  id: 'limitations',
  title: 'Limitations of this review',
  brief: 'Databases, language, screening, extraction source and publication bias.',
  deterministic: true,
}

const conclusions: OutlineItem = { id: 'conclusions', title: 'Conclusions', brief: 'Numbered main findings answering each research question, practical implications, and limitations of this review.' }

export const REVIEW_METHODS: ReviewMethod[] = [
  {
    id: 'systematic',
    name: 'Systematic review',
    short: 'PRISMA 2020',
    guideline: 'PRISMA 2020 (Page et al., 2021)',
    whenToUse: 'A focused question answered from all eligible studies, with transparent search, screening and appraisal. Strongest evidence; most work.',
    framework: { name: 'PICO (adapted)', fields: ['Population / setting (rock mass, mine, excavation)', 'Intervention / method', 'Comparison', 'Outcome'] },
    screening: true,
    fullText: true,
    quality: true,
    bibliometrics: true,
    outline: [
      intro('the specific question the review answers'),
      { id: 'methods', title: 'Review methodology', brief: 'Protocol, search strategy, eligibility, screening, data extraction, quality appraisal and synthesis.', deterministic: true },
      { id: 'overview', title: 'Overview of the included studies', brief: 'Study characteristics: years, venues, settings, data and methods, using the evidence table.', deterministic: true },
      { id: 'synthesis', title: 'Thematic synthesis', brief: 'Organise by theme (mechanisms, monitoring and data, prediction or design methods, validation). Compare methods and results critically, note agreement and contradiction, and weigh evidence by study quality. Use ## for each theme.' },
      discussion,
      limitations,
      conclusions,
    ],
    checklist: [
      'Protocol (questions, eligibility) fixed before screening',
      'Full search strings, databases and dates reported',
      'Screening by two reviewers or AI suggestions verified by a human, with reasons for exclusion',
      'PRISMA flow diagram with counts at every stage',
      'Data extraction form and quality appraisal reported',
      'Synthesis weighs evidence by study quality',
      'Limitations of the review stated',
    ],
    refs: ['page2021'],
  },
  {
    id: 'scoping',
    name: 'Scoping review',
    short: 'PRISMA-ScR',
    guideline: 'PRISMA-ScR (Tricco et al., 2018) and the Arksey & O’Malley (2005) framework',
    whenToUse: 'Map a broad or emerging field — what has been studied, how, and where the gaps are — without appraising quality.',
    framework: { name: 'PCC', fields: ['Population', 'Concept', 'Context'] },
    screening: true,
    fullText: true,
    quality: false,
    bibliometrics: true,
    outline: [
      intro('the breadth of the field and why mapping it is useful'),
      { id: 'methods', title: 'Methods', brief: 'Framework stages, search strategy, eligibility, screening and charting.', deterministic: true },
      { id: 'overview', title: 'Characteristics of the evidence', brief: 'Volume and growth of the literature, venues, settings and methods.', deterministic: true },
      { id: 'synthesis', title: 'Mapping of the evidence', brief: 'Chart the evidence by concept and context; describe what is covered and what is missing. Use ## for each concept.' },
      discussion,
      limitations,
      conclusions,
    ],
    checklist: [
      'Research questions broad enough for mapping',
      'PCC framework reported',
      'Search and selection reported with a PRISMA-ScR flow diagram',
      'Data charting form described',
      'Results presented as a map of the evidence, not as effect estimates',
    ],
    refs: ['tricco2018', 'arksey2005'],
  },
  {
    id: 'bibliometric',
    name: 'Bibliometric review',
    short: 'Science mapping',
    guideline: 'Science-mapping workflow (Zupic & Čater, 2015)',
    whenToUse: 'Quantify the development of a large field: growth, venues, influential works and topic clusters, then interpret the trends.',
    framework: { name: 'Scope', fields: ['Field / keywords', 'Time window', 'Document types'] },
    screening: true,
    fullText: false,
    quality: false,
    bibliometrics: true,
    outline: [
      intro('the size of the field and why a quantitative mapping helps'),
      { id: 'methods', title: 'Data and methods', brief: 'Database, query, time window, cleaning and indicators.', deterministic: true },
      { id: 'overview', title: 'Publication trends and sources', brief: 'Annual output, leading venues, most cited works.', deterministic: true },
      { id: 'synthesis', title: 'Research themes and their evolution', brief: 'Interpret the frequent terms and highly cited works as research themes and describe how they changed over time. Use ## per theme.' },
      discussion,
      limitations,
      conclusions,
    ],
    checklist: ['Query and time window reported', 'Data cleaning (duplicates, document types) described', 'Indicators defined', 'Trends interpreted, not just plotted'],
    refs: ['zupic2015'],
  },
  {
    id: 'narrative',
    name: 'Narrative / critical review',
    short: 'State of the art',
    guideline: 'Critical narrative review with a documented search',
    whenToUse: 'An expert overview of mechanisms, methods and debates for a topic, with a documented (but not exhaustive) search.',
    framework: { name: 'Scope', fields: ['Topic', 'Aspects covered', 'Out of scope'] },
    screening: true,
    fullText: false,
    quality: false,
    bibliometrics: true,
    outline: [
      intro('the scope of the review'),
      { id: 'methods', title: 'Scope and literature search', brief: 'How the literature was found and selected.', deterministic: true },
      { id: 'synthesis', title: 'State of the art', brief: 'Critical discussion organised by theme: mechanisms, monitoring, analysis and design methods, case histories. Use ## for each theme.' },
      discussion,
      conclusions,
    ],
    checklist: ['Scope clearly bounded', 'Search documented', 'Balanced coverage of competing views', 'Critical assessment, not just summary'],
    refs: [],
  },
]

export const REVIEW_REFS: Record<string, string> = {
  page2021: `@article{page2021,
  author = {Page, Matthew J. and McKenzie, Joanne E. and Bossuyt, Patrick M. and Boutron, Isabelle and Hoffmann, Tammy C. and Mulrow, Cynthia D. and others},
  title = {The {PRISMA} 2020 statement: an updated guideline for reporting systematic reviews},
  journal = {BMJ},
  year = {2021},
  volume = {372},
  pages = {n71},
  doi = {10.1136/bmj.n71}
}`,
  tricco2018: `@article{tricco2018,
  author = {Tricco, Andrea C. and Lillie, Erin and Zarin, Wasifa and O'Brien, Kelly K. and Colquhoun, Heather and Levac, Danielle and others},
  title = {{PRISMA} Extension for Scoping Reviews ({PRISMA-ScR}): Checklist and Explanation},
  journal = {Annals of Internal Medicine},
  year = {2018},
  volume = {169},
  number = {7},
  pages = {467--473},
  doi = {10.7326/M18-0850}
}`,
  arksey2005: `@article{arksey2005,
  author = {Arksey, Hilary and O'Malley, Lisa},
  title = {Scoping studies: towards a methodological framework},
  journal = {International Journal of Social Research Methodology},
  year = {2005},
  volume = {8},
  number = {1},
  pages = {19--32},
  doi = {10.1080/1364557032000119616}
}`,
  zupic2015: `@article{zupic2015,
  author = {Zupic, Ivan and \\v{C}ater, Toma\\v{z}},
  title = {Bibliometric methods in management and organization},
  journal = {Organizational Research Methods},
  year = {2015},
  volume = {18},
  number = {3},
  pages = {429--472},
  doi = {10.1177/1094428114562629}
}`,
  cohen1960: `@article{cohen1960,
  author = {Cohen, Jacob},
  title = {A coefficient of agreement for nominal scales},
  journal = {Educational and Psychological Measurement},
  year = {1960},
  volume = {20},
  number = {1},
  pages = {37--46},
  doi = {10.1177/001316446002000104}
}`,
  landis1977: `@article{landis1977,
  author = {Landis, J. Richard and Koch, Gary G.},
  title = {The measurement of observer agreement for categorical data},
  journal = {Biometrics},
  year = {1977},
  volume = {33},
  number = {1},
  pages = {159--174},
  doi = {10.2307/2529310}
}`,
  wohlin2014: `@inproceedings{wohlin2014,
  author = {Wohlin, Claes},
  title = {Guidelines for snowballing in systematic literature studies and a replication in software engineering},
  booktitle = {Proceedings of the 18th International Conference on Evaluation and Assessment in Software Engineering},
  year = {2014},
  pages = {1--10},
  doi = {10.1145/2601248.2601268}
}`,
}

/** Quality-appraisal criteria for primary studies in mining geotechnics (each scored 0 = no, 1 = partly, 2 = yes). */
export const QUALITY_CRITERIA = [
  { id: 'aim', label: 'Clear aim and research question' },
  { id: 'data', label: 'Data source and site conditions described' },
  { id: 'method', label: 'Methods reproducible (parameters, standards, models)' },
  { id: 'validation', label: 'Validation against independent data or field observation' },
  { id: 'uncertainty', label: 'Uncertainty / limitations addressed' },
]
