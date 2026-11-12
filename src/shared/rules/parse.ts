/**
 * Parsing rules.csv cells the way the game reads them (docs/FORMATS.md, rules.csv):
 * conditions and script are one line each; options are "[order:]id:text" lines; a text line that
 * is exactly "OR" separates random variants.
 */

export type Value = string | number | boolean

export interface MemoryCondition {
  kind: 'memory'
  raw: string
  /** A trailing "score:N" on the same line (vanilla: "$id == rao score:1000"). */
  score?: number
  negate: boolean
  key: string
  /** Missing = "is set and truthy". */
  op?: string
  value?: string
}
export interface CommandCondition { kind: 'command'; raw: string; negate: boolean; name: string; args: string[]; score?: number }
export interface ScoreCondition { kind: 'score'; raw: string; score: number }
export type Condition = MemoryCondition | CommandCondition | ScoreCondition

export type ScriptLine =
  | { kind: 'set'; raw: string; key: string; value: string; expire?: number }
  | { kind: 'incr'; raw: string; key: string; by: number; expire?: number }
  | { kind: 'unset'; raw: string; key: string }
  | { kind: 'command'; raw: string; name: string; args: string[] }

export interface OptionLine { order?: number; id: string; text: string; raw: string }

export const OPERATORS = ['==', '!=', '>=', '<=', '>', '<']

/** Split a line into tokens; "double quotes" group words (the game's Token parsing). */
export function tokenize(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  let had = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { quoted = !quoted; had = true; continue }
    if (!quoted && /\s/.test(c)) {
      if (cur || had) out.push(cur)
      cur = ''
      had = false
      continue
    }
    cur += c
  }
  if (cur || had) out.push(cur)
  return out
}

export const lines = (cell: string) => cell.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

export function parseCondition(raw: string): Condition {
  const line = raw.trim()
  const sc = /^score\s*:\s*(-?[\d.]+)$/i.exec(line)
  if (sc) return { kind: 'score', raw: line, score: Number(sc[1]) }
  let negate = false
  let body = line
  let score: number | undefined
  const trail = /\s+score\s*:\s*(-?[\d.]+)$/i.exec(body)
  if (trail) { score = Number(trail[1]); body = body.slice(0, trail.index).trim() }
  if (body.startsWith('!')) { negate = true; body = body.slice(1).trim() }
  if (body.startsWith('$')) {
    const toks = tokenize(body)
    const key = toks[0]
    if (toks.length >= 3 && OPERATORS.includes(toks[1])) return { kind: 'memory', raw: line, negate, key, op: toks[1], value: toks.slice(2).join(' '), score }
    // "$a==b" without spaces
    const m = /^(\$[^\s=!<>]+)\s*(==|!=|>=|<=|>|<)\s*(.*)$/.exec(body)
    if (m) return { kind: 'memory', raw: line, negate, key: m[1], op: m[2], value: m[3].replace(/^"|"$/g, ''), score }
    return { kind: 'memory', raw: line, negate, key, score }
  }
  const toks = tokenize(body)
  return { kind: 'command', raw: line, negate, name: toks[0] ?? '', args: toks.slice(1), score }
}

export const parseConditions = (cell: string): Condition[] => lines(cell).map(parseCondition)

export function parseScriptLine(raw: string): ScriptLine {
  const line = raw.trim()
  const toks = tokenize(line)
  if (toks[0]?.startsWith('$')) {
    if (toks[1] === '=' ) {
      const exp = toks.length >= 4 && /^-?[\d.]+$/.test(toks[toks.length - 1]) ? Number(toks[toks.length - 1]) : undefined
      const value = exp === undefined ? toks.slice(2).join(' ') : toks.slice(2, -1).join(' ')
      return { kind: 'set', raw: line, key: toks[0], value, expire: exp }
    }
    if (toks[1] === '++' || toks[1] === '--') return { kind: 'incr', raw: line, key: toks[0], by: toks[1] === '++' ? 1 : -1, expire: toks[2] ? Number(toks[2]) : undefined }
    const m = /^(\$\S+?)(\+\+|--)$/.exec(toks[0])
    if (m) return { kind: 'incr', raw: line, key: m[1], by: m[2] === '++' ? 1 : -1 }
  }
  if (toks[0] === 'unset' && toks[1]?.startsWith('$')) return { kind: 'unset', raw: line, key: toks[1] }
  return { kind: 'command', raw: line, name: toks[0] ?? '', args: toks.slice(1) }
}

export const parseScript = (cell: string): ScriptLine[] => lines(cell).map(parseScriptLine)

/** Options: "[order:]id:text" per line. The text keeps any further colons. */
export function parseOptions(cell: string): OptionLine[] {
  const out: OptionLine[] = []
  for (const raw of cell.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(':')
    if (parts.length >= 3 && /^-?\d+(\.\d+)?$/.test(parts[0].trim())) {
      out.push({ order: Number(parts[0]), id: parts[1].trim(), text: parts.slice(2).join(':').replace(/^"|"$/g, ''), raw: line })
    } else if (parts.length >= 2) {
      out.push({ id: parts[0].trim(), text: parts.slice(1).join(':').replace(/^"|"$/g, ''), raw: line })
    }
  }
  return out
}

/** A rule's text split into its random variants (a line that is exactly "OR"). */
export function textVariants(text: string): string[] {
  const parts: string[][] = [[]]
  for (const l of text.split(/\r?\n/)) {
    if (l.trim() === 'OR') parts.push([])
    else parts[parts.length - 1].push(l)
  }
  return parts.map((p) => p.join('\n').replace(/^\n+|\n+$/g, '')).filter((p, i, a) => p || a.length === 1)
}

/** Paragraphs of a text (blank lines separate them, as in the game's text panel). */
export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

/** The `$option == x` value of a rule's conditions, if it has one. */
export function optionCondition(conds: Condition[]): string | null {
  for (const c of conds) if (c.kind === 'memory' && !c.negate && c.key === '$option' && c.op === '==') return c.value ?? null
  return null
}

/** Score FireBest uses: one per condition line, plus `score:N` values. */
export function ruleScore(conds: Condition[]): number {
  let s = 0
  for (const c of conds) s += c.kind === 'score' ? c.score : 1 + (c.score ?? 0)
  return s
}

/** Tokens like $playerName / $global.foo in a text. */
export const TOKEN_RE = /\$[A-Za-z_][\w.]*/g
