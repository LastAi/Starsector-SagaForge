/**
 * Task #64 (PLAN.md §10.6): versions by installed mods. One item (a person, a quest, a system, …)
 * has versions per combination of the mod's optional mods: the same id, with the fields a version
 * changes. Pure helpers shared by the editor, the export, the checks and Play mode.
 *
 * Two forms:
 * - In the plan (sagaforge/*.json): `versions: [{ mods: ["mod1"], set: { "<path>": value } }]`.
 *   A version holds when all its mods count, so 2 optional mods give 4 cells: Base, Mod1, Mod2,
 *   Mod1 + Mod2. The most specific version wins, field by field (inheritance).
 * - In SagaLib's files: `versions: [{ id, modsWith, modsWithout?, modsAny?, set }]`, resolved the
 *   same way (SagaLib docs/FORMAT.md "Versions by installed mods"; golden test/golden/versions.json).
 *   The export computes them from each combination's exported JSON (`emitRuntimeVersions`).
 *
 * Paths: segments joined by "."; a segment is a key, or `key[x]` = the element of the array `key`
 * whose "id" (else "token") is x (the same as translation keys). `null` removes the key.
 *
 * #67 U18 (SagaLib 1.4): a version's `mods` may also hold setting tokens `setting:<id>=<value>`:
 * the version needs that value of one of the mod's own LunaLib settings (marked for versions),
 * recorded when the game started. They go through everything that works on `mods` (keys, cells,
 * resolution); SagaLib's files carry them as `settingsWith: ["<id>=<value>"]`.
 */

/** The prefix of a setting token in a version's `mods`. */
export const SETTING_TOKEN = 'setting:'
/** `setting:<id>=<value>`. */
export const settingToken = (id: string, value: string): string => `${SETTING_TOKEN}${id}=${value}`
export const isSettingToken = (x: string): boolean => x.startsWith(SETTING_TOKEN)
/** The setting and value of a token (null for a mod id or a token without "="). */
export function parseSettingToken(x: string): { id: string; value: string } | null {
  if (!isSettingToken(x)) return null
  const rest = x.slice(SETTING_TOKEN.length)
  const i = rest.indexOf('=')
  return i > 0 ? { id: rest.slice(0, i), value: rest.slice(i + 1) } : null
}
/** The setting a token is about ('' for a mod). */
const tokenSetting = (x: string): string => (isSettingToken(x) ? (parseSettingToken(x)?.id ?? x) : '')
/** The mods of a combination (no setting tokens). */
export const modsOnly = (l: Iterable<string>): string[] => [...l].filter((x) => !isSettingToken(x))
/** The setting tokens of a combination. */
export const tokensOnly = (l: Iterable<string>): string[] => [...l].filter(isSettingToken)
/** False when the combination holds two values of one setting (they never hold together). */
export function tokensPossible(l: Iterable<string>): boolean {
  const seen = new Set<string>()
  for (const x of l) { const s = tokenSetting(x); if (!s) continue; if (seen.has(s)) return false; seen.add(s) }
  return true
}

export interface ItemVersion {
  /** The optional mods that must count for this version (sorted); may hold setting tokens (#67 U18). */
  mods: string[]
  /** Path → value (null = removed). */
  set: Record<string, unknown>
}

export interface Versioned { versions?: ItemVersion[] }

/** A version in SagaLib's files. */
export interface RtVersion {
  id?: string
  modsWith?: string[]
  modsWithout?: string[]
  modsAny?: string[][]
  /** #67 U18 (SagaLib 1.4): "<setting id>=<value>": the value recorded when the game started. */
  settingsWith?: string[]
  set: Record<string, unknown>
}

/** A version's settingsWith as tokens of the on-set. */
export const rtTokens = (v: RtVersion): string[] => (v.settingsWith ?? []).map((s) => `${SETTING_TOKEN}${s}`)

/** A runtime version for exactly these mods and setting tokens (never a token in modsWith). */
export function rtVersion(c: string[], set: Record<string, unknown>): RtVersion {
  const ms = modsOnly(c)
  const ts = tokensOnly(c).map((t) => t.slice(SETTING_TOKEN.length))
  return { id: comboKey(c), ...(ms.length || !ts.length ? { modsWith: ms } : {}), ...(ts.length ? { settingsWith: ts } : {}), set }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(norm(a)) === JSON.stringify(norm(b))
/** Key order doesn't matter when comparing. */
function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm)
  if (isObj(v)) return Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, norm(v[k])]))
  return v
}

/** "base" or the mods sorted and joined with "+" (SagaLib's stored choice). */
export const comboKey = (mods: Iterable<string>): string => {
  const l = [...new Set(mods)].sort()
  return l.length ? l.join('+') : 'base'
}
export const comboOf = (key: string): string[] => (key === 'base' || !key ? [] : key.split('+'))

// ---------------------------------------------------------------- paths

interface Seg { key: string; sel?: string }

export function parsePath(path: string): Seg[] {
  const out: Seg[] = []
  // split on "." outside brackets
  let cur = ''
  let depth = 0
  for (const ch of path) {
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (ch === '.' && depth === 0) { out.push(seg(cur)); cur = '' } else cur += ch
  }
  if (cur || !out.length) out.push(seg(cur))
  return out
}
function seg(s: string): Seg {
  const m = /^(.*?)\[(.*)\]$/.exec(s)
  return m ? { key: m[1], sel: m[2] } : { key: s }
}

/** An array element's selector: its id, else its token (as SagaLib's TextKeys). */
export function elemSel(v: unknown): string | null {
  if (!isObj(v)) return null
  if (typeof v.id === 'string' && v.id) return v.id
  if (typeof v.token === 'string' && v.token) return v.token
  return null
}

export function getAt(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const s of parsePath(path)) {
    if (!isObj(cur)) return undefined
    cur = cur[s.key]
    if (s.sel !== undefined) {
      if (!Array.isArray(cur)) return undefined
      cur = cur.find((e) => elemSel(e) === s.sel)
    }
  }
  return cur
}

/** Sets (or with null/undefined removes) the value at a path; returns false when the path can't be followed. */
export function setAt(root: Obj, path: string, value: unknown): boolean {
  const segs = parsePath(path)
  let cur: Obj = root
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const last = i === segs.length - 1
    if (s.sel === undefined) {
      if (last) {
        if (value === null || value === undefined) delete cur[s.key]
        else cur[s.key] = clone(value)
        return true
      }
      if (cur[s.key] === undefined || cur[s.key] === null) { if (value === null || value === undefined) return true; cur[s.key] = {} }
      if (!isObj(cur[s.key])) return false
      cur = cur[s.key] as Obj
    } else {
      const arr = cur[s.key]
      if (!Array.isArray(arr)) return false
      const idx = arr.findIndex((e) => elemSel(e) === s.sel)
      if (last) {
        if (value === null || value === undefined) { if (idx >= 0) arr.splice(idx, 1); return true }
        if (idx >= 0) arr[idx] = clone(value)
        else return false
        return true
      }
      if (idx < 0) return false
      cur = arr[idx] as Obj
    }
  }
  return true
}

/**
 * The paths where `after` differs from `before`, with their new values (removed = null). Objects
 * are compared key by key; arrays of objects with the same ids in the same order element by
 * element; anything else is replaced whole.
 */
export function diffPaths(before: unknown, after: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const walk = (a: unknown, b: unknown, p: string) => {
    if (same(a, b)) return
    if (isObj(a) && isObj(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (k === 'versions' && !p) continue
        const cp = p ? `${p}.${k}` : k
        if (!(k in b) || b[k] === undefined) { if (a[k] !== undefined) out[cp] = null; continue }
        walk(a[k], b[k], cp)
      }
      return
    }
    if (p && Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.length > 0) {
      const ia = a.map(elemSel), ib = b.map(elemSel)
      if (ia.every((x, i) => x !== null && x === ib[i]) && new Set(ia).size === ia.length) {
        a.forEach((x, i) => walk(x, b[i], `${p}[${ia[i]}]`))
        return
      }
    }
    out[p] = b === undefined ? null : clone(b)
  }
  walk(before, after, prefix)
  return out
}

// ---------------------------------------------------------------- resolution (SagaLib's algorithm)

const has = (on: Set<string>, id: string) => on.has(id)
export function versionHolds(v: RtVersion, on: Set<string>): boolean {
  return (v.modsWith ?? []).every((id) => has(on, id)) && (v.modsWithout ?? []).every((id) => !has(on, id)) && (v.modsAny ?? []).every((g) => g.some((id) => has(on, id))) && rtTokens(v).every((t) => has(on, t))
}
export const specificity = (v: RtVersion): number => (v.modsWith?.length ?? 0) + (v.modsWithout?.length ?? 0) + (v.modsAny?.length ?? 0) + (v.settingsWith?.length ?? 0)

export interface Resolved<T> {
  value: T
  /** Paths two equally specific versions set differently (the later one won), sorted. */
  conflicts: string[]
  /** Paths that couldn't be followed. */
  errors: string[]
}

/** An item in SagaLib's format resolved for these mods (SagaLib's Versions.resolve). */
export function resolveRuntime<T extends object>(item: T & { versions?: RtVersion[] }, on: Iterable<string>): Resolved<T> {
  const set = new Set(on)
  const { versions, ...rest } = item as Obj & { versions?: RtVersion[] }
  const value = clone(rest) as Obj
  const applicable = (versions ?? []).map((v, i) => ({ v, i })).filter((x) => versionHolds(x.v, set)).sort((a, b) => specificity(a.v) - specificity(b.v) || a.i - b.i)
  const errors: string[] = []
  // within a version, paths apply in sorted order (a parent before its children), as SagaLib (its JSON keeps no key order)
  for (const { v } of applicable) for (const p of Object.keys(v.set ?? {}).sort()) if (!setAt(value, p, v.set[p])) errors.push(p)
  const conflicts: string[] = []
  const paths = new Set(applicable.flatMap((x) => Object.keys(x.v.set ?? {})))
  for (const p of paths) {
    const setters = applicable.filter((x) => p in (x.v.set ?? {}))
    const top = Math.max(...setters.map((x) => specificity(x.v)))
    const best = setters.filter((x) => specificity(x.v) === top)
    if (best.length > 1 && best.some((x) => !same(x.v.set[p], best[0].v.set[p]))) conflicts.push(p)
  }
  return { value: value as T, conflicts: conflicts.sort(), errors }
}

/** The plan's versions in SagaLib's form. */
export const asRuntime = (vs: ItemVersion[] | undefined): RtVersion[] => (vs ?? []).map((v) => rtVersion([...v.mods], v.set))

/** A plan item resolved for the mods that count (the versions mentioned and not in `on` don't apply). */
export function resolveItem<T extends Versioned>(item: T, on: Iterable<string>): Resolved<T> {
  if (!item.versions?.length) { const { versions: _v, ...rest } = item as T & Obj; return { value: rest as T, conflicts: [], errors: [] } }
  const r = resolveRuntime({ ...(item as Obj), versions: asRuntime(item.versions) }, on)
  return r as Resolved<T>
}

/** Every mod (and #67 U18 setting token) an item's versions mention, sorted. */
export function mentionedMods(item: Versioned | null | undefined): string[] {
  return [...new Set((item?.versions ?? []).flatMap((v) => v.mods))].sort()
}

/**
 * Every subset of the mods, smallest first (the base first). At most `max` mods; #67 U18: setting
 * tokens aren't counted in `max`, and a subset never holds two values of one setting.
 */
export function subsets(mods: string[], max = 6): string[][] {
  const all = [...new Set(mods)].sort()
  const l = [...modsOnly(all).slice(0, max), ...tokensOnly(all)]
  const out: string[][] = []
  for (let k = 0; k < 1 << l.length; k++) { const c = l.filter((_, i) => k & (1 << i)); if (tokensPossible(c)) out.push(c.sort()) }
  return out.sort((a, b) => a.length - b.length || a.join('+').localeCompare(b.join('+')))
}

/** #67 U18: how many combinations SagaLib parses for these mods and tokens (each mod on/off, each setting one of its mentioned values or another). */
export function combinationCount(mentioned: string[]): number {
  const l = [...new Set(mentioned)]
  const per = new Map<string, number>()
  for (const t of tokensOnly(l)) { const s = tokenSetting(t); per.set(s, (per.get(s) ?? 1) + 1) }
  return [...per.values()].reduce((a, b) => a * b, 2 ** modsOnly(l).length)
}

// ---------------------------------------------------------------- editing a version

/** The version of exactly these mods (created when `create`). */
export function versionOf(item: Versioned, mods: string[], create = false): ItemVersion | null {
  const key = comboKey(mods)
  let v = item.versions?.find((x) => comboKey(x.mods) === key) ?? null
  if (!v && create) {
    // #67 (found by the user, 2026-11-21): in the app the item is Svelte state, which keeps a reactive
    // copy of what is assigned to it. `((item.versions ??= []), item.versions).push(v)` pushed into the plain array
    // (the value of the assignment), not the one the state holds, so an item's first version was lost
    // (empty, then pruned: the edit vanished). Read the list and the new element back through the item.
    if (!item.versions) item.versions = []
    item.versions.push({ mods: comboOf(key), set: {} })
    v = item.versions[item.versions.length - 1]
  }
  return v
}

/** The item as the version would be without its own value at `path` (what it inherits). */
export function inherited<T extends Versioned>(item: T, mods: string[], path: string): unknown {
  const key = comboKey(mods)
  const c = clone(item)
  const own = c.versions?.find((x) => comboKey(x.mods) === key)
  if (own) delete own.set[path]
  return getAt(resolveItem(c, mods).value, path)
}

/**
 * Applies an edit made on the item as it looks in a version: every changed field becomes that
 * version's value, and a field changed back to what it inherits is no longer set there.
 */
export function editInVersion<T extends Versioned>(item: T, mods: string[], fn: (resolved: T) => void, baseOnly?: (path: string) => boolean): void {
  if (!mods.length) { fn(item); return }
  const before = resolveItem(item, mods).value
  const after = clone(before)
  fn(after)
  const d = diffPaths(before, after)
  if (!Object.keys(d).length) return
  const v = versionOf(item, mods, true)!
  for (const [p, val] of Object.entries(d)) {
    // e.g. a node's place on the chart: the same in every version
    if (baseOnly?.(p) && setAt(item as unknown as Obj, p, val)) continue
    // children of a path set whole are part of it now
    for (const k of Object.keys(v.set)) if (k.startsWith(`${p}.`) || k.startsWith(`${p}[`)) delete v.set[k]
    v.set[p] = val
    if (same(inherited(item, mods, p) ?? null, val ?? null)) delete v.set[p]
  }
  pruneVersions(item)
}

/** Revert one field of a version: it inherits again. */
export function revertPath(item: Versioned, mods: string[], path: string): void {
  const v = versionOf(item, mods)
  if (!v) return
  delete v.set[path]
  pruneVersions(item)
}

/** Sets one path in a version (answering a conflict in the combined cell). */
export function setInVersion(item: Versioned, mods: string[], path: string, value: unknown): void {
  const v = versionOf(item, mods, true)!
  v.set[path] = clone(value) ?? null
}

/** Drops empty versions (and the list when none is left). */
export function pruneVersions(item: Versioned): void {
  if (!item.versions) return
  item.versions = item.versions.filter((v) => Object.keys(v.set).length)
  if (!item.versions.length) delete item.versions
}

/** One cell of the versions strip: its own fields, what it inherits, and its conflicts. */
export interface CellInfo {
  mods: string[]
  key: string
  own: string[]
  conflicts: { path: string; values: { from: string; value: unknown }[] }[]
}

export function cellInfo(item: Versioned, mods: string[]): CellInfo {
  const key = comboKey(mods)
  const own = Object.keys(versionOf(item, mods)?.set ?? {})
  const conflicts: CellInfo['conflicts'] = []
  if (mods.length > 1) {
    for (const p of resolveItem(item, mods).conflicts) {
      const setters = (item.versions ?? []).filter((v) => v.mods.every((m) => mods.includes(m)) && p in v.set)
      const top = Math.max(...setters.map((v) => v.mods.length))
      conflicts.push({ path: p, values: setters.filter((v) => v.mods.length === top).map((v) => ({ from: comboKey(v.mods), value: v.set[p] })) })
    }
  }
  return { mods, key, own, conflicts }
}

// ---------------------------------------------------------------- export

/**
 * SagaLib `versions` for an item whose exported JSON differs per combination: for each combination
 * (smallest first), the paths where it differs from what SagaLib would resolve from the versions
 * already written become a version for exactly those mods. So SagaLib's result is the export's
 * for every combination, and nothing is written when nothing differs.
 */
export function emitRuntimeVersions(mods: string[], jsonFor: (on: string[]) => Obj): { base: Obj; versions: RtVersion[] } {
  const base = jsonFor([])
  const versions: RtVersion[] = []
  for (const c of subsets(mods)) {
    if (!c.length) continue
    const want = jsonFor(c)
    const cur = resolveRuntime({ ...base, versions }, c).value
    const d = diffPaths(cur, want)
    if (Object.keys(d).length) versions.push(rtVersion(c, d))
  }
  return { base, versions }
}

/** The JSON with its versions (none: the base as it was). */
export function withRuntimeVersions(mods: string[], jsonFor: (on: string[]) => Obj): Obj {
  if (!mods.length) return jsonFor([])
  const { base, versions } = emitRuntimeVersions(mods, jsonFor)
  // SagaLib picks the version (and sets a quest's $global.sfv_ flags) from the mods the file names:
  // a mod whose versions change only what lives elsewhere (dialog rules) still gets an empty one
  // (#67 U18: a setting token likewise, as settingsWith)
  const named = new Set(versions.flatMap((v) => [...(v.modsWith ?? []), ...rtTokens(v)]))
  for (const m of [...new Set(mods)].sort()) if (!named.has(m)) versions.push(rtVersion([m], {}))
  return versions.length ? { ...base, versions } : base
}

/** SagaLib's flag for a quest's chosen version: `$global.sfv_<quest>_<mod>`. */
export const versionFlag = (quest: string, mod: string): string => `$global.sfv_${quest}_${mod.replace(/[^A-Za-z0-9_]/g, '_')}`
/** SagaLib's stored choice: `$global.sagaforge_ver_<kind>_<id>`. */
export const versionKey = (kind: string, id: string): string => `$global.sagaforge_ver_${kind}_${id}`
