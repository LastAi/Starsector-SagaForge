/**
 * Progress events (Phase 8d-3, RC-R12 b; DESIGN-PHASE8.md "8d"): as SagaLib reads them
 * (data/sagaforge/progress/<id>.json) and the rules their stages' actions run as (trigger
 * SF_progress_<event>_<stage>, or _<stage>_<outcome> for a stage with outcomes; fired outside any
 * dialog, quietly unless a rule adds options).
 */
import type { ProgressEventPlan } from '../model'
import type { RuleRow } from '../rules/types'
import type { CompileOptions } from './questrules'
import { eventOpLines, quietOps } from './events'

export const progressTrigger = (event: string, stage: string, outcome?: string) => `SF_progress_${event}_${stage}${outcome ? `_${outcome}` : ''}`
export const progressStageKey = (event: string) => `$global.${event}_stage`
export const progressOutcomeKey = (event: string, stage: string) => `$global.${event}_${stage}_outcome`
/** At most this many stages (SagaLib's stage slots). */
export const MAX_PROGRESS_STAGES = 20

export function progressRuntime(p: ProgressEventPlan, itemKind?: CompileOptions['itemKind']): Record<string, unknown> {
  // #67 U12 (SagaLib 1.4): the actions SagaLib runs itself, outside any dialog; the others stay rules
  const quiet = (ops: ProgressEventPlan['stages'][number]['actions']) => { const q = quietOps(ops, itemKind); return q && q.length ? { actions: q } : {} }
  return {
    format: 1, id: p.id, name: p.name, ...(p.icon ? { icon: p.icon } : {}), ...(p.tag ? { tag: p.tag } : {}), max: p.max,
    ...(p.negative ? { negative: true } : {}), startConditions: p.startConditions,
    ...(p.restartAt !== undefined && p.restartAt >= 0 ? { restartAt: p.restartAt } : {}),
    stages: p.stages.map((s) => ({
      id: s.id, progress: s.progress, title: s.title, text: s.text, ...(s.icon ? { icon: s.icon } : {}),
      ...(s.outcomes?.length ? { outcomes: s.outcomes.map((o) => ({ id: o.id, weight: o.weight, ...quiet(o.actions) })) } : quiet(s.actions))
    })),
    factors: p.factors.map((f) => ({ id: f.id, desc: f.desc, points: f.points, conditions: f.conditions }))
  }
}

export function progressRules(list: ProgressEventPlan[], sourceId = 'plan', itemKind?: CompileOptions['itemKind'], all = false): RuleRow[] {
  const rows: RuleRow[] = []
  let line = 0
  const push = (id: string, trigger: string, ops: ProgressEventPlan['stages'][number]['actions'], file: string, notes: string) => {
    // #67 U12: SagaLib runs it itself (no rule), unless `all` (the flags registry)
    if (!all && quietOps(ops, itemKind)) return
    const script = ops.flatMap((op) => eventOpLines(op, itemKind))
    if (script.length) rows.push({ id, trigger, conditions: '', script: script.join('\n'), text: '', options: '', notes, sourceId, file, line: ++line })
  }
  for (const p of list) {
    for (const s of p.stages) {
      if (s.outcomes?.length) for (const o of s.outcomes) push(`${p.id}_${s.id}_${o.id}`, progressTrigger(p.id, s.id, o.id), o.actions, `progress ${p.id}`, `progress event ${p.id}: stage ${s.id}, outcome ${o.id}`)
      else push(`${p.id}_${s.id}`, progressTrigger(p.id, s.id), s.actions, `progress ${p.id}`, `progress event ${p.id}: stage ${s.id}`)
    }
  }
  return rows
}
