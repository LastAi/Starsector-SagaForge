/** Encounters (PLAN.md §4.6): fleets spawned by a quest stage or at a location, with their comm dialog. */
import { PLAN_FORMAT, type EncounterDef, type QuestPlan } from './model'
import type { Problem } from './api'
import type { CheckContext } from './checks'
import { prefixProblem, ID_PATTERN } from './checks'
import { newQuest } from './quest'

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
  for (const e of m.encounters) {
    const ref = { page: 'encounters' as const, id: e.id }
    if (!ID_PATTERN.test(e.id)) out.push({ level: 'error', area: 'Encounter', message: `Encounter id "${e.id}" may only use lowercase letters, digits and _.`, ref })
    const pp = prefixProblem(m.project.prefix, e.id, 'Encounter', ref)
    if (pp) out.push(pp)
    const f = e.fleet
    if (!ctx.index.factions.some((x) => x.id === f.faction) && !m.factions.some((x) => x.id === f.faction)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no faction "${f.faction}".`, ref })
    if (!ctx.defs.fleetTypes.some((t) => t.id === f.type)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${f.type}" isn't one of vanilla's fleet types.`, ref })
    if (f.size === 'explicit') {
      if (!f.variants?.length) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: list the ships (variants), or use fleet points.`, ref })
      for (const v of f.variants ?? []) if (!ctx.index.variants.some((x) => x.id === v)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: unknown variant "${v}".`, ref })
    } else if (!f.points || f.points <= 0) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: fleet points must be above 0.`, ref })
    if (f.flagshipCommander && !m.people.some((p) => p.id === f.flagshipCommander)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no person "${f.flagshipCommander}" in this mod.`, ref })
    if (!e.spawn.at) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it spawns.`, ref })
    else if (!entities.has(e.spawn.at)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${e.spawn.at}" isn't an entity Saga Forge knows (vanilla entities made in code can't be listed).`, ref })
    if (e.behavior === 'travel' && !e.travelTo) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it travels to.`, ref })
    if (e.spawn.when === 'quest-stage') {
      const uses = encounterUses(m.quests, e.id)
      if (!uses.length && !(e.spawn.quest && e.spawn.stage)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: no quest spawns it yet (add an Encounter node, or set the quest and stage).`, ref })
      for (const u of uses) {
        if (!u.defeated) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Defeated outcome.`, ref: { page: 'quests', id: u.quest.id, sub: u.node }, fixes: [{ label: 'Open the quest', action: 'open' }] })
        if (!u.avoided) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Avoided outcome (the fleet can leave or be talked away).`, ref: { page: 'quests', id: u.quest.id, sub: u.node } })
      }
    }
    if (e.commDialog && !m.quests.some((q) => q.id === e.commDialog)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: comm dialog "${e.commDialog}" doesn't exist.`, ref })
  }
  return out
}
