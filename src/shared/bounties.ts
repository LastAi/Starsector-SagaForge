/**
 * #27 (docs/DESIGN-MAGICLIB-BOUNTIES.md, FORMATS.md "MagicLib 1.5.6 bounties"): a MagicLib bounty
 * computed from one of the mod's encounters (the target) and optionally a simple quest (the job),
 * and the translation of Saga Forge's "where" (a fixed place or a Phase 7c random target) into
 * MagicLib's location fields. Pure; the export merges the result into the mod's
 * data/config/modFiles/magicBounty_data.json by key.
 */
import { effectiveFleet } from './encounters'
import type { GameIndex } from './api'
import type { ModModel } from './serialize'
import type { BountyPlan, Criterion, DialogNode, EncounterDef, PersonDef, QuestPlan, TargetDef } from './model'
import { criterion, targetKey, targetVars, targetVarOf } from './targets'
import { parseLooseObject } from './loosejson'
import { parseCsvRecords } from './csvedit'
import { storedName } from './personname'

export const MAGICLIB_ID = 'MagicLib'
export const BOUNTY_FILE = 'data/config/modFiles/magicBounty_data.json'
export const VAYRA_FILE = 'data/config/vayraBounties/unique_bounty_data.csv'

/** One line of the mapping report: what came from where, or what MagicLib can't do. */
export interface BountyNote { level: 'error' | 'warning' | 'info'; field: string; message: string }

export interface BountyOut {
  id: string
  /** The bounty object as written into magicBounty_data.json. */
  json: Record<string, unknown>
  notes: BountyNote[]
  quest: QuestPlan | null
  encounter: EncounterDef | null
}

type Json = Record<string, unknown>

/** MagicLib's own text tokens (MagicBountyUtilsInternal.replaceStringVariables); every other "$" becomes ==error==. */
export const MAGIC_TOKENS = ['$sonDaughterChild', '$fatherMotherParent', '$manWomanPerson', '$hisHerTheir', '$heSheThey', '$heIsSheIsTheyAre', '$himHerThem', '$himselfHerselfThemselves',
  '$system', '$location', '$constellation', '$shipName', '$shipFleet', '$givingFaction', '$rewardFaction', '$targetFaction', '$faction', '$reward', '$name', '$firstName', '$lastName']

/** Vanilla rep levels (contact minRep / maxRep) as a number inside that level (MagicLib's RepLevel.getLevelFor). */
const REP_VALUE: Record<string, number> = { VENGEFUL: -0.9, HOSTILE: -0.6, INHOSPITABLE: -0.4, SUSPICIOUS: -0.2, NEUTRAL: 0, FAVORABLE: 0.15, WELCOMING: 0.3, FRIENDLY: 0.6, COOPERATIVE: 0.9 }

/** A new bounty made from a quest or an encounter (the editor's "Make a MagicLib bounty"). */
export function newBounty(m: ModModel, from: { quest?: string; encounter?: string }): BountyPlan {
  const prefix = m.project.prefix
  const base = (from.quest ?? from.encounter ?? 'bounty').replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
  const taken = new Set((m.bounties ?? []).map((b) => b.id))
  let id = `${prefix}b_${base}`
  for (let i = 2; taken.has(id); i++) id = `${prefix}b_${base}${i}`
  return { id, ...(from.quest ? { quest: from.quest } : {}), ...(from.encounter ? { encounter: from.encounter } : {}), only: true, type: 'assassination' }
}

/** The encounter a bounty targets: its own, else its quest's (first) Encounter node. */
export function bountyEncounter(m: ModModel, b: BountyPlan): EncounterDef | null {
  const id = b.encounter || (questOf(m, b)?.nodes.find((n) => n.type === 'encounter') as { encounter?: string } | undefined)?.encounter
  return m.encounters.find((e) => e.id === id) ?? null
}
const questOf = (m: ModModel, b: BountyPlan): QuestPlan | null => (b.quest ? m.quests.find((q) => q.id === b.quest) ?? null : null)

/** Quests and encounters exported only as a bounty (not for SagaLib). */
export function bountyOnlySources(m: ModModel): { quests: Set<string>; encounters: Set<string> } {
  const quests = new Set<string>()
  const encounters = new Set<string>()
  for (const b of m.bounties ?? []) {
    if (b.only === false) continue
    if (b.quest) quests.add(b.quest)
    const e = bountyEncounter(m, b)
    if (e) encounters.add(e.id)
  }
  return { quests, encounters }
}

/** #59: the bounty ids a quest starts (Start a MagicLib bounty), tests (SF_BountyState in its lines) or waits for (a Wait node, SagaLib 1.3). */
export function bountyIdsOf(q: QuestPlan): string[] {
  const out = new Set<string>()
  const scan = (l: string) => { const mm = /^\s*!?SF_(?:BountyState|StartBounty)\s+(\S+)/.exec(l); if (mm) out.add(mm[1]) }
  for (const n of q.nodes) {
    if (n.type === 'action') for (const op of n.ops) { if (op.op === 'startBounty' && op.bounty) out.add(op.bounty); else if (op.op === 'line') scan(op.line) }
    if (n.type === 'branch') for (const c of n.cases) c.conditions.forEach(scan)
    if (n.type === 'wait' && n.mode === 'bounty' && n.bounty?.trim()) out.add(n.bounty.trim())
    if (n.type === 'dialog') { n.conditions.forEach(scan); n.script.forEach(scan); for (const o of n.options) [...(o.showIf ?? []), ...(o.disabledIf ?? [])].forEach(scan); for (const p of n.phrases) for (const cs of p.cases) cs.when.forEach(scan) }
  }
  if (q.start.kind === 'option' || q.start.kind === 'trigger' || q.start.kind === 'interject' || q.start.kind === 'barScene') q.start.conditions.forEach(scan)
  for (const r of q.requires) if ('flag' in r) scan(r.flag)
  return [...out]
}

/** #59: a trigger key nobody sets: a bounty with "On the board" off is never offered there, only started by a quest. */
export const QUEST_ONLY_KEY = '$sagaforge_bounty_quest_only'
/** #59 (SagaLib 1.3 QuestLogic.endedKey) as MagicLib's trigger key (sector memory, no "global."). */
export const questEndedTrigger = (quest: string, success: boolean) => `$sagaforge_${success ? 'success' : 'fail'}_${quest}`

/** The model without the sources that are exported only as bounties (what SagaLib gets). */
export function withoutBountyOnly(m: ModModel): ModModel {
  if (!m.bounties?.length) return m
  const only = bountyOnlySources(m)
  if (!only.quests.size && !only.encounters.size) return m
  // the comm dialogs of those encounters go too (they are scoped to a fleet SagaLib no longer spawns), unless another encounter uses one
  const kept = m.encounters.filter((e) => !only.encounters.has(e.id))
  const comms = new Set(m.encounters.filter((e) => only.encounters.has(e.id) && e.commDialog && !kept.some((k) => k.commDialog === e.commDialog)).map((e) => e.commDialog!))
  return { ...m, quests: m.quests.filter((q) => !only.quests.has(q.id) && !comms.has(q.id)), encounters: kept }
}

// ---------------------------------------------------------------- texts

/**
 * A Saga Forge text as MagicLib shows it: "%" doubled (String.format), the tokens MagicLib knows
 * turned into its own, and a note for every other "$" (MagicLib writes ==error== for it).
 */
export function magicText(text: string, field: string, notes: BountyNote[], tokens: Record<string, string>): string {
  let t = text.replace(/%/g, '%%')
  for (const [from, to] of Object.entries(tokens).sort((a, b) => b[0].length - a[0].length)) t = t.split(from).join(to)
  const lower = MAGIC_TOKENS.map((x) => x.toLowerCase())
  const bad = [...new Set((t.match(/\$[A-Za-z_][\w.]*/g) ?? []).filter((x) => !lower.some((k) => x.toLowerCase().startsWith(k))))]
  if (bad.length) notes.push({ level: 'warning', field, message: `${bad.join(', ')}: MagicLib only knows its own tokens ($name, $system, $location, $reward, …) and shows "==error==" for any other "$". Write the words instead.` })
  return t
}

/** The first text of a dialog-kind quest (a comm dialog) or of a quest's offer. */
function firstText(q: QuestPlan | null | undefined): string {
  const d = q?.nodes.find((n): n is DialogNode => n.type === 'dialog' && !!(n as DialogNode).text?.trim())
  return d?.text.trim() ?? ''
}

// ---------------------------------------------------------------- where

/** Where a bounty's fleet waits: a fixed entity or a random target of its quest. */
export type BountyWhere = { kind: 'entity'; id: string } | { kind: 'target'; quest: QuestPlan; v: string; target: TargetDef } | { kind: 'none' }

export function bountyWhere(m: ModModel, b: BountyPlan): BountyWhere {
  const q = questOf(m, b)
  const e = bountyEncounter(m, b)
  const fromTarget = (quest: QuestPlan | null, v: string): BountyWhere => {
    const tv = quest ? targetVars(quest).find((x) => x.name === v) : undefined
    return quest && tv ? { kind: 'target', quest, v, target: tv.target } : { kind: 'none' }
  }
  const place = (quest: QuestPlan | null, ref: string): BountyWhere => {
    if (ref.startsWith('place:')) {
      const p = [quest, ...m.quests].flatMap((x) => x?.places ?? []).find((x) => `place:${x.id}` === ref)
      return p?.entity ? { kind: 'entity', id: p.entity } : { kind: 'none' }
    }
    return { kind: 'entity', id: ref }
  }
  if (b.where) {
    const v = targetVarOf(b.where)
    return v ? fromTarget(q, v) : place(q, b.where)
  }
  const at = e?.spawn.at ?? ''
  if (at.startsWith('$global.')) {
    for (const quest of [q, ...m.quests]) {
      const tv = quest ? targetVars(quest).find((x) => targetKey(quest.id, x.name) === at) : undefined
      if (quest && tv) return { kind: 'target', quest, v: tv.name, target: tv.target }
    }
    return { kind: 'none' }
  }
  if (at) return place(q, at)
  const tvs = q ? targetVars(q) : []
  return tvs.length === 1 ? fromTarget(q, tvs[0].name) : { kind: 'none' }
}

/** MagicLib location fields for a Phase 7c random target, with what couldn't be said (DESIGN §3). */
export function targetToMagic(t: TargetDef): { json: Json; notes: BountyNote[] } {
  const json: Json = {}
  const notes: BountyNote[] = []
  const themes: string[] = []
  const black: string[] = []
  const entities: string[] = []
  let themeRequired = false
  let distance = ''
  const cant = (c: Criterion, why = '') => notes.push({ level: 'warning', field: 'location', message: `MagicLib can't: "${criterion(c.id)?.label ?? c.id}"${why ? ` (${why})` : ''}. The bounty leaves it out.` })
  const approx = (c: Criterion, how: string) => notes.push({ level: 'info', field: 'location', message: `"${criterion(c.id)?.label ?? c.id}" → ${how}` })
  const list = (c: Criterion, i: number): string[] => (Array.isArray(c.args[i]) ? (c.args[i] as string[]) : String(c.args[i] ?? '').split(/[\s,]+/)).filter(Boolean)
  const all = [...t.require.map((c) => ({ c, req: true })), ...t.prefer.map((c) => ({ c, req: false }))]
  if (t.pick === 'market') {
    const fac = all.filter((x) => x.c.id === 'mkFaction').flatMap((x) => list(x.c, 0))
    if (fac.length) json.location_marketFactions = [...new Set(fac)]
    else notes.push({ level: 'error', field: 'location', message: 'MagicLib picks a market only by its faction: add "Faction is" to the target, or pick a planet or system instead.' })
    for (const { c } of all) if (c.id !== 'mkFaction') cant(c, 'a market target only says the faction')
    return { json, notes }
  }
  if (t.pick === 'planet') entities.push('planet')
  for (const { c, req } of all) {
    switch (c.id) {
      case 'sysTags': {
        const mode = String(c.args[0] ?? 'ANY')
        const tags = list(c, 1)
        if (mode === 'ANY' || mode === 'ALL') {
          themes.push(...tags)
          if (req) themeRequired = true
          if (mode === 'ALL' && tags.length > 1) notes.push({ level: 'warning', field: 'location', message: `"System tags" (all of ${tags.join(', ')}): MagicLib takes a system with any one of them.` })
          else approx(c, `location_themes${req ? ' (only these systems)' : ' (preferred)'}`)
        } else if (mode === 'NOT_ANY') { black.push(...tags); approx(c, 'location_themes_blacklist') }
        else cant(c, '"not all of" has no MagicLib form')
        break
      }
      case 'sysUnexplored': json.location_prioritizeUnexplored = true; approx(c, req ? 'unexplored systems first (MagicLib falls back to explored ones)' : 'unexplored systems first'); break
      case 'sysInner': distance = 'CORE'; approx(c, 'location_distance CORE: the inner third of the sector by distance from its centre, preferred'); break
      case 'sysFringe': distance = 'FAR'; approx(c, 'location_distance FAR: the outer third of the sector, preferred'); break
      case 'sysNotBlackHole': case 'sysNotPulsar': case 'sysSafeStars':
        if (!black.includes('no_pulsar_blackhole')) black.push('no_pulsar_blackhole')
        approx(c, 'no_pulsar_blackhole (no pulsars and no black holes)')
        break
      case 'sysWithin': case 'sysOutside': cant(c, 'MagicLib measures from the sector\'s centre, not from the giver; use Inner sector or Fringe'); break
      case 'enTags': {
        const mode = String(c.args[0] ?? 'ANY')
        if (t.pick === 'entity' && (mode === 'ANY' || (mode === 'ALL' && list(c, 1).length === 1))) { entities.push(...list(c, 1)); approx(c, 'location_entities') }
        else cant(c, 'only "any of" entity tags')
        break
      }
      case 'enType': cant(c, 'MagicLib looks at entity tags, not types: use "Entity tags"'); break
      default: cant(c)
    }
  }
  if (t.pick === 'entity' && !entities.length) notes.push({ level: 'info', field: 'location', message: 'An entity target without entity tags: MagicLib waits at a stable location, planet or jump point.' })
  if (themes.length) json.location_themes = [...new Set(themes)]
  // MagicLib's own default (its template): keep fights out of colonised systems
  if (!black.includes('theme_already_occupied')) black.unshift('theme_already_occupied')
  json.location_themes_blacklist = [...new Set(black)]
  if (entities.length) json.location_entities = [...new Set(entities)]
  if (distance) json.location_distance = distance
  json.location_defaultToAnyEntity = !themeRequired
  if (t.systemFirst) notes.push({ level: 'info', field: 'location', message: '"System criteria first" has no MagicLib form (it always picks the system first).' })
  return { json, notes }
}

// ---------------------------------------------------------------- the bounty

const variantOf = (v: string) => v.trim()

/** The market ids and entity ids MagicLib's trigger_market_id needs for these markets (FORMATS.md: the quirk). */
function marketTriggerIds(m: ModModel, index: GameIndex | null, markets: string[]): string[] {
  const out: string[] = []
  for (const id of markets) {
    out.push(id)
    for (const s of m.systems) for (const x of s.entities) if (x.market?.id === id && x.id !== id) out.push(x.id)
    const mk = index?.markets?.find((k) => k.id === id)
    if (mk) for (const e of mk.entities.slice(0, 1)) if (e !== id) out.push(e)
  }
  return [...new Set(out)]
}

/** The bounty as written into magicBounty_data.json, with its mapping notes. */
export function bountyJson(m: ModModel, b: BountyPlan, index: GameIndex | null = null): BountyOut {
  const notes: BountyNote[] = []
  const json: Json = {}
  const q = questOf(m, b)
  const e = bountyEncounter(m, b)
  const err = (field: string, message: string) => notes.push({ level: 'error', field, message })
  const warn = (field: string, message: string) => notes.push({ level: 'warning', field, message })
  if (!b.id.startsWith(m.project.prefix)) err('id', `The id "${b.id}" must start with the mod's prefix ${m.project.prefix} (MagicLib's bounty ids are shared by every mod).`)
  if (b.quest && !q) err('quest', `The quest "${b.quest}" doesn't exist.`)
  if (!e) err('encounter', b.encounter ? `The encounter "${b.encounter}" doesn't exist.` : 'Pick the encounter whose fleet is the target (the quest has no Encounter node).')

  // ---- mods (MagicLib's own "only with")
  const withMods = [...new Set([...(q?.mods?.with ?? []), ...(e?.mods?.with ?? [])])]
  if ([q?.mods, e?.mods].some((x) => x?.without?.length || (x?.anyOf && (x.with?.length ?? 0) > 1))) warn('mods', 'MagicLib can only say "only with" these mods (required_mods_id): "only without" and "any one of" are left out.')
  if (withMods.length) json.required_mods_id = withMods

  // ---- the captain and texts' tokens
  const capId = e ? effectiveFleet(e, m).flagshipCommander : undefined
  const cap: PersonDef | undefined = capId ? m.people.find((p) => p.id === capId) : undefined
  const tokens: Record<string, string> = {}
  if (cap) Object.assign(tokens, { [`$${cap.id}_name`]: '$name', [`$${cap.id}_firstName`]: '$firstName', [`$${cap.id}_lastName`]: '$lastName' })
  const where = bountyWhere(m, b)
  if (where.kind === 'target') Object.assign(tokens, { [`$global.${where.quest.id}_${where.v}_system`]: '$system', [`$global.${where.quest.id}_${where.v}_name`]: '$location' })

  // ---- offer (triggers)
  const start = q?.start
  const contact = start && (start.kind === 'contact' || start.kind === 'bar') && start.person ? m.people.find((p) => p.id === start.person) : undefined
  const offerMarkets = b.offer?.markets?.length ? b.offer.markets : contact?.placement.at === 'market' ? [contact.placement.market] : []
  if (offerMarkets.length) json.trigger_market_id = marketTriggerIds(m, index, offerMarkets)
  const successEnd = q?.nodes.find((n) => n.type === 'end' && n.outcome === 'success') as { reward?: string } | undefined
  const reward = q?.rewards.find((r) => r.id === successEnd?.reward)
  const forFaction = b.forFaction || reward?.rep?.[0]?.faction || contact?.faction || ''
  if (!offerMarkets.length) {
    const fac = b.offer?.factions?.length ? b.offer.factions : forFaction ? [forFaction] : []
    if (fac.length) { json.trigger_marketFaction_any = fac; json.trigger_marketFaction_alliedWith = b.offer?.alliedWith ?? true }
    else if (b.board !== false) warn('offer', 'No market, contact or paying faction: MagicLib offers it near every market.')
  }
  if (b.offer?.minSize) json.trigger_market_minSize = b.offer.minSize
  if (b.offer?.minLevel) json.trigger_player_minLevel = b.offer.minLevel
  if (b.offer?.minDays) json.trigger_min_days_elapsed = b.offer.minDays
  if (b.offer?.minFleetPoints) json.trigger_min_fleet_size = b.offer.minFleetPoints
  if (b.offer?.weight !== undefined && b.offer.weight !== 1) json.trigger_weight_mult = b.offer.weight
  // prerequisites: Boolean flags in the sector's memory only
  const memAll: Record<string, boolean> = {}
  const memNone: Record<string, boolean> = {}
  const memAny: Record<string, boolean> = {}
  // #59: only a quest's "Start a MagicLib bounty" gives it: a key nobody sets keeps it off the board
  if (b.board === false) {
    memAll[QUEST_ONLY_KEY] = true
    notes.push({ level: 'info', field: 'offer', message: 'Not on MagicLib\'s board: only a quest\'s "Start a MagicLib bounty" gives it.' })
  }
  const only = bountyOnlySources(m).quests
  for (const r of q?.requires ?? []) {
    if ('quest' in r) {
      // #59: SagaLib 1.3 sets a true/false key when a quest ends ($global.sagaforge_success_<quest> / _fail_)
      if (only.has(r.quest)) { warn('offer', `The prerequisite "quest ${r.quest} ended": that quest is exported only as a bounty, so SagaLib never ends it. Test its bounty's own key instead ($global.<bounty>_succeeded, a flag prerequisite). Left out.`); continue }
      if (r.ended !== 'any') memAll[questEndedTrigger(r.quest, r.ended === 'success')] = true
      else if (Object.keys(memAny).length) { warn('offer', `MagicLib can test only one "ended either way" prerequisite (trigger_memKeys_any): "quest ${r.quest} ended" is left out.`); continue }
      else { memAny[questEndedTrigger(r.quest, true)] = true; memAny[questEndedTrigger(r.quest, false)] = true }
      notes.push({ level: 'info', field: 'offer', message: `The prerequisite "quest ${r.quest} ended${r.ended === 'any' ? '' : ` with ${r.ended}`}" reads SagaLib's true/false key${r.ended === 'any' ? 's' : ''} for it (set when the quest ends; SagaLib 1.3).` })
      continue
    }
    const neg = r.flag.trim().startsWith('!')
    const key = r.flag.trim().replace(/^!/, '')
    const mm = /^\$global\.(\w+)$/.exec(key)
    const is = (r.is ?? '').trim()
    if (!mm || (is && is !== 'true' && is !== 'false')) { warn('offer', `The prerequisite "${r.flag}${is ? ` == ${is}` : ''}" isn't a true/false flag in $global memory, which is all MagicLib can test. Left out.`); continue }
    const val = is ? is === 'true' : true
    if (neg) memNone[`$${mm[1]}`] = val
    else memAll[`$${mm[1]}`] = val
  }
  if (Object.keys(memAll).length) json.trigger_memKeys_all = memAll
  if (Object.keys(memNone).length) json.trigger_memKeys_none = memNone
  if (Object.keys(memAny).length) json.trigger_memKeys_any = memAny
  if (start?.kind === 'contact' && contact) {
    if (start.minRep && REP_VALUE[start.minRep] !== undefined) json.trigger_playerRelationship_atLeast = { [contact.faction]: REP_VALUE[start.minRep] }
    if (start.maxRep && REP_VALUE[start.maxRep] !== undefined) json.trigger_playerRelationship_atMost = { [contact.faction]: REP_VALUE[start.maxRep] }
  }
  if (q && q.nodes.filter((n) => n.type === 'encounter').length > 1) warn('quest', 'The quest has more than one Encounter node: the bounty is about the first one only.')
  if (q?.nodes.some((n) => n.type === 'raid' || n.type === 'wait')) notes.push({ level: 'info', field: 'quest', message: 'The quest\'s Raid and Wait nodes don\'t become part of the bounty: a bounty is find the fleet, beat it, get paid.' })

  // ---- job
  json.job_name = b.name || q?.title || e?.name || b.id
  const offerText = b.description || (start?.kind === 'contact' ? start.offerText : start?.kind === 'bar' ? start.blurb : '') || firstText(q)
  if (offerText) json.job_description = magicText(offerText, 'description', notes, tokens)
  else warn('description', 'No offer text: the board shows the job without a description.')
  const commText = b.reply || firstText(e?.commDialog ? m.quests.find((x) => x.id === e.commDialog) : null)
  if (commText) json.job_comm_reply = magicText(commText, 'reply', notes, tokens)
  const succ = b.success || q?.stages.find((s) => s.kind === 'success')?.journal || ''
  const fail = b.failure || q?.stages.find((s) => s.kind === 'fail')?.journal || ''
  if (succ) json.job_intel_success = magicText(succ, 'success', notes, tokens)
  if (fail) json.job_intel_failure = magicText(fail, 'failure', notes, tokens)
  if (b.expired) json.job_intel_expired = magicText(b.expired, 'expired', notes, tokens)
  if (forFaction) json.job_forFaction = forFaction
  json.job_deadline = b.deadline ?? q?.timeLimitDays ?? -1
  // MagicLib 1.5.6 source (task #69, in game): deadlines are off unless the player turns on LunaLib's
  // MagicLib setting "Enable Bounty Deadlines" (MagicBountyCoordinator.DEADLINES_ENABLED, default false)
  if ((json.job_deadline as number) > 0) notes.push({ level: 'info', field: 'deadline', message: `The ${json.job_deadline}-day deadline counts from acceptance, and only if the player turned on "Enable Bounty Deadlines" in LunaLib's MagicLib settings (off by default). Otherwise the bounty never expires.` })
  const credits = b.credits ?? reward?.credits ?? 0
  json.job_credit_reward = credits
  const rep = b.rep ?? (reward?.rep?.[0] ? Math.round(reward.rep[0].amount * 100) : undefined)
  if (rep !== undefined) json.job_reputation_reward = rep
  if (reward?.rep && reward.rep.length > 1) warn('rewards', 'MagicLib pays reputation with one faction only: the first of the reward\'s list.')
  if (reward?.items?.length) json.job_item_reward = Object.fromEntries(reward.items.map((i) => [i.item, i.qty]))
  if (reward?.items?.length) notes.push({ level: 'info', field: 'rewards', message: 'MagicLib puts the reward\'s items into the battle\'s loot (the player takes them after the fight).' })
  const lost = reward ? [reward.ships?.length && 'ships', reward.xp && 'XP', reward.storyPoints && 'story points', reward.personRep?.length && 'a person\'s reputation', reward.loot?.length && 'loot tables'].filter(Boolean) : []
  if (lost.length) warn('rewards', `MagicLib can't give ${lost.join(', ')}: left out of the bounty.`)
  json.job_type = b.type ?? 'assassination'
  json.job_show_type = b.show?.type ?? true
  json.job_show_captain = b.show?.captain ?? true
  json.job_show_fleet = b.show?.fleet ?? 'flagshipText'
  json.job_show_distance = b.show?.distance ?? 'vanilla'
  json.job_show_arrow = b.show?.arrow ?? false
  json.job_difficultyDescription = b.difficulty || 'auto'

  // ---- target (the captain)
  if (cap) {
    Object.assign(json, {
      // #79: a one-name captain as SagaLib stores them (first empty, the one name last)
      target_first_name: storedName(cap).first, target_last_name: storedName(cap).last,
      ...(cap.portrait ? { target_portrait: cap.portrait } : {}),
      target_gender: cap.gender === 'ANY' ? 'UNDEFINED' : cap.gender,
      ...(cap.rank ? { target_rank: cap.rank } : {}), ...(cap.post ? { target_post: cap.post } : {}),
      ...(cap.personality ? { target_personality: cap.personality } : {})
    })
  }

  // ---- fleet
  if (e) {
    const f = e.fleet
    if (!f.faction) err('fleet', 'The encounter\'s fleet has no faction (MagicLib requires one).')
    json.fleet_faction = f.faction
    if (f.name) json.fleet_name = f.name
    let ships: { variant: string; name?: string }[] = []
    if (f.size === 'explicit') ships = (f.variants ?? []).map((v) => ({ variant: variantOf(v) })).filter((s) => s.variant)
    else if (f.size === 'template') {
      const t = m.fleets?.templates.find((x) => x.id === f.template)
      if (!t) err('fleet', `The fleet template "${f.template ?? ''}" doesn't exist.`)
      else {
        const fi = t.flagship ?? 0
        ships = [...t.ships.slice(fi, fi + 1), ...t.ships.filter((_, i) => i !== fi)]
        if (!f.name && t.name) json.fleet_name = t.name
      }
    }
    const flagship = b.flagship?.trim() || ships[0]?.variant || ''
    const rest = b.flagship?.trim() ? ships : ships.slice(1)
    if (!flagship) err('fleet', f.size === 'fp' ? 'A fleet sized by points needs a flagship variant for MagicLib: set "Flagship" in the bounty.' : 'The fleet has no ships.')
    else {
      json.fleet_flagship_variant = flagship
      if (!b.flagship && ships[0]?.name) json.fleet_flagship_name = ships[0].name
      if (index?.variants?.length && !index.variants.some((v) => v.id === flagship)) warn('fleet', `The variant "${flagship}" isn't in the game index: MagicLib drops a bounty whose flagship doesn't exist.`)
    }
    if (rest.length) {
      const counts: Record<string, number> = {}
      for (const s of rest) counts[s.variant] = (counts[s.variant] ?? 0) + 1
      json.fleet_preset_ships = counts
      if (rest.some((s) => s.name)) notes.push({ level: 'info', field: 'fleet', message: 'MagicLib names only the flagship: the other ships\' names are left out.' })
    }
    if (f.size === 'fp' && f.points) json.fleet_min_FP = f.points
    if (b.scaling) json.fleet_scaling_multiplier = b.scaling
    json.fleet_composition_faction = f.faction
    if (f.quality !== undefined) json.fleet_composition_quality = f.quality
    json.fleet_behavior = e.behavior === 'guard' || e.behavior === 'ambush' ? 'AGGRESSIVE' : e.behavior === 'patrol' || e.behavior === 'travel' ? 'ROAMING' : 'GUARDED'
    if (e.behavior === 'travel' || e.behavior === 'intercept-player') notes.push({ level: 'info', field: 'fleet', message: `MagicLib has no "${e.behavior}" order: the fleet ${e.behavior === 'travel' ? 'patrols its system' : 'waits at its place'}.` })
    if (e.flags.hostile) json.fleet_attitude = 'HOSTILE'
    json.fleet_no_retreat = e.flags.allowDisengage === false
    if (cap && e.fleet.flagshipCommander && m.fleets?.templates.find((t) => t.id === f.template)?.captainDiesOnDefeat === false) notes.push({ level: 'info', field: 'fleet', message: 'MagicLib makes its own captain from the person\'s name and portrait: it isn\'t the person of the mod.' })
  }

  // ---- location
  if (where.kind === 'entity') json.location_entitiesID = [where.id]
  else if (where.kind === 'target') {
    const r = targetToMagic(where.target)
    Object.assign(json, r.json)
    notes.push(...r.notes)
  } else err('location', 'Where does the fleet wait? Pick a place for the encounter, or a random target of the quest.')

  return { id: b.id, json, notes, quest: q, encounter: e }
}

/** Every bounty of the mod, by id (the keys Saga Forge owns in magicBounty_data.json). */
export function bountiesFile(m: ModModel, index: GameIndex | null = null): { want: Record<string, Json>; outs: BountyOut[] } {
  const outs = (m.bounties ?? []).map((b) => bountyJson(m, b, index))
  return { want: Object.fromEntries(outs.map((o) => [o.id, o.json])), outs }
}

// ---------------------------------------------------------------- the mod's existing bounties (read only)

export interface ExistingBounty { id: string; name: string; file: string; own: boolean }

/** Bounties in the mod's own files: magicBounty_data.json keys and vayraBounties rows; own = written by Saga Forge. */
export function existingBounties(files: Record<string, { text: string }>, ownKeys: string[]): ExistingBounty[] {
  const out: ExistingBounty[] = []
  const own = new Set(ownKeys)
  const j = files[BOUNTY_FILE]?.text
  if (j) {
    try {
      const v = parseLooseObject(j).value
      for (const [id, x] of Object.entries(v)) out.push({ id, name: String((x as Json)?.job_name ?? id), file: BOUNTY_FILE, own: own.has(id) })
    } catch { out.push({ id: '?', name: 'magicBounty_data.json can\'t be read', file: BOUNTY_FILE, own: false }) }
  }
  const c = files[VAYRA_FILE]?.text
  if (c) {
    const recs = parseCsvRecords(c)
    const head = recs[0]?.fields.map((f) => f.trim()) ?? []
    const at = (r: string[], k: string) => r[head.indexOf(k)] ?? ''
    for (const r of recs.slice(1)) {
      const id = (r.fields[0] ?? '').trim()
      if (!id || id.startsWith('#')) continue
      out.push({ id, name: `${at(r.fields, 'firstName')} ${at(r.fields, 'lastName')}`.trim() || id, file: VAYRA_FILE, own: false })
    }
  }
  return out
}
