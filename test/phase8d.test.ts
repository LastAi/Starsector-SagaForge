/**
 * Phase 8d-1 (RC-R12 a): world event schedulers. Runtime JSON in SagaLib's shape, the start/end
 * action rules, checks, the flags registry and translation of news items.
 */
import { describe, expect, it } from 'vitest'
import { testModFiles } from './fixtures/testmod'
import { EIGHT_D } from './fixtures/phase8/eight_d'
import { runtimeTexts } from './fixtures/phase8/eight_c'
import { eventProblems } from '../src/shared/checks/events'
import { buildRegistry } from '../src/shared/flags'
import { translationEntries } from '../src/shared/translate'
import { needsSagaLib12 } from '../src/shared/export/runtime'
import type { CheckContext } from '../src/shared/checks'

const ctx = (m: ReturnType<typeof EIGHT_D.model>): CheckContext => ({ model: m, index: { markets: [] }, loaded: { sourceId: 'eight_d' } } as unknown as CheckContext)

describe('event schedulers export', () => {
  const files = testModFiles(EIGHT_D)
  it('one JSON per scheduler: its events as pool entries with duration and news', () => {
    const j = JSON.parse(files['data/sagaforge/events/sed_news.json'])
    expect(j).toMatchObject({ format: 1, id: 'sed_news', min: 1, max: 2, intervalDays: 3, firstAfterDays: 1 })
    expect(j.entries.map((e: { id: string }) => e.id)).toEqual(['sed_boom', 'sed_raid', 'sed_once'])
    expect(j.entries[2]).toMatchObject({ once: 'playthrough', durationDays: 0 })
    expect(j.entries[0].stack).toBeUndefined() // one at a time by default
    expect(j.entries[1].news).toEqual({ title: 'Test 8d: pirates near Range Control 8D', text: expect.stringContaining('pirate patrol'), tag: 'Hostilities', at: 'sed_station', days: 10 })
    expect(files['data/config/sagaforge/content.csv']).toContain('sed_news,events,data/sagaforge/events/sed_news.json,eight_d')
    expect(needsSagaLib12(EIGHT_D.model())).toBe(true)
  })
  // #67 U12 (SagaLib 1.4): actions SagaLib runs itself are in the JSON, with no rule (no dialog flashes)
  it('start and end actions are in the JSON, for SagaLib to run without a dialog', () => {
    const j = JSON.parse(files['data/sagaforge/events/sed_news.json'])
    expect(j.entries[0].start).toEqual([{ op: 'credits', amount: 100 }, { op: 'set', key: '$global.sed_boom_seen', value: 'true' }])
    expect(j.entries[1].start).toEqual([{ op: 'spawn', encounter: 'sed_raiders' }])
    expect(j.entries[1].end).toEqual([{ op: 'despawn', encounter: 'sed_raiders' }])
    expect(j.entries[0].end).toBeUndefined()
    expect(files['data/campaign/rules.csv']).not.toContain('SF_event_')
  })
})

describe('event checks', () => {
  it('the test mod is clean', () => expect(eventProblems(ctx(EIGHT_D.model()))).toEqual([]))
  it('reports what would go wrong in game', () => {
    const m = EIGHT_D.model()
    const s = m.events![0]
    s.min = 3
    s.intervalDays = 0
    s.events[1].end = []
    s.events[0].start.push({ op: 'spawn', encounter: 'nope' })
    m.pools = [{ id: 'sed_news', name: 'x', draw: 'pickOne', entries: [] }]
    const msgs = eventProblems(ctx(m)).map((p) => `${p.level}: ${p.message}`)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('more than at most'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('interval'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('warning') && x.includes('Despawn'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('no encounter "nope"'))).toBe(true)
    expect(msgs.some((x) => x.startsWith('error') && x.includes('a pool has the same id'))).toBe(true)
  })
})

describe('events in the rest of the editor', () => {
  it('the flags registry knows $global.<event>_active and the flags actions set', () => {
    const reg = buildRegistry(EIGHT_D.model(), [])
    expect(reg.get('$global.sed_raid_active')?.setBy.length).toBe(1)
    expect(reg.get('$global.sed_boom_seen')?.setBy.length).toBe(1)
  })
  it('news items are translatable', () => {
    const e = translationEntries(runtimeTexts(testModFiles(EIGHT_D), 'eight_d'))
    expect(e.map((x) => x.original)).toContain('Test 8d: a one-time event')
    expect(e.find((x) => x.original === 'Test 8d: a one-time event')!.context).toBe('World events sed_news › entries sed_once › news › title')
  })
})

describe('roaming fleets (8d-2, RC-R14)', () => {
  it('export the route in the encounter spawn', () => {
    const j = JSON.parse(testModFiles(EIGHT_D)['data/sagaforge/encounters/sed_traders.json'])
    expect(j.spawn).toEqual({ at: 'sed_station', when: 'roaming', to: 'sed_outpost', days: 2, max: 2, stayDays: 2, roundTrip: true })
  })
  it('are checked', async () => {
    const { encounterProblems } = await import('../src/shared/encounters')
    const m = EIGHT_D.model()
    const t = m.encounters.find((e) => e.id === 'sed_traders')!
    t.spawn.to = undefined
    t.spawn.days = 0
    const c = { model: m, index: { factions: [{ id: 'independent' }, { id: 'pirates' }], markets: [], variants: [] }, defs: { fleetTypes: [{ id: 'tradeSmall' }, { id: 'patrolSmall' }] } } as unknown as CheckContext
    const msgs = encounterProblems(c).filter((p) => p.message.startsWith('Test 8d roaming')).map((p) => p.message)
    expect(msgs.some((x) => x.includes('needs a place to travel to'))).toBe(true)
    expect(msgs.some((x) => x.includes('days between departures'))).toBe(true)
  })
  it('warn about a fleet type nothing names (seen in game: No name for type [tradeSmall])', async () => {
    const { encounterProblems } = await import('../src/shared/encounters')
    const m = EIGHT_D.model()
    m.encounters.find((e) => e.id === 'sed_traders')!.fleet.type = 'tradeSmall'
    const c = { model: m, index: { factions: [{ id: 'independent' }, { id: 'pirates' }], markets: [], variants: [], fleetTypeNames: { smallTrader: 'Trader' } }, defs: { fleetTypes: [{ id: 'smallTrader' }, { id: 'patrolSmall' }] } } as unknown as CheckContext
    const w = encounterProblems(c).find((p) => p.key === 'fleettype:sed_traders')!
    expect(w.level).toBe('warning')
    expect(w.message).toContain('did you mean "smallTrader"')
  })
})

describe('progress events (8d-3, RC-R12 b)', () => {
  const files = testModFiles(EIGHT_D)
  it('export the definition for SagaLib', () => {
    const j = JSON.parse(files['data/sagaforge/progress/sed_unrest.json'])
    expect(j).toMatchObject({ id: 'sed_unrest', max: 1000, negative: true, restartAt: 0, startConditions: [] })
    expect(j.stages.map((s: { id: string; progress: number }) => `${s.id}@${s.progress}`)).toEqual(['rumours@300', 'riots@600', 'settled@1000'])
    expect(j.stages[1].outcomes.map((o: { id: string; weight: number }) => ({ id: o.id, weight: o.weight }))).toEqual([{ id: 'calm', weight: 2 }, { id: 'burn', weight: 1 }])
    expect(j.factors[1]).toEqual({ id: 'boom', desc: 'The market boom', points: 150, conditions: ['$global.sed_boom_active'] })
    expect(files['data/config/sagaforge/content.csv']).toContain('sed_unrest,progress,data/sagaforge/progress/sed_unrest.json,eight_d')
  })
  // #67 U12 (SagaLib 1.4): in the JSON, run by SagaLib without a dialog
  it('stage and outcome actions are in the JSON; Add progress is a progress op', () => {
    const j = JSON.parse(files['data/sagaforge/progress/sed_unrest.json'])
    expect(j.stages[0].actions[0]).toEqual({ op: 'credits', amount: 10 })
    expect(j.stages[1].outcomes[0].actions).toEqual([{ op: 'credits', amount: 50 }])
    expect(j.stages[1].outcomes[1].actions).toEqual([{ op: 'rep', faction: 'independent', amount: -5 }])
    expect(files['data/campaign/rules.csv']).not.toContain('SF_progress_')
    // Add progress from a quest is still the rule command
    expect(files['data/campaign/rules.csv']).toContain('SF_Progress sed_unrest 250 ""You stirred up the crowd""') // CSV doubles the quotes
  })
  it('are checked', async () => {
    const { progressProblems } = await import('../src/shared/checks/progress')
    const m = EIGHT_D.model()
    expect(progressProblems(ctx(m))).toEqual([])
    const p = m.progress![0]
    p.stages[1].progress = 200
    p.restartAt = 2000
    p.stages[1].outcomes!.forEach((o) => { o.weight = 0 })
    m.quests.find((q) => q.id === 'sed_stir')!.nodes.push({ id: 'x', type: 'action', x: 0, y: 0, ops: [{ op: 'progress', event: 'nope', points: 1 }] })
    const msgs = progressProblems(ctx(m)).map((x) => x.message)
    expect(msgs.some((x) => x.includes('must come after the stage before'))).toBe(true)
    expect(msgs.some((x) => x.includes('starts over at'))).toBe(true)
    expect(msgs.some((x) => x.includes('every outcome has weight 0'))).toBe(true)
    expect(msgs.some((x) => x.includes('names "nope"'))).toBe(true)
  })
  it('its texts are translatable and its flags known', () => {
    const e = translationEntries(runtimeTexts(files, 'eight_d')).map((x) => x.original)
    expect(e).toContain('Test 8d: unrest at Range Control 8D')
    expect(e).toContain('Riots')
    expect(e).toContain('Grumbling (every month)')
    const reg = buildRegistry(EIGHT_D.model(), [])
    expect(reg.get('$global.sed_unrest_stage')?.setBy.length).toBe(1)
    expect(reg.get('$global.sed_unrest_riots_outcome')?.setBy.length).toBe(1)
  })
})
