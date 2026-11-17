/**
 * Inactive content (INGAME-CHECKS R10; docs/DESIGN-PHASE1.md §2): planned people and quests (or
 * conversations) that exist in the editor but are not exported, so they never appear in game.
 * A quest is also inactive when it is offered by a named contact who is inactive.
 */
import type { Problem, ProblemRef } from './api'
import type { ModModel } from './serialize'
import { activeTodos, type TodoEntry } from './todo'
import { TOKEN_RE } from './rules/parse'

type M = Pick<ModModel, 'people' | 'quests' | 'encounters' | 'systems' | 'phrases' | 'items'>

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

/** Whether a problem points inside inactive content. */
export function isInactiveRef(m: Pick<ModModel, 'people' | 'quests'>, ref: ProblemRef | undefined, people = inactivePeople(m), quests = inactiveQuests(m)): boolean {
  if (!ref?.id) return false
  return (ref.page === 'people' && people.has(ref.id)) || (ref.page === 'quests' && quests.has(ref.id))
}

/**
 * The model Export writes: inactive people and quests left out, and inactive people taken off
 * markets' people lists (they stay in the plan, so reactivating needs no re-placing).
 */
export function exportableModel<T extends Pick<ModModel, 'people' | 'quests' | 'systems'>>(m: T): T {
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  if (!people.size && !quests.size) return m
  return {
    ...m,
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
  if (!people.size && !quests.size) return out
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
      if (n.type === 'action') for (const op of n.ops) {
        if (op.op === 'startQuest' && quests.has(op.quest)) out.push({ level: 'error', area: 'Inactive', message: `"${q.title}" › "${n.title || n.id}" starts "${qTitle(op.quest)}", which is inactive and won't be in the game.`, ref: ref(n.id) })
      }
    }
    for (const r of q.requires) {
      if ('quest' in r && quests.has(r.quest)) out.push({ level: 'warning', area: 'Inactive', message: `"${q.title}" requires "${qTitle(r.quest)}" to have ended, but that quest is inactive: "${q.title}" can never be offered until it is active.`, ref: ref(), key: `inactive-req:${q.id}:${r.quest}` })
    }
  }
  for (const e of m.encounters) {
    const ref: ProblemRef = { page: 'encounters', id: e.id }
    if (e.fleet.flagshipCommander && people.has(e.fleet.flagshipCommander)) out.push({ level: 'error', area: 'Inactive', message: `${e.name}: its flagship commander ${pName(e.fleet.flagshipCommander)} is inactive and won't be in the game.`, ref })
    if (e.spawn.quest && quests.has(e.spawn.quest)) out.push({ level: 'warning', area: 'Inactive', message: `${e.name} spawns at a stage of "${qTitle(e.spawn.quest)}", which is inactive: it would never spawn.`, ref, key: `inactive-spawn:${e.id}` })
    if (e.commDialog && quests.has(e.commDialog)) out.push({ level: 'warning', area: 'Inactive', message: `${e.name}'s comm-link dialog "${qTitle(e.commDialog)}" is inactive: the fleet would use its faction's vanilla greeting.`, ref, key: `inactive-comm:${e.id}` })
  }
  return out
}

/** Problems inside inactive content become warnings (to-dos too: they don't block release). */
export function softenInactive(m: Pick<ModModel, 'people' | 'quests'>, problems: Problem[]): Problem[] {
  const people = inactivePeople(m)
  const quests = inactiveQuests(m)
  if (!people.size && !quests.size) return problems
  return problems.map((p) => (p.area !== 'Inactive' && (p.level === 'error' || p.level === 'todo') && isInactiveRef(m, p.ref, people, quests)
    ? { ...p, level: 'warning' as const, message: `(inactive) ${p.message}` }
    : p))
}

/** For lists: the name with "[Inactive]" when it is. */
export const inactiveLabel = (name: string, on: boolean): string => (on ? `${name} [Inactive]` : name)
