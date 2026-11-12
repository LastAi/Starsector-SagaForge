/**
 * Play mode (PLAN.md §5): runs the quest's EXPORTED rules (plus the game's, for links into vanilla
 * menus) with the rules engine and the TypeScript copy of SagaLib. Never changes the plan or the mod.
 */
import { compileQuest, nodeRuleId, startOptionId, nodeTrigger, type CompiledQuest } from '../../../shared/export/questrules'
import { compileRules, Engine, type DialogView, type PlayerState, type RuleSet } from '../../../shared/rules/engine'
import { newSimState, sagaHooks, startQuest, applyProfile, type SimState, type SimWorld } from '../../../shared/play'
import type { Phrase, QuestPlan, TestProfile } from '../../../shared/model'
import type { Value } from '../../../shared/rules/parse'
import { app } from '../state/app.svelte'
import { itemKindLookup } from '../../../shared/export/items'
import { project } from '../state/project.svelte'
import { makePlayContext, itemName, factionLook } from '../state/testctx.svelte'

interface Snapshot { memory: [string, Value][]; player: PlayerState; view: DialogView; sim: SimState; logLen: number; path: string[]; day: number }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export function allPhrases(): Map<string, Phrase> {
  const m = project.m
  const out = new Map<string, Phrase>()
  if (!m) return out
  for (const p of [...m.phrases, ...m.people.flatMap((x) => x.phrases), ...m.quests.flatMap((q) => q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : [])))]) out.set(p.token, p)
  return out
}

export function world(): SimWorld {
  return { quests: project.m?.quests ?? [], phrases: allPhrases(), itemName, factionName: (id) => factionLook(id)?.name ?? id }
}

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
  profileId = $state<string>('')
  canBack = $state(false)
  private engine: Engine | null = null
  private sim: SimState = newSimState()
  private compiled: CompiledQuest | null = null
  private quest: QuestPlan | null = null
  private history: Snapshot[] = []
  private rs: RuleSet | null = null

  get engineRef(): Engine | null { return this.engine }

  async start(q: QuestPlan, fromNode?: string): Promise<void> {
    const game = await app.loadRuleSet()
    const w = world()
    const phrases = [...w.phrases.values()]
    const itemKind = itemKindLookup(project.m?.items ?? [], app.index?.items ?? [])
    // every quest of the mod (other quests' SF_ commands and conditions work too), then the game's rules
    const rows = (project.m?.quests ?? []).flatMap((x) => compileQuest(x, { sagalib: true, phrases, itemKind }).rows)
    this.compiled = compileQuest(q, { sagalib: true, phrases, itemKind })
    this.quest = q
    this.rs = compileRules([...rows, ...game.all.map((r) => r.row)])
    const ctx = makePlayContext()
    const prof = project.m?.testProfiles.find((p) => p.id === this.profileId)
    if (prof) applyProfile(ctx, $state.snapshot(prof) as TestProfile, project.m?.quests ?? [])
    this.sim = newSimState()
    this.engine = new Engine(this.rs, ctx, sagaHooks(w, this.sim))
    this.history = []
    this.path = []
    this.active = true
    const e = this.engine
    // the quest is being offered: SagaLib sets its variables when the mission is created
    for (const v of q.variables) if (v.type !== 'target' && e.get(`$global.${q.id}_${v.name}`) === undefined) e.set(`$global.${q.id}_${v.name}`, v.type === 'number' ? Number(v.initial) || 0 : v.type === 'bool' ? v.initial === 'true' : v.initial)
    if (fromNode) this.enterNode(fromNode)
    else this.enterStart(q)
    this.sync()
  }

  private enterStart(q: QuestPlan): void {
    const e = this.engine!
    const s = q.start
    if (s.kind === 'contact' || s.kind === 'bar') {
      if (s.kind === 'contact' && s.person) { e.set('$id', s.person); e.set('$isPerson', true) }
      e.fireBest(`${q.id}_blurb${s.kind === 'bar' ? 'Bar' : ''}`)
      e.view.options = [{ id: startOptionId(q), text: s.optionText || q.title, order: 0, enabled: true }, { id: '__leave', text: 'Leave', order: 99, enabled: true, shortcut: 'ESCAPE' }]
      e.log.push({ kind: 'info', text: `The ${s.kind === 'bar' ? 'bar' : 'contact'} offers "${q.title}" (person_missions / bar_events row)` })
    } else if (s.kind === 'option') {
      e.view.options = [{ id: startOptionId(q), text: s.optionText, order: 0, enabled: true }]
      e.log.push({ kind: 'info', text: `Option added to ${s.trigger} when: ${s.conditions.join(', ') || 'always'}` })
    } else if (s.kind === 'trigger') {
      e.fireBest(s.trigger)
    } else {
      startQuest(e, world(), q.id, this.sim)
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
    else e.select(optionId)
    this.markFired()
    this.sync()
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

  arrive(entity: string): void {
    const e = this.engine
    if (!e) return
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

  stop(): void { this.active = false; this.engine = null; this.path = [] }

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
    this.canBack = this.history.length > 0
  }

  ruleIdOf(nid: string): string { return this.quest ? nodeRuleId(this.quest, nid) : nid }
}

export const play = new PlayState()
