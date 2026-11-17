/**
 * Phase 7e (RC-F7, RC-R9, RC-R10, RC-R11): loot tables as the mod's own drop groups, entity loot
 * and defenders, random-encounter pools, scatter, the deciv guard.
 */
import { describe, expect, it } from 'vitest'
import { testModFiles } from './fixtures/testmod'
import { SEVEN_E } from './fixtures/phase7/seven_e'
import { usedPools, needsSagaLib12, scatterRuntime } from '../src/shared/export/runtime'
import { poolProblems } from '../src/shared/checks/pools'
import { buildRegistry } from '../src/shared/flags'
import type { CheckContext } from '../src/shared/checks'

const ctx = (model: ReturnType<typeof SEVEN_E.model>): CheckContext => ({
  model,
  index: { items: [{ id: 'metals', name: 'Metals', kind: 'commodity' }, { id: 'supplies', name: 'Supplies', kind: 'commodity' }, { id: 'alpha_core', name: 'Alpha Core', kind: 'commodity' }], weapons: [], wings: [], factions: [{ id: 'pirates', name: 'Pirates' }, { id: 'remnant', name: 'Remnant' }], customEntityTypes: [{ id: 'supply_cache' }, { id: 'derelict_probe' }], dropGroups: [{ group: 'rare_tech', item: 'alpha_core', freq: 1, definedBy: 'starsector-core' }] }
} as unknown as CheckContext)

describe('export', () => {
  const files = testModFiles(SEVEN_E)
  it('writes loot pools as the mod\'s own drop groups, not as SagaLib pools', () => {
    const csv = files['data/campaign/procgen/drop_groups.csv']
    expect(csv.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['commodity,group,freq', 'metals,sve_cache_loot,10', 'supplies,sve_cache_loot,10', 'alpha_core,sve_cache_loot,1', 'nothing,sve_cache_loot,5'])
    expect(files['data/sagaforge/pools/sve_cache_loot.json']).toBeUndefined()
    expect(usedPools(SEVEN_E.model()).map((p) => p.id)).toEqual(['sve_raids'])
  })
  it('writes the encounter pool, the scatter, entity loot and defenders, the deciv guard', () => {
    const pool = JSON.parse(files['data/sagaforge/pools/sve_raids.json'])
    expect([pool.use, pool.points, pool.frequency]).toEqual(['encounters', ['slipstream', 'outside_system'], 200])
    const sys = JSON.parse(files['data/sagaforge/systems/sve_range.json'])
    expect(sys.entities[1].loot).toEqual([{ group: 'sve_cache_loot', chances: 4 }, { group: 'rare_tech', chances: 1 }])
    expect(sys.entities[1].defenders).toEqual({ faction: 'pirates', minStr: 10, maxStr: 20 })
    expect(sys.entities[0].market.protectFromDeciv).toBe(true)
    expect(files['data/config/sagaforge/content.csv']).toContain('sve_beacons,scatter,data/sagaforge/scatter/sve_beacons.json,seven_e')
    const sc = scatterRuntime(SEVEN_E.model().scatter![0])
    expect(sc.target).toEqual({ pick: 'planet', require: [{ c: 'plUnpopulated', args: [] }, { c: 'sysWithin', args: ['giver', 25] }], prefer: [{ c: 'sysUnexplored', args: [] }] })
    expect(sc.from).toBe('sve_station')
    expect(needsSagaLib12(SEVEN_E.model())).toBe(true)
  })
})

describe('checks', () => {
  it('pass for the test mod', () => {
    expect(poolProblems(ctx(SEVEN_E.model())).filter((p) => p.level === 'error' || p.level === 'warning')).toEqual([])
  })
  it('report unknown loot, wrong encounter entries, a loot pool in a branch, and scatter problems', () => {
    const m = SEVEN_E.model()
    m.pools![0].entries.push({ id: 'wpn_nosuchgun', weight: 1, conditions: [] })
    m.pools![1].entries.push({ id: 'not_an_encounter', weight: 1, conditions: [] })
    m.quests[0].nodes.push({ id: 'br', type: 'branch', x: 0, y: 0, cases: [], random: { pool: 'sve_cache_loot' } })
    m.scatter![0].entity.type = 'no_such_type'
    m.systems[0].entities[2].loot = [{ group: '' }]
    const msgs = poolProblems(ctx(m)).map((p) => `${p.level}: ${p.message}`)
    expect(msgs.some((x) => x.startsWith('warning') && x.includes('"wpn_nosuchgun" isn\'t'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('"not_an_encounter" isn\'t one of the mod\'s encounters'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('is a loot table (a drop group), not for Random branches'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('unknown custom entity type "no_such_type"'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('a loot row has no drop group'))).toBe(true)
  })
  it('knows SagaLib sets its own keys (deciv, scatter)', () => {
    const reg = buildRegistry(SEVEN_E.model(), [])
    expect(reg.get('$global.sagaforge_scatter_sve_beacons_done')?.external).toBe('SagaLib')
  })
})
