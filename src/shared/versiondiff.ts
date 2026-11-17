/**
 * #47 P2 (TARGET-VERSION-ASSESSMENT.md §2, §4): what differs between two game versions, from the
 * two definitions files, the two game indexes (vanilla only) and the two sets of vanilla rule ids.
 * Nothing is hand-tagged. Pure.
 */
import type { GameIndex } from './api'
import type { GameDefinitions, ParamDef } from './defs/types'
import { versionFamily } from './version'

/** Kinds of id the comparison covers (definitions, index categories, rules). */
export type DiffCategory =
  | 'command' | 'token' | 'rank' | 'post' | 'codePerson' | 'factionKey' | 'fleetType'
  | 'faction' | 'hull' | 'variant' | 'wing' | 'weapon' | 'hullmod' | 'item' | 'industry' | 'condition' | 'submarket'
  | 'entityType' | 'planetType' | 'music' | 'portrait' | 'illustration' | 'rule'

export interface VersionDiff {
  older: string
  newer: string
  /** Ids only the newer version has, by category. */
  onlyNewer: Partial<Record<DiffCategory, string[]>>
  /** Ids only the older version has (removed in the newer), by category. */
  onlyOlder: Partial<Record<DiffCategory, string[]>>
  /** Commands in both whose accepted forms differ (each form written as a signature). */
  commandForms: { name: string; older: string[]; newer: string[] }[]
  /** False when the older install's rule ids weren't available (single install). */
  hasRules: boolean
}

const sig = (form: ParamDef[]) => form.map((p) => `${p.type}${p.optional ? '?' : ''}${p.rest ? '…' : ''}`).join(' ')
const diffIds = (older: Iterable<string>, newer: Iterable<string>) => {
  const a = new Set(older), b = new Set(newer)
  return { onlyNewer: [...b].filter((x) => !a.has(x)).sort(), onlyOlder: [...a].filter((x) => !b.has(x)).sort() }
}

/** Definitions: commands, tokens, ranks, posts, code people, faction keys, fleet types; command forms. */
export function diffDefs(older: GameDefinitions, newer: GameDefinitions): Pick<VersionDiff, 'onlyNewer' | 'onlyOlder' | 'commandForms'> {
  const out: Pick<VersionDiff, 'onlyNewer' | 'onlyOlder' | 'commandForms'> = { onlyNewer: {}, onlyOlder: {}, commandForms: [] }
  const add = (cat: DiffCategory, a: string[], b: string[]) => {
    const d = diffIds(a, b)
    if (d.onlyNewer.length) out.onlyNewer[cat] = d.onlyNewer
    if (d.onlyOlder.length) out.onlyOlder[cat] = d.onlyOlder
  }
  add('command', older.ruleCommands.map((c) => c.name), newer.ruleCommands.map((c) => c.name))
  add('token', older.tokens.map((t) => t.token.toLowerCase()), newer.tokens.map((t) => t.token.toLowerCase()))
  add('rank', older.ranks.map((r) => r.id), newer.ranks.map((r) => r.id))
  add('post', older.posts.map((r) => r.id), newer.posts.map((r) => r.id))
  add('codePerson', (older.codePeople ?? []).map((p) => p.id), (newer.codePeople ?? []).map((p) => p.id))
  add('factionKey', older.factionKeys.map((k) => k.key), newer.factionKeys.map((k) => k.key))
  add('fleetType', older.fleetTypes.map((t) => t.id), newer.fleetTypes.map((t) => t.id))
  for (const c of newer.ruleCommands) {
    const o = older.ruleCommands.find((x) => x.name === c.name)
    if (!o) continue
    const a = o.forms.map(sig).sort(), b = c.forms.map(sig).sort()
    if (a.join('|') !== b.join('|')) out.commandForms.push({ name: c.name, older: a, newer: b })
  }
  return out
}

const core = <T extends { definedBy: string }>(l: T[] | undefined) => (l ?? []).filter((x) => x.definedBy === 'starsector-core')

/** Game indexes, vanilla only: other mods are the modder's business, not the game version's. */
export function diffIndexes(older: GameIndex, newer: GameIndex): Pick<VersionDiff, 'onlyNewer' | 'onlyOlder'> {
  const out: Pick<VersionDiff, 'onlyNewer' | 'onlyOlder'> = { onlyNewer: {}, onlyOlder: {} }
  const add = (cat: DiffCategory, a: string[], b: string[]) => {
    const d = diffIds(a, b)
    if (d.onlyNewer.length) out.onlyNewer[cat] = d.onlyNewer
    if (d.onlyOlder.length) out.onlyOlder[cat] = d.onlyOlder
  }
  const ids = (l: { id: string; definedBy: string }[] | undefined) => core(l).map((x) => x.id)
  add('faction', ids(older.factions), ids(newer.factions))
  add('hull', ids(older.hulls), ids(newer.hulls))
  add('variant', ids(older.variants), ids(newer.variants))
  add('wing', ids(older.wings), ids(newer.wings))
  add('weapon', ids(older.weapons), ids(newer.weapons))
  add('hullmod', ids(older.hullmods), ids(newer.hullmods))
  add('item', ids(older.items), ids(newer.items))
  add('industry', ids(older.industries), ids(newer.industries))
  add('condition', ids(older.conditions), ids(newer.conditions))
  add('submarket', ids(older.submarkets), ids(newer.submarkets))
  add('entityType', ids(older.customEntityTypes), ids(newer.customEntityTypes))
  add('planetType', ids(older.planetTypes), ids(newer.planetTypes))
  // music has no source in the index: compare all of it (mods rarely differ between the installs)
  add('music', older.music ?? [], newer.music ?? [])
  add('portrait', (older.portraits ?? []).filter((p) => p.sourceId === 'starsector-core').map((p) => p.path), (newer.portraits ?? []).filter((p) => p.sourceId === 'starsector-core').map((p) => p.path))
  add('illustration', core(older.illustrations).filter((i) => i.category === 'illustrations').map((i) => i.key), core(newer.illustrations).filter((i) => i.category === 'illustrations').map((i) => i.key))
  return out
}

/**
 * The whole comparison. `older`/`newer` are the two sides (the caller orders them by version);
 * rule ids are optional (with one install the older side's rules aren't known).
 */
export function versionDiff(o: { defs: GameDefinitions; index: GameIndex; ruleIds?: string[] | null }, n: { defs: GameDefinitions; index: GameIndex; ruleIds?: string[] | null }): VersionDiff {
  const d = diffDefs(o.defs, n.defs)
  const i = diffIndexes(o.index, n.index)
  const out: VersionDiff = {
    older: o.index.install.gameVersion ?? o.defs.gameVersion, newer: n.index.install.gameVersion ?? n.defs.gameVersion,
    onlyNewer: { ...d.onlyNewer, ...i.onlyNewer }, onlyOlder: { ...d.onlyOlder, ...i.onlyOlder }, commandForms: d.commandForms,
    hasRules: !!(o.ruleIds && n.ruleIds)
  }
  if (o.ruleIds && n.ruleIds) {
    const r = diffIds(o.ruleIds, n.ruleIds)
    if (r.onlyNewer.length) out.onlyNewer.rule = r.onlyNewer
    if (r.onlyOlder.length) out.onlyOlder.rule = r.onlyOlder
  }
  return out
}

/**
 * Version labels for pickers (§4): id → "0.98.5a only" / "removed in 0.98.5a". Rule ids are left
 * out (too many, and never picked). Ids are looked up across categories; a clash is rare.
 */
export function versionLabels(d: VersionDiff | null): Map<string, { text: string; kind: 'newer' | 'removed' }> {
  const out = new Map<string, { text: string; kind: 'newer' | 'removed' }>()
  if (!d) return out
  const fam = versionFamily(d.newer)
  for (const [cat, ids] of Object.entries(d.onlyNewer)) if (cat !== 'rule') for (const id of ids ?? []) out.set(id, { text: `${fam} only`, kind: 'newer' })
  for (const [cat, ids] of Object.entries(d.onlyOlder)) if (cat !== 'rule') for (const id of ids ?? []) out.set(id, { text: `removed in ${fam}`, kind: 'removed' })
  return out
}

/** How many ids differ, for a summary line. */
export function diffCounts(d: VersionDiff): { newer: number; removed: number } {
  const n = (r: Partial<Record<string, string[]>>) => Object.values(r).reduce((a, l) => a + (l?.length ?? 0), 0)
  return { newer: n(d.onlyNewer), removed: n(d.onlyOlder) }
}
