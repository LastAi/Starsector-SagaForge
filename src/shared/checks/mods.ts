/**
 * #60 (PLAN.md §10.1, §10.2): checks of the mod's list of other mods and of conditional content.
 * Live: unlisted and incompatible mods in use, game-loaded rows pointing at an optional mod, node
 * references to an optional mod outside a guard, every combination of the optional mods (no node
 * left without options, no Branch without a case), the load order of patches. Check mod (with every
 * rule): an optional mod's own rule commands, its text tokens in unguarded rules.
 */
import type { Problem, ProblemFix } from '../api'
import type { CheckContext } from './index'
import type { ModModel } from '../serialize'
import type { DialogNode, ModUse, QuestPlan } from '../model'
import { modUses, effectiveConds, nodeGuards, sharedWithUnconditional, type ItemConds, type ModUseSite } from '../moduses'
import { addCond, combinations, comboText, condText, CORE_ID, holds, isNone, noConds, optionalMods, SAGALIB_ID, useOf, type EffConds } from '../modlist'
import { parseCondition, parseScriptLine, TOKEN_RE } from '../rules/parse'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function modFixes(id: string, name: string, suggestOptional: boolean): ProblemFix[] {
  const req = { label: 'Add as required', action: 'modAdd', arg: { id, name, use: 'required' } }
  const opt = { label: 'Add as optional', action: 'modAdd', arg: { id, name, use: 'optional' } }
  return suggestOptional ? [opt, req] : [req, opt]
}

export function modProblems(ctx: CheckContext): Problem[] {
  const { model: m, index, loaded } = ctx
  const out: Problem[] = []
  const name = (id: string) => m.project.mods?.find((x) => x.id === id)?.name ?? index.sources.find((s) => s.id === id)?.name ?? id
  const uses = modUses(m, index, loaded)
  const eff = effectiveConds(m, index, loaded.sourceId, name)

  // ---- the list itself
  for (const x of m.project.mods ?? []) {
    if (!index.sources.some((s) => s.id === x.id)) out.push({ level: 'warning', area: 'Mods', message: `${x.name} (${x.id}) is in the mod's list as ${x.use} but isn't installed: its content can't be checked.`, ref: { page: 'saga', id: 'mods' }, key: `modmissing:${x.id}` })
    if (x.id === SAGALIB_ID || x.id === loaded.sourceId) out.push({ level: 'warning', area: 'Mods', message: `${x.name} shouldn't be in the mod's list (${x.id === SAGALIB_ID ? 'SagaLib is added by the export when needed' : 'it is this mod'}).`, ref: { page: 'saga', id: 'mods' }, key: `modself:${x.id}` })
    if (x.use === 'incompatible' && !x.reason?.trim()) out.push({ level: 'info', area: 'Mods', message: `${x.name} is marked incompatible without a reason: players see the reason in game and in the release notes.`, ref: { page: 'saga', id: 'mods' }, key: `modreason:${x.id}` })
  }

  // ---- what uses which mod
  for (const [id, sites] of uses) {
    const use = useOf(m.project, id)
    const n = name(id)
    const items = [...new Set(sites.map((s) => s.label))]
    const sample = items.slice(0, 3).join(', ') + (items.length > 3 ? `, +${items.length - 3}` : '')
    if (use === 'none') {
      // a framework used only through its data files → optional; another mod's content the story needs → required
      const onlyFiles = sites.every((s) => s.kind === 'file' || s.key.startsWith('override:'))
      out.push({ level: 'warning', area: 'Mods', message: `Uses ${n} (${sample}), but ${n} isn't in the mod's list (Saga › Mods). Add it as required or optional${onlyFiles ? ' (suggested: optional; only its own files or a patch of its faction use it)' : ''}.`, ref: { page: 'saga', id: 'mods' }, fixes: modFixes(id, n, onlyFiles), key: `modunlisted:${id}` })
    } else if (use === 'incompatible') {
      for (const s of sites) out.push({ level: 'error', area: 'Mods', message: `${s.label} refers to ${n} (${s.where}: ${s.id}), which the mod marks incompatible.`, ref: s.ref, key: `modincompat:${id}:${s.key}:${s.id}` })
    } else if (use === 'optional') {
      for (const s of sites.filter((x) => x.gameLoaded)) out.push(gameLoaded(s, n))
    }
  }

  // ---- references inside quests to an optional mod's content, outside a guard
  const optional = new Set(optionalMods(m.project).map((x) => x.id))
  if (optional.size) {
    for (const [id, sites] of uses) {
      if (!optional.has(id)) continue
      for (const s of sites) {
        if (!s.node || !s.key.startsWith('quest:')) continue
        const q = m.quests.find((x) => `quest:${x.id}` === s.key)
        if (!q) continue
        const g = nodeGuards(q, eff.get(s.key)?.eff).get(s.node)
        if (g && guardsMod(g, id)) continue
        out.push({ level: 'warning', area: 'Mods', message: `${s.label}, ${s.where}: uses ${name(id)}'s ${s.kind} ${s.id}, but ${name(id)} is optional and nothing guards this node. Put "Only with ${name(id)}" on the quest, or on the option or Branch case that leads here.`, ref: s.ref, key: `modunguarded:${q.id}:${s.node}:${s.id}` })
      }
    }
  }

  // ---- things used by conditional and by unconditional content keep no condition (the editor says which)
  for (const x of sharedWithUnconditional(m, eff)) {
    out.push({ level: 'info', area: 'Mods', message: `${x.key.replace(':', ' ')} is used by conditional content (${x.conditional.map((k) => k.replace(/^\w+:/, '')).slice(0, 3).join(', ')}) and by content without conditions (${x.plain.map((k) => k.replace(/^\w+:/, '')).slice(0, 3).join(', ')}), so it keeps no condition.`, key: `modshared:${x.key}` })
  }

  // ---- every combination of the optional mods
  out.push(...combinationProblems(m, eff, name))

  // ---- load order: a patch of another mod's faction wins for single values only after that mod
  out.push(...loadOrderProblems(ctx))

  // ---- Check mod only: the optional mods' own rule commands and text tokens
  if (ctx.rules && optional.size) out.push(...ruleProblems(ctx, eff, optional, name))
  return out
}

function gameLoaded(s: ModUseSite, n: string): Problem {
  return { level: 'error', area: 'Mods', message: `${s.label}: ${s.where} use ${n}'s ${s.kind} ${s.id}, which the game loads every time, with or without ${n}. Make ${n} required, or remove it here${s.key.startsWith('faction:') ? ' (a SagaLib scripted change can add to a faction at runtime)' : ''}.`, ref: s.ref, key: `modgameloaded:${s.key}:${s.id}` }
}

/** The guard makes sure the mod counts (it is in "with", or every "any of" group is only it). */
function guardsMod(g: EffConds, id: string): boolean {
  return g.with.includes(id) || g.any.some((grp) => grp.length === 1 && grp[0] === id)
}

/**
 * PLAN.md §10.2: plays every combination of the optional mods (2 mods = 4): a Dialog node that can
 * be reached with no option left, a Branch (not random) with no case and no "otherwise".
 */
export function combinationProblems(m: ModModel, eff: Map<string, ItemConds>, name: (id: string) => string = (id) => id): Problem[] {
  const ids = optionalMods(m.project).map((x) => x.id)
  const out: Problem[] = []
  const used = (q: QuestPlan) => q.nodes.some((n) => (n.type === 'dialog' && n.options.some((o) => !!o.mods)) || (n.type === 'branch' && n.cases.some((c) => !!c.mods)))
  for (const q of m.quests) {
    if (q.inactive || (!ids.length && !used(q))) continue
    const qe = eff.get(`quest:${q.id}`)?.eff
    const guards = nodeGuards(q, qe)
    const combos = ids.length ? combinations(ids) : [new Set<string>()]
    for (const on of combos) {
      if (qe && !holds(qe, on)) continue
      for (const n of q.nodes) {
        const g = guards.get(n.id)
        if (g && !holds(g, on)) continue
        if (n.type === 'dialog' && n.options.length && !n.options.some((o) => holds(addCond(noConds(), o.mods), on))) {
          out.push({ level: 'error', area: 'Mods', message: `"${n.title || n.id}" has no option left with ${comboText(on, name)}: every option is "Only with / without" mods. Add an option without conditions, or one for this combination.`, ref: { page: 'quests', id: q.id, sub: n.id }, key: `modcombo:${q.id}:${n.id}:${[...on].join('+')}` })
        }
        if (n.type === 'branch' && !n.random && n.cases.length && !q.edges.some((e) => e.from === n.id && e.handle === 'else') && !n.cases.some((c) => holds(addCond(noConds(), c.mods), on))) {
          out.push({ level: 'error', area: 'Mods', message: `Branch "${n.title || n.id}" has no case with ${comboText(on, name)} and no "otherwise": the conversation stops there.`, ref: { page: 'quests', id: q.id, sub: n.id }, key: `modcombo:${q.id}:${n.id}:${[...on].join('+')}` })
        }
      }
    }
  }
  // one message per node is enough: keep the first combination
  const seen = new Set<string>()
  return out.filter((p) => { const k = p.key!.split(':').slice(0, 3).join(':'); if (seen.has(k)) return false; seen.add(k); return true })
}

/** FORMATS.md "Load order": for merged JSON the last mod wins; a patch of another mod's faction should load after it. */
export function loadOrderProblems(ctx: CheckContext): Problem[] {
  const { model: m, index, loaded } = ctx
  const out: Problem[] = []
  const order = index.sources.map((s) => s.id)
  const me = order.indexOf(loaded.sourceId)
  if (me < 0) return out
  for (const f of m.factions) {
    if (f.kind !== 'override' || !Object.keys(f.patch.set ?? {}).length) continue
    const info = index.factions.find((x) => x.id === f.id)
    const owner = info?.definedBy.replace(/^code:/, '')
    if (!owner || owner === CORE_ID || owner === loaded.sourceId) continue
    const at = order.indexOf(owner)
    if (at < 0 || at < me) continue
    const src = index.sources[at]
    const want = `${src.sortString || src.name} ~ ${loaded.modInfo.name}`
    if (m.project.sortString === want) continue
    out.push({
      level: 'warning', area: 'Mods', message: `The change to faction "${f.id}" sets single values, but ${src.name} (which defines it) loads after this mod, so its values win. Give this mod a sortString that sorts after ${src.name}.`,
      ref: { page: 'factions', id: f.id }, fixes: [{ label: `Set sortString "${want}"`, action: 'setSortString', arg: want }], key: `loadorder:${f.id}`
    })
  }
  return out
}

/** Every rule command name and memory key set by each source's rules (Check mod's full rule set). */
function ruleSources(rules: NonNullable<CheckContext['rules']>): { commands: Map<string, Set<string>>; keys: Map<string, Set<string>> } {
  const commands = new Map<string, Set<string>>()
  const keys = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, s: string) => { let x = m.get(k); if (!x) m.set(k, (x = new Set())); x.add(s) }
  for (const r of rules) {
    for (const l of r.conditions.split('\n')) { const c = l.trim() && parseCondition(l.trim()); if (c && c.kind === 'command') add(commands, c.name, r.sourceId) }
    for (const l of r.script.split('\n')) {
      if (!l.trim() || l.trim().startsWith('#')) continue
      const s = parseScriptLine(l.trim())
      if (s.kind === 'command') add(commands, s.name, r.sourceId)
      if (s.kind === 'set' || s.kind === 'incr') add(keys, s.key, r.sourceId)
    }
  }
  return { commands, keys }
}

/** Known rule command prefixes of frameworks (FORMATS.md, Other mods and frameworks). */
const COMMAND_PREFIXES: [RegExp, string][] = [[/^Nex_/, 'nexerelin'], [/^MagicBounty/, 'MagicLib']]

function ruleProblems(ctx: CheckContext, eff: Map<string, ItemConds>, optional: Set<string>, name: (id: string) => string): Problem[] {
  const out: Problem[] = []
  const { commands, keys } = ruleSources(ctx.rules!)
  const ownerOfCommand = (cmd: string): string | null => {
    for (const [re, mod] of COMMAND_PREFIXES) if (re.test(cmd) && optional.has(mod)) return mod
    const srcs = commands.get(cmd)
    if (!srcs || srcs.has(CORE_ID) || srcs.has(SAGALIB_ID) || srcs.has(ctx.loaded.sourceId)) return null
    const opt = [...srcs].filter((s) => optional.has(s))
    return opt.length === srcs.size ? opt[0] : null
  }
  const ownerOfKey = (key: string): string | null => {
    const srcs = keys.get(key)
    if (!srcs || srcs.has(CORE_ID) || srcs.has(ctx.loaded.sourceId)) return null
    const opt = [...srcs].filter((s) => optional.has(s))
    return opt.length ? opt[0] : null
  }
  for (const q of ctx.model.quests) {
    if (q.inactive) continue
    const guards = nodeGuards(q, eff.get(`quest:${q.id}`)?.eff)
    const lines: { node: string; line: string; cond: boolean }[] = []
    const s = q.start
    if ('conditions' in s) for (const l of s.conditions) lines.push({ node: '', line: l, cond: true })
    for (const n of q.nodes) {
      if (n.type === 'dialog') {
        for (const l of n.conditions) lines.push({ node: n.id, line: l, cond: true })
        for (const l of n.script) lines.push({ node: n.id, line: l, cond: false })
        for (const o of n.options) for (const l of [...(o.showIf ?? []), ...(o.disabledIf ?? [])]) lines.push({ node: n.id, line: l, cond: true })
      }
      if (n.type === 'branch') for (const c of n.cases) for (const l of c.conditions) lines.push({ node: n.id, line: l, cond: true })
      if (n.type === 'action') for (const o of n.ops) if (o.op === 'line') lines.push({ node: n.id, line: o.line, cond: false })
    }
    for (const x of lines) {
      const t = x.line.trim()
      if (!t || t.startsWith('#')) continue
      const c = x.cond ? parseCondition(t) : null
      const nm = c ? (c.kind === 'command' ? c.name : null) : (() => { const sl = parseScriptLine(t); return sl.kind === 'command' ? sl.name : null })()
      const mod = nm ? ownerOfCommand(nm) : null
      if (nm && mod) out.push({ level: 'error', area: 'Mods', message: `${q.title}${x.node ? `, node "${x.node}"` : ''}: ${nm} is ${name(mod)}'s rule command. The game looks up every command of rules.csv when it loads and stops with "Command [${nm}] not found" without ${name(mod)}, even in a guarded rule. Make ${name(mod)} required, or use its memory keys instead.`, ref: { page: 'quests', id: q.id, sub: x.node || undefined }, key: `modcommand:${q.id}:${x.node}:${nm}` })
    }
    // text tokens set only by an optional mod's rules, in text no guard covers
    for (const n of q.nodes) {
      if (n.type !== 'dialog') continue
      const g = guards.get(n.id) ?? noConds()
      for (const tok of new Set((textOf(n).match(TOKEN_RE) ?? []).map((t) => t.replace(/\.+$/, '')))) {
        const mod = ownerOfKey(tok)
        if (!mod || guardsMod(g, mod)) continue
        out.push({ level: 'warning', area: 'Mods', message: `${q.title}, node "${n.title || n.id}": the text uses ${tok}, which only ${name(mod)} sets. Without ${name(mod)} it shows as "${tok}". Guard the node with "Only with ${name(mod)}" (on the quest, or the option or case that leads here).`, ref: { page: 'quests', id: q.id, sub: n.id }, key: `modtoken:${q.id}:${n.id}:${tok}` })
      }
    }
  }
  return out
}

const textOf = (n: DialogNode) => [n.text, ...n.options.map((o) => o.text)].join('\n')

/** "12 items use UAF": what removing a mod from the list, or marking it incompatible, affects. */
export function usesSummary(m: ModModel, index: CheckContext['index'], loaded: CheckContext['loaded'], id: string): { count: number; items: string[] } {
  const sites = modUses(m, index, loaded).get(id) ?? []
  const items = [...new Set(sites.map((s) => s.label))]
  return { count: items.length, items }
}

/** For the Saga › Mods table: what in the mod uses each mod (labels). */
export function usedBy(m: ModModel, index: CheckContext['index'], loaded: CheckContext['loaded']): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [id, sites] of modUses(m, index, loaded)) out.set(id, [...new Set(sites.map((s) => s.label))])
  return out
}

/** Every item's condition text for chips ("only with Nexerelin", greyed parts "from: …"). */
export function chipText(c: ItemConds | undefined, name: (id: string) => string): { own: string; from: { text: string; why: string }[] } {
  if (!c || isNone(c.eff)) return { own: '', from: [] }
  return { own: condText(c.eff, name), from: c.from.map((f) => ({ text: condText(f.cond, name), why: f.why })) }
}

export { plural }
export type { ModUse }

/** The game index as it would be without these mods (their ids removed), for Check mod's second pass. */
export function indexWithout(index: CheckContext['index'], ids: Set<string>): CheckContext['index'] {
  const keep = <T extends { definedBy?: string }>(l: T[] | undefined): T[] => (l ?? []).filter((x) => !ids.has((x.definedBy ?? '').replace(/^code:/, '')))
  return {
    ...index,
    sources: index.sources.filter((s) => !ids.has(s.id)),
    factions: keep(index.factions), people: keep(index.people), markets: keep(index.markets), systems: keep(index.systems), items: keep(index.items),
    industries: keep(index.industries), conditions: keep(index.conditions), submarkets: keep(index.submarkets), hulls: keep(index.hulls), wings: keep(index.wings),
    weapons: keep(index.weapons), hullmods: keep(index.hullmods), variants: keep(index.variants), illustrations: keep(index.illustrations),
    portraits: (index.portraits ?? []).filter((p) => !ids.has(p.sourceId)), customEntityTypes: keep(index.customEntityTypes), planetTypes: keep(index.planetTypes),
    codeSystems: (index.codeSystems ?? []).filter((s) => !ids.has(s.sourceId))
  }
}

/**
 * PLAN.md §10.2: Check mod's second pass "without the optional mods": the checks run again with
 * their ids removed; what is new there, outside content that is conditional on them, depends on
 * them without a condition.
 */
export function withoutOptionalPass(ctx: CheckContext, first: Problem[], run: (c: CheckContext) => Problem[]): Problem[] {
  const opt = optionalMods(ctx.model.project)
  if (!opt.length) return []
  const ids = new Set(opt.map((x) => x.id))
  const eff = effectiveConds(ctx.model, ctx.index, ctx.loaded.sourceId)
  const seen = new Set(first.map((p) => p.key ?? p.message))
  const names = opt.map((x) => x.name).join(', ')
  const gated = (p: Problem): boolean => {
    const r = p.ref
    if (!r?.id) return false
    const key = r.page === 'quests' ? `quest:${r.id}` : r.page === 'people' ? `person:${r.id}` : r.page === 'encounters' ? `encounter:${r.id}` : r.page === 'locations' ? (r.sub ? `entity:${r.sub}` : `system:${r.id}`) : null
    if (!key) return false
    const e = eff.get(key)?.eff
    if (!e) return false
    if (e.with.some((id) => ids.has(id)) || e.any.some((g) => g.every((id) => ids.has(id)))) return true
    // a node guarded by its option or case
    if (r.page === 'quests' && r.sub) {
      const q = ctx.model.quests.find((x) => x.id === r.id)
      const g = q && nodeGuards(q, e).get(r.sub.split('/')[0])
      if (g && (g.with.some((id) => ids.has(id)) || g.any.some((grp) => grp.every((id) => ids.has(id))))) return true
    }
    return false
  }
  const second = run({ ...ctx, index: indexWithout(ctx.index, ids), rules: ctx.rules?.filter((r) => !ids.has(r.sourceId)) ?? null })
  return second
    .filter((p) => p.area !== 'Mods' && (p.level === 'error' || p.level === 'warning') && !seen.has(p.key ?? p.message) && !gated(p))
    .map((p) => ({ ...p, area: `Without ${names}`, message: `Without the optional mods (${names}): ${p.message}`, key: p.key ? `without:${p.key}` : undefined }))
}
