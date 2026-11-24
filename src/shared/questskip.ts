/**
 * #65 (PLAN.md §10, "Nexerelin: quest skip"): the mod's quest chains on Nexerelin's new-game "skip
 * quests" screen (Saga › Quest skip), exported into data/config/exerelin/questSkip.json (merged JSON,
 * FORMATS.md "Quest skip").
 *
 * The designer picks the ending a skip means; this computes what that ending leaves in memory along
 * the shortest path from the Start node to it (SagaLib's state and step, vanilla's completed key, the
 * quest's variables, every "set" on the way) and the rewards given on the way. Nexerelin sets the flags
 * itself, but only through a plugin (FORMATS.md): every chain names SagaLib's bridge plugin, which also
 * gives the rewards (the quest JSON's "skip" section). Pure: used by the export, Problems and the panel.
 */
import type { ModModel } from './serialize'
import { unlockFlag } from './research'
import type { ActionOp, QNode, QuestPlan, QuestSkipChain, QuestSkipPlan, Reward } from './model'
import { parseScriptLine } from './rules/parse'

export const QUEST_SKIP_FILE = 'data/config/exerelin/questSkip.json'
/** SagaLib 1.3's bridge (src-optional/nexerelin): only Nexerelin loads it, by this name. */
export const QUEST_SKIP_PLUGIN = 'lastai.sagalib.bridge.nexerelin.SagaQuestSkipPlugin'
/** Nexerelin's buttons are narrow; its own names are at most 18 characters ("Extract Researcher"). */
export const SKIP_NAME_MAX = 18

export type SkipValue = boolean | number | string

/** An ending a skip can mean: an End node, or a Stage node of a success/fail stage. */
export interface SkipEnding { node: string; outcome: 'success' | 'fail'; label: string }

export function skipEndings(q: QuestPlan): SkipEnding[] {
  const out: SkipEnding[] = []
  for (const n of q.nodes) {
    if (n.type === 'end' && (n.outcome === 'success' || n.outcome === 'fail')) out.push({ node: n.id, outcome: n.outcome, label: `${n.outcome === 'success' ? 'Success' : 'Fail'} (End node ${n.id}${n.reward ? `, reward ${n.reward}` : ''})` })
    if (n.type === 'stage') {
      const st = q.stages.find((s) => s.id === n.stage)
      if (st && (st.kind === 'success' || st.kind === 'fail')) out.push({ node: n.id, outcome: st.kind, label: `${st.kind === 'success' ? 'Success' : 'Fail'} (stage "${st.title || st.id}")` })
    }
  }
  return out
}

/** The ending a new entry gets: the first success ending, else the first one. */
export function defaultEnding(q: QuestPlan): string {
  const e = skipEndings(q)
  return (e.find((x) => x.outcome === 'success') ?? e[0])?.node ?? ''
}

/** The shortest path of node ids from the Start node to `to` (Links to a node followed), or null. */
export function skipPath(q: QuestPlan, to: string): string[] | null {
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const start = q.nodes.find((n) => n.type === 'start')
  if (!start || !byId.has(to)) return null
  const prev = new Map<string, string | null>([[start.id, null]])
  const queue = [start.id]
  while (queue.length) {
    const id = queue.shift()!
    if (id === to) break
    const n = byId.get(id)
    const next = n?.type === 'link' && n.mode === 'node' ? [n.target] : q.edges.filter((e) => e.from === id).map((e) => e.to)
    for (const t of next) if (byId.has(t) && !prev.has(t)) { prev.set(t, id); queue.push(t) }
  }
  if (!prev.has(to)) return null
  const path: string[] = []
  for (let c: string | null = to; c != null; c = prev.get(c) ?? null) path.unshift(c)
  return path
}

/** A rule value as Nexerelin stores it (NexUtils.jsonToMap: booleans, numbers, text). */
export function skipValue(v: string): SkipValue {
  const t = v.trim().replace(/^"(.*)"$/, '$1')
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return t
}

/** One key the skip sets (or leaves out), as written in the quest ("$global.x"). */
export interface SkipFlag { key: string; value: SkipValue; from: string; omitted?: boolean; extra?: boolean }

export interface SkipEffects {
  /** null: the ending isn't reachable from the Start node (or isn't an ending). */
  path: string[] | null
  outcome: 'success' | 'fail' | null
  flags: SkipFlag[]
  /** What the plugin gives (the rewards named on the path, and one for the direct credits, reputation, items, XP and story points). */
  rewards: Reward[]
  /** What a skip doesn't do (keys only the dialog has, other quests started, encounters…). */
  notes: string[]
}

const keyOf = (k: string): { mem: 'sector' | 'player' | null; key: string } => {
  if (k.startsWith('$global.')) return { mem: 'sector', key: `$${k.slice(8)}` }
  if (k.startsWith('$player.')) return { mem: 'player', key: `$${k.slice(8)}` }
  return { mem: null, key: k }
}

/** What skipping `q` with this plan's ending sets and gives (without the plan's omit and extra: see {@link skipFlags}). */
export function skipEffects(q: QuestPlan, ending: string): SkipEffects {
  const end = skipEndings(q).find((e) => e.node === ending)
  const path = end ? skipPath(q, ending) : null
  const out: SkipEffects = { path, outcome: end?.outcome ?? null, flags: [], rewards: [], notes: [] }
  if (!end || !path) return out
  const flags = new Map<string, SkipFlag>()
  const set = (key: string, value: SkipValue, from: string) => { flags.delete(key); flags.set(key, { key, value, from }) }
  const note = (s: string) => { if (!out.notes.includes(s)) out.notes.push(s) }
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  set(`$global.${q.id}_state`, end.outcome, 'SagaLib: how the quest ended')
  // the step: the last Stage node on the way (SagaLib keeps it after the end too)
  const lastStage = [...path].reverse().map((id) => byId.get(id)).find((n): n is Extract<QNode, { type: 'stage' }> => n?.type === 'stage')
  if (lastStage) set(`$global.${q.id}_step`, lastStage.stage, 'SagaLib: the last stage on the way')
  if (end.outcome === 'success' && q.kind === 'quest') set(`$global.${q.id}_missionCompleted`, true, "vanilla's completed key (setCompletedKey)")
  set(`$global.sagaforge_${end.outcome}_${q.id}`, true, 'SagaLib 1.3: the quest ended this way')
  // not $global.sagaforge_skipped_<quest>: SagaLib's plugin sets it after the time pass, once it gave the
  // rewards; Nexerelin sets these flags earlier, so listing it here would make the plugin skip them
  for (const v of q.variables) {
    if (v.type === 'target') { note(`Random target "${v.name}" isn't picked (nothing is searched for a skipped quest).`); continue }
    set(`$global.${q.id}_${v.name}`, v.type === 'number' ? Number(v.initial) || 0 : v.type === 'bool' ? v.initial === 'true' : v.initial, `variable ${v.name} (initial value)`)
  }
  const direct: Reward = { id: `skip_${ending}` }
  const named = new Set<string>()
  const reward = (id: string | undefined) => { if (id && q.rewards.some((r) => r.id === id) && !named.has(id)) named.add(id) }
  const line = (raw: string, where: string) => {
    const s = parseScriptLine(raw)
    if (s.kind === 'set' || s.kind === 'unset' || s.kind === 'incr') {
      const k = keyOf(s.key)
      if (!k.mem) { note(`${s.key} (${where}) isn't set: only $global and $player keys outlast the dialog.`); return }
      if (s.kind === 'unset') { if (flags.delete(s.key)) note(`${s.key} is unset on the way, so it isn't set.`); return }
      if (s.kind === 'incr') {
        const cur = flags.get(s.key)?.value
        if (typeof cur === 'number') set(s.key, cur + s.by, `${where}: ${s.raw}`)
        else note(`${s.raw} (${where}) adds to a value the skip doesn't know; add the key under "More keys" if a later quest reads it.`)
        return
      }
      if (s.value.startsWith('$')) { note(`${s.raw} (${where}) copies another key; add it under "More keys" if needed.`); return }
      set(s.key, skipValue(s.value), `${where}: ${s.raw}`)
      return
    }
    if (s.kind !== 'command') return
    if (s.name === 'SF_Reward' && s.args[0] === q.id) reward(s.args[1])
    else if (s.name === 'AddCredits') direct.credits = (direct.credits ?? 0) + (Number(s.args[0]) || 0)
    else if (s.name === 'SF_Start' && s.args[0] && s.args[0] !== q.id) note(`Starts quest ${s.args[0]} (${where}); a skip doesn't.`)
    else if (s.name === 'SF_GrantResearch') note(`Grants research ${s.args[0] ?? '?'} (${where}); a skip doesn't.`)
    else if (s.name === 'SF_RunPlugin') note(`Runs the plugin ${s.args[0] ?? '?'} (${where}); a skip doesn't.`)
  }
  const op = (o: ActionOp, where: string) => {
    switch (o.op) {
      case 'set': line(`${o.key} = ${o.value}`, where); break
      case 'unset': line(`unset ${o.key}`, where); break
      case 'line': line(o.line, where); break
      case 'reward': reward(o.reward); break
      case 'credits': direct.credits = (direct.credits ?? 0) + o.amount; break
      case 'rep': if (o.person && o.person !== '$person') ((direct.personRep ??= []), direct.personRep).push({ person: o.person, amount: o.amount }); else if (o.faction) ((direct.rep ??= []), direct.rep).push({ faction: o.faction, amount: o.amount }); else note(`Reputation with the person talked to (${where}) isn't given: name the person.`); break
      case 'item': ((direct.items ??= []), direct.items).push({ item: o.item, qty: o.qty }); break
      case 'xp': direct.xp = (direct.xp ?? 0) + o.amount; break
      case 'storyPoints': direct.storyPoints = (direct.storyPoints ?? 0) + o.amount; break
      case 'startQuest': if (o.quest !== q.id) note(`Starts quest ${o.quest} (${where}); a skip doesn't.`); break
      case 'achievement': note(`Unlocks MagicLib achievement ${o.achievement || '?'} (${where}); a skip doesn't.`); break
      // #77: the unlock is a plain flag (set by the skip too); granting goes through SagaLib's VoK bridge
      case 'unlockResearch': if (o.tech) line(`${unlockFlag(o.tech)} = true`, where); break
      case 'grantResearch': note(`Grants research ${o.tech || '?'} (${where}); a skip doesn't.`); break
      case 'startBounty': note(`Starts MagicLib bounty ${o.bounty || '?'} (${where}); a skip doesn't, so later content sees it as not taken.`); break
      case 'removePerson': note(`Removes ${o.person} (${where}); a skip doesn't.`); break
      case 'placeEntity': case 'removeEntity': note(`${o.op === 'placeEntity' ? 'Places' : 'Removes'} ${o.entity} (${where}); a skip doesn't.`); break
      // #79: the mod's own Java doesn't run for a skipped quest
      case 'plugin': note(`Runs the plugin ${o.className || '?'} (${where}); a skip doesn't.`); break
      default: break
    }
  }
  for (const id of path) {
    const n = byId.get(id)
    if (!n) continue
    const where = `${n.type} ${('title' in n && n.title) || n.id}`
    if (n.type === 'action') for (const o of n.ops) op(o, where)
    else if (n.type === 'dialog') for (const l of n.script) line(l, where)
    else if (n.type === 'end') { reward(n.reward); if (n.achievement) note(`Unlocks MagicLib achievement ${n.achievement} (${where}); a skip doesn't.`); for (const t of n.research ?? []) if (t) note(`Grants research ${t} (${where}); a skip doesn't.`) }
    else if (n.type === 'encounter') note(`Encounter ${n.encounter} isn't spawned; its outcome on the way is taken as given.`)
    else if (n.type === 'wait' && n.mode === 'bounty') note(`MagicLib bounty ${n.bounty || '?'} isn't taken or ended; its outcome on the way is taken as given.`)
    else if (n.type === 'plugin') note(`The plugin ${n.className || '?'} (${where}) doesn't run; its result on the way is taken as given.`)
  }
  for (const id of named) { const r = q.rewards.find((x) => x.id === id); if (r) out.rewards.push(JSON.parse(JSON.stringify(r)) as Reward) }
  if (direct.credits || direct.rep?.length || direct.personRep?.length || direct.items?.length || direct.xp || direct.storyPoints) out.rewards.push(direct)
  out.flags = [...flags.values()]
  return out
}

/** The plan's flags: computed (with omitted ones marked) plus its extra keys. */
export function skipFlags(q: QuestPlan, plan: QuestSkipPlan): SkipEffects {
  const fx = skipEffects(q, plan.ending)
  const omit = new Set(plan.omit ?? [])
  fx.flags = fx.flags.map((f) => (omit.has(f.key) ? { ...f, omitted: true } : f))
  for (const x of plan.extra ?? []) {
    if (!x.key.trim()) continue
    fx.flags = fx.flags.filter((f) => f.key !== x.key.trim())
    fx.flags.push({ key: x.key.trim(), value: skipValue(x.value), from: 'More keys', extra: true })
  }
  return fx
}

/** The quests of `chain` that `questId` needs (its prerequisites, and theirs), in chain order. */
export function needsInChain(m: Pick<ModModel, 'quests'>, chain: QuestSkipChain, questId: string): string[] {
  const inChain = new Set(chain.quests.map((x) => x.quest))
  const seen = new Set<string>()
  const walk = (id: string) => {
    const q = m.quests.find((x) => x.id === id)
    for (const r of q?.requires ?? []) if ('quest' in r && inChain.has(r.quest) && !seen.has(r.quest)) { seen.add(r.quest); walk(r.quest) }
  }
  walk(questId)
  seen.delete(questId)
  return chain.quests.map((x) => x.quest).filter((id) => seen.has(id))
}

/** questSkip.json's two sections for the mod's chains (export and the panel's preview). */
export function questSkipJson(m: Pick<ModModel, 'quests' | 'project'>): { questChains: Record<string, unknown>; quests: Record<string, unknown> } {
  const questChains: Record<string, unknown> = {}
  const quests: Record<string, unknown> = {}
  for (const c of m.project.questSkip ?? []) {
    const entries = c.quests.filter((x) => m.quests.some((q) => q.id === x.quest && q.kind === 'quest' && !q.inactive))
    if (!entries.length) continue
    questChains[c.id] = {
      name: c.name || c.id, image: c.image, ...(c.sortKey ? { sortKey: c.sortKey } : {}), ...(c.tooltip ? { tooltip: c.tooltip } : {}),
      quests: entries.map((x) => x.quest), plugin: QUEST_SKIP_PLUGIN
    }
    for (const x of entries) {
      const q = m.quests.find((y) => y.id === x.quest)!
      const fx = skipFlags(q, x)
      const sector: Record<string, SkipValue> = {}
      const player: Record<string, SkipValue> = {}
      for (const f of fx.flags) {
        if (f.omitted) continue
        const k = keyOf(f.key)
        if (k.mem === 'sector') sector[k.key] = f.value
        else if (k.mem === 'player') player[k.key] = f.value
      }
      const on = needsInChain(m, c, x.quest)
      const off = entries.map((y) => y.quest).filter((id) => id !== x.quest && needsInChain(m, c, id).includes(x.quest))
      quests[x.quest] = {
        name: x.name?.trim() || q.title, ...(x.tooltip?.trim() ? { tooltip: x.tooltip.trim() } : {}),
        idsToForceOnWhenEnabled: on, idsToForceOffWhenDisabled: off,
        sectorMemFlags: sector, ...(Object.keys(player).length ? { playerMemFlags: player } : {})
      }
    }
  }
  return { questChains, quests }
}

/** Where a quest is in the chains (the first), or null. */
export function skipPlanOf(m: Pick<ModModel, 'project'>, questId: string): { chain: QuestSkipChain; plan: QuestSkipPlan } | null {
  for (const c of m.project.questSkip ?? []) { const p = c.quests.find((x) => x.quest === questId); if (p) return { chain: c, plan: p } }
  return null
}

/** The quest JSON's "skip" section for SagaLib (rewards and people the plugin gives and shows), or null. */
export function skipRuntime(m: Pick<ModModel, 'project'>, q: QuestPlan): Record<string, unknown> | null {
  const at = skipPlanOf(m, q.id)
  if (!at || q.kind !== 'quest') return null
  const rewards = at.plan.rewards === false ? [] : skipEffects(q, at.plan.ending).rewards
  const unhide = (at.plan.unhide ?? []).filter(Boolean)
  if (!rewards.length && !unhide.length) return null
  return { ...(rewards.length ? { rewards } : {}), ...(unhide.length ? { unhide } : {}) }
}

/** The mod uses Nexerelin's quest skip (SagaLib 1.3's bridge). */
export const usesQuestSkip = (m: Pick<ModModel, 'project'>): boolean => (m.project.questSkip ?? []).some((c) => c.quests.length > 0)
