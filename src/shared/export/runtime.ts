/**
 * Runtime JSON for SagaLib (PLAN.md §3.1 "What it reads"; format documented in
 * mods/SagaLib/docs/FORMAT.md). Every file has "format": 1 and a "_sagaforge" header with a hash,
 * so a hand edit is noticed. Editor-only data (positions, notes) is left out.
 */
import type { ModModel } from '../serialize'
import type { ProjectState } from '../project'
import type { CompiledQuest } from './questrules'
import { currentStage, prereqConditions } from './questrules'
import { blockHash } from './blocks'
import type { EncounterDef, PoolPlan, QuestPlan, ScatterPlan, StarSystemDef } from '../model'
import { branchPool, runtimePool } from '../pools'
import { runtimeTargets, targetPartKey, targetPartOf, targetVarOf, targetVars } from '../targets'
import { eventsRuntime } from './events'
import { progressRuntime } from './progress'
import { gateJson, isNone, modsJson, MODS_JSON, type EffConds } from '../modlist'
import type { ItemConds } from '../moduses'
import { withRuntimeVersions } from '../itemversions'
import type { VKind } from '../modelversions'
import { textFile } from '../translate'
import { bountyIdsOf } from '../bounties'
import type { RuleStrings } from './texttokens'
import type { GameIndex } from '../api'
import { ownerChangeJson } from '../nexerelin'
import { factionRepLines } from '../replevels'
import type { SettingDef } from '../model'
import { LUNA_SETTINGS_CSV, runtimeScale, usesSettings, valueSettings } from '../settings'
import { nexConfigured } from '../nexconfig'
import { skipRuntime, usesQuestSkip } from '../questskip'
import { usesAchievements } from '../achievements'

/** #64: what runtimeFiles needs for versions (export/index.ts versionContext + the compiler). */
export interface RuntimeVersions {
  mods: (kind: VKind, id: string) => string[]
  at: (on: string[]) => ModModel
  compile: (q: QuestPlan) => CompiledQuest
  ruleStrings?: RuleStrings
  /** People whose placement has versions: left out of markets' people lists (their placement puts them at the right market). */
  movablePeople?: Set<string>
}

export const RUNTIME_FORMAT = 1
export const SAGA_QUEST_CLASS = 'lastai.sagalib.quest.SagaQuest'
export const CONTENT_CSV = 'data/config/sagaforge/content.csv'
/** The mission icon a quest gets when it has none of its own (vanilla, 64×64). */
export const DEFAULT_QUEST_ICON = 'graphics/icons/missions/data_retrieval.png'

export interface RuntimeFile { path: string; text: string; summary: string; type: string; id: string }

function stamp(obj: Record<string, unknown>): string {
  const body = JSON.stringify(obj, null, 2)
  const hash = blockHash(body)
  return JSON.stringify({ _sagaforge: { generated: 'by Saga Forge; edits are overwritten on export', hash }, ...obj }, null, 2) + '\n'
}

/**
 * SagaLib 1.3: a quest's Wait nodes on a MagicLib bounty's end, as the quest JSON's "bountyWaits":
 * the step it waits at (the Stage before it) and the trigger of each connected outcome
 * ("<quest>_<node>_<outcome>"; an unconnected one is "", so the quest stays there).
 */
export function bountyWaitsJson(q: QuestPlan): { node: string; bounty: string; stage?: string; succeeded: string; failed: string; expired: string; dismissed: string }[] {
  return q.nodes.flatMap((n) => {
    if (n.type !== 'wait' || n.mode !== 'bounty' || !n.bounty?.trim()) return []
    const st = currentStage(q, n.id)
    const trig = (out: string) => (q.edges.some((e) => e.from === n.id && e.handle === out) ? `${q.id}_${n.id}_${out}` : '')
    return [{ node: n.id, bounty: n.bounty.trim(), ...(st ? { stage: st } : {}), succeeded: trig('succeeded'), failed: trig('failed'), expired: trig('expired'), dismissed: trig('dismissed') }]
  })
}

/** A quest's runtime definition: what SagaLib needs to run it as a HubMission. */
export function questRuntime(q: QuestPlan, c: CompiledQuest, gate?: EffConds, owner: Record<string, unknown> | null = null, settings: SettingDef[] = [], skip: Record<string, unknown> | null = null): Record<string, unknown> {
  const scaled = (list: QuestPlan['rewards']) => list.map(({ creditsScale, ...r }) => { const sc = runtimeScale(creditsScale, settings); return sc ? { ...r, creditsScale: sc } : r })
  // the step a timer waits at: without it SagaLib starts the timer at the step the quest is at when
  // it first sees it active (the quest's first step), not when the quest reaches the Wait node
  const timers = q.nodes.filter((n) => n.type === 'wait' && n.mode === 'days').map((n) => { const st = currentStage(q, n.id); return { node: n.id, trigger: `${q.id}_${n.id}`, days: (n as { days?: number }).days ?? 0, ...(st ? { stage: st } : {}) } })
  const bountyWaits = bountyWaitsJson(q)
  const encounters = q.nodes.filter((n) => n.type === 'encounter').map((n) => ({ node: n.id, encounter: (n as { encounter: string }).encounter, defeated: `${q.id}_${n.id}_defeated`, avoided: `${q.id}_${n.id}_avoided` }))
  // Phase 7c: a place may be a random target ("target:<var>"): SagaLib reads its key for the picked id
  const place = (ref: string | undefined) => { const v = targetVarOf(ref); return v ? targetPartKey(q.id, v, targetPartOf(ref)) : ref }
  const markers = q.nodes.filter((n) => n.type === 'wait' && n.mode === 'arrive').map((n) => place((n as { entity?: string }).entity)).filter(Boolean)
  // RC-F2 (SagaLib 1.1): the place an Arrive node waits at is marked important while the quest is at that stage
  const entityFlags = q.nodes.flatMap((n) => {
    if (n.type !== 'wait' || n.mode !== 'arrive' || !n.entity) return []
    const st = currentStage(q, n.id)
    return st ? [{ entity: place(n.entity), flag: `$sagaforge_${q.id}_${n.id}`, steps: [st], important: true }] : []
  })
  return {
    format: RUNTIME_FORMAT,
    id: q.id,
    title: q.title,
    kind: q.kind,
    icon: q.icon || DEFAULT_QUEST_ICON,
    repeatable: q.repeatable,
    timeLimitDays: q.timeLimitDays ?? 0,
    start: q.start,
    requires: prereqConditions(q),
    stages: q.stages.map((s) => ({ id: s.id, title: s.title, journal: s.journal, nextStep: s.nextStep ?? '', marker: place(s.marker) ?? '', kind: s.kind, renamedFrom: s.renamedFrom })),
    variables: q.variables.filter((v) => v.type !== 'target').map((v) => ({ name: v.name, type: v.type, initial: v.initial })),
    // Phase 7c (SagaLib 1.2): random targets, searched with vanilla's HubMissionWithSearch when offered
    targets: runtimeTargets(q),
    // #62 (SagaLib 1.3): a credits scale names its setting's kind (an Int setting is a percent: per 100)
    rewards: scaled(q.rewards),
    timers,
    encounters,
    // SagaLib 1.3: Wait nodes on a MagicLib bounty's end (watched at their step through MagicLib's memory keys)
    ...(bountyWaits.length ? { bountyWaits } : {}),
    arrivals: markers,
    ...(entityFlags.length ? { entityFlags } : {}),
    phrases: q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : [])),
    flags: c.generatedFlags.filter((f) => f.scope === 'ever').map((f) => f.key),
    // #61 (SagaLib 1.3): what happens when one of its markets changes owner (watched daily)
    ...(owner ? { ownerChange: owner } : {}),
    // #65 (SagaLib 1.3): skipped on Nexerelin's new-game screen: the ending's rewards and people to show (given by SagaLib's plugin)
    ...(skip ? { skip: { ...skip, ...(Array.isArray(skip.rewards) ? { rewards: scaled(skip.rewards as QuestPlan['rewards']) } : {}) } } : {}),
    // #60 (SagaLib 1.3): only with / only without mods: never offered or started otherwise
    ...gateJson(gate)
  }
}

export function runtimeFiles(m: ModModel, loaded: ProjectState, compiled: Record<string, CompiledQuest>, text: Record<string, unknown> | null = null, eff: Map<string, ItemConds> = new Map(), vr: RuntimeVersions | null = null, index: GameIndex | null = null): RuntimeFile[] {
  const g = (key: string) => gateJson(eff.get(key)?.eff)
  const out: RuntimeFile[] = []
  const mod = loaded.modInfo.id
  // #64: an item with versions: its JSON per combination of optional mods, written as SagaLib "versions"
  const vmods = (kind: VKind, id: string) => vr?.mods(kind, id) ?? []
  const versioned = <T>(kind: VKind, id: string, find: (mm: ModModel) => T | undefined, json: (x: T, mm: ModModel) => Record<string, unknown>, base: T): Record<string, unknown> => {
    const ms = vmods(kind, id)
    if (!ms.length || !vr) return json(base, m)
    return withRuntimeVersions(ms, (on) => { const mm = on.length ? vr.at(on) : m; const x = on.length ? find(mm) : base; return x ? json(x, mm) : {} })
  }
  for (const q of m.quests) {
    if (q.kind !== 'quest' && !q.nodes.some((n) => n.type === 'dialog' && n.phrases.length) && !vmods('quest', q.id).length) continue
    const qj = versioned('quest', q.id, (mm) => mm.quests.find((x) => x.id === q.id), (x, mm) => questRuntime(x, mm === m || !vr ? compiled[q.id] : vr.compile(x), eff.get(`quest:${q.id}`)?.eff, ownerChangeJson(x, mm, index), m.project.settings ?? [], skipRuntime(m, x)), q)
    out.push({ path: `data/sagaforge/quests/${q.id}.json`, text: stamp(qj), summary: `${q.kind === 'dialog' ? 'conversation' : 'quest'} "${q.title}" for SagaLib${qj.versions ? ' (with versions)' : ''}`, type: 'quest', id: q.id })
  }
  // #70: presence with its faction filled in (default: their own); only for a person placed at a market (SagaLib ignores it otherwise)
  const presenceJson = (p: Pick<ModModel['people'][number], 'presence' | 'placement' | 'faction'>) => (p.presence && p.placement.at === 'market'
    ? { presence: { faction: p.presence.faction || p.faction, atLeast: p.presence.atLeast, ...(p.presence.elsewhere ? { elsewhere: p.presence.elsewhere } : {}) } } : {})
  const personJson = ({ notes: _n, todo: _t, inactive: _i, mods: _m, versions: _v, presence: _p, ...p }: ModModel['people'][number]) => ({ ...p, ...presenceJson({ ...p, presence: _p }), ...g(`person:${p.id}`) })
  if (m.people.length || m.phrases.length) {
    out.push({
      path: `data/sagaforge/people/${mod}_people.json`, type: 'people', id: `${mod}_people`,
      text: stamp({ format: RUNTIME_FORMAT, people: m.people.map((p) => versioned('person', p.id, (mm) => mm.people.find((x) => x.id === p.id), (x) => personJson(x), p)), phrases: m.phrases }),
      summary: `${m.people.length} ${m.people.length === 1 ? 'person' : 'people'}, ${m.phrases.length} mod-wide phrase${m.phrases.length === 1 ? '' : 's'}`
    })
  }
  const facMods = vmods('factions', 'factions')
  if (Object.keys(m.factionsRuntime.relations).length || Object.keys(m.factionsRuntime.scripted).length || facMods.length) {
    const nex = nexConfiguredWithRelations(m)
    out.push({ path: 'data/sagaforge/factions.json', type: 'factions', id: `${mod}_factions`, text: stamp(versioned('factions', 'factions', (mm) => mm, (_x, mm) => ({ format: RUNTIME_FORMAT, ...factionsRuntimeJson(mm, eff) }), m)), summary: `starting relations and scripted faction changes${facMods.length ? ' (with versions)' : ''}${nex.length ? `; with Nexerelin, ${nex.join(', ')}'s are left to it` : ''}` })
  }
  for (const s of m.systems) out.push({ path: `data/sagaforge/systems/${s.id}.json`, type: 'system', id: s.id, text: stamp(versioned('system', s.id, (mm) => mm.systems.find((x) => x.id === s.id), (x) => ({ ...systemRuntime(x, eff, vr?.movablePeople), format: RUNTIME_FORMAT }), s)), summary: `system "${s.name}"` })
  for (const e of m.encounters) out.push({ path: `data/sagaforge/encounters/${e.id}.json`, type: 'encounter', id: e.id, text: stamp(versioned('encounter', e.id, (mm) => mm.encounters.find((x) => x.id === e.id), (x, mm) => ({ ...encounterRuntime(x, mm), ...g(`encounter:${e.id}`), format: RUNTIME_FORMAT }), e)), summary: `encounter "${e.name}"` })
  // random pools (SagaLib 1.2): the named ones and each Random branch's own cases
  for (const p of usedPools(m)) out.push({ path: `data/sagaforge/pools/${p.id}.json`, type: 'pool', id: p.id, text: stamp(versioned('pool', p.id, (mm) => (mm.pools ?? []).find((x) => x.id === p.id), (x) => ({ ...runtimePool(x), ...g(`pool:${p.id}`), format: RUNTIME_FORMAT }), p)), summary: `random pool "${p.name}" (${p.entries.length} entr${p.entries.length === 1 ? 'y' : 'ies'})` })
  // Phase 8d (RC-R12): world event schedulers
  for (const s of m.events ?? []) out.push({ path: `data/sagaforge/events/${s.id}.json`, type: 'events', id: s.id, text: stamp(versioned('events', s.id, (mm) => (mm.events ?? []).find((x) => x.id === s.id), (x) => ({ ...eventsRuntime(x), ...g(`events:${s.id}`) }), s)), summary: `event scheduler "${s.name}" (${s.events.length} event${s.events.length === 1 ? '' : 's'})` })
  // Phase 8d-3 (RC-R12 b): progress events
  for (const p of m.progress ?? []) out.push({ path: `data/sagaforge/progress/${p.id}.json`, type: 'progress', id: p.id, text: stamp({ ...progressRuntime(p), ...g(`progress:${p.id}`) }), summary: `progress event "${p.name}" (${p.stages.length} stage${p.stages.length === 1 ? '' : 's'})` })
  // Phase 7e (RC-R10): scatter at new game
  for (const sc of m.scatter ?? []) out.push({ path: `data/sagaforge/scatter/${sc.id}.json`, type: 'scatter', id: sc.id, text: stamp({ ...scatterRuntime(sc), ...g(`scatter:${sc.id}`) }), summary: `scatter "${sc.name}" (${sc.count} ${sc.entity.type})` })
  // R31: the texts translations replace (dialog tokens, item names, descriptions, faction names)
  if (text) {
    const n = Object.keys((text.rules as Record<string, unknown>) ?? {}).length
    // #64: item and description versions: set at startup from the installed mods
    if (vr) text = textVersions(m, vr, text)
    out.push({ path: 'data/sagaforge/text.json', type: 'strings', id: `${mod}_text`, text: stamp(text), summary: `texts of ${n} dialog rule${n === 1 ? '' : 's'}, names and descriptions (translatable)` })
  }
  if (m.testProfiles.length) out.push({ path: 'data/sagaforge/dev/test_profiles.json', type: 'profiles', id: `${mod}_profiles`, text: stamp({ format: RUNTIME_FORMAT, profiles: m.testProfiles }), summary: `${m.testProfiles.length} test profile${m.testProfiles.length === 1 ? '' : 's'} (dev mode only)` })

  // #60 (SagaLib 1.3): the mod's list of other mods
  { const mf = modsRuntimeFile(m, loaded); if (mf) out.push(mf) }
  // content.csv: SagaLib's merged index of every Saga Forge mod's files
  const eol = loaded.files[CONTENT_CSV]?.text.includes('\r\n') ? '\r\n' : '\n'
  const rows = out.map((f) => `${f.id},${f.type},${f.path},${mod}`)
  // #62 (SagaLib 1.3): the mod's LunaSettings.csv (written by the export beside these): SagaLib sets its values as $global.<id>
  if (valueSettings(m).length) rows.push(`${mod}_settings,settings,${LUNA_SETTINGS_CSV},${mod}`)
  out.push({ path: CONTENT_CSV, type: 'index', id: 'content', text: ['id,type,path,mod', ...rows].join(eol) + eol, summary: `index of ${rows.length} SagaLib file${rows.length === 1 ? '' : 's'}` })

  // person_missions.csv / bar_events.csv: how vanilla offers the quests
  const contact = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'contact')
  const bar = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'bar')
  out.push(...missionCsv(loaded, contact, bar))
  return out
}

/**
 * #64: text.json with the versions of the mod's items (name, description, icon, base price) and
 * descriptions, over its own paths (items.<id>.name, descriptions.<id>|<TYPE>.text1, …).
 */
export function textVersions(m: ModModel, vr: RuntimeVersions, text: Record<string, unknown>): Record<string, unknown> {
  const ms = [...new Set([...m.items.flatMap((i) => vr.mods('item', i.id)), ...Object.keys(m.descriptions).flatMap((k) => vr.mods('description', k))])].sort()
  if (!ms.length) return text
  const versionedItems = m.items.filter((i) => vr.mods('item', i.id).length)
  // SagaLib takes only leaf paths here (items.<id>.name, descriptions.<key>.text1, …): a new entry is set field by field
  const flat = (set: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    const walk = (p: string, v: unknown) => { if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(`${p}.${k}`, x); else out[p] = v }
    for (const [p, v] of Object.entries(set)) walk(p, v)
    return out
  }
  const withV = textVersionsRaw(ms, vr, text, versionedItems)
  const vs = withV.versions as { set: Record<string, unknown> }[] | undefined
  if (vs) for (const v of vs) v.set = flat(v.set)
  return withV
}

function textVersionsRaw(ms: string[], vr: RuntimeVersions, text: Record<string, unknown>, versionedItems: ModModel['items']): Record<string, unknown> {
  return withRuntimeVersions(ms, (on) => {
    if (!on.length) return text
    const mm = vr.at(on)
    const t = textFile(mm, vr.ruleStrings ?? {}) as Record<string, unknown>
    // icons and prices aren't texts: only in the versions (the CSV has the base's)
    const items = { ...((t.items as Record<string, Record<string, unknown>>) ?? {}) }
    for (const it of versionedItems) {
      const x = mm.items.find((i) => i.id === it.id)
      if (!x) continue
      items[it.id] = { ...(items[it.id] ?? {}), ...(x.icon !== it.icon ? { icon: x.icon } : {}), ...(x.basePrice !== it.basePrice ? { basePrice: x.basePrice } : {}) }
    }
    return { ...t, ...(Object.keys(items).length ? { items } : {}) }
  })
}

/** Phase 7e (RC-R10): a scatter as SagaLib reads it (the target as a quest target without a var). */
export function scatterRuntime(sc: ScatterPlan): Record<string, unknown> {
  const t = sc.target
  const crit = (l: { id: string; args: unknown[] }[]) => l.map((x) => ({ c: x.id, args: x.args }))
  return {
    format: RUNTIME_FORMAT, id: sc.id, count: sc.count, ...(sc.addToExistingSaves ? { addToExistingSaves: true } : {}),
    target: { pick: t.pick, require: crit(t.require), prefer: crit(t.prefer), ...(t.systemFirst ? { systemFirst: true } : {}) },
    entity: { type: sc.entity.type, name: sc.entity.name || sc.name, faction: sc.entity.faction || 'neutral' },
    ...(sc.loot?.length ? { loot: sc.loot } : {}), ...(sc.defenders ? { defenders: sc.defenders } : {}), ...(sc.from ? { from: sc.from } : {})
  }
}

/** A system as SagaLib reads it: a starless one says `"star": null` (SagaLib 1.1); empty 1.1 lists left out. */
function systemRuntime(s: StarSystemDef, eff: Map<string, ItemConds> = new Map(), movable?: Set<string>): Record<string, unknown> {
  const o = stripNotes(s) as unknown as Record<string, unknown>
  if (s.kind === 'new' && s.starless) { o.star = null; o.light = s.light ?? [255, 255, 255] }
  else delete o.light
  delete o.starless
  if (!s.removals?.length) delete o.removals
  // #60 (SagaLib 1.3): the system's and each object's mod conditions
  Object.assign(o, gateJson(eff.get(`system:${s.id}`)?.eff))
  o.entities = (o.entities as Record<string, unknown>[]).map((e) => {
    const x = { ...e }
    delete x.mods
    // #64: a person whose placement has versions is placed by it (else SagaLib would warn where a version moves them)
    const mk = x.market as { people?: string[] } | undefined
    if (mk?.people && movable?.size) x.market = { ...mk, people: mk.people.filter((p) => !movable.has(p)) }
    return { ...x, ...gateJson(eff.get(`entity:${String(e.id)}`)?.eff) }
  })
  return o
}

/**
 * An encounter as SagaLib reads it. A named fleet (R27) is expanded into an explicit fleet: the
 * template's faction, type, ships, ship names, flagship and captain (SagaLib 1.1 reads the names,
 * the flagship, the template id for counting defeats, and whether the captain dies with it).
 */
export function encounterRuntime(e: EncounterDef, m: ModModel): Record<string, unknown> {
  const o = stripNotes(e) as unknown as Record<string, unknown>
  if (e.fleet.size !== 'template') {
    const f: Record<string, unknown> = { ...e.fleet }
    delete f.template
    // #62 (SagaLib 1.3): only a fleet from the doctrine (fleet points) is scaled by a setting
    const sc = e.fleet.size === 'fp' ? runtimeScale(e.fleet.sizeScale, m.project.settings ?? []) : undefined
    if (sc) f.sizeScale = sc; else delete f.sizeScale
    return { ...o, fleet: f }
  }
  const t = m.fleets?.templates.find((x) => x.id === e.fleet.template)
  if (!t) return { ...o, fleet: { ...e.fleet, size: 'fp', template: undefined } }
  const fleet: Record<string, unknown> = {
    faction: t.faction, type: t.fleetType || e.fleet.type, size: 'explicit', points: 0,
    variants: t.ships.map((s) => s.variant), shipNames: t.ships.map((s) => s.name ?? ''),
    flagship: Math.min(Math.max(0, t.flagship ?? 0), Math.max(0, t.ships.length - 1)), template: t.id
  }
  if (t.quality !== undefined) fleet.quality = t.quality
  if (t.captain) fleet.flagshipCommander = t.captain
  if (t.captainDiesOnDefeat) fleet.captainDiesOnDefeat = true
  if (t.name) fleet.name = t.name
  return { ...o, fleet }
}

/** The pools the export writes: the named pools, then each Random branch's own (not inactive quests'). */
export function usedPools(m: ModModel): PoolPlan[] {
  // loot pools are drop groups (drop_groups.csv), not SagaLib pools
  const out: PoolPlan[] = (m.pools ?? []).filter((p) => p.use !== 'loot')
  for (const q of m.quests) {
    if (q.inactive) continue
    for (const n of q.nodes) if (n.type === 'branch' && n.random && !n.random.pool) { const p = branchPool(q, n, []); if (p) out.push(p) }
  }
  return out
}

/** True when the mod uses something only SagaLib 1.2 understands (DESIGN-PHASE7.md): random pools. */
export function needsSagaLib12(m: ModModel): boolean {
  return usedPools(m).length > 0 || m.quests.some((q) => q.nodes.some((n) => n.type === 'branch' && !!n.random) || targetVars(q).length > 0) ||
    // Phase 7e: scatter, salvage loot and defenders, the deciv guard
    !!m.scatter?.length || m.systems.some((s) => s.entities.some((e) => !!e.loot?.length || !!e.defenders || !!e.market?.protectFromDeciv || !!e.ruinsUnexplored)) ||
    // Phase 8a: rewards that roll drop groups
    m.quests.some((q) => q.rewards.some((r) => !!r.loot?.length)) ||
    // Phase 8d: world events and roaming fleets
    !!m.events?.length || !!m.progress?.length || m.encounters.some((e) => e.spawn.when === 'roaming') ||
    m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((o) => o.op === 'progress'))) ||
    // Phase 8c (R31): translatable texts (dialog tokens and data/sagaforge/text.json)
    m.project.options?.translatable !== false
}

/** True when the mod uses something only SagaLib 1.1 understands (DESIGN-PHASE4.md). */
export function needsSagaLib11(m: ModModel): boolean {
  return m.systems.some((s) => (s.kind === 'new' && s.starless) || !!s.removals?.length || s.entities.some((e) => !!e.appears || !!e.replaces || !!e.conditions?.length || !!e.surveyed)) ||
    m.encounters.some((e) => e.spawn.when === 'player-near' || e.fleet.size === 'template') ||
    m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((op) => op.op === 'removePerson'))) ||
    m.quests.some((q) => q.nodes.some((n) => n.type === 'wait' && n.mode === 'arrive' && !!n.entity && !!currentStage(q, n.id))) ||
    m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((op) => op.op === 'placeEntity' || op.op === 'removeEntity')))
}

function stripNotes<T extends object>(o: T): T {
  const c = JSON.parse(JSON.stringify(o)) as Record<string, unknown>
  delete c.notes
  // editor-only fields (R9, R10)
  delete c.todo
  delete c.inactive
  // #60: written as SagaLib's modsWith / modsWithout / modsAny instead
  delete c.mods
  return c as T
}

import { writeBlock, csvLine } from './blocks'
import { parseCsvRecords } from '../csvedit'

/** Offer timing defaults in days (what 1.0 always wrote; RC-R5 makes them editable). */
export const CONTACT_TIMEOUT: [number, number] = [30, 60]
export const BAR_DURATION: [number, number] = [30, 40]
export const BAR_TIMEOUT: [number, number] = [15, 20]
export const BAR_ACCEPTED_TIMEOUT: [number, number] = [60, 90]

const PM_HEADER =['mission id', 'person id', 'tagsAll', 'tagsAny', 'tagsNotAny', 'tags', 'freq', 'min timeout', 'max timeout', 'min rep', 'max rep', 'importance', 'reqMissionAny', 'reqMissionAll', 'reqMissionNone', 'icon', 'plugin']
const BAR_HEADER = ['bar event id', 'tags', 'freq', 'prob', 'min dur', 'max dur', 'min timeout', 'max timeout', 'min accepted timeout', 'max accepted timeout', 'plugin']

function missionCsv(loaded: ProjectState, contact: QuestPlan[], bar: QuestPlan[]): RuntimeFile[] {
  const out: RuntimeFile[] = []
  const one = (path: string, header: string[], rows: Record<string, string>[], type: string) => {
    const old = loaded.files[path]?.text
    if (!rows.length && !old) return
    const eol = old?.includes('\r\n') ? '\r\n' : '\n'
    const base = old ?? header.join(',') + eol
    const recs = parseCsvRecords(base)
    const h = recs.find((r) => r.fields.some((f) => f.trim()))?.fields.map((x) => x.trim()) ?? header
    const r = writeBlock(base, 'quests', rows.map((row) => csvLine(h.map((c) => row[c] ?? ''))), h.length, { eol, force: true })
    out.push({ path, text: r.text, summary: `${rows.length} quest row${rows.length === 1 ? '' : 's'} in an owned block`, type, id: type })
  }
  one('data/campaign/person_missions.csv', PM_HEADER, contact.map((q) => {
    const s = q.start as Extract<QuestPlan['start'], { kind: 'contact' }>
    const reqAll = q.requires.filter((r) => 'quest' in r && r.ended !== 'fail').map((r) => (r as { quest: string }).quest).join(', ')
    const [tMin, tMax] = s.timeout ?? CONTACT_TIMEOUT
    return {
      'mission id': q.id, 'person id': s.person, tagsAll: s.tagsAll ?? '', tagsAny: s.tagsAny ?? '', tagsNotAny: s.tagsNotAny ?? '', freq: String(s.freq),
      'min timeout': String(tMin), 'max timeout': String(tMax), 'min rep': s.minRep ?? '', 'max rep': s.maxRep ?? '', importance: s.importance ?? '', reqMissionAll: reqAll,
      icon: q.icon || DEFAULT_QUEST_ICON, plugin: SAGA_QUEST_CLASS, tags: s.tags ?? ''
    }
  }), 'person_missions')
  one('data/campaign/bar_events.csv', BAR_HEADER, bar.map((q) => {
    const s = q.start as Extract<QuestPlan['start'], { kind: 'bar' }>
    const [dMin, dMax] = s.duration ?? BAR_DURATION, [tMin, tMax] = s.timeout ?? BAR_TIMEOUT, [aMin, aMax] = s.acceptedTimeout ?? BAR_ACCEPTED_TIMEOUT
    return {
      'bar event id': q.id, tags: s.tags ?? '', freq: String(s.freq), prob: String(s.prob), 'min dur': String(dMin), 'max dur': String(dMax),
      'min timeout': String(tMin), 'max timeout': String(tMax), 'min accepted timeout': String(aMin), 'max accepted timeout': String(aMax), plugin: SAGA_QUEST_CLASS
    }
  }), 'bar_events')
  return out
}

/**
 * factions.json (#60, SagaLib 1.3): a relation with mod conditions is written as an object
 * {"value": v, "modsWith": [...]}; a scripted change carries its own. Editor-only keys are left out.
 */
export function factionsRuntimeJson(m: ModModel, eff: Map<string, ItemConds>): Record<string, unknown> {
  const rt = m.factionsRuntime
  const relations: Record<string, Record<string, unknown>> = {}
  for (const [a, others] of Object.entries(rt.relations)) {
    relations[a] = {}
    for (const [b, v] of Object.entries(others)) {
      const e = eff.get(`relation:${a}/${b}`)?.eff
      relations[a][b] = e && !isNone(e) ? { value: v, ...gateJson(e) } : v
    }
  }
  const scripted: Record<string, unknown[]> = {}
  for (const [f, list] of Object.entries(rt.scripted)) {
    scripted[f] = list.map((c, i) => {
      const { mods: _m, ...x } = c
      const out: Record<string, unknown> = c.op === 'hideFromIntelTab' || c.op === 'showInIntelTab' ? { op: c.op } : { ...x }
      return { ...out, ...gateJson(eff.get(`scripted:${f}#${i}`)?.eff) }
    })
  }
  // #63 (SagaLib 1.3): factions whose starting relations are also in the mod's Nexerelin config;
  // with Nexerelin, SagaLib leaves those without mod conditions to it
  const nexerelin = nexConfiguredWithRelations(m)
  return { relations, scripted, ...(nexerelin.length ? { nexerelin } : {}) }
}

/** #63: the mod's factions with a Nexerelin config and starting relations (factions.json "nexerelin"). */
export const nexConfiguredWithRelations = (m: ModModel): string[] => nexConfigured(m).filter((id) => Object.keys(m.factionsRuntime.relations[id] ?? {}).length > 0)

/** #60: data/sagaforge/mods.json for SagaLib 1.3 (only when the mod lists other mods). */
export function modsRuntimeFile(m: ModModel, loaded: ProjectState): RuntimeFile | null {
  if (!m.project.mods?.length) return null
  const mod = loaded.modInfo.id
  return { path: MODS_JSON, type: 'mods', id: `${mod}_mods`, text: stamp(modsJson(m.project, { id: mod, name: loaded.modInfo.name })), summary: `the mod's list of other mods (${m.project.mods.length}) for SagaLib's start record` }
}

/** #60: true when the mod uses something only SagaLib 1.3 understands: mod conditions, mods.json, hiding a faction from the intel tab. */
export function needsSagaLib13(m: ModModel, eff: Map<string, ItemConds>): boolean {
  return !!m.project.mods?.length || [...eff.values()].some((c) => !isNone(c.eff)) ||
    // #61: owner changes and protection from invasion
    m.quests.some((q) => !!q.ownerChange) || m.systems.some((s) => s.entities.some((e) => !!e.market?.protectFromInvasion)) ||
    Object.values(m.factionsRuntime.scripted).some((l) => l.some((c) => c.op !== 'remove' || !!c.mods?.with?.length || !!c.mods?.without?.length)) ||
    // #59: MagicLib bounties from quests, and the true/false quest-ended keys
    usesBountyCommands(m) ||
    // #70: presence by the market's owner, and SF_FactionRep in dialog, phrases or conditions
    m.people.some((p) => !!p.presence) || factionRepLines([m.quests, m.phrases, m.people.map((p) => p.phrases)]).length > 0 ||
    // #62: settings read in conditions or scaling credits and fleets (SagaLib sets their keys)
    usesSettings(m) ||
    // #63: relations left to Nexerelin (factions.json "nexerelin")
    nexConfiguredWithRelations(m).length > 0 ||
    // #65: Nexerelin's quest skip (SagaLib's plugin) and MagicLib achievements (SF_Achievement)
    usesQuestSkip(m) || usesAchievements(m)
}

/** #59: the quests start or test MagicLib bounties (SF_StartBounty, SF_BountyState), or a bounty tests a quest's ended key. */
export function usesBountyCommands(m: ModModel): boolean {
  return m.quests.some((q) => bountyIdsOf(q).length > 0) || (m.bounties ?? []).some((b) => !!(b.quest && m.quests.find((x) => x.id === b.quest)?.requires.some((r) => 'quest' in r)))
}
