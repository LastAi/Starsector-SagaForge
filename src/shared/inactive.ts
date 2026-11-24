/**
 * Inactive content (INGAME-CHECKS R10; docs/DESIGN-PHASE1.md §2): planned people and quests (or
 * conversations) that exist in the editor but are not exported, so they never appear in game.
 * A quest is also inactive when it is offered by a named contact who is inactive.
 */
import type { Problem, ProblemRef } from './api'
import type { ModModel } from './serialize'
import { activeTodos, type TodoEntry } from './todo'
import { TOKEN_RE } from './rules/parse'

type M = Pick<ModModel, 'people' | 'quests' | 'encounters' | 'systems' | 'phrases' | 'items'> & Partial<Pick<ModModel, 'fleets' | 'pools' | 'bounties'>>
/** #67 U41: what the encounter and fleet rules need. */
type EF = Partial<Pick<ModModel, 'encounters' | 'fleets' | 'pools'>>

export const inactivePeople = (m: Pick<ModModel, 'people'>): Set<string> => new Set(m.people.filter((p) => p.inactive).map((p) => p.id))

/** Quests that are not exported, with why: their own flag, or their contact is inactive. */
export function inactiveQuests(m: Pick<ModModel, 'people' | 'quests'>): Map<string, 'flag' | 'contact'> {
  const people = inactivePeople(m)
  const out = new Map<string, 'flag' | 'contact'>()
  for (const q of m.quests) {
    if (q.inactive) out.set(q.id, 'flag')
    else if (q.start.kind === 'contact' && q.start.person && people.has(q.start.person)) out.set(q.id, 'contact')
  }
  return out
}

/** #67 U41 (user, 2026-11-22): named fleets marked Inactive. */
export const inactiveFleets = (m: EF): Set<string> => new Set((m.fleets?.templates ?? []).filter((t) => t.inactive).map((t) => t.id))

/** #67 U41: encounters that are not exported, with why: their own flag, or their named fleet is inactive. */
export function inactiveEncounters(m: EF): Map<string, 'flag' | 'fleet'> {
  const fleets = inactiveFleets(m)
  const out = new Map<string, 'flag' | 'fleet'>()
  for (const e of m.encounters ?? []) {
    if (e.inactive) out.set(e.id, 'flag')
    else if (e.fleet.size === 'template' && e.fleet.template && fleets.has(e.fleet.template)) out.set(e.id, 'fleet')
  }
  return out
}

/** Whether a problem points inside inactive content. */
export function isInactiveRef(m: Pick<ModModel, 'people' | 'quests'> & EF, ref: ProblemRef | undefined, people = inactivePeople(m), quests = inactiveQuests(m)): boolean {
  if (!ref?.id) return false
  return (ref.page === 'people' && people.has(ref.id)) || (ref.page === 'quests' && quests.has(ref.id)) || (ref.page === 'encounters' && inactiveEncounters(m).has(ref.id)) || (ref.page === 'fleets' && inactiveFleets(m).has(ref.id))
}

/**
 * The model Export writes: inactive people and quests left out, and inactive people taken off
 * markets' people lists (they stay in the plan, so reactivating needs no re-placing).
 */
export function exportableModel<T extends Pick<ModModel, 'people' | 'quests' | 'systems'> & EF>(m: T): T {
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  // #67 U41: inactive encounters and named fleets stay in the plan only
  const encs = inactiveEncounters(m)
  const fleets = inactiveFleets(m)
  if (!people.size && !quests.size && !encs.size && !fleets.size) return m
  return {
    ...m,
    ...(m.encounters ? { encounters: m.encounters.filter((e) => !encs.has(e.id)) } : {}),
    ...(m.fleets ? { fleets: { ...m.fleets, templates: m.fleets.templates.filter((t) => !fleets.has(t.id)) } } : {}),
    ...(m.pools && encs.size ? { pools: m.pools.map((p) => ({ ...p, entries: p.entries.filter((en) => !encs.has(en.id)) })) } : {}),
    people: m.people.filter((p) => !people.has(p.id)),
    quests: m.quests.filter((q) => !quests.has(q.id)),
    systems: m.systems.map((s) => ({
      ...s,
      entities: s.entities.map((e) => (e.market && e.market.people.some((p) => people.has(p)) ? { ...e, market: { ...e.market, people: e.market.people.filter((p) => !people.has(p)) } } : e))
    }))
  }
}

/** To-dos that block Mark as released: those in active content (R9, R10). */
export function releaseBlockers(m: M): TodoEntry[] {
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  return activeTodos(m).filter((t) => !isInactiveRef(m, t.ref, people, quests))
}

/** Problems about inactive content and the active content that depends on it. */
export function inactiveProblems(m: M): Problem[] {
  const out: Problem[] = []
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  const encs = inactiveEncounters(m)
  const fleets = inactiveFleets(m)
  if (!people.size && !quests.size && !encs.size && !fleets.size) return out
  const eName = (id: string) => m.encounters.find((x) => x.id === id)?.name ?? id
  const fName = (id: string) => m.fleets?.templates.find((x) => x.id === id)?.name || id
  const pName = (id: string) => { const p = m.people.find((x) => x.id === id); return p ? `${p.name.first} ${p.name.last}`.trim() : id }
  const qTitle = (id: string) => m.quests.find((x) => x.id === id)?.title ?? id
  // tokens of inactive people's phrases: SagaLib won't know them
  const deadTokens = new Map<string, string>()
  for (const p of m.people) if (people.has(p.id)) for (const ph of p.phrases) deadTokens.set(ph.token, p.id)

  for (const [qid, why] of quests) {
    if (why === 'contact') {
      const q = m.quests.find((x) => x.id === qid)!
      out.push({ level: 'warning', area: 'Inactive', message: `"${q.title}" is not exported: its contact ${pName((q.start as { person: string }).person)} is inactive.`, ref: { page: 'quests', id: qid }, key: `inactive-contact:${qid}` })
    }
  }
  for (const q of m.quests) {
    if (quests.has(q.id)) continue
    const ref = (sub?: string): ProblemRef => ({ page: 'quests', id: q.id, sub })
    for (const n of q.nodes) {
      if (n.type === 'dialog') {
        const used = [n.speaker, ...(n.visual.kind === 'person' ? [n.visual.person, n.visual.second, n.visual.third] : [])].filter((x): x is string => !!x && people.has(x))
        for (const pid of new Set(used)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" uses ${pName(pid)}, who is inactive and won't be in the game. Make them active, or change the node.`, ref: ref(n.id) })
        for (const tok of new Set([...(n.text.match(TOKEN_RE) ?? []), ...n.options.flatMap((o) => o.text.match(TOKEN_RE) ?? [])])) {
          const owner = deadTokens.get(tok.replace(/\.+$/, ''))
          if (owner) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" uses the phrase ${tok} of ${pName(owner)}, who is inactive: the game would show it as it is.`, ref: ref(n.id) })
        }
      }
      // #67 U41: an Encounter node, a spawn step or a Fight with an inactive encounter or named fleet
      if (n.type === 'encounter' && encs.has(n.encounter)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.id}" spawns ${eName(n.encounter)}, which is inactive and won't be in the game.`, ref: ref(n.id) })
      if (n.type === 'fight' && n.fleet.size === 'template' && n.fleet.template && fleets.has(n.fleet.template)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" fights the named fleet ${fName(n.fleet.template)}, which is inactive and won't be in the game.`, ref: ref(n.id) })
      if (n.type === 'action') for (const op of n.ops) {
        if ((op.op === 'spawn' || op.op === 'despawn') && encs.has(op.encounter)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" ${op.op === 'spawn' ? 'spawns' : 'removes'} ${eName(op.encounter)}, which is inactive and won't be in the game.`, ref: ref(n.id) })
        if (op.op === 'startQuest' && quests.has(op.quest)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" starts "${qTitle(op.quest)}", which is inactive and won't be in the game.`, ref: ref(n.id) })
      }
    }
    for (const r of q.requires) {
      if ('quest' in r && quests.has(r.quest)) out.push({ level: 'warning', area: 'Inactive', message: `"${q.title}" requires "${qTitle(r.quest)}" to have ended, but that quest is inactive: "${q.title}" can never be offered until it is active.`, ref: ref(), key: `inactive-req:${q.id}:${r.quest}` })
    }
  }
  for (const [eid, why] of encs) if (why === 'fleet') {
    const e = m.encounters.find((x) => x.id === eid)!
    out.push({ level: 'warning', area: 'Inactive', message: `${e.name} is not exported: its named fleet ${fName(e.fleet.template!)} is inactive.`, ref: { page: 'encounters', id: eid }, key: `inactive-fleet:${eid}` })
  }
  for (const p of m.pools ?? []) for (const en of p.entries) if (encs.has(en.id)) out.push({ level: 'warning', area: 'Inactive', message: `Pool "${p.name || p.id}" lists ${eName(en.id)}, which is inactive: it is left out of the pool.`, ref: { page: 'saga', id: p.id }, key: `inactive-pool:${p.id}:${en.id}` })
  for (const b of m.bounties ?? []) if (b.encounter && encs.has(b.encounter)) out.push({ level: 'error', area: 'Inactive', message: `The MagicLib bounty ${b.id} hunts ${eName(b.encounter)}, which is inactive and won't be in the game.`, ref: { page: 'quests', id: b.quest ?? '' } })
  for (const e of m.encounters) {
    if (encs.has(e.id)) continue
    const ref: ProblemRef = { page: 'encounters', id: e.id }
    const fc = e.fleet.size === 'template' ? m.fleets?.templates.find((t) => t.id === e.fleet.template)?.captain : e.fleet.flagshipCommander
    if (fc && people.has(fc)) out.push({ level: 'error', area: 'Inactive', message: `${e.name}: its flagship commander ${pName(fc)} is inactive and won't be in the game.`, ref })
    if (e.spawn.quest && quests.has(e.spawn.quest)) out.push({ level: 'warning', area: 'Inactive', message: `${e.name} spawns at a stage of "${qTitle(e.spawn.quest)}", which is inactive: it would never spawn.`, ref, key: `inactive-spawn:${e.id}` })
    if (e.commDialog && quests.has(e.commDialog)) out.push({ level: 'warning', area: 'Inactive', message: `${e.name}'s comm-link dialog "${qTitle(e.commDialog)}" is inactive: the fleet would use its faction's vanilla greeting.`, ref, key: `inactive-comm:${e.id}` })
  }
  return out
}

/** Problems inside inactive content become warnings (to-dos too: they don't block release). */
export function softenInactive(m: Pick<ModModel, 'people' | 'quests'> & EF, problems: Problem[]): Problem[] {
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  if (!people.size && !quests.size && !inactiveEncounters(m).size && !inactiveFleets(m).size) return problems
  return problems.map((p) => (p.area !== 'Inactive' && (p.level === 'error' || p.level === 'todo') && isInactiveRef(m, p.ref, people, quests)
    ? { ...p, level: 'warning' as const, message: `(inactive) ${p.message}` }
    : p))
}

/** For lists: the name with "[Inactive]" when it is. */
export const inactiveLabel = (name: string, on: boolean): string => (on ? `${name} [Inactive]` : name)
