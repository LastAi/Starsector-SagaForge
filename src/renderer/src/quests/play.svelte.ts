/**
 * Play mode (PLAN.md §5): runs the quest's EXPORTED rules (plus the game's, for links into vanilla
 * menus) with the rules engine and the TypeScript copy of SagaLib. Never changes the plan or the mod.
 */
import { compileQuest, nodeRuleId, startOptionId, nodeTrigger, startStateConditions, type CompiledQuest } from '../../../shared/export/questrules'
import { parseCondition } from '../../../shared/rules/parse'
import { lockedEntityIds } from '../../../shared/patterns'
import { forceKey } from '../../../shared/pools'
import { defaultOf, isValueSetting, settingKey, settingValue, valueText } from '../../../shared/settings'
import type { SettingType } from '../../../shared/model'
import { compileRules, Engine, type DialogView, type PlayerState, type RuleSet } from '../../../shared/rules/engine'
import { newSimState, sagaHooks, applyProfile, raidOutcome, RAID_DONE, RAID_BACK, applyMockTargets, mockTargetId, createdUpFront, questState, type SimState, type SimWorld } from '../../../shared/play'
import type { Phrase, QuestPlan, TestProfile } from '../../../shared/model'
import type { Value } from '../../../shared/rules/parse'
import type { RuleRow } from '../../../shared/rules/types'
import { app } from '../state/app.svelte'
import { itemKindLookup } from '../../../shared/export/items'
import { project } from '../state/project.svelte'
import { makePlayContext, itemName, factionLook, editorRelation } from '../state/testctx.svelte'
import { mods } from '../state/mods.svelte'
import { lowerModConds } from '../../../shared/moduses'
import { modsJson } from '../../../shared/modlist'
import { modRecord } from '../../../shared/play'
import { addNameTokens, lowerPlacesModel, nameVersioned, resolveModel } from '../../../shared/modelversions'
import { bountyIdsOf, bountyJson } from '../../../shared/bounties'
import { bountyKey, bountyState, endBounty, checkBountyWaits, type BountyState } from '../../../shared/play'
import { bountyWaitsJson } from '../../../shared/export/runtime'
import { checkOwners, checkPresence, awayKey, type RuntimeQuestJson, type SimPlaces } from '../../../shared/play'
import { marketOf, ownerChangeJson } from '../../../shared/nexerelin'

interface Snapshot { memory: [string, Value][]; player: PlayerState; view: DialogView; sim: SimState; logLen: number; path: string[]; day: number }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/**
 * #60: the model as exported: "Only with / Only without" folded into rule conditions (Play runs what
 * the game will). #64: every item in the version the optional mods' switches pick, named places resolved.
 */
export function playModel() {
  return project.m ? lowerModConds(addNameTokens(lowerPlacesModel(resolveModel(project.m, [...mods.playMods()])), nameVersioned(project.m)), mods.effective) : null
}

export function allPhrases(): Map<string, Phrase> {
  const m = playModel()
  const out = new Map<string, Phrase>()
  if (!m) return out
  for (const p of [...m.phrases, ...m.people.flatMap((x) => x.phrases), ...m.quests.flatMap((q) => q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : [])))]) out.set(p.token, p)
  return out
}

export function world(): SimWorld {
  const pm = playModel()
  // #60: the optional mods' switches (Play mode, Test context) stand in for the mods enabled at the start of the game
  const lists = project.m && project.loaded && project.m.project.mods?.length ? [modsJson(project.m.project, { id: project.loaded.modInfo.id, name: project.loaded.modInfo.name }) as never] : []
  const enabled = mods.playEnabled()
  // #59: what MagicLib knows: the mod's own bounties (skipped by MagicLib when their required mods are off); any other id is assumed to be in another mod's file
  const own = (id: string) => (project.m?.bounties ?? []).find((b) => b.id === id)
  const job = (id: string) => { const b = own(id); return b && project.m ? bountyJson(project.m, b, app.index) : null }
  const bounties = {
    known: (id: string) => { const j = job(id); return !j || ((j.json.required_mods_id as string[] | undefined) ?? []).every((x) => enabled.has(x)) },
    name: (id: string) => String(job(id)?.json.job_name ?? id)
  }
  // #61: who owns each market (Play's 'changes owner' event overrides it); every place exists in Play
  const places: SimPlaces = { place: () => true, person: () => true, owner: (id) => playOwners[id] ?? (pm ? marketOf(id, pm, app.index)?.faction : undefined) ?? (id.startsWith('mock_') ? 'independent' : null), relation: editorRelation }
  // SagaLib 1.3: and its Wait nodes on a MagicLib bounty's end
  const runtimeQuest = (id: string): RuntimeQuestJson | undefined => { const q = pm?.quests.find((x) => x.id === id); if (!q || !pm) return undefined; const oc = ownerChangeJson(q, pm, app.index); const bw = bountyWaitsJson(q); return { id: q.id, stages: q.stages.map((st) => ({ id: st.id, kind: st.kind, marker: st.marker })), ...(oc ? { ownerChange: oc as RuntimeQuestJson['ownerChange'] } : {}), ...(bw.length ? { bountyWaits: bw } : {}) } }
  // #65: the mod's MagicLib achievements, by name
  const achievements = { name: (id: string) => project.m?.project.achievements?.find((a) => a.id === id)?.name || undefined }
  return { quests: pm?.quests ?? [], phrases: allPhrases(), itemName, factionName: (id) => factionLook(id)?.name ?? id, pools: pm?.pools ?? [], mods: { lists, enabled }, bounties, achievements, places, runtimeQuest,
    // #62: the mod's settings (multipliers) and its encounters' fleets
    settings: project.m?.project.settings ?? [], encounters: pm?.encounters ?? [] }
}

/** #61: market owners changed in this Play session (market or entity id → faction). */
const playOwners: Record<string, string> = {}

class PlayState {
  active = $state(false)
  view = $state<DialogView>({ visual: { kind: 'none' }, paragraphs: [], options: [], ended: false })
  log = $state<string[]>([])
  /** Plan node ids visited, in order. */
  path = $state<string[]>([])
  vars = $state<[string, string][]>([])
  credits = $state(0)
  storyPoints = $state(0)
  day = $state(0)
  pendingEncounters = $state<{ node: string; encounter: string }[]>([])
  /** #59: the MagicLib bounties this quest starts or tests, and their state now (Play: buttons stand in for MagicLib). */
  bounties = $state<{ id: string; state: BountyState; board: boolean }[]>([])
  /** #61: the markets this quest watches while it is active, and their owner now (Play: the 'changes owner' event). */
  watched = $state<{ id: string; owner: string }[]>([])
  /** #70: people with a presence rule and whether they're away now (Play: a switch stands in for SagaLib's daily check). */
  presence = $state<{ id: string; name: string; away: boolean }[]>([])
  /** #62: the mod's settings and their value now (Play: a control stands in for LunaLib's menu). */
  settings = $state<{ id: string; label: string; type: SettingType; choices: string[]; value: string }[]>([])
  profileId = $state<string>('')
  canBack = $state(false)
  private engine: Engine | null = null
  private sim: SimState = newSimState()
  private compiled: CompiledQuest | null = null
  private quest: QuestPlan | null = null
  private history: Snapshot[] = []
  private rs: RuleSet | null = null
  private w: SimWorld | null = null

  get engineRef(): Engine | null { return this.engine }
  /** Phase 7a: the next roll of this pool picks `entry` (as SagaLib's dev-mode force key). */
  forcePool(pool: string, entry: string) {
    if (!this.engine) return
    this.engine.set(forceKey(pool), entry)
    this.log = [...this.log, `Next roll of ${pool}: ${entry} (forced)`]
  }

  async start(q: QuestPlan, fromNode?: string): Promise<void> {
    const game = await app.loadRuleSet()
    const w = world()
    this.w = w
    const phrases = [...w.phrases.values()]
    const itemKind = itemKindLookup(project.m?.items ?? [], app.index?.items ?? [])
    // every quest of the mod (other quests' SF_ commands and conditions work too), then the game's rules
    const rows = w.quests.flatMap((x) => compileQuest(x, { sagalib: true, phrases, itemKind, lockedEntities: lockedEntityIds(project.m?.quests ?? []) }).rows)
    // #60: the quest as exported (its options' and cases' mod conditions are SF_HasMod lines)
    const lq = w.quests.find((x) => x.id === q.id) ?? q
    this.compiled = compileQuest(lq, { sagalib: true, phrases, itemKind, lockedEntities: lockedEntityIds(project.m?.quests ?? []) })
    this.quest = q
    // the mod's own exported rules are an older copy of the rows above: leave them out, or a FireAll
    // trigger (a node's "_options") would run both copies
    const own = app.index?.activeSourceId
    const qids = (project.m?.quests ?? []).map((x) => `${x.id}_`)
    const fresh = new Set(rows.map((r) => r.id))
    const stale = (r: RuleRow) => r.sourceId === own && (fresh.has(r.id) || qids.some((p) => r.id.startsWith(p)))
    this.rs = compileRules([...rows, ...game.all.map((r) => r.row).filter((r) => !stale(r))])
    const ctx = makePlayContext()
    const prof = project.m?.testProfiles.find((p) => p.id === this.profileId)
    if (prof) applyProfile(ctx, $state.snapshot(prof) as TestProfile, project.m?.quests ?? [])
    this.sim = newSimState()
    this.engine = new Engine(this.rs, ctx, sagaHooks(w, this.sim))
    // #60: the start record of this playthrough = the switches
    if (w.mods?.lists.length) {
      modRecord(this.engine, w.mods)
      const on = mods.optional().filter((x) => w.mods!.enabled.has(x.id)).map((x) => x.name)
      this.engine.log.push({ kind: 'info', text: `Optional mods: ${on.length ? on.join(', ') : 'none'} (Play mode switches)` })
    }
    // #61: fresh owners for the "changes owner" event
    for (const k of Object.keys(playOwners)) delete playOwners[k]
    this.history = []
    this.path = []
    this.active = true
    const e = this.engine
    // SagaLib sets the variables and searches the random targets (Phase 7c: Play's mocks) when it
    // creates the mission; #71: a contact or bar event does that with the offer, any other start
    // when the quest starts (startQuest sets them then)
    if (createdUpFront(e, q, fromNode)) {
      for (const v of q.variables) if (v.type !== 'target' && e.get(`$global.${q.id}_${v.name}`) === undefined) e.set(`$global.${q.id}_${v.name}`, v.type === 'number' ? Number(v.initial) || 0 : v.type === 'bool' ? v.initial === 'true' : v.initial)
      applyMockTargets(e, q)
    }
    if (fromNode) this.enterNode(fromNode)
    else this.enterStart(q)
    this.sync()
  }

  private enterStart(q: QuestPlan): void {
    const e = this.engine!
    const s = q.start
    // #71: the start rule tests the quest's state: not offered while it runs, nor after it ended unless repeatable
    const closed = startStateConditions(q).find((l) => !e.evalCondition(parseCondition(l)))
    if (closed) {
      const st = questState(e, q.id).state
      e.para({ kind: 'note', text: `(not offered: ${st === 'active' ? 'the quest is running' : `the quest ended (${st}) and isn't repeatable`})`, color: 'gray', highlights: [] })
      e.log.push({ kind: 'info', text: `Not offered: its start rule tests "${closed}", which is false now` })
      e.view.ended = true
      this.markFired()
      return
    }
    // #70: as SagaQuest.create: not offered while its contact is away (Test context or the Play switch)
    if ((s.kind === 'contact' || s.kind === 'bar') && s.person && e.get(awayKey(s.person)) === true) {
      e.para({ kind: 'note', text: `(not offered: ${s.person} is away; their market's owner doesn't get on with the faction they're loyal to)`, color: 'gray', highlights: [] })
      e.log.push({ kind: 'info', text: `Not offered: ${awayKey(s.person)} is true (People › Presence). Untick "${s.person} is away" and press Play again.` })
      e.view.ended = true
      this.markFired()
      return
    }
    if (s.kind === 'contact' || s.kind === 'bar') {
      if (s.kind === 'contact' && s.person) { e.set('$id', s.person); e.set('$isPerson', true) }
      e.fireBest(`${q.id}_blurb${s.kind === 'bar' ? 'Bar' : ''}`)
      e.view.options = [{ id: startOptionId(q), text: s.optionText || q.title, order: 0, enabled: true }, { id: '__leave', text: 'Leave', order: 99, enabled: true, shortcut: 'ESCAPE' }]
      e.log.push({ kind: 'info', text: `The ${s.kind === 'bar' ? 'bar' : 'contact'} offers "${q.title}" (person_missions / bar_events row)` })
    } else if (s.kind === 'barScene') {
      // RC-R6: the bar shows the blurb and the option (its chance and once-limit apply in game)
      e.para({ kind: 'text', text: s.blurb })
      e.view.options = [{ id: startOptionId(q), text: s.optionText || q.title, order: 0, enabled: true }, { id: '__leave', text: 'Leave the bar', order: 99, enabled: true, shortcut: 'ESCAPE' }]
      e.log.push({ kind: 'info', text: `Bar scene (AddBarEvents) when: ${[...s.conditions, s.probability !== undefined && s.probability < 1 ? `chance ${s.probability}` : '', s.once && s.once !== 'none' ? `once per ${s.once}` : ''].filter(Boolean).join(', ') || 'always'}` })
    } else if (s.kind === 'option') {
      e.view.options = [{ id: startOptionId(q), text: s.optionText, order: 0, enabled: true }]
      e.log.push({ kind: 'info', text: `Option added to ${s.trigger} when: ${s.conditions.join(', ') || 'always'}` })
    } else if (s.kind === 'trigger') {
      e.fireBest(s.trigger)
    } else if (s.kind === 'interject') {
      // RC-F2: the player picks the option it cuts into and the interjection wins (its chance and
      // once-limit apply in game); #71: the quest starts where its chart starts it, not here
      e.log.push({ kind: 'info', text: `Interjection before "${s.option}" when: ${s.conditions.join(', ') || 'always'}` })
      const go = this.rs?.byId.get(`${q.id}_start_go`)
      if (go) { e.set('$option', s.option); e.apply(go) } else e.log.push({ kind: 'warn', text: 'The Start node leads nowhere.' })
    } else {
      // started by another quest: Play jumps into its first node, as a Link from that quest would.
      // #71: the quest starts at its first Stage node; play the quest that starts it to see its
      // "Start another quest" (the targets are picked there)
      e.log.push({ kind: 'info', text: 'Started by another quest: Play jumps into its first node; the quest starts at its first Stage node (or earlier, when the quest that starts it runs "Start another quest" first)' })
      const first = q.edges.find((x) => x.from === q.nodes.find((n) => n.type === 'start')?.id)
      if (first) e.fireBest(nodeTrigger(q, first.to))
    }
    this.markFired()
  }

  /** "Play from selected node": enter it as if reached normally. */
  private enterNode(nid: string): void {
    const e = this.engine!
    const q = this.quest!
    const en = this.compiled!.entry[nid]
    if (!en) { e.log.push({ kind: 'warn', text: `Can't start at "${nid}": it isn't exported as a rule.` }); return }
    if (en.trigger === 'DialogOptionSelected') { e.set('$option', en.conds[0].replace(/^\$option == /, '')); e.fireBest('DialogOptionSelected') }
    else e.fireBest(en.trigger)
    void q
    this.markFired()
  }

  private markFired(): void {
    const e = this.engine!
    for (const rid of e.fired) {
      const n = this.compiled?.nodeOf[rid]
      if (n && this.path[this.path.length - 1] !== n) this.path = [...this.path, n]
    }
    e.fired = []
  }

  private snapshot(): void {
    const e = this.engine!
    this.history.push({ memory: [...e.ctx.memory], player: clone(e.ctx.player), view: clone(e.view), sim: clone(this.sim), logLen: e.log.length, path: [...this.path], day: e.ctx.day })
  }

  choose(optionId: string): void {
    const e = this.engine
    if (!e) return
    this.snapshot()
    if (optionId === '__leave') { e.view.ended = true; e.log.push({ kind: 'info', text: 'You leave.' }) }
    else if (optionId === RAID_DONE || optionId === RAID_BACK) raidOutcome(e, optionId === RAID_DONE ? 'done' : 'back')
    else e.select(optionId)
    this.markFired()
    // SagaLib 1.3: once the dialog is closed, a Wait on a bounty that already ended goes on (SagaLib's next check)
    if (e.view.ended) this.watchBounties(false)
    this.sync()
  }

  /**
   * SagaLib 1.3: the campaign script's check of Wait nodes on a MagicLib bounty's end, in every quest
   * of the playthrough; each trigger opens its own dialog, as SagaLib's queue does.
   */
  private watchBounties(logNone: boolean): void {
    const e = this.engine
    const w = this.w
    if (!e || !w) return
    let fired = 0
    for (const q of w.quests) {
      const rq = w.runtimeQuest?.(q.id)
      if (!rq?.bountyWaits?.length) continue
      for (const t of checkBountyWaits(e, w, rq)) {
        fired++
        this.newDialog()
        e.log.push({ kind: 'script', text: `${q.title}: the bounty ended; SagaLib fires ${t}` })
        e.fireBest(t)
        this.markFired()
      }
    }
    if (!fired && logNone && this.quest?.nodes.some((n) => n.type === 'wait' && n.mode === 'bounty')) e.log.push({ kind: 'info', text: 'No Wait node continues now (the quest isn\'t at the step before one, or that outcome isn\'t connected)' })
  }

  /** Encounter outcome picked by the user (battles can't be simulated). */
  outcome(node: string, which: 'defeated' | 'avoided'): void {
    const e = this.engine
    if (!e || !this.quest) return
    this.snapshot()
    this.newDialog()
    e.log.push({ kind: 'choice', text: `Outcome: fleet ${which}` })
    e.fireBest(`${nodeTrigger(this.quest, node)}_${which}`)
    this.markFired()
    this.sync()
  }

  /** #59: what MagicLib would do: the player takes the bounty on its board, or it ends (MagicLib's memory keys). */
  bountyOutcome(id: string, how: 'taken' | 'succeeded' | 'failed' | 'expired' | 'dismissed'): void {
    const e = this.engine
    if (!e || !this.w) return
    this.snapshot()
    if (how === 'taken') e.set(bountyKey(this.w, id), false)
    else endBounty(e, this.w, id, how)
    e.log.push({ kind: 'choice', text: `MagicLib bounty ${id}: ${how === 'taken' ? 'taken on the board' : how} (MagicLib sets its keys; the quest reads them the next time a condition asks)` })
    // SagaLib 1.3: a Wait node on this bounty's end goes on by itself
    if (how !== 'taken') this.watchBounties(true)
    this.sync()
  }

  /**
   * #61: a market of the quest changes owner (an invasion, a rebellion, the dev menu): SagaLib's
   * daily check, then what the quest says (keep, fail, or go to a stage and run what follows it).
   */
  changeOwner(market: string, faction: string): void {
    const e = this.engine
    const w = this.w
    if (!e || !w?.places || !this.quest || !faction) return
    this.snapshot()
    playOwners[market] = faction
    e.log.push({ kind: 'choice', text: `Market ${market} changes owner: now ${faction} (SagaLib notices it at its next daily check)` })
    for (const q of w.quests) {
      const rq = w.runtimeQuest?.(q.id)
      if (!rq?.ownerChange) continue
      const r = checkOwners(e, w.places, rq)
      if (!r) continue
      this.sim.quests[q.id] = { state: (e.get(`$global.${q.id}_state`) as 'active') ?? 'active', step: String(e.get(`$global.${q.id}_step`) ?? '') }
      e.log.push({ kind: 'script', text: `${q.title}: ${r.market} is now ${r.owner} ($global.${q.id}_ownerChanged, _newOwner); ${r.do === 'fail' ? 'the quest fails' : r.do === 'stage' ? `goes to stage ${r.stage}` : 'it keeps going'}` })
      if (r.do === 'fail') { this.newDialog(); e.para({ kind: 'note', text: `${q.title}: failed (${r.market} changed owner)`, color: 'bad', highlights: [] }) }
      if (r.do === 'stage' && r.trigger) { this.newDialog(); e.fireBest(r.trigger) }
    }
    // #70: people whose market this is may leave or come back (when the relation is known: the mod's starting relations)
    for (const mv of checkPresence(e, (playModel()?.people ?? []).filter((p) => !!p.presence), w.places)) {
      if (mv.changed) e.log.push({ kind: 'script', text: `${mv.person} ${mv.away ? 'leaves' : 'is back'}: the market's owner is now ${mv.owner} ($global.sagaforge_away_${mv.person} = ${mv.away})` })
    }
    this.presenceNotes()
    this.markFired()
    this.sync()
  }

  /**
   * #70: a person with a presence rule leaves or comes back (their market's owner, a war, peace):
   * SagaLib's away flag. While away, their comm-directory entry is hidden and their quests aren't offered.
   */
  setAway(person: string, away: boolean): void {
    const e = this.engine
    if (!e) return
    this.snapshot()
    e.set(awayKey(person), away)
    e.log.push({ kind: 'choice', text: `${person} ${away ? 'is away (hidden from the comm directory; their quests aren\'t offered)' : 'is back'} (${awayKey(person)} = ${away})` })
    this.presenceNotes()
    this.sync()
  }

  /**
   * #62: the player changes a setting in LunaLib's menu: SagaLib's bridge sets $global.<id> at once
   * (every save shares the value). Quests read it when they decide: the next offer or Branch.
   */
  setSetting(id: string, raw: string): void {
    const e = this.engine
    const s = (project.m?.project.settings ?? []).find((x) => x.id === id)
    if (!e || !s) return
    const v = settingValue(s.type, raw) ?? defaultOf(s)
    if (v === undefined) return
    this.snapshot()
    e.set(settingKey(id), v)
    e.log.push({ kind: 'choice', text: `Setting ${s.label || id} = ${valueText(v)} (as if changed in LunaLib's menu: ${settingKey(id)}; quests read it at the next offer or Branch)` })
    this.sync()
  }

  /** #70: log quests of this playthrough whose contact is away now (SagaLib won't offer them). */
  private presenceNotes(): void {
    const e = this.engine
    if (!e || !this.w) return
    for (const q of this.w.quests) {
      const p = (q.start.kind === 'contact' || q.start.kind === 'bar') ? q.start.person : undefined
      if (p && e.get(awayKey(p)) === true && (e.get(`$global.${q.id}_state`) ?? 'notStarted') !== 'active') e.log.push({ kind: 'warn', text: `${q.title}: not offered in game while ${p} is away` })
    }
  }

  arrive(entity: string): void {
    const e = this.engine
    if (!e) return
    // Phase 7c: arriving at a random target = at its mock
    if (entity.startsWith('target:') && this.quest) { const [v, part] = entity.slice('target:'.length).split('.'); entity = mockTargetId(this.quest.id, v) + (part ? `_${part}` : '') }
    this.snapshot()
    this.newDialog()
    e.set('$id', entity)
    e.log.push({ kind: 'choice', text: `Arrived at ${entity}` })
    e.fireBest('OpenInteractionDialog')
    this.markFired()
    this.sync()
  }

  waitDays(node: string, days: number): void {
    const e = this.engine
    if (!e || !this.quest) return
    this.snapshot()
    e.ctx.day += days
    this.newDialog()
    e.log.push({ kind: 'choice', text: `${days} days pass` })
    e.fireBest(nodeTrigger(this.quest, node))
    this.markFired()
    this.sync()
  }

  private newDialog(): void {
    const e = this.engine!
    e.view = { visual: { kind: 'none' }, paragraphs: [], options: [], ended: false }
  }

  back(): void {
    const e = this.engine
    const s = this.history.pop()
    if (!e || !s) return
    e.ctx.memory = new Map(s.memory)
    e.ctx.player = s.player
    e.view = s.view
    this.sim.quests = s.sim.quests
    this.sim.spawned = s.sim.spawned
    this.sim.journal = s.sim.journal
    e.log.length = s.logLen
    e.ctx.day = s.day
    this.path = s.path
    this.sync()
  }

  stop(): void { this.active = false; this.engine = null; this.path = []; this.w = null }

  private sync(): void {
    const e = this.engine!
    this.view = clone(e.view)
    this.log = e.log.map((l) => l.text)
    const q = this.quest!
    this.vars = [...e.ctx.memory].filter(([k]) => k.startsWith(`$global.${q.id}_`) || k.startsWith('$global.') ).map(([k, v]) => [k, String(v)] as [string, string]).sort()
    this.credits = e.ctx.player.credits
    this.storyPoints = e.ctx.player.storyPoints
    this.day = e.ctx.day
    this.pendingEncounters = q.nodes.filter((n) => n.type === 'encounter' && this.sim.spawned.includes(n.encounter) && q.edges.some((x) => x.from === n.id && (x.handle === 'defeated' || x.handle === 'avoided')))
      .map((n) => ({ node: n.id, encounter: (n as { encounter: string }).encounter }))
    const w = this.w
    this.bounties = w ? bountyIdsOf(q).map((id) => ({ id, state: bountyState(e, w, null, id), board: (project.m?.bounties ?? []).find((b) => b.id === id)?.board !== false })) : []
    // #61: the watched markets of the quest while it is active
    const rq = w?.runtimeQuest?.(q.id)
    // #70: people with a presence rule (the Test context's switches set where Play starts)
    this.presence = (project.m?.people ?? []).filter((p) => !!p.presence).map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}`.trim() || p.id, away: e.get(awayKey(p.id)) === true }))
    // #62: the settings as SagaLib set them (the Test context's values or the defaults at the start)
    this.settings = (project.m?.project.settings ?? []).filter(isValueSetting).map((s) => ({ id: s.id, label: s.label || s.id, type: s.type, choices: s.choices ?? [], value: e.get(settingKey(s.id)) === undefined ? '' : valueText(e.get(settingKey(s.id))) }))
    this.watched = w?.places && rq?.ownerChange && e.get(`$global.${q.id}_state`) === 'active' ? String(e.get(`$global.sagaforge_owners_${q.id}`) ?? '').split(';').filter(Boolean).map((x) => { const [id, owner] = x.split('='); return { id, owner } }) : []
    this.canBack = this.history.length > 0
  }

  ruleIdOf(nid: string): string { return this.quest ? nodeRuleId(this.quest, nid) : nid }
}

export const play = new PlayState()
