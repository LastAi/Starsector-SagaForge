/**
 * Progress event checks (Phase 8d-3, RC-R12 b; DESIGN-PHASE8.md "8d").
 */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem } from '.'
import { EVENT_OPS } from '../export/events'
import { MAX_PROGRESS_STAGES } from '../export/progress'

export function progressProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const list = m.progress ?? []
  const ids = new Set<string>()
  for (const p of list) {
    const ref = { page: 'saga' as const, id: 'progress', sub: p.id }
    const who = `Progress event "${p.name || p.id}"`
    if (ids.has(p.id)) out.push({ level: 'error', area: 'Progress', ref, message: `Two progress events have the id "${p.id}".` })
    ids.add(p.id)
    const pp = prefixProblem(m.project.prefix, p.id, 'Progress', ref)
    if (pp) out.push(pp)
    if (!(p.max >= 1)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: the bar's maximum must be at least 1 (vanilla uses 1000).` })
    if (!p.stages.length) out.push({ level: 'warning', area: 'Progress', ref, key: `pestages:${p.id}`, message: `${who} has no stages: nothing ever happens.` })
    if (p.stages.length > MAX_PROGRESS_STAGES) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: at most ${MAX_PROGRESS_STAGES} stages (SagaLib's stage slots).` })
    let prev = 0
    const sids = new Set<string>()
    for (const s of p.stages) {
      if (sids.has(s.id)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: two stages have the id "${s.id}".` })
      sids.add(s.id)
      if (!(s.progress > prev)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: stage "${s.title || s.id}" (at ${s.progress}) must come after the stage before (${prev}); SagaLib skips it.` })
      if (s.progress > p.max) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: stage "${s.title || s.id}" is at ${s.progress}, past the maximum ${p.max}.` })
      prev = Math.max(prev, s.progress)
      for (const op of [...s.actions, ...(s.outcomes ?? []).flatMap((o) => o.actions)]) {
        if (!EVENT_OPS.includes(op.op)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}, stage "${s.title || s.id}": "${op.op}" can't run here (no quest of its own).` })
        if ((op.op === 'spawn' || op.op === 'despawn') && op.encounter && !m.encounters.some((x) => x.id === op.encounter)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}, stage "${s.title || s.id}": there is no encounter "${op.encounter}".` })
        if (op.op === 'progress' && op.event === p.id) out.push({ level: 'warning', area: 'Progress', ref, key: `peself:${p.id}:${s.id}`, message: `${who}, stage "${s.title || s.id}" adds progress to itself: it may reach the next stage at once.` })
      }
      if (s.outcomes?.length) {
        if (s.actions.length) out.push({ level: 'warning', area: 'Progress', ref, key: `peboth:${p.id}:${s.id}`, message: `${who}, stage "${s.title || s.id}" has outcomes: only the picked outcome's actions run, not the stage's own.` })
        if (!s.outcomes.some((o) => o.weight > 0)) out.push({ level: 'error', area: 'Progress', ref, message: `${who}, stage "${s.title || s.id}": every outcome has weight 0.` })
      }
    }
    if (p.restartAt !== undefined && p.restartAt >= 0 && p.stages.length && p.restartAt >= p.stages[p.stages.length - 1].progress) out.push({ level: 'error', area: 'Progress', ref, message: `${who}: "starts over at" must be below the last stage (${p.stages[p.stages.length - 1].progress}).` })
    if (!p.factors.length && !hasPointsFrom(m, p.id)) out.push({ level: 'warning', area: 'Progress', ref, key: `penopoints:${p.id}`, message: `${who}: no monthly factors and nothing adds progress to it ("Add progress" actions): its bar never moves.` })
  }
  // "Add progress" actions that name a missing event
  const known = new Set(list.map((p) => p.id))
  for (const q of m.quests) for (const n of q.nodes) if (n.type === 'action') for (const op of n.ops) if (op.op === 'progress' && op.event && !known.has(op.event)) out.push({ level: 'error', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, message: `${q.title}: "Add progress" names "${op.event}", which isn't one of the mod's progress events.` })
  for (const s of m.events ?? []) for (const e of s.events) for (const op of [...e.start, ...e.end]) if (op.op === 'progress' && op.event && !known.has(op.event)) out.push({ level: 'error', area: 'Events', ref: { page: 'saga', id: 'events', sub: s.id }, message: `World event "${e.name || e.id}": "Add progress" names "${op.event}", which isn't one of the mod's progress events.` })
  return out
}

function hasPointsFrom(m: CheckContext['model'], id: string): boolean {
  const adds = (ops: { op: string; event?: string }[]) => ops.some((o) => o.op === 'progress' && o.event === id)
  return m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && adds(n.ops))) ||
    (m.events ?? []).some((s) => s.events.some((e) => adds(e.start) || adds(e.end))) ||
    (m.progress ?? []).some((p) => p.stages.some((s) => adds(s.actions) || (s.outcomes ?? []).some((o) => adds(o.actions)))) ||
    m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((o) => o.op === 'line' && o.line.includes(`SF_Progress ${id} `))))
}
