// Boundary stresses around a circular opening (Kirsch) and common rockburst-proneness criteria.
import { num, sig, type Method, type Values } from './types'

type Level = 0 | 1 | 2 | 3

const LEVELS = ['None', 'Light (weak)', 'Moderate', 'Strong']

interface Criterion {
  name: string
  expr: string
  value: number
  level: Level
  thresholds: string
  ref: string
  /** Class name when it differs from the four common levels. */
  label?: string
}

function kirsch(v: Values) {
  const sv = num(v, 'sv') > 0 ? num(v, 'sv') : (num(v, 'gamma') * num(v, 'depth')) / 1000
  const k = num(v, 'k')
  // Boundary tangential stress σθ = p[(1 + k) + 2(1 − k)cos2θ], θ measured from the springline.
  const wall = sv * (3 - k)
  const crown = sv * (3 * k - 1)
  return { sv, k, wall, crown, max: Math.max(wall, crown), min: Math.min(wall, crown) }
}

function criteria(v: Values): { list: Criterion[]; st: ReturnType<typeof kirsch> } {
  const st = kirsch(v)
  const sc = num(v, 'sc')
  const stt = num(v, 'st')
  const wet = num(v, 'wet')
  const e = num(v, 'e')
  const s1 = Math.max(st.sv, st.sv * st.k)
  const list: Criterion[] = []

  const rus = st.max / sc
  list.push({
    name: 'Russenes',
    expr: 'σθmax/σc',
    value: rus,
    level: rus < 0.2 ? 0 : rus < 0.3 ? 1 : rus < 0.55 ? 2 : 3,
    thresholds: '< 0.20 none · 0.20–0.30 light · 0.30–0.55 moderate · > 0.55 strong',
    ref: 'russenes1974',
  })
  const tao = sc / s1
  list.push({
    name: 'Tao',
    expr: 'σc/σ1',
    value: tao,
    level: tao > 14.5 ? 0 : tao > 5.5 ? 1 : tao > 2.5 ? 2 : 3,
    thresholds: '> 14.5 none · 5.5–14.5 light · 2.5–5.5 moderate · < 2.5 strong',
    ref: 'tao1988',
  })
  if (stt > 0) {
    const b = sc / stt
    list.push({
      name: 'Brittleness',
      expr: 'B = σc/σt',
      value: b,
      level: b > 40 ? 0 : b > 26.7 ? 1 : b > 14.5 ? 2 : 3,
      thresholds: '> 40 none · 26.7–40 light · 14.5–26.7 moderate · < 14.5 strong',
      ref: 'wang1998',
    })
  }
  if (wet > 0) {
    list.push({
      name: 'Strain energy storage index',
      expr: 'Wet',
      value: wet,
      level: wet < 2 ? 0 : wet < 3.5 ? 1 : wet < 5 ? 2 : 3,
      thresholds: '< 2.0 none · 2.0–3.5 light · 3.5–5.0 moderate · ≥ 5.0 strong',
      ref: 'kidybinski1981',
    })
  }
  if (e > 0) {
    // σc² / 2E with σc in MPa and E in GPa gives kJ/m³.
    const pes = (sc * sc) / (2 * e)
    list.push({
      name: 'Elastic strain energy',
      expr: 'PES = σc²/2Es (kJ/m³)',
      value: pes,
      level: pes <= 50 ? 0 : pes <= 100 ? 1 : pes <= 200 ? 2 : 3,
      label: pes <= 50 ? 'Very low' : pes <= 100 ? 'Low' : pes <= 150 ? 'Moderate' : pes <= 200 ? 'High' : 'Very high',
      thresholds: '≤ 50 very low · 51–100 low · 101–150 moderate · 151–200 high · > 200 very high',
      ref: 'wang2001',
    })
  }
  return { list, st }
}

export const rockburstMethod: Method = {
  id: 'rockburst',
  name: 'Boundary stress & rockburst criteria',
  category: 'Stress & rockburst',
  summary: 'Kirsch boundary stresses for a circular opening, then Russenes, Tao, brittleness, Wet and PES classes, plus depth of brittle failure (Martin et al. 1999).',
  inputs: [
    { kind: 'number', id: 'depth', label: 'Depth', unit: 'm', default: 1000, min: 0 },
    { kind: 'number', id: 'gamma', label: 'Unit weight γ', unit: 'kN/m³', default: 27, min: 10 },
    { kind: 'number', id: 'sv', label: 'σv measured (optional)', unit: 'MPa', default: 0, min: 0, help: 'Leave 0 to use γ·H.' },
    { kind: 'number', id: 'k', label: 'k = σh/σv', default: 1.5, min: 0, step: 0.1 },
    { kind: 'number', id: 'radius', label: 'Opening radius a', unit: 'm', default: 2.5, min: 0.1, step: 0.1 },
    { kind: 'number', id: 'sc', label: 'σc — intact UCS', unit: 'MPa', default: 150, min: 1 },
    { kind: 'number', id: 'st', label: 'σt — tensile strength', unit: 'MPa', default: 8, min: 0, help: '0 to skip the brittleness criterion.' },
    { kind: 'number', id: 'wet', label: 'Wet — strain energy storage index', default: 5, min: 0, step: 0.1, help: '0 to skip.' },
    { kind: 'number', id: 'e', label: 'Es — unloading tangent modulus', unit: 'GPa', default: 60, min: 0, help: '0 to skip PES.' },
  ],
  groups: [
    ['In-situ stress & opening', ['depth', 'gamma', 'sv', 'k', 'radius']],
    ['Intact rock', ['sc', 'st', 'wet', 'e']],
  ],
  compute(v) {
    const { list, st } = criteria(v)
    const sc = num(v, 'sc')
    const ratio = st.max / sc
    const df = (1.25 * ratio - 0.51) * num(v, 'radius')
    const levels = list.map((c) => c.level)
    const warnings = [
      'This is a circular-opening, isotropic, linear-elastic estimate with k applied in the plane of the section. Use numerical models for other shapes, 3D stress or mining-induced stress changes.',
    ]
    if (Math.max(...levels) - Math.min(...levels) >= 2) warnings.push('The criteria disagree by two or more classes — common for single-index methods. Report all of them and weigh against field evidence and microseismic data.')
    if (st.min < 0) warnings.push(`Tensile tangential stress of ${sig(st.min)} MPa at the ${st.crown < st.wall ? 'crown' : 'sidewall'}: check for tensile cracking.`)
    return {
      outputs: [
        { label: 'σv', value: sig(st.sv), unit: 'MPa' },
        { label: 'σθ at sidewall = σv(3 − k)', value: sig(st.wall), unit: 'MPa' },
        { label: 'σθ at crown/invert = σv(3k − 1)', value: sig(st.crown), unit: 'MPa' },
        { label: 'σθmax/σc', value: sig(ratio), main: true },
        { label: 'Depth of brittle failure df = a(1.25 σmax/σc − 0.51)', value: df > 0 ? sig(df) : 'no failure expected', unit: df > 0 ? 'm beyond the boundary' : undefined, note: 'Martin et al. (1999), ±0.1a; meaningful for σmax/σc ≳ 0.4' },
        ...list.map((c) => ({ label: `${c.name} (${c.expr})`, value: sig(c.value), note: `${c.label ?? LEVELS[c.level]} — ${c.thresholds}` })),
      ],
      warnings,
    }
  },
  methodsText(v) {
    const { list, st } = criteria(v)
    const sc = num(v, 'sc')
    const ratio = st.max / sc
    const df = (1.25 * ratio - 0.51) * num(v, 'radius')
    const sv = num(v, 'sv') > 0 ? `a measured vertical stress of ${sig(st.sv)} MPa` : `$\\sigma_v = \\gamma H$ = ${sig(st.sv)} MPa (H = ${num(v, 'depth')} m, $\\gamma$ = ${num(v, 'gamma')} kN/m³)`
    const crit = list
      .map((c) => `${c.name} (${c.expr.replace(/ \(kJ\/m³\)/, '')} = ${sig(c.value)}; ${(c.label ?? LEVELS[c.level]).toLowerCase()}) [@${c.ref}]`)
      .join('; ')
    return `The elastic tangential stress on the boundary of a circular opening of radius $a$ = ${num(v, 'radius')} m was calculated with the Kirsch solution [@kirsch1898]:

$$
\\sigma_\\theta = \\sigma_v\\left[(1+k) + 2(1-k)\\cos 2\\theta\\right]
$$

for ${sv} and a horizontal-to-vertical stress ratio $k$ = ${num(v, 'k')}, giving ${sig(st.wall)} MPa at the sidewalls and ${sig(st.crown)} MPa at the crown. With an intact strength $\\sigma_c$ = ${sig(sc)} MPa, the maximum stress ratio is $\\sigma_{\\theta\\max}/\\sigma_c$ = ${sig(ratio)}${df > 0 ? `, and the empirical relation $d_f/a = 1.25\\,\\sigma_{\\max}/\\sigma_c - 0.51$ [@martin1999] predicts brittle failure to a depth of about ${sig(df)} m beyond the excavation boundary` : ', below the threshold for brittle failure in the relation of Martin et al. [@martin1999]'}. Rockburst proneness was assessed with several criteria: ${crit}. Because single-index criteria often disagree, these classes were interpreted together with site observations.`
  },
  refs: ['kirsch1898', 'martin1999', 'russenes1974', 'tao1988', 'wang1998', 'kidybinski1981', 'wang2001'],
}
