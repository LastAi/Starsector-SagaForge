/**
 * Game definitions, one JSON file per game version (PLAN.md Q11). Adapted from Ship Editor's
 * src/shared/defs/index.ts (user patch files, version matching); may drift.
 */
import v098a from './0.98a.json'
import type { GameDefinitions, RuleCommandDef, TokenDef } from './types'

export type { GameDefinitions, RuleCommandDef, TokenDef }

const BUILT_IN: GameDefinitions[] = [v098a as unknown as GameDefinitions]
let DEFS: GameDefinitions[] = [...BUILT_IN]

/** Definitions for a game version string like "0.98a-RC8"; falls back to the newest. */
export function defsFor(gameVersion?: string | null): GameDefinitions {
  const v = (gameVersion ?? '').toLowerCase()
  const hits = DEFS.filter((d) => v.startsWith(d.gameVersion.toLowerCase().replace(/-rc\d+$/, ''))).sort((a, b) => b.gameVersion.length - a.gameVersion.length)
  return hits[0] ?? DEFS[DEFS.length - 1]
}

/**
 * A user definition file: changes on top of the built-in definitions. Objects merge by key;
 * lists of objects with a `name`, `token`, `key`, `id` or `tag` merge by that field (same value =
 * changed, new = added, `"remove": true` = removed); other arrays are replaced.
 */
export type DefsPatch = { gameVersion: string; extends?: string } & Record<string, unknown>

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const KEYS = ['name', 'token', 'key', 'id', 'tag']
const keyField = (a: unknown): string | null => {
  if (!Array.isArray(a) || !a.length || !a.every(isObj)) return null
  return KEYS.find((k) => (a as Obj[]).every((x) => typeof x[k] === 'string')) ?? null
}

function merge(base: unknown, patch: unknown): unknown {
  if (isObj(base) && isObj(patch)) {
    const out: Obj = { ...base }
    for (const [k, v] of Object.entries(patch)) out[k] = k in base ? merge(base[k], v) : v
    return out
  }
  const kf = keyField(base)
  if (kf && Array.isArray(patch) && patch.every(isObj)) {
    const out = (base as Obj[]).map((x) => ({ ...x }))
    for (const p of patch as Obj[]) {
      const i = out.findIndex((x) => x[kf] === p[kf])
      if (p.remove === true) { if (i >= 0) out.splice(i, 1); continue }
      if (i >= 0) out[i] = merge(out[i], p) as Obj
      else out.push(p)
    }
    return out
  }
  return patch
}

export function mergeDefs(base: GameDefinitions, patch: DefsPatch): GameDefinitions {
  const { extends: _ext, ...rest } = patch
  return merge(base, rest) as GameDefinitions
}

/** Apply user definition files (in order). Returns, per patch, null or why it could not be used. */
export function registerDefs(patches: DefsPatch[]): (string | null)[] {
  const errors: (string | null)[] = []
  DEFS = [...BUILT_IN]
  for (const p of patches) {
    if (!p || typeof p.gameVersion !== 'string' || !p.gameVersion) { errors.push('missing "gameVersion"'); continue }
    errors.push(null)
    const same = DEFS.findIndex((d) => d.gameVersion.toLowerCase() === p.gameVersion.toLowerCase())
    if (same >= 0) { DEFS[same] = mergeDefs(DEFS[same], p); continue }
    const base = p.extends ? DEFS.find((d) => d.gameVersion.toLowerCase() === String(p.extends).toLowerCase()) : DEFS[DEFS.length - 1]
    if (!base) { errors[errors.length - 1] = `"extends" names unknown definitions "${p.extends}"`; continue }
    DEFS.push(mergeDefs(base, p))
  }
  return errors
}

export const knownDefs = () => DEFS.map((d) => d.gameVersion)

/** Look up a rule command by name (case-insensitive, as the game resolves class names on Windows only by exact case: warn elsewhere). */
export function ruleCommand(defs: GameDefinitions, name: string): RuleCommandDef | undefined {
  return defs.ruleCommands.find((c) => c.name === name) ?? defs.ruleCommands.find((c) => c.name.toLowerCase() === name.toLowerCase())
}
