// Support design: convergence–confinement (Mohr–Coulomb closed form), dynamic support energy demand, Mathews/Potvin stability number.
import { num, sig, type Method, type Values } from './types'

// ---------- Ground reaction curve ----------

function grc(v: Values, pi: number) {
  const p0 = num(v, 'p0')
  const R = num(v, 'radius')
  const c = num(v, 'c')
  const phi = (num(v, 'phi') * Math.PI) / 180
  const E = num(v, 'erm') * 1000
  const nu = num(v, 'nu')
  const scm = (2 * c * Math.cos(phi)) / (1 - Math.sin(phi))
  const k = (1 + Math.sin(phi)) / (1 - Math.sin(phi))
  const pcr = (2 * p0 - scm) / (1 + k)
  if (pi >= pcr) return { pcr, scm, k, rp: R, u: (R * (1 + nu) * (p0 - pi)) / E, plastic: false }
  const rp = R * Math.pow((2 * (p0 * (k - 1) + scm)) / ((1 + k) * ((k - 1) * pi + scm)), 1 / (k - 1))
  const u = ((R * (1 + nu)) / E) * (2 * (1 - nu) * (p0 - pcr) * Math.pow(rp / R, 2) - (1 - 2 * nu) * (p0 - pi))
  return { pcr, scm, k, rp, u, plastic: true }
}

function squeezing(strainPct: number): string {
  if (strainPct < 1) return 'Few support problems'
  if (strainPct < 2.5) return 'Minor squeezing'
  if (strainPct < 5) return 'Severe squeezing'
  if (strainPct < 10) return 'Very severe squeezing'
  return 'Extreme squeezing'
}

function grcTable(v: Values): string {
  const p0 = num(v, 'p0')
  const R = num(v, 'radius')
  const rows = [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0].map((f) => {
    const pi = p0 * f
    const r = grc(v, pi)
    return `| ${sig(pi)} | ${sig(r.u * 1000)} | ${sig((r.u / R) * 100)} | ${sig(r.rp)} |`
  })
  return `| Support pressure $p_i$ (MPa) | Wall displacement $u_i$ (mm) | Strain $u_i/R$ (%) | Plastic radius $r_p$ (m) |\n|--:|--:|--:|--:|\n${rows.join('\n')}`
}

export const ccmMethod: Method = {
  id: 'ccm',
  name: 'Convergence–confinement (GRC)',
  category: 'Support design',
  summary: 'Closed-form ground reaction curve for a circular tunnel in a Mohr–Coulomb rock mass under hydrostatic stress, with squeezing class.',
  inputs: [
    { kind: 'number', id: 'p0', label: 'In-situ stress p0 (hydrostatic)', unit: 'MPa', default: 20, min: 0.1 },
    { kind: 'number', id: 'radius', label: 'Tunnel radius R', unit: 'm', default: 2.5, min: 0.1, step: 0.1 },
    { kind: 'number', id: 'c', label: 'Cohesion c′', unit: 'MPa', default: 1.5, min: 0, step: 0.1, help: 'From the Hoek–Brown calculator.' },
    { kind: 'number', id: 'phi', label: 'Friction angle φ′', unit: '°', default: 35, min: 1, max: 70 },
    { kind: 'number', id: 'erm', label: 'Rock mass modulus Erm', unit: 'GPa', default: 10, min: 0.01 },
    { kind: 'number', id: 'nu', label: "Poisson's ratio ν", default: 0.25, min: 0, max: 0.49, step: 0.01 },
    { kind: 'number', id: 'pi', label: 'Support pressure pi', unit: 'MPa', default: 0, min: 0, step: 0.1 },
  ],
  compute(v) {
    const r = grc(v, num(v, 'pi'))
    const R = num(v, 'radius')
    const strain = (r.u / R) * 100
    const warnings = ['Assumes a circular tunnel, hydrostatic stress, plane strain, elastic–perfectly plastic Mohr–Coulomb behaviour with no dilation control. Check non-circular shapes, k ≠ 1 and strain-softening with numerical models.']
    if (num(v, 'pi') > num(v, 'p0')) warnings.push('Support pressure exceeds the in-situ stress.')
    return {
      outputs: [
        { label: 'Rock mass strength σcm = 2c cosφ/(1 − sinφ)', value: sig(r.scm), unit: 'MPa' },
        { label: 'Critical support pressure pcr', value: sig(Math.max(r.pcr, 0)), unit: 'MPa', note: r.pcr <= 0 ? 'No yield even without support' : '' },
        { label: 'Plastic zone radius rp', value: sig(r.rp), unit: 'm', note: r.plastic ? `${sig(r.rp - R)} m of yielded rock` : 'Elastic' },
        { label: 'Wall displacement ui', value: sig(r.u * 1000), unit: 'mm', main: true },
        { label: 'Tunnel strain ui/R', value: sig(strain), unit: '%', main: true, note: `${squeezing(strain)} (Hoek & Marinos 2000)` },
      ],
      warnings,
      table: grcTable(v),
    }
  },
  methodsText(v, res) {
    const pi = num(v, 'pi')
    const r = grc(v, pi)
    const R = num(v, 'radius')
    const strain = (r.u / R) * 100
    return `The ground reaction curve of the ${2 * R} m diameter excavation was derived with the closed-form convergence–confinement solution for an elastic–perfectly plastic Mohr–Coulomb rock mass under hydrostatic in-situ stress [@duncanfama1993; @carranza2000]. With $p_0$ = ${num(v, 'p0')} MPa, $c'$ = ${num(v, 'c')} MPa, $\\phi'$ = ${num(v, 'phi')}°, $E_{rm}$ = ${num(v, 'erm')} GPa and $\\nu$ = ${num(v, 'nu')}, the rock mass strength is $\\sigma_{cm} = 2c'\\cos\\phi'/(1-\\sin\\phi')$ = ${sig(r.scm)} MPa and the critical support pressure is

$$
p_{cr} = \\frac{2p_0 - \\sigma_{cm}}{1+k}, \\qquad k = \\frac{1+\\sin\\phi'}{1-\\sin\\phi'}
$$

= ${sig(Math.max(r.pcr, 0))} MPa. ${r.plastic ? `For a support pressure of ${pi} MPa the plastic zone extends to $r_p$ = ${sig(r.rp)} m and` : `For a support pressure of ${pi} MPa the rock mass remains elastic and`} the radial wall displacement is ${sig(r.u * 1000)} mm, a tunnel strain of ${sig(strain)}%, which corresponds to "${squeezing(strain).toLowerCase()}" in the classification of Hoek and Marinos [@hoekmarinos2000]. The full curve is listed in Table [X].

${res.table ?? ''}

Table [X]. Ground reaction curve.`
  },
  refs: ['duncanfama1993', 'carranza2000', 'hoekmarinos2000'],
}

// ---------- Dynamic support demand ----------

function dynamic(v: Values) {
  const sigmaRatio = num(v, 'ratio')
  const a = num(v, 'radius')
  const dfCalc = (1.25 * sigmaRatio - 0.51) * a
  const df = num(v, 'df') > 0 ? num(v, 'df') : Math.max(dfCalc, 0)
  const rho = num(v, 'rho')
  const vel = num(v, 'v')
  const disp = num(v, 'disp') / 1000
  const mass = rho * df // t/m² of supported area
  const kinetic = 0.5 * mass * vel * vel // kJ/m²
  const potential = v.location === 'roof' ? mass * 9.81 * disp : 0 // kJ/m²
  const demand = kinetic + potential
  const capacity = num(v, 'capacity')
  return { df, dfCalc, mass, kinetic, potential, demand, capacity, fs: capacity > 0 && demand > 0 ? capacity / demand : NaN }
}

export const dynamicMethod: Method = {
  id: 'dynamic',
  name: 'Dynamic support energy demand',
  category: 'Support design',
  summary: 'Energy that rockburst-resistant support must absorb (Kaiser et al. 1996): kinetic energy of ejected rock plus, in the roof, the work of gravity over the support displacement.',
  inputs: [
    { kind: 'number', id: 'ratio', label: 'σmax/σc at the boundary', default: 0.6, min: 0, step: 0.01, help: 'From the boundary-stress calculator.' },
    { kind: 'number', id: 'radius', label: 'Opening radius a', unit: 'm', default: 2.5, min: 0.1, step: 0.1 },
    { kind: 'number', id: 'df', label: 'Depth of failure (override)', unit: 'm', default: 0, min: 0, step: 0.1, help: 'Leave 0 to use Martin et al. (1999).' },
    { kind: 'number', id: 'rho', label: 'Rock density ρ', unit: 't/m³', default: 2.7, min: 1, step: 0.05 },
    {
      kind: 'number',
      id: 'v',
      label: 'Ejection velocity v',
      unit: 'm/s',
      default: 3,
      min: 0,
      step: 0.5,
      presets: [
        { label: 'Low (1.5 m/s)', value: 1.5 },
        { label: 'Moderate (3 m/s)', value: 3 },
        { label: 'High (5 m/s)', value: 5 },
        { label: 'Severe (10 m/s)', value: 10 },
      ],
      help: 'Kaiser et al. (1996) design velocities are typically 1–10 m/s depending on the event magnitude and distance.',
    },
    { kind: 'select', id: 'location', label: 'Location', default: 'wall', options: [{ value: 'wall', label: 'Sidewall' }, { value: 'roof', label: 'Roof (adds gravity work)' }] },
    { kind: 'number', id: 'disp', label: 'Support displacement capacity', unit: 'mm', default: 150, min: 0 },
    { kind: 'number', id: 'capacity', label: 'Support system energy capacity', unit: 'kJ/m²', default: 25, min: 0, help: 'From dynamic test data of your bolt–mesh–shotcrete system; 0 to skip the safety factor.' },
  ],
  compute(v) {
    const d = dynamic(v)
    const warnings: string[] = []
    if (num(v, 'df') <= 0 && d.dfCalc <= 0) warnings.push('σmax/σc is too low for brittle failure by Martin et al. (1999); enter a depth of failure if strainbursting is still expected.')
    if (Number.isFinite(d.fs) && d.fs < 1.5) warnings.push('Factor of safety below 1.5: Kaiser et al. (1996) suggest higher values for dynamic support given the uncertainty in v and df.')
    return {
      outputs: [
        { label: 'Depth of failure df', value: sig(d.df), unit: 'm' },
        { label: 'Ejected mass per m²', value: sig(d.mass * 1000), unit: 'kg/m²' },
        { label: 'Kinetic energy ½mv²', value: sig(d.kinetic), unit: 'kJ/m²' },
        { label: 'Gravity work mgd', value: sig(d.potential), unit: 'kJ/m²' },
        { label: 'Energy demand', value: sig(d.demand), unit: 'kJ/m²', main: true },
        { label: 'Factor of safety (capacity/demand)', value: Number.isFinite(d.fs) ? sig(d.fs) : '—', main: true },
      ],
      warnings,
    }
  },
  methodsText(v) {
    const d = dynamic(v)
    const roof = v.location === 'roof'
    return `The energy demand on the dynamic support was estimated with the energy approach of the Canadian Rockburst Support Handbook [@kaiser1996]. The depth of strainburst failure, ${num(v, 'df') > 0 ? `taken as ${sig(d.df)} m from site observations` : `estimated with $d_f/a = 1.25\\,\\sigma_{\\max}/\\sigma_c - 0.51$ [@martin1999] for $\\sigma_{\\max}/\\sigma_c$ = ${num(v, 'ratio')} and $a$ = ${num(v, 'radius')} m, is ${sig(d.df)} m`}, giving an ejected mass of ${sig(d.mass * 1000)} kg/m² for $\\rho$ = ${num(v, 'rho')} t/m³. For a design ejection velocity of ${num(v, 'v')} m/s the demand is

$$
E = \\tfrac{1}{2}\\,m\\,v^2${roof ? ' + m\\,g\\,d' : ''}
$$

= ${sig(d.demand)} kJ/m²${roof ? `, including ${sig(d.potential)} kJ/m² of gravitational work over a support displacement $d$ = ${num(v, 'disp')} mm in the roof` : ''}.${Number.isFinite(d.fs) ? ` Against a support system capacity of ${num(v, 'capacity')} kJ/m², the factor of safety is ${sig(d.fs)}.` : ''}`
  },
  refs: ['kaiser1996', 'martin1999'],
}

// ---------- Stability graph ----------

function factorA(ratio: number): number {
  if (ratio < 2) return 0.1
  if (ratio > 10) return 1
  return 0.1125 * ratio - 0.125
}

function stab(v: Values) {
  const qp = num(v, 'qp')
  const ratio = num(v, 'sc') / num(v, 'si')
  const A = factorA(ratio)
  const B = num(v, 'b')
  const alpha = (num(v, 'dip') * Math.PI) / 180
  const C = v.mode === 'sliding' ? 8 - 7 * Math.cos(alpha) : 8 - 6 * Math.cos(alpha)
  const n = qp * A * B * C
  const L = num(v, 'length')
  const H = num(v, 'height')
  const hr = (L * H) / (2 * (L + H))
  return { qp, ratio, A, B, C, n, hr }
}

export const stabilityMethod: Method = {
  id: 'stability',
  name: 'Stability graph (N′, HR)',
  category: 'Support design',
  summary: 'Modified stability number N′ = Q′·A·B·C and hydraulic radius for open-stope surfaces (Mathews et al. 1981; Potvin 1988).',
  inputs: [
    { kind: 'number', id: 'qp', label: "Q′ = (RQD/Jn)(Jr/Ja)", default: 4, min: 0.001, step: 0.1 },
    { kind: 'number', id: 'sc', label: 'Intact UCS σc', unit: 'MPa', default: 150, min: 1 },
    { kind: 'number', id: 'si', label: 'Induced compressive stress σi on the surface', unit: 'MPa', default: 30, min: 0.1, help: 'From numerical modelling or elastic estimates.' },
    { kind: 'number', id: 'b', label: 'Factor B (joint orientation)', default: 0.3, min: 0.2, max: 1, step: 0.05, help: 'From the Potvin (1988) chart of the angle between the critical joint and the stope surface: about 0.2–0.3 for 10–30°, 0.5 at 45°, 0.8 at 60° and 1.0 at 90°.' },
    { kind: 'select', id: 'mode', label: 'Failure mode for factor C', default: 'gravity', options: [{ value: 'gravity', label: 'Gravity fall / slabbing: C = 8 − 6 cos α' }, { value: 'sliding', label: 'Sliding on a joint: C = 8 − 7 cos α' }] },
    { kind: 'number', id: 'dip', label: 'α — dip of stope surface (or of the critical joint for sliding)', unit: '°', default: 90, min: 0, max: 90 },
    { kind: 'number', id: 'length', label: 'Surface length', unit: 'm', default: 30, min: 1 },
    { kind: 'number', id: 'height', label: 'Surface height (or width)', unit: 'm', default: 25, min: 1 },
  ],
  compute(v) {
    const s = stab(v)
    return {
      outputs: [
        { label: 'Factor A (σc/σi = ' + sig(s.ratio) + ')', value: sig(s.A) },
        { label: 'Factor B', value: sig(s.B) },
        { label: 'Factor C', value: sig(s.C) },
        { label: "Stability number N′", value: sig(s.n), main: true },
        { label: 'Hydraulic radius HR = area/perimeter', value: sig(s.hr), unit: 'm', main: true },
      ],
      warnings: [
        "Plot (HR, N′) on the stability graph you cite (e.g. Potvin 1988, Nickson 1992, or Mawdesley et al. 2001 with probability contours) — zone boundaries differ between versions, so the class is not computed here.",
      ],
    }
  },
  methodsText(v) {
    const s = stab(v)
    return `Stope surface stability was assessed with the stability graph method [@mathews1981; @potvin1988]. The modified stability number is

$$
N' = Q' \\cdot A \\cdot B \\cdot C
$$

where $Q'$ = ${sig(s.qp)}, the rock stress factor $A$ = ${sig(s.A)} for $\\sigma_c/\\sigma_i$ = ${sig(s.ratio)} ($\\sigma_c$ = ${num(v, 'sc')} MPa, induced stress $\\sigma_i$ = ${num(v, 'si')} MPa), the joint orientation factor $B$ = ${sig(s.B)} and the gravity adjustment factor $C$ = ${sig(s.C)} (${v.mode === 'sliding' ? '$8 - 7\\cos\\alpha$, sliding' : '$8 - 6\\cos\\alpha$, gravity fall and slabbing'}, $\\alpha$ = ${num(v, 'dip')}°), giving $N'$ = ${sig(s.n)}. The ${num(v, 'length')} m × ${num(v, 'height')} m surface has a hydraulic radius of ${sig(s.hr)} m.`
  },
  refs: ['mathews1981', 'potvin1988'],
}
