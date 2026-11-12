/**
 * Factions: the game's merge rule and the patch model (PLAN.md §4.1, docs/FORMATS.md).
 *
 * A mod's file at the same path as an existing .faction file is merged into it: objects are
 * merged key by key, arrays are appended, other values replace. A merge can't remove anything.
 */
type Obj = Record<string, unknown>
export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Marker that, as an array's first element in a mod's file, empties the array before appending. */
export const CLEAR_ARRAY = 'core_clearArray'

/**
 * Arrays the game replaces instead of appending: 4-element arrays whose key contains "color" or
 * "button" (case-insensitive), or starts with "music_" (docs/FORMATS.md, JSON merge).
 */
export function replacedArray(key: string, v: unknown): boolean {
  if (!Array.isArray(v)) return false
  const k = key.toLowerCase()
  return (v.length === 4 && (k.includes('color') || k.includes('button'))) || k.startsWith('music_')
}

/** The game's JSON merge for .faction files (and settings.json-style files): LoadingUtils' rules. */
export function mergeFactionJson(base: unknown, patch: unknown, key = ''): unknown {
  if (isObj(base) && isObj(patch)) {
    const out: Obj = { ...base }
    for (const [k, v] of Object.entries(patch)) out[k] = k in base ? mergeFactionJson(base[k], v, k) : stripClear(clone(v))
    return out
  }
  if (Array.isArray(base) && Array.isArray(patch)) {
    if (patch[0] === CLEAR_ARRAY) return patch.slice(1).map(clone)
    if (replacedArray(key, patch)) return patch.map(clone)
    return [...base, ...patch.map(clone)]
  }
  return clone(patch)
}

function stripClear(v: unknown): unknown {
  if (Array.isArray(v) && v[0] === CLEAR_ARRAY) return v.slice(1)
  return v
}

export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** A scripted change a merge file can't express; applied by SagaLib on load (data/sagaforge/factions.json). */
export interface ScriptedFactionChange {
  op: 'remove'
  /** Dotted path to a list, e.g. "knownShips.hulls". */
  path: string
  value: string
}

/** This mod's patch to a faction defined elsewhere. Only `patch` is ever written to the .faction file. */
export interface FactionPatch {
  /** Values that replace (scalars) or merge into (objects) the base. */
  set: Obj
  /** Entries appended to arrays, by dotted path ("knownShips.hulls", "illegalCommodities"). */
  add: Record<string, unknown[]>
}

export const emptyPatch = (): FactionPatch => ({ set: {}, add: {} })

export function getPath(o: unknown, dotted: string): unknown {
  let cur: unknown = o
  for (const k of dotted.split('.')) {
    if (!isObj(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

export function setPath(o: Obj, dotted: string, value: unknown): void {
  const keys = dotted.split('.')
  let cur: Obj = o
  for (const k of keys.slice(0, -1)) {
    if (!isObj(cur[k])) cur[k] = {}
    cur = cur[k] as Obj
  }
  if (value === undefined) delete cur[keys[keys.length - 1]]
  else cur[keys[keys.length - 1]] = value
}

/** Remove empty objects left after deleting keys. */
export function prune(o: Obj): Obj {
  for (const [k, v] of Object.entries(o)) {
    if (isObj(v)) { prune(v); if (!Object.keys(v).length) delete o[k] }
  }
  return o
}

/** The JSON value the patch file holds: `set` with `add` entries placed at their paths. */
export function patchToJson(p: FactionPatch): Obj {
  const out = clone(p.set) ?? {}
  for (const [dotted, list] of Object.entries(p.add)) {
    if (!list.length) continue
    const existing = getPath(out, dotted)
    setPath(out, dotted, Array.isArray(existing) ? [...existing, ...list] : [...list])
  }
  return prune(out)
}

/**
 * Split an existing patch file (as parsed) into set/add, given the base it patches: arrays are
 * additions, everything else is a set value.
 */
export function jsonToPatch(json: Obj): FactionPatch {
  const p = emptyPatch()
  const walk = (o: Obj, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      const path = prefix ? `${prefix}.${k}` : k
      if (Array.isArray(v) && !isColor(k, v)) p.add[path] = clone(v)
      else if (isObj(v)) walk(v, path)
      else setPath(p.set, path, clone(v))
    }
  }
  walk(json, '')
  return p
}

/** Arrays a patch sets as one value (colors, music lists): the game replaces them instead of appending. */
export function isColor(key: string, v: unknown): boolean {
  return replacedArray(key, v)
}

/** Effective faction: base layers merged, then this mod's patch. */
export function effectiveFaction(layers: Obj[], patch?: FactionPatch): Obj {
  let eff: unknown = {}
  for (const l of layers) eff = mergeFactionJson(eff, l)
  if (patch) eff = mergeFactionJson(eff, patchToJson(patch))
  return eff as Obj
}
