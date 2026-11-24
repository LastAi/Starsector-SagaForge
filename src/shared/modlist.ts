/**
 * #60 (PLAN.md §10.1, §10.2): the mod's list of other mods (sagaforge/project.json "mods") and
 * "Only with / Only without" conditions. Pure helpers shared by the export, the checks, Play mode
 * and the UI.
 */
import type { ModUse, ModsCondition, ProjectFile } from './model'
import type { GameIndex, SourceInfo } from './api'
import { settingToken, subsets } from './itemversions'
import { versionSettings, versionValues } from './settings'

export const SAGALIB_ID = 'lastai_sagalib'
export const CORE_ID = 'starsector-core'
export const MODS_JSON = 'data/sagaforge/mods.json'

export type UseKind = ModUse['use'] | 'none'

export const USE_LABEL: Record<UseKind, string> = { required: 'Required', optional: 'Optional', incompatible: 'Incompatible', none: 'Not used' }

export function useOf(p: Pick<ProjectFile, 'mods'>, id: string): UseKind {
  return p.mods?.find((x) => x.id === id)?.use ?? 'none'
}

/** Required and optional mods (the ones whose content and tools show). */
export function listedIds(p: Pick<ProjectFile, 'mods'>): Set<string> {
  return new Set((p.mods ?? []).filter((x) => x.use === 'required' || x.use === 'optional').map((x) => x.id))
}

export const optionalMods = (p: Pick<ProjectFile, 'mods'>): ModUse[] => (p.mods ?? []).filter((x) => x.use === 'optional')
export const requiredMods = (p: Pick<ProjectFile, 'mods'>): ModUse[] => (p.mods ?? []).filter((x) => x.use === 'required')
export const incompatibleMods = (p: Pick<ProjectFile, 'mods'>): ModUse[] => (p.mods ?? []).filter((x) => x.use === 'incompatible')

/** The source id behind an Origin's definedBy ("code:<source>" = created in that source's code). */
export const originSource = (definedBy: string | undefined): string => (definedBy ?? '').replace(/^code:/, '')

/** The sources a read-only list shows by default: vanilla, the active mod and its required and optional mods. */
export function visibleSources(p: Pick<ProjectFile, 'mods'> | null | undefined, activeSourceId: string | null): Set<string> {
  const s = new Set<string>([CORE_ID])
  if (activeSourceId) s.add(activeSourceId)
  for (const id of p ? listedIds(p) : []) s.add(id)
  return s
}

/** True when an item with this origin shows in a filtered list. */
export function isVisible(definedBy: string | undefined, visible: Set<string>): boolean {
  if (!definedBy) return true
  return visible.has(originSource(definedBy))
}

/**
 * The installed mods Saga Forge offers in Saga › Mods: every installed mod, enabled or not, except
 * the active mod, SagaLib and translation mods. `libraries` are the mods the listed mods depend
 * on (no need to list them; shown on request).
 */
export function offeredMods(index: Pick<GameIndex, 'sources'>, p: Pick<ProjectFile, 'mods'>, activeSourceId: string | null): { mods: SourceInfo[]; libraries: SourceInfo[] } {
  const all = index.sources.filter((s) => !s.isCore && s.id !== activeSourceId && s.id !== SAGALIB_ID && !s.translates)
  const listed = new Set((p.mods ?? []).map((m) => m.id))
  const deps = new Set<string>()
  const byId = new Map(index.sources.map((s) => [s.id, s]))
  const walk = (id: string, seen: Set<string>) => {
    for (const d of byId.get(id)?.dependencies ?? []) if (!seen.has(d)) { seen.add(d); deps.add(d); walk(d, seen) }
  }
  for (const id of listed) walk(id, new Set([id]))
  const libraries = all.filter((s) => deps.has(s.id) && !listed.has(s.id))
  const mods = all.filter((s) => !libraries.includes(s))
  // a mod listed but not installed stays in the list
  return { mods: mods.sort((a, b) => a.name.localeCompare(b.name)), libraries: libraries.sort((a, b) => a.name.localeCompare(b.name)) }
}

// ---------------------------------------------------------------- conditions

export const emptyCond = (c: ModsCondition | undefined): boolean => !c || (!c.with?.length && !c.without?.length)

/** #61: Nexerelin's mod id; its tools (the contact-post warning) show when the mod lists it. */
export const NEXERELIN_ID = 'nexerelin'
/** True when the mod lists Nexerelin (required or optional). */
export const nexListed = (p: Pick<ProjectFile, 'mods'> | null | undefined): boolean => { const u = p?.mods?.find((x) => x.id === NEXERELIN_ID)?.use; return u === 'required' || u === 'optional' }

/** The rules.csv conditions of a "Only with / Only without" setting (PLAN.md §10.2 table). */
export function condLines(c: ModsCondition | undefined): string[] {
  if (!c || emptyCond(c)) return []
  const out: string[] = []
  const w = [...new Set(c.with ?? [])]
  if (w.length) out.push(c.anyOf && w.length > 1 ? `SF_HasAnyMod ${w.join(' ')}` : `SF_HasMod ${w.join(' ')}`)
  for (const id of new Set(c.without ?? [])) out.push(`!SF_HasMod ${id}`)
  return out
}

/** Effective conditions: everything must hold (a merge of own, automatic and inherited conditions). */
export interface EffConds {
  with: string[]
  without: string[]
  /** Groups where at least one must count ("any of" lists). */
  any: string[][]
}

export const noConds = (): EffConds => ({ with: [], without: [], any: [] })
export const isNone = (e: EffConds | undefined): boolean => !e || (!e.with.length && !e.without.length && !e.any.length)

/** Adds a condition to an effective set (an "any of" with one mod is a plain "with"). */
export function addCond(e: EffConds, c: ModsCondition | EffConds | undefined): EffConds {
  if (!c) return e
  if ('any' in c && Array.isArray((c as EffConds).any)) {
    const x = c as EffConds
    for (const id of x.with) if (!e.with.includes(id)) e.with.push(id)
    for (const id of x.without) if (!e.without.includes(id)) e.without.push(id)
    for (const g of x.any) if (!e.any.some((h) => h.join(' ') === g.join(' '))) e.any.push([...g])
    return e
  }
  const m = c as ModsCondition
  const w = [...new Set(m.with ?? [])]
  if (m.anyOf && w.length > 1) { if (!e.any.some((h) => h.join(' ') === w.join(' '))) e.any.push(w) }
  else for (const id of w) if (!e.with.includes(id)) e.with.push(id)
  for (const id of m.without ?? []) if (!e.without.includes(id)) e.without.push(id)
  return e
}

/** What every one of the sets requires (for spreading to things only conditional content uses). */
export function commonConds(list: EffConds[]): EffConds {
  if (!list.length) return noConds()
  const [first, ...rest] = list
  return {
    with: first.with.filter((id) => rest.every((e) => e.with.includes(id))),
    without: first.without.filter((id) => rest.every((e) => e.without.includes(id))),
    any: first.any.filter((g) => rest.every((e) => e.any.some((h) => h.join(' ') === g.join(' '))))
  }
}

/** rules.csv lines of an effective set. */
export function effLines(e: EffConds | undefined): string[] {
  if (!e || isNone(e)) return []
  return [...(e.with.length ? [`SF_HasMod ${e.with.join(' ')}`] : []), ...e.without.map((id) => `!SF_HasMod ${id}`), ...e.any.map((g) => (g.length > 1 ? `SF_HasAnyMod ${g.join(' ')}` : `SF_HasMod ${g[0]}`))]
}

/** SagaLib 1.3 JSON fields of an effective set (modsWith, modsWithout, modsAny). */
export function gateJson(e: EffConds | undefined): Record<string, unknown> {
  if (!e || isNone(e)) return {}
  return { ...(e.with.length ? { modsWith: [...e.with] } : {}), ...(e.without.length ? { modsWithout: [...e.without] } : {}), ...(e.any.length ? { modsAny: e.any.map((g) => [...g]) } : {}) }
}

/** Whether a set holds with these mods counting (Play mode, the combination check). */
export function holds(e: EffConds | ModsCondition | undefined, on: Set<string>): boolean {
  if (!e) return true
  const x = 'any' in e && Array.isArray((e as EffConds).any) ? (e as EffConds) : addCond(noConds(), e as ModsCondition)
  return x.with.every((id) => on.has(id)) && x.without.every((id) => !on.has(id)) && x.any.every((g) => g.some((id) => on.has(id)))
}

/** "only with Nexerelin; only without UAF" (mod names when known). */
export function condText(e: EffConds | ModsCondition | undefined, name: (id: string) => string = (id) => id): string {
  if (!e) return ''
  const x = 'any' in e && Array.isArray((e as EffConds).any) ? (e as EffConds) : addCond(noConds(), e as ModsCondition)
  const parts: string[] = []
  if (x.with.length) parts.push(`only with ${x.with.map(name).join(' and ')}`)
  for (const g of x.any) parts.push(`only with ${g.map(name).join(' or ')}`)
  if (x.without.length) parts.push(`only without ${x.without.map(name).join(' or ')}`)
  return parts.join('; ')
}

/** Every mod a condition mentions. */
export const condMods = (e: EffConds | ModsCondition | undefined): string[] => {
  if (!e) return []
  if ('any' in e && Array.isArray((e as EffConds).any)) { const x = e as EffConds; return [...new Set([...x.with, ...x.without, ...x.any.flat()])] }
  const m = e as ModsCondition
  return [...new Set([...(m.with ?? []), ...(m.without ?? [])])]
}

// ---------------------------------------------------------------- export

/** data/sagaforge/mods.json for SagaLib 1.3 (the start record, the incompatible warning, the dev menu). */
export function modsJson(p: ProjectFile, mod: { id: string; name: string }): Record<string, unknown> {
  return {
    format: 1, mod: mod.id, name: mod.name, prefix: p.prefix,
    mods: (p.mods ?? []).map((m) => ({ id: m.id, name: m.name, use: m.use, ...(m.minVersion ? { minVersion: m.minVersion } : {}), ...(m.use === 'incompatible' && m.reason ? { reason: m.reason } : {}) }))
  }
}

/** Every optional-mod combination (2 mods → 4), for the combination check and Play mode; `never` drops the impossible ones (#76). */
export function combinations(ids: string[], max = 64, never: NeverPair[] = []): Set<string>[] {
  const n = Math.min(ids.length, Math.log2(max))
  const out: Set<string>[] = []
  for (let k = 0; k < 1 << n; k++) out.push(new Set(ids.slice(0, n).filter((_, i) => k & (1 << i))))
  return never.length ? out.filter((s) => possible(s, never)) : out
}

// ---------------------------------------------------------------- mods that never run together (#76)

/**
 * AoTD's Theory of Toolbox and the AoTD modules that need it (PLAN.md §10.8). Dreams of Past
 * (`Cryo_but_better`) needs only LazyLib and runs with Industrial.Evolution (user, 2026-11-19).
 */
export const AOTD_TOT_IDS = ['aotd_theory_of_toolbox', 'aotd_vok', 'aotd_sop']
export const INDEVO_ID = 'IndEvo'
/** Built-in pairs of mods no player runs together: ToT and the AoTD modules that need it, with Industrial.Evolution (user, 2026-11-19). */
export const KNOWN_NEVER: [string, string][] = AOTD_TOT_IDS.map((a) => [a, INDEVO_ID])

/** Two mods that never run together; `known` = from the built-in list (else marked in Saga › Mods). */
export interface NeverPair { a: string; b: string; known: boolean }

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

/** Every pair of mods that never run together: the built-in list plus the mod's own `neverWith` marks. */
export function neverPairs(p: Pick<ProjectFile, 'mods'> | null | undefined): NeverPair[] {
  const out = new Map<string, NeverPair>()
  for (const [a, b] of KNOWN_NEVER) out.set(pairKey(a, b), { a, b, known: true })
  for (const x of p?.mods ?? []) for (const b of x.neverWith ?? []) {
    const k = pairKey(x.id, b)
    if (b !== x.id && !out.has(k)) out.set(k, { a: x.id, b, known: false })
  }
  return [...out.values()]
}

/** The mods that never run with this one (built-in or marked), and whether each is built-in. */
export function neverWithOf(p: Pick<ProjectFile, 'mods'> | null | undefined, id: string): { id: string; known: boolean }[] {
  return neverPairs(p).filter((x) => x.a === id || x.b === id).map((x) => ({ id: x.a === id ? x.b : x.a, known: x.known }))
}

/** True when two mods never run together. */
export const never = (pairs: NeverPair[], a: string, b: string): boolean => pairs.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))

/** True when a combination of mods can happen (it holds no pair that never runs together). */
export function possible(on: Iterable<string>, pairs: NeverPair[]): boolean {
  const l = [...on]
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (never(pairs, l[i], l[j])) return false
  return true
}

/**
 * The versions strip's cells (PLAN.md §10.6): every combination of the optional mods (at most `max`)
 * that can happen. #67 U18: with `settings`, for each setting marked for versions, one cell per
 * value alone and each value with each single optional mod (not every combination: it stays small).
 */
export function versionCells(p: Pick<ProjectFile, 'mods' | 'settings'> | null | undefined, max = 4, settings = true): string[][] {
  const pairs = neverPairs(p)
  const opt = optionalMods(p ?? {}).map((x) => x.id)
  const out = subsets(opt, max).filter((c) => possible(c, pairs))
  if (!settings) return out
  const singles = [...new Set(opt)].sort().slice(0, max)
  for (const s of versionSettings(p?.settings)) {
    for (const v of versionValues(s)) {
      const t = settingToken(s.id, v)
      out.push([t])
      for (const m of singles) out.push([m, t].sort())
    }
  }
  return out
}

/**
 * Play mode's switches: the optional mods that count after turning `id` on or off. Turning one on
 * turns off the mods that never run with it, so Play mode never plays an impossible combination.
 */
export function switchPlay(on: Set<string>, id: string, value: boolean, pairs: NeverPair[]): Set<string> {
  const out = new Set(on)
  if (!value) { out.delete(id); return out }
  out.add(id)
  for (const x of [...out]) if (x !== id && never(pairs, x, id)) out.delete(x)
  return out
}

/** The first pair of mods in a list that never runs together, or null. */
export function neverPairIn(ids: Iterable<string>, pairs: NeverPair[]): [string, string] | null {
  const l = [...new Set(ids)]
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (never(pairs, l[i], l[j])) return [l[i], l[j]]
  return null
}

/** "Hazard Mining Incorporated + UAF" / "no optional mods". */
export const comboText = (on: Set<string>, name: (id: string) => string = (id) => id): string => (on.size ? [...on].map(name).join(' + ') : 'no optional mods')

/** The version string of a mod_info.json dependency for a minimum version ("1.2" → "1.2"). */
export const depVersion = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined)

/**
 * Framework files a mod ships for another mod (FORMATS.md "What the installed mods depend on"):
 * only that mod reads them, so they make the mod a user of it (optional by default).
 */
export const FRAMEWORK_FILE_MODS: Record<string, { mod: string; name: string; what: string }> = {
  'data/config/LunaSettings.csv': { mod: 'lunalib', name: 'LunaLib', what: 'its settings page (LunaSettings.csv)' },
  'data/config/exerelinFactionConfig/mod_factions.csv': { mod: 'nexerelin', name: 'Nexerelin', what: 'its faction config (exerelinFactionConfig)' },
  'data/config/magic_achievements.csv': { mod: 'MagicLib', name: 'MagicLib', what: 'its achievements (magic_achievements.csv)' },
  'data/config/exerelin/questSkip.json': { mod: 'nexerelin', name: 'Nexerelin', what: 'its quest skip entries (exerelin/questSkip.json)' },
  'data/config/modFiles/magicBounty_data.json': { mod: 'MagicLib', name: 'MagicLib', what: 'its bounties (magicBounty_data.json)' },
  // #77: only Vaults of Knowledge reads them
  'data/campaign/aotd_tech_options.csv': { mod: 'aotd_vok', name: 'AoTD- Vaults of Knowledge', what: 'its techs (aotd_tech_options.csv)' },
  'data/campaign/aotd_faction_behaviour.csv': { mod: 'aotd_vok', name: 'AoTD- Vaults of Knowledge', what: 'its factions\' research stances (aotd_faction_behaviour.csv)' }
}
export const FRAMEWORK_FILES = Object.keys(FRAMEWORK_FILE_MODS)

/**
 * #67 (user, 2026-11-21): a faction's colour as the active mod's game would have it: the last layer
 * (in load order) from a source that counts (vanilla, the mod, its listed mods), not every installed
 * mod's patch. Falls back to the merged colour for an older index.
 */
export function factionColor(f: { color: number[] | null; colors?: { sourceId: string; color: number[] }[] }, visible: Set<string>): number[] | null {
  if (!f.colors) return f.color
  const own = f.colors.filter((c) => isVisible(c.sourceId, visible))
  return own.length ? own[own.length - 1].color : f.color
}
