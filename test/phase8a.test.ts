/**
 * Phase 8a (F7-a, F7-b): a loot pool that adds to an existing drop group, and rewards that roll a
 * drop group. F7-c (two mods adding one item) is an in-game test (eight_a + eight_a_twin).
 */
import { describe, expect, it } from 'vitest'
import { testModFiles } from './fixtures/testmod'
import { EIGHT_A, EIGHT_A_TWIN } from './fixtures/phase8/eight_a'
import { needsSagaLib12 } from '../src/shared/export/runtime'
import { poolProblems } from '../src/shared/checks/pools'
import { dropGroupChoices } from '../src/shared/pools'
import type { CheckContext } from '../src/shared/checks'

const index = {
  items: [{ id: 'alpha_core', name: 'Alpha Core', kind: 'commodity' }, { id: 'gamma_core', name: 'Gamma Core', kind: 'commodity' }], weapons: [], wings: [], factions: [], customEntityTypes: [{ id: 'supply_cache' }],
  dropGroups: [
    { group: 'ai_cores1', item: 'nothing', freq: 100, definedBy: 'starsector-core' }, { group: 'ai_cores1', item: 'gamma_core', freq: 5, definedBy: 'starsector-core' },
    { group: 'rare_tech', item: 'alpha_core', freq: 1, definedBy: 'starsector-core' }, { group: 'ai_cores1', item: 'alpha_core', freq: 100, definedBy: 'other_mod' }
  ]
}
const ctx = (model: ReturnType<typeof EIGHT_A.model>, idx: object = index): CheckContext => ({ model, index: idx, loaded: { sourceId: 'eight_a' } } as unknown as CheckContext)

describe('F7-a: a loot pool adds to an existing group', () => {
  it('writes its rows into that group, no "nothing" row, and no group of its own', () => {
    const files = testModFiles(EIGHT_A)
    expect(files['data/campaign/procgen/drop_groups.csv'].split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['commodity,group,freq', 'alpha_core,ai_cores1,100'])
    expect(testModFiles(EIGHT_A_TWIN)['data/campaign/procgen/drop_groups.csv']).toBe('commodity,group,freq\nalpha_core,ai_cores1,100\n')
  })
  it('lists groups for pickers: the mod\'s own tables, then the game\'s and other mods\'', () => {
    const ch = dropGroupChoices([{ id: 'sea_own', name: 'Own', draw: 'pickOne', use: 'loot', entries: [] }, ...EIGHT_A.model().pools!], index)
    expect(ch.map((c) => c.id)).toEqual(['sea_own', 'ai_cores1', 'rare_tech'])
  })
  it('warns about an item another source already adds, a "nothing" share, and an unknown group; rolling an adder pool is an error', () => {
    const m = EIGHT_A.model()
    const p = m.pools![0]
    let msgs = poolProblems(ctx(m)).map((x) => `${x.level}: ${x.key ?? x.message}`)
    expect(msgs).toContain('warning: addsdup:sea_more_alphas:alpha_core') // other_mod adds it too (F7-c)
    p.nothing = 10
    p.addsTo = 'no_such_group'
    m.systems[0].entities[1].loot = [{ group: 'sea_more_alphas', chances: 1 }]
    msgs = poolProblems(ctx(m)).map((x) => `${x.level}: ${x.key ?? x.message}`)
    expect(msgs).toContain('warning: addsto:sea_more_alphas')
    expect(msgs).toContain('warning: addsnothing:sea_more_alphas')
    expect(msgs.some((x) => x.startsWith('error') && x.includes('roll "no_such_group" instead'))).toBe(true)
  })
})

describe('F7-b: rewards roll drop groups', () => {
  it('exports the reward\'s loot for SagaLib 1.2', () => {
    const files = testModFiles(EIGHT_A)
    const q = JSON.parse(files['data/sagaforge/quests/sea_reward.json'])
    expect(q.rewards[0].loot).toEqual([{ group: 'rare_tech', chances: 3 }])
    expect(needsSagaLib12(EIGHT_A.model())).toBe(true)
  })
  it('checks the group and the amount', () => {
    const m = EIGHT_A.model()
    m.quests[0].rewards[0].loot = [{ group: 'nonexistent' , chances: 1 }, { group: 'rare_tech' }]
    const msgs = poolProblems(ctx(m)).map((x) => `${x.level}: ${x.message}`)
    expect(msgs.some((x) => x.startsWith('warning') && x.includes('"nonexistent"'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('need rolls or a value'))).toBe(true)
  })
})
