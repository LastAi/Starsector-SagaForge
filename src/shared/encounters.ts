/** Encounters (PLAN.md §4.6): fleets spawned by a quest stage or at a location, with their comm dialog. */
import { PLAN_FORMAT, type EncounterDef, type QuestPlan } from './model'
import type { Problem } from './api'
import type { CheckContext } from './checks'
import { prefixProblem, ID_PATTERN } from './checks'
import { newQuest } from './quest'
import { encounterPlacementProblems } from './patterns'
import { isTodoActive } from './todo'
import { targetKey, targetVars } from './targets'

export function newEncounter(id: string, name: string, faction: string): EncounterDef {
  return {
    format: PLAN_FORMAT, id, name,
    fleet: { faction, type: 'patrolMedium', size: 'fp', points: 80, quality: 0.5 },
    spawn: { at: '', when: 'quest-stage', despawnOnStageEnd: true },
    behavior: 'ambush', flags: { hostile: true, important: true, allowDisengage: true }, outcomes: {}
  }
}

/** The condition that scopes a comm dialog to this encounter's fleet (FORMAT.md, Encounters). */
export const encounterScope = (id: string) => `$entity.sagaforge_encounter == ${id}`

/** A comm-link greeting for the encounter's fleet, as a conversation plan (edited in the quest editor). */
export function newCommDialog(enc: EncounterDef): QuestPlan {
  const q = newQuest(`${enc.id}_comm`, `${enc.name}: comm link`, 'dialog')
  q.start = { kind: 'trigger', trigger: 'OpenCommLink', conditions: [encounterScope(enc.id)] }
  const offer = q.nodes.find((n) => n.id === 'offer')
  if (offer?.type === 'dialog') {
    offer.title = 'Greeting'
    offer.text = '"You picked the wrong belt to fly through."'
    offer.options = [{ id: 'cut', text: 'Cut the comm link', shortcut: 'ESC' }]
  }
  // vanilla answers its own "cutCommLink" option (hang up), so the option simply is that one
  q.nodes.push({ id: 'cut_link', type: 'link', x: 520, y: 60, mode: 'option', target: 'cutCommLink' })
  q.edges.push({ id: 'e_cut', from: 'offer', handle: 'cut', to: 'cut_link' })
  return q
}

/** Quest nodes that spawn an encounter, and whether their outcomes lead anywhere. */
export function encounterUses(quests: QuestPlan[], id: string): { quest: QuestPlan; node: string; defeated: boolean; avoided: boolean }[] {
  const out: { quest: QuestPlan; node: string; defeated: boolean; avoided: boolean }[] = []
  for (const q of quests) for (const n of q.nodes) {
    if (n.type !== 'encounter' || n.encounter !== id) continue
    out.push({ quest: q, node: n.id, defeated: q.edges.some((e) => e.from === n.id && e.handle === 'defeated'), avoided: q.edges.some((e) => e.from === n.id && e.handle === 'avoided') })
  }
  return out
}

export function encounterProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const entities = new Set([...m.systems.flatMap((s) => s.entities.map((e) => e.id)), ...ctx.index.markets.flatMap((x) => x.entities)])
  // Phase 7e (RC-R9): encounters a random-encounter pool spawns at vanilla's encounter points
  const pooled = new Map((m.pools ?? []).filter((p) => p.use === 'encounters').flatMap((p) => p.entries.map((x) => [x.id, p.name || p.id] as [string, string])))
  for (const e of m.encounters) {
    const ref = { page: 'encounters' as const, id: e.id }
    const inPool = pooled.get(e.id)
    if (inPool) out.push({ level: 'info', area: 'Encounter', ref, key: `encpool:${e.id}`, message: `${e.name}: random encounter pool "${inPool}" spawns it at vanilla's encounter points (its own spawn settings are only for quests).` })
    if (!ID_PATTERN.test(e.id)) out.push({ level: 'error', area: 'Encounter', message: `Encounter id "${e.id}" may only use lowercase letters, digits and _.`, ref })
    const pp = prefixProblem(m.project.prefix, e.id, 'Encounter', ref)
    if (pp) out.push(pp)
    const f = e.fleet
    if (!ctx.index.factions.some((x) => x.id === f.faction) && !m.factions.some((x) => x.id === f.faction)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no faction "${f.faction}".`, ref })
    // a mod may use its own fleet types (R22): a note, with where its name comes from
    if (!f.type.trim()) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick a fleet type.`, ref })
    else if (!ctx.defs.fleetTypes.some((t) => t.id === f.type)) {
      // seen in game (8d): a type nothing names shows "No name for type [tradeSmall]" (vanilla's is smallTrader)
      const fac = m.factions.find((x) => x.id === f.faction)
      const ftn = (fac ? (fac.kind === 'addition' ? fac.raw.fleetTypeNames : fac.patch.set.fleetTypeNames) : undefined) as Record<string, unknown> | undefined
      const named = !!f.name?.trim() || typeof ftn?.[f.type] === 'string' || typeof ctx.index.fleetTypeNames?.[f.type] === 'string'
      // the same words in another order or form: tradeSmall ~ smallTrader
      const stems = (id: string) => id.split(/(?=[A-Z])|[_\s-]+/).filter(Boolean).map((w) => w.toLowerCase().slice(0, 5)).sort().join(' ')
      const close = ctx.defs.fleetTypes.find((t) => stems(t.id) === stems(f.type))
      if (named) out.push({ level: 'info', area: 'Encounter', message: `${e.name}: "${f.type}" is a fleet type of your own. Unless you set Fleet name, the fleet is named from its faction's name for "${f.type}" (Factions › Names & ranks › Fleet type names).`, ref, key: `fleettype:${e.id}` })
      else out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${f.type}" isn't a vanilla fleet type${close ? ` (did you mean "${close.id}"?)` : ''} and nothing names it: in game the fleet shows "No name for type [${f.type}]". Set Fleet name, pick a vanilla type, or name the type in the faction's Fleet type names.`, ref, key: `fleettype:${e.id}` })
    }
    if (f.size === 'explicit') {
      if (!f.variants?.length) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: list the ships (variants), or use fleet points.`, ref })
      for (const v of f.variants ?? []) if (!ctx.index.variants.some((x) => x.id === v)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: unknown variant "${v}".`, ref })
    } else if (f.size === 'fp' && (!f.points || f.points <= 0)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: fleet points must be above 0.`, ref })
    if (f.flagshipCommander && !m.people.some((p) => p.id === f.flagshipCommander)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no person "${f.flagshipCommander}" in this mod.`, ref })
    if (!e.spawn.at && !isTodoActive(e, 'spawn.at') && !inPool) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it spawns.`, ref })
    // Phase 7d (RC-R2): at a quest's random target ($global.<quest>_<var>), resolved by SagaLib 1.2
    else if (e.spawn.at.startsWith('$global.') && !m.quests.some((q) => targetVars(q).some((v) => targetKey(q.id, v.name) === e.spawn.at))) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: "${e.spawn.at}" isn't a random target of any quest.`, ref })
    else if (e.spawn.at && !e.spawn.at.startsWith('$global.') && !entities.has(e.spawn.at)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${e.spawn.at}" isn't an entity Saga Forge knows (vanilla entities made in code can't be listed).`, ref })
    if (e.behavior === 'travel' && !e.travelTo) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it travels to.`, ref })
    // Phase 8d (RC-R14): roaming fleets
    if (e.spawn.when === 'roaming') {
      if (!e.spawn.to) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: a roaming fleet needs a place to travel to.`, ref })
      else if (!entities.has(e.spawn.to)) out.push({ level: 'warning', area: 'Encounter', key: `roamto:${e.id}`, message: `${e.name}: "${e.spawn.to}" isn't an entity Saga Forge knows.`, ref })
      else if (e.spawn.to === e.spawn.at) out.push({ level: 'warning', area: 'Encounter', key: `roamsame:${e.id}`, message: `${e.name}: it travels from and to the same place.`, ref })
      if (!((e.spawn.days ?? 0) > 0)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: a roaming fleet needs the days between departures.`, ref })
      if ((e.spawn.max ?? 1) < 1) out.push({ level: 'warning', area: 'Encounter', key: `roammax:${e.id}`, message: `${e.name}: at most 0 on the way, so none ever leaves.`, ref })
      if (e.spawn.at && !ctx.index.markets?.some((mk) => mk.entities.includes(e.spawn.at) || mk.id === e.spawn.at) && !m.systems.some((s) => s.entities.some((x) => (x.id === e.spawn.at || x.market?.id === e.spawn.at) && !!x.market))) out.push({ level: 'info', area: 'Encounter', key: `roamfrom:${e.id}`, message: `${e.name}: "${e.spawn.at}" has no market; vanilla's routes like to start at one (a fleet still leaves from there).`, ref })
    }
    if (e.spawn.when === 'quest-stage') {
      const uses = encounterUses(m.quests, e.id)
      // an Action's "Spawn an encounter" counts too (a fleet that isn't fought: no outcomes needed)
      const byAction = m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((o) => o.op === 'spawn' && o.encounter === e.id)))
      // Phase 8d: a world event's actions spawn it
      const byEvent = (m.events ?? []).some((s) => s.events.some((ev) => [...ev.start, ...ev.end].some((o) => o.op === 'spawn' && o.encounter === e.id)))
      if (!uses.length && !byAction && !byEvent && !(e.spawn.quest && e.spawn.stage) && !inPool) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: no quest or world event spawns it yet (add an Encounter node, or set the quest and stage).`, ref })
      for (const u of uses) {
        if (!u.defeated) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Defeated outcome.`, ref: { page: 'quests', id: u.quest.id, sub: u.node }, fixes: [{ label: 'Open the quest', action: 'open' }] })
        if (!u.avoided) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Avoided outcome (the fleet can leave or be talked away).`, ref: { page: 'quests', id: u.quest.id, sub: u.node } })
      }
    }
    if (e.commDialog && !m.quests.some((q) => q.id === e.commDialog)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: comm dialog "${e.commDialog}" doesn't exist.`, ref })
  }
  out.push(...encounterPlacementProblems(m))
  return out
}
