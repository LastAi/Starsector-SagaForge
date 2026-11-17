/**
 * World events (Phase 8d, RC-R12; DESIGN-PHASE8.md "8d"): a scheduler as SagaLib reads it
 * (data/sagaforge/events/<id>.json: its events are pool entries with a duration and a news item)
 * and the rules its events' start and end actions run as (triggers SF_event_<id>_start / _end,
 * fired by SagaLib outside any dialog, like quest timers).
 */
import type { ActionOp, EventSchedulerPlan } from '../model'
import type { RuleRow } from '../rules/types'
import { itemLine, type CompileOptions } from './questrules'

export const eventStartTrigger = (id: string) => `SF_event_${id}_start`
export const eventEndTrigger = (id: string) => `SF_event_${id}_end`
/** The memory flag that is true while an event runs (for conditions and dialog). */
export const eventActiveKey = (id: string) => `$global.${id}_active`
/** Dev mode: a test profile flag that starts this event at the scheduler's next tick. */
export const eventForceKey = (scheduler: string) => `$global.sagaforge_ev_${scheduler}_force`

/** The actions world events can run (no quest of their own: no rewards, stages or random targets). */
export const EVENT_OPS: ActionOp['op'][] = ['set', 'unset', 'rep', 'credits', 'item', 'spawn', 'despawn', 'placeEntity', 'removeEntity', 'startQuest', 'storyPoints', 'xp', 'progress', 'line']

export function eventsRuntime(s: EventSchedulerPlan): Record<string, unknown> {
  return {
    format: 1, id: s.id, name: s.name, min: s.min, max: s.max, intervalDays: s.intervalDays,
    ...(s.firstAfterDays ? { firstAfterDays: s.firstAfterDays } : {}),
    entries: s.events.map((e) => ({
      id: e.id, weight: e.weight, conditions: e.conditions,
      ...(e.once ? { once: 'playthrough' } : {}), ...(e.cooldownDays ? { cooldownDays: e.cooldownDays } : {}), ...(e.max ? { max: e.max } : {}),
      durationDays: e.durationDays, ...(e.stack ? { stack: true } : {}),
      ...(e.news ? { news: { title: e.news.title, text: e.news.text, ...(e.news.icon ? { icon: e.news.icon } : {}), tag: e.news.tag || 'Major events', ...(e.news.at ? { at: e.news.at } : {}), days: e.news.days } } : {})
    }))
  }
}

/** One action as rules.csv script lines (empty when it isn't filled in). */
export function eventOpLines(op: ActionOp, itemKind?: CompileOptions['itemKind']): string[] {
  switch (op.op) {
    case 'credits': return [op.amount >= 0 ? `AddCredits ${op.amount}` : `SubCredits ${-op.amount}`]
    case 'rep': return op.faction ? [`AdjustRep ${op.faction} ${op.amount}`] : []
    case 'item': return op.item ? [itemLine(op.item, op.qty, itemKind)] : []
    case 'set': return op.key ? [`${op.key} = ${op.value}${op.days !== undefined ? ` ${op.days}` : ''}`] : []
    case 'unset': return op.key ? [`unset ${op.key}`] : []
    case 'spawn': return op.encounter ? [`SF_Spawn ${op.encounter}`] : []
    case 'despawn': return op.encounter ? [`SF_Despawn ${op.encounter}`] : []
    case 'placeEntity': return op.entity ? [`SF_PlaceEntity ${op.entity}`] : []
    case 'removeEntity': return op.entity ? [`SF_RemoveEntity ${op.entity}${op.decivilize ? ' decivilize' : ''}`] : []
    case 'startQuest': return op.quest ? [`SF_Start ${op.quest}`] : []
    case 'storyPoints': return [`AddStoryPoints ${op.amount}`]
    case 'xp': return [`AddXP ${op.amount}`]
    case 'line': return op.line.trim() ? [op.line.trim()] : []
    case 'progress': return op.event ? [`SF_Progress ${op.event} ${Math.round(op.points)}${op.text?.trim() ? ` "${op.text.trim().replace(/"/g, "'")}"` : ''}`] : []
    default: return []
  }
}

/** The rules of every event's start and end actions (only for events that have some). */
export function eventRules(schedulers: EventSchedulerPlan[], sourceId = 'plan', itemKind?: CompileOptions['itemKind']): RuleRow[] {
  const rows: RuleRow[] = []
  let line = 0
  for (const s of schedulers) {
    for (const e of s.events) {
      for (const [part, ops, trigger] of [['start', e.start, eventStartTrigger(e.id)], ['end', e.end, eventEndTrigger(e.id)]] as const) {
        const script = ops.flatMap((op) => eventOpLines(op, itemKind))
        if (!script.length) continue
        rows.push({ id: `${e.id}_${part}`, trigger, conditions: '', script: script.join('\n'), text: '', options: '', notes: `world event ${e.id} (${s.id}): ${part}`, sourceId, file: `events ${s.id}`, line: ++line } as RuleRow)
      }
    }
  }
  return rows
}
