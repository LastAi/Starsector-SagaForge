/** Quest checks (PLAN.md §5, "Problems show as a red corner on the node"; §4.4). */
import type { Problem } from '../api'
import type { QuestPlan } from '../model'
import { compileQuest } from '../export/questrules'
import { reachable } from '../quest'
import { TOKEN_RE } from '../rules/parse'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'

export function questProblems(ctx: CheckContext, q: QuestPlan): Problem[] {
  const out: Problem[] = []
  const ref = (sub?: string) => ({ page: 'quests' as const, id: q.id, sub })
  const m = ctx.model
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  const c = compileQuest(q, { sagalib: true, phrases })
  out.push(...c.problems)
  if (!ID_PATTERN.test(q.id)) out.push({ level: 'error', area: 'Quest', message: `Quest id "${q.id}" may only use lowercase letters, digits and _.`, ref: ref() })
  const pp = prefixProblem(m.project.prefix, q.id, 'Quest', ref())
  if (pp) out.push(pp)
  if (!q.nodes.some((n) => n.type === 'start')) out.push({ level: 'error', area: 'Quest', message: 'The quest has no Start node.', ref: ref() })

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
  if (q.start.kind === 'contact' && !q.start.person) out.push({ level: 'error', area: 'Quest', message: 'Start: pick the contact who offers the quest.', ref: ref('start') })
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
  for (const v of q.variables) if (v.type === 'target') out.push({ level: 'error', area: 'Quest', message: `Variable "${v.name}" is a random target: coming later (PLAN.md §11.2). Quests that use it can't be exported in 1.0.`, ref: ref(), key: `target:${q.id}:${v.name}` })
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
  return out
}

/**
 * A derelict (wreck) that a quest sends the player to is an ordinary vanilla wreck the rest of
 * the time: salvaging or recovering it removes it, and the quest can't continue (found in
 * testing, 2026-11-11). Guarded = some conversation answers OpenInteractionDialog at it outside
 * the quest's own steps (a start condition "$id == <wreck>").
 */
export function unguardedWrecks(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const quests = ctx.model.quests
  for (const s of ctx.model.systems) for (const e of s.entities) {
    if (e.kind !== 'derelict') continue
    const users = quests.filter((q) => q.stages.some((st) => st.marker === e.id) || q.nodes.some((n) => n.type === 'wait' && n.mode === 'arrive' && n.entity === e.id))
    if (!users.length) continue
    const idCond = new RegExp(`^\\$id\\s*==\\s*${e.id}(\\s|$)`)
    const guarded = quests.some((q) => q.start.kind === 'trigger' && q.start.trigger === 'OpenInteractionDialog' && q.start.conditions.some((c) => idCond.test(c.trim())))
    if (guarded) continue
    out.push({
      level: 'warning', area: 'Quest',
      message: `"${e.name}" is a wreck that ${users.map((q) => `"${q.title}"`).join(', ')} sends the player to, but at other times it's an ordinary vanilla wreck: salvaging or recovering it removes it and the quest can't continue. Add a conversation started by OpenInteractionDialog with "$id == ${e.id}" that answers until the quests are done (the example's "Wreck: Compact property").`,
      ref: { page: 'locations', id: s.id, sub: e.id }, key: `wreck:${e.id}`
    })
  }
  return out
}

