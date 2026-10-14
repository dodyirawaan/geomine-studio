// Converts the LaTeX subset researchers use in geotechnical papers into native Word equations (OMML).
// Unsupported commands fall back to their name as plain math text, so nothing is silently dropped.
import {
  Math as OMath,
  MathCurlyBrackets,
  MathFraction,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from 'docx'

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '⋅', pm: '±', mp: '∓', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', sim: '∼', simeq: '≃', equiv: '≡', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', circ: '∘',
  degree: '°', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', in: '∈',
  notin: '∉', subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃', int: '∫', oint: '∮', prod: '∏',
  ldots: '…', cdots: '⋯', dots: '…', prime: '′', ll: '≪', gg: '≫', langle: '⟨', rangle: '⟩', mid: '∣',
  ln: 'ln', log: 'log', exp: 'exp', sin: 'sin', cos: 'cos', tan: 'tan', max: 'max', min: 'min', lim: 'lim',
  arctan: 'arctan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', det: 'det',
  ',': ' ', ';': ' ', ':': ' ', '!': '', quad: '  ', qquad: '    ', ' ': ' ',
  '%': '%', '#': '#', '&': '&', _: '_', '{': '{', '}': '}', '|': '‖', '\\': ' ',
}

const ACCENTS: Record<string, string> = { bar: '̄', overline: '̅', hat: '̂', widehat: '̂', tilde: '̃', dot: '̇', ddot: '̈', vec: '⃗' }
const TEXT_CMDS = new Set(['text', 'mathrm', 'mathit', 'mathbf', 'mathsf', 'operatorname', 'textrm', 'textit', 'boldsymbol', 'mathcal'])
const IGNORED = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'limits', 'nolimits', 'label', 'nonumber', 'notag'])

type Item = string | MathComponent

function tokenize(src: string): string[] {
  const out: string[] = []
  for (let i = 0; i < src.length; ) {
    const c = src[i]
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i))!
      out.push(m[0])
      i += m[0].length
    } else if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9.]+/.exec(src.slice(i))!
      out.push(m[0])
      i += m[0].length
    } else {
      out.push(c)
      i++
    }
  }
  return out
}

class Parser {
  private i = 0
  private t: string[]
  constructor(tokens: string[]) {
    this.t = tokens
  }

  parse(): MathComponent[] {
    return this.seq(new Set())
  }

  private seq(stop: Set<string>): MathComponent[] {
    const items: Item[] = []
    while (this.i < this.t.length && !stop.has(this.t[this.i])) {
      const tok = this.t[this.i]
      if (tok === '\\right') {
        if (stop.has('\\right')) break
        this.i += 2
        continue
      }
      const base = this.atom()
      if (base === null) continue
      let sub: MathComponent[] | null = null
      let sup: MathComponent[] | null = null
      while (this.t[this.i] === '_' || this.t[this.i] === '^') {
        const op = this.t[this.i++]
        const arg = this.arg()
        if (op === '_') sub = arg
        else sup = arg
      }
      if (!sub && !sup) {
        if (Array.isArray(base)) items.push(...base)
        else items.push(base)
        continue
      }
      const children = toComponents(Array.isArray(base) ? base : [base])
      if (sub && sup) items.push(new MathSubSuperScript({ children, subScript: sub, superScript: sup }))
      else if (sub) items.push(new MathSubScript({ children, subScript: sub }))
      else items.push(new MathSuperScript({ children, superScript: sup! }))
    }
    return toComponents(items)
  }

  /** One argument: a braced group or a single token. */
  private arg(): MathComponent[] {
    if (this.t[this.i] === '{') {
      this.i++
      const g = this.seq(new Set(['}']))
      this.i++
      return g
    }
    const a = this.atom()
    return a === null ? [] : toComponents(Array.isArray(a) ? a : [a])
  }

  private rawGroup(): string {
    if (this.t[this.i] !== '{') return this.t[this.i++] ?? ''
    let depth = 0
    let s = ''
    while (this.i < this.t.length) {
      const tok = this.t[this.i++]
      if (tok === '{' && depth++ === 0) continue
      if (tok === '}' && --depth === 0) break
      s += tok.startsWith('\\') && tok.length === 2 ? tok[1] : tok
    }
    return s
  }

  /** A single token, command, or braced group (returned as an array so `{x+y}^2` keeps its base). */
  private atom(): Item | Item[] | null {
    const tok = this.t[this.i++]
    if (tok === '{') {
      const g = this.seq(new Set(['}']))
      this.i++
      return g
    }
    if (tok === '}' || tok === '&') return null
    if (!tok.startsWith('\\')) return tok
    const cmd = tok.slice(1)

    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
      const numerator = this.arg()
      const denominator = this.arg()
      return new MathFraction({ numerator, denominator })
    }
    if (cmd === 'sqrt') {
      let degree: MathComponent[] | undefined
      if (this.t[this.i] === '[') {
        this.i++
        degree = this.seq(new Set([']']))
        this.i++
      }
      return new MathRadical({ children: this.arg(), degree })
    }
    if (cmd === 'sum') {
      let subScript: MathComponent[] | undefined
      let superScript: MathComponent[] | undefined
      while (this.t[this.i] === '_' || this.t[this.i] === '^') {
        if (this.t[this.i++] === '_') subScript = this.arg()
        else superScript = this.arg()
      }
      const body = this.atom()
      const children = body === null ? [] : toComponents(Array.isArray(body) ? body : [body])
      return new MathSum({ children, subScript, superScript })
    }
    if (cmd === 'left') {
      const open = this.t[this.i++]
      const inner = this.seq(new Set(['\\right']))
      this.i++
      const close = this.t[this.i++]
      if (open === '(') return new MathRoundBrackets({ children: inner })
      if (open === '[') return new MathSquareBrackets({ children: inner })
      if (open === '\\{') return new MathCurlyBrackets({ children: inner })
      const o = open === '.' ? '' : delim(open)
      const c = close === '.' ? '' : delim(close)
      return [o, ...inner, c].filter((x) => x !== '')
    }
    if (TEXT_CMDS.has(cmd)) return this.rawGroup()
    if (cmd in ACCENTS) {
      const base = this.rawGroup()
      return base + ACCENTS[cmd]
    }
    if (IGNORED.has(cmd)) {
      if (cmd === 'label') this.rawGroup()
      return null
    }
    if (cmd in SYMBOLS) return SYMBOLS[cmd]
    return cmd
  }
}

function delim(tok: string): string {
  return tok.startsWith('\\') ? (SYMBOLS[tok.slice(1)] ?? tok.slice(1)) : tok
}

function toComponents(items: Item[]): MathComponent[] {
  const out: MathComponent[] = []
  let buf = ''
  for (const it of items) {
    if (typeof it === 'string') buf += it
    else {
      if (buf) out.push(new MathRun(buf))
      buf = ''
      out.push(it)
    }
  }
  if (buf) out.push(new MathRun(buf))
  return out
}

export function latexToOmml(latex: string): OMath {
  let children: MathComponent[]
  try {
    children = new Parser(tokenize(latex.replace(/\\begin\{(aligned|align\*?|split|gathered)\}|\\end\{(aligned|align\*?|split|gathered)\}/g, ''))).parse()
  } catch {
    children = [new MathRun(latex)]
  }
  return new OMath({ children })
}
