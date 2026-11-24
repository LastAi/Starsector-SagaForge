/**
 * World events (Phase 8d, RC-R12; DESIGN-PHASE8.md "8d"): a scheduler as SagaLib reads it
 * (data/sagaforge/events/<id>.json: its events are pool entries with a duration and a news item)
 * and the rules its events' start and end actions run as (triggers SF_event_<id>_start / _end,
 * fired by SagaLib outside any dialog, like quest timers).
 */
import type { ActionOp, EventSchedulerPlan } from '../model'
import type { RuleRow } from '../rules/types'
import { itemLine, repLine, type CompileOptions } from './questrules'
import { pluginLine } from '../plugins'
import { startQuestLines } from '../quest'

export const eventStartTrigger = (id: string) => `SF_event_${id}_start`
export const eventEndTrigger = (id: string) => `SF_event_${id}_end`
/** The memory flag that is true while an event runs (for conditions and dialog). */
export const eventActiveKey = (id: string) => `$global.${id}_active`
/** Dev mode: a test profile flag that starts this event at the scheduler's next tick. */
export const eventForceKey = (scheduler: string) => `$global.sagaforge_ev_${scheduler}_force`

/** The actions world events can run (no quest of their own: no rewards, stages or random targets). */
export const EVENT_OPS: ActionOp['op'][] = ['set', 'unset', 'rep', 'credits', 'item', 'spawn', 'despawn', 'placeEntity', 'removeEntity', 'startQuest', 'storyPoints', 'xp', 'progress', 'plugin', 'line']

/**
 * #67 U12 (SagaLib 1.4): the actions as SagaLib runs them itself, outside any dialog (no dialog
 * opens and closes: "Gained …" lines become campaign messages). Null when one of them needs a dialog
 * (a raw rules line, or "the person you're talking to"): then the action stays a rule that SagaLib
 * fires in a dialog of its own, as before. An empty list: nothing to run.
 */
export function quietOps(ops: ActionOp[], itemKind?: CompileOptions['itemKind']): Record<string, unknown>[] | null {
  const out: Record<string, unknown>[] = []
  for (const op of ops) {
    if (!eventOpLines(op, itemKind).length) continue // not filled in
    switch (op.op) {
      case 'set': out.push({ op: 'set', key: op.key, value: op.value, ...(op.days !== undefined ? { days: op.days } : {}) }); break
      case 'unset': out.push({ op: 'unset', key: op.key }); break
      case 'credits': out.push({ op: 'credits', amount: op.amount }); break
      case 'item': out.push({ op: 'item', id: op.item, kind: itemKind?.(op.item) === 'special' ? 'special' : 'commodity', qty: op.qty }); break
      case 'rep':
        if (op.person === '$person') return null
        out.push(op.person ? { op: 'rep', person: op.person, amount: op.amount } : { op: 'rep', faction: op.faction, amount: op.amount }); break
      case 'spawn': case 'despawn': out.push({ op: op.op, encounter: op.encounter }); break
      case 'placeEntity': out.push({ op: 'placeEntity', entity: op.entity }); break
      case 'removeEntity': out.push({ op: 'removeEntity', entity: op.entity, ...(op.decivilize ? { decivilize: true } : {}) }); break
      case 'startQuest': out.push({ op: 'startQuest', quest: op.quest, ...(op.stage ? { stage: op.stage } : {}) }); break
      case 'storyPoints': case 'xp': out.push({ op: op.op, amount: op.amount }); break
      case 'progress': out.push({ op: 'progress', event: op.event, points: Math.round(op.points), ...(op.text?.trim() ? { text: op.text.trim() } : {}) }); break
      case 'plugin': out.push({ op: 'plugin', className: op.className.trim(), args: Object.fromEntries(op.args.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value])) }); break
      default: return null // 'line' and anything else: rules.csv in a dialog
    }
  }
  return out
}

export function eventsRuntime(s: EventSchedulerPlan, itemKind?: CompileOptions['itemKind']): Record<string, unknown> {
  // #67 U12: the start and end actions SagaLib runs itself (no dialog); the others stay rules
  const quiet = (ops: ActionOp[]) => { const q = quietOps(ops, itemKind); return q && q.length ? q : null }
  return {
    format: 1, id: s.id, name: s.name, min: s.min, max: s.max, intervalDays: s.intervalDays,
    ...(s.firstAfterDays ? { firstAfterDays: s.firstAfterDays } : {}),
    entries: s.events.map((e) => {
      const start = quiet(e.start), end = quiet(e.end)
      return {
        id: e.id, weight: e.weight, conditions: e.conditions,
        ...(e.once ? { once: 'playthrough' } : {}), ...(e.cooldownDays ? { cooldownDays: e.cooldownDays } : {}), ...(e.max ? { max: e.max } : {}),
        durationDays: e.durationDays, ...(e.stack ? { stack: true } : {}),
        ...(e.news ? { news: { title: e.news.title, text: e.news.text, ...(e.news.icon ? { icon: e.news.icon } : {}), tag: e.news.tag || 'Major events', ...(e.news.at ? { at: e.news.at } : {}), days: e.news.days } } : {}),
        ...(start ? { start } : {}), ...(end ? { end } : {})
      }
    })
  }
}

/** One action as rules.csv script lines (empty when it isn't filled in). */
export function eventOpLines(op: ActionOp, itemKind?: CompileOptions['itemKind']): string[] {
  switch (op.op) {
    case 'credits': return [op.amount >= 0 ? `AddCredits ${op.amount}` : `SubCredits ${-op.amount}`]
    // #80: a named person too (AdjustRepPerson); nobody is talked to here, so "$person" has no one (a check says so)
    case 'rep': return (op.person && op.person !== '$person') || (!op.person && op.faction) ? [repLine(op)] : []
    case 'item': return op.item ? [itemLine(op.item, op.qty, itemKind)] : []
    case 'set': return op.key ? [`${op.key} = ${op.value}${op.days !== undefined ? ` ${op.days}` : ''}`] : []
    case 'unset': return op.key ? [`unset ${op.key}`] : []
    case 'spawn': return op.encounter ? [`SF_Spawn ${op.encounter}`] : []
    case 'despawn': return op.encounter ? [`SF_Despawn ${op.encounter}`] : []
    case 'placeEntity': return op.entity ? [`SF_PlaceEntity ${op.entity}`] : []
    case 'removeEntity': return op.entity ? [`SF_RemoveEntity ${op.entity}${op.decivilize ? ' decivilize' : ''}`] : []
    case 'startQuest': return startQuestLines(op)
    case 'storyPoints': return [`AddStoryPoints ${op.amount}`]
    case 'xp': return [`AddXP ${op.amount}`]
    case 'line': return op.line.trim() ? [op.line.trim()] : []
    case 'progress': return op.event ? [`SF_Progress ${op.event} ${Math.round(op.points)}${op.text?.trim() ? ` "${op.text.trim().replace(/"/g, "'")}"` : ''}`] : []
    // #79 (SagaLib 1.4): no quest and node here (the plugin's context has none; its result goes to the local key)
    case 'plugin': return op.className.trim() ? [pluginLine(op.className, op.args)] : []
    default: return []
  }
}

/**
 * The rules of every event's start and end actions (only for events that have some). #67 U12: an
 * action SagaLib runs itself (quietOps) has no rule; `all` lists them anyway (the flags registry).
 */
export function eventRules(schedulers: EventSchedulerPlan[], sourceId = 'plan', itemKind?: CompileOptions['itemKind'], all = false): RuleRow[] {
  const rows: RuleRow[] = []
  let line = 0
  for (const s of schedulers) {
    for (const e of s.events) {
      for (const [part, ops, trigger] of [['start', e.start, eventStartTrigger(e.id)], ['end', e.end, eventEndTrigger(e.id)]] as const) {
        const script = ops.flatMap((op) => eventOpLines(op, itemKind))
        if (!script.length) continue
        if (!all && quietOps(ops, itemKind)) continue
        rows.push({ id: `${e.id}_${part}`, trigger, conditions: '', script: script.join('\n'), text: '', options: '', notes: `world event ${e.id} (${s.id}): ${part}`, sourceId, file: `events ${s.id}`, line: ++line } as RuleRow)
      }
    }
  }
  return rows
}
