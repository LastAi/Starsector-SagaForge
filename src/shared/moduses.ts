/**
 * #60 (PLAN.md §10.1, §10.2): what in the mod uses other mods, found by the editor (Origin of every
 * id in the game index, plus the framework files the mod ships), and each item's effective
 * "Only with / Only without" conditions: its own, automatic ones (it refers to an optional mod's
 * content) and inherited ones (spreading along a questline). Pure.
 */
import type { GameIndex, ProblemRef } from './api'
import type { ModModel } from './serialize'
import type { ActionOp, Display, ModsCondition, QNode, QuestPlan, Visual } from './model'
import type { ProjectState } from './project'
import { CORE_ID, SAGALIB_ID, NEXERELIN_ID, FRAMEWORK_FILE_MODS, addCond, commonConds, effLines, isNone, noConds, originSource, optionalMods, type EffConds } from './modlist'
import { targetVarOf } from './targets'
import { bountyIdsOf } from './bounties'
import { hasPlayerFleets, nexConfigured } from './nexconfig'
import { usesQuestSkip } from './questskip'
import { achievementsOf, MAGIC_ACHIEVEMENTS_CSV } from './achievements'

export type RefKind = 'faction' | 'person' | 'entity' | 'system' | 'hull' | 'variant' | 'item' | 'weapon' | 'wing' | 'image' | 'entityType' | 'planetType' | 'file' | 'quest'

/** One reference from the mod's content to an id. */
export interface Ref { kind: RefKind; id: string; where: string; node?: string; option?: string; gameLoaded?: boolean }

/** One item of the mod that can carry mod conditions. */
export interface ScanItem {
  key: string
  label: string
  ref: ProblemRef
  own?: ModsCondition
  refs: Ref[]
}

/** A use of another mod: which item, where, and whether the game loads it every time. */
export interface ModUseSite { key: string; label: string; ref: ProblemRef; where: string; kind: RefKind; id: string; node?: string; gameLoaded?: boolean }

/** Index lookups: the source that defines an id of each kind (null = unknown; the active mod's own ids resolve to it). */
export function sourceLookup(index: GameIndex, m: ModModel, active: string): (kind: RefKind, id: string) => string | null {
  const maps = new Map<RefKind, Map<string, string>>()
  const add = (k: RefKind, id: string, def: string | undefined) => { if (!id || !def) return; let mm = maps.get(k); if (!mm) maps.set(k, (mm = new Map())); if (!mm.has(id)) mm.set(id, originSource(def)) }
  for (const f of index.factions ?? []) add('faction', f.id, f.definedBy)
  for (const p of index.people ?? []) add('person', p.id, p.definedBy)
  for (const mk of index.markets ?? []) { add('entity', mk.id, mk.definedBy); for (const e of mk.entities ?? []) add('entity', e, mk.definedBy) }
  for (const s of index.codeSystems ?? []) { add('system', s.id, s.sourceId); if (s.star?.id) add('entity', s.star.id, s.sourceId); for (const b of s.bodies) if (b.id) add('entity', b.id, s.sourceId) }
  for (const s of index.systems ?? []) add('system', s.id, s.definedBy)
  // #64: other Saga Forge mods' places and quests, and what a sector snapshot saw
  for (const pl of index.places ?? []) add('entity', pl.id, pl.definedBy)
  for (const q of index.sagaQuests ?? []) add('quest', q.id, q.definedBy)
  for (const h of index.hulls ?? []) add('hull', h.id, h.definedBy)
  for (const v of index.variants ?? []) add('variant', v.id, v.definedBy)
  for (const i of index.items ?? []) add('item', i.id, i.definedBy)
  for (const w of index.weapons ?? []) add('weapon', w.id, w.definedBy)
  for (const w of index.wings ?? []) add('wing', w.id, w.definedBy)
  for (const p of index.portraits ?? []) add('image', p.path, p.sourceId)
  for (const il of index.illustrations ?? []) { add('image', il.path, il.definedBy); add('image', il.id, il.definedBy) }
  for (const t of index.customEntityTypes ?? []) add('entityType', t.id, t.definedBy)
  for (const t of index.planetTypes ?? []) add('planetType', t.id, t.definedBy)
  // the mod's own content wins over the index (it may not be saved or exported yet)
  const own = (k: RefKind, id: string) => { let mm = maps.get(k); if (!mm) maps.set(k, (mm = new Map())); mm.set(id, active) }
  for (const f of m.factions) if (f.kind === 'addition') own('faction', f.id)
  for (const p of m.people) own('person', p.id)
  for (const q of m.quests) own('quest', q.id)
  for (const s of m.systems) {
    if (s.kind === 'new') own('system', s.id)
    for (const e of s.entities) own('entity', e.id)
  }
  for (const i of m.items) own('item', i.id)
  for (const t of m.types?.entities ?? []) own('entityType', t.id)
  for (const t of m.types?.planets ?? []) own('planetType', t.id)
  return (kind, id) => (id ? maps.get(kind)?.get(id) ?? null : null)
}

const lineRefs = (lines: string[] | undefined, where: string, node?: string): Ref[] => {
  const out: Ref[] = []
  for (const l of lines ?? []) {
    const m = /^\s*\$id\s*==\s*([\w-]+)/.exec(l)
    if (m) out.push({ kind: 'entity', id: m[1], where, node })
  }
  return out
}

function visualRefs(v: Visual, where: string, node: string): Ref[] {
  switch (v.kind) {
    case 'person': return [v.person, v.second, v.third].filter((x): x is string => !!x).map((id) => ({ kind: 'person' as const, id, where, node }))
    case 'planet': case 'mapMarker': return targetVarOf(v.entity) ? [] : [{ kind: 'entity', id: v.entity, where, node }]
    case 'ship': return [{ kind: 'variant', id: v.variant, where, node }]
    case 'illustration': return [{ kind: 'image', id: `${v.category || 'illustrations'}/${v.key}`, where, node }]
    default: return []
  }
}

function displayRefs(d: Display, where: string, node: string): Ref[] {
  switch (d.kind) {
    case 'commodity': case 'specialItem': return [{ kind: 'item', id: d.item, where, node }]
    case 'weapon': return [{ kind: 'weapon', id: d.id, where, node }]
    case 'fighter': return [{ kind: 'wing', id: d.id, where, node }]
    case 'ship': return [{ kind: 'variant', id: d.variant, where, node }]
    case 'rep': return d.faction ? [{ kind: 'faction', id: d.faction, where, node }] : d.person ? [{ kind: 'person', id: d.person, where, node }] : []
    case 'faction': return [{ kind: 'faction', id: d.faction, where, node }]
    case 'shipList': return d.variants.map((id) => ({ kind: 'variant' as const, id, where, node }))
    case 'cargo': case 'cost': return d.items.map((x) => ({ kind: 'item' as const, id: x.item, where, node }))
    case 'skills': return [{ kind: 'person', id: d.person, where, node }]
    case 'image': return [{ kind: 'image', id: `${d.category}/${d.key}`, where, node }]
    default: return []
  }
}

export function opRefs(op: ActionOp, where: string, node?: string): Ref[] {
  switch (op.op) {
    case 'rep': return op.faction ? [{ kind: 'faction', id: op.faction, where, node }] : op.person ? [{ kind: 'person', id: op.person, where, node }] : []
    case 'item': return [{ kind: 'item', id: op.item, where, node }]
    case 'placeEntity': case 'removeEntity': return op.entity ? [{ kind: 'entity', id: op.entity, where, node }] : []
    case 'removePerson': return op.person ? [{ kind: 'person', id: op.person, where, node }] : []
    default: return []
  }
}

/** Every reference of a quest, with the node it is in. */
export function questRefs(q: QuestPlan): Ref[] {
  const out: Ref[] = []
  const s = q.start
  if ((s.kind === 'contact' || s.kind === 'bar') && s.person) out.push({ kind: 'person', id: s.person, where: 'its start (contact)' })
  if (s.kind === 'option' || s.kind === 'trigger' || s.kind === 'interject' || s.kind === 'barScene') out.push(...lineRefs(s.conditions, 'its start'))
  // #64: "after Mod1's quest X": another mod's quest as a prerequisite
  for (const r of q.requires) if ('quest' in r) out.push({ kind: 'quest', id: r.quest, where: 'its prerequisites' })
  // #64: named places
  for (const pl of q.places ?? []) if (pl.entity && !targetVarOf(pl.entity)) out.push({ kind: 'entity', id: pl.entity, where: `named place "${pl.name || pl.id}"` })
  for (const st of q.stages) if (st.marker && !targetVarOf(st.marker)) out.push({ kind: 'entity', id: st.marker, where: `stage "${st.title || st.id}" marker` })
  for (const r of q.rewards) {
    for (const x of r.rep ?? []) out.push({ kind: 'faction', id: x.faction, where: `reward ${r.id}` })
    for (const x of r.personRep ?? []) out.push({ kind: 'person', id: x.person, where: `reward ${r.id}` })
    for (const x of r.items ?? []) out.push({ kind: 'item', id: x.item, where: `reward ${r.id}` })
    for (const v of r.ships ?? []) out.push({ kind: 'variant', id: v, where: `reward ${r.id}` })
  }
  for (const n of q.nodes) out.push(...nodeRefs(n))
  return out
}

function nodeRefs(n: QNode): Ref[] {
  const where = `node "${(n as { title?: string }).title || n.id}"`
  switch (n.type) {
    case 'dialog': return [
      ...(n.speaker ? [{ kind: 'person' as const, id: n.speaker, where, node: n.id }] : []),
      ...visualRefs(n.visual, where, n.id), ...n.displays.flatMap((d) => displayRefs(d, where, n.id)), ...lineRefs(n.conditions, where, n.id)
    ]
    case 'action': return n.ops.flatMap((o) => opRefs(o, where, n.id))
    case 'wait': return n.mode === 'arrive' && n.entity && !targetVarOf(n.entity) ? [{ kind: 'entity', id: n.entity, where, node: n.id }] : []
    case 'branch': return n.cases.flatMap((c) => lineRefs(c.conditions, where, n.id))
    default: return []
  }
}

/** Every item that can carry mod conditions, with its references (PLAN.md §10.2 table). */
export function scanItems(m: ModModel): ScanItem[] {
  const out: ScanItem[] = []
  for (const q of m.quests) out.push({ key: `quest:${q.id}`, label: `${q.kind === 'dialog' ? 'Conversation' : 'Quest'} "${q.title}"`, ref: { page: 'quests', id: q.id }, own: q.mods, refs: questRefs(q) })
  for (const p of m.people) {
    const refs: Ref[] = [{ kind: 'faction', id: p.faction, where: 'its faction' }]
    if (p.placement.at === 'market' && p.placement.market) refs.push({ kind: 'entity', id: p.placement.market, where: 'its market' })
    if (p.portrait) refs.push({ kind: 'image', id: p.portrait, where: 'its portrait' })
    out.push({ key: `person:${p.id}`, label: `Person "${`${p.name.first} ${p.name.last}`.trim() || p.id}"`, ref: { page: 'people', id: p.id }, own: p.mods, refs })
  }
  for (const s of m.systems) {
    const refs: Ref[] = s.kind === 'existing' ? [{ kind: 'system', id: s.id, where: 'the system it adds to' }] : []
    out.push({ key: `system:${s.id}`, label: `${s.kind === 'existing' ? 'Additions to' : 'System'} "${s.name || s.id}"`, ref: { page: 'locations', id: s.id }, own: s.mods, refs })
    const own = new Set(s.entities.map((e) => e.id))
    for (const e of s.entities) {
      const er: Ref[] = []
      if (e.orbit.focus && e.orbit.focus !== 'star' && !own.has(e.orbit.focus)) er.push({ kind: 'entity', id: e.orbit.focus, where: 'its orbit' })
      if (e.market?.faction) er.push({ kind: 'faction', id: e.market.faction, where: 'its market' })
      if (e.kind === 'planet') er.push({ kind: 'planetType', id: e.type, where: 'its type' })
      else if (e.kind === 'custom' || e.kind === 'station' || e.kind === 'derelict') er.push({ kind: 'entityType', id: e.type, where: 'its type' })
      out.push({ key: `entity:${e.id}`, label: `Object "${e.name || e.id}" in ${s.name || s.id}`, ref: { page: 'locations', id: s.id, sub: e.id }, own: e.mods, refs: er })
    }
  }
  for (const e of m.encounters) {
    const refs: Ref[] = [{ kind: 'faction', id: e.fleet.faction, where: 'its fleet' }]
    for (const v of e.fleet.variants ?? []) refs.push({ kind: 'variant', id: v, where: 'its ships' })
    const t = e.fleet.size === 'template' ? m.fleets?.templates.find((x) => x.id === e.fleet.template) : null
    if (t) { refs.push({ kind: 'faction', id: t.faction, where: `named fleet ${t.id}` }); for (const sh of t.ships) refs.push({ kind: 'variant', id: sh.variant, where: `named fleet ${t.id}` }) }
    if (e.fleet.flagshipCommander) refs.push({ kind: 'person', id: e.fleet.flagshipCommander, where: 'its commander' })
    for (const at of [e.spawn.at, e.spawn.to, e.travelTo]) if (at && !targetVarOf(at)) refs.push({ kind: 'entity', id: at, where: 'where it spawns or goes' })
    out.push({ key: `encounter:${e.id}`, label: `Encounter "${e.name || e.id}"`, ref: { page: 'encounters', id: e.id }, own: e.mods, refs })
  }
  for (const s of m.events ?? []) {
    out.push({ key: `events:${s.id}`, label: `Event scheduler "${s.name}"`, ref: { page: 'saga', id: 'events', sub: s.id }, own: s.mods, refs: [] })
    for (const ev of s.events) out.push({ key: `event:${s.id}/${ev.id}`, label: `World event "${ev.name}"`, ref: { page: 'saga', id: 'events', sub: s.id }, own: ev.mods, refs: [...ev.start, ...ev.end].flatMap((o) => opRefs(o, `world event ${ev.id}`)) })
  }
  for (const p of m.progress ?? []) out.push({ key: `progress:${p.id}`, label: `Progress event "${p.name}"`, ref: { page: 'saga', id: 'progress', sub: p.id }, own: p.mods, refs: p.stages.flatMap((st) => [...st.actions, ...(st.outcomes ?? []).flatMap((o) => o.actions)].flatMap((o) => opRefs(o, `stage ${st.id}`))) })
  for (const p of m.pools ?? []) if (p.use !== 'loot') out.push({ key: `pool:${p.id}`, label: `Pool "${p.name}"`, ref: { page: 'saga', id: 'pools', sub: p.id }, own: p.mods, refs: [] })
  for (const sc of m.scatter ?? []) {
    const refs: Ref[] = [{ kind: 'entityType', id: sc.entity.type, where: 'its object type' }]
    if (sc.entity.faction) refs.push({ kind: 'faction', id: sc.entity.faction, where: 'its faction' })
    if (sc.from) refs.push({ kind: 'entity', id: sc.from, where: 'where it measures from' })
    out.push({ key: `scatter:${sc.id}`, label: `Scatter "${sc.name}"`, ref: { page: 'saga', id: 'scatter', sub: sc.id }, own: sc.mods, refs })
  }
  const rt = m.factionsRuntime
  for (const [a, others] of Object.entries(rt.relations)) {
    for (const b of Object.keys(others)) out.push({ key: `relation:${a}/${b}`, label: `Starting relation ${a} / ${b}`, ref: { page: 'factions', id: a }, own: rt.relationMods?.[a]?.[b], refs: [{ kind: 'faction', id: a, where: 'the relation' }, { kind: 'faction', id: b, where: 'the relation' }] })
  }
  for (const [f, list] of Object.entries(rt.scripted)) list.forEach((c, i) => out.push({ key: `scripted:${f}#${i}`, label: `Scripted change of ${f}: ${c.op === 'hideFromIntelTab' ? 'hidden from the intel tab' : c.op === 'showInIntelTab' ? 'shown in the intel tab' : `${c.op} ${c.path} ${c.value}`}`, ref: { page: 'factions', id: f }, own: c.mods, refs: [{ kind: 'faction', id: f, where: 'the change' }] }))
  // game-loaded rows (PLAN.md §10.2: can't be conditional)
  for (const f of m.factions) {
    if (f.kind === 'addition') {
      const raw = f.raw as Record<string, unknown>
      const list = (path: string): string[] => { let cur: unknown = raw; for (const k of path.split('.')) cur = (cur as Record<string, unknown> | undefined)?.[k]; return Array.isArray(cur) ? cur.map(String) : [] }
      const refs: Ref[] = [
        ...list('knownShips.hulls').map((id) => ({ kind: 'hull' as const, id, where: 'known ships', gameLoaded: true })),
        ...list('priorityShips.hulls').map((id) => ({ kind: 'hull' as const, id, where: 'priority ships', gameLoaded: true })),
        ...list('knownWeapons.weapons').map((id) => ({ kind: 'weapon' as const, id, where: 'known weapons', gameLoaded: true })),
        ...list('knownFighters.fighters').map((id) => ({ kind: 'wing' as const, id, where: 'known fighters', gameLoaded: true })),
        ...[...list('portraits.standard_male'), ...list('portraits.standard_female')].map((id) => ({ kind: 'image' as const, id, where: 'portraits', gameLoaded: true }))
      ]
      out.push({ key: `faction:${f.id}`, label: `Faction "${f.id}"`, ref: { page: 'factions', id: f.id }, refs })
    } else {
      // a patch of another mod's faction: harmless without it (PLAN.md §10.2), but it uses that mod
      out.push({ key: `override:${f.id}`, label: `Change to faction "${f.id}"`, ref: { page: 'factions', id: f.id }, refs: [{ kind: 'faction', id: f.id, where: 'the faction it changes' }] })
    }
  }
  for (const it of m.items) if (it.icon) out.push({ key: `item:${it.id}`, label: `Item "${it.name || it.id}"`, ref: { page: 'items', id: it.id }, refs: [{ kind: 'image', id: it.icon, where: 'its icon', gameLoaded: true }] })
  return out
}

/** The other mods the content uses: mod id → every place (framework files included). */
export function modUses(m: ModModel, index: GameIndex, loaded: Pick<ProjectState, 'sourceId' | 'frameworkFiles'>): Map<string, ModUseSite[]> {
  const look = sourceLookup(index, m, loaded.sourceId)
  const out = new Map<string, ModUseSite[]>()
  const put = (mod: string, s: ModUseSite) => { if (mod === CORE_ID || mod === loaded.sourceId || mod === SAGALIB_ID || mod === 'plan') return; const l = out.get(mod) ?? []; l.push(s); out.set(mod, l) }
  for (const it of scanItems(m)) {
    for (const r of it.refs) {
      const src = look(r.kind, r.id)
      if (src) put(src, { key: it.key, label: it.label, ref: r.node ? { ...it.ref, sub: r.node } : it.ref, where: r.where, kind: r.kind, id: r.id, node: r.node, gameLoaded: r.gameLoaded })
    }
  }
  // #62: the mod's settings page (Saga › Settings): only LunaLib shows it, so optional fits
  const lunaPage = !!m.project.settings?.length
  if (lunaPage) put('lunalib', { key: 'file:settings', label: 'Saga › Settings', ref: { page: 'saga', id: 'settings' }, where: 'its settings page (Saga › Settings, LunaSettings.csv)', kind: 'file', id: 'settings' })
  // #63: the Nexerelin tab of the mod's factions (only Nexerelin reads the config, so optional fits)
  const nexIds = nexConfigured(m)
  for (const id of nexIds) put(NEXERELIN_ID, { key: `file:nexconfig:${id}`, label: `Faction ${id}`, ref: { page: 'factions', id }, where: 'its Nexerelin faction config (Factions › Nexerelin)', kind: 'file', id })
  if (hasPlayerFleets(m)) put(NEXERELIN_ID, { key: 'file:nexconfig:player', label: 'Player faction fleets', ref: { page: 'fleets', id: 'nex=player' }, where: 'ready-made fleets added to its player faction (Fleets › New-game fleets)', kind: 'file', id: 'player' })
  // #65: the mod's quest chains on Nexerelin's skip screen and its MagicLib achievements (only those mods read the files: optional fits)
  const skip = usesQuestSkip(m)
  if (skip) put(NEXERELIN_ID, { key: 'file:questskip', label: 'Saga › Quest skip', ref: { page: 'saga', id: 'questskip' }, where: 'its quest chains on the new-game "skip quests" screen (exerelin/questSkip.json)', kind: 'file', id: 'questSkip' })
  const ach = !!m.project.achievements?.length
  if (ach) put('MagicLib', { key: 'file:achievements', label: 'Saga › Achievements', ref: { page: 'saga', id: 'achievements' }, where: 'its achievements (magic_achievements.csv)', kind: 'file', id: 'achievements' })
  for (const q of m.quests) {
    const ids = achievementsOf(q)
    if (ids.length) put('MagicLib', { key: `file:questachievement:${q.id}`, label: `Quest "${q.title}"`, ref: { page: 'quests', id: q.id }, where: `unlocks MagicLib achievements (${[...new Set(ids.map((x) => x.id))].join(', ')})`, kind: 'file', id: ids[0].id })
  }
  for (const f of loaded.frameworkFiles ?? []) {
    const fw = FRAMEWORK_FILE_MODS[f]
    if (fw && lunaPage && fw.mod === 'lunalib') continue
    if (fw && skip && f === 'data/config/exerelin/questSkip.json') continue
    if (fw && ach && f === MAGIC_ACHIEVEMENTS_CSV) continue
    if (fw && (nexIds.length || hasPlayerFleets(m)) && fw.mod === NEXERELIN_ID) continue
    if (fw) put(fw.mod, { key: `file:${f}`, label: f, ref: { page: 'saga', id: 'mods' }, where: fw.what, kind: 'file', id: f })
  }
  // #27: the mod's MagicLib bounties (only MagicLib reads their file: optional by default)
  for (const b of m.bounties ?? []) put('MagicLib', { key: `file:bounty:${b.id}`, label: `MagicLib bounty ${b.id}`, ref: b.quest ? { page: 'quests', id: b.quest } : { page: 'encounters', id: b.encounter ?? '' }, where: 'its bounties (magicBounty_data.json)', kind: 'file', id: b.id })
  // #59: quests that start or test MagicLib bounties (through SagaLib's guarded bridge: without MagicLib they are "unavailable", so optional fits)
  for (const q of m.quests) {
    const ids = bountyIdsOf(q)
    if (ids.length) put('MagicLib', { key: `file:questbounty:${q.id}`, label: `Quest "${q.title}"`, ref: { page: 'quests', id: q.id }, where: `starts, tests or waits for MagicLib bounties (${ids.join(', ')})`, kind: 'file', id: ids[0] })
  }
  return out
}

/** One item's effective conditions and where they come from. */
export interface ItemConds {
  eff: EffConds
  /** Automatic or inherited parts, each with why ("uses Hazard Mining", "from: The Lost Convoy"). */
  from: { cond: EffConds; why: string }[]
}

/**
 * Every item's effective conditions (PLAN.md §10.2): its own, automatic ones for references to an
 * optional mod's content, inherited ones along the quests' prerequisites, and spread to the people,
 * places, encounters and progress events that only conditional content uses.
 */
export function effectiveConds(m: ModModel, index: GameIndex | null, active: string, names: (id: string) => string = (id) => id): Map<string, ItemConds> {
  const items = scanItems(m)
  const optional = new Set(optionalMods(m.project).map((x) => x.id))
  const look = index ? sourceLookup(index, m, active) : () => null
  const out = new Map<string, ItemConds>()
  const get = (k: string): ItemConds => { let c = out.get(k); if (!c) out.set(k, (c = { eff: noConds(), from: [] })); return c }
  const add = (k: string, cond: EffConds, why?: string) => {
    if (isNone(cond)) return
    const c = get(k)
    const before = JSON.stringify(c.eff)
    addCond(c.eff, cond)
    if (why && JSON.stringify(c.eff) !== before) c.from.push({ cond, why })
    return JSON.stringify(c.eff) !== before
  }
  // own and automatic (only the item's own references, not the ones inside a quest's nodes)
  for (const it of items) {
    get(it.key)
    if (it.own) add(it.key, addCond(noConds(), it.own))
    if (!optional.size) continue
    for (const r of it.refs) {
      if (r.node || r.gameLoaded) continue
      const src = look(r.kind, r.id)
      if (src && optional.has(src)) add(it.key, { with: [src], without: [], any: [] }, `uses ${names(src)}`)
    }
  }
  // spreading (a few rounds: prerequisites chain; users before the things they use)
  const qById = new Map(m.quests.map((q) => [q.id, q]))
  const users = usersOf(m)
  for (let round = 0; round < 8; round++) {
    let changed = false
    for (const q of m.quests) {
      // a quest whose contact is conditional (e.g. one of an optional mod's faction) has the contact's condition
      const s = q.start
      if ((s.kind === 'contact' || s.kind === 'bar') && s.person) {
        const pc = out.get(`person:${s.person}`)
        const who = m.people.find((p) => p.id === s.person)
        if (pc && !isNone(pc.eff) && add(`quest:${q.id}`, pc.eff, `from: its contact ${who ? `${who.name.first} ${who.name.last}`.trim() : s.person}`)) changed = true
      }
      for (const r of q.requires) {
        if (!('quest' in r)) continue
        const pre = qById.get(r.quest)
        if (!pre) continue
        const pc = out.get(`quest:${pre.id}`)
        if (pc && !isNone(pc.eff) && add(`quest:${q.id}`, pc.eff, `from: ${pre.title}`)) changed = true
      }
    }
    for (const [key, us] of users) {
      if (!us.length) continue
      const conds = us.map((u) => out.get(u)?.eff ?? noConds())
      const common = commonConds(conds)
      if (isNone(common)) continue
      const first = us.find((u) => !isNone(out.get(u)?.eff))
      const label = first ? items.find((i) => i.key === first)?.label.replace(/^\w+ "|"$/g, '') ?? first : ''
      if (add(key, common, `from: ${label}`)) changed = true
    }
    // an object orbiting a conditional object has its condition (else it has nothing to orbit)
    for (const s of m.systems) for (const e of s.entities) {
      if (!e.orbit.focus || e.orbit.focus === 'star') continue
      const fc = out.get(`entity:${e.orbit.focus}`)
      if (fc && !isNone(fc.eff) && add(`entity:${e.id}`, fc.eff, `from: orbits ${e.orbit.focus}`)) changed = true
    }
    if (!changed) break
  }
  return out
}

/** Who uses each person, object, encounter and progress event: item keys (quests, people, encounters). */
export function usersOf(m: ModModel): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const use = (thing: string, user: string) => { const l = out.get(thing) ?? []; if (!l.includes(user)) l.push(user); out.set(thing, l) }
  const own = {
    person: new Set(m.people.map((p) => p.id)),
    entity: new Set(m.systems.flatMap((s) => s.entities.map((e) => e.id))),
    encounter: new Set(m.encounters.map((e) => e.id)),
    progress: new Set((m.progress ?? []).map((p) => p.id))
  }
  for (const q of m.quests) {
    const qk = `quest:${q.id}`
    for (const r of questRefs(q)) {
      if (r.kind === 'person' && own.person.has(r.id)) use(`person:${r.id}`, qk)
      if (r.kind === 'entity' && own.entity.has(r.id)) use(`entity:${r.id}`, qk)
    }
    for (const n of q.nodes) {
      if (n.type === 'encounter' && own.encounter.has(n.encounter)) use(`encounter:${n.encounter}`, qk)
      if (n.type === 'action') for (const o of n.ops) {
        if ((o.op === 'spawn' || o.op === 'despawn') && own.encounter.has(o.encounter)) use(`encounter:${o.encounter}`, qk)
        if (o.op === 'progress' && own.progress.has(o.event)) use(`progress:${o.event}`, qk)
      }
      if (n.type === 'dialog' && n.visual.kind === 'fleets' && own.encounter.has(n.visual.encounter)) use(`encounter:${n.visual.encounter}`, qk)
    }
  }
  // a person placed at a market uses that object; an encounter uses the place it spawns at and its commander
  for (const p of m.people) if (p.placement.at === 'market' && own.entity.has(p.placement.market)) use(`entity:${p.placement.market}`, `person:${p.id}`)
  for (const e of m.encounters) {
    if (own.entity.has(e.spawn.at)) use(`entity:${e.spawn.at}`, `encounter:${e.id}`)
    if (e.fleet.flagshipCommander && own.person.has(e.fleet.flagshipCommander)) use(`person:${e.fleet.flagshipCommander}`, `encounter:${e.id}`)
  }
  // events' and progress events' actions use encounters too
  for (const s of m.events ?? []) for (const ev of s.events) for (const o of [...ev.start, ...ev.end]) if ((o.op === 'spawn' || o.op === 'despawn') && own.encounter.has(o.encounter)) use(`encounter:${o.encounter}`, `event:${s.id}/${ev.id}`)
  // people in a market's list use it
  for (const s of m.systems) for (const e of s.entities) for (const pid of e.market?.people ?? []) if (own.person.has(pid)) use(`entity:${e.id}`, `person:${pid}`)
  return out
}

/** Things used by conditional and by unconditional content (they keep no condition; the editor says which). */
export function sharedWithUnconditional(m: ModModel, eff: Map<string, ItemConds>): { key: string; conditional: string[]; plain: string[] }[] {
  const out: { key: string; conditional: string[]; plain: string[] }[] = []
  for (const [key, us] of usersOf(m)) {
    const cond = us.filter((u) => !isNone(eff.get(u)?.eff))
    const plain = us.filter((u) => isNone(eff.get(u)?.eff))
    if (cond.length && plain.length) out.push({ key, conditional: cond, plain })
  }
  return out
}

/**
 * Within a quest: the mods every path to each node is guarded by (options and Branch cases with
 * "Only with", plus the quest's own conditions). A node reached by any unguarded path has none.
 */
export function nodeGuards(q: QuestPlan, questEff: EffConds | undefined): Map<string, EffConds> {
  const base = questEff ?? noConds()
  const out = new Map<string, EffConds>()
  const start = q.nodes.find((n) => n.type === 'start')
  const incoming = new Map<string, { from: string; cond: EffConds }[]>()
  for (const e of q.edges) {
    const src = q.nodes.find((n) => n.id === e.from)
    let cond = noConds()
    if (src?.type === 'dialog') { const o = src.options.find((x) => x.id === e.handle); if (o?.mods) cond = addCond(noConds(), o.mods) }
    if (src?.type === 'branch') { const c = src.cases.find((x) => x.id === e.handle); if (c?.mods) cond = addCond(noConds(), c.mods) }
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), { from: e.from, cond }])
  }
  // iterate to a fixed point: a node's guard = what all its incoming paths share
  for (const n of q.nodes) out.set(n.id, n.id === start?.id ? base : { with: [], without: [], any: [] })
  const known = new Set<string>(start ? [start.id] : [])
  for (let round = 0; round < q.nodes.length + 2; round++) {
    let changed = false
    for (const n of q.nodes) {
      if (n.id === start?.id) continue
      const inc = (incoming.get(n.id) ?? []).filter((x) => known.has(x.from))
      if (!inc.length) continue
      const g = commonConds(inc.map((x) => addCond(addCond(noConds(), out.get(x.from)), x.cond)))
      addCond(g, base)
      if (!known.has(n.id) || JSON.stringify(g) !== JSON.stringify(out.get(n.id))) { out.set(n.id, g); known.add(n.id); changed = true }
    }
    if (!changed) break
  }
  return out
}

/**
 * The model as the export (and Play mode) runs it: every "Only with / Only without" folded into
 * rule conditions (PLAN.md §10.2 table): options (their own small rule), Branch cases, phrase cases,
 * pool entries, world events, and the start rule of a quest or conversation (its effective
 * conditions). SagaLib JSON gets the effective conditions separately (gateJson).
 */
export function lowerModConds(m: ModModel, eff: Map<string, ItemConds>): ModModel {
  const has = (c: ModsCondition | undefined) => !!c && (!!c.with?.length || !!c.without?.length)
  const anyOwn = m.quests.some((q) => q.nodes.some((n) => (n.type === 'dialog' && (n.options.some((o) => has(o.mods)) || n.phrases.some((p) => p.cases.some((c) => has(c.mods))))) || (n.type === 'branch' && n.cases.some((c) => has(c.mods)))))
    || [...m.phrases, ...m.people.flatMap((p) => p.phrases)].some((p) => p.cases.some((c) => has(c.mods)))
    || (m.pools ?? []).some((p) => p.entries.some((e) => has(e.mods)))
    || [...eff.values()].some((c) => !isNone(c.eff))
  if (!anyOwn) return m
  const c = JSON.parse(JSON.stringify(m)) as ModModel
  const lines = (x: ModsCondition | undefined) => effLines(addCond(noConds(), x))
  const phr = (ps: { cases: { when: string[]; mods?: ModsCondition }[] }[]) => { for (const p of ps) for (const cs of p.cases) if (has(cs.mods)) { cs.when = [...cs.when, ...lines(cs.mods)]; delete cs.mods } }
  for (const q of c.quests) {
    const qe = eff.get(`quest:${q.id}`)?.eff
    const s = q.start
    if (qe && !isNone(qe) && (s.kind === 'option' || s.kind === 'trigger' || s.kind === 'interject' || s.kind === 'barScene')) s.conditions = [...s.conditions, ...effLines(qe)]
    for (const n of q.nodes) {
      if (n.type === 'dialog') {
        for (const o of n.options) if (has(o.mods)) { o.showIf = [...(o.showIf ?? []), ...lines(o.mods)]; delete o.mods }
        phr(n.phrases)
      }
      if (n.type === 'branch') for (const cs of n.cases) if (has(cs.mods)) { cs.conditions = [...cs.conditions, ...lines(cs.mods)]; delete cs.mods }
    }
  }
  phr(c.phrases)
  for (const p of c.people) phr(p.phrases)
  for (const p of c.pools ?? []) for (const e of p.entries) if (has(e.mods)) { e.conditions = [...e.conditions, ...lines(e.mods)]; delete e.mods }
  for (const s of c.events ?? []) for (const ev of s.events) {
    const ee = eff.get(`event:${s.id}/${ev.id}`)?.eff
    if (ee && !isNone(ee)) ev.conditions = [...ev.conditions, ...effLines(ee)]
    delete ev.mods
  }
  return c
}

/** True when anything in the mod has mod conditions (own or automatic): it needs SagaLib 1.3. */
export function usesModConds(eff: Map<string, ItemConds>, m: ModModel): boolean {
  const has = (c: ModsCondition | undefined) => !!c && (!!c.with?.length || !!c.without?.length)
  return [...eff.values()].some((c) => !isNone(c.eff)) || m.quests.some((q) => q.nodes.some((n) => (n.type === 'dialog' && (n.options.some((o) => has(o.mods)) || n.phrases.some((p) => p.cases.some((x) => has(x.mods))))) || (n.type === 'branch' && n.cases.some((x) => has(x.mods)))))
    || [...m.phrases, ...m.people.flatMap((p) => p.phrases)].some((p) => p.cases.some((x) => has(x.mods))) || (m.pools ?? []).some((p) => p.entries.some((e) => has(e.mods)))
}
