/**
 * Turning rules into a graph for the Dialog browser (PLAN.md §5, M2): from a starting rule, follow
 * its options (to the DialogOptionSelected rules that answer them) and its FireBest/FireAll lines
 * (to the rules of that trigger), and the rules that lead into it. Drawn lazily per chain.
 */
import { ruleFires, ruleOptionIds, type EngineRule, type RuleSet } from './engine'

export interface ChainNode { id: string; rule: EngineRule; depth: number; truncated: boolean }
export interface ChainEdge { id: string; from: string; to: string; handle: string; label: string; kind: 'option' | 'fire' }

/** Triggers so common that following them would pull in most of the game (shown as a stub). */
const BROAD = new Set(['PopulateOptions', 'OpenInteractionDialog', 'DialogOptionSelected', 'OpenCommLink', 'PickGreeting', 'BeginFleetEncounter'])

export function buildChain(rs: RuleSet, startIds: string[], opts: { maxNodes?: number; maxDepth?: number; back?: boolean } = {}): { nodes: ChainNode[]; edges: ChainEdge[]; stubs: string[] } {
  const maxNodes = opts.maxNodes ?? 80
  const maxDepth = opts.maxDepth ?? 6
  const nodes = new Map<string, ChainNode>()
  const edges: ChainEdge[] = []
  const stubs = new Set<string>()
  const queue: { r: EngineRule; d: number }[] = []
  const add = (r: EngineRule, d: number) => {
    if (nodes.has(r.row.id)) return true
    if (nodes.size >= maxNodes) return false
    nodes.set(r.row.id, { id: r.row.id, rule: r, depth: d, truncated: false })
    queue.push({ r, d })
    return true
  }
  for (const id of startIds) { const r = rs.byId.get(id); if (r) add(r, 0) }
  // one step back: rules whose options lead here, and rules that fire this rule's trigger
  if (opts.back !== false) {
    for (const id of startIds) {
      const r = rs.byId.get(id)
      if (!r) continue
      if (r.option) for (const src of rs.all) if (ruleOptionIds(src).includes(r.option) && src !== r) {
        if (add(src, -1)) edges.push({ id: `${src.row.id}>${r.row.id}:${r.option}`, from: src.row.id, to: r.row.id, handle: `o:${r.option}`, label: r.option, kind: 'option' })
      }
      if (!BROAD.has(r.row.trigger)) for (const src of rs.all) if (ruleFires(src).some((f) => f.trigger === r.row.trigger) && src !== r) {
        if (add(src, -1)) edges.push({ id: `${src.row.id}>${r.row.id}:fire`, from: src.row.id, to: r.row.id, handle: 'fire', label: r.row.trigger, kind: 'fire' })
      }
    }
  }
  while (queue.length) {
    const { r, d } = queue.shift()!
    if (d < 0 || d >= maxDepth) { const n = nodes.get(r.row.id); if (n && d >= maxDepth) n.truncated = true; continue }
    for (const o of ruleOptionIds(r)) {
      for (const t of rs.byOption.get(o) ?? []) {
        if (add(t, d + 1) || nodes.has(t.row.id)) edges.push({ id: `${r.row.id}>${t.row.id}:${o}`, from: r.row.id, to: t.row.id, handle: `o:${o}`, label: o, kind: 'option' })
        else nodes.get(r.row.id)!.truncated = true
      }
    }
    for (const f of ruleFires(r)) {
      let targets = rs.byTrigger.get(f.trigger) ?? []
      if (BROAD.has(f.trigger)) {
        // follow a broad trigger only into rules that share one of this rule's selective conditions
        // (e.g. "$id == rao"), which is how vanilla scopes a person's or entity's own options
        const sel = selective(r)
        targets = sel.length ? targets.filter((t) => t.conds.some((c) => c.kind === 'memory' && c.op === '==' && sel.includes(`${c.key}==${c.value}`))) : []
        if (!targets.length) { stubs.add(f.trigger); continue }
      }
      for (const t of targets) {
        if (add(t, d + 1) || nodes.has(t.row.id)) edges.push({ id: `${r.row.id}>${t.row.id}:${f.cmd}`, from: r.row.id, to: t.row.id, handle: 'fire', label: `${f.cmd} ${f.trigger}`, kind: 'fire' })
        else nodes.get(r.row.id)!.truncated = true
      }
    }
  }
  const seen = new Set<string>()
  return { nodes: [...nodes.values()], edges: edges.filter((e) => !seen.has(e.id) && (seen.add(e.id), true)), stubs: [...stubs] }
}

/** "$key==value" equality conditions of a rule, except $option (it changes every step). */
function selective(r: EngineRule): string[] {
  return r.conds.flatMap((c) => (c.kind === 'memory' && c.op === '==' && !c.negate && c.key !== '$option' ? [`${c.key}==${c.value}`] : []))
}

/** Search rules by id, trigger, option id or text. */
export function searchRules(rs: RuleSet, q: string, limit = 300): EngineRule[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const out: EngineRule[] = []
  for (const r of rs.all) {
    if (r.row.id.toLowerCase().includes(s) || r.row.trigger.toLowerCase() === s || (r.option ?? '').toLowerCase().includes(s) || r.row.text.toLowerCase().includes(s)) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}
