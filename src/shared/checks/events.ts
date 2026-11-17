/**
 * World event checks (Phase 8d, RC-R12; DESIGN-PHASE8.md "8d").
 */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem } from '.'
import { EVENT_OPS } from '../export/events'

export function eventProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const scheds = m.events ?? []
  const poolIds = new Set((m.pools ?? []).map((p) => p.id))
  const ids = new Set<string>()
  const eventIds = new Set<string>()
  const entityIds = new Set([...m.systems.flatMap((s) => s.entities.flatMap((e) => [e.id, ...(e.market ? [e.market.id] : [])])), ...(ctx.index?.markets ?? []).flatMap((mk) => [mk.id, ...mk.entities])])
  for (const s of scheds) {
    const ref = { page: 'saga' as const, id: 'events', sub: s.id }
    const who = `Event scheduler "${s.name || s.id}"`
    if (ids.has(s.id)) out.push({ level: 'error', area: 'Events', ref, message: `Two event schedulers have the id "${s.id}".` })
    ids.add(s.id)
    if (poolIds.has(s.id)) out.push({ level: 'error', area: 'Events', ref, message: `${who}: a pool has the same id "${s.id}" (their limits would share memory keys). Rename one.` })
    const pp = prefixProblem(m.project.prefix, s.id, 'Events', ref)
    if (pp) out.push(pp)
    if (!(s.intervalDays > 0)) out.push({ level: 'error', area: 'Events', ref, message: `${who}: the check interval must be more than 0 days.` })
    if (s.max < 1) out.push({ level: 'warning', area: 'Events', ref, key: `evmax:${s.id}`, message: `${who}: at most 0 running, so none of its events ever starts.` })
    if (s.min > s.max) out.push({ level: 'error', area: 'Events', ref, message: `${who}: at least ${s.min} running is more than at most ${s.max}.` })
    if (!s.events.length) out.push({ level: 'warning', area: 'Events', ref, key: `evempty:${s.id}`, message: `${who} has no events.` })
    for (const e of s.events) {
      const ew = `World event "${e.name || e.id}"`
      if (eventIds.has(e.id)) out.push({ level: 'error', area: 'Events', ref, message: `Two world events have the id "${e.id}".` })
      eventIds.add(e.id)
      const ep = prefixProblem(m.project.prefix, e.id, 'Events', ref)
      if (ep) out.push(ep)
      if (!(e.weight > 0)) out.push({ level: 'warning', area: 'Events', ref, key: `evweight:${e.id}`, message: `${ew}: weight 0, so it is never picked.` })
      if (e.news && !e.news.title.trim()) out.push({ level: 'warning', area: 'Events', ref, key: `evnews:${e.id}`, message: `${ew}: its news item has no title.` })
      if (e.news?.at && !entityIds.has(e.news.at)) out.push({ level: 'warning', area: 'Events', ref, key: `evat:${e.id}`, message: `${ew}: the news item's place "${e.news.at}" isn't an object or market the editor knows; the map shows nothing.` })
      if (!e.news && !e.start.length && !e.end.length) out.push({ level: 'warning', area: 'Events', ref, key: `evnothing:${e.id}`, message: `${ew} has no news item and no actions: the player never notices it (it only sets $global.${e.id}_active).` })
      for (const [part, ops] of [['start', e.start], ['end', e.end]] as const) {
        for (const op of ops) {
          if (!EVENT_OPS.includes(op.op)) out.push({ level: 'error', area: 'Events', ref, message: `${ew}: "${op.op}" can't run in a world event (no quest of its own).` })
          if ((op.op === 'spawn' || op.op === 'despawn') && op.encounter && !m.encounters.some((x) => x.id === op.encounter)) out.push({ level: 'error', area: 'Events', ref, message: `${ew} (${part}): there is no encounter "${op.encounter}".` })
          if (op.op === 'startQuest' && op.quest && !m.quests.some((x) => x.id === op.quest)) out.push({ level: 'error', area: 'Events', ref, message: `${ew} (${part}): there is no quest "${op.quest}".` })
        }
      }
      if (e.durationDays > 0 && e.start.some((op) => op.op === 'spawn') && !e.end.some((op) => op.op === 'despawn')) out.push({ level: 'warning', area: 'Events', ref, key: `evdespawn:${e.id}`, message: `${ew} spawns a fleet when it starts but doesn't remove it when it ends: add "Despawn" to its end actions, or the fleet stays.` })
    }
  }
  return out
}
