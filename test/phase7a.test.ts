/** Phase 7a (DESIGN-PHASE7.md): random pools, Random branches, SF_RollPool. */
import { describe, expect, it } from 'vitest'
import { JavaRandom, javaHash, mix } from '../src/shared/javarandom'
import { branchPool, chances, rollPool, runtimePool } from '../src/shared/pools'
import { compileQuest } from '../src/shared/export/questrules'
import { planExport } from '../src/shared/export'
import { needsSagaLib12 } from '../src/shared/export/runtime'
import { poolProblems } from '../src/shared/checks/pools'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { parseLooseObject } from '../src/shared/loosejson'
import { hashText } from '../src/main/install'
import type { BranchNode, QuestPlan } from '../src/shared/model'
import type { GameIndex } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'
import type { CheckContext } from '../src/shared/checks'

const index = { factions: [], items: [], people: [], markets: [], systems: [], planetTypes: [], customEntityTypes: [] } as unknown as GameIndex
function state(m: ModModel): ProjectState {
  return {
    sourceId: 'vgh', modDir: '/x', isNew: false, modInfo: { id: 'vgh', name: 'V', version: '1', gameVersion: '0.98a-RC8', dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime, descriptions: {}, factions: [], releases: [],
    files: {}, errors: []
  } as ProjectState
}

/** A quest whose offer goes to a Random branch with two cases and an otherwise. */
function randomQuest(): QuestPlan {
  const q = newQuest('vgh_q', 'Q')
  const b: BranchNode = { id: 'roll', type: 'branch', x: 0, y: 0, title: 'Roll', random: { nothing: 1 }, cases: [{ id: 'pirates', label: 'Pirates', conditions: [], weight: 3 }, { id: 'quiet', label: 'Quiet', conditions: ['$player.credits >= 1000'], weight: 1, limit: { once: 'playthrough' } }] }
  q.nodes.push(b, { id: 'endp', type: 'end', x: 0, y: 0, outcome: 'success' }, { id: 'endq', type: 'end', x: 0, y: 0, outcome: 'success' }, { id: 'endn', type: 'end', x: 0, y: 0, outcome: 'fail' })
  q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'roll' }, { id: 'b', from: 'roll', handle: 'pirates', to: 'endp' }, { id: 'c', from: 'roll', handle: 'quiet', to: 'endq' }, { id: 'd', from: 'roll', handle: 'else', to: 'endn' })
  return q
}

describe('Java numbers in TypeScript', () => {
  it('match java.util.Random, String.hashCode and the pool mix', () => {
    expect(new JavaRandom(42n).nextFloat()).toBe(Math.fround(0.7275637))
    expect(new JavaRandom(1n).nextInt()).toBe(-1155869325)
    expect(javaHash('hello')).toBe(99162322)
    expect(mix(0n, 'vgc_p')).toBe(7699432170279971967n)
  })
})

describe('Random branch', () => {
  it('compiles to a roll rule, one rule per case and an otherwise rule', () => {
    const q = randomQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const roll = c.rows.find((r) => r.id === 'vgh_q_roll_roll')!
    expect(roll.script).toBe('SF_RollPool vgh_q_roll\nFireBest vgh_q_roll_pick')
    expect(c.rows.find((r) => r.id === 'vgh_q_roll_pirates')).toMatchObject({ trigger: 'vgh_q_roll_pick', conditions: '$sagaforge_pick == pirates' })
    expect(c.rows.find((r) => r.id === 'vgh_q_roll_else')).toMatchObject({ trigger: 'vgh_q_roll_pick', conditions: '$sagaforge_pick == nothing' })
    expect(c.usesSagaLib).toBe(true)
    expect(c.problems.filter((p) => p.level !== 'info' && p.ref?.sub?.startsWith('roll'))).toEqual([])
  })
  it('warns when otherwise leads nowhere, and rolls for the world when asked', () => {
    const q = randomQuest()
    q.edges = q.edges.filter((e) => e.handle !== 'else')
    const b = q.nodes.find((n) => n.id === 'roll') as BranchNode
    b.random!.scope = 'global'
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.problems.some((p) => p.key === 'randomelse:vgh_q:roll')).toBe(true)
    expect(c.rows.find((r) => r.id === 'vgh_q_roll_roll')!.script.split('\n')[0]).toBe('SF_RollPool vgh_q_roll global')
  })
  it('its own pool, chances and limits', () => {
    const q = randomQuest()
    const p = branchPool(q, q.nodes.find((n) => n.id === 'roll') as BranchNode, [])!
    expect(p.id).toBe('vgh_q_roll')
    expect(chances(p).map((c) => [c.id, Math.round(c.chance * 100)])).toEqual([['pirates', 60], ['quiet', 20], ['nothing', 20]])
    expect(runtimePool(p)).toEqual({ format: 1, id: 'vgh_q_roll', draw: 'pickOne', nothing: 1, entries: [{ id: 'pirates', weight: 3, conditions: [] }, { id: 'quiet', weight: 1, conditions: ['$player.credits >= 1000'], once: 'playthrough' }] })
    // a force picks it; the once-limit then keeps it out
    const mem = new Map<string, unknown>()
    const m = { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => { mem.set(k, v) } }
    expect(rollPool(p, m, () => true, 5n, false, 'quiet')).toBe('quiet')
    for (let i = 0; i < 30; i++) expect(rollPool(p, m, () => true, 5n, false, null)).not.toBe('quiet')
  })
})

describe('option ids belong to the quest', () => {
  it('the same option id in two dialogs is an error', () => {
    const q = randomQuest()
    for (const id of ['endp', 'endq']) q.nodes = q.nodes.filter((n) => n.id !== id)
    q.nodes.push(
      { id: 'r1', type: 'dialog', x: 0, y: 0, title: 'R1', visual: { kind: 'none' }, displays: [], text: 'A', highlights: [], options: [{ id: 'thanks', text: 'Thanks' }], conditions: [], script: [], phrases: [] },
      { id: 'r2', type: 'dialog', x: 0, y: 0, title: 'R2', visual: { kind: 'none' }, displays: [], text: 'B', highlights: [], options: [{ id: 'thanks', text: 'Thanks' }], conditions: [], script: [], phrases: [] })
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.problems.some((p) => p.level === 'error' && p.message.includes('Option id "thanks" is used in two dialogs'))).toBe(true)
  })
})

describe('export with pools', () => {
  it('writes the pool files, lists them in content.csv and asks for SagaLib 1.2', () => {
    const m = emptyModel('vgh_')
    m.quests = [randomQuest()]
    m.pools = [{ id: 'vgh_loot', name: 'Loot', draw: 'pickOne', nothing: 0, entries: [{ id: 'a', weight: 1, conditions: [] }] }]
    expect(needsSagaLib12(m)).toBe(true)
    const plan = planExport(m, state(m), index, null, { addDependency: true })
    const paths = plan.writes.map((w) => w.path)
    expect(paths).toContain('data/sagaforge/pools/vgh_q_roll.json')
    expect(paths).toContain('data/sagaforge/pools/vgh_loot.json')
    const csv = plan.writes.find((w) => w.path === 'data/config/sagaforge/content.csv')!.text
    expect(csv).toContain('vgh_q_roll,pool,data/sagaforge/pools/vgh_q_roll.json,vgh')
    const info = parseLooseObject(plan.writes.find((w) => w.path === 'mod_info.json')!.text).value
    expect(info.dependencies).toEqual([{ id: 'lastai_sagalib', name: 'SagaLib', version: '1.2.0' }])
    void hashText
  })
})

describe('pool checks', () => {
  it('find a pool that can never pick and a branch whose cases drifted from its pool', () => {
    const m = emptyModel('vgh_')
    m.pools = [{ id: 'vgh_dead', name: 'Dead', draw: 'pickOne', entries: [{ id: 'a', weight: 0, conditions: [] }] },
      { id: 'vgh_loot', name: 'Loot', draw: 'pickOne', entries: [{ id: 'a', weight: 1, conditions: [] }, { id: 'b', weight: 1, conditions: [] }] }]
    const q = randomQuest()
    const b = q.nodes.find((n) => n.id === 'roll') as BranchNode
    b.random = { pool: 'vgh_loot' }
    b.cases = [{ id: 'a', label: 'A', conditions: [] }]
    m.quests = [q]
    const ps = poolProblems({ model: m } as unknown as CheckContext)
    expect(ps.some((p) => p.level === 'error' && p.message.includes('Dead'))).toBe(true)
    expect(ps.some((p) => p.key === 'poolcases:vgh_q:roll')).toBe(true)
  })
})
