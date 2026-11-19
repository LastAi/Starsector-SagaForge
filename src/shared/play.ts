/**
 * Play mode's copy of SagaLib's behaviour (PLAN.md §3.1, §5 Play mode): the SF_ rule commands,
 * quest state in memory keys, rewards and phrases. SagaLib's Java does the same things; shared
 * golden cases (test/golden/*.json) keep the two in line.
 *
 * Memory keys (also SagaLib's, docs/FORMATS.md "SagaLib keys"):
 *   $global.<quest>_step   current step (stage) id
 *   $global.<quest>_state  active | success | fail
 *   $global.<quest>_<var>  quest variables
 */
import { comboKey, comboOf, resolveRuntime, versionFlag, versionKey, type RtVersion } from './itemversions'
import type { Engine, EngineHooks, RuleSet } from './rules/engine'
import { Engine as RulesEngine } from './rules/engine'
import { parseCondition } from './rules/parse'
import type { Phrase, PoolPlan, QuestPlan, Reward, SettingDef, SettingScale, TestProfile } from './model'
import { runtimeScale, scaleFactor, scaledCredits, scaledPoints, type RuntimeScale } from './settings'
import { levelAtLeast, repLevelOf } from './replevels'
import { branchPool, forceKey, rollPool, seedOf, SEED_KEY } from './pools'
import { javaHash } from './javarandom'
import { TARGET_DETAILS, targetFactKey, targetKey, targetsPickedAtOffer, targetVars } from './targets'
import { beforeStart } from './quest'
import type { PlayContext } from './rules/engine'

export interface QuestState { state: 'not-started' | 'active' | 'success' | 'fail'; step?: string }

export interface SimWorld {
  quests: QuestPlan[]
  /** Every phrase by token (mod-wide, people's, inline). */
  phrases: Map<string, Phrase>
  itemName?(id: string): string
  factionName?(id: string): string
  /** The mod's named pools (Phase 7a); Random branches' own pools come from the quests. */
  pools?: PoolPlan[]
  /** #60 (SagaLib 1.3): the content mods' lists of other mods and the mods enabled now (Play mode: its switches). */
  mods?: { lists: ModListJson[]; enabled: Set<string> }
  /**
   * #59 (SagaLib 1.3): what MagicLib knows (core.Bounties.Source): whether it has a bounty, its
   * memory key (default "$" + id) and its job name. Missing: every bounty is known.
   */
  bounties?: { known(id: string): boolean; memKey?(id: string): string | undefined; name?(id: string): string | undefined }
  /** #65: the names of MagicLib achievements, for the Play notice (missing: the id). */
  achievements?: { name?(id: string): string | undefined }
  /**
   * #61 (SagaLib 1.3 core.Places.World): the sector as far as quests need it: which places and
   * people exist and who owns each market. Missing: everything exists and nothing is watched.
   */
  places?: SimPlaces
  /** #62 (SagaLib 1.3): the mod's settings (an Int setting scales as a percent); missing: none. */
  settings?: SettingDef[]
  /** #62: the encounters' fleets, for the fleet size a setting scales (golden cases: runtime JSON, with per). */
  encounters?: { id: string; fleet: { size: string; points?: number; sizeScale?: SettingScale | RuntimeScale } }[]
  /** #61: a quest as SagaLib reads it (Play mode: the plan has no exported ownerChange.markets); missing: the quest itself (golden cases). */
  runtimeQuest?(id: string): RuntimeQuestJson | undefined
}

/** #61: a simulated sector (golden cases; Play mode's "market changes owner" event). */
export interface SimPlaces {
  /** An entity, market or system with this id exists. */
  place(id: string): boolean
  person(id: string): boolean
  /** The faction owning this market (an entity or market id), or null when it isn't a market. */
  owner(id: string): string | null
  /** #70: how faction A stands with B, as a RepLevel name; null = a faction doesn't exist (SagaLib: false), undefined = Play doesn't know (it asks). */
  relation?(a: string, b: string): string | null | undefined
}

/** A pool by its runtime id: a named one, or a Random branch's own (<quest>_<node>). */
export function findPool(w: SimWorld, id: string): PoolPlan | null {
  const named = w.pools?.find((p) => p.id === id)
  if (named) return named
  for (const q of w.quests) for (const n of q.nodes) if (n.type === 'branch' && n.random && !n.random.pool && `${q.id}_${n.id}` === id) return branchPool(q, n, [])
  return null
}

export interface SimState {
  quests: Record<string, QuestState>
  spawned: string[]
  journal: { quest: string; text: string; day: number }[]
  /** Encounters waiting for the user to pick an outcome (battles can't be simulated). */
  pendingOutcome: { quest: string; node: string; encounter: string } | null
  phraseLog: string[]
}

export const newSimState = (): SimState => ({ quests: {}, spawned: [], journal: [], pendingOutcome: null, phraseLog: [] })

export const stepKey = (q: string) => `$global.${q}_step`
export const stateKey = (q: string) => `$global.${q}_state`
export const varKey = (q: string, v: string) => `$global.${q}_${v}`
/** #59 (SagaLib 1.3, QuestLogic.endedKey): true once the quest ended that way; MagicLib's triggers can test it. */
export const endedKey = (q: string, success: boolean) => `$global.sagaforge_${success ? 'success' : 'fail'}_${q}`

/** Ends a quest as SagaLib's QuestLogic.end: its state and its true/false ended key. */
function endQuest(e: Engine, qid: string, success: boolean): void {
  e.set(stateKey(qid), success ? 'success' : 'fail')
  e.set(endedKey(qid, success), true)
}

export function questState(e: Engine, q: string): QuestState {
  const s = e.get(stateKey(q))
  const step = e.get(stepKey(q))
  return { state: (s === 'active' || s === 'success' || s === 'fail' ? s : 'not-started'), step: step === undefined ? undefined : String(step) }
}

/** Start a quest: state active, variables at their initial values (if not set), first step if given. */
export function startQuest(e: Engine, w: SimWorld, qid: string, sim: SimState): void {
  const q = w.quests.find((x) => x.id === qid)
  if (questState(e, qid).state === 'active') return
  e.set(stateKey(qid), 'active')
  for (const v of q?.variables ?? []) if (e.get(varKey(qid, v.name)) === undefined && v.type !== 'target') e.set(varKey(qid, v.name), parseInitial(v.type, v.initial))
  if (q) applyMockTargets(e, q)
  // #61: the owners of the markets it watches
  if (q && w.places) rememberOwners(e, w.places, w.runtimeQuest?.(qid) ?? (q as unknown as RuntimeQuestJson))
  sim.quests[qid] = questState(e, qid)
  e.log.push({ kind: 'info', text: `Quest ${q?.title ?? qid} accepted` })
}

function parseInitial(type: string, s: string): string | number | boolean {
  if (type === 'number') return Number(s) || 0
  if (type === 'bool') return s === 'true'
  return s
}

/** #62 (SagaLib 1.3 QuestLogic.reward): a reward's credits after its setting scale (the memory now). */
export function rewardCredits(e: Engine, r: Reward | { credits?: number; creditsScale?: SettingScale | RuntimeScale }, w?: SimWorld): number {
  const c = r.credits ?? 0
  if (!c || !r.creditsScale) return c
  return scaledCredits(c, scaleFactor(runtimeScale(r.creditsScale, w?.settings ?? []), (k) => e.get(k)))
}

/** #62 (SagaLib 1.3 EncounterManager): an encounter's fleet points after its setting scale; undefined = not a fleet by points. */
export function fleetPoints(e: Engine, w: SimWorld, id: string): number | undefined {
  const en = w.encounters?.find((x) => x.id === id)
  if (!en || en.fleet.size !== 'fp') return undefined
  const pts = en.fleet.points ?? 50
  return en.fleet.sizeScale ? scaledPoints(pts, scaleFactor(runtimeScale(en.fleet.sizeScale, w.settings ?? []), (k) => e.get(k))) : pts
}

export function applyReward(e: Engine, q: QuestPlan | undefined, r: Reward, w?: SimWorld): void {
  const p = e.ctx.player
  const credits = rewardCredits(e, r, w)
  if (credits !== (r.credits ?? 0)) e.log.push({ kind: 'info', text: `Reward ${r.id}: ${(r.credits ?? 0).toLocaleString('en-US')}¢ scaled by setting ${r.creditsScale?.setting} = ${credits.toLocaleString('en-US')}¢` })
  if (credits) { p.credits += credits; e.para({ kind: 'gained', text: `Gained ${credits.toLocaleString('en-US')}¢`, color: 'good', highlights: [], ref: 'credits' }) }
  for (const x of r.rep ?? []) {
    p.rep[x.faction] = Math.max(-1, Math.min(1, (p.rep[x.faction] ?? 0) + x.amount * 0.01))
    e.para({ kind: 'rep', text: `Relationship with ${e.factionName(x.faction)} ${x.amount >= 0 ? 'improved' : 'reduced'} by ${Math.abs(x.amount)}`, color: x.amount >= 0 ? 'good' : 'bad', highlights: [String(Math.abs(x.amount))], ref: x.faction })
  }
  for (const x of r.personRep ?? []) {
    p.personRep[x.person] = Math.max(-1, Math.min(1, (p.personRep[x.person] ?? 0) + x.amount * 0.01))
    e.para({ kind: 'rep', text: `Relationship with ${x.person} ${x.amount >= 0 ? 'improved' : 'reduced'} by ${Math.abs(x.amount)}`, color: x.amount >= 0 ? 'good' : 'bad', highlights: [String(Math.abs(x.amount))] })
  }
  for (const x of r.items ?? []) { p.cargo[x.item] = (p.cargo[x.item] ?? 0) + x.qty; e.para({ kind: x.qty >= 0 ? 'gained' : 'lost', text: `${x.qty >= 0 ? 'Gained' : 'Lost'} ${Math.abs(x.qty)}× ${e.itemName(x.item)}`, color: x.qty >= 0 ? 'good' : 'bad', highlights: [], ref: x.item }) }
  // Phase 8a (F7-b): rolled by vanilla's salvage roller in game; Play can't know what comes out
  for (const l of r.loot ?? []) e.para({ kind: 'note', text: `(random items from drop group ${l.group}${l.value ? `, about ${l.value.toLocaleString('en-US')}¢ worth` : `, ${l.chances ?? 1} roll${(l.chances ?? 1) === 1 ? '' : 's'}`}: rolled in game)`, color: 'gray' })
  for (const s of r.ships ?? []) { p.ships.push(s); e.para({ kind: 'gained', text: `Gained ${s}`, highlights: [s] }) }
  if (r.xp) { p.xp += r.xp; e.para({ kind: 'gained', text: `Gained ${r.xp} experience`, highlights: [String(r.xp)] }) }
  if (r.storyPoints) { p.storyPoints += r.storyPoints; e.para({ kind: 'gained', text: `Gained ${r.storyPoints} story point${r.storyPoints === 1 ? '' : 's'}`, color: 'story', highlights: [String(r.storyPoints)] }) }
  void q
}

/** Pick a phrase's text (PLAN.md §4.3): first case whose conditions all hold, or a random case. */
export function phraseText(e: Engine, p: Phrase): { text: string; chose: string } {
  if (p.mode === 'random') {
    const all = [...p.cases.map((c) => c.text), ...(p.otherwise ? [p.otherwise] : [])]
    const i = Math.floor(e.ctx.random() * all.length)
    return { text: all[i] ?? '', chose: `variant ${i + 1}` }
  }
  for (let i = 0; i < p.cases.length; i++) {
    const c = p.cases[i]
    if (c.when.every((l) => e.evalCondition(parseCondition(l)))) return { text: c.text, chose: `case ${i + 1}${c.when.length ? ` (${c.when.join(', ')})` : ''}` }
  }
  return { text: p.otherwise ?? '', chose: 'otherwise' }
}

/**
 * Phase 7c (RC-R1b): Play mode can't run vanilla's search (the sector exists only in a running
 * game), so each random target stands in with its mock: the same keys SagaLib writes when the
 * quest is offered ($global.<quest>_<var> and its facts).
 */
export const mockTargetId = (q: string, v: string) => `mock_${q}_${v}`
export function applyMockTargets(e: { get(k: string): unknown; set(k: string, v: never): void; log?: { kind: string; text: string }[] }, q: QuestPlan): void {
  for (const v of targetVars(q)) {
    if (e.get(targetKey(q.id, v.name)) !== undefined) continue
    const mk = v.target.mock ?? {}
    const set = (k: string, val: string | number) => e.set(k, val as never)
    set(targetKey(q.id, v.name), mockTargetId(q.id, v.name))
    set(targetFactKey(q.id, v.name, 'name'), mk.name || `Mock ${v.name}`)
    set(targetFactKey(q.id, v.name, 'system'), mk.system ?? '')
    set(targetFactKey(q.id, v.name, 'dist'), String(mk.dist ?? ''))
    set(targetFactKey(q.id, v.name, 'faction'), mk.faction ?? '')
    set(targetFactKey(q.id, v.name, 'factionId'), mk.factionId ?? '')
    // Phase 7d: its details (RC-R3) and person (RC-R4)
    for (const d of TARGET_DETAILS) { const x = mk.details?.[d.id]; e.set(targetFactKey(q.id, v.name, d.id), (d.kind === 'bool' ? x === true : x ?? '') as never) }
    if (v.target.person?.posts.length) { set(targetFactKey(q.id, v.name, 'person'), mockTargetId(q.id, v.name) + '_person'); set(targetFactKey(q.id, v.name, 'personName'), mk.personName || 'Mock Person') }
    e.log?.push({ kind: 'info', text: `Target ${v.name}: the mock "${mk.name || `Mock ${v.name}`}" (in game, vanilla's search picks a ${v.target.pick} when the quest ${targetsPickedAtOffer(q) ? 'is offered' : 'starts'})` })
  }
}

/**
 * #71: whether Play creates the mission before anything runs: its variables at their initial
 * values and its random targets' mocks. A contact or bar event does that with the offer; any other
 * start only when the quest starts (startQuest sets them then), so an offer that names them shows
 * the raw token, as in game. Playing from a node after the start, or with a profile where the
 * quest runs or ended, has them at once.
 */
export function createdUpFront(e: Engine, q: QuestPlan, fromNode?: string): boolean {
  if (targetsPickedAtOffer(q) || questState(e, q.id).state !== 'not-started') return true
  return !!fromNode && !beforeStart(q).has(fromNode)
}

/** Play-only options offered where vanilla's raid menu would open (RC-F4). */
export const RAID_DONE = '__sf_raid_done'
export const RAID_BACK = '__sf_raid_back'

/**
 * How a raid went, as vanilla's MarketCMD: done = the objective's trigger ($raidRestrictToTrigger),
 * then vanilla's result screens, then $raidContinueTrigger (default OpenInteractionDialog); back =
 * $raidGoBackTrigger (default PopulateOptions). All three are FireAll in vanilla.
 */
export function raidOutcome(e: Engine, which: 'done' | 'back'): void {
  e.view.options = []
  for (const p of e.view.paragraphs) p.previous = true
  const str = (k: string) => { const v = e.get(k); return v === undefined || v === '' ? null : String(v) }
  if (which === 'back') {
    e.log.push({ kind: 'choice', text: 'Raid: went back' })
    e.fireAll(str('$raidGoBackTrigger') ?? 'PopulateOptions')
    return
  }
  e.log.push({ kind: 'choice', text: 'Raid: it goes through' })
  const obj = str('$raidRestrictToTrigger')
  if (obj) e.fireAll(obj)
  e.para({ kind: 'note', text: '(vanilla\'s raid result screens: losses, experience)', color: 'gray' })
  e.fireAll(str('$raidContinueTrigger') ?? 'OpenInteractionDialog')
}

/** Engine hooks implementing SagaLib's commands, conditions and phrase tokens. */
export function sagaHooks(w: SimWorld, sim: SimState): EngineHooks {
  const quest = (id: string) => w.quests.find((q) => q.id === id)
  return {
    itemName: w.itemName,
    factionName: w.factionName,
    token(e, tok) {
      const p = w.phrases.get(tok)
      if (!p) return undefined
      const r = phraseText(e, p)
      sim.phraseLog.push(`${tok}: ${r.chose}`)
      e.log.push({ kind: 'info', text: `Phrase ${tok} used ${r.chose}` })
      return r.text
    },
    condition(e, name, args) {
      switch (name) {
        // #60 (SagaLib 1.3): as core.Mods: enabled now and recorded on at the start (no owner: every list that records it)
        case 'SF_HasMod': return w.mods ? args.length > 0 && args.every((id) => modCounts(e, w.mods!, null, id)) : undefined
        case 'SF_HasAnyMod': return w.mods ? args.length > 0 && args.some((id) => modCounts(e, w.mods!, null, id)) : undefined
        // #59 (SagaLib 1.3): as core.Bounties, from MagicLib's memory keys
        case 'SF_BountyState': return args.length >= 2 && bountyMatches(bountyState(e, w, null, args[0]), args.slice(1))
        // #70 (SagaLib 1.3): as core.Presence; unknown relations stay unknown (the engine's own guess, then Play asks)
        case 'SF_FactionRep': {
          if (args.length < 3 || !repLevelOf(args[2])) return false
          const r = (s: string) => (s.startsWith('$') ? String(e.get(s) ?? '') : s)
          const a = r(args[0]), b = r(args[1])
          // Play mode: no relation here = the engine's own lookup (the mod's starting relations), then it asks
          if (a !== b && (!w.places?.relation || w.places.relation(a, b) === undefined)) return undefined
          return factionRep(w.places, a, b, args[2]) ?? false
        }
        case 'SF_AtStep': return questState(e, args[0]).state === 'active' && questState(e, args[0]).step === args[1]
        case 'SF_QuestDone': { const s = questState(e, args[0]).state; return args[1] && args[1] !== 'any' ? s === args[1] : s === 'success' || s === 'fail' }
        case 'SF_QuestState': { const s = questState(e, args[0]).state; return s === (args[1] === 'notStarted' ? 'not-started' : args[1]) }
        case 'SF_IsTarget': {
          // as SagaLib: the place ($id), its market or its system is the picked target; or its person / spawn (Phase 7d)
          const part = args[2] === 'person' || args[2] === 'spawned' ? args[2] : ''
          const picked = e.get(part ? targetFactKey(args[0], args[1], part) : targetKey(args[0], args[1]))
          if (part) return picked !== undefined && String(e.get('$id')) === String(picked)
          if (picked === undefined) return false
          return [e.get('$id'), e.get('$market.id'), e.get('$entity.starSystem.id')].some((x) => x !== undefined && String(x) === String(picked))
        }
      }
      return undefined
    },
    command(e, name, args) {
      switch (name) {
        case 'SF_RollPool': {
          // as SagaLib (golden case pools.json): the object's seed unless "global", else the stored world seed
          const pool = findPool(w, args[0])
          if (!pool) { e.log.push({ kind: 'warn', text: `SF_RollPool: no pool "${args[0]}"` }); return false }
          const object = args[1] !== 'global'
          let base: bigint
          if (object) base = seedOf(e.get('$entity.sagaforge_salvage_seed')) ?? BigInt(javaHash(String(e.get('$entity.id') ?? 'test-object')))
          else {
            let s = seedOf(e.get(SEED_KEY))
            if (s === null) { s = BigInt(Math.floor(Math.random() * 2 ** 31)); e.set(SEED_KEY, s.toString()) }
            base = s
          }
          const fk = forceKey(pool.id)
          const f = e.get(fk)
          if (f !== undefined) e.set(fk, undefined)
          const pick = rollPool(pool, { get: (k) => e.get(k), set: (k, v) => e.set(k, v as never) }, (line) => e.evalCondition(parseCondition(line)), base, object, f === undefined ? null : String(f))
          e.log.push({ kind: 'script', text: `Pool ${pool.name || pool.id} picked ${pick}${f !== undefined ? ' (forced)' : ''}` })
          return pick !== 'nothing'
        }
        case 'BarCMD': {
          // RC-R6: back to the bar's own menu (other patrons, Leave): outside this conversation
          if (args[0] !== 'returnFromEvent') return false
          e.view.options = []
          e.para({ kind: 'note', text: '(back to the bar)', color: 'gray' })
          e.view.ended = true
          return true
        }
        case 'SF_SpawnAtTarget': {
          // Phase 7d (RC-R2): the spawn stands in as a mock id (vanilla places it in game)
          const k = targetFactKey(args[0], args[1], 'spawned')
          if (e.get(k) === undefined) e.set(k, `${mockTargetId(args[0], args[1])}_spawned`)
          e.log.push({ kind: 'script', text: `Spawned near target ${args[1]}: ${args[2]} ${args[3]}${args[4] ? ` (${args[4]})` : ''}` })
          return true
        }
        case 'MarketCMD': {
          // RC-F4: vanilla's raid menu can't be simulated: Play asks how it went (raidOutcome)
          if (args[0] !== 'raidNonMarket') return false
          e.view.options = [
            { id: RAID_DONE, text: '(Play) The raid goes through', order: 0, enabled: true },
            { id: RAID_BACK, text: '(Play) Go back', order: 1, enabled: true }
          ]
          e.log.push({ kind: 'info', text: 'Vanilla\'s raid menu opens here (marines, objectives); Play asks how it went.' })
          return true
        }
        case 'SF_StartBounty': {
          // #59: as the bridge's accept: MagicLib sets the bounty's key false (Play: its buttons end it)
          const id = args[0] ?? ''
          const why = bountyCantStart(e, w, null, id)
          if (why) { e.log.push({ kind: 'info', text: `SF_StartBounty ${id}: not started: ${why}` }); return true }
          e.set(bountyKey(w, id), false)
          const name = w.bounties?.name?.(id) ?? id
          e.para({ kind: 'text', text: `Accepted job: ${name}`, color: 'h', highlights: [] })
          e.log.push({ kind: 'script', text: `MagicLib bounty ${id} accepted: MagicLib spawns its fleet and pays when it ends (Play: pick its outcome above the dialog)` })
          return true
        }
        case 'SF_Achievement': {
          // #65: MagicLib shows its notice in the dialog and keeps it in the common data (every save)
          const id = args[0] ?? ''
          const name = w.achievements?.name?.(id) ?? id
          e.para({ kind: 'note', text: `(MagicLib) Achievement unlocked: ${name}`, color: 'h' })
          e.log.push({ kind: 'script', text: `MagicLib achievement ${id} unlocked (in game only with MagicLib; it stays unlocked in every save)` })
          return true
        }
        case 'SF_Start': startQuest(e, w, args[0], sim); return true
        case 'SF_Step': {
          const [qid, step] = args
          startQuest(e, w, qid, sim)
          e.set(stepKey(qid), step)
          const q = quest(qid)
          const st = q?.stages.find((s) => s.id === step)
          sim.quests[qid] = questState(e, qid)
          sim.journal.push({ quest: qid, text: st?.journal || st?.title || step, day: e.ctx.day })
          e.log.push({ kind: 'script', text: `Journal: ${q?.title ?? qid} → ${st?.title ?? step}` })
          // a stage marked success/fail ends the quest
          if (st?.kind === 'success' || st?.kind === 'fail') { endQuest(e, qid, st.kind === 'success'); sim.quests[qid] = questState(e, qid) }
          return true
        }
        case 'SF_End': {
          const [qid, outcome] = args
          endQuest(e, qid, outcome !== 'fail')
          sim.quests[qid] = questState(e, qid)
          e.para({ kind: 'note', text: `${quest(qid)?.title ?? qid}: ${outcome === 'fail' ? 'failed' : 'completed'}`, color: outcome === 'fail' ? 'bad' : 'good', highlights: [] })
          return true
        }
        case 'SF_Reward': {
          const q = quest(args[0])
          const r = q?.rewards.find((x) => x.id === args[1])
          if (r) applyReward(e, q, r, w)
          else e.log.push({ kind: 'warn', text: `SF_Reward: no reward "${args[1]}" in ${args[0]}` })
          return true
        }
        case 'SF_Spawn': {
          if (!sim.spawned.includes(args[0])) sim.spawned.push(args[0])
          // #62: a fleet sized by points shows its size after the settings
          const pts = fleetPoints(e, w, args[0])
          const en = w.encounters?.find((x) => x.id === args[0])
          e.log.push({ kind: 'script', text: `Fleet spawned: ${args[0]}${pts !== undefined && en?.fleet.sizeScale ? ` (${Math.round(pts * 10) / 10} fleet points: ${en.fleet.points ?? 50} scaled by setting ${en.fleet.sizeScale.setting})` : ''}` })
          return true
        }
        case 'SF_Despawn': sim.spawned = sim.spawned.filter((x) => x !== args[0]); e.log.push({ kind: 'script', text: `Fleet leaves: ${args[0]}` }); return true
        case 'SF_BackToMenu': {
          // back to the menu; with no menu here (a wreck, an entity) the dialog closes
          e.view.options = []
          e.fireAll('PopulateOptions')
          if (!e.view.options.length) { e.view.ended = true; e.log.push({ kind: 'info', text: 'No menu here: the dialog closes.' }) }
          return true
        }
      }
      return false
    }
  }
}

/** The step a quest is put in when its saved step no longer exists (PLAN.md §6, reconciliation). */
export const CHANGED_STEP = '__changed'

export interface RuntimeStage { id: string; renamedFrom?: string[] }
export interface RuntimeQuestLite { id: string; stages: RuntimeStage[] }

/**
 * Save reconciliation on load (PLAN.md §6), the same rules as SagaLib's Java:
 *  - step found → continue; step listed in a stage's renamedFrom → moved to that stage;
 *  - step gone → CHANGED_STEP (the player can abandon the quest); quest gone → left alone.
 * Only active quests are touched. Returns one line per change, for the log.
 */
export function reconcile(mem: { get(k: string): unknown; set(k: string, v: string | boolean): void }, questIds: string[], defs: RuntimeQuestLite[]): string[] {
  const log: string[] = []
  for (const qid of questIds) {
    // #59 (SagaLib 1.3): a quest that ended before 1.3 gets its true/false ended key (quietly)
    const st = mem.get(stateKey(qid))
    if (st === 'success' || st === 'fail') { if (mem.get(endedKey(qid, st === 'success')) === undefined) mem.set(endedKey(qid, st === 'success'), true); continue }
    if (st !== 'active') continue
    const def = defs.find((d) => d.id === qid)
    if (!def) { log.push(`${qid}: no longer in any mod; left as it is`); continue }
    const step = mem.get(stepKey(qid))
    if (step === undefined || step === null) continue
    const s = String(step)
    if (s === CHANGED_STEP || def.stages.some((x) => x.id === s)) continue
    const moved = def.stages.find((x) => (x.renamedFrom ?? []).includes(s))
    if (moved) { mem.set(stepKey(qid), moved.id); log.push(`${qid}: step ${s} is now ${moved.id}`) }
    else { mem.set(stepKey(qid), CHANGED_STEP); log.push(`${qid}: step ${s} no longer exists; the quest can be abandoned`) }
  }
  return log
}

/** Apply a test profile (PLAN.md §4.10) to a play context. */
export function applyProfile(ctx: PlayContext, prof: TestProfile, quests: QuestPlan[]): void {
  for (const [qid, s] of Object.entries(prof.quests)) {
    if (s.state === 'not-started') { ctx.memory.delete(stateKey(qid)); ctx.memory.delete(stepKey(qid)); continue }
    ctx.memory.set(stateKey(qid), s.state)
    if (s.step) ctx.memory.set(stepKey(qid), s.step)
    const q = quests.find((x) => x.id === qid)
    for (const v of q?.variables ?? []) if (!ctx.memory.has(varKey(qid, v.name)) && v.type !== 'target') ctx.memory.set(varKey(qid, v.name), parseInitial(v.type, v.initial))
  }
  for (const [k, v] of Object.entries(prof.flags)) ctx.memory.set(k.startsWith('$') ? k : `$${k}`, v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(Number(v)) ? Number(v) : v)
  const pl = prof.player
  if (pl.credits !== undefined) ctx.player.credits = pl.credits
  if (pl.storyPoints !== undefined) ctx.player.storyPoints = pl.storyPoints
  if (pl.commission) { ctx.player.commission = pl.commission; ctx.memory.set('$player.commissionFactionId', pl.commission); ctx.memory.set('$global.commissionFaction', pl.commission) }
  for (const [f, r] of Object.entries(pl.rep ?? {})) ctx.player.rep[f] = r
  for (const c of pl.cargo ?? []) ctx.player.cargo[c.item] = (ctx.player.cargo[c.item] ?? 0) + c.qty
  if (pl.gender) ctx.player.gender = pl.gender
}

/** A test profile from the current play state ("Copy from Play mode"). */
export function profileFromPlay(e: Engine, id: string, name: string, quests: QuestPlan[]): TestProfile {
  const prof: TestProfile = { id, name, quests: {}, flags: {}, player: { credits: e.ctx.player.credits, storyPoints: e.ctx.player.storyPoints, rep: { ...e.ctx.player.rep }, cargo: Object.entries(e.ctx.player.cargo).filter(([, n]) => n).map(([item, qty]) => ({ item, qty })) } }
  for (const q of quests) { const s = questState(e, q.id); if (s.state !== 'not-started') prof.quests[q.id] = s }
  for (const [k, v] of e.ctx.memory) {
    if (!k.startsWith('$global.') || /_(step|state)$/.test(k)) continue
    prof.flags[k] = String(v)
  }
  if (e.ctx.player.commission) prof.player.commission = e.ctx.player.commission
  return prof
}

export { RulesEngine }
export type { RuleSet }

// ---------------------------------------------------------------- #60: mod lists and the start record (SagaLib 1.3 core.Mods)

/** One content mod's data/sagaforge/mods.json. */
export interface ModListJson { mod: string; name?: string; prefix?: string; mods: { id: string; name?: string; use: string; reason?: string }[] }

type Mem = { get(k: string): unknown; set(k: string, v: never): void }
export const modRecordKey = (owner: string, mod: string) => `$global.sagaforge_mod_${owner}_${mod}`
export const modToldKey = (owner: string, mod: string) => `$global.sagaforge_modtold_${owner}_${mod}`
const recorded = (use: string) => use === 'optional' || use === 'incompatible'

/** As core.Mods.counts: enabled now, and not recorded off at the start (by the owner, or by any list that records it). */
export function modCounts(e: Mem, w: NonNullable<SimWorld['mods']>, owner: string | null, mod: string): boolean {
  if (!w.enabled.has(mod)) return false
  const own = owner ? w.lists.find((l) => l.mod === owner) : null
  if (own) return e.get(modRecordKey(own.mod, mod)) !== 'off'
  return !w.lists.some((l) => l.mods.some((x) => x.id === mod && recorded(x.use)) && e.get(modRecordKey(l.mod, mod)) === 'off')
}

/** As core.Mods.record: records what isn't recorded yet, then the differences (`owner:mod:what`), fresh ones marked told. */
export function modRecord(e: Mem, w: NonNullable<SimWorld['mods']>, tell = true): { notice: string; fresh: boolean }[] {
  const out: { notice: string; fresh: boolean }[] = []
  for (const l of w.lists) {
    for (const x of l.mods) {
      if (!recorded(x.use)) continue
      const k = modRecordKey(l.mod, x.id)
      const now = w.enabled.has(x.id)
      if (e.get(k) === undefined) e.set(k, (now ? 'on' : 'off') as never)
      const atStart = e.get(k) === 'on'
      const what = x.use === 'incompatible' ? (now ? 'incompatible' : null) : atStart && !now ? 'removed' : !atStart && now ? 'added' : null
      const tk = modToldKey(l.mod, x.id)
      if (!what) { if (tell) e.set(tk, undefined as never); continue }
      const fresh = e.get(tk) !== what
      if (tell) e.set(tk, what as never)
      out.push({ notice: `${l.mod}:${x.id}:${what}`, fresh })
    }
  }
  return out
}

/** As core.Mods.blocked: null when the item's modsWith / modsWithout / modsAny hold. */
export function modGateBlocked(e: Mem, w: NonNullable<SimWorld['mods']>, owner: string | null, g: { modsWith?: string[]; modsWithout?: string[]; modsAny?: string[][] }): string | null {
  for (const id of g.modsWith ?? []) if (!modCounts(e, w, owner, id)) return `needs ${id}`
  for (const id of g.modsWithout ?? []) if (modCounts(e, w, owner, id)) return `only without ${id}`
  for (const grp of g.modsAny ?? []) if (!grp.some((id) => modCounts(e, w, owner, id))) return `needs one of ${grp.join(', ')}`
  return null
}

// ---------------------------------------------------------------- #64: versions by installed mods (SagaLib 1.3 core.Versions)

/** A versioned item in SagaLib's file format, with its kind and the mod that ships it. */
export interface VersionedJson { kind: string; owner: string; item: Record<string, unknown> & { versions?: RtVersion[] } }

/** The item's id in the stored choice (a factions file is its owner's). */
export const versionedId = (v: VersionedJson): string => (v.kind === 'factions' ? v.owner : String(v.item.id ?? ''))

/** Every mod an item's runtime versions name. */
export function runtimeMentioned(item: { versions?: RtVersion[] }): string[] {
  return [...new Set((item.versions ?? []).flatMap((v) => [...(v.modsWith ?? []), ...(v.modsWithout ?? []), ...(v.modsAny ?? []).flat()]))].sort()
}

/**
 * As SagaLib's version choosing: every item not chosen yet in this save gets the mods it mentions
 * that count for its owner (the start record), stored as $global.sagaforge_ver_<kind>_<id>; a
 * quest also gets $global.sfv_<quest>_<mod> for each. A stored choice never changes.
 */
export function chooseVersions(e: Mem, w: NonNullable<SimWorld['mods']>, items: VersionedJson[]): void {
  for (const v of items) {
    const id = versionedId(v)
    const k = versionKey(v.kind, id)
    if (e.get(k) !== undefined) continue
    const on = runtimeMentioned(v.item).filter((m) => modCounts(e, w, v.owner, m))
    e.set(k, comboKey(on) as never)
    if (v.kind === 'quest') for (const m of on) e.set(versionFlag(id, m), true as never)
  }
}

/** The item as the save uses it: resolved for its stored choice (a mod it no longer mentions is dropped). */
export function chosenVersion(e: Mem, v: VersionedJson): Record<string, unknown> {
  const stored = e.get(versionKey(v.kind, versionedId(v)))
  const ment = new Set(runtimeMentioned(v.item))
  const on = typeof stored === 'string' ? comboOf(stored).filter((m) => ment.has(m)) : []
  return resolveRuntime(v.item, on).value
}

// ---------------------------------------------------------------- #59: MagicLib bounties (SagaLib 1.3 core.Bounties)

export const MAGICLIB = 'MagicLib'
export const BOUNTY_STATES = ['unavailable', 'offered', 'active', 'succeeded', 'failed', 'expired', 'dismissed'] as const
export type BountyState = (typeof BOUNTY_STATES)[number]
const BOUNTY_ENDS: BountyState[] = ['succeeded', 'failed', 'expired', 'dismissed']

/** The bounty's key in rules notation: MagicLib's sector-memory "$x" is "$global.x" (default "$" + id). */
export function bountyKey(w: SimWorld, id: string): string {
  const k = (w.bounties?.memKey?.(id) ?? '').trim() || id
  return k.startsWith('$global.') ? k : `$global.${k.replace(/^\$/, '')}`
}

const magicCounts = (e: Mem, w: SimWorld, owner: string | null) => (w.mods ? modCounts(e, w.mods, owner, MAGICLIB) : true)
const bountyKnown = (w: SimWorld, id: string) => (w.bounties ? w.bounties.known(id) : true)

/** As core.Bounties.state: from MagicLib's memory keys, unavailable without MagicLib or when it doesn't have the bounty. */
export function bountyState(e: Mem, w: SimWorld, owner: string | null, id: string): BountyState {
  if (!magicCounts(e, w, owner)) return 'unavailable'
  const key = bountyKey(w, id)
  const v = e.get(key)
  if (v === undefined || v === null) return bountyKnown(w, id) ? 'offered' : 'unavailable'
  if (!truthy(v)) return 'active'
  if (truthy(e.get(`${key}_succeeded`))) return 'succeeded'
  if (truthy(e.get(`${key}_failed`))) return 'failed'
  if (truthy(e.get(`${key}_expired`))) return 'expired'
  return 'dismissed'
}

/** As core.Bounties.matches: "ended" = succeeded, failed, expired or dismissed. */
export const bountyMatches = (state: BountyState, wanted: string[]): boolean => wanted.some((x) => x === state || (x === 'ended' && BOUNTY_ENDS.includes(state)))

/** As core.Bounties.cantStart: null when SF_StartBounty may accept it (it is offered), else why not. */
export function bountyCantStart(e: Mem, w: SimWorld, owner: string | null, id: string): string | null {
  if (w.mods && !w.mods.enabled.has(MAGICLIB)) return 'MagicLib isn\'t enabled'
  if (!magicCounts(e, w, owner)) return 'MagicLib wasn\'t enabled when this game started'
  if (e.get(bountyKey(w, id)) === undefined && !bountyKnown(w, id)) return `MagicLib has no bounty "${id}"`
  const s = bountyState(e, w, owner, id)
  return s === 'offered' ? null : `it is ${s} already`
}

/** Play mode's stand-in for MagicLib ending a bounty: its key true and the outcome key, as ActiveBounty.endBounty. */
export function endBounty(e: Mem, w: SimWorld, id: string, how: 'succeeded' | 'failed' | 'expired' | 'dismissed'): void {
  const key = bountyKey(w, id)
  e.set(key, true as never)
  if (how !== 'dismissed') e.set(`${key}_${how}`, true as never)
}

function truthy(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return false
  if (typeof v === 'string') return v !== 'false'
  return true
}

// ---------------------------------------------------------------- #61: places a quest needs, markets changing owner (SagaLib 1.3 core.Places)

/** The parts of a quest's SagaLib JSON that name fixed places, people and watched markets. */
export interface RuntimeQuestJson {
  id: string
  start?: { kind?: string; person?: string; conditions?: string[] }
  stages?: { id: string; marker?: string; kind?: string }[]
  arrivals?: string[]
  modsWith?: string[]; modsWithout?: string[]; modsAny?: string[][]
  ownerChange?: { do: 'keep' | 'fail' | 'stage'; stage?: string; trigger?: string; markets: string[] }
  /** SagaLib 1.3: Wait nodes on a MagicLib bounty's end. */
  bountyWaits?: BountyWaitJson[]
}

/** SagaLib 1.3 (QuestDef.BountyWait): a Wait node on a MagicLib bounty's end; "" = that outcome fires nothing. */
export interface BountyWaitJson { node: string; bounty: string; stage?: string; succeeded?: string; failed?: string; expired?: string; dismissed?: string }

export const bountyWaitDoneKey = (quest: string, node: string) => `$global.sagaforge_bwait_${quest}_${node}_done`

/**
 * As core.BountyWaits.tick (SagaLib 1.3): a quest's waits now, the triggers to fire. Watched while
 * the active quest is at the wait's step (any step, once per run, without one); fires once when the
 * bounty has ended, also if it ended before the quest got there; forgotten when the quest isn't active.
 */
export function checkBountyWaits(e: Mem, w: SimWorld, q: RuntimeQuestJson, owner: string | null = null): string[] {
  const fire: string[] = []
  const waits = q.bountyWaits ?? []
  if (!waits.length) return fire
  const unset = (k: string) => e.set(k, undefined as never) // Engine.set: undefined deletes the key
  const active = e.get(`$global.${q.id}_state`) === 'active'
  const stepV = e.get(`$global.${q.id}_step`)
  const step = stepV === undefined || stepV === null ? null : String(stepV)
  for (const bw of waits) {
    const dk = bountyWaitDoneKey(q.id, bw.node)
    if (!active) { unset(dk); continue }
    const done = e.get(dk)
    if (done !== undefined && done !== null) {
      if (!bw.stage || String(done) === step) continue
      unset(dk) // left the step since it fired: it may watch again
    }
    if (bw.stage && bw.stage !== step) continue
    const s = bountyState(e, w, owner, bw.bounty)
    if (!BOUNTY_ENDS.includes(s)) continue
    e.set(dk, (bw.stage ? step : '*') as never)
    const t = bw[s as 'succeeded' | 'failed' | 'expired' | 'dismissed'] ?? ''
    if (t) fire.push(t)
  }
  return fire
}

const fixedId = (id: string | undefined): id is string => !!id && !id.startsWith('$')
const ID_LINE = /^\s*\$id\s*==\s*([\w-]+)\s*$/

/** As core.Places.needs: the contact, "$id ==" in the start conditions, stage markers and Arrive places. */
export function runtimeNeeds(q: RuntimeQuestJson): { places: string[]; people: string[] } {
  const places = new Set<string>()
  const people = new Set<string>()
  const st = q.start ?? {}
  if ((st.kind === 'contact' || st.kind === 'bar') && st.person) people.add(st.person)
  for (const l of st.conditions ?? []) { const x = ID_LINE.exec(l); if (x) places.add(x[1]) }
  for (const s of q.stages ?? []) if (fixedId(s.marker)) places.add(s.marker)
  for (const a of q.arrivals ?? []) if (fixedId(a)) places.add(a)
  return { places: [...places].sort(), people: [...people].sort() }
}

/** As core.Places.missing: the first person or place the quest needs that doesn't exist ("place jangala"), or null. */
export function missingNeed(p: SimPlaces, q: RuntimeQuestJson, later: Set<string> = new Set()): string | null {
  const n = runtimeNeeds(q)
  for (const id of n.people) if (!p.person(id)) return `person ${id}`
  for (const id of n.places) if (!later.has(id) && !p.place(id)) return `place ${id}`
  return null
}

/** As SagaQuest.create / QuestRuntime.start: null when the quest may be offered or started, else why not. */
export function offerBlocked(e: Mem, w: SimWorld, q: RuntimeQuestJson, owner: string | null = null): string | null {
  const g = w.mods ? modGateBlocked(e, w.mods, owner, q) : null
  if (g) return g
  if (e.get(stateKey(q.id)) === 'active') return 'it is active'
  const miss = w.places ? missingNeed(w.places, q) : null
  if (miss) return `needs ${miss}, which doesn't exist`
  // #70: not offered while its contact is away
  const away = awayContact(e, q)
  return away ? `its contact ${away} is away` : null
}

// ---------------------------------------------------------------- #70: presence by the market's owner (SagaLib 1.3 core.Presence)

export const awayKey = (person: string) => `$global.sagaforge_away_${person}`

/** As core.Presence.factionRep: A is at least `atLeast` with B (a faction with itself is COOPERATIVE); null = unknown. */
export function factionRep(p: SimPlaces | undefined, a: string, b: string, atLeast: string): boolean | null {
  if (!a || !b) return null
  return levelAtLeast(a === b ? 'COOPERATIVE' : p?.relation?.(a, b), atLeast)
}

/** A person as SagaLib's people file has them (only what presence needs). */
export interface PresencePerson { id: string; faction: string; placement?: { at: string; market?: string }; presence?: { faction?: string; atLeast: string; elsewhere?: string } }

/** As core.Presence.shouldBeAway: null when it can't be told (no presence, market gone, relation unknown). */
export function shouldBeAway(d: PresencePerson, p: SimPlaces): boolean | null {
  if (!d.presence || d.placement?.at !== 'market' || !d.placement.market) return null
  const owner = p.owner(d.placement.market)
  if (!owner) return null
  const ok = factionRep(p, owner, d.presence.faction || d.faction, d.presence.atLeast)
  return ok === null ? null : !ok
}

export interface PresenceMove { person: string; owner: string; away: boolean; changed: boolean }

/**
 * As core.Presence.check (daily, on load, after an owner change): sets each presence person's
 * away flag true/false; returns those whose flag changed, or that are away at the first check.
 */
export function checkPresence(e: Mem, people: PresencePerson[], p: SimPlaces): PresenceMove[] {
  const out: PresenceMove[] = []
  for (const d of people) {
    const away = shouldBeAway(d, p)
    if (away === null) continue
    const was = e.get(awayKey(d.id))
    const before = truthy(was)
    e.set(awayKey(d.id), away as never)
    if (was === undefined ? away : before !== away) out.push({ person: d.id, owner: p.owner(d.placement!.market!)!, away, changed: was !== undefined })
  }
  return out
}

/** As core.Presence.awayPerson: the quest's contact when they're away now, or null. */
export function awayContact(e: Mem, q: RuntimeQuestJson): string | null {
  for (const id of runtimeNeeds(q).people) if (truthy(e.get(awayKey(id)))) return id
  return null
}

export const ownersKey = (q: string) => `$global.sagaforge_owners_${q}`
export const ownerChangedKey = (q: string) => `$global.${q}_ownerChanged`
export const newOwnerKey = (q: string) => `$global.${q}_newOwner`

/** A watched market id: a random target's key is read for the picked id. */
function watchedId(e: Mem, ref: string): string | null {
  if (!ref.startsWith('$')) return ref
  const v = e.get(ref)
  return v === undefined || v === null || v === '' ? null : String(v)
}

/** "a=f1;b=f2" as pairs (market and faction ids have no ";" or "="). */
const parseOwners = (v: unknown): [string, string][] => (typeof v === 'string' && v ? v.split(';').map((x) => x.split('=') as [string, string]).filter((x) => x.length === 2) : [])
const joinOwners = (pairs: [string, string][]) => pairs.map((x) => x.join('=')).join(';')

/** As core.Places.remember: when the quest starts, the owner of each watched market (and the giver's). */
export function rememberOwners(e: Mem, p: SimPlaces, q: RuntimeQuestJson, giverMarket: string | null = null): void {
  const oc = q.ownerChange
  if (!oc) return
  const pairs: [string, string][] = []
  for (const ref of [...(oc.markets ?? []), ...(giverMarket ? [giverMarket] : [])]) {
    const id = watchedId(e, ref)
    const o = id ? p.owner(id) : null
    if (id && o && !pairs.some((x) => x[0] === id)) pairs.push([id, o])
  }
  e.set(ownersKey(q.id), joinOwners(pairs) as never)
}

export interface OwnerChange { market: string; owner: string; do: 'keep' | 'fail' | 'stage'; stage?: string; trigger?: string }

/**
 * As core.Places.check (daily, active quests only): the first watched market whose owner differs
 * from the remembered one. Sets $global.<quest>_ownerChanged / _newOwner, remembers the new owner,
 * and does what the quest says: keep, fail (the quest ends failed) or stage (the step is set; the
 * caller fires `trigger` if there is one). null = nothing changed. A market that no longer exists
 * is left as it was remembered.
 */
export function checkOwners(e: Mem, p: SimPlaces, q: RuntimeQuestJson): OwnerChange | null {
  const oc = q.ownerChange
  if (!oc || e.get(stateKey(q.id)) !== 'active') return null
  const pairs = parseOwners(e.get(ownersKey(q.id)))
  // a market picked after the start (a random target) is remembered when first seen
  for (const ref of oc.markets ?? []) { const id = watchedId(e, ref); const o = id ? p.owner(id) : null; if (id && o && !pairs.some((x) => x[0] === id)) pairs.push([id, o]) }
  let hit: [string, string] | null = null
  for (const pr of pairs) {
    const now = p.owner(pr[0])
    if (!now || now === pr[1]) continue
    pr[1] = now
    if (!hit) hit = [pr[0], now]
  }
  e.set(ownersKey(q.id), joinOwners(pairs) as never)
  if (!hit) return null
  e.set(ownerChangedKey(q.id), hit[0] as never)
  e.set(newOwnerKey(q.id), hit[1] as never)
  if (oc.do === 'fail') { e.set(stateKey(q.id), 'fail' as never); e.set(endedKey(q.id, false), true as never) }
  if (oc.do === 'stage' && oc.stage) {
    e.set(stepKey(q.id), oc.stage as never)
    const st = (q.stages ?? []).find((x) => x.id === oc.stage)
    if (st?.kind === 'success' || st?.kind === 'fail') { e.set(stateKey(q.id), st.kind as never); e.set(endedKey(q.id, st.kind === 'success'), true as never) }
  }
  return { market: hit[0], owner: hit[1], do: oc.do, ...(oc.stage ? { stage: oc.stage } : {}), ...(oc.trigger ? { trigger: oc.trigger } : {}) }
}
