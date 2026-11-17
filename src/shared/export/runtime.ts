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

/** A quest's runtime definition: what SagaLib needs to run it as a HubMission. */
export function questRuntime(q: QuestPlan, c: CompiledQuest): Record<string, unknown> {
  const timers = q.nodes.filter((n) => n.type === 'wait' && n.mode === 'days').map((n) => ({ node: n.id, trigger: `${q.id}_${n.id}`, days: (n as { days?: number }).days ?? 0 }))
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
    rewards: q.rewards,
    timers,
    encounters,
    arrivals: markers,
    ...(entityFlags.length ? { entityFlags } : {}),
    phrases: q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : [])),
    flags: c.generatedFlags.filter((f) => f.scope === 'ever').map((f) => f.key)
  }
}

export function runtimeFiles(m: ModModel, loaded: ProjectState, compiled: Record<string, CompiledQuest>, text: Record<string, unknown> | null = null): RuntimeFile[] {
  const out: RuntimeFile[] = []
  const mod = loaded.modInfo.id
  for (const q of m.quests) {
    if (q.kind !== 'quest' && !q.nodes.some((n) => n.type === 'dialog' && n.phrases.length)) continue
    out.push({ path: `data/sagaforge/quests/${q.id}.json`, text: stamp(questRuntime(q, compiled[q.id])), summary: `quest "${q.title}" for SagaLib`, type: 'quest', id: q.id })
  }
  if (m.people.length || m.phrases.length) {
    out.push({
      path: `data/sagaforge/people/${mod}_people.json`, type: 'people', id: `${mod}_people`,
      text: stamp({ format: RUNTIME_FORMAT, people: m.people.map(({ notes: _n, todo: _t, inactive: _i, ...p }) => p), phrases: m.phrases }),
      summary: `${m.people.length} ${m.people.length === 1 ? 'person' : 'people'}, ${m.phrases.length} mod-wide phrase${m.phrases.length === 1 ? '' : 's'}`
    })
  }
  if (Object.keys(m.factionsRuntime.relations).length || Object.keys(m.factionsRuntime.scripted).length) {
    out.push({ path: 'data/sagaforge/factions.json', type: 'factions', id: `${mod}_factions`, text: stamp({ format: RUNTIME_FORMAT, ...m.factionsRuntime }), summary: 'starting relations and scripted faction changes' })
  }
  for (const s of m.systems) out.push({ path: `data/sagaforge/systems/${s.id}.json`, type: 'system', id: s.id, text: stamp({ ...systemRuntime(s), format: RUNTIME_FORMAT }), summary: `system "${s.name}"` })
  for (const e of m.encounters) out.push({ path: `data/sagaforge/encounters/${e.id}.json`, type: 'encounter', id: e.id, text: stamp({ ...encounterRuntime(e, m), format: RUNTIME_FORMAT }), summary: `encounter "${e.name}"` })
  // random pools (SagaLib 1.2): the named ones and each Random branch's own cases
  for (const p of usedPools(m)) out.push({ path: `data/sagaforge/pools/${p.id}.json`, type: 'pool', id: p.id, text: stamp({ ...runtimePool(p), format: RUNTIME_FORMAT }), summary: `random pool "${p.name}" (${p.entries.length} entr${p.entries.length === 1 ? 'y' : 'ies'})` })
  // Phase 8d (RC-R12): world event schedulers
  for (const s of m.events ?? []) out.push({ path: `data/sagaforge/events/${s.id}.json`, type: 'events', id: s.id, text: stamp(eventsRuntime(s)), summary: `event scheduler "${s.name}" (${s.events.length} event${s.events.length === 1 ? '' : 's'})` })
  // Phase 8d-3 (RC-R12 b): progress events
  for (const p of m.progress ?? []) out.push({ path: `data/sagaforge/progress/${p.id}.json`, type: 'progress', id: p.id, text: stamp(progressRuntime(p)), summary: `progress event "${p.name}" (${p.stages.length} stage${p.stages.length === 1 ? '' : 's'})` })
  // Phase 7e (RC-R10): scatter at new game
  for (const sc of m.scatter ?? []) out.push({ path: `data/sagaforge/scatter/${sc.id}.json`, type: 'scatter', id: sc.id, text: stamp(scatterRuntime(sc)), summary: `scatter "${sc.name}" (${sc.count} ${sc.entity.type})` })
  // R31: the texts translations replace (dialog tokens, item names, descriptions, faction names)
  if (text) {
    const n = Object.keys((text.rules as Record<string, unknown>) ?? {}).length
    out.push({ path: 'data/sagaforge/text.json', type: 'strings', id: `${mod}_text`, text: stamp(text), summary: `texts of ${n} dialog rule${n === 1 ? '' : 's'}, names and descriptions (translatable)` })
  }
  if (m.testProfiles.length) out.push({ path: 'data/sagaforge/dev/test_profiles.json', type: 'profiles', id: `${mod}_profiles`, text: stamp({ format: RUNTIME_FORMAT, profiles: m.testProfiles }), summary: `${m.testProfiles.length} test profile${m.testProfiles.length === 1 ? '' : 's'} (dev mode only)` })

  // content.csv: SagaLib's merged index of every Saga Forge mod's files
  const eol = loaded.files[CONTENT_CSV]?.text.includes('\r\n') ? '\r\n' : '\n'
  const rows = out.map((f) => `${f.id},${f.type},${f.path},${mod}`)
  out.push({ path: CONTENT_CSV, type: 'index', id: 'content', text: ['id,type,path,mod', ...rows].join(eol) + eol, summary: `index of ${rows.length} SagaLib file${rows.length === 1 ? '' : 's'}` })

  // person_missions.csv / bar_events.csv: how vanilla offers the quests
  const contact = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'contact')
  const bar = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'bar')
  out.push(...missionCsv(loaded, contact, bar))
  return out
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
function systemRuntime(s: StarSystemDef): Record<string, unknown> {
  const o = stripNotes(s) as unknown as Record<string, unknown>
  if (s.kind === 'new' && s.starless) { o.star = null; o.light = s.light ?? [255, 255, 255] }
  else delete o.light
  delete o.starless
  if (!s.removals?.length) delete o.removals
  return o
}

/**
 * An encounter as SagaLib reads it. A named fleet (R27) is expanded into an explicit fleet: the
 * template's faction, type, ships, ship names, flagship and captain (SagaLib 1.1 reads the names,
 * the flagship, the template id for counting defeats, and whether the captain dies with it).
 */
export function encounterRuntime(e: EncounterDef, m: ModModel): Record<string, unknown> {
  const o = stripNotes(e) as unknown as Record<string, unknown>
  if (e.fleet.size !== 'template') { const f = { ...e.fleet }; delete f.template; return { ...o, fleet: f } }
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
