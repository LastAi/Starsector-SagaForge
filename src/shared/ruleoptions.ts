/**
 * #67 U34 (user, 2026-11-22): the dialog options the game's rules offer (an options cell, or an
 * AddOption script line) and how many rules answer each (DialogOptionSelected with $option == id).
 * An interjection (Quest settings › Start) cuts into one of these by id; the reference lists them.
 */
import type { RuleRow } from './rules/types'
import { parseOptions } from './rules/parse'

export interface RuleOptionInfo {
  id: string
  /** The text of the first rule that offers it. */
  text: string
  /** The first rule that offers it (its id). */
  offeredIn: string
  /** Rules that answer it (trigger DialogOptionSelected, condition $option == id). */
  answers: number
  sourceId: string
}

export function ruleOptions(rows: RuleRow[]): RuleOptionInfo[] {
  const out = new Map<string, RuleOptionInfo>()
  const offer = (raw: string, text: string, r: RuleRow) => {
    // "#id" is a line commented out; "(dev)id" is shown only in dev mode
    if (!raw || raw.startsWith('#')) return
    const dev = raw.startsWith('(dev)')
    const id = dev ? raw.slice(5) : raw
    if (!id || out.has(id)) return
    if (dev) text = `${text.trim()} (dev mode only)`
    out.set(id, { id, text: text.trim(), offeredIn: r.id, answers: 0, sourceId: r.sourceId })
  }
  for (const r of rows) {
    for (const o of parseOptions(r.options ?? '')) offer(o.id, o.text, r)
    for (const l of (r.script ?? '').split(/\r?\n/)) {
      const m = /^\s*AddOption\s+(\S+)\s+(\S+)\s*(.*)$/.exec(l)
      if (m) offer(m[2], m[3].replace(/^"|"$/g, ''), r)
    }
  }
  for (const r of rows) {
    if (r.trigger !== 'DialogOptionSelected') continue
    for (const m of (r.conditions ?? '').matchAll(/\$option\s*==\s*(\S+)/g)) {
      const o = out.get(m[1])
      if (o) o.answers++
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id))
}
