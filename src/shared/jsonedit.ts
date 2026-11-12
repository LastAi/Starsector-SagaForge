// Copied from Ship Editor (src/shared/jsonedit.ts); may drift, see docs/PLAN.md §2.
/**
 * Change a loose-JSON file while keeping its comments and formatting.
 *
 * updateLooseText(text, newValue) compares the file's current content with newValue and
 * produces the smallest text edits that turn one into the other:
 *   - unchanged values keep their exact original text (e.g. `.8`, bare words, comments)
 *   - changed scalars are replaced in place
 *   - added keys / array items are inserted after the last existing one, matching its
 *     indentation and separator style
 *   - removed keys / items are cut out together with their separator (whole lines when
 *     they sat on their own lines)
 * The result is parsed again and compared with newValue; if they differ, it throws rather
 * than return something wrong.
 */
import { parseLoose, parseLooseTree, type JArray, type JNode, type JObject } from './loosejson'

export interface TextEdit { start: number; end: number; text: string }

interface Entry { start: number; end: number; sep: number }

interface Ctx {
  src: string
  unit: string
  eol: string
  edits: TextEdit[]
}

export interface TextFormat { unit: string; eol: string }

/** Indentation unit and line ending used by a file (defaults: 4 spaces, \n). */
export function detectFormat(src: string): TextFormat {
  const eol = src.includes('\r\n') ? '\r\n' : '\n'
  let tabs = 0
  let minSpaces = Infinity
  for (const line of src.split(/\r?\n/)) {
    const m = /^([ \t]+)\S/.exec(line)
    if (!m) continue
    if (m[1].startsWith('\t')) tabs++
    else minSpaces = Math.min(minSpaces, m[1].length)
  }
  const unit = tabs > 0 && (minSpaces === Infinity || tabs >= 3) ? '\t' : ' '.repeat(Number.isFinite(minSpaces) ? Math.min(minSpaces, 8) : 4)
  return { unit, eol }
}

/** Serialize a value for writing into a file (new content only). */
export function serialize(v: unknown, indent: string, fmt: TextFormat): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return numStr(v)
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  const inner = indent + fmt.unit
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.every((x) => x === null || typeof x !== 'object')) {
      const inline = '[' + v.map((x) => serialize(x, indent, fmt)).join(', ') + ']'
      if (inline.length <= 100) return inline
    }
    return '[' + fmt.eol + v.map((x) => inner + serialize(x, inner, fmt)).join(',' + fmt.eol) + fmt.eol + indent + ']'
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
  if (entries.length === 0) return '{}'
  return '{' + fmt.eol + entries.map(([k, x]) => inner + JSON.stringify(k) + ': ' + serialize(x, inner, fmt)).join(',' + fmt.eol) + fmt.eol + indent + '}'
}

/** Numbers as written by the editor: integers as-is, others rounded to 6 decimals. */
export function numStr(v: number): string {
  if (!Number.isFinite(v)) return '0'
  if (Number.isInteger(v)) return Object.is(v, -0) ? '0' : String(v)
  const r = Math.round(v * 1e6) / 1e6
  return String(Object.is(r, -0) ? 0 : r)
}

export function updateLooseText(src: string, value: unknown): string {
  const { root } = parseLooseTree(src)
  const ctx: Ctx = { src, ...detectFormat(src), edits: [] }
  diff(ctx, root, value)
  const out = applyEdits(src, ctx.edits)
  const back = parseLoose(out).value
  if (!looseEqual(back, value)) {
    throw new Error('Internal error: the edited file did not read back as expected, so it was not written')
  }
  return out
}

export function applyEdits(src: string, edits: TextEdit[]): string {
  // Apply from the end of the file backwards so earlier offsets stay valid. For edits that
  // start at the same offset, the one reaching further is applied first (a deletion before
  // an insertion at its start).
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = src
  let limit = Infinity
  for (const e of sorted) {
    if (e.end > limit) throw new Error(`Internal error: overlapping edits at offset ${e.start}`)
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
    limit = e.start
  }
  return out
}

// --- diffing ---------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

function diff(ctx: Ctx, node: JNode, nv: unknown): void {
  if (node.kind === 'object' && isObj(nv)) return diffObject(ctx, node, nv)
  if (node.kind === 'array' && Array.isArray(nv)) return diffArray(ctx, node, nv)
  if (node.kind === 'scalar' && scalarEqual(node.value, nv)) return
  replaceNode(ctx, node, nv)
}

function replaceNode(ctx: Ctx, node: JNode, nv: unknown): void {
  ctx.edits.push({ start: node.start, end: node.end, text: serialize(nv, lineIndent(ctx.src, node.start), ctx) })
}

function diffObject(ctx: Ctx, node: JObject, nv: Record<string, unknown>): void {
  const present = (k: string) => Object.prototype.hasOwnProperty.call(nv, k) && nv[k] !== undefined
  const last = new Map<string, number>()
  node.props.forEach((p, i) => last.set(p.key, i))

  const removed = new Set<number>()
  node.props.forEach((p, i) => { if (!present(p.key)) removed.add(i) })
  const added = Object.entries(nv).filter(([k, v]) => v !== undefined && !last.has(k))

  if (removed.size === node.props.length && (removed.size > 0 || added.length > 0)) {
    replaceNode(ctx, node, nv) // nothing left to anchor new keys to
    return
  }
  for (const [k, i] of last) if (present(k)) diff(ctx, node.props[i].value, nv[k])

  const entries: Entry[] = node.props.map((p) => ({ start: p.keyStart, end: p.value.end, sep: p.sep }))
  const ranges = removeEntries(ctx, entries, removed)
  if (added.length) {
    insertEntries(ctx, node, entries, removed, ranges, added.map(([k, v]) => (ind: string) => JSON.stringify(k) + ': ' + serialize(v, ind, ctx)))
  }
}

function diffArray(ctx: Ctx, node: JArray, nv: unknown[]): void {
  const n = node.items.length
  const m = nv.length
  if (n === m) {
    node.items.forEach((it, i) => diff(ctx, it.value, nv[i]))
    return
  }
  if (n === 0 || m === 0) {
    replaceNode(ctx, node, nv)
    return
  }
  for (let i = 0; i < Math.min(n, m); i++) diff(ctx, node.items[i].value, nv[i])
  const entries: Entry[] = node.items.map((it) => ({ start: it.value.start, end: it.value.end, sep: it.sep }))
  if (m < n) {
    const removed = new Set<number>()
    for (let i = m; i < n; i++) removed.add(i)
    removeEntries(ctx, entries, removed)
  } else {
    insertEntries(ctx, node, entries, new Set(), [], nv.slice(n).map((v) => (ind: string) => serialize(v, ind, ctx)))
  }
}

/** Cut out entries with their separators. Returns the removed ranges. */
function removeEntries(ctx: Ctx, entries: Entry[], removed: Set<number>): [number, number][] {
  if (removed.size === 0) return []
  const raw: [number, number][] = []
  entries.forEach((e, i) => {
    if (!removed.has(i)) return
    if (e.sep >= 0) {
      raw.push([e.start, e.sep + 1])
      return
    }
    // The final entry has no separator after it: also drop the separator of the last entry
    // that stays, so the list doesn't end up with a trailing separator it didn't have.
    let j = i - 1
    while (j >= 0 && removed.has(j)) j--
    if (j >= 0 && entries[j].sep >= 0) raw.push([entries[j].sep, e.end])
    else raw.push([e.start, e.end])
  })
  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of raw) {
    const top = merged[merged.length - 1]
    if (top && r[0] <= top[1]) top[1] = Math.max(top[1], r[1])
    else merged.push([r[0], r[1]])
  }
  const { src } = ctx
  for (const r of merged) {
    // When the removed text had its own line(s), remove those lines entirely.
    const ls = lineStart(src, r[0])
    const le = lineEnd(src, r[1])
    if (src.slice(ls, r[0]).trim() === '' && src.slice(r[1], le).trim() === '') {
      r[0] = ls
      r[1] = src.startsWith('\r\n', le) ? le + 2 : src[le] === '\n' ? le + 1 : le
    }
    ctx.edits.push({ start: r[0], end: r[1], text: '' })
  }
  return merged
}

/** Insert new entries after the last surviving one, in the container's style. */
function insertEntries(
  ctx: Ctx, container: JObject | JArray, entries: Entry[], removed: Set<number>,
  removedRanges: [number, number][], texts: ((indent: string) => string)[]
): void {
  const { src } = ctx
  let lastIdx = -1
  entries.forEach((_, i) => { if (!removed.has(i)) lastIdx = i })
  const anchor = entries[lastIdx]
  const multiline = src.slice(container.start, container.end).includes('\n')
  const ind = startsLine(src, anchor.start) ? lineIndent(src, anchor.start) : lineIndent(src, container.start) + ctx.unit
  const sepRemoved = anchor.sep >= 0 && removedRanges.some(([a, b]) => a <= anchor.sep && anchor.sep < b)
  const hasSep = anchor.sep >= 0 && !sepRemoved
  const trailing = hasSep && lastIdx === entries.length - 1 // the file ends lists with a separator

  if (multiline) {
    const body = texts.map((t) => ctx.eol + ind + t(ind)).join(',') + (trailing ? ',' : '')
    if (hasSep) {
      const pos = restIsTrivia(src, anchor.sep + 1) ? lineEnd(src, anchor.sep + 1) : anchor.sep + 1
      ctx.edits.push({ start: pos, end: pos, text: body })
    } else {
      const pos = restIsTrivia(src, anchor.end) ? lineEnd(src, anchor.end) : anchor.end
      if (pos === anchor.end) ctx.edits.push({ start: pos, end: pos, text: ',' + body })
      else {
        ctx.edits.push({ start: anchor.end, end: anchor.end, text: ',' })
        ctx.edits.push({ start: pos, end: pos, text: body })
      }
    }
  } else {
    const body = texts.map((t) => ' ' + t(ind)).join(',') + (trailing ? ',' : '')
    if (hasSep) ctx.edits.push({ start: anchor.sep + 1, end: anchor.sep + 1, text: body })
    else ctx.edits.push({ start: anchor.end, end: anchor.end, text: ',' + body })
  }
}

// --- text helpers ------------------------------------------------------------

const lineStart = (s: string, pos: number) => Math.max(s.lastIndexOf('\n', pos - 1) + 1, 0)

function lineEnd(s: string, pos: number): number {
  let i = pos
  while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
  return i
}

function lineIndent(s: string, pos: number): string {
  const ls = lineStart(s, pos)
  let i = ls
  while (i < pos && (s[i] === ' ' || s[i] === '\t')) i++
  return s.slice(ls, i)
}

const startsLine = (s: string, pos: number) => s.slice(lineStart(s, pos), pos).trim() === ''

/** True if the rest of the line is only whitespace and/or a line comment. */
function restIsTrivia(s: string, pos: number): boolean {
  const rest = s.slice(pos, lineEnd(s, pos)).trimStart()
  return rest === '' || rest.startsWith('#') || rest.startsWith('//')
}

// --- comparison --------------------------------------------------------------

function scalarEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) < 1e-9
  return a === b
}

/** Equality used to verify a write: numbers within 1e-6, undefined keys ignored. */
export function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
  if (b === undefined) return a === undefined || a === null
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => looseEqual(x, b[i] === undefined ? null : b[i]))
  if (isObj(a) && isObj(b)) {
    const bk = Object.keys(b).filter((k) => b[k] !== undefined)
    return bk.length === Object.keys(a).length && bk.every((k) => Object.prototype.hasOwnProperty.call(a, k) && looseEqual(a[k], b[k]))
  }
  return a === b
}
