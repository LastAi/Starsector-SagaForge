/**
 * #67 U43 (user, 2026-11-23): node groups. A group is a definition (JSON) of normal quest nodes with
 * defaults and the fields the author sets; the chart shows a placed group as one node, and the export,
 * Play mode, the Script view and the checks see the normal nodes it stands for (expandGroups). A
 * placed group stays linked to its definition, which the mod carries a copy of
 * (sagaforge/nodegroups/<id>.group.json). Format: docs/FORMATS.md "Node groups".
 *
 * Identity: `id` names the group across its versions (namespaced, e.g. sagaforge.fleet_response);
 * groupHash() identifies one exact version (worked out from the content, never written by hand).
 */
import type { GroupNode, QEdge, QNode, QuestPlan } from './model'
import type { ModModel } from './serialize'

export const GROUP_FORMAT = 1
export const GROUP_FILE_SUFFIX = '.group.json'
export const groupFile = (id: string) => `sagaforge/nodegroups/${id}${GROUP_FILE_SUFFIX}`
/** Group ids: lowercase words joined by dots (the first word is the namespace: an author's or a mod's prefix). */
export const GROUP_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/
/** Expanded node ids are "<instance>__<node in the group>". */
export const GROUP_SEP = '__'

export type GroupFieldType = 'text' | 'longtext' | 'number' | 'bool' | 'choice' | 'faction' | 'person' | 'encounter' | 'item' | 'quest' | 'place'
export const GROUP_FIELD_TYPES: GroupFieldType[] = ['text', 'longtext', 'number', 'bool', 'choice', 'faction', 'person', 'encounter', 'item', 'quest', 'place']
export type GroupValue = string | number | boolean

export interface GroupField {
  key: string
  label: string
  type: GroupFieldType
  default?: GroupValue
  /** choice: the values, plain or with a label. */
  options?: (string | { value: string; label: string })[]
  help?: string
  /** Must be set when placed (no default counts). */
  required?: boolean
}
/** A named output of the group: where an edge from the placed node's exit dot leaves inside. */
export interface GroupExit { key: string; label: string; node: string; handle: string }

export interface NodeGroupDef {
  format?: number
  id: string
  label: string
  description?: string
  /** Bumped by the author when the group changes; `changes` says what changed (shown on Replace). */
  version?: number
  changes?: string
  /** What the group needs (shown; SagaLib commands also make the mod need SagaLib, as anywhere). */
  requires?: { sagalib?: string; game?: string }
  /** The placed node's card text, with {{field}} (a choice shows its label). */
  summary?: string
  fields: GroupField[]
  /** The node incoming edges go to. */
  entry: string
  exits: GroupExit[]
  /** Normal quest nodes (no Start, no groups); any object may have "if": "<field> == <value>". */
  nodes: Record<string, unknown>[]
  edges: { from: string; handle: string; to: string }[]
}

/** Fields every group gets without showing them: the mod's prefix, the placed node's id, the quest's id. */
export const AUTO_FIELDS = ['prefix', 'instance', 'quest'] as const

// ------------------------------------------------------------------ identity

/** JSON with sorted keys, so key order and formatting don't change the hash. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** cyrb53: a fast 53-bit string hash (no crypto needed in the renderer). */
function cyrb53(s: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** One exact version of a group: 14 hex digits from its canonical content. */
export function groupHash(d: NodeGroupDef): string {
  return cyrb53(canonicalJson(d)).toString(16).padStart(14, '0')
}

/**
 * How `other` relates to `mine` (same id): same content; newer (a higher version); older; or a
 * modified copy (same version, other content).
 */
export function compareGroups(mine: NodeGroupDef, other: NodeGroupDef): 'same' | 'newer' | 'older' | 'modified' {
  if (groupHash(mine) === groupHash(other)) return 'same'
  const a = mine.version ?? 1, b = other.version ?? 1
  return b > a ? 'newer' : b < a ? 'older' : 'modified'
}

/** Where a group can come from, in the order the editor shows them. */
export type GroupSource = 'mod' | 'builtin' | 'library'
export interface GroupEntry { def: NodeGroupDef; source: GroupSource; hash: string; file?: string }

/**
 * The groups offered in + Node, one per id: the mod's copy if it has one, else the built-in, else the
 * library's (the highest version). Same id and hash are the same group, shown once.
 */
export function groupChoices(mod: NodeGroupDef[], builtin: NodeGroupDef[], library: GroupEntry[]): GroupEntry[] {
  const out = new Map<string, GroupEntry>()
  const add = (e: GroupEntry) => {
    const was = out.get(e.def.id)
    if (!was || (was.source !== 'mod' && (e.def.version ?? 1) > (was.def.version ?? 1))) out.set(e.def.id, e)
  }
  for (const d of mod) add({ def: d, source: 'mod', hash: groupHash(d) })
  for (const d of builtin) add({ def: d, source: 'builtin', hash: groupHash(d) })
  for (const e of library) add(e)
  return [...out.values()].sort((a, b) => a.def.label.localeCompare(b.def.label))
}

/** Newer or different versions of the mod's copy of `id` (built-in or library), for Replace. */
export function otherVersions(id: string, mod: NodeGroupDef[], builtin: NodeGroupDef[], library: GroupEntry[]): (GroupEntry & { relation: 'newer' | 'older' | 'modified' })[] {
  const mine = mod.find((d) => d.id === id)
  if (!mine) return []
  const seen = new Set([groupHash(mine)])
  const out: (GroupEntry & { relation: 'newer' | 'older' | 'modified' })[] = []
  for (const e of [...builtin.map((d): GroupEntry => ({ def: d, source: 'builtin', hash: groupHash(d) })), ...library]) {
    if (e.def.id !== id || seen.has(e.hash)) continue
    seen.add(e.hash)
    const r = compareGroups(mine, e.def)
    if (r !== 'same') out.push({ ...e, relation: r })
  }
  return out
}

// ------------------------------------------------------------------ fields

export const optionValue = (o: string | { value: string; label: string }) => (typeof o === 'string' ? o : o.value)
export const optionLabel = (o: string | { value: string; label: string }) => (typeof o === 'string' ? o : o.label)

export function fieldDefault(f: GroupField): GroupValue {
  if (f.default !== undefined) return f.default
  if (f.type === 'bool') return false
  if (f.type === 'number') return 0
  if (f.type === 'choice' && f.options?.length) return optionValue(f.options[0])
  return ''
}

/** The placed node's values with the definition's defaults filled in (only the definition's fields). */
export function groupValues(inst: GroupNode, def: NodeGroupDef): Record<string, GroupValue> {
  const out: Record<string, GroupValue> = {}
  for (const f of def.fields) out[f.key] = inst.values?.[f.key] ?? fieldDefault(f)
  return out
}

/** The text shown on the placed node's card. */
export function groupSummary(inst: GroupNode, def: NodeGroupDef | undefined): string {
  if (!def) return ''
  const v = groupValues(inst, def)
  const tpl = def.summary ?? def.fields.slice(0, 2).map((f) => `{{${f.key}}}`).join(' · ')
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)(?::label)?\s*\}\}/g, (_m, k: string) => {
    const f = def.fields.find((x) => x.key === k)
    const val = v[k]
    if (f?.type === 'choice') { const o = f.options?.find((x) => optionValue(x) === String(val)); return o ? optionLabel(o) : String(val ?? '') }
    if (f?.type === 'bool') return val ? f.label : ''
    return val === undefined ? '' : String(val)
  }).trim()
}

// ------------------------------------------------------------------ expansion

/** "key", "!key", "key == v", "key != v", joined with && and ||. */
export function evalIf(expr: string, v: Record<string, GroupValue>): boolean {
  return expr.split('||').some((alt) => alt.split('&&').every((t) => {
    const s = t.trim()
    const m = /^([a-zA-Z0-9_]+)\s*(==|!=)\s*(.*)$/.exec(s)
    if (m) { const eq = String(v[m[1]] ?? '') === m[3].trim().replace(/^["']|["']$/g, ''); return m[2] === '==' ? eq : !eq }
    if (s.startsWith('!')) return !truthy(v[s.slice(1).trim()])
    return truthy(v[s])
  }))
}
const truthy = (x: GroupValue | undefined) => !(x === undefined || x === false || x === '' || x === 0 || x === 'false')

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** A copy of `v` with {{field}} filled in and objects whose "if" is false left out (the "if" keys go). */
export function fillTemplate(v: unknown, vals: Record<string, GroupValue>): unknown {
  if (typeof v === 'string') {
    const whole = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(v)
    if (whole && whole[1] in vals) return vals[whole[1]]
    return v.replace(TOKEN, (m, k: string) => (k in vals ? String(vals[k]) : m))
  }
  if (Array.isArray(v)) return v.filter((x) => !isOff(x, vals)).map((x) => fillTemplate(x, vals))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      if (k === 'if') continue
      if (x && typeof x === 'object' && !Array.isArray(x) && isOff(x, vals)) continue
      out[k] = fillTemplate(x, vals)
    }
    return out
  }
  return v
}
const isOff = (x: unknown, vals: Record<string, GroupValue>) => !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as { if?: unknown }).if === 'string' && !evalIf((x as { if: string }).if, vals)

/** The {{tokens}} a definition uses. */
export function tokensOf(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') for (const m of v.matchAll(TOKEN)) out.add(m[1])
  else if (Array.isArray(v)) v.forEach((x) => tokensOf(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k !== 'if' || typeof x !== 'string') { tokensOf(x, out); continue }
      // the field is what stands left of == / != (or after !)
      for (const t of x.split(/\|\||&&/)) { const w = /^\s*!?\s*([a-zA-Z0-9_]+)/.exec(t); if (w) out.add(`if:${w[1]}`) }
    }
  }
  return out
}

export interface Expansion { nodes: QNode[]; edges: QEdge[]; entry: string | null; exits: Map<string, { node: string; handle: string }> }

/** The normal nodes and edges one placed group stands for (ids "<instance>__<node>"). */
export function expandInstance(q: QuestPlan, inst: GroupNode, def: NodeGroupDef, prefix: string): Expansion {
  const vals: Record<string, GroupValue> = { ...groupValues(inst, def), prefix, instance: inst.id, quest: q.id }
  const pid = (local: string) => `${inst.id}${GROUP_SEP}${local}`
  const nodes: QNode[] = []
  const optionIds = new Map<string, Set<string>>()
  def.nodes.forEach((raw, i) => {
    if (isOff(raw, vals)) return
    const n = fillTemplate(raw, vals) as Record<string, unknown> & { id: string; type: string }
    const local = String(n.id)
    n.id = pid(local)
    n.x = inst.x + (typeof n.x === 'number' ? n.x : i * 260)
    n.y = inst.y + (typeof n.y === 'number' ? n.y : 0)
    // option ids are the quest's: one per placed group
    if (n.type === 'dialog' && Array.isArray(n.options)) {
      const ids = new Set<string>()
      for (const o of n.options as { id: string }[]) { ids.add(o.id); o.id = pid(o.id) }
      optionIds.set(local, ids)
    }
    if (n.type === 'link' && n.mode === 'node' && def.nodes.some((x) => x.id === n.target)) n.target = pid(String(n.target))
    nodes.push(n as unknown as QNode)
  })
  const kept = new Set(nodes.map((n) => n.id))
  const handle = (local: string, h: string) => (optionIds.get(local)?.has(h) ? pid(h) : h)
  const edges: QEdge[] = []
  def.edges.forEach((e, i) => {
    if (!kept.has(pid(e.from)) || !kept.has(pid(e.to))) return
    edges.push({ id: pid(`e${i}`), from: pid(e.from), handle: handle(e.from, e.handle), to: pid(e.to) })
  })
  const exits = new Map<string, { node: string; handle: string }>()
  for (const x of def.exits) if (kept.has(pid(x.node))) exits.set(x.key, { node: pid(x.node), handle: handle(x.node, x.handle) })
  return { nodes, edges, entry: kept.has(pid(def.entry)) ? pid(def.entry) : null, exits }
}

/** The quest with every placed group replaced by its normal nodes (unknown groups are left out). */
export function expandGroups(q: QuestPlan, defs: NodeGroupDef[] | undefined, prefix = ''): QuestPlan {
  if (!q.nodes.some((n) => n.type === 'group')) return q
  const byId = new Map((defs ?? []).map((d) => [d.id, d]))
  const nodes: QNode[] = []
  let edges = q.edges.slice()
  for (const n of q.nodes) {
    if (n.type !== 'group') { nodes.push(n); continue }
    const def = byId.get(n.group)
    const ex = def ? expandInstance(q, n, def, prefix) : null
    nodes.push(...(ex?.nodes ?? []))
    edges = edges.flatMap((e): QEdge[] => {
      if (e.to === n.id) return ex?.entry ? [{ ...e, to: ex.entry }] : []
      if (e.from === n.id) { const x = ex?.exits.get(e.handle); return x ? [{ ...e, from: x.node, handle: x.handle }] : [] }
      return [e]
    })
    edges.push(...(ex?.edges ?? []))
  }
  // a Link to the placed node goes to its entry
  const entries = new Map(q.nodes.filter((n): n is GroupNode => n.type === 'group').map((n) => { const d = byId.get(n.group); return [n.id, d ? `${n.id}${GROUP_SEP}${d.entry}` : ''] as const }))
  const out = nodes.map((n) => (n.type === 'link' && n.mode === 'node' && entries.has(n.target) ? { ...n, target: entries.get(n.target)! } : n))
  return { ...q, nodes: out, edges }
}

/** The model with every quest's placed groups expanded (export and checks). */
export function expandModelGroups(m: ModModel): ModModel {
  if (!m.quests.some((q) => q.nodes.some((n) => n.type === 'group'))) return m
  return { ...m, quests: m.quests.map((q) => expandGroups(q, m.nodeGroups, m.project.prefix)) }
}

/** The chart node an expanded node id belongs to (its placed group), for problems and Play. */
export function chartNodeOf(id: string): string {
  const i = id.indexOf(GROUP_SEP)
  return i > 0 ? id.slice(0, i) : id
}

/**
 * Expand into nodes (one way): the placed group is replaced by its normal nodes in the quest, edges
 * joined. Returns the new nodes' ids (empty when the definition is missing).
 */
export function ungroup(q: QuestPlan, instId: string, defs: NodeGroupDef[], prefix: string): string[] {
  const inst = q.nodes.find((n): n is GroupNode => n.id === instId && n.type === 'group')
  const def = inst && defs.find((d) => d.id === inst.group)
  if (!inst || !def) return []
  const one = expandGroups({ ...q, nodes: [inst], edges: q.edges.filter((e) => e.from === instId || e.to === instId) }, [def], prefix)
  // readable ids: "<instance>_<node>" where free
  const taken = new Set(q.nodes.filter((n) => n.id !== instId).map((n) => n.id))
  const rename = new Map<string, string>()
  for (const n of one.nodes) {
    let id = n.id.replace(GROUP_SEP, '_')
    for (let i = 2; taken.has(id); i++) id = `${n.id.replace(GROUP_SEP, '_')}_${i}`
    taken.add(id)
    rename.set(n.id, id)
  }
  const r = (id: string) => rename.get(id) ?? id
  const added = one.nodes.map((n) => {
    const c = { ...n, id: r(n.id) } as QNode
    if (c.type === 'link' && c.mode === 'node') c.target = r(c.target)
    return c
  })
  const others = q.edges.filter((e) => e.from !== instId && e.to !== instId)
  q.nodes = [...q.nodes.filter((n) => n.id !== instId), ...added]
  q.edges = [...others, ...one.edges.map((e) => ({ ...e, from: r(e.from), to: r(e.to) }))]
  for (const n of q.nodes) if (n.type === 'link' && n.mode === 'node' && n.target === instId) n.target = r(`${instId}${GROUP_SEP}${def.entry}`)
  return added.map((n) => n.id)
}

// ------------------------------------------------------------------ replace

export interface ReplacePlan {
  kept: string[]
  added: string[]
  dropped: string[]
  /** Exits the placed nodes use that the new version doesn't have: their connections go. */
  lostExits: { quest: string; node: string; exit: string }[]
  /** Values that no longer fit (a choice value the new version doesn't list, another type): reset to the default. */
  reset: string[]
}

/** What replacing the mod's copy `from` with `to` does to the placed groups (matched by field key). */
export function replacePlan(m: ModModel, from: NodeGroupDef, to: NodeGroupDef): ReplacePlan {
  const ok = (f: GroupField) => { const n = to.fields.find((x) => x.key === f.key); return !!n && n.type === f.type }
  const kept = from.fields.filter(ok).map((f) => f.key)
  const added = to.fields.filter((f) => !from.fields.some((x) => x.key === f.key)).map((f) => f.key)
  const dropped = from.fields.filter((f) => !ok(f)).map((f) => f.key)
  const exits = new Set(to.exits.map((x) => x.key))
  const lostExits: ReplacePlan['lostExits'] = []
  const reset = new Set<string>()
  for (const q of m.quests) for (const n of q.nodes) {
    if (n.type !== 'group' || n.group !== from.id) continue
    for (const e of q.edges) if (e.from === n.id && !exits.has(e.handle)) lostExits.push({ quest: q.id, node: n.id, exit: e.handle })
    for (const k of kept) {
      const f = to.fields.find((x) => x.key === k)!
      const v = n.values?.[k]
      if (v !== undefined && f.type === 'choice' && !f.options?.some((o) => optionValue(o) === String(v))) reset.add(k)
    }
  }
  return { kept, added, dropped, lostExits, reset: [...reset] }
}

/** Replace the mod's copy of `to.id` and update its placed nodes (values by key; lost exits' edges go). */
export function applyReplace(m: ModModel, to: NodeGroupDef): void {
  const from = (m.nodeGroups ?? []).find((d) => d.id === to.id)
  m.nodeGroups = [...(m.nodeGroups ?? []).filter((d) => d.id !== to.id), structuredClone(to)]
  if (!from) return
  const plan = replacePlan(m, from, to)
  const exits = new Set(to.exits.map((x) => x.key))
  for (const q of m.quests) {
    const placed = new Set<string>()
    for (const n of q.nodes) {
      if (n.type !== 'group' || n.group !== to.id) continue
      placed.add(n.id)
      const v: Record<string, GroupValue> = {}
      for (const k of plan.kept) if (n.values?.[k] !== undefined && !plan.reset.includes(k)) v[k] = n.values[k]
      n.values = v
    }
    if (placed.size) q.edges = q.edges.filter((e) => !placed.has(e.from) || exits.has(e.handle))
  }
}

// ------------------------------------------------------------------ checks

const NODE_TYPES = new Set(['dialog', 'branch', 'action', 'stage', 'encounter', 'wait', 'raid', 'end', 'link', 'note', 'plugin', 'fight'])

/** What's wrong with a definition (empty = fine). Also used by Import. */
export function groupDefProblems(d: unknown): string[] {
  const out: string[] = []
  if (!d || typeof d !== 'object') return ['Not a node group (not a JSON object).']
  const g = d as Partial<NodeGroupDef>
  if (typeof g.id !== 'string' || !GROUP_ID.test(g.id)) out.push(`Its id "${g.id ?? ''}" must be namespaced lowercase words joined by dots, e.g. "toc.pay_or_fight".`)
  if (typeof g.label !== 'string' || !g.label.trim()) out.push('It has no label.')
  if (g.format !== undefined && g.format > GROUP_FORMAT) out.push(`It was made by a newer Saga Forge (group format ${g.format}).`)
  const head = out.length
  if (!Array.isArray(g.fields)) out.push('"fields" must be a list.')
  if (!Array.isArray(g.nodes) || !g.nodes.length) out.push('It has no nodes.')
  if (!Array.isArray(g.edges)) out.push('"edges" must be a list.')
  if (!Array.isArray(g.exits)) out.push('"exits" must be a list.')
  if (out.length > head) return out
  const ids = new Set<string>()
  for (const n of g.nodes!) {
    const id = String(n.id ?? '')
    if (!/^[a-z0-9_]+$/.test(id)) out.push(`Node id "${id}" may only use lowercase letters, digits and _.`)
    else if (ids.has(id)) out.push(`Two nodes are "${id}".`)
    ids.add(id)
    if (n.type === 'group') out.push(`Node "${id}" is a group: groups can't hold groups.`)
    else if (n.type === 'start') out.push(`Node "${id}" is a Start node: a group is placed inside a quest, which has its own start.`)
    else if (!NODE_TYPES.has(String(n.type))) out.push(`Node "${id}" has an unknown type "${String(n.type)}".`)
  }
  if (!ids.has(String(g.entry ?? ''))) out.push(`Its entry "${g.entry ?? ''}" isn't one of its nodes.`)
  for (const e of g.edges!) if (!ids.has(e.from) || !ids.has(e.to)) out.push(`An edge ${e.from} › ${e.to} names a node the group doesn't have.`)
  const keys = new Set<string>()
  for (const f of g.fields!) {
    if (!/^[a-zA-Z0-9_]+$/.test(String(f.key ?? ''))) out.push(`Field key "${f.key}" may only use letters, digits and _.`)
    if (keys.has(f.key)) out.push(`Two fields are "${f.key}".`)
    if ((AUTO_FIELDS as readonly string[]).includes(f.key)) out.push(`Field "${f.key}" is filled in automatically; use another key.`)
    keys.add(f.key)
    if (!GROUP_FIELD_TYPES.includes(f.type)) out.push(`Field "${f.key}" has an unknown type "${f.type}".`)
    if (f.type === 'choice' && !f.options?.length) out.push(`Choice field "${f.key}" lists no options.`)
    if (f.type === 'choice' && f.default !== undefined && !f.options?.some((o) => optionValue(o) === String(f.default))) out.push(`Choice field "${f.key}": its default "${f.default}" isn't one of its options.`)
  }
  const exitKeys = new Set<string>()
  for (const x of g.exits!) {
    if (exitKeys.has(x.key)) out.push(`Two exits are "${x.key}".`)
    exitKeys.add(x.key)
    if (!ids.has(x.node)) out.push(`Exit "${x.key}" leaves from "${x.node}", which isn't one of its nodes.`)
  }
  for (const t of tokensOf(g.nodes)) {
    const k = t.startsWith('if:') ? t.slice(3) : t
    if (!keys.has(k) && !(AUTO_FIELDS as readonly string[]).includes(k)) out.push(`Its nodes use ${t.startsWith('if:') ? `"${k}" in an "if"` : `{{${k}}}`}, which isn't one of its fields.`)
  }
  return out
}

/** The rules.csv lines a group can write (for Import's "what it writes"), every "if" taken. */
export function groupLines(d: NodeGroupDef): string[] {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.op === 'line' && typeof o.line === 'string') out.add(o.line)
      if (o.op === 'set' && typeof o.key === 'string') out.add(`${o.key} = ${String(o.value ?? '')}`)
      if (typeof o.script === 'string') for (const l of o.script.split('\n')) if (l.trim()) out.add(l.trim())
      Object.values(o).forEach(walk)
    }
  }
  walk(d.nodes)
  return [...out]
}

/** Problems of the placed groups in a quest (before expansion). */
export function groupInstanceProblems(q: QuestPlan, defs: NodeGroupDef[] | undefined): { level: 'error' | 'warning'; node: string; key: string; message: string }[] {
  const out: { level: 'error' | 'warning'; node: string; key: string; message: string }[] = []
  for (const n of q.nodes) {
    if (n.type !== 'group') continue
    const def = defs?.find((d) => d.id === n.group)
    if (!def) { out.push({ level: 'error', node: n.id, key: `group:${q.id}:${n.id}`, message: `"${n.title || n.id}" is node group "${n.group}", which the mod doesn't have (sagaforge/nodegroups). Import it again or remove the node.` }); continue }
    for (const f of def.fields) {
      const v = n.values?.[f.key] ?? f.default
      if (f.required && (v === undefined || v === '')) out.push({ level: 'error', node: n.id, key: `groupfield:${q.id}:${n.id}:${f.key}`, message: `"${n.title || def.label}": ${f.label} isn't set.` })
    }
    const unknown = Object.keys(n.values ?? {}).filter((k) => !def.fields.some((f) => f.key === k))
    if (unknown.length) out.push({ level: 'warning', node: n.id, key: `groupold:${q.id}:${n.id}`, message: `"${n.title || def.label}" has values the group no longer has: ${unknown.join(', ')}. They are ignored.` })
    const exits = new Set(def.exits.map((x) => x.key))
    for (const e of q.edges) if (e.from === n.id && !exits.has(e.handle)) out.push({ level: 'warning', node: n.id, key: `groupexit:${q.id}:${n.id}:${e.handle}`, message: `"${n.title || def.label}": a connection leaves from exit "${e.handle}", which the group doesn't have. It is ignored.` })
  }
  return out
}
