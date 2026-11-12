// Copied from Ship Editor (src/shared/loosejson.ts); may drift, see docs/PLAN.md §2.
/**
 * Parser for Starsector's "loose JSON" (.ship, .skin, .variant, .wpn, .proj, .system,
 * mod_info.json, ...).
 *
 * The game reads these with an old version of org.json, which accepts much more than
 * standard JSON. We mirror its behaviour so that anything the game can load, we can load:
 *   - comments: `# ...`, `// ...`, `/* ... *\/`
 *   - single- or double-quoted strings
 *   - unquoted keys and values (`type:SYNERGY`, `[CIVILIAN]`); unquoted text runs until one
 *     of  , : ] } / \ " [ { ; = #  and is trimmed, so it may contain inner spaces
 *   - `,` or `;` between items, trailing separators, `=` or `=>` instead of `:`
 *   - `(` `)` as array brackets, empty array slots (`[1,,2]`) become null
 *   - numbers like `.8`, `+3`, `1.`, `10.0f`, `0x1F`; true/false/null in any case
 *   - anything after the root value is ignored (we report it as a warning)
 *
 * The parser builds a syntax tree that records where every value sits in the text, so that
 * jsonedit.ts can change a file while keeping its comments and formatting.
 */

export class LooseJsonError extends Error {
  constructor(
    readonly reason: string,
    readonly line: number,
    readonly column: number,
    readonly offset: number
  ) {
    super(`${reason} (line ${line}, column ${column})`)
    this.name = 'LooseJsonError'
  }
}

/** Offsets are into the source text; `end` is exclusive. */
export interface JScalar { kind: 'scalar'; start: number; end: number; value: unknown }
export interface JProp { key: string; keyStart: number; value: JNode; /** offset of the , or ; after the value, or -1 */ sep: number }
export interface JObject { kind: 'object'; start: number; end: number; props: JProp[] }
export interface JItem { value: JNode; sep: number }
export interface JArray { kind: 'array'; start: number; end: number; items: JItem[] }
export type JNode = JScalar | JObject | JArray

export interface LooseParseResult {
  value: unknown
  warnings: string[]
}

/** Characters that end an unquoted value (same set as org.json). */
const STOP = ',:]}/\\"[{;=#'

export function parseLooseTree(text: string): { root: JNode; warnings: string[] } {
  const p = new Parser(text)
  const root = p.parseDocument()
  return { root, warnings: p.warnings }
}

export function parseLoose(text: string): LooseParseResult {
  const { root, warnings } = parseLooseTree(text)
  return { value: nodeValue(root), warnings }
}

/** Parse and require the root to be an object (true for every Starsector data file). */
export function parseLooseObject(text: string): { value: Record<string, unknown>; warnings: string[] } {
  const r = parseLoose(text)
  if (r.value === null || typeof r.value !== 'object' || Array.isArray(r.value)) {
    throw new LooseJsonError('Expected the file to contain a { ... } object', 1, 1, 0)
  }
  return { value: r.value as Record<string, unknown>, warnings: r.warnings }
}

/** Plain value of a tree node. For duplicate keys the last one wins, like the game. */
export function nodeValue(n: JNode): unknown {
  if (n.kind === 'scalar') return n.value
  if (n.kind === 'array') return n.items.map((i) => nodeValue(i.value))
  const obj: Record<string, unknown> = {}
  for (const p of n.props) {
    // defineProperty so that a key like "__proto__" is stored as data, not as a prototype
    Object.defineProperty(obj, p.key, { value: nodeValue(p.value), enumerable: true, writable: true, configurable: true })
  }
  return obj
}

/** org.json's stringToValue for unquoted text. */
export function stringToValue(s: string): unknown {
  const l = s.toLowerCase()
  if (l === 'true') return true
  if (l === 'false') return false
  if (l === 'null') return null
  const b = s[0]
  if ((b >= '0' && b <= '9') || b === '.' || b === '-' || b === '+') {
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16)
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(s)) {
      return Number(s.replace(/[fFdD]$/, ''))
    }
  }
  return s
}

class Parser {
  private i = 0
  readonly warnings: string[] = []

  constructor(private readonly s: string) {
    if (s.charCodeAt(0) === 0xfeff) this.i = 1 // byte-order mark
  }

  parseDocument(): JNode {
    if (this.nextClean() === '') this.fail('The file is empty', 0)
    this.back()
    const value = this.nextValue()
    const restAt = this.i
    if (this.nextClean() !== '') {
      const { line, column } = this.lineCol(restAt)
      this.warnings.push(
        `Extra text after the end of the data at line ${line}, column ${column} is ignored by the game`
      )
    }
    return value
  }

  // --- low level ----------------------------------------------------------

  /** Returns the next char that is not whitespace or part of a comment, or '' at end. */
  private nextClean(): string {
    for (;;) {
      const c = this.s[this.i++]
      if (c === undefined) return ''
      if (c === '/') {
        const n = this.s[this.i]
        if (n === '/') {
          this.skipLine()
          continue
        }
        if (n === '*') {
          const end = this.s.indexOf('*/', this.i + 1)
          if (end < 0) this.fail('Comment opened with /* is never closed', this.i - 1)
          this.i = end + 2
          continue
        }
        return c
      }
      if (c === '#') {
        this.skipLine()
        continue
      }
      if (c > ' ') return c
    }
  }

  private skipLine(): void {
    while (this.i < this.s.length && this.s[this.i] !== '\n' && this.s[this.i] !== '\r') this.i++
  }

  private back(): void {
    this.i--
  }

  private lineCol(at: number): { line: number; column: number } {
    let line = 1
    let column = 1
    const end = Math.min(at, this.s.length)
    for (let k = 0; k < end; k++) {
      if (this.s[k] === '\n') {
        line++
        column = 1
      } else column++
    }
    return { line, column }
  }

  private fail(reason: string, at = this.i): never {
    const { line, column } = this.lineCol(at)
    throw new LooseJsonError(reason, line, column, at)
  }

  // --- values -------------------------------------------------------------

  private nextValue(): JNode {
    const c = this.nextClean()
    const start = this.i - 1
    switch (c) {
      case '"':
      case "'":
        return { kind: 'scalar', start, value: this.readString(c), end: this.i }
      case '{':
        return this.readObject(start)
      case '[':
      case '(':
        return this.readArray(start)
    }
    const raw = this.readUnquoted(start)
    if (raw === '') {
      this.fail(c === '' ? 'Unexpected end of file' : `Unexpected '${c}'`, start)
    }
    return { kind: 'scalar', start, end: start + raw.length, value: stringToValue(raw) }
  }

  private readUnquoted(begin: number): string {
    let j = begin
    while (j < this.s.length) {
      const ch = this.s[j]
      if (ch < ' ' || STOP.includes(ch)) break
      j++
    }
    this.i = j
    return this.s.slice(begin, j).trim()
  }

  private readString(quote: string): string {
    const start = this.i - 1
    let out = ''
    for (;;) {
      const c = this.s[this.i++]
      if (c === undefined || c === '\n' || c === '\r') this.fail('String is never closed', start)
      if (c === quote) return out
      if (c !== '\\') {
        out += c
        continue
      }
      const e = this.s[this.i++]
      switch (e) {
        case 'b': out += '\b'; break
        case 't': out += '\t'; break
        case 'n': out += '\n'; break
        case 'f': out += '\f'; break
        case 'r': out += '\r'; break
        case 'u':
        case 'x': {
          const len = e === 'u' ? 4 : 2
          const hex = this.s.substr(this.i, len)
          if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) this.fail(`Bad \\${e} escape`, this.i - 2)
          out += String.fromCharCode(parseInt(hex, 16))
          this.i += len
          break
        }
        case undefined:
          this.fail('String is never closed', start)
        default:
          out += e
      }
    }
  }

  private readKey(): string {
    const c = this.nextClean()
    if (c === '"' || c === "'") return this.readString(c)
    const begin = this.i - 1
    const raw = this.readUnquoted(begin)
    if (raw === '') this.fail(c === '' ? 'Unexpected end of file' : `Expected a key but found '${c}'`, begin)
    return raw
  }

  private readObject(open: number): JObject {
    const node: JObject = { kind: 'object', start: open, end: -1, props: [] }
    const seen = new Set<string>()
    for (;;) {
      let c = this.nextClean()
      if (c === '') this.fail('Object opened here is never closed with }', open)
      if (c === '}') { node.end = this.i; return node }
      this.back()
      // the key starts at the next non-trivia character
      this.nextClean()
      const keyStart = this.i - 1
      this.back()
      const key = this.readKey()
      c = this.nextClean()
      if (c === '=') {
        if (this.s[this.i] === '>') this.i++
      } else if (c !== ':') {
        this.fail(`Expected ':' after "${key}"`, this.i - 1)
      }
      if (seen.has(key)) {
        const { line } = this.lineCol(keyStart)
        this.warnings.push(`Duplicate key "${key}" at line ${line}; the later value is used`)
      }
      seen.add(key)
      const prop: JProp = { key, keyStart, value: this.nextValue(), sep: -1 }
      node.props.push(prop)
      c = this.nextClean()
      if (c === ',' || c === ';') {
        prop.sep = this.i - 1
        if (this.nextClean() === '}') { node.end = this.i; return node }
        this.back()
      } else if (c === '}') {
        node.end = this.i
        return node
      } else {
        this.fail(
          c === '' ? 'Object opened here is never closed with }' : `Expected ',' or '}' after the value of "${key}"`,
          c === '' ? open : this.i - 1
        )
      }
    }
  }

  private readArray(open: number): JArray {
    const node: JArray = { kind: 'array', start: open, end: -1, items: [] }
    let c = this.nextClean()
    if (c === ']' || c === ')') { node.end = this.i; return node }
    this.back()
    for (;;) {
      c = this.nextClean()
      this.back()
      const value: JNode = c === ',' || c === ';'
        ? { kind: 'scalar', start: this.i, end: this.i, value: null } // empty slot
        : this.nextValue()
      const item: JItem = { value, sep: -1 }
      node.items.push(item)
      c = this.nextClean()
      if (c === ',' || c === ';') {
        item.sep = this.i - 1
        const n = this.nextClean()
        if (n === ']' || n === ')') { node.end = this.i; return node }
        this.back()
      } else if (c === ']' || c === ')') {
        node.end = this.i
        return node
      } else {
        this.fail(
          c === '' ? 'Array opened here is never closed with ]' : `Expected ',' or ']' in array`,
          c === '' ? open : this.i - 1
        )
      }
    }
  }
}
