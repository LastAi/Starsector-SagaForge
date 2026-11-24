/**
 * Task #64 (PLAN.md §10.6): the whole mod in one combination of its optional mods, named places,
 * and the dialog rules a version changes. Pure.
 */
import type { ModModel } from './serialize'
import type { QuestPlan } from './model'
import type { RuleRow } from './rules/types'
import { clone, comboKey, isSettingToken, mentionedMods, resolveItem, subsets, versionFlag, type Versioned } from './itemversions'
import { firstNameOf, fullName, storedName } from './personname'

/** The kinds of item that can have versions, with how to find them in the model. */
export type VKind = 'person' | 'quest' | 'encounter' | 'system' | 'events' | 'pool' | 'factions' | 'item' | 'description'

export const VKIND_LABEL: Record<VKind, string> = {
  person: 'Person', quest: 'Quest', encounter: 'Encounter', system: 'System', events: 'Event scheduler', pool: 'Pool',
  factions: 'Starting relations and scripted faction changes', item: 'Item', description: 'Description'
}

/** Every versionable item of the model: kind, id, label and the item itself (live, for edits). */
export function versionables(m: ModModel): { kind: VKind; id: string; label: string; item: Versioned }[] {
  const out: { kind: VKind; id: string; label: string; item: Versioned }[] = []
  for (const p of m.people) out.push({ kind: 'person', id: p.id, label: fullName(p.name) || p.id, item: p })
  for (const q of m.quests) out.push({ kind: 'quest', id: q.id, label: q.title || q.id, item: q })
  for (const e of m.encounters) out.push({ kind: 'encounter', id: e.id, label: e.name || e.id, item: e })
  for (const s of m.systems) out.push({ kind: 'system', id: s.id, label: s.name || s.id, item: s })
  for (const s of m.events ?? []) out.push({ kind: 'events', id: s.id, label: s.name || s.id, item: s })
  for (const p of m.pools ?? []) if (p.use !== 'loot') out.push({ kind: 'pool', id: p.id, label: p.name || p.id, item: p })
  out.push({ kind: 'factions', id: 'factions', label: 'Starting relations and scripted changes', item: m.factionsRuntime })
  for (const i of m.items) out.push({ kind: 'item', id: i.id, label: i.name || i.id, item: i })
  for (const [k, d] of Object.entries(m.descriptions)) out.push({ kind: 'description', id: k, label: k, item: d as Versioned })
  return out
}

/** The live item of a kind and id (null when gone). */
export function findVersionable(m: ModModel, kind: VKind, id: string): Versioned | null {
  switch (kind) {
    case 'person': return m.people.find((x) => x.id === id) ?? null
    case 'quest': return m.quests.find((x) => x.id === id) ?? null
    case 'encounter': return m.encounters.find((x) => x.id === id) ?? null
    case 'system': return m.systems.find((x) => x.id === id) ?? null
    case 'events': return m.events?.find((x) => x.id === id) ?? null
    case 'pool': return m.pools?.find((x) => x.id === id) ?? null
    case 'factions': return m.factionsRuntime
    case 'item': return m.items.find((x) => x.id === id) ?? null
    case 'description': return (m.descriptions[id] as Versioned | undefined) ?? null
  }
}

/**
 * #67 U18: kinds whose versions may depend on a setting fixed at new game (chosen per save). Items
 * and descriptions follow the installed mods when the game starts up, before any save, so not them.
 */
export const settingKinds = (kind: VKind): boolean => kind !== 'item' && kind !== 'description'

/** #67 U18: some version depends on a setting (SagaLib 1.4's settingsWith). */
export const usesSettingVersions = (m: ModModel): boolean => versionables(m).some((v) => !!v.item.versions?.some((x) => x.mods.some(isSettingToken)))

/** True when anything in the mod has versions. */
export const hasVersions = (m: ModModel): boolean => versionables(m).some((v) => !!v.item.versions?.length)

/** Every mod some version mentions. */
export const modelVersionMods = (m: ModModel): string[] => [...new Set(versionables(m).flatMap((v) => mentionedMods(v.item)))].sort()

/** The mod as it is in one combination of its optional mods: every item resolved, no `versions` left. */
export function resolveModel(m: ModModel, on: Iterable<string>): ModModel {
  const set = [...on]
  const r = <T extends Versioned>(x: T): T => (x.versions?.length || 'versions' in x ? resolveItem(x, set).value : x)
  return {
    ...m,
    people: m.people.map(r),
    quests: m.quests.map(r),
    encounters: m.encounters.map(r),
    systems: m.systems.map(r),
    events: m.events?.map(r),
    pools: m.pools?.map(r),
    items: m.items.map(r),
    descriptions: Object.fromEntries(Object.entries(m.descriptions).map(([k, d]) => [k, r(d as Versioned) as typeof d])),
    factionsRuntime: r(m.factionsRuntime)
  }
}

// ---------------------------------------------------------------- named places

/** A quest's named place as a reference: "place:<id>". */
export const PLACE_PREFIX = 'place:'
export const placeRef = (id: string) => `${PLACE_PREFIX}${id}`
export const placeOf = (ref: string | undefined): string | null => (ref?.startsWith(PLACE_PREFIX) ? ref.slice(PLACE_PREFIX.length) : null)

/** Every "place:<id>" in a quest replaced by the place's object (start conditions, markers, Arrive, visuals, …). */
export function lowerPlaces(q: QuestPlan): QuestPlan {
  const places = q.places ?? []
  if (!places.length) return q
  const byId = new Map(places.map((p) => [p.id, p.entity]))
  const fix = (s: string) => s.replace(/(^|[\s=(,])place:([\w-]+)/g, (all, pre: string, id: string) => (byId.has(id) ? `${pre}${byId.get(id)}` : all))
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes(PLACE_PREFIX) ? fix(v) : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'places' ? x : walk(x)]))
    return v
  }
  return walk(q) as QuestPlan
}

export const lowerPlacesModel = (m: ModModel): ModModel => (m.quests.some((q) => q.places?.length) ? { ...m, quests: m.quests.map(lowerPlaces) } : m)

// ---------------------------------------------------------------- dialog rules of versions

const sameRule = (a: RuleRow, b: RuleRow) => a.trigger === b.trigger && a.conditions === b.conditions && a.script === b.script && a.text === b.text && a.options === b.options
const sameWhen = (a: RuleRow, b: RuleRow) => a.trigger === b.trigger && a.conditions === b.conditions
/** Triggers the game fires with FireAll: every matching rule runs, so their copies must exclude each other. */
const FIREALL_TRIGGERS = new Set(['PopulateOptions', 'DialogOptionSelected_FireAll', 'BarPrintDesc', 'AddBarEvents', 'PopulateSalvageOptions', 'MarketPostOpen'])
/** Each extra rule's flag lines carry this much score, so a version always beats the base and a more specific one a less specific one. */
export const VERSION_SCORE = 100

/**
 * The rules of a quest with versions (PLAN.md §10.6 "Dialog"): the base rules, plus for each rule a
 * version changes, an extra rule that tests the stored version (`$global.sfv_<quest>_<mod>`, set by
 * SagaLib when it picks the quest's version). When only the text, options or script change, the
 * extra rule wins over the base by its score (one extra rule per changed node). When a version
 * changes when a rule fires (its trigger or conditions, e.g. a named place moved), or the rule is
 * fired with FireAll, the copies exclude each other instead (negated flags).
 */
export function versionedRuleRows(qid: string, mods: string[], questFor: (on: string[]) => QuestPlan, compile: (q: QuestPlan) => RuleRow[]): { rows: RuleRow[]; extra: number } {
  const base = compile(questFor([]))
  if (!mods.length) return { rows: base, extra: 0 }
  const combos = subsets(mods)
  const byCombo = new Map<string, Map<string, RuleRow>>()
  for (const c of combos) byCombo.set(comboKey(c), new Map((c.length ? compile(questFor(c)) : base).map((r) => [r.id, r])))
  const flag = (m: string) => versionFlag(qid, m)
  const fireAll = new Set(FIREALL_TRIGGERS)
  for (const rows of byCombo.values()) for (const r of rows.values()) for (const l of r.script.split('\n')) { const x = /^\s*FireAll\s+(\S+)/.exec(l); if (x) fireAll.add(x[1]) }
  const ids: string[] = []
  for (const rows of byCombo.values()) for (const id of rows.keys()) if (!ids.includes(id)) ids.push(id)
  const out: RuleRow[] = []
  let extra = 0
  const baseMap = byCombo.get('base')!
  for (const id of ids) {
    const per = combos.map((c) => ({ c, r: byCombo.get(comboKey(c))!.get(id) ?? null }))
    const b = baseMap.get(id) ?? null
    if (per.every((x) => (x.r && b ? sameRule(x.r, b) : x.r === b))) { if (b) out.push(b); continue }
    const exclusive = per.some((x) => !x.r || !b || !sameWhen(x.r, b)) || fireAll.has((b ?? per.find((x) => x.r)!.r!).trigger)
    if (!exclusive) {
      // score: the base stays; an extra rule where the most specific matching rule isn't right yet
      out.push(b!)
      const emitted: { c: string[]; r: RuleRow }[] = []
      for (const { c, r } of per) {
        if (!c.length || !r) continue
        const cands = emitted.filter((e) => e.c.every((m) => c.includes(m)))
        const top = cands.length ? Math.max(...cands.map((e) => e.c.length)) : 0
        const best = cands.filter((e) => e.c.length === top)
        const cur = best.length ? (best.length === 1 ? best[0].r : null) : b
        if (cur && sameRule(cur, r)) continue
        const lines = c.map((m) => `${flag(m)} score:${VERSION_SCORE}`)
        const row = { ...r, id: `${id}_v_${c.map(safe).join('_')}`, conditions: [r.conditions, ...lines].filter((x) => x.trim()).join('\n') }
        emitted.push({ c, r: row })
        out.push(row)
        extra++
      }
      continue
    }
    // exclusive: group the combinations by their rule, one copy per group (as few literals as needed)
    const groups = new Map<string, { r: RuleRow | null; cs: string[][] }>()
    for (const { c, r } of per) {
      const k = r ? JSON.stringify([r.trigger, r.conditions, r.script, r.text, r.options]) : 'none'
      const g = groups.get(k) ?? { r, cs: [] }
      g.cs.push(c)
      groups.set(k, g)
    }
    let first = true
    for (const g of groups.values()) {
      if (!g.r) continue
      for (const cube of cubes(g.cs, mods)) {
        const lits = cube.map(([m, on]) => (on ? flag(m) : `!${flag(m)}`))
        const isBase = first && g.r === b
        const row = { ...g.r, id: isBase ? id : `${id}_v_${cube.map(([m, on]) => (on ? '' : 'no') + safe(m)).join('_') || 'all'}`, conditions: [g.r.conditions, ...lits].filter((x) => x.trim()).join('\n') }
        if (!isBase) extra++
        if (isBase) first = false
        out.push(row)
      }
    }
  }
  // unique ids (two groups could name the same suffix)
  const seen = new Set<string>()
  for (const r of out) { let id = r.id; let n = 2; while (seen.has(id)) id = `${r.id}_${n++}`; r.id = id; seen.add(id) }
  return { rows: out, extra }
}

const safe = (m: string) => m.replace(/[^A-Za-z0-9_]/g, '_')

/** Splits a set of combinations into subcubes: lists of [mod, on] literals whose conjunction is exactly the set. */
export function cubes(cs: string[][], mods: string[]): [string, boolean][][] {
  const has = (c: string[], m: string) => c.includes(m)
  const go = (set: string[][], free: string[], fixed: [string, boolean][]): [string, boolean][][] => {
    if (!set.length) return []
    // mods whose value is the same across the set become literals
    const constant = free.filter((m) => set.every((c) => has(c, m) === has(set[0], m)))
    const lits: [string, boolean][] = [...fixed, ...constant.map((m): [string, boolean] => [m, has(set[0], m)])]
    const rest = free.filter((m) => !constant.includes(m))
    if (set.length === 1 << rest.length) return [lits]
    const [split, ...more] = rest
    return [...go(set.filter((c) => !has(c, split)), more, [...lits, [split, false]]), ...go(set.filter((c) => has(c, split)), more, [...lits, [split, true]])]
  }
  return go(cs, [...mods], [])
}

/** A copy of a quest without its versions (what Play mode and the checks use for the base). */
export const baseOf = <T extends Versioned>(x: T): T => { const c = clone(x); delete c.versions; return c }

// ---------------------------------------------------------------- name tokens

/** The name tokens every person of the mod gets: `$<id>_name`, `$<id>_firstName`, `$<id>_lastName`. */
export const NAME_TOKENS = [['name', 'full name'], ['firstName', 'first name'], ['lastName', 'last name']] as const
export const nameToken = (person: string, which: (typeof NAME_TOKENS)[number][0] = 'name') => `$${person}_${which}`

/**
 * PLAN.md §10.6: dialog names a person of the mod through their name tokens, so a version's name
 * shows everywhere. They are exported as the person's phrases (SagaLib fills phrase tokens; a
 * phrase the designer made with the same token wins), so they follow the person's version.
 */
export function addNameTokens(m: ModModel, versioned: (id: string) => boolean = () => false): ModModel {
  if (!m.people.length) return m
  // only for people a text names by token, or whose name has versions (no clutter otherwise)
  const texts = JSON.stringify([m.quests, m.phrases, m.people.map((p) => p.phrases), m.events, m.progress])
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const used = (id: string) => versioned(id) || NAME_TOKENS.some(([w]) => new RegExp(`${esc(nameToken(id, w))}(?![\\w])`).test(texts))
  if (!m.people.some((p) => used(p.id))) return m
  return {
    ...m,
    people: m.people.map((p) => {
      if (!used(p.id)) return p
      const have = new Set(p.phrases.map((x) => x.token))
      // #79: a one-name person's first-name token is the one name (as SagaLib fills $personFirstName)
      const sn = storedName(p)
      const text = { name: fullName(sn), firstName: firstNameOf(sn), lastName: sn.last }
      const extra = NAME_TOKENS.map(([w]) => nameToken(p.id, w)).filter((t) => !have.has(t))
      if (!extra.length) return p
      return { ...p, phrases: [...p.phrases, ...NAME_TOKENS.filter(([w]) => !have.has(nameToken(p.id, w))).map(([w]) => ({ token: nameToken(p.id, w), owner: p.id, mode: 'first-match' as const, cases: [], otherwise: text[w] }))] }
    })
  }
}

/** People whose name has versions (they always get their name tokens). */
export const nameVersioned = (m: ModModel) => (id: string): boolean => !!m.people.find((p) => p.id === id)?.versions?.some((v) => Object.keys(v.set).some((k) => k === 'name' || k.startsWith('name.')))
