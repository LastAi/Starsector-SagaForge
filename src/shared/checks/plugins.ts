/**
 * #79 (SagaLib 1.4): the mod's own plugin classes (docs/FORMATS.md "Plugins"): Plugin nodes, "Run a
 * plugin" actions in quests, world events and progress stages. The class must be named; the jars the
 * mod's mod_info.json lists are read (ProjectState.jars) to find it; a Plugin node's results must be
 * ids, and an unconnected one takes the "otherwise" path.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { CLASS_NAME_RE, PLUGIN_KEY_RE, PLUGIN_RESERVED, PLUGIN_RESULT_RE, SAGA_PLUGIN_INTERFACE, pluginUses, unquotedOperator } from '../plugins'

export function pluginProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const uses = pluginUses(m)
  const jars = ctx.loaded?.jars
  if (uses.length && jars) {
    if (!jars.length) out.push({ level: 'warning', area: 'Plugins', key: 'pluginnojar', ref: uses[0].ref, message: `The mod runs ${uses.length === 1 ? 'a plugin class' : `${uses.length} plugin calls`} (${uses[0].where}${uses.length > 1 ? ', …' : ''}), but its mod_info.json lists no jar under "jars": the game won't find the class. Build the mod's jar and add it, e.g. "jars": ["jars/${ctx.loaded.modInfo.id}.jar"].` })
    for (const j of jars) if (!j.found) out.push({ level: 'warning', area: 'Plugins', key: `pluginjar:${j.path}`, message: `mod_info.json lists the jar "${j.path}", which isn't in the mod${j.error ? ` (${j.error})` : ''}. Build it first, or the game can't load the mod's plugins.` })
  }
  const known = new Map((jars ?? []).flatMap((j) => j.classes.map((c) => [c.name, { plugin: c.plugin, jar: j.path }] as const)))
  const readable = (jars ?? []).some((j) => j.found)
  for (const u of uses) {
    const cls = u.className.trim()
    if (!cls) { out.push({ level: 'error', area: 'Plugins', key: `pluginnoclass:${u.key}`, ref: u.ref, message: `${u.where}: no plugin class yet. Pick one of the mod's classes (the full name, e.g. data.scripts.MyPlugin).` }); continue }
    if (!CLASS_NAME_RE.test(cls)) { out.push({ level: 'error', area: 'Plugins', key: `pluginbadclass:${u.key}`, ref: u.ref, message: `${u.where}: "${cls}" isn't a Java class name (package.Class, letters, digits, _ and $).` }); continue }
    if (jars?.length && readable) {
      const k = known.get(cls)
      if (!k) out.push({ level: 'warning', area: 'Plugins', key: `pluginclass:${u.key}`, ref: u.ref, message: `${u.where}: the class ${cls} isn't in the mod's jars (${jars.filter((j) => j.found).map((j) => j.path).join(', ')}). In game SagaLib logs an error and the quest takes the "otherwise" path. A typo, a jar not built since, or another mod's class.` })
      else if (!k.plugin) out.push({ level: 'warning', area: 'Plugins', key: `pluginnotplugin:${u.key}`, ref: u.ref, message: `${u.where}: ${cls} (in ${k.jar}) doesn't implement ${SAGA_PLUGIN_INTERFACE}: SagaLib won't run it (it logs an error and the quest takes the "otherwise" path).` })
    }
    const seen = new Set<string>()
    for (const a of u.args) {
      const key = a.key.trim()
      if (!key) { if (a.value.trim()) out.push({ level: 'warning', area: 'Plugins', key: `pluginargnokey:${u.key}`, ref: u.ref, message: `${u.where}: an argument has a value ("${a.value}") but no key; it isn't passed.` }); continue }
      if ((PLUGIN_RESERVED as readonly string[]).includes(key)) out.push({ level: 'error', area: 'Plugins', key: `pluginargres:${u.key}:${key}`, ref: u.ref, message: `${u.where}: the argument key "${key}" is SagaLib's own (where the call comes from); the plugin never gets it. Use another key.` })
      else if (!PLUGIN_KEY_RE.test(key)) out.push({ level: 'error', area: 'Plugins', key: `pluginargkey:${u.key}:${key}`, ref: u.ref, message: `${u.where}: the argument key "${key}" may only use letters, digits, _ and . (no spaces or "=").` })
      if (seen.has(key)) out.push({ level: 'warning', area: 'Plugins', key: `pluginargdup:${u.key}:${key}`, ref: u.ref, message: `${u.where}: the argument "${key}" is given twice; the plugin gets the last one.` })
      seen.add(key)
    }
  }
  // hand-written SF_RunPlugin lines: an "=" outside quotes makes the game refuse the rules at load
  const lineCheck = (l: string, where: string, ref: Problem['ref'], key: string) => {
    const bad = unquotedOperator(l)
    if (bad) out.push({ level: 'error', area: 'Plugins', key: `pluginunquoted:${key}`, ref, message: `${where}: "${bad}" in an SF_RunPlugin line needs double quotes ("${bad.replace(/"/g, '')}"). The game's rule parser refuses "=" (or another operator) outside quotes in a command line, and the game stops while loading the rules.` })
  }
  for (const q of m.quests) {
    if (q.inactive) continue
    for (const n of q.nodes) {
      const ref = { page: 'quests' as const, id: q.id, sub: n.id }
      const where = `${q.title || q.id} › ${(n as { title?: string }).title || n.id}`
      if (n.type === 'dialog') n.script.forEach((l, i) => lineCheck(l, where, ref, `${q.id}:${n.id}:s${i}`))
      if (n.type === 'action') n.ops.forEach((o, i) => { if (o.op === 'line') lineCheck(o.line, where, ref, `${q.id}:${n.id}:${i}`) })
    }
  }
  for (const s of m.events ?? []) for (const e of s.events) for (const part of ['start', 'end'] as const) e[part].forEach((o, i) => { if (o.op === 'line') lineCheck(o.line, `world event ${e.name || e.id} (${part})`, { page: 'saga', id: 'events', sub: s.id }, `ev:${e.id}:${part}:${i}`) })
  for (const p of m.progress ?? []) for (const st of p.stages) for (const o of [...st.actions, ...(st.outcomes ?? []).flatMap((x) => x.actions)]) if (o.op === 'line') lineCheck(o.line, `progress event ${p.name || p.id}, stage ${st.id}`, { page: 'saga', id: 'progress', sub: p.id }, `pr:${p.id}:${st.id}:${o.line}`)

  // a Plugin node's results
  for (const q of m.quests) {
    if (q.inactive) continue
    for (const n of q.nodes) {
      if (n.type !== 'plugin') continue
      const ref = { page: 'quests' as const, id: q.id, sub: n.id }
      const where = `${q.title || q.id} › ${n.title || n.id}`
      const seen = new Set<string>()
      for (const r of n.results) {
        if (!r) { out.push({ level: 'error', area: 'Plugins', key: `pluginresempty:${q.id}:${n.id}`, ref, message: `${where}: a result has no id.` }); continue }
        if (r === 'next') out.push({ level: 'error', area: 'Plugins', key: `pluginresnext:${q.id}:${n.id}`, ref, message: `${where}: "next" can't be a result id (it is the node's "otherwise" output). Use another word.` })
        else if (!PLUGIN_RESULT_RE.test(r)) out.push({ level: 'error', area: 'Plugins', key: `pluginresid:${q.id}:${n.id}:${r}`, ref, message: `${where}: the result "${r}" may only use letters, digits and _ (it is what the plugin returns, compared in a rule condition).` })
        if (seen.has(r)) out.push({ level: 'error', area: 'Plugins', key: `pluginresdup:${q.id}:${n.id}:${r}`, ref, message: `${where}: the result "${r}" is listed twice.` })
        seen.add(r)
        if (r !== 'next' && PLUGIN_RESULT_RE.test(r) && !q.edges.some((e) => e.from === n.id && e.handle === r)) out.push({ level: 'warning', area: 'Plugins', key: `pluginresloose:${q.id}:${n.id}:${r}`, ref: { ...ref, sub: `${n.id}/${r}` }, message: `${where}: the result "${r}" leads nowhere, so it takes the "otherwise" path. Connect it, or remove it.` })
      }
    }
  }
  return out
}
