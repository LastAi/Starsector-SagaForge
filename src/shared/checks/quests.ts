/** Quest checks (PLAN.md §5, "Problems show as a red corner on the node"; §4.4). */
import type { Problem } from '../api'
import type { QuestPlan } from '../model'
import { compileQuest } from '../export/questrules'
import { reachable } from '../quest'
import { TOKEN_RE } from '../rules/parse'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'
import { lockedEntityIds, populateLinkProblems, unguardedWreckProblems } from '../patterns'
import { isTodoActive } from '../todo'
import { arriveTakesOver, criteriaFor, criterion, targetPartOf, targetVarOf } from '../targets'

export function questProblems(ctx: CheckContext, q: QuestPlan): Problem[] {
  const out: Problem[] = []
  const ref = (sub?: string) => ({ page: 'quests' as const, id: q.id, sub })
  const m = ctx.model
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  const c = compileQuest(q, { sagalib: true, phrases, lockedEntities: lockedEntityIds(m.quests), pools: m.pools ?? [] })
  out.push(...c.problems)
  if (!ID_PATTERN.test(q.id)) out.push({ level: 'error', area: 'Quest', message: `Quest id "${q.id}" may only use lowercase letters, digits and _.`, ref: ref() })
  out.push(...interjectionProblems(q))
  const pp = prefixProblem(m.project.prefix, q.id, 'Quest', ref())
  if (pp) out.push(pp)
  if (!q.nodes.some((n) => n.type === 'start')) out.push({ level: 'error', area: 'Quest', message: 'The quest has no Start node.', ref: ref() })

  // #48 (in game, 2026-11-15): an options entry is "order:id:text" and the game splits it at every
  // ":", so a colon in the label cuts it there ("SFR test B: pick me" showed "SFR test B")
  const colon = (where: string, text: string | undefined, sub: string | undefined, key: string) => {
    if (text?.includes(':')) out.push({ level: 'warning', area: 'Quest', ref: ref(sub), key: `optcolon:${q.id}:${key}`, message: `${where} "${text}": the game cuts an option's label at a ":" (it shows "${text.slice(0, text.indexOf(':')).trim()}"). Use a dash or rephrase.` })
  }
  const st = q.start as { kind: string; optionText?: string }
  // a bar scene's option goes through AddBarEvent's parameter, not an options column: colons are fine
  if (st.kind !== 'contact' && st.kind !== 'barScene') colon('Start option', st.optionText, 'start', 'start')
  out.push(...barSceneProblems(q))
  out.push(...wreckOptionProblems(q, m))
  for (const n of q.nodes) {
    if (n.type === 'dialog') for (const o of n.options) colon(`${(n as { title?: string }).title || n.id} › option`, o.text, n.id, `${n.id}:${o.id}`)
    if (n.type === 'wait' && n.mode === 'arrive' && !arriveTakesOver(q, n)) colon(`${n.id} › arrival option`, n.optionText, n.id, `${n.id}:arrive`)
  }

  // reachability and dead ends
  const reach = reachable(q)
  for (const n of q.nodes) {
    if (n.type === 'note' || n.type === 'start') continue
    if (!reach.has(n.id)) out.push({ level: 'warning', area: 'Quest', message: `"${n.id}" can't be reached from the start.`, ref: ref(n.id), key: `unreach:${q.id}:${n.id}` })
    const outs = q.edges.filter((e) => e.from === n.id)
    if (q.kind === 'quest' && !outs.length && n.type !== 'end' && n.type !== 'link' && !(n.type === 'dialog' && n.options.length)) {
      out.push({ level: 'warning', area: 'Quest', message: `"${n.id}" is a dead end without an End node.`, ref: ref(n.id), key: `deadend:${q.id}:${n.id}` })
    }
  }
  // references
  const peopleIds = new Set([...m.people.map((p) => p.id), ...ctx.index.people.map((p) => p.id)])
  const itemIds = new Set([...m.items.map((i) => i.id), ...ctx.index.items.map((i) => i.id)])
  const encIds = new Set(m.encounters.map((e) => e.id))
  const rewardIds = new Set(q.rewards.map((r) => r.id))
  const stageIds = new Set(q.stages.map((s) => s.id))
  if (q.start.kind === 'contact' && q.start.person && !peopleIds.has(q.start.person)) out.push({ level: 'error', area: 'Quest', message: `Start: no person "${q.start.person}".`, ref: ref('start') })
  // a contact start names a person, or a tag pool (any contact whose tags match: RC-R5)
  if (q.start.kind === 'contact' && !q.start.person && !q.start.tagsAll?.trim() && !q.start.tagsAny?.trim() && !isTodoActive(q, 'start.person')) out.push({ level: 'error', area: 'Quest', message: 'Start: pick the contact who offers the quest, or the tags any contact needs to offer it (Tags: all / any).', ref: ref('start') })
  if (q.start.kind === 'contact' || q.start.kind === 'bar') {
    const s = q.start as { timeout?: [number, number]; duration?: [number, number]; acceptedTimeout?: [number, number] }
    for (const [label, r] of [['timeout', s.timeout], ['duration', s.duration], ['accepted timeout', s.acceptedTimeout]] as const) {
      if (r && (r[0] < 0 || r[1] < r[0])) out.push({ level: 'error', area: 'Quest', message: `Start: the ${label} needs a minimum of 0 or more and a maximum no smaller than the minimum (${r[0]}–${r[1]}).`, ref: ref('start') })
    }
  }
  for (const n of q.nodes) {
    if (n.type === 'dialog') {
      if (n.speaker && !peopleIds.has(n.speaker)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no person "${n.speaker}".`, ref: ref(n.id) })
      if (n.visual.kind === 'person' && !peopleIds.has(n.visual.person)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no person "${n.visual.person}" for the visual.`, ref: ref(n.id) })
      if (n.visual.kind === 'illustration' && !ctx.index.illustrations.some((i) => i.key === (n.visual as { key: string }).key) && !m.project.illustrations?.[n.visual.key]) {
        out.push({ level: 'warning', area: 'Quest', message: `"${n.id}": illustration "${n.visual.key}" isn't registered by the game or any mod.`, ref: ref(n.id) })
      }
      for (const d of n.displays) {
        if ((d.kind === 'commodity' || d.kind === 'specialItem') && !itemIds.has(d.item)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": unknown item "${d.item}".`, ref: ref(n.id) })
      }
      const ids = new Set<string>()
      for (const o of n.options) {
        if (ids.has(o.id)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": two options use the id "${o.id}".`, ref: ref(n.id) })
        ids.add(o.id)
      }
      // tokens nothing defines
      for (const tok of new Set([...(n.text.match(TOKEN_RE) ?? []), ...n.options.flatMap((o) => o.text.match(TOKEN_RE) ?? [])])) {
        const t = tok.replace(/\.+$/, '')
        if (known(t, ctx, q, phrases, n.phrases.map((p) => p.token))) continue
        out.push({ level: 'warning', area: 'Quest', message: `"${n.id}": token ${t} isn't set by anything Saga Forge knows (a vanilla token, a phrase, a quest variable).`, ref: ref(n.id), key: `token:${q.id}:${n.id}:${t}` })
      }
    } else if (n.type === 'stage' && !stageIds.has(n.stage)) {
      // compileQuest reports it
    } else if (n.type === 'encounter' && n.encounter && !encIds.has(n.encounter)) {
      out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no encounter "${n.encounter}".`, ref: ref(n.id) })
    } else if (n.type === 'end' && n.reward && !rewardIds.has(n.reward)) {
      out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no reward "${n.reward}".`, ref: ref(n.id) })
    }
  }
  for (const r of q.rewards) for (const it of r.items ?? []) if (!itemIds.has(it.item)) out.push({ level: 'error', area: 'Quest', message: `Reward "${r.id}": unknown item "${it.item}".`, ref: ref() })
  out.push(...targetProblems(q))
  const stepIds = new Set<string>()
  for (const s of q.stages) {
    if (stepIds.has(s.id)) out.push({ level: 'error', area: 'Quest', message: `Two stages use the id "${s.id}".`, ref: ref() })
    stepIds.add(s.id)
    for (const old of s.renamedFrom) if (q.stages.some((x) => x.id === old)) out.push({ level: 'error', area: 'Quest', message: `Stage "${s.id}" lists "${old}" as an old id, but another stage still uses it.`, ref: ref() })
  }
  if (q.kind === 'quest' && !q.nodes.some((n) => n.type === 'end')) out.push({ level: 'warning', area: 'Quest', message: 'The quest has no End node, so it never completes.', ref: ref(), key: `noend:${q.id}` })
  return out
}

function known(t: string, ctx: CheckContext, q: QuestPlan, phrases: { token: string }[], inline: string[]): boolean {
  const lower = t.toLowerCase()
  if (ctx.defs.tokens.some((x) => x.token.toLowerCase() === lower)) return true
  if (phrases.some((p) => p.token === t) || inline.includes(t)) return true
  if (q.variables.some((v) => `$global.${q.id}_${v.name}` === t)) return true
  if (/^\$(global|player|faction|market|entity|person|sector)\./.test(t)) return true // memory reads: the flags registry checks those
  return false
}

/** Phase 7c (RC-R1): random targets: criteria that fit the pick, and places that name a known target. */
export function targetProblems(q: QuestPlan): Problem[] {
  const out: Problem[] = []
  const ref = (sub?: string) => ({ page: 'quests' as const, id: q.id, sub })
  const vars = q.variables.filter((v) => v.type === 'target')
  for (const v of vars) {
    const t = v.target
    if (!t) { out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": choose what to pick (a system, planet, entity or market).` }); continue }
    if (q.kind !== 'quest') out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": random targets are searched when a quest is offered, so this needs the kind "Quest" (not a conversation).` })
    const fits = new Set(criteriaFor(t.pick).map((x) => x.id))
    for (const [list, as] of [[t.require, 'require'], [t.prefer, 'prefer']] as const) {
      for (const cr of list) {
        const spec = criterion(cr.id)
        if (!spec) { out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": unknown criterion "${cr.id}".` }); continue }
        if (!fits.has(cr.id)) out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": "${spec.label}" doesn't narrow a ${t.pick} pick${t.pick === 'market' && spec.group === 'system' ? ' (vanilla\'s market search ignores system criteria)' : ''}.` })
        if (as === 'prefer' && !spec.pref) out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `tgtpref:${q.id}:${v.name}:${cr.id}`, message: `Target "${v.name}": vanilla can only require "${spec.label}", not prefer it; SagaLib skips it. Move it to the requires.` })
        spec.args.forEach((a, i) => {
          if (a.kind === 'list' && !(Array.isArray(cr.args[i]) && (cr.args[i] as string[]).length)) out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `tgtarg:${q.id}:${v.name}:${cr.id}:${i}`, message: `Target "${v.name}": "${spec.label}" has no ${a.label.toLowerCase()} yet.` })
          if (a.kind === 'id' && !String(cr.args[i] ?? '').trim()) out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `tgtarg:${q.id}:${v.name}:${cr.id}:${i}`, message: `Target "${v.name}": "${spec.label}" needs a ${a.label.toLowerCase()}.` })
        })
      }
    }
    if (!t.require.length && !t.prefer.length) out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `tgtany:${q.id}:${v.name}`, message: `Target "${v.name}" has no criteria: any ${t.pick} in the sector can be picked. Add some (e.g. within N light-years of the giver).` })
    else if (!t.require.length) out.push({ level: 'info', area: 'Quest', ref: ref(), key: `tgtnoreq:${q.id}:${v.name}`, message: `Target "${v.name}" only has prefers: when none of them fit, any ${t.pick} can be picked.` })
  }
  // contacts and bars create the mission when they offer it; any other start creates it at its first Stage node
  if (vars.length && q.start.kind !== 'contact' && q.start.kind !== 'bar') out.push({ level: 'info', area: 'Quest', ref: ref(), key: `tgtwhen:${q.id}`, message: `${q.title}: with this start, SagaLib searches the random targets when the quest starts (its first Stage node), so only texts after that can name them. If a search finds nothing, the quest doesn't start (Branch on SF_QuestState to tell the player).` })
  if (vars.length) out.push({ level: 'info', area: 'Quest', ref: ref(), key: `tgtnone:${q.id}`, message: `${q.title}: when a random target finds nothing in the player's sector, the quest simply isn't offered (as vanilla's missions); a contact offers something else. Play mode uses each target's mock instead.` })
  // places that name a target
  const known = new Set(vars.map((v) => v.name))
  const check = (r: string | undefined, where: string, sub?: string) => {
    const v = targetVarOf(r)
    if (v && !known.has(v)) { out.push({ level: 'error', area: 'Quest', ref: ref(sub), message: `${where} names the target "${v}", but the quest has no target variable "${v}".` }); return }
    // Phase 7d: its person needs a person set up; its spawn needs a "Spawn at the random target" action
    const part = targetPartOf(r)
    if (v && part === 'person' && !vars.find((x) => x.name === v)?.target?.person?.posts.length) out.push({ level: 'error', area: 'Quest', ref: ref(sub), message: `${where} is the person at target "${v}", but that target has no person (its "A person there" posts).` })
    if (v && part === 'spawned' && !spawnTargets.has(v)) out.push({ level: 'error', area: 'Quest', ref: ref(sub), message: `${where} is what was spawned at target "${v}", but no Action spawns anything there.` })
  }
  const spawnTargets = new Set<string>()
  for (const n of q.nodes) if (n.type === 'action') for (const o of n.ops) if (o.op === 'spawnAtTarget') {
    spawnTargets.add(o.target)
    if (!known.has(o.target)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `"${n.title || n.id}": Spawn at the random target names "${o.target || '?'}", which isn't a target variable of this quest.` })
    else if (!o.type.trim()) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `"${n.title || n.id}": Spawn at the random target needs ${o.kind === 'derelict' ? 'a faction for the derelict' : 'a custom entity type (e.g. supply_cache)'}.` })
  }
  for (const v of vars) if (v.target?.person?.posts.length && v.target.pick === 'system') out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": a person needs a colony, and a system pick has none. Pick a market (or a planet with a colony).` })
  for (const s of q.stages) check(s.marker, `Stage "${s.id}"'s map marker`)
  for (const n of q.nodes) if (n.type === 'wait' && n.mode === 'arrive') {
    check(n.entity, `Arrive "${n.id}"`, n.id)
    // a spawned cache or probe, or an entity pick, has vanilla's salvage dialog: no menu options there
    const v = targetVarOf(n.entity)
    const part = targetPartOf(n.entity)
    if (v && n.takeover === false && (part === 'spawned' || (part === '' && vars.find((x) => x.name === v)?.target?.pick === 'entity'))) {
      out.push({ level: 'warning', area: 'Quest', ref: ref(n.id), key: `tgtsalvage:${q.id}:${n.id}`, message: `Arrive "${n.id}": ${part === 'spawned' ? 'what is spawned at the target' : `target "${v}" (an entity)`} usually has vanilla's salvage dialog, which never shows menu options (as derelicts), so the option you chose there may never appear. Set it back to "takes over the arrival".`, fixes: [] })
    }
  }
  return out
}

/**
 * A derelict's dialog is built by vanilla's salvage rules (PopulateSalvageOptions), which never fire
 * PopulateOptions, so an option added there never appears (found while building the 7a test mod,
 * 2026-11-16; user decision: warn). Covers start options and menu-option Arrives at the mod's wrecks
 * or at "$customType == wreck"; a takeover, an interjection on salExplore, or a wreck lock work.
 */
export function wreckOptionProblems(q: QuestPlan, m: { systems: { entities: { id: string; kind: string }[] }[]; quests: QuestPlan[] }): Problem[] {
  const out: Problem[] = []
  const wrecks = new Set(m.systems.flatMap((s) => s.entities.filter((e) => e.kind === 'derelict').map((e) => e.id)))
  const locked = lockedEntityIds(m.quests)
  const atWreck = (lines: string[]) => lines.some((l) => /\$customType\s*==\s*wreck\b/.test(l) || [...wrecks].some((w) => new RegExp(`^\\$id\\s*==\\s*${w}\\b`).test(l.trim())))
  const s = q.start
  if (s.kind === 'option' && (s.trigger || 'PopulateOptions') === 'PopulateOptions' && atWreck(s.conditions)) {
    out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: 'start' }, key: `wreckopt:${q.id}`, message: `${q.title}: its start option is added at a wreck, but a wreck's dialog (vanilla's salvage) never shows menu options. Use the start "an interjection before an existing option" on salExplore, or "a dialog that opens on a trigger" (OpenInteractionDialog).` })
  }
  for (const n of q.nodes) {
    if (n.type !== 'wait' || n.mode !== 'arrive' || !n.entity || !wrecks.has(n.entity) || locked.has(n.entity) || arriveTakesOver(q, n)) continue
    out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, key: `wreckarrive:${q.id}:${n.id}`, message: `Arrive "${n.id}": "${n.entity}" is a wreck, and a wreck's dialog (vanilla's salvage) never shows menu options. Set it to "takes over the arrival".` })
  }
  return out
}

/** Phase 7b (RC-R6): a bar scene needs its option and blurb, and should not be in every bar every visit. */
export function barSceneProblems(q: QuestPlan): Problem[] {
  const s = q.start
  if (s.kind !== 'barScene') return []
  const out: Problem[] = []
  const ref = { page: 'quests' as const, id: q.id }
  if (!s.optionText.trim()) out.push({ level: 'error', area: 'Quest', ref, message: `${q.title}: the bar scene needs the option the player picks in the bar.` })
  if (!s.blurb.trim()) out.push({ level: 'warning', area: 'Quest', ref, key: `barblurb:${q.id}`, message: `${q.title}: the bar scene has no blurb, so the bar's description doesn't hint at it.` })
  if (!s.conditions.length && (s.probability === undefined || s.probability >= 1) && (!s.once || s.once === 'none')) {
    out.push({ level: 'warning', area: 'Quest', ref, key: `barevery:${q.id}`, message: `${q.title}: the bar scene is in every colony's bar on every visit. Limit it with conditions (e.g. $market.id == …), a chance below 1 or a once-limit.` })
  }
  if (q.kind === 'quest') out.push({ level: 'info', area: 'Quest', ref, key: `barquest:${q.id}`, message: `${q.title}: a bar scene starts no mission. To offer a job in a bar, use the start "a bar event" (bar_events.csv); a bar scene can still start a quest with an Action › Start another quest.` })
  return out
}

/**
 * RC-F2, the takeover check's third result: an interjection must hand back on every path (a Link
 * to the option it interrupted, or back to the menu), or the player loses vanilla's answer to it.
 */
export function interjectionProblems(q: QuestPlan): Problem[] {
  const s = q.start
  if (s.kind !== 'interject') return []
  const out: Problem[] = []
  const ref = (sub?: string) => ({ page: 'quests' as const, id: q.id, sub })
  if (!s.option.trim()) out.push({ level: 'error', area: 'Quest', ref: ref(), message: `${q.title}: an interjection needs the option it cuts into (e.g. salExplore).` })
  if ((s.probability === undefined || s.probability >= 1) && (!s.once || s.once === 'none')) {
    out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `interject-every:${q.id}`, message: `${q.title}: the interjection runs every time "${s.option}" is picked. Give it a chance below 1 or a once-limit, as vanilla's salvage stories have.` })
  }
  const start = q.nodes.find((n) => n.type === 'start')
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const todo = start ? [start.id] : []
  while (todo.length) {
    const id = todo.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    if (!n || n.type === 'note') continue
    const outs = q.edges.filter((e) => e.from === id)
    if (n.type === 'link') {
      if (n.mode === 'node') todo.push(n.target)
      continue
    }
    const loose = n.type === 'dialog' ? n.options.filter((o) => !outs.some((e) => e.handle === o.id)) : []
    if ((n.type !== 'dialog' && !outs.length && n.type !== 'end') || loose.length) {
      out.push({ level: 'error', area: 'Quest', ref: ref(n.id), key: `interject-dead:${q.id}:${n.id}`, message: `${q.title} › ${n.id}${loose.length ? ` (option "${loose[0].text}")` : ''}: this path of the interjection doesn't hand back. End it with a Link: "Hand back" to "${s.option}", or back to the menu.` })
    }
    for (const e of outs) todo.push(e.to)
  }
  return out
}

export function allQuestProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const ids = new Set<string>()
  for (const q of ctx.model.quests) {
    if (ids.has(q.id)) out.push({ level: 'error', area: 'Quest', message: `Two quests use the id "${q.id}".`, ref: { page: 'quests', id: q.id } })
    ids.add(q.id)
    out.push(...questProblems(ctx, q))
    // Check mod: the quest's rule ids against every installed mod's rules (a shared id replaces a row)
    if (ctx.rules) {
      const own = ctx.loaded.sourceId
      const taken = new Set(ctx.rules.filter((r) => r.sourceId !== own).map((r) => r.id))
      if ([...taken].some((id) => id === q.id || id.startsWith(`${q.id}_`))) {
        out.push({ level: 'error', area: 'Quest', message: `Rule ids starting with "${q.id}_" are also used by ${[...new Set(ctx.rules.filter((r) => r.sourceId !== own && r.id.startsWith(`${q.id}_`)).map((r) => r.sourceId))].join(', ')}. Change the quest id before release.`, ref: { page: 'quests', id: q.id } })
      }
    }
  }
  out.push(...unguardedWrecks(ctx))
  out.push(...populateLinkProblems(ctx.model, new Set(ctx.index.markets.flatMap((x) => [x.id, ...x.entities])), true))
  return out
}

/**
 * A derelict (wreck) that a quest sends the player to is an ordinary vanilla wreck the rest of
 * the time: salvaging or recovering it removes it, and the quest can't continue (found in
 * testing, 2026-11-11). Guarded = some conversation answers OpenInteractionDialog at it outside
 * the quest's own steps (a start condition "$id == <wreck>"). Fix: Protect this wreck (patterns.ts).
 */
export const unguardedWrecks = (ctx: CheckContext): Problem[] => unguardedWreckProblems(ctx.model)

