/**
 * Task #69 (SagaLib 1.3): a Wait node on a MagicLib bounty's end. SagaLib watches MagicLib's memory
 * keys at the step before the node and fires "<quest>_<node>_<outcome>" (quest JSON bountyWaits),
 * like an encounter outcome. The shared golden case test/golden/bountywait.json (SagaLib) covers the
 * watcher's rules; these cover the editor: export, Problems, Play and the helpers.
 */
import { describe, expect, it } from 'vitest'
import { bountyIdsOf } from '../src/shared/bounties'
import { bountyProblems } from '../src/shared/checks/bounties'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { bountyWaitsJson, questRuntime } from '../src/shared/export/runtime'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, bountyState, endBounty, modRecord, checkBountyWaits, bountyWaitDoneKey, type RuntimeQuestJson, type SimWorld } from '../src/shared/play'
import { modsJson } from '../src/shared/modlist'
import { handlesOf, newQuest, setWaitMode } from '../src/shared/quest'
import { skipEffects } from '../src/shared/questskip'
import { modUses } from '../src/shared/moduses'
import type { ModModel } from '../src/shared/serialize'
import { bountyModel, TWENTYSEVEN_A } from './fixtures/twentyseven'
import { testModFiles, testModState } from './fixtures/testmod'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'
import type { QuestPlan, WaitNode } from '../src/shared/model'

const index = { sources: [], factions: [], people: [], markets: [], systems: [], items: [], hulls: [], variants: [], codeSystems: [], places: [] } as unknown as GameIndex
const ctx = (m: ModModel): CheckContext => ({ model: m, index, defs: {} as never, loaded: testModState(TWENTYSEVEN_A, m, {}), rules: null, styleChecks: false })
const quest = (m: ModModel, id: string) => m.quests.find((q) => q.id === id)!
const waitOf = (q: QuestPlan) => q.nodes.find((n) => n.id === 'w') as WaitNode

describe('#69: the node', () => {
  it('has one output per way a bounty ends', () => {
    expect(handlesOf(waitOf(quest(bountyModel(), 'tsa_watch'))).map((h) => h.id)).toEqual(['succeeded', 'failed', 'expired', 'dismissed'])
  })
  it('switching the mode keeps the links: next ↔ succeeded, the other outcomes go', () => {
    const q = quest(bountyModel(), 'tsa_watch')
    setWaitMode(q, 'w', 'days')
    expect(q.edges.filter((e) => e.from === 'w').map((e) => [e.handle, e.to])).toEqual([['next', 'd_won']])
    setWaitMode(q, 'w', 'bounty')
    expect(q.edges.filter((e) => e.from === 'w').map((e) => [e.handle, e.to])).toEqual([['succeeded', 'd_won']])
  })
  it('counts as using the bounty (and so MagicLib)', () => {
    const m = bountyModel()
    expect(bountyIdsOf(quest(m, 'tsa_late'))).toEqual(['tsa_b_late'])
    const uses = modUses(m, index, { sourceId: 'twentyseven_a', frameworkFiles: [] } as never).get('MagicLib') ?? []
    expect(uses.some((u) => u.label === 'Quest "Test 69 (c): the Drifter"')).toBe(true)
  })
})

describe('#69: export', () => {
  const m = bountyModel()
  const q = quest(m, 'tsa_watch')
  const c = compileQuest(q, { sagalib: true, phrases: [] })
  it('the flow doesn\'t jump into the Wait; each connected outcome is a rule on its trigger', () => {
    expect(c.rows.some((r) => /FireBest tsa_watch_w\b/.test(r.script))).toBe(false)
    const ok = c.rows.find((r) => r.script.split('\n').includes('SF_StartBounty tsa_b_watch'))
    expect(ok).toBeTruthy()
    for (const out of ['succeeded', 'failed', 'expired', 'dismissed']) {
      const r = c.rows.find((x) => x.trigger === `tsa_watch_w_${out}`)
      expect(r, out).toBeTruthy()
      expect(r!.conditions).toBe('')
    }
    // in game: "no rule found for option tsa_watch_ok". An option into a Wait (any mode) needs its own rule
    for (const [qid, opt] of [['tsa_watch', 'tsa_watch_ok'], ['tsa_late', 'tsa_late_ok']]) {
      const rows = compileQuest(quest(m, qid), { sagalib: true, phrases: [] }).rows
      const r = rows.find((x) => x.trigger === 'DialogOptionSelected' && x.conditions === `$option == ${opt}`)
      expect(r, opt).toBeTruthy()
      expect(r!.script).toContain('SF_BackToMenu')
    }
    // the option into the Wait ends the conversation without "add a Dialog" advice
    expect(c.problems.some((p) => p.key === 'menuback:tsa_watch:d_signed')).toBe(false)
  })
  it('the quest JSON lists the wait at its step, an unconnected outcome as ""', () => {
    expect(bountyWaitsJson(q)).toEqual([{ node: 'w', bounty: 'tsa_b_watch', stage: 'hunt', succeeded: 'tsa_watch_w_succeeded', failed: 'tsa_watch_w_failed', expired: 'tsa_watch_w_expired', dismissed: 'tsa_watch_w_dismissed' }])
    const q2 = quest(bountyModel(), 'tsa_watch')
    q2.edges = q2.edges.filter((e) => !(e.from === 'w' && e.handle === 'dismissed'))
    expect(bountyWaitsJson(q2)[0].dismissed).toBe('')
    expect((questRuntime(q, c) as { bountyWaits?: unknown[] }).bountyWaits).toHaveLength(1)
    expect((questRuntime(quest(m, 'tsa_job'), compileQuest(quest(m, 'tsa_job'), { sagalib: true, phrases: [] })) as Record<string, unknown>).bountyWaits).toBeUndefined()
  })
  it('the test mod writes it', () => {
    const files = testModFiles(TWENTYSEVEN_A)
    expect(files['data/sagaforge/quests/tsa_watch.json']).toContain('"bountyWaits"')
    expect(files['data/campaign/rules.csv']).toContain('tsa_late_w_expired')
    expect(files['data/config/modFiles/magicBounty_data.json']).toContain('"tsa_b_late"')
  })
  it('a days Wait: a timer at its step, and the flow no longer runs what follows at once', () => {
    const t = newQuest('tq', 'Timer', 'quest')
    t.stages = [{ id: 'go', title: 'go', journal: '', kind: 'normal', renamedFrom: [] }]
    t.nodes.push({ id: 'st', type: 'stage', x: 0, y: 0, stage: 'go' }, { id: 'w', type: 'wait', x: 0, y: 0, mode: 'days', days: 3 }, { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' })
    t.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'w' }, { id: 'c', from: 'w', handle: 'next', to: 'menu' })
    const tc = compileQuest(t, { sagalib: true, phrases: [] })
    expect(tc.rows.find((r) => r.id === 'tq_st')?.script).not.toContain('FireBest tq_w')
    // and an option into a days Wait is answered too
    const t2 = newQuest('tq2', 'Timer 2', 'quest')
    t2.nodes.push({ id: 'w', type: 'wait', x: 0, y: 0, mode: 'days', days: 3 })
    t2.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'w' })
    expect(compileQuest(t2, { sagalib: true, phrases: [] }).rows.some((r) => r.trigger === 'DialogOptionSelected' && r.conditions === '$option == tq2_accept')).toBe(true)
    expect(tc.rows.some((r) => r.trigger === 'tq_w')).toBe(true)
    expect((questRuntime(t, tc) as { timers: unknown[] }).timers).toEqual([{ node: 'w', trigger: 'tq_w', days: 3, stage: 'go' }])
  })
})

describe('#69: Problems', () => {
  const msgs = (m: ModModel) => bountyProblems(ctx(m)).map((p) => `${p.level}: ${p.message}`)
  it('the test mod has none of its own', () => {
    expect(msgs(bountyModel()).filter((x) => x.includes('Test 69'))).toEqual([])
  })
  it('no bounty, a conversation, no Stage before, unconnected outcomes', () => {
    const m = bountyModel()
    const q = quest(m, 'tsa_watch')
    waitOf(q).bounty = ''
    expect(msgs(m)).toContainEqual(expect.stringMatching(/^error: .*"Wait for a MagicLib bounty" \(w\) has no bounty/))
    waitOf(q).bounty = 'tsa_b_watch'
    q.edges = q.edges.filter((e) => !(e.from === 'w' && (e.handle === 'failed' || e.handle === 'expired' || e.handle === 'dismissed')))
    q.edges = q.edges.filter((e) => e.to !== 'st' && e.from !== 'st')
    q.edges.push({ id: 'x', from: 'take', handle: 'next', to: 'd_signed' })
    const got = msgs(m)
    expect(got).toContainEqual(expect.stringMatching(/^warning: .*\(w\): no Stage comes before it/))
    expect(got).toContainEqual(expect.stringMatching(/^warning: .*\(w\): "failed", "expired" aren't connected/))
    const conv = quest(m, 'tsa_late')
    conv.kind = 'dialog'
    expect(msgs(m)).toContainEqual(expect.stringMatching(/^error: Test 69 \(c\).*only a quest can wait/))
  })
  it('waiting for a board bounty never tested while MagicLib is optional; not when required', () => {
    const m = bountyModel()
    const late = quest(m, 'tsa_late')
    late.nodes = late.nodes.map((n) => (n.id === 'avail' && n.type === 'branch' ? { ...n, cases: [{ ...n.cases[0], conditions: ['$global.x'] }] } : n))
    expect(msgs(m)).toContainEqual(expect.stringMatching(/^warning: .*waits for the MagicLib bounty tsa_b_late but never tests its state.*waits for good/))
    m.project.mods = [{ id: 'MagicLib', name: 'MagicLib', use: 'required' }]
    expect(msgs(m).some((x) => x.includes('waits for the MagicLib bounty'))).toBe(false)
  })
})

describe('#69: Play mode', () => {
  const m = bountyModel()
  const rows = m.quests.flatMap((x) => compileQuest(x, { sagalib: true, phrases: [] }).rows)
  const rq = (id: string): RuntimeQuestJson => ({ id, bountyWaits: bountyWaitsJson(quest(m, id)) })
  // Play's newDialog(): SagaLib's trigger opens a new dialog on the player's fleet
  const fresh = (e: Engine) => { e.view = { visual: { kind: 'none' }, paragraphs: [], options: [], ended: false } }
  const run = (enabled: string[]) => {
    const w: SimWorld = { quests: m.quests, phrases: new Map(), mods: { lists: [modsJson(m.project, { id: 'twentyseven_a', name: 'x' }) as never], enabled: new Set(enabled) }, bounties: { known: (id) => id.startsWith('tsa_b_'), name: (id) => id } }
    const e = new Engine(compileRules(rows), newContext(), sagaHooks(w, newSimState()))
    modRecord(e, w.mods!)
    const watch = (id: string) => checkBountyWaits(e, w, rq(id))
    const text = () => e.view.paragraphs.map((p) => p.text).join(' | ')
    return { e, w, watch, text }
  }
  it('the quest goes on by itself when the bounty succeeds', () => {
    const { e, w, watch, text } = run(['MagicLib'])
    e.select(startOptionId(quest(m, 'tsa_watch')))
    e.select('tsa_watch_accept')
    expect(text()).toContain('contract signed')
    e.select('tsa_watch_ok')
    expect(e.get('$global.tsa_watch_step')).toBe('hunt')
    expect(watch('tsa_watch')).toEqual([])
    endBounty(e, w, 'tsa_b_watch', 'succeeded')
    const fired = watch('tsa_watch')
    expect(fired).toEqual(['tsa_watch_w_succeeded'])
    expect(watch('tsa_watch')).toEqual([])
    expect(e.view.ended).toBe(true) // "Go" ends the conversation (no menu here)
    fresh(e); e.fireBest(fired[0]) // as Play: the outcome opens its own dialog
    expect(text()).toContain('Test 69 (b) passed')
    e.select('tsa_watch_ok1')
    expect(e.get('$global.tsa_watch_state')).toBe('success')
    expect(watch('tsa_watch')).toEqual([])
    expect(e.get(bountyWaitDoneKey('tsa_watch', 'w'))).toBeUndefined()
  })
  it('a bounty that ended before the quest got to the Wait goes on at once', () => {
    const { e, w, watch, text } = run(['MagicLib'])
    e.set('$global.tsa_b_late', false as never)
    endBounty(e, w, 'tsa_b_late', 'expired')
    expect(watch('tsa_late')).toEqual([]) // the quest hasn't started
    e.select(startOptionId(quest(m, 'tsa_late')))
    e.select('tsa_late_accept')
    expect(text()).toContain('will watch')
    const fired = watch('tsa_late')
    expect(fired).toEqual(['tsa_late_w_expired'])
    fresh(e); e.fireBest(fired[0])
    expect(text()).toContain('Test 69 (c) passed')
  })
  it('without MagicLib the quest says so and nothing waits', () => {
    const { e, w, watch, text } = run([])
    e.select(startOptionId(quest(m, 'tsa_watch')))
    e.select('tsa_watch_accept')
    expect(text()).toContain('Test 69 (f)')
    expect(e.get('$global.tsa_watch_state')).toBeUndefined()
    expect(bountyState(e, w, null, 'tsa_b_watch')).toBe('unavailable')
    expect(watch('tsa_watch')).toEqual([])
  })
})

describe('#69: Quest skip', () => {
  it('notes that the bounty isn\'t taken or ended', () => {
    const q = quest(bountyModel(), 'tsa_watch')
    const fx = skipEffects(q, 'end_won')
    expect(fx.notes.join(' ')).toContain('MagicLib bounty tsa_b_watch isn\'t taken or ended')
    expect(fx.notes.join(' ')).toContain('Starts MagicLib bounty tsa_b_watch')
  })
})
