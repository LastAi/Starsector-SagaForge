/**
 * #79 (SagaLib 1.4): the mod's own plugin classes (docs/FORMATS.md "Plugins"; SagaLib FORMAT.md
 * "Plugins"). A quest's Plugin node, an Action's "Run a plugin", a world event or a progress stage
 * runs a class from a jar the mod's mod_info.json lists, through SagaLib's
 * `SF_RunPlugin <className> [quest=<q> node=<n>] [key=value ...]`. What it returns is stored in
 * $global.<quest>_<node>_result and the exported rules branch on it. Reading the line and the result
 * here is the same as SagaLib's core/Plugins.java (golden case plugins.json).
 */
import type { ActionOp, PluginArg, QuestPlan } from './model'
import type { JarInfo } from './project'

/** Where the result goes when a line names no quest and node (a world event, a hand-written line). */
export const PLUGIN_LOCAL_RESULT = '$sagaforge_plugin_result'
/** SagaLib's own keys in the line (where the call comes from); never passed to the plugin. */
export const PLUGIN_RESERVED = ['quest', 'node'] as const
/** The SagaLib interface a plugin class implements. */
export const SAGA_PLUGIN_INTERFACE = 'lastai.sagalib.api.SagaPlugin'
/** A Java class's full name (a nested class with $). */
export const CLASS_NAME_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/
/** An argument key the line can carry bare (letters, digits, _ and .). */
export const PLUGIN_KEY_RE = /^[A-Za-z0-9_.]+$/
/** A declared result id: it is a rule condition's value and the node's output handle. */
export const PLUGIN_RESULT_RE = /^[A-Za-z0-9_]+$/

export const pluginResultKey = (quest: string, node: string): string => `$global.${quest}_${node}_result`
/** The trigger a Plugin node with declared results fires after the plugin ran; its rules test the result. */
export const pluginResultTrigger = (quest: string, node: string): string => `${quest}_${node}_result`

/**
 * One argument as a token: always the whole "key=value" in double quotes. The game's tokenizer makes
 * an unquoted "=" an operator, and its rule parser refuses an operator in a command line while
 * loading the rules (RuleException "Operators (except for '!') not allowed in command invocations";
 * javap 0.98a-RC8, FORMATS.md "Plugins"). A quote inside becomes ' (rules.csv can't escape one).
 */
export function pluginToken(key: string, value: string): string {
  return `"${`${key}=${value}`.replace(/"/g, "'")}"`
}

/** The SF_RunPlugin line: the class, where it comes from (a quest's node), then the arguments (empty keys skipped). */
export function pluginLine(className: string, args: PluginArg[], where?: { quest: string; node: string }): string {
  const parts = ['SF_RunPlugin', className.trim()]
  if (where) parts.push(pluginToken('quest', where.quest), pluginToken('node', where.node))
  for (const a of args) if (a.key.trim()) parts.push(pluginToken(a.key.trim(), a.value))
  return parts.join(' ')
}

/**
 * #79: a hand-written SF_RunPlugin line with an "=" outside double quotes: the game refuses the whole
 * rules file while loading (see pluginToken). null when the line is fine or isn't SF_RunPlugin.
 */
export function unquotedOperator(line: string): string | null {
  const l = line.trim()
  if (!/^SF_RunPlugin\b/.test(l)) return null
  let quoted = false
  for (let i = 0; i < l.length; i++) {
    const c = l[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && /[=<>!]/.test(c)) return l.slice(Math.max(0, l.lastIndexOf(' ', i) + 1), l.indexOf(' ', i) < 0 ? undefined : l.indexOf(' ', i))
  }
  return null
}

/** One SF_RunPlugin line, read (as SagaLib's Plugins.Call). */
export interface PluginCall { className: string; quest: string | null; node: string | null; args: Record<string, string> }

/** A memory value as text (SagaLib's Values.str: 3, not 3.0; missing = ""). */
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/**
 * The line's arguments (class name first; quotes already removed): key=value split at the first
 * "=", a bare word is "true", a value starting with "$" is read from memory (missing = ""); quest
 * and node are SagaLib's. null without a class name. As SagaLib's Plugins.parse.
 */
export function parsePluginCall(tokens: string[], get: (key: string) => unknown): PluginCall | null {
  const cls = tokens[0]?.trim()
  if (!cls) return null
  let quest: string | null = null
  let node: string | null = null
  const args: Record<string, string> = {}
  for (const t of tokens.slice(1)) {
    if (!t) continue
    const eq = t.indexOf('=')
    const key = (eq < 0 ? t : t.slice(0, eq)).trim()
    let value = eq < 0 ? 'true' : t.slice(eq + 1)
    if (!key) continue
    if (value.startsWith('$')) value = str(get(value.trim()))
    if (key === 'quest') quest = value.trim() || null
    else if (key === 'node') node = value.trim() || null
    else args[key] = value
  }
  return { className: cls, quest, node, args }
}

/** Where a call's result goes: $global.<quest>_<node>_result with both, else the local key. */
export const callResultKey = (c: PluginCall): string => (c.quest && c.node ? pluginResultKey(c.quest, c.node) : PLUGIN_LOCAL_RESULT)

/** What a plugin returned, as stored: trimmed; null or blank = no result. */
export function normalizePluginResult(r: unknown): string | null {
  if (r === null || r === undefined) return null
  const s = String(r).trim()
  return s || null
}

/** The class's short name for notes ("ShrinkMarkets" of data.scripts.hel.ShrinkMarkets). */
export const shortClass = (cls: string): string => cls.trim().split('.').pop() || cls.trim() || '?'

/** "key=value, …" for notes. */
export const argsText = (args: PluginArg[]): string => args.filter((a) => a.key.trim()).map((a) => `${a.key.trim()}=${a.value}`).join(', ')

/** Every plugin call of the mod: Plugin nodes, Action ops (quests), world events and progress stages. */
export interface PluginUse {
  className: string
  args: PluginArg[]
  where: string
  ref: { page: 'quests' | 'saga' | 'encounters'; id: string; sub?: string }
  quest?: QuestPlan
  node?: string
  key: string
}

interface PluginModel {
  quests: QuestPlan[]
  events?: { id: string; name?: string; events: { id: string; name?: string; start: ActionOp[]; end: ActionOp[] }[] }[]
  progress?: { id: string; name?: string; stages: { id: string; actions: ActionOp[]; outcomes?: { id: string; actions: ActionOp[] }[] }[] }[]
  encounters?: { id: string; name?: string; onDefeated?: ActionOp[]; onAvoided?: ActionOp[] }[]
}

export function pluginUses(m: PluginModel, activeOnly = true): PluginUse[] {
  const out: PluginUse[] = []
  for (const q of m.quests) {
    if (activeOnly && q.inactive) continue
    for (const n of q.nodes) {
      const where = `${q.title || q.id} › ${(n as { title?: string }).title || n.id}`
      if (n.type === 'plugin') out.push({ className: n.className, args: n.args, where, ref: { page: 'quests', id: q.id, sub: n.id }, quest: q, node: n.id, key: `${q.id}:${n.id}` })
      if (n.type === 'action') n.ops.forEach((o, i) => { if (o.op === 'plugin') out.push({ className: o.className, args: o.args, where: `${where} (Run a plugin)`, ref: { page: 'quests', id: q.id, sub: n.id }, quest: q, node: n.id, key: `${q.id}:${n.id}:${i}` }) })
    }
  }
  for (const s of m.events ?? []) for (const e of s.events) for (const part of ['start', 'end'] as const) e[part].forEach((o, i) => {
    if (o.op === 'plugin') out.push({ className: o.className, args: o.args, where: `world event ${e.name || e.id} (${part})`, ref: { page: 'saga', id: 'events', sub: s.id }, key: `ev:${e.id}:${part}:${i}` })
  })
  for (const p of m.progress ?? []) for (const st of p.stages) {
    const lists: [string, ActionOp[]][] = st.outcomes?.length ? st.outcomes.map((o) => [`${st.id}/${o.id}`, o.actions]) : [[st.id, st.actions]]
    for (const [at, ops] of lists) ops.forEach((o, i) => {
      if (o.op === 'plugin') out.push({ className: o.className, args: o.args, where: `progress event ${p.name || p.id}, stage ${at}`, ref: { page: 'saga', id: 'progress', sub: p.id }, key: `pr:${p.id}:${at}:${i}` })
    })
  }
  // #67 U46: an encounter's own outcome actions
  for (const e of m.encounters ?? []) for (const [part, ops] of [['defeated', e.onDefeated ?? []], ['avoided', e.onAvoided ?? []]] as const) ops.forEach((o, i) => {
    if (o.op === 'plugin') out.push({ className: o.className, args: o.args, where: `encounter ${e.name || e.id} (when ${part})`, ref: { page: 'encounters', id: e.id }, key: `enc:${e.id}:${part}:${i}` })
  })
  return out
}

/** The mod runs plugins: a Plugin node, a "Run a plugin" op, or an SF_RunPlugin line it wrote itself (SagaLib 1.4). */
export function usesPlugins(m: PluginModel): boolean {
  if (pluginUses(m).length) return true
  return m.quests.some((q) => !q.inactive && /SF_RunPlugin/.test(JSON.stringify(q.nodes))) ||
    /SF_RunPlugin/.test(JSON.stringify([m.events ?? [], m.progress ?? [], (m.encounters ?? []).map((e) => [e.onDefeated, e.onAvoided])]))
}

/** Class choices for the picker: plugin classes first (with their jar), then the jars' other classes. */
export function pluginClassChoices(jars: JarInfo[] | undefined): { id: string; name: string }[] {
  const all = (jars ?? []).flatMap((j) => j.classes.map((c) => ({ ...c, jar: j.path })))
  return [
    ...all.filter((c) => c.plugin).map((c) => ({ id: c.name, name: `plugin · ${c.jar}` })),
    ...all.filter((c) => !c.plugin).map((c) => ({ id: c.name, name: `not a SagaPlugin · ${c.jar}` }))
  ]
}

/** Renames a declared result of a Plugin node and moves its link (the output's handle is the result id). */
export function renamePluginResult(q: QuestPlan, nodeId: string, from: string, to: string): void {
  const n = q.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'plugin' || from === to) return
  n.results = n.results.map((r) => (r === from ? to : r))
  for (const e of q.edges) if (e.from === nodeId && e.handle === from) e.handle = to
}

/** Removes a declared result and its link. */
export function removePluginResult(q: QuestPlan, nodeId: string, result: string): void {
  const n = q.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'plugin') return
  n.results = n.results.filter((r) => r !== result)
  if (!n.results.includes(result)) q.edges = q.edges.filter((e) => !(e.from === nodeId && e.handle === result))
}
