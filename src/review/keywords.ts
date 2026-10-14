// Keyword bank: concept blocks (synonyms and spelling variants) for Boolean searches, and suggested review topics
// built from them. Combine one block from each concept: (A1 OR A2) AND (B1 OR B2). OpenAlex stems words, so plurals and
// endings are matched without wildcards (which it rejects).

export interface KeywordBlock {
  id: string
  topic: string
  concept: string
  terms: string[]
}

export const TOPICS = [
  'Rockburst & seismicity',
  'Deep mining',
  'Ground support & tunnels',
  'Coal mining & water conservation',
  'Backfill & green mining',
  'IR & AE monitoring',
  'Rock mass & numerical methods',
  'Machine learning',
] as const

export const KEYWORD_BLOCKS: KeywordBlock[] = [
  // Rockburst & seismicity
  { id: 'rockburst', topic: 'Rockburst & seismicity', concept: 'Rockburst', terms: ['rockburst', '"rock burst"', 'strainburst', '"pillar burst"', '"fault-slip burst"', '"coal burst"', '"coal bump"'] },
  { id: 'mis', topic: 'Rockburst & seismicity', concept: 'Mining-induced seismicity', terms: ['"mining-induced seismicity"', '"induced seismicity"', 'microseismic', '"seismic event"', '"seismic hazard"'] },
  { id: 'msparams', topic: 'Rockburst & seismicity', concept: 'Seismic source parameters', terms: ['"b-value"', '"seismic moment"', '"energy index"', '"apparent stress"', '"source parameters"', '"moment tensor"'] },
  { id: 'burstindex', topic: 'Rockburst & seismicity', concept: 'Burst proneness', terms: ['"burst proneness"', '"bursting liability"', '"strain energy storage"', 'brittleness', '"energy release rate"'] },
  // Deep mining
  { id: 'deep', topic: 'Deep mining', concept: 'Deep mining', terms: ['"deep mining"', '"deep mine"', '"deep underground"', '"great depth"', '"kilometre-deep"', '"deep-level"', '"deep metal mine"', '"deep coal mine"'] },
  { id: 'highstress', topic: 'Deep mining', concept: 'High in-situ stress', terms: ['"high stress"', '"high in-situ stress"', '"high ground stress"', '"in-situ stress"', '"stress measurement"', '"overcoring"', '"hydraulic fracturing stress"'] },
  { id: 'heat', topic: 'Deep mining', concept: 'Heat hazard', terms: ['"high temperature"', '"heat hazard"', '"geothermal"', '"thermal environment"', '"mine cooling"', '"mine ventilation"', '"heat stress"', '"rock temperature"'] },
  { id: 'creep', topic: 'Deep mining', concept: 'Time-dependent behaviour', terms: ['creep', 'rheology', '"time-dependent"', '"long-term strength"', 'squeezing', '"large deformation"'] },
  { id: 'thm', topic: 'Deep mining', concept: 'Coupled processes', terms: ['"thermo-hydro-mechanical"', 'THM', 'THMC', '"multi-field coupling"', '"coupled thermal"'] },
  { id: 'shaft', topic: 'Deep mining', concept: 'Deep shafts & roadways', terms: ['"deep shaft"', '"shaft sinking"', '"deep roadway"', '"deep tunnel"', '"soft rock roadway"'] },
  { id: 'outburst', topic: 'Deep mining', concept: 'Coal and gas outburst', terms: ['"coal and gas outburst"', '"gas outburst"', '"outburst prevention"', '"gas drainage"'] },
  { id: 'inrush', topic: 'Deep mining', concept: 'Water inrush', terms: ['"water inrush"', '"confined aquifer"', '"floor water inrush"', '"karst water"', '"high-pressure water"'] },
  // Ground support
  { id: 'support', topic: 'Ground support & tunnels', concept: 'Ground support', terms: ['"ground support"', '"rock bolt"', 'rockbolt', '"cable bolt"', 'shotcrete', '"yielding support"', '"dynamic support"', '"energy-absorbing bolt"'] },
  { id: 'excavation', topic: 'Ground support & tunnels', concept: 'Underground excavation', terms: ['tunnel', 'drift', 'roadway', '"underground excavation"', '"underground opening"', 'stope', 'cavern'] },
  { id: 'edz', topic: 'Ground support & tunnels', concept: 'Excavation damage', terms: ['"excavation damaged zone"', 'EDZ', 'spalling', '"brittle failure"', '"depth of failure"', '"damage zone"'] },
  { id: 'caving', topic: 'Ground support & tunnels', concept: 'Caving & stoping', terms: ['"block caving"', '"panel caving"', '"sublevel caving"', '"sublevel stoping"', '"cave propagation"', '"stope stability"'] },
  // Coal & water
  { id: 'watercons', topic: 'Coal mining & water conservation', concept: 'Water-conservation mining', terms: ['"water-conservation mining"', '"water-preserved mining"', '"water-preserving mining"', '"aquifer protection"', '"groundwater protection"'] },
  { id: 'wcfz', topic: 'Coal mining & water conservation', concept: 'Fractured zones', terms: ['"water-conducting fractured zone"', '"water flowing fractured zone"', '"fractured zone height"', '"caved zone"', '"overburden failure"'] },
  { id: 'longwall', topic: 'Coal mining & water conservation', concept: 'Longwall & strata control', terms: ['longwall', '"strata movement"', '"strata control"', '"key stratum"', '"overburden movement"', '"roof control"', '"hard roof"'] },
  { id: 'subsidence', topic: 'Coal mining & water conservation', concept: 'Subsidence', terms: ['subsidence', '"surface deformation"', '"ground movement"', 'InSAR'] },
  // Backfill & green
  { id: 'backfill', topic: 'Backfill & green mining', concept: 'Backfill', terms: ['backfill', '"cemented paste backfill"', 'CPB', '"filling mining"', '"backfill mining"', '"cemented tailings backfill"'] },
  { id: 'co2', topic: 'Backfill & green mining', concept: 'CO2 mineralisation', terms: ['"CO2 mineralization"', '"CO2 mineralisation"', 'carbonation', '"carbon sequestration"', '"CO2 storage"', '"CO2 curing"'] },
  { id: 'waste', topic: 'Backfill & green mining', concept: 'Solid waste', terms: ['"fly ash"', '"coal gangue"', 'tailings', '"solid waste"', 'slag'] },
  { id: 'green', topic: 'Backfill & green mining', concept: 'Green mining', terms: ['"green mining"', '"sustainable mining"', '"circular economy"', '"low-carbon"', 'decarboni'] },
  // IR & AE
  { id: 'ir', topic: 'IR & AE monitoring', concept: 'Infrared radiation', terms: ['"infrared radiation"', '"infrared thermography"', '"infrared temperature"', 'thermography', '"thermal imaging"'] },
  { id: 'ae', topic: 'IR & AE monitoring', concept: 'Acoustic emission', terms: ['"acoustic emission"', 'AE', '"RA-AF"', '"crack classification"'] },
  { id: 'precursor', topic: 'IR & AE monitoring', concept: 'Failure precursors', terms: ['precursor', '"early warning"', '"critical slowing down"', '"failure prediction"', '"damage evolution"'] },
  { id: 'coalrock', topic: 'IR & AE monitoring', concept: 'Coal and rock specimens', terms: ['coal', 'sandstone', 'granite', '"rock specimen"', '"coal-rock"', '"uniaxial compression"'] },
  // Rock mass & numerical
  { id: 'rockmass', topic: 'Rock mass & numerical methods', concept: 'Rock mass classification', terms: ['"rock mass rating"', 'RMR', '"Q-system"', '"geological strength index"', 'GSI', '"Hoek-Brown"'] },
  { id: 'numerical', topic: 'Rock mass & numerical methods', concept: 'Numerical modelling', terms: ['"numerical simulation"', '"numerical model"', 'FLAC3D', 'UDEC', '3DEC', 'PFC', '"discrete element"', '"finite element"', 'FDEM'] },
  // ML
  { id: 'ml', topic: 'Machine learning', concept: 'Machine learning', terms: ['"machine learning"', '"deep learning"', '"neural network"', '"random forest"', 'XGBoost', '"support vector"', '"artificial intelligence"', '"data-driven"'] },
  { id: 'prediction', topic: 'Machine learning', concept: 'Prediction', terms: ['predict', 'forecast', 'classif', 'estimat', '"early warning"'] },
]

/** Builds "(a OR b) AND (c OR d)" from blocks and optional extra terms. */
export function buildQuery(blocks: KeywordBlock[], exclude: string[] = []): string {
  const groups = blocks.map((b) => (b.terms.length === 1 ? b.terms[0] : `(${b.terms.join(' OR ')})`))
  const not = exclude.filter(Boolean).map((t) => (t.includes(' ') && !t.startsWith('"') ? `"${t}"` : t))
  return [groups.join(' AND '), ...(not.length ? [`NOT (${not.join(' OR ')})`] : [])].join(' ')
}

export interface ReviewSuggestion {
  id: string
  title: string
  method: 'systematic' | 'scoping' | 'bibliometric' | 'narrative'
  blocks: string[]
  why: string
}

/**
 * Starting points for a review. Whether a topic is still open is checked live (number of primary studies vs reviews
 * on OpenAlex) rather than asserted here.
 */
export const REVIEW_SUGGESTIONS: ReviewSuggestion[] = [
  { id: 'deep-rb-ml', title: 'Machine learning for rockburst prediction in deep mines', method: 'systematic', blocks: ['rockburst', 'ml', 'deep'], why: 'Many ML papers; validation on unseen deep mines is the open question.' },
  { id: 'deep-heat', title: 'Heat hazard and thermal management in deep mines', method: 'scoping', blocks: ['deep', 'heat'], why: 'Increasingly critical beyond 1,000 m; spread across mining, ventilation and geothermal literature.' },
  { id: 'deep-creep', title: 'Time-dependent behaviour and large deformation of deep roadways', method: 'systematic', blocks: ['creep', 'shaft'], why: 'Creep and squeezing at depth link laboratory rheology to support design.' },
  { id: 'deep-thm', title: 'Coupled thermo-hydro-mechanical processes in deep mining', method: 'scoping', blocks: ['thm', 'deep'], why: 'Coupling is often cited as a gap in deep rock mechanics.' },
  { id: 'deep-stress', title: 'In-situ stress measurement and characterisation for deep mines', method: 'narrative', blocks: ['highstress', 'deep'], why: 'Stress at depth controls rockburst, support and layout decisions.' },
  { id: 'deep-support', title: 'Dynamic and yielding support for high-stress deep excavations', method: 'systematic', blocks: ['support', 'highstress'], why: 'Support capacity data are scattered across tests, case histories and models.' },
  { id: 'ms-blast', title: 'Microseismic event discrimination and source parameters in mines', method: 'scoping', blocks: ['mis', 'msparams'], why: 'Methods range from waveform features to deep learning.' },
  { id: 'ir-ae', title: 'Infrared radiation and acoustic emission precursors of coal and rock failure', method: 'systematic', blocks: ['ir', 'ae', 'precursor'], why: 'A focused laboratory literature with comparable indicators.' },
  { id: 'wcfz', title: 'Prediction of the water-conducting fractured zone height in longwall mining', method: 'systematic', blocks: ['wcfz', 'longwall'], why: 'Empirical formulas, field measurements and ML methods can be compared directly.' },
  { id: 'watercons', title: 'Water-conservation mining: mechanisms, methods and practice', method: 'scoping', blocks: ['watercons'], why: 'Mostly Chinese case studies; an international synthesis is useful.' },
  { id: 'co2-backfill', title: 'CO2-mineralised solid-waste backfill for underground mines', method: 'systematic', blocks: ['backfill', 'co2'], why: 'Rapid growth; strength, uptake and durability data can be tabulated.' },
  { id: 'backfill-biblio', title: 'Mine backfill research: a bibliometric analysis', method: 'bibliometric', blocks: ['backfill'], why: 'A large field suited to trend and theme mapping.' },
  { id: 'edz', title: 'Brittle failure and the excavation damaged zone around deep openings', method: 'narrative', blocks: ['edz', 'excavation'], why: 'Mechanisms and depth-of-failure methods for hard rock.' },
  { id: 'caving', title: 'Cave propagation and stability in block and panel caving', method: 'scoping', blocks: ['caving'], why: 'Relevant to large Indonesian and global caving operations.' },
]
