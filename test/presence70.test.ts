/**
 * Task #70: a character's presence depends on who controls their market (People › Presence,
 * SagaLib 1.3 core.Presence) and SF_FactionRep. The shared golden case presence.json (SagaLib)
 * covers the runtime (the daily check, the offer refused while away, SF_FactionRep); these cover
 * the export, the Problems lines, the test mod and the engine's previews.
 */
import { describe, expect, it } from 'vitest'
import { presenceProblems } from '../src/shared/checks/presence'
import { needsSagaLib13 } from '../src/shared/export/runtime'
import { compileQuest } from '../src/shared/export/questrules'
import { Engine, compileRules, newContext } from '../src/shared/rules/engine'
import { contextFrom, defaultTestContext } from '../src/shared/rules/context'
import { parseCondition } from '../src/shared/rules/parse'
import { checkPresence, awayKey, offerBlocked, type SimPlaces } from '../src/shared/play'
import { repLevelId } from '../src/shared/replevels'
import { testModFiles, testModState } from './fixtures/testmod'
import { SEVENTY_A } from './fixtures/seventy'
import { planTexts } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'

const idx = (): GameIndex => ({ factions: [{ id: 'hegemony', name: 'Hegemony' }, { id: 'independent', name: 'Independent' }, { id: 'pirates', name: 'Pirates' }], items: [], people: [], markets: [], sources: [], activeSourceId: 'seventy_a' } as unknown as GameIndex)
function ctx(m = SEVENTY_A.model()): CheckContext {
  return { model: m, index: idx(), defs: defsFor('0.98a-RC8'), loaded: testModState(SEVENTY_A, m, planTexts(m)), rules: null, styleChecks: false }
}

describe('presence by the market\'s owner (task #70)', () => {
  it('exports presence with the faction filled in, and needs SagaLib 1.3', () => {
    const files = testModFiles(SEVENTY_A)
    const people = JSON.parse(files['data/sagaforge/people/seventy_a_people.json']).people
    expect(people[0].presence).toEqual({ faction: 'hegemony', atLeast: 'NEUTRAL', elsewhere: 'sya_refuge' })
    expect(needsSagaLib13(SEVENTY_A.model(), new Map())).toBe(true)
    const m = SEVENTY_A.model()
    delete m.people[0].presence
    m.quests = m.quests.filter((q) => q.id !== 'sya_check')
    m.quests[0].ownerChange = undefined
    expect(needsSagaLib13(m, new Map())).toBe(false)
  })

  it('leaves presence out for someone not at a market, with a warning', () => {
    const m = SEVENTY_A.model()
    m.people[0].placement = { at: 'none' }
    const files = testModFiles({ ...SEVENTY_A, model: () => m })
    expect(JSON.parse(files['data/sagaforge/people/seventy_a_people.json']).people[0].presence).toBeUndefined()
    expect(presenceProblems(ctx(m)).map((p) => p.key)).toContain('presencenomarket:sya_loyal')
  })

  it('Problems: the quest with an away-able contact, bad levels, elsewhere = home', () => {
    const m = SEVENTY_A.model()
    // the fixture's quest sets "If a market changes owner": no info line
    expect(presenceProblems(ctx(m)).map((p) => p.key)).toEqual([])
    m.quests[0].ownerChange = undefined
    m.people[0].presence = { atLeast: 'NEUTRAL', elsewhere: 'sya_station' }
    const d = m.quests.find((q) => q.id === 'sya_check')!
    const br = d.nodes.find((n) => n.type === 'branch')!
    if (br.type === 'branch') br.cases[0].conditions = ['SF_FactionRep $faction.id hegemony CHUMMY']
    const keys = presenceProblems(ctx(m)).map((p) => `${p.level}:${p.key}`)
    expect(keys).toContain('info:presencequest:sya_job')
    expect(keys).toContain('warning:presencesame:sya_loyal')
    expect(keys).toContain('error:factionreplevel:SF_FactionRep $faction.id hegemony CHUMMY')
  })

  it('the Branch exports SF_FactionRep as the case\'s condition', () => {
    const q = SEVENTY_A.model().quests.find((x) => x.id === 'sya_check')!
    const rows = compileQuest(q, { sagalib: true, phrases: [] }).rows
    expect(rows.some((r) => r.conditions.split('\n').includes('SF_FactionRep $faction.id hegemony NEUTRAL'))).toBe(true)
  })

  it('previews: SF_FactionRep from the context\'s relations, unknown pairs are asked', () => {
    const c = newContext()
    c.memory.set('$faction.id', 'pirates')
    c.relation = (a, b) => (a === 'pirates' && b === 'hegemony' ? 'VENGEFUL' : undefined)
    const e = new Engine(compileRules([]), c)
    expect(e.evalCondition(parseCondition('SF_FactionRep $faction.id hegemony NEUTRAL'))).toBe(false)
    expect(e.evalCondition(parseCondition('SF_FactionRep hegemony hegemony COOPERATIVE'))).toBe(true)
    c.assume['SF_FactionRep independent hegemony NEUTRAL'] = true
    expect(e.evalCondition(parseCondition('SF_FactionRep independent hegemony NEUTRAL'))).toBe(true)
    expect(repLevelId(-0.6, defsFor('0.98a-RC8').repLevels)).toBe('HOSTILE')
    expect(repLevelId(0, defsFor('0.98a-RC8').repLevels)).toBe('NEUTRAL')
  })

  it('Test context: "is away" sets the flag', () => {
    const t = { ...defaultTestContext(), away: ['sya_loyal'] }
    const c = contextFrom(t, defsFor('0.98a-RC8'), { person: () => null, faction: () => null, market: () => null })
    expect(c.memory.get(awayKey('sya_loyal'))).toBe(true)
  })

  it('Play mode: an owner change with a known relation toggles the flag and the offer', () => {
    const m = SEVENTY_A.model()
    const owners: Record<string, string> = { sya_station: 'independent' }
    const places: SimPlaces = { place: () => true, person: () => true, owner: (id) => owners[id] ?? null, relation: (a, b) => (a === b ? 'COOPERATIVE' : [a, b].includes('pirates') ? 'VENGEFUL' : 'NEUTRAL') }
    const e = new Engine(compileRules([]), newContext())
    const mem = { get: (k: string) => e.get(k), set: (k: string, v: never) => e.set(k, v) }
    expect(checkPresence(mem, m.people, places)).toEqual([])
    const rq = { id: 'sya_job', start: { kind: 'contact', person: 'sya_loyal' } }
    expect(offerBlocked(mem, { quests: [], phrases: new Map(), places }, rq)).toBeNull()
    owners.sya_station = 'pirates'
    expect(checkPresence(mem, m.people, places)).toEqual([{ person: 'sya_loyal', owner: 'pirates', away: true, changed: true }])
    expect(offerBlocked(mem, { quests: [], phrases: new Map(), places }, rq)).toBe('its contact sya_loyal is away')
  })
})
