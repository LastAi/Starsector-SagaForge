/**
 * #67 U46 (user, 2026-11-24; SagaLib 1.4): an encounter's own outcome actions ("When defeated",
 * "When avoided"), run whoever spawned the fleet. SagaLib fires the trigger SF_enc_<id>_defeated /
 * _avoided outside any dialog (before the owning quest's own outcome); actions it can run itself
 * are written into the encounter file (outcomes.defeatedActions / avoidedActions), the others
 * stay rules on that trigger, like world events and progress stages.
 */
import type { ActionOp, EncounterDef } from '../model'
import type { RuleRow } from '../rules/types'
import type { CompileOptions } from './questrules'
import { eventOpLines, quietOps } from './events'

export type EncounterOutcome = 'defeated' | 'avoided'
export const encounterOutcomeTrigger = (id: string, o: EncounterOutcome) => `SF_enc_${id}_${o}`
/** SagaLib's record of how the encounter's last fleet ended: spawned | defeated | avoided. */
export const encounterStateKey = (id: string) => `$global.sagaforge_enc_${id}_state`
/** SagaLib 1.1: how often a named fleet (template) has been beaten. */
export const fleetDefeatsKey = (template: string) => `$global.sagaforge_fleet_${template}_defeats`

export const outcomeOps = (e: EncounterDef, o: EncounterOutcome): ActionOp[] => (o === 'defeated' ? e.onDefeated : e.onAvoided) ?? []
const filled = (ops: ActionOp[], itemKind?: CompileOptions['itemKind']) => ops.some((op) => eventOpLines(op, itemKind).length > 0)

/** The encounter file's "outcomes" object (the actions SagaLib runs itself go in it). */
export function encounterOutcomesRuntime(e: EncounterDef, itemKind?: CompileOptions['itemKind']): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(e.outcomes ?? {}) }
  for (const o of ['defeated', 'avoided'] as const) {
    const ops = outcomeOps(e, o)
    if (!filled(ops, itemKind)) continue
    out[o] = encounterOutcomeTrigger(e.id, o)
    const q = quietOps(ops, itemKind)
    if (q && q.length) out[`${o}Actions`] = q
  }
  return out
}

/** Rules for outcome actions SagaLib can't run itself (a raw rules line…); `all` lists every one (the flags registry). */
export function encounterOutcomeRules(list: EncounterDef[], sourceId = 'plan', itemKind?: CompileOptions['itemKind'], all = false): RuleRow[] {
  const rows: RuleRow[] = []
  let line = 0
  for (const e of list) for (const o of ['defeated', 'avoided'] as const) {
    const ops = outcomeOps(e, o)
    const script = ops.flatMap((op) => eventOpLines(op, itemKind))
    if (!script.length) continue
    if (!all && quietOps(ops, itemKind)) continue
    rows.push({ id: `${e.id}_${o}`, trigger: encounterOutcomeTrigger(e.id, o), conditions: '', script: script.join('\n'), text: '', options: '', notes: `encounter ${e.id}: when ${o}`, sourceId, file: `encounter ${e.id}`, line: ++line } as RuleRow)
  }
  return rows
}

export const hasOutcomeActions = (e: EncounterDef) => filled(e.onDefeated ?? []) || filled(e.onAvoided ?? [])
