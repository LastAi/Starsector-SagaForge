/** Quest checks (PLAN.md §5, "Problems show as a red corner on the node"; §4.4). */
import { addNameTokens, nameVersioned } from '../modelversions'
import type { Problem } from '../api'
import type { QuestPlan } from '../model'
import { compileQuest } from '../export/questrules'
import { beforeStart, crossEntries, reachable, startQuestStageProblem } from '../quest'
import { TOKEN_RE } from '../rules/parse'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'
import { lockedEntityIds, populateLinkProblems, unguardedWreckProblems } from '../patterns'
import { isTodoActive } from '../todo'
import { arriveTakesOver, criteriaFor, criterion, targetKeys, targetPartOf, targetsPickedAtOffer, targetVarOf, targetVars } from '../targets'

export function questProblems(ctx: CheckContext, q: QuestPlan): Problem[] {
  const out: Problem[] = []
  const ref = (sub?: string) => ({ page: 'quests' as const, id: q.id, sub })
  const m = ctx.model
  // #64: with the name tokens the export adds ($<person>_name, _firstName, _lastName)
  const named = addNameTokens(m, nameVersioned(m))
  const phrases = [...named.phrases, ...named.people.flatMap((p) => p.phrases)]
  const c = compileQuest(q, { sagalib: true, phrases, lockedEntities: lockedEntityIds(m.quests), pools: m.pools ?? [], groups: m.nodeGroups, prefix: m.project.prefix })
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
    // #77 (in game, 2026-11-20): the game drops a '"' at the very end of a label
    // (`Grant VoK's "Agriculture Industrialization"` showed without its last quote)
    else if (text?.trim().endsWith('"')) out.push({ level: 'warning', area: 'Quest', ref: ref(sub), key: `optquote:${q.id}:${key}`, message: `${where} ${text.trim()}: the game drops a quote mark at the very end of an option's label (it shows ${text.trim().slice(0, -1)}). Put something after it, e.g. a closing word or bracket, or rephrase.` })
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
  // #67 U5: nodes another conversation links into count as reached (said once, at the node it enters)
  const cross = crossEntries(q, m.quests)
  const own = reachable(q)
  const reach = reachable(q, [...cross.keys()])
  for (const [node, from] of cross) {
    if (!own.has(node)) out.push({ level: 'info', area: 'Quest', ref: ref(node), key: `xreach:${q.id}:${node}`, message: `"${node}" is entered from ${from.map((t) => `"${t}"`).join(', ')} (Link › fire a trigger), not from this quest's start. What follows it counts as reachable.` })
  }
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
    // #67 U3: a Fight node needs a fleet SagaLib can build
    if (n.type === 'fight') {
      const fl = n.fleet
      const where = `Fight "${n.title || n.id}"`
      if (fl.size === 'template' && !(m.fleets?.templates ?? []).some((t) => t.id === fl.template)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: pick one of the mod's named fleets (Fleets page).` })
      if (fl.size !== 'template' && !fl.faction) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: pick the fleet's faction.` })
      else if (fl.size !== 'template' && !ctx.index.factions.some((f) => f.id === fl.faction) && !m.factions.some((f) => f.id === fl.faction)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: no faction "${fl.faction}".` })
      if (fl.size === 'fp' && !((fl.points ?? 0) > 0)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: give the fleet some fleet points.` })
      if (fl.size === 'explicit' && !fl.variants?.length) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: list at least one ship variant.` })
      if (fl.flagshipCommander && !peopleIds.has(fl.flagshipCommander)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `${where}: no person "${fl.flagshipCommander}" to command the flagship.` })
    }
    if (n.type === 'dialog') {
      if (n.speaker && !peopleIds.has(n.speaker)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no person "${n.speaker}".`, ref: ref(n.id) })
      if (n.visual.kind === 'person' && !peopleIds.has(n.visual.person)) out.push({ level: 'error', area: 'Quest', message: `"${n.id}": no person "${n.visual.person}" for the visual.`, ref: ref(n.id) })
      // #67 U49: a key another Saga Forge mod has but hasn't exported yet: say which mod, and that Export registers it
      const why = (key: string) => { const u = ctx.index.unexportedIllustrations?.find((x) => x.key === key); return u ? ` ${u.modName} has it, but hasn't been exported since it was added: open ${u.modName} in Saga Forge and Export it (that registers its pictures for the game and other mods).` : '' }
      // #67 U4: the picture for a female player too
      const fk = n.visual.kind === 'illustration' ? n.visual.female?.key : undefined
      if (fk && !ctx.index.illustrations.some((i) => i.key === fk) && !m.project.illustrations?.[fk]) out.push({ level: 'warning', area: 'Quest', message: `"${n.id}": illustration "${fk}" (for a female player) isn't registered by the game or any mod.${why(fk)}`, ref: ref(n.id) })
      if (n.visual.kind === 'illustration' && !ctx.index.illustrations.some((i) => i.key === (n.visual as { key: string }).key) && !m.project.illustrations?.[n.visual.key]) {
        out.push({ level: 'warning', area: 'Quest', message: `"${n.id}": illustration "${n.visual.key}" isn't registered by the game or any mod.${why(n.visual.key)}`, ref: ref(n.id) })
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
    } else if (n.type === 'action') {
      // #67: a "Give a reward" step with no reward picked, or one that was deleted
      for (const op of n.ops) if (op.op === 'reward' && !rewardIds.has(op.reward)) out.push({ level: 'error', area: 'Quest', message: op.reward ? `"${n.id}": gives the reward "${op.reward}", which this quest doesn't have.` : `"${n.id}": "Give a reward" has no reward picked.`, ref: ref(n.id) })
    }
  }
  for (const r of q.rewards) for (const it of r.items ?? []) if (!itemIds.has(it.item)) out.push({ level: 'error', area: 'Quest', message: `Reward "${r.id}": unknown item "${it.item}".`, ref: ref() })
  out.push(...targetProblems(q))
  out.push(...arriveAfterOutcomeProblems(q))
  // H5: "Start another quest" starts it at a stage
  for (const n of q.nodes) if (n.type === 'action') for (const o of n.ops) if (o.op === 'startQuest') {
    const sp = startQuestStageProblem(o, m.quests, q)
    if (sp) out.push({ level: sp.level, area: 'Quest', ref: ref(n.id), key: sp.level === 'warning' ? `startstage:${q.id}:${n.id}:${o.quest}` : undefined, message: `"${n.title || n.id}" ${sp.message}` })
  }
  out.push(...earlyTokenProblems(q))
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
  // #75: commodity targets: what they pick from, the amount, the ops and rewards that use them, the cargo check
  const commodityVars = new Set(vars.filter((v) => v.target?.pick === 'commodity').map((v) => v.name))
  for (const v of vars) {
    const c = v.target?.pick === 'commodity' ? v.target.commodity : undefined
    if (c?.which === 'list' && !c.ids?.length) out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": "these commodities" has no commodity ids yet.` })
    if (c && !(c.amount.n > 0)) out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Target "${v.name}": the amount must be more than 0 (it is rounded to at least 1 cargo unit).` })
  }
  const takes = new Set<string>()
  for (const n of q.nodes) if (n.type === 'action') for (const o of n.ops) if (o.op === 'targetCargo' || o.op === 'targetCredits') {
    if (!commodityVars.has(o.target)) out.push({ level: 'error', area: 'Quest', ref: ref(n.id), message: `"${n.title || n.id}": ${o.op === 'targetCargo' ? 'the target\'s goods' : 'credits for the target\'s goods'} names "${o.target || '?'}", which isn't a commodity target of this quest.` })
    else if (o.op === 'targetCargo' && o.do === 'take') takes.add(o.target)
  }
  for (const r of q.rewards) if (r.targetCredits && !commodityVars.has(r.targetCredits.var)) out.push({ level: 'error', area: 'Quest', ref: ref(), message: `Reward ${r.id}: its credits for goods name "${r.targetCredits.var}", which isn't a commodity target of this quest.` })
  const tested = JSON.stringify(q.nodes)
  for (const v of takes) if (!tested.includes(`SF_TargetCommodity ${q.id} ${v} has`)) out.push({ level: 'warning', area: 'Quest', ref: ref(), key: `tgthas:${q.id}:${v}`, message: `${q.title} takes target ${v}'s goods but never tests that the player has them: a player without them would lose what they have and still finish. Add the condition "has its goods" to the option or a Branch before.` })
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
 * #71 (in game, 2026-11-18): with a start other than a contact or a bar event, SagaLib creates the
 * mission when the quest starts (SF_Start, its first Stage node): only then are its random targets
 * searched and its variables set to their initial values. A text shown before that (the start
 * option, a bar scene's blurb, the offer) showed their tokens raw. One warning per place and kind.
 */
export function earlyTokenProblems(q: QuestPlan): Problem[] {
  if (q.kind !== 'quest' || targetsPickedAtOffer(q)) return []
  const pre = beforeStart(q)
  // a variable set before the start (an Action's Set, a dialog's script line) has a value there,
  // except in that dialog's own text (its script runs after the text)
  const setAt = new Map<string, Set<string>>()
  const mark = (k: string, id: string) => setAt.set(k, new Set([...(setAt.get(k) ?? []), id]))
  for (const n of q.nodes) {
    if (!pre.has(n.id)) continue
    if (n.type === 'action') for (const o of n.ops) if (o.op === 'set') mark(o.key.trim(), n.id)
    if (n.type === 'dialog') for (const l of n.script) { const x = /^\s*(\$[\w.]+)\s*=/.exec(l); if (x) mark(x[1], n.id) }
  }
  const setElsewhere = (k: string, here: string) => [...(setAt.get(k) ?? [])].some((id) => id !== here)
  const targets = new Map<string, string>(targetVars(q).flatMap((v) => targetKeys(q.id, v.name).map((k) => [k, v.name] as const)))
  const plain = new Map<string, string>(q.variables.filter((v) => v.type !== 'target').map((v) => [`$global.${q.id}_${v.name}`, v.name] as const))
  if (!targets.size && !plain.size) return []
  const out: Problem[] = []
  const manual = q.start.kind === 'manual' ? ' If the quest that starts this one runs "Start another quest" before it jumps here, the mission exists already: ignore this.' : ''
  const report = (where: string, sub: string, texts: (string | undefined)[]) => {
    const found = [...new Set(texts.flatMap((t) => (t?.match(TOKEN_RE) ?? []).map((x) => x.replace(/\.+$/, ''))))]
    const names = (keys: Map<string, string>, toks: string[]) => [...new Set(toks.map((t) => keys.get(t)))].map((v) => `"${v}"`).join(', ')
    const tt = found.filter((t) => targets.has(t))
    if (tt.length) out.push({
      level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub }, key: `tgtearly:${q.id}:${sub}`,
      message: `${where}: ${tt.join(', ')} ${tt.length > 1 ? 'name' : 'names'} random target ${names(targets, tt)}, but with this start SagaLib only picks it when the quest starts (its first Stage node), after this text. In game the token shows as it is. Name the target after the Stage node, or offer the quest from a contact or a bar event (they pick their targets with the offer).${manual}`
    })
    const vt = found.filter((t) => plain.has(t) && !setElsewhere(t, sub))
    if (vt.length) out.push({
      level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub }, key: `varearly:${q.id}:${sub}`,
      message: `${where}: ${vt.join(', ')} ${vt.length > 1 ? 'are quest variables' : 'is quest variable'} ${names(plain, vt)}, which SagaLib only sets to ${vt.length > 1 ? 'their' : 'its'} initial value when the quest starts (its first Stage node) with this start, after this text. In game the token shows as it is the first time. Set it with an Action before this text, use it after the Stage node, or offer the quest from a contact or a bar event.${manual}`
    })
  }
  const s = q.start
  if (s.kind === 'option') report('Start option', 'start', [s.optionText])
  if (s.kind === 'barScene') report('Bar scene', 'start', [s.optionText, s.blurb])
  for (const n of q.nodes) {
    if (!pre.has(n.id)) continue
    if (n.type === 'dialog') {
      report(`"${n.title || n.id}"`, n.id, [
        n.text, ...n.options.flatMap((o) => [o.text, o.tooltip]),
        ...n.displays.map((d) => (d.kind === 'text' || d.kind === 'heading' ? d.text : undefined)),
        ...n.phrases.flatMap((p) => [...p.cases.map((c) => c.text), p.otherwise])
      ])
    } else if (n.type === 'raid') report(`Raid "${n.title || n.id}"`, n.id, [n.text, n.raidText, n.objective, n.tooltip])
    else if (n.type === 'wait') report(`Arrive "${n.id}"`, n.id, [n.arriveText, n.optionText])
  }
  return out
}

/**
 * A derelict's dialog is built by vanilla's salvage rules (PopulateSalvageOptions), which never fire
 * PopulateOptions, so an option added there never appears (found while building the 7a test mod,
 * 2026-11-16; user decision: warn). Covers start options and menu-option Arrives at the mod's wrecks
 * or at "$customType == wreck"; a takeover, an interjection on salExplore, or a wreck lock work.
 */
export function wreckOptionProblems(q: QuestPlan, m: { systems: { entities: { id: string; kind: string; market?: unknown; interaction?: string }[] }[]; quests: QuestPlan[] }): Problem[] {
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
  // #62 (found in game, 2026-11-18): a place of the mod without a market that isn't a planet (a plain
  // station, a buoy, a custom object) gets vanilla's defaultOpenDialog: its description and Leave,
  // never PopulateOptions, so an option added to its menu never appears
  const plain = new Set(m.systems.flatMap((sy) => sy.entities.filter((e) => !e.market && e.kind !== 'planet' && e.kind !== 'derelict' && !e.interaction).map((e) => e.id)))
  const atPlain = (lines: string[]) => lines.map((l) => /^\$id\s*==\s*(\S+)/.exec(l.trim())?.[1]).find((id) => !!id && plain.has(id))
  const ps = s.kind === 'option' && (s.trigger || 'PopulateOptions') === 'PopulateOptions' ? atPlain(s.conditions) : undefined
  if (ps) out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: 'start' }, key: `plainopt:${q.id}`, message: `${q.title}: its start option is added at "${ps}", which has no market: vanilla's dialog there shows only its description and Leave, so the option never appears. Give it a market, or start the quest with "a dialog that opens on a trigger" (OpenInteractionDialog).` })
  for (const n of q.nodes) {
    if (n.type !== 'wait' || n.mode !== 'arrive' || !n.entity || !plain.has(n.entity) || locked.has(n.entity) || arriveTakesOver(q, n)) continue
    out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, key: `plainarrive:${q.id}:${n.id}`, message: `Arrive "${n.id}": "${n.entity}" has no market, and vanilla's dialog there shows only its description and Leave (never the menu's options), so the arrival option never appears. Set it to "takes over the arrival", or give the place a market.` })
  }
  // #62 (found in game, 2026-11-18): an arrival that takes over at a place without a menu (no market,
  // a wreck) and reaches "back to the menu" without a Dialog in between: there is no menu to go back
  // to, so the dialog closes at once and the player never reads the arrival's text or rewards
  const menuless = new Set([...plain, ...wrecks])
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  for (const n of q.nodes) {
    if (n.type !== 'wait' || n.mode !== 'arrive' || !n.entity || !menuless.has(n.entity) || !arriveTakesOver(q, n)) continue
    const seen = new Set<string>()
    let closes = false
    const walk = (id: string) => {
      if (seen.has(id) || closes) return
      seen.add(id)
      const x = byId.get(id)
      if (!x || x.type === 'dialog' || x.type === 'raid' || x.type === 'encounter' || (x.type === 'wait' && x !== n)) return
      if (x.type === 'link') { if (x.mode === 'menu') closes = true; return }
      for (const e of q.edges) if (e.from === id) walk(e.to)
    }
    walk(n.id)
    if (closes) out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, key: `menulessclose:${q.id}:${n.id}`, message: `Arrive "${n.id}" takes over at "${n.entity}", which has no menu, and goes on to "back to the menu" without a Dialog: there is nothing to go back to, so the dialog closes at once and the player never reads the arrival's text or the "Gained …" lines. End it on a Dialog node with an option (such as Leave) first.` })
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
    // H4: a Wait (an Arrive) ends the interjection's own scene: the export hands back there
    if (!n || n.type === 'note' || n.type === 'wait') continue
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

/**
 * H8: an Arrive reached from an Encounter's outcome (Defeated / Avoided) with no Stage node on the
 * way. An Arrive is gated by the quest's step, and the step is still the one set before the
 * Encounter node, so the player can fly to the place and arrive before the fight is decided.
 */
export function arriveAfterOutcomeProblems(q: QuestPlan): Problem[] {
  const out: Problem[] = []
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const pass = new Set(['dialog', 'action', 'branch', 'plugin'])
  for (const enc of q.nodes) {
    if (enc.type !== 'encounter') continue
    const seen = new Set<string>()
    const todo = q.edges.filter((e) => e.from === enc.id && (e.handle === 'defeated' || e.handle === 'avoided')).map((e) => ({ to: e.to, handle: e.handle }))
    while (todo.length) {
      const { to, handle } = todo.pop()!
      if (seen.has(to)) continue
      seen.add(to)
      const n = byId.get(to)
      if (!n) continue
      if (n.type === 'wait' && n.mode === 'arrive') {
        out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, key: `arriveafter:${q.id}:${enc.id}:${n.id}`,
          message: `Arrive "${n.id}" comes after the "${enc.encounter || enc.id}" encounter's ${handle} outcome with no Stage node between them. It is only gated by the stage set before the encounter, so the player can arrive there before the fight is decided. Put a Stage node between the outcome and the Arrive.` })
        continue
      }
      if (!pass.has(n.type)) continue
      for (const e of q.edges) if (e.from === n.id) todo.push({ to: e.to, handle })
    }
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

