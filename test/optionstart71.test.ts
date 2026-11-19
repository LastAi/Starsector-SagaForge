/**
 * Task #71 (in game, 2026-11-18): (1) a quest whose own rule offers it (an option, a trigger, an
 * interjection, a bar scene) kept offering itself while it ran and after it ended; its start rule
 * now tests the quest's state. (2) With those starts (and "started by another quest") SagaLib picks
 * the random targets, and sets the variables, when the quest starts, so a text before that showed
 * their tokens raw: a Problems warning, and Play leaves them unfilled until the quest starts.
 */
import { describe, expect, it } from 'vitest'
import { compileQuest, startOptionId, startStateConditions } from '../src/shared/export/questrules'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { createdUpFront, newSimState, questState, sagaHooks } from '../src/shared/play'
import { earlyTokenProblems } from '../src/shared/checks/quests'
import { beforeStart, newQuest } from '../src/shared/quest'
import { buildRegistry, flagProblems } from '../src/shared/flags'
import { testModFiles } from './fixtures/testmod'
import { SIXTYONE_A } from './fixtures/sixtyone'
import { TWENTYSEVEN_A } from './fixtures/twentyseven'
import { EIGHT_C } from './fixtures/phase8/eight_c'
import { dlg } from './fixtures/testmod'
import type { DialogNode, QuestPlan, QuestStart } from '../src/shared/model'

const conds = (q: QuestPlan, id: string) => compileQuest(q, { sagalib: true, phrases: [] }).rows.find((r) => r.id === id)?.conditions.split('\n') ?? []
const keep = () => SIXTYONE_A.model().quests.find((x) => x.id === 'soa_keep')!

describe('the start rule tests the quest\'s state (#71, part 1)', () => {
  it('an option start: not started yet, or (repeatable) not running', () => {
    const q = keep()
    expect(conds(q, 'soa_keep_start')).toEqual(['$id == soa_station', 'SF_QuestState soa_keep notStarted'])
    q.repeatable = true
    expect(conds(q, 'soa_keep_start')).toEqual(['$id == soa_station', '!SF_QuestState soa_keep active'])
    // in the exported mod too
    expect(testModFiles(SIXTYONE_A)['data/campaign/rules.csv']).toContain('SF_QuestState soa_keep notStarted')
  })

  it('a trigger, an interjection and a bar scene too; contacts, bars, manual starts and conversations don\'t', () => {
    const q = keep()
    const set = (s: QuestStart) => { q.start = s; return compileQuest(q, { sagalib: true, phrases: [] }).rows.filter((r) => r.conditions.includes('SF_QuestState soa_keep notStarted')).map((r) => `${r.id}@${r.trigger}`) }
    // the offer itself answers the trigger (it is only reached from the start)
    expect(set({ kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == soa_station'] })).toEqual(['soa_keep_offer@OpenInteractionDialog'])
    expect(set({ kind: 'interject', option: 'salExplore', conditions: [], once: 'entity' })).toEqual(['soa_keep_start_go@DialogOptionSelected'])
    expect(set({ kind: 'barScene', conditions: ['$market.id == soa_station'], optionText: 'Talk', blurb: 'Someone waves.' })).toEqual(['soa_keep_start@AddBarEvents'])
    expect(set({ kind: 'contact', person: 'soa_boss', freq: 10 })).toEqual([])
    expect(set({ kind: 'bar', freq: 10, prob: 1 })).toEqual([])
    expect(set({ kind: 'manual' })).toEqual([])
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == soa_station'], optionText: 'Talk' }
    q.kind = 'dialog'
    expect(startStateConditions(q)).toEqual([])
  })

  it('doesn\'t add a line the designer already wrote (test 59\'s contract)', () => {
    const job = TWENTYSEVEN_A.model().quests.find((x) => x.id === 'tsa_job')!
    expect(conds(job, 'tsa_job_start').filter((l) => l === 'SF_QuestState tsa_job notStarted')).toHaveLength(1)
  })

  it('in Play: the option is gone after accepting and after the end; a repeatable one comes back after the end', () => {
    for (const repeatable of [false, true]) {
      const q = keep()
      q.repeatable = repeatable
      const c = compileQuest(q, { sagalib: true, phrases: [] })
      const e = new Engine(compileRules(c.rows), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
      e.set('$id', 'soa_station')
      const opts = () => e.view.options.map((o) => o.id)
      e.fireAll('PopulateOptions')
      expect(opts()).toContain(startOptionId(q))
      e.select(startOptionId(q))
      e.select('soa_keep_accept')
      // the Stage node started it, and the dialog went back to Range Control's menu
      expect(questState(e, 'soa_keep').state).toBe('active')
      expect(opts()).toContain('soa_keep_there_go')
      expect(opts()).not.toContain(startOptionId(q))
      e.select('soa_keep_there_go')
      expect(questState(e, 'soa_keep').state).toBe('success')
      expect(opts().includes(startOptionId(q))).toBe(repeatable)
    }
  })

  it('the flags registry knows SagaLib sets a quest\'s state (test 8c\'s quest has no End node)', () => {
    const m = EIGHT_C.model()
    const reg = buildRegistry(m, [])
    expect(reg.get('$global.sec_talk_state')?.setBy.length).toBeGreaterThan(0)
    expect(flagProblems(reg, m.project.prefix).filter((p) => p.message.includes('sec_talk_state'))).toEqual([])
  })
})

/** An option quest with a random target: offer → accept → Stage → "told" (names the target) → Back to the menu. */
function targetQuest(): QuestPlan {
  const q = newQuest('sft_find', 'Find the ruin', 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sft_station'], optionText: 'Ask about the job' }
  q.variables.push({ name: 'ruin', type: 'target', scope: 'quest', initial: '', target: { pick: 'planet', require: [{ id: 'plRuins', args: [] }], prefer: [], mock: { name: 'Tomb', system: 'Askr', dist: 7 } } })
  q.stages = [{ id: 'go', title: 'Go', journal: 'Go to $global.sft_find_ruin_name.', marker: 'target:ruin', kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Ruins on $global.sft_find_ruin_name.'
  q.nodes.push(
    { id: 'st', type: 'stage', x: 0, y: 0, stage: 'go' },
    dlg('told', 0, 0, 'Go to $global.sft_find_ruin_name in $global.sft_find_ruin_system.', [{ id: 'ok', text: 'Fly there' }]),
    { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' },
    { id: 'c', from: 'st', handle: 'next', to: 'told' }, { id: 'd', from: 'told', handle: 'ok', to: 'menu' }
  )
  return q
}

describe('target tokens before the target is picked (#71, part 2)', () => {
  it('knows what runs before the quest starts', () => {
    const q = targetQuest()
    expect([...beforeStart(q)].sort()).toEqual(['no', 'offer'])
    // a dialog that starts it in its script still shows its text first; nothing after it counts
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.script = ['SF_Start sft_find']
    expect([...beforeStart(q)]).toEqual(['offer'])
    // a Link to a node of the quest is followed
    offer.script = []
    q.nodes.push({ id: 'jump', type: 'link', x: 0, y: 0, mode: 'node', target: 'told' })
    q.edges.find((e) => e.id === 'b')!.to = 'jump'
    expect(beforeStart(q).has('told')).toBe(true)
  })

  it('warns for target tokens in the offer and the start option, not after the Stage node', () => {
    const q = targetQuest()
    let p = earlyTokenProblems(q)
    expect(p.map((x) => [x.level, x.ref?.sub])).toEqual([['warning', 'offer']])
    expect(p[0].message).toContain('$global.sft_find_ruin_name names random target "ruin"')
    ;(q.start as { optionText: string }).optionText = 'Ask about $global.sft_find_ruin_system'
    expect(earlyTokenProblems(q).map((x) => x.ref?.sub)).toEqual(['start', 'offer'])
    // a bar scene's blurb
    q.start = { kind: 'barScene', conditions: [], optionText: 'Talk', blurb: 'A spacer from $global.sft_find_ruin_system waves.' }
    expect(earlyTokenProblems(q).map((x) => x.ref?.sub)).toEqual(['start', 'offer'])
    // started by another quest: the same, with a way out
    q.start = { kind: 'manual' }
    p = earlyTokenProblems(q)
    expect(p.map((x) => x.ref?.sub)).toEqual(['offer'])
    expect(p[0].message).toContain('"Start another quest"')
    for (const s of [{ kind: 'trigger', trigger: 'OpenCommLink', conditions: [] }, { kind: 'interject', option: 'salExplore', conditions: [] }] as QuestStart[]) {
      q.start = s
      expect(earlyTokenProblems(q).map((x) => x.ref?.sub)).toEqual(['offer'])
    }
    // contacts and bar events pick the targets with the offer
    q.start = { kind: 'contact', person: 'sft_p', freq: 10 }
    expect(earlyTokenProblems(q)).toEqual([])
    q.start = { kind: 'bar', freq: 10, prob: 1 }
    expect(earlyTokenProblems(q)).toEqual([])
  })

  it('warns for quest variables too, unless something before sets them', () => {
    const q = targetQuest()
    q.variables.push({ name: 'pay', type: 'number', scope: 'quest', initial: '500' })
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = 'It pays $global.sft_find_pay credits.'
    let p = earlyTokenProblems(q)
    expect(p.map((x) => [x.key, x.ref?.sub])).toEqual([['varearly:sft_find:offer', 'offer']])
    expect(p[0].message).toContain('$global.sft_find_pay is quest variable "pay"')
    // the offer's own script runs after its text: still raw there
    offer.script = ['$global.sft_find_pay = 700']
    expect(earlyTokenProblems(q).map((x) => x.key)).toEqual(['varearly:sft_find:offer'])
    // an Action before the offer sets it
    offer.script = []
    q.nodes.push({ id: 'price', type: 'action', x: 0, y: 0, ops: [{ op: 'set', key: '$global.sft_find_pay', value: '700' }] })
    q.edges.find((e) => e.from === 'start')!.to = 'price'
    q.edges.push({ id: 'p', from: 'price', handle: 'next', to: 'offer' })
    expect(earlyTokenProblems(q)).toEqual([])
    // after the Stage node, or with a contact start: fine
    q.start = { kind: 'contact', person: 'sft_p', freq: 10 }
    q.nodes = q.nodes.filter((n) => n.id !== 'price')
    q.edges = q.edges.filter((e) => e.id !== 'p')
    q.edges.find((e) => e.from === 'start')!.to = 'offer'
    expect(earlyTokenProblems(q)).toEqual([])
  })

  it('Play leaves them unfilled until the quest starts, as in game', () => {
    const q = targetQuest()
    q.variables.push({ name: 'pay', type: 'number', scope: 'quest', initial: '500' })
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text += ' Pay: $global.sft_find_pay.'
    ;(q.nodes.find((n) => n.id === 'told') as DialogNode).text += ' Pay: $global.sft_find_pay.'
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const e = new Engine(compileRules(c.rows), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
    expect(createdUpFront(e, q)).toBe(false)
    expect(createdUpFront(e, q, 'offer')).toBe(false)
    // playing from a node after the start, or with the quest running already, has them at once
    expect(createdUpFront(e, q, 'told')).toBe(true)
    e.set('$global.sft_find_state', 'active')
    expect(createdUpFront(e, q)).toBe(true)
    e.set('$global.sft_find_state', undefined)
    const text = () => e.view.paragraphs.map((x) => x.text).join(' ')
    e.set('$option', startOptionId(q))
    e.fireBest('DialogOptionSelected')
    expect(text()).toContain('Ruins on [$global.sft_find_ruin_name]. Pay: [$global.sft_find_pay].')
    // the Stage node starts it: SagaLib sets the variables and searches (Play: the mock)
    e.select('sft_find_accept')
    expect(text()).toContain('Go to Tomb in Askr. Pay: 500.')
    // a contact picks them with the offer
    q.start = { kind: 'contact', person: 'sft_p', freq: 10 }
    expect(createdUpFront(e, q)).toBe(true)
  })
})
