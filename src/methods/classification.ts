// Rock mass classification: RMR89 (Bieniawski 1989), Q-system (Barton et al. 1974; Grimstad & Barton 1993), GSI.
import { num, optionLabel, sig, type Method, type Values } from './types'

const opt = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }))

/** Rating for a value from descending thresholds: [[min, rating], …]. */
function band(x: number, table: [number, number][]): number {
  for (const [min, r] of table) if (x >= min) return r
  return table[table.length - 1][1]
}

// ---------- RMR89 ----------

const UCS_TABLE: [number, number][] = [[250, 15], [100, 12], [50, 7], [25, 4], [5, 2], [1, 1], [-Infinity, 0]]
const RQD_TABLE: [number, number][] = [[90, 20], [75, 17], [50, 13], [25, 8], [-Infinity, 3]]
const SPACING_TABLE: [number, number][] = [[2, 20], [0.6, 15], [0.2, 10], [0.06, 8], [-Infinity, 5]]

const RATING: Record<string, Record<string, number>> = {
  persistence: { lt1: 6, '1to3': 4, '3to10': 2, '10to20': 1, gt20: 0 },
  aperture: { none: 6, lt01: 5, '01to1': 4, '1to5': 1, gt5: 0 },
  roughness: { vrough: 6, rough: 5, slight: 3, smooth: 1, slick: 0 },
  infilling: { none: 6, hardlt5: 4, hardgt5: 2, softlt5: 2, softgt5: 0 },
  weathering: { un: 6, slight: 5, moderate: 3, high: 1, decomposed: 0 },
  water: { dry: 15, damp: 10, wet: 7, dripping: 4, flowing: 0 },
  orientation: { vfav: 0, fav: -2, fair: -5, unfav: -10, vunfav: -12 },
}

function rmrClass(r: number): string {
  return r > 80 ? 'I — Very good rock' : r > 60 ? 'II — Good rock' : r > 40 ? 'III — Fair rock' : r > 20 ? 'IV — Poor rock' : 'V — Very poor rock'
}

function rmrParts(v: Values) {
  const ucs = band(num(v, 'ucs'), UCS_TABLE)
  const rqd = band(num(v, 'rqd'), RQD_TABLE)
  const spacing = band(num(v, 'spacing'), SPACING_TABLE)
  const jcond = ['persistence', 'aperture', 'roughness', 'infilling', 'weathering'].reduce((s, k) => s + RATING[k][String(v[k])], 0)
  const water = RATING.water[String(v.water)]
  const adj = RATING.orientation[String(v.orientation)]
  const basic = ucs + rqd + spacing + jcond + water
  return { ucs, rqd, spacing, jcond, water, adj, basic, rmr: basic + adj }
}

export const rmr89: Method = {
  id: 'rmr89',
  name: 'RMR89 (Rock Mass Rating)',
  category: 'Rock mass classification',
  summary: 'Bieniawski (1989) rating from five parameters plus an orientation adjustment for tunnels and mines; also gives GSI ≈ RMR89′ − 5.',
  inputs: [
    { kind: 'number', id: 'ucs', label: 'Intact rock UCS', unit: 'MPa', default: 120, min: 0 },
    { kind: 'number', id: 'rqd', label: 'RQD', unit: '%', default: 70, min: 0, max: 100 },
    { kind: 'number', id: 'spacing', label: 'Discontinuity spacing', unit: 'm', default: 0.4, min: 0, step: 0.01 },
    { kind: 'select', id: 'persistence', label: 'Persistence', default: '3to10', options: opt([['lt1', '< 1 m'], ['1to3', '1–3 m'], ['3to10', '3–10 m'], ['10to20', '10–20 m'], ['gt20', '> 20 m']]) },
    { kind: 'select', id: 'aperture', label: 'Aperture', default: '01to1', options: opt([['none', 'None'], ['lt01', '< 0.1 mm'], ['01to1', '0.1–1.0 mm'], ['1to5', '1–5 mm'], ['gt5', '> 5 mm']]) },
    { kind: 'select', id: 'roughness', label: 'Roughness', default: 'slight', options: opt([['vrough', 'Very rough'], ['rough', 'Rough'], ['slight', 'Slightly rough'], ['smooth', 'Smooth'], ['slick', 'Slickensided']]) },
    { kind: 'select', id: 'infilling', label: 'Infilling', default: 'none', options: opt([['none', 'None'], ['hardlt5', 'Hard filling < 5 mm'], ['hardgt5', 'Hard filling > 5 mm'], ['softlt5', 'Soft filling < 5 mm'], ['softgt5', 'Soft filling > 5 mm']]) },
    { kind: 'select', id: 'weathering', label: 'Weathering', default: 'slight', options: opt([['un', 'Unweathered'], ['slight', 'Slightly weathered'], ['moderate', 'Moderately weathered'], ['high', 'Highly weathered'], ['decomposed', 'Decomposed']]) },
    { kind: 'select', id: 'water', label: 'Groundwater', default: 'damp', options: opt([['dry', 'Completely dry'], ['damp', 'Damp'], ['wet', 'Wet'], ['dripping', 'Dripping'], ['flowing', 'Flowing']]) },
    {
      kind: 'select',
      id: 'orientation',
      label: 'Joint orientation (tunnels & mines)',
      default: 'fair',
      options: opt([['vfav', 'Very favourable (0)'], ['fav', 'Favourable (−2)'], ['fair', 'Fair (−5)'], ['unfav', 'Unfavourable (−10)'], ['vunfav', 'Very unfavourable (−12)']]),
    },
  ],
  groups: [
    ['Intact rock & jointing', ['ucs', 'rqd', 'spacing']],
    ['Condition of discontinuities', ['persistence', 'aperture', 'roughness', 'infilling', 'weathering']],
    ['Water & orientation', ['water', 'orientation']],
  ],
  compute(v) {
    const p = rmrParts(v)
    const dry = p.basic - p.water + 15
    const warnings: string[] = []
    if (num(v, 'ucs') < 1) warnings.push('UCS below 1 MPa: Bieniawski recommends a uniaxial test is not meaningful; rating 0.')
    return {
      outputs: [
        { label: 'RMR89', value: p.rmr, main: true, note: rmrClass(p.rmr) },
        { label: 'Basic RMR (no orientation adjustment)', value: p.basic },
        { label: 'Ratings: UCS / RQD / spacing / condition / water', value: `${p.ucs} / ${p.rqd} / ${p.spacing} / ${p.jcond} / ${p.water}` },
        { label: 'Orientation adjustment', value: p.adj },
        { label: 'RMR89′ (dry, unadjusted)', value: dry },
        { label: 'GSI ≈ RMR89′ − 5', value: dry > 23 ? dry - 5 : '—', note: dry > 23 ? 'Hoek et al. (1995); valid for RMR89′ > 23' : 'Not valid for RMR89′ ≤ 23 — use Q′ or the GSI chart' },
      ],
      warnings,
    }
  },
  methodsText(v, r) {
    const p = rmrParts(v)
    const gsi = r.outputs[5].value
    return `The rock mass was classified with the Rock Mass Rating system (RMR89) [@bieniawski1989]. Ratings were assigned for the uniaxial compressive strength of intact rock (${sig(num(v, 'ucs'))} MPa; rating ${p.ucs}), RQD (${num(v, 'rqd')}%; ${p.rqd}), discontinuity spacing (${sig(num(v, 'spacing'))} m; ${p.spacing}), condition of discontinuities (${p.jcond}, from persistence ${optionLabel(rmr89, 'persistence', v.persistence)}, aperture ${optionLabel(rmr89, 'aperture', v.aperture)}, ${optionLabel(rmr89, 'roughness', v.roughness).toLowerCase()} surfaces, ${v.infilling === 'none' ? 'no' : optionLabel(rmr89, 'infilling', v.infilling).toLowerCase()} infilling and ${optionLabel(rmr89, 'weathering', v.weathering).toLowerCase()} walls) and groundwater (${optionLabel(rmr89, 'water', v.water).toLowerCase()}; ${p.water}). The basic rating of ${p.basic} was adjusted by ${p.adj} for ${optionLabel(rmr89, 'orientation', v.orientation).replace(/ \(.*\)/, '').toLowerCase()} joint orientation, giving RMR89 = ${p.rmr} (class ${rmrClass(p.rmr)}).${typeof gsi === 'number' ? ` GSI was estimated from the dry, unadjusted rating as GSI = RMR89′ − 5 = ${gsi} [@hoek1995].` : ''}`
  },
  refs: ['bieniawski1989', 'hoek1995'],
}

// ---------- Q-system ----------

const JN = opt([['0.5', 'Massive, no or few joints (0.5–1)'], ['2', 'One joint set (2)'], ['3', 'One set plus random (3)'], ['4', 'Two joint sets (4)'], ['6', 'Two sets plus random (6)'], ['9', 'Three joint sets (9)'], ['12', 'Three sets plus random (12)'], ['15', 'Four or more sets, heavily jointed (15)'], ['20', 'Crushed rock, earth-like (20)']])
const JR = opt([['4', 'Discontinuous joints (4)'], ['3', 'Rough or irregular, undulating (3)'], ['2', 'Smooth, undulating (2)'], ['1.5', 'Slickensided undulating, or rough planar (1.5)'], ['1', 'Smooth planar (1.0)'], ['0.5', 'Slickensided planar (0.5)'], ['1.0', 'No rock-wall contact when sheared — clay zone (1.0)']])
const JA = opt([['0.75', 'Tightly healed, hard filling (0.75)'], ['1', 'Unaltered walls, surface staining only (1)'], ['2', 'Slightly altered walls, non-softening coatings (2)'], ['3', 'Silty or sandy clay coatings (3)'], ['4', 'Softening or low-friction clay coatings (4)'], ['6', 'Overconsolidated non-softening clay fill < 5 mm (6)'], ['8', 'Softening clay fill < 5 mm (8)'], ['10', 'Swelling clay fill (8–12) (10)'], ['13', 'Thick zones of clay, no wall contact (10–20) (13)']])
const JW = opt([['1', 'Dry or minor inflow (1.0)'], ['0.66', 'Medium inflow, occasional outwash (0.66)'], ['0.5', 'Large inflow in competent rock, unfilled joints (0.5)'], ['0.33', 'Large inflow with considerable outwash (0.33)'], ['0.15', 'Exceptionally high inflow, decaying with time (0.2–0.1)'], ['0.075', 'Exceptionally high inflow without decay (0.1–0.05)']])
const SRF_PRESETS = [
  { label: 'Weakness zones: multiple, with clay (10)', value: 10 },
  { label: 'Single weakness zone, depth ≤ 50 m (5)', value: 5 },
  { label: 'Single weakness zone, depth > 50 m (2.5)', value: 2.5 },
  { label: 'Loose, open joints (5)', value: 5 },
  { label: 'Low stress, near surface σθ/σc < 0.01 (2.5)', value: 2.5 },
  { label: 'Medium stress σθ/σc 0.01–0.3 (1)', value: 1 },
  { label: 'High stress, very tight σθ/σc 0.3–0.4 (0.5–2)', value: 1 },
  { label: 'Moderate slabbing after > 1 h σθ/σc 0.5–0.65 (5–50)', value: 25 },
  { label: 'Slabbing and rockburst after minutes σθ/σc 0.65–1 (50–200)', value: 100 },
  { label: 'Heavy rockburst σθ/σc > 1 (200–400)', value: 300 },
  { label: 'Mild squeezing (5–10)', value: 7.5 },
  { label: 'Heavy squeezing (10–20)', value: 15 },
]
const ESR = opt([['3', 'A — Temporary mine openings (3–5)'], ['1.6', 'B — Permanent mine openings, water tunnels, pilot tunnels (1.6)'], ['1.3', 'C — Storage rooms, minor road/railway and access tunnels (1.3)'], ['1', 'D — Power stations, major road/railway tunnels, portals (1.0)'], ['0.8', 'E — Nuclear facilities, railway stations, public facilities (0.8)']])

function qClass(q: number): string {
  if (q < 0.01) return 'Exceptionally poor'
  if (q < 0.1) return 'Extremely poor'
  if (q < 1) return 'Very poor'
  if (q < 4) return 'Poor'
  if (q < 10) return 'Fair'
  if (q < 40) return 'Good'
  if (q < 100) return 'Very good'
  if (q < 400) return 'Extremely good'
  return 'Exceptionally good'
}

function qParts(v: Values) {
  const rqd = Math.max(10, num(v, 'rqd'))
  const jn = num(v, 'jn') * (v.location === 'intersection' ? 3 : v.location === 'portal' ? 2 : 1)
  const jr = num(v, 'jr')
  const ja = num(v, 'ja')
  const jw = num(v, 'jw')
  const srf = num(v, 'srf')
  const q = (rqd / jn) * (jr / ja) * (jw / srf)
  const qp = (rqd / jn) * (jr / ja)
  const esr = num(v, 'esr')
  const span = num(v, 'span')
  const de = span / esr
  const maxSpan = 2 * esr * Math.pow(q, 0.4)
  const bolt = 2 + (0.15 * span) / esr
  // Grimstad & Barton (1993), in kg/cm²; 1 kg/cm² = 98.07 kPa.
  const proof = ((2 * Math.sqrt(jn)) / (3 * jr)) * Math.pow(q, -1 / 3) * 98.07
  const qw = q > 10 ? 5 * q : q > 0.1 ? 2.5 * q : q
  return { rqd, jn, jr, ja, jw, srf, q, qp, esr, span, de, maxSpan, bolt, proof, qw }
}

export const qSystem: Method = {
  id: 'q',
  name: 'Q-system & support',
  category: 'Rock mass classification',
  summary: 'Q = (RQD/Jn)(Jr/Ja)(Jw/SRF) with equivalent dimension, unsupported span, bolt length, roof pressure, and GSI from Q′.',
  inputs: [
    { kind: 'number', id: 'rqd', label: 'RQD', unit: '%', default: 70, min: 0, max: 100, help: 'Values below 10 are taken as 10.' },
    { kind: 'select', id: 'jn', label: 'Jn — joint set number', default: '9', options: JN },
    { kind: 'select', id: 'location', label: 'Location', default: 'tunnel', options: opt([['tunnel', 'Tunnel/drift'], ['intersection', 'Intersection (3 × Jn)'], ['portal', 'Portal (2 × Jn)']]) },
    { kind: 'select', id: 'jr', label: 'Jr — joint roughness', default: '1.5', options: JR },
    { kind: 'select', id: 'ja', label: 'Ja — joint alteration', default: '2', options: JA },
    { kind: 'select', id: 'jw', label: 'Jw — joint water reduction', default: '1', options: JW },
    { kind: 'number', id: 'srf', label: 'SRF — stress reduction factor', default: 1, min: 0.01, step: 0.1, presets: SRF_PRESETS, help: 'Competent-rock stress classes follow Grimstad & Barton (1993); pick a value within the stated range.' },
    { kind: 'select', id: 'esr', label: 'ESR — excavation support ratio', default: '1.6', options: ESR },
    { kind: 'number', id: 'span', label: 'Span or height', unit: 'm', default: 5, min: 0.5, step: 0.1 },
  ],
  groups: [
    ['Rock mass', ['rqd', 'jn', 'location', 'jr', 'ja', 'jw', 'srf']],
    ['Excavation', ['esr', 'span']],
  ],
  compute(v) {
    const p = qParts(v)
    const warnings: string[] = []
    if (num(v, 'rqd') < 10) warnings.push('RQD < 10 was set to 10, as the Q-system requires.')
    if (p.de > 0 && p.span > p.maxSpan) warnings.push(`The span (${sig(p.span)} m) exceeds the estimated maximum unsupported span (${sig(p.maxSpan)} m): support is needed.`)
    return {
      outputs: [
        { label: 'Q', value: sig(p.q), main: true, note: `${qClass(p.q)} rock` },
        { label: 'Q′ = (RQD/Jn)(Jr/Ja)', value: sig(p.qp) },
        { label: 'GSI ≈ 9 ln Q′ + 44', value: sig(9 * Math.log(p.qp) + 44, 2), note: 'Hoek et al. (1995)' },
        { label: 'Equivalent dimension De = span/ESR', value: sig(p.de), unit: 'm', note: 'Read the support category from the Q support chart at (Q, De)' },
        { label: 'Max. unsupported span = 2·ESR·Q^0.4', value: sig(p.maxSpan), unit: 'm' },
        { label: 'Bolt length L = 2 + 0.15·B/ESR', value: sig(p.bolt), unit: 'm' },
        { label: 'Roof support pressure', value: sig(p.proof), unit: 'kPa', note: 'P = 2Jn^½ Q^(−⅓)/(3Jr)' },
        { label: 'Wall Qw', value: sig(p.qw), note: 'Q×5 (Q>10), ×2.5 (0.1–10), ×1 (<0.1)' },
      ],
      warnings,
    }
  },
  methodsText(v) {
    const p = qParts(v)
    const loc = v.location === 'intersection' ? ' (tripled for the intersection)' : v.location === 'portal' ? ' (doubled for the portal)' : ''
    return `Rock mass quality was also rated with the Q-system [@barton1974; @grimstad1993]:

$$
Q = \\frac{\\mathrm{RQD}}{J_n}\\cdot\\frac{J_r}{J_a}\\cdot\\frac{J_w}{\\mathrm{SRF}}
$$

where RQD = ${sig(p.rqd)}%, the joint set number $J_n$ = ${sig(p.jn)}${loc}, the joint roughness number $J_r$ = ${p.jr}, the joint alteration number $J_a$ = ${p.ja}, the joint water reduction factor $J_w$ = ${p.jw} and the stress reduction factor SRF = ${p.srf}. This gives Q = ${sig(p.q)} (${qClass(p.q).toLowerCase()} rock). For an excavation support ratio ESR = ${p.esr} and a span of ${sig(p.span)} m, the equivalent dimension is $D_e$ = ${sig(p.de)} m, the maximum unsupported span $2\\,\\mathrm{ESR}\\,Q^{0.4}$ = ${sig(p.maxSpan)} m, and the recommended bolt length $L = 2 + 0.15B/\\mathrm{ESR}$ = ${sig(p.bolt)} m [@ngi2015]. The permanent roof support pressure, $P_{\\mathrm{roof}} = 2J_n^{1/2}Q^{-1/3}/(3J_r)$ [@grimstad1993], is ${sig(p.proof)} kPa. Using $Q' = (\\mathrm{RQD}/J_n)(J_r/J_a)$ = ${sig(p.qp)}, GSI was estimated as $9\\ln Q' + 44$ = ${sig(9 * Math.log(p.qp) + 44, 2)} [@hoek1995].`
  },
  refs: ['barton1974', 'grimstad1993', 'ngi2015', 'hoek1995'],
}

// ---------- GSI ----------

export const gsi: Method = {
  id: 'gsi',
  name: 'GSI estimation',
  category: 'Rock mass classification',
  summary: 'Quantified GSI = 1.5·JCond89 + RQD/2 (Hoek et al. 2013), compared with the RMR89′ and Q′ correlations.',
  inputs: [
    { kind: 'number', id: 'rqd', label: 'RQD', unit: '%', default: 60, min: 0, max: 100 },
    { kind: 'number', id: 'jcond', label: 'JCond89 (RMR89 condition rating)', default: 20, min: 0, max: 30, help: 'Sum of the five RMR89 discontinuity-condition ratings (0–30).' },
    { kind: 'number', id: 'rmr', label: 'RMR89′ (dry, unadjusted) — optional', default: 0, min: 0, max: 100, help: 'Leave 0 to skip.' },
    { kind: 'number', id: 'qp', label: 'Q′ = (RQD/Jn)(Jr/Ja) — optional', default: 0, min: 0, step: 0.01, help: 'Leave 0 to skip.' },
  ],
  compute(v) {
    const g = 1.5 * num(v, 'jcond') + num(v, 'rqd') / 2
    const rmr = num(v, 'rmr')
    const qp = num(v, 'qp')
    const outputs: { label: string; value: string | number; main?: boolean; note?: string }[] = [
      { label: 'GSI = 1.5·JCond89 + RQD/2', value: sig(g, 2), main: true, note: 'Hoek et al. (2013)' },
    ]
    const warnings: string[] = []
    if (rmr > 0) outputs.push({ label: 'GSI ≈ RMR89′ − 5', value: rmr > 23 ? rmr - 5 : '—', note: rmr > 23 ? '' : 'Only valid for RMR89′ > 23' })
    if (qp > 0) outputs.push({ label: 'GSI ≈ 9 ln Q′ + 44', value: sig(9 * Math.log(qp) + 44, 2) })
    const all = [g, rmr > 23 ? rmr - 5 : NaN, qp > 0 ? 9 * Math.log(qp) + 44 : NaN].filter(Number.isFinite)
    if (all.length > 1 && Math.max(...all) - Math.min(...all) > 10) warnings.push('Estimates differ by more than 10 points: report a range rather than a single GSI, and check the field description.')
    if (g > 100 || g < 0) warnings.push('GSI outside 0–100: check the inputs.')
    return { outputs, warnings }
  },
  methodsText(v, r) {
    const g = r.outputs[0].value
    const extra = r.outputs.slice(1).map((o) => `${o.label.replace('GSI ≈ ', '')} = ${o.value}`)
    return `The Geological Strength Index was quantified from borehole and mapping data as $\\mathrm{GSI} = 1.5\\,\\mathrm{JCond}_{89} + \\mathrm{RQD}/2$ [@hoek2013], where $\\mathrm{JCond}_{89}$ = ${num(v, 'jcond')} is the joint-condition rating of RMR89 [@bieniawski1989] and RQD = ${num(v, 'rqd')}%, giving GSI = ${g}.${extra.length ? ` For comparison, the correlations of Hoek et al. [@hoek1995] give ${extra.join(' and ')}.` : ''}`
  },
  refs: ['hoek2013', 'bieniawski1989', 'hoek1995'],
}
