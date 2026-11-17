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
import type { Engine, EngineHooks, RuleSet } from './rules/engine'
import { Engine as RulesEngine } from './rules/engine'
import { parseCondition } from './rules/parse'
import type { Phrase, PoolPlan, QuestPlan, Reward, TestProfile } from './model'
import { branchPool, forceKey, rollPool, seedOf, SEED_KEY } from './pools'
import { javaHash } from './javarandom'
import { TARGET_DETAILS, targetFactKey, targetKey, targetVars } from './targets'
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
  sim.quests[qid] = questState(e, qid)
  e.log.push({ kind: 'info', text: `Quest ${q?.title ?? qid} accepted` })
}

function parseInitial(type: string, s: string): string | number | boolean {
  if (type === 'number') return Number(s) || 0
  if (type === 'bool') return s === 'true'
  return s
}

export function applyReward(e: Engine, q: QuestPlan | undefined, r: Reward): void {
  const p = e.ctx.player
  if (r.credits) { p.credits += r.credits; e.para({ kind: 'gained', text: `Gained ${r.credits.toLocaleString('en-US')}¢`, color: 'good', highlights: [], ref: 'credits' }) }
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
    e.log?.push({ kind: 'info', text: `Target ${v.name}: the mock "${mk.name || `Mock ${v.name}`}" (in game, vanilla's search picks a ${v.target.pick} when the quest is offered)` })
  }
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
          if (st?.kind === 'success' || st?.kind === 'fail') { e.set(stateKey(qid), st.kind); sim.quests[qid] = questState(e, qid) }
          return true
        }
        case 'SF_End': {
          const [qid, outcome] = args
          e.set(stateKey(qid), outcome === 'fail' ? 'fail' : 'success')
          sim.quests[qid] = questState(e, qid)
          e.para({ kind: 'note', text: `${quest(qid)?.title ?? qid}: ${outcome === 'fail' ? 'failed' : 'completed'}`, color: outcome === 'fail' ? 'bad' : 'good', highlights: [] })
          return true
        }
        case 'SF_Reward': {
          const q = quest(args[0])
          const r = q?.rewards.find((x) => x.id === args[1])
          if (r) applyReward(e, q, r)
          else e.log.push({ kind: 'warn', text: `SF_Reward: no reward "${args[1]}" in ${args[0]}` })
          return true
        }
        case 'SF_Spawn': if (!sim.spawned.includes(args[0])) sim.spawned.push(args[0]); e.log.push({ kind: 'script', text: `Fleet spawned: ${args[0]}` }); return true
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
export function reconcile(mem: { get(k: string): unknown; set(k: string, v: string): void }, questIds: string[], defs: RuntimeQuestLite[]): string[] {
  const log: string[] = []
  for (const qid of questIds) {
    if (mem.get(stateKey(qid)) !== 'active') continue
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
