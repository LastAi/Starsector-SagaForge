/** rules.csv text → rows (shared: used by the main process index and by the editor for the mod's own file). */
import { parseCsvRecords } from '../csvedit'
import type { RuleRow } from '../rules/types'

export function parseRulesCsvRows(text: string, sourceId: string, file: string): RuleRow[] {
  const out: RuleRow[] = []
  const recs = parseCsvRecords(text)
  const hi = recs.findIndex((r) => r.fields.some((f) => f.trim() !== ''))
  if (hi < 0) return out
  const cols = recs[hi].fields.map((h) => h.trim())
  const c = (name: string) => cols.indexOf(name)
  const ci = { id: c('id'), trigger: c('trigger'), conditions: c('conditions'), script: c('script'), text: c('text'), options: c('options'), notes: c('notes') }
  if (ci.id < 0 || ci.trigger < 0) return out
  let line = 1
  let pos = 0
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k]
    for (; pos < r.start; pos++) if (text.charCodeAt(pos) === 10) line++
    if (k <= hi) continue
    if ((r.raw[0] ?? '').startsWith('#')) continue // unquoted comment rows are skipped by the game's CSV parser
    const id = (r.fields[ci.id] ?? '').trim()
    if (!id || id.startsWith('#')) continue
    const f = (i: number) => (i >= 0 ? r.fields[i] ?? '' : '')
    out.push({ id, trigger: f(ci.trigger).trim(), conditions: f(ci.conditions), script: f(ci.script), text: f(ci.text), options: f(ci.options), notes: f(ci.notes), sourceId, file, line })
  }
  return out
}

export const RULES_HEADER = ['id', 'trigger', 'conditions', 'script', 'text', 'options', 'notes']
