// Generalised Hoek–Brown (2002 edition) with rock mass modulus (Hoek & Diederichs 2006) and equivalent Mohr–Coulomb parameters.
import { num, sig, type Method, type Values } from './types'

const MI_PRESETS = [
  { label: 'Granite (32 ± 3)', value: 32 },
  { label: 'Granodiorite (29 ± 3)', value: 29 },
  { label: 'Diorite (25 ± 5)', value: 25 },
  { label: 'Gabbro (27 ± 3)', value: 27 },
  { label: 'Basalt (25 ± 5)', value: 25 },
  { label: 'Andesite (25 ± 5)', value: 25 },
  { label: 'Gneiss (28 ± 5)', value: 28 },
  { label: 'Schist (12 ± 3)', value: 12 },
  { label: 'Quartzite (20 ± 3)', value: 20 },
  { label: 'Marble (9 ± 3)', value: 9 },
  { label: 'Sandstone (17 ± 4)', value: 17 },
  { label: 'Siltstone (7 ± 2)', value: 7 },
  { label: 'Claystone (4 ± 2)', value: 4 },
  { label: 'Shale (6 ± 2)', value: 6 },
  { label: 'Limestone, micritic (9 ± 2)', value: 9 },
  { label: 'Coal (8–21) (≈ 13)', value: 13 },
]

const D_PRESETS = [
  { label: 'Excellent controlled blasting or TBM (0)', value: 0 },
  { label: 'Mechanical excavation, poor rock, no blast damage (0)', value: 0 },
  { label: 'Poor blasting in hard rock, local damage 2–3 m (0.8)', value: 0.8 },
  { label: 'Small-scale blasting in slopes (0.7)', value: 0.7 },
  { label: 'Large production blasting, open pit (1.0)', value: 1 },
]

export interface HbResult {
  mb: number
  s: number
  a: number
  ucsMass: number
  tensile: number
  global: number
  erm: number
  sigma3max: number
  phi: number
  c: number
}

export function hoekBrown(v: Values): HbResult {
  const sci = num(v, 'sci')
  const mi = num(v, 'mi')
  const g = num(v, 'gsi')
  const D = num(v, 'd')
  const ei = num(v, 'ei')
  const mb = mi * Math.exp((g - 100) / (28 - 14 * D))
  const s = Math.exp((g - 100) / (9 - 3 * D))
  const a = 0.5 + (Math.exp(-g / 15) - Math.exp(-20 / 3)) / 6
  const ucsMass = sci * Math.pow(s, a)
  const tensile = (-s * sci) / mb
  const global = (sci * (mb + 4 * s - a * (mb - 8 * s)) * Math.pow(mb / 4 + s, a - 1)) / (2 * (1 + a) * (2 + a))
  // Generalised Hoek–Diederichs equation when Ei is known, simplified form otherwise (MPa).
  const erm =
    ei > 0
      ? ei * 1000 * (0.02 + (1 - D / 2) / (1 + Math.exp((60 + 15 * D - g) / 11)))
      : 100000 * ((1 - D / 2) / (1 + Math.exp((75 + 25 * D - g) / 11)))
  const gh = (num(v, 'gamma') * num(v, 'depth')) / 1000
  const sigma3max = v.application === 'slope' ? global * 0.72 * Math.pow(global / gh, -0.91) : global * 0.47 * Math.pow(global / gh, -0.94)
  const s3n = sigma3max / sci
  const k = 6 * a * mb * Math.pow(s + mb * s3n, a - 1)
  const phi = Math.asin(k / (2 * (1 + a) * (2 + a) + k))
  const c = (sci * ((1 + 2 * a) * s + (1 - a) * mb * s3n) * Math.pow(s + mb * s3n, a - 1)) / ((1 + a) * (2 + a) * Math.sqrt(1 + k / ((1 + a) * (2 + a))))
  return { mb, s, a, ucsMass, tensile, global, erm, sigma3max, phi: (phi * 180) / Math.PI, c }
}

export const hoekBrownMethod: Method = {
  id: 'hoekbrown',
  name: 'Hoek–Brown, Erm & Mohr–Coulomb fit',
  category: 'Strength & deformability',
  summary: 'mb, s, a (2002 edition), rock mass strength, Erm (Hoek & Diederichs 2006), and equivalent c′, φ′ over the tunnel or slope stress range.',
  inputs: [
    { kind: 'number', id: 'sci', label: 'σci — intact UCS', unit: 'MPa', default: 120, min: 0.1 },
    { kind: 'number', id: 'mi', label: 'mi — intact rock constant', default: 32, min: 1, presets: MI_PRESETS, help: 'Prefer triaxial-test values; presets are typical values from Hoek (2007).' },
    { kind: 'number', id: 'gsi', label: 'GSI', default: 55, min: 5, max: 100 },
    { kind: 'number', id: 'd', label: 'D — disturbance factor', default: 0, min: 0, max: 1, step: 0.1, presets: D_PRESETS },
    { kind: 'number', id: 'ei', label: 'Ei — intact modulus (optional)', unit: 'GPa', default: 0, min: 0, help: 'Leave 0 to use the simplified Hoek–Diederichs equation.' },
    { kind: 'select', id: 'application', label: 'Application (σ3max)', default: 'tunnel', options: [{ value: 'tunnel', label: 'Tunnel / underground' }, { value: 'slope', label: 'Slope' }] },
    { kind: 'number', id: 'depth', label: 'Depth H (or slope height)', unit: 'm', default: 800, min: 1 },
    { kind: 'number', id: 'gamma', label: 'Unit weight γ', unit: 'kN/m³', default: 27, min: 10 },
  ],
  groups: [
    ['Intact rock & rock mass', ['sci', 'mi', 'gsi', 'd', 'ei']],
    ['Stress range for the Mohr–Coulomb fit', ['application', 'depth', 'gamma']],
  ],
  compute(v) {
    const r = hoekBrown(v)
    const warnings: string[] = []
    if (num(v, 'gsi') < 25) warnings.push('For GSI < 25 the 2002 a-equation still applies, but check whether the rock mass behaves as a continuum.')
    if (num(v, 'd') > 0 && v.application === 'tunnel') warnings.push('D > 0 should apply only to the blast-damaged zone, not the whole rock mass (Hoek 2012).')
    return {
      outputs: [
        { label: 'mb', value: sig(r.mb, 4), main: true },
        { label: 's', value: sig(r.s, 3), main: true },
        { label: 'a', value: sig(r.a, 4), main: true },
        { label: 'Rock mass UCS σc = σci·s^a', value: sig(r.ucsMass), unit: 'MPa' },
        { label: 'Tensile strength σt = −s·σci/mb', value: sig(r.tensile), unit: 'MPa' },
        { label: 'Global strength σ′cm', value: sig(r.global), unit: 'MPa' },
        { label: 'Rock mass modulus Erm', value: sig(r.erm / 1000), unit: 'GPa', note: num(v, 'ei') > 0 ? 'Generalised Hoek–Diederichs' : 'Simplified Hoek–Diederichs' },
        { label: 'σ3max', value: sig(r.sigma3max), unit: 'MPa' },
        { label: 'Equivalent friction angle φ′', value: sig(r.phi), unit: '°' },
        { label: 'Equivalent cohesion c′', value: sig(r.c), unit: 'MPa' },
      ],
      warnings,
    }
  },
  methodsText(v) {
    const r = hoekBrown(v)
    const ei = num(v, 'ei')
    const app = v.application === 'slope' ? 'slope' : 'tunnel'
    return `Rock mass strength was described by the generalised Hoek–Brown criterion [@hoek2002; @hoek2019]:

$$
\\sigma'_1 = \\sigma'_3 + \\sigma_{ci}\\left(m_b\\frac{\\sigma'_3}{\\sigma_{ci}} + s\\right)^{a}
$$

with $m_b = m_i\\exp\\left[(\\mathrm{GSI}-100)/(28-14D)\\right]$, $s = \\exp\\left[(\\mathrm{GSI}-100)/(9-3D)\\right]$ and $a = 1/2 + \\left(e^{-\\mathrm{GSI}/15} - e^{-20/3}\\right)/6$. For $\\sigma_{ci}$ = ${sig(num(v, 'sci'))} MPa, $m_i$ = ${num(v, 'mi')}, GSI = ${num(v, 'gsi')} and disturbance factor $D$ = ${num(v, 'd')}, this gives $m_b$ = ${sig(r.mb, 4)}, $s$ = ${sig(r.s, 3)} and $a$ = ${sig(r.a, 4)}; the rock mass uniaxial compressive strength is ${sig(r.ucsMass)} MPa, the tensile strength ${sig(r.tensile)} MPa and the global strength $\\sigma'_{cm}$ = ${sig(r.global)} MPa. The rock mass modulus was estimated with the ${ei > 0 ? `generalised Hoek–Diederichs equation from $E_i$ = ${sig(ei)} GPa` : 'simplified Hoek–Diederichs equation'} [@hoek2006] as $E_{rm}$ = ${sig(r.erm / 1000)} GPa. For numerical analysis, equivalent Mohr–Coulomb parameters were fitted over $0 < \\sigma'_3 < \\sigma'_{3\\max}$, where $\\sigma'_{3\\max}$ = ${sig(r.sigma3max)} MPa follows the ${app} relation of Hoek et al. [@hoek2002] for a ${app === 'slope' ? 'slope height' : 'depth'} of ${num(v, 'depth')} m and $\\gamma$ = ${num(v, 'gamma')} kN/m³, giving $c'$ = ${sig(r.c)} MPa and $\\phi'$ = ${sig(r.phi)}°.`
  },
  refs: ['hoek2002', 'hoek2019', 'hoek2006'],
}
