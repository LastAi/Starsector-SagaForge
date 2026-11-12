/**
 * The flags registry (PLAN.md §4.8): every memory key the mod uses, who sets it and who reads it,
 * from the plans (through their exported rules) and the mod's hand-written rules.csv rows.
 * Checks: read but never set ("did you mean"), set but never read, set with different types.
 */
import type { Problem } from './api'
import type { ModModel } from './serialize'
import type { RuleRow } from './rules/types'
import { compileQuest } from './export/questrules'
import { parseConditions, parseScript, TOKEN_RE } from './rules/parse'
import { prereqConditions } from './export/questrules'

export interface FlagUse { where: string; quest?: string; node?: string; detail: string }
export interface FlagEntry {
  key: string
  setBy: FlagUse[]
  readBy: FlagUse[]
  types: Set<'bool' | 'number' | 'string'>
  generated: boolean
  /** Set by vanilla or another mod (known from their rules), not by this mod. */
  external: string | null
}

/** Keys worth tracking: $global.*, and quest/mod-prefixed local keys. Engine-provided keys ($option, $id, ...) are skipped. */
const SKIP = /^\$(option|id|isPerson|hasMarket|menuState|faction\.|entity\.|market\.|player\.|person\.|tag:|playerName|fireAllTrigger)/

function typeOf(v: string): 'bool' | 'number' | 'string' {
  if (v === 'true' || v === 'false') return 'bool'
  if (v.trim() !== '' && !isNaN(Number(v))) return 'number'
  return 'string'
}

export function buildRegistry(m: ModModel, handRules: RuleRow[], externalRules: RuleRow[] = []): Map<string, FlagEntry> {
  const reg = new Map<string, FlagEntry>()
  const entry = (key: string): FlagEntry => {
    let e = reg.get(key)
    if (!e) { e = { key, setBy: [], readBy: [], types: new Set(), generated: false, external: null }; reg.set(key, e) }
    return e
  }
  const scanRow = (r: RuleRow, use: Omit<FlagUse, 'detail'>) => {
    for (const c of parseConditions(r.conditions)) {
      if (c.kind === 'memory' && !SKIP.test(c.key)) {
        const e = entry(c.key)
        e.readBy.push({ ...use, detail: c.raw })
        if (c.value !== undefined && !c.value.startsWith('$')) e.types.add(typeOf(c.value))
      } else if (c.kind === 'command' && (c.name === 'SF_AtStep' || c.name === 'SF_QuestDone' || c.name === 'SF_QuestState')) {
        entry(`$global.${c.args[0]}_${c.name === 'SF_AtStep' ? 'step' : 'state'}`).readBy.push({ ...use, detail: c.raw })
      }
    }
    for (const s of parseScript(r.script)) {
      if ((s.kind === 'set' || s.kind === 'incr' || s.kind === 'unset') && !SKIP.test(s.key)) {
        const e = entry(s.key)
        e.setBy.push({ ...use, detail: s.raw })
        if (s.kind === 'set' && !s.value.startsWith('$')) e.types.add(typeOf(s.value))
        if (s.kind === 'incr') e.types.add('number')
      } else if (s.kind === 'command' && (s.name === 'SF_Step' || s.name === 'SF_Start' || s.name === 'SF_End')) {
        entry(`$global.${s.args[0]}_${s.name === 'SF_Step' ? 'step' : 'state'}`).setBy.push({ ...use, detail: s.raw })
      }
    }
    for (const tok of `${r.text}\n${r.options}`.match(TOKEN_RE) ?? []) {
      const k = tok.replace(/\.+$/, '')
      if (k.startsWith('$global.') && !SKIP.test(k)) entry(k).readBy.push({ ...use, detail: 'in text' })
    }
  }
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  for (const q of m.quests) {
    let c
    try { c = compileQuest(q, { sagalib: true, phrases }) } catch { continue }
    for (const r of c.rows) scanRow(r, { where: q.title, quest: q.id, node: c.nodeOf[r.id] })
    for (const g of c.generatedFlags) entry(g.key).generated = true
    // prerequisites read keys too
    for (const l of prereqConditions(q)) scanRow({ id: '', trigger: '', conditions: l, script: '', text: '', options: '', notes: '', sourceId: '', file: '', line: 0 }, { where: `${q.title} (prerequisite)`, quest: q.id, node: 'start' })
    // quest variables are set by SagaLib when the quest starts
    for (const v of q.variables) entry(`$global.${q.id}_${v.name}`).setBy.push({ where: q.title, quest: q.id, detail: `variable (initial ${v.initial})` })
  }
  for (const p of phrases) for (const cs of p.cases) for (const l of cs.when) scanRow({ id: '', trigger: '', conditions: l, script: '', text: '', options: '', notes: '', sourceId: '', file: '', line: 0 }, { where: `phrase ${p.token}` })
  for (const prof of m.testProfiles) for (const k of Object.keys(prof.flags)) if (!reg.has(k)) { /* profiles only use keys; not a definition */ }
  for (const r of handRules) scanRow(r, { where: `rules.csv line ${r.line} (${r.id})` })
  // keys set by vanilla or other mods
  if (externalRules.length) {
    const ext = new Map<string, string>()
    for (const r of externalRules) for (const s of parseScript(r.script)) if (s.kind === 'set' || s.kind === 'incr') if (!ext.has(s.key)) ext.set(s.key, r.sourceId)
    for (const e of reg.values()) if (!e.setBy.length && ext.has(e.key)) e.external = ext.get(e.key)!
  }
  return reg
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
const norm = (k: string) => k.toLowerCase().replace(/_/g, '')

/** The closest key that is set, for "did you mean". */
export function suggest(key: string, reg: Map<string, FlagEntry>): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const e of reg.values()) {
    if (e.key === key || !e.setBy.length) continue
    const d = norm(e.key) === norm(key) ? 0 : editDistance(e.key.toLowerCase(), key.toLowerCase())
    if (d < bestD && d <= Math.max(2, Math.floor(key.length / 8))) { best = e.key; bestD = d }
  }
  return best
}

export function flagProblems(reg: Map<string, FlagEntry>, prefix: string): Problem[] {
  const out: Problem[] = []
  for (const e of reg.values()) {
    const ref = { page: 'saga' as const, id: 'flags', sub: e.key }
    if (e.readBy.length && !e.setBy.length && !e.external && !e.generated) {
      const s = suggest(e.key, reg)
      out.push({
        level: 'warning', area: 'Flags', ref, key: `flagunset:${e.key}`,
        message: `${e.key} is read (${e.readBy[0].where}) but nothing sets it.${s ? ` Did you mean ${s}?` : ''}`,
        fixes: s ? [{ label: `Use ${s}`, action: 'renameFlag', arg: { from: e.key, to: s } }] : undefined
      })
    }
    if (e.setBy.length && !e.readBy.length && !e.generated && e.key.startsWith(`$global.${prefix}`) && !/_(step|state)$/.test(e.key)) {
      out.push({ level: 'info', area: 'Flags', ref, message: `${e.key} is set (${e.setBy[0].where}) but nothing reads it.`, key: `flagunread:${e.key}` })
    }
    if (e.types.size > 1) out.push({ level: 'warning', area: 'Flags', ref, message: `${e.key} is used as ${[...e.types].join(' and ')}.`, key: `flagtypes:${e.key}` })
  }
  return out
}

/** Rename a memory key everywhere in the plans (the flags registry's one-click fix). */
export function renameFlag(m: ModModel, from: string, to: string): void {
  const swap = (s: string) => s.split(from).join(to)
  const lines = (a: string[]) => a.map((l) => (l.includes(from) ? swap(l) : l))
  for (const q of m.quests) {
    for (const r of q.requires) if ('flag' in r && r.flag === from) r.flag = to
    if (q.start.kind === 'option' || q.start.kind === 'trigger') q.start.conditions = lines(q.start.conditions)
    for (const n of q.nodes) {
      if (n.type === 'dialog') {
        n.conditions = lines(n.conditions); n.script = lines(n.script); n.text = swap(n.text)
        for (const o of n.options) { if (o.showIf) o.showIf = lines(o.showIf); if (o.disabledIf) o.disabledIf = lines(o.disabledIf) }
        for (const p of n.phrases) for (const c of p.cases) c.when = lines(c.when)
      } else if (n.type === 'branch') for (const c of n.cases) c.conditions = lines(c.conditions)
      else if (n.type === 'action') for (const op of n.ops) { if ((op.op === 'set' || op.op === 'unset') && op.key === from) op.key = to; if (op.op === 'line') op.line = swap(op.line) }
    }
  }
  for (const p of [...m.phrases, ...m.people.flatMap((x) => x.phrases)]) for (const c of p.cases) c.when = lines(c.when)
  for (const prof of m.testProfiles) if (from in prof.flags) { prof.flags[to] = prof.flags[from]; delete prof.flags[from] }
}
