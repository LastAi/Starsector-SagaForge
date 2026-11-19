/**
 * Task #61 (PLAN.md §10.3): markets changing owner and Nexerelin's invasions, without a bridge.
 * The owner-change export, the contact-post warning and invasion protection. The shared golden
 * case places.json (SagaLib) covers the runtime (missing places, the daily owner check). The
 * random-sector part is on hold (its own task).
 */
import { describe, expect, it } from 'vitest'
import { nexerelinProblems } from '../src/shared/checks/nexerelin'
import { questWatch } from '../src/shared/nexerelin'
import { compileQuest } from '../src/shared/export/questrules'
import { testModFiles, testModState } from './fixtures/testmod'
import { SIXTYONE_A, SIXTYONE_INDEX } from './fixtures/sixtyone'
import { planTexts } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'

const idx = (): GameIndex => ({ factions: [], items: [], people: [], ...SIXTYONE_INDEX, activeSourceId: 'sixtyone_a' } as unknown as GameIndex)
function ctx(m = SIXTYONE_A.model()): CheckContext {
  return { model: m, index: idx(), defs: defsFor('0.98a-RC8'), loaded: testModState(SIXTYONE_A, m, planTexts(m)), rules: null, styleChecks: false }
}

describe('markets changing owner (PLAN.md §10.3)', () => {
  it('watches the quest\'s markets and exports what to do', () => {
    const m = SIXTYONE_A.model()
    const st = m.quests.find((x) => x.id === 'soa_stage')!
    expect(questWatch(st, m, idx())).toEqual(['soa_outpost', 'soa_station'])
    const files = testModFiles(SIXTYONE_A)
    const j = JSON.parse(files['data/sagaforge/quests/soa_stage.json'])
    expect(j.ownerChange).toEqual({ do: 'stage', stage: 'lost', trigger: 'soa_stage_ownerChanged', markets: ['soa_outpost', 'soa_station'] })
    expect(JSON.parse(files['data/sagaforge/quests/soa_fail.json']).ownerChange).toEqual({ do: 'fail', markets: ['soa_outpost', 'soa_station'] })
    expect(JSON.parse(files['data/sagaforge/quests/soa_keep.json']).ownerChange).toEqual({ do: 'keep', markets: ['soa_outpost', 'soa_station'] })
    // the trigger's rule runs what follows the Stage node
    const c = compileQuest(st, { sagalib: true, phrases: [] })
    const r = c.rows.find((x) => x.id === 'soa_stage_ownerChanged')!
    expect(r.trigger).toBe('soa_stage_ownerChanged')
    expect(r.script).toContain('FireBest soa_stage_news')
  })

  it('watches a vanilla market by the index, a market target by its key, and nothing without a setting', () => {
    const m = SIXTYONE_A.model()
    const q = m.quests.find((x) => x.id === 'soa_keep')!
    q.stages[0].marker = 'jangala'
    q.variables.push({ name: 't', type: 'target', scope: 'quest', initial: '', target: { pick: 'market', require: [], prefer: [] } })
    expect(questWatch(q, m, idx())).toEqual(['jangala', 'soa_station', '$global.soa_keep_t'])
    delete q.ownerChange
    expect(nexerelinProblems(ctx(m)).some((p) => p.key === 'nexwatch:soa_keep')).toBe(false)
  })

  it('a missing stage is an error; a quest that watches nothing gets an info line', () => {
    const m = SIXTYONE_A.model()
    const st = m.quests.find((x) => x.id === 'soa_stage')!
    st.ownerChange = { do: 'stage', stage: 'nope' }
    expect(compileQuest(st, { sagalib: true, phrases: [] }).problems.some((p) => p.key === 'ownerstage:soa_stage')).toBe(true)
    const k = m.quests.find((x) => x.id === 'soa_keep')!
    k.stages[0].marker = ''
    k.nodes = k.nodes.filter((n) => n.type !== 'wait')
    expect(nexerelinProblems(ctx(m)).find((p) => p.key === 'nexwatch:soa_keep')?.level).toBe('info')
  })

  it('the Stage node it goes to counts as reached, and its keys as set', () => {
    const files = testModFiles(SIXTYONE_A)
    expect(files['data/campaign/rules.csv']).toContain('soa_stage_ownerChanged,soa_stage_ownerChanged,')
  })

  it('exports invasion protection on the market', () => {
    const files = testModFiles(SIXTYONE_A)
    const sys = JSON.parse(files['data/sagaforge/systems/soa_range.json'])
    expect(sys.entities.find((e: { id: string }) => e.id === 'soa_bastion').market.protectFromInvasion).toBe(true)
    expect(sys.entities.find((e: { id: string }) => e.id === 'soa_outpost').market.protectFromInvasion).toBeUndefined()
  })
})

describe('contacts Nexerelin re-flags on capture', () => {
  it('warns about a quest contact who is a portmaster at a market that can be invaded, not at a protected one', () => {
    const m = SIXTYONE_A.model()
    m.people.push({ id: 'soa_pm', name: { first: 'Ade', last: 'Moro' }, gender: 'MALE', faction: 'independent', rank: 'citizen', post: 'portmaster', portrait: '', placement: { at: 'market', market: 'soa_station', inCommDirectory: true }, tags: [], phrases: [] })
    m.quests.find((x) => x.id === 'soa_keep')!.start = { kind: 'contact', person: 'soa_pm', freq: 10 }
    const w = nexerelinProblems(ctx(m)).find((p) => p.key === 'nexpost:soa_keep:soa_pm')!
    expect(w.level).toBe('warning')
    expect(w.ref).toEqual({ page: 'people', id: 'soa_pm' })
    expect(w.fixes![0].action).toBe('protectInvasion')
    m.systems[0].entities.find((e) => e.id === 'soa_station')!.market!.protectFromInvasion = true
    expect(nexerelinProblems(ctx(m)).some((p) => p.key === 'nexpost:soa_keep:soa_pm')).toBe(false)
    // another post: no warning
    m.systems[0].entities.find((e) => e.id === 'soa_station')!.market!.protectFromInvasion = false
    m.people.find((p) => p.id === 'soa_pm')!.post = 'agent'
    expect(nexerelinProblems(ctx(m)).some((p) => p.key === 'nexpost:soa_keep:soa_pm')).toBe(false)
  })

  it('only when the mod lists Nexerelin', () => {
    const m = SIXTYONE_A.model()
    m.people.push({ id: 'soa_pm', name: { first: 'Ade', last: 'Moro' }, gender: 'MALE', faction: 'independent', rank: 'citizen', post: 'portmaster', portrait: '', placement: { at: 'market', market: 'soa_station', inCommDirectory: true }, tags: [], phrases: [] })
    m.quests.find((x) => x.id === 'soa_keep')!.start = { kind: 'contact', person: 'soa_pm', freq: 10 }
    m.project.mods = []
    expect(nexerelinProblems(ctx(m)).some((p) => p.key?.startsWith('nexpost:'))).toBe(false)
  })
})
