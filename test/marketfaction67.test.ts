/**
 * #67 U50 (user, 2026-11-24, The Other Captain): a quest that starts "At a market of Hegemony"
 * never started in Play: the Test context's Market didn't set the market's owner. #67 U54: in game the
 * owner is $faction.id; the game never sets $market.factionId (it was this test's key at first).
 */
import { describe, expect, it } from 'vitest'
import { compileRules, compare, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks } from '../src/shared/play'
import { neverSetKeyProblems } from '../src/shared/conditions'
import { renameFlag } from '../src/shared/flags'
import { emptyModel } from '../src/shared/serialize'
import { startChoices, MAX_START_CHOICES, type PlaceOption } from '../src/shared/playstart'
import { contextFrom, defaultTestContext, type Lookup } from '../src/shared/rules/context'
import { defsFor } from '../src/shared/defs'
import { newQuest } from '../src/shared/quest'
import { compileQuest } from '../src/shared/export/questrules'
import type { QuestPlan } from '../src/shared/model'

const look: Lookup = { person: () => null, faction: () => null, market: (id) => (id === 'chicomoztoc' ? { name: 'Chicomoztoc', faction: 'hegemony' } : null) }

describe('#67 U50: the Test context market sets its owner', () => {
  it('sets $faction.id from the market (no speaker or faction given)', () => {
    const ctx = contextFrom({ ...defaultTestContext(), market: 'chicomoztoc' }, defsFor('0.98a'), look)
    expect(ctx.memory.get('$faction.id')).toBe('hegemony')
    expect(ctx.memory.has('$market.factionId')).toBe(false)
  })

  it('a quest starting at a Hegemony market starts there', () => {
    const q: QuestPlan = newQuest('u50_q', 'U50')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$faction.id == hegemony'] }
    const rs = compileRules(compileQuest(q, { sagalib: true, phrases: [] }).rows)
    const run = (market: string) => {
      const e = new Engine(rs, contextFrom({ ...defaultTestContext(), market }, defsFor('0.98a'), look))
      e.fireBest('OpenInteractionDialog')
      return e.fired.some((id) => id.startsWith('u50_q_'))
    }
    expect(run('chicomoztoc')).toBe(true)
    expect(run('somewhere_else')).toBe(false)
  })
})

describe('#67 U50: ways to meet a start in Play', () => {
  const markets: PlaceOption[] = [
    { id: 'jangala', name: 'Jangala', faction: 'hegemony', size: 6 },
    { id: 'chicomoztoc', name: 'Chicomoztoc', faction: 'hegemony', size: 7 },
    { id: 'sindria', name: 'Sindria', faction: 'sindrian_diktat', size: 6 },
    { id: 'toc_wheel', name: 'Foundling Wheel', faction: 'hegemony', size: 3, own: true },
    ...[1, 2, 3, 4, 5].map((i) => ({ id: `heg${i}`, name: `Heg ${i}`, faction: 'hegemony', size: 4 })),
  ]
  const fname = (id: string) => ({ hegemony: 'Hegemony', sindrian_diktat: 'Sindrian Diktat' })[id] ?? id

  it('offers markets that fit, the mod\'s own first, then by size, at most 5', () => {
    const r = startChoices(['$faction.id == hegemony score:1000', '$global.toc_ready', '!$global.toc_done', '$global.toc_n >= 3', 'PlayerHasCargo x 1'], markets, fname)
    expect(r.choices.map((c) => c.market?.id)).toEqual(['toc_wheel', 'chicomoztoc', 'jangala', 'heg1', 'heg2'])
    expect(r.choices.length).toBe(MAX_START_CHOICES)
    expect(r.choices[1].label).toBe('Dock at Chicomoztoc (Hegemony, size 7)')
    expect(r.choices[0].memory).toEqual([['$global.toc_ready', true], ['$global.toc_done', undefined], ['$global.toc_n', 3]])
    expect(r.open).toEqual(['PlayerHasCargo x 1'])
  })

  it('a named place, and the fallback when nothing fits', () => {
    expect(startChoices(['$market.id == sindria'], markets, fname).choices.map((c) => c.market?.id)).toEqual(['sindria'])
    const none = startChoices(['$faction.id == tritachyon'], markets, fname)
    expect(none.noPlace).toBe(true)
    expect(none.choices[0].memory).toEqual([['$faction.id', 'tritachyon']])
  })

  it('no place in the conditions: one choice here', () => {
    const r = startChoices(['$global.x == 2'], markets, fname)
    expect(r.choices).toEqual([{ label: 'Start here, with its conditions met', memory: [['$global.x', 2]] }])
  })

  it('U52: SF_Despawn with no id sends away the fleet you are talking to, to be reported avoided', () => {
    const sim = newSimState()
    sim.spawned = ['toc_back_taxes']
    const ctx = newContext()
    ctx.memory.set('$entity.sagaforge_encounter', 'toc_back_taxes')
    const e = new Engine(compileRules([{ id: 'r', trigger: 'T', conditions: '', script: 'SF_Despawn', text: '', options: '', notes: '' } as never]), ctx, sagaHooks({ quests: [], phrases: new Map() }, sim))
    e.fireBest('T')
    expect(sim.spawned).toEqual([])
    expect(sim.left).toEqual(['toc_back_taxes'])
  })

  it('U54: $market.factionId is never set by the game: Play does not fake it, Problems warns with a fix', () => {
    expect(startChoices(['$market.factionId == hegemony'], markets, fname).never).toEqual(['$market.factionId'])
    const m = emptyModel()
    const q = newQuest('u54_q', 'U54')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$market.factionId == hegemony score:1000'] }
    m.quests.push(q)
    const p = neverSetKeyProblems(m)
    expect(p.length).toBe(1)
    expect(p[0].fixes?.[0]).toEqual({ label: 'Use $faction.id', action: 'renameFlag', arg: { from: '$market.factionId', to: '$faction.id' } })
    renameFlag(m, '$market.factionId', '$faction.id')
    expect(q.start.conditions).toEqual(['$faction.id == hegemony score:1000'])
    expect(neverSetKeyProblems(m)).toEqual([])
  })

  it('"!= null" tests whether a key is set; two unset keys are not equal', () => {
    expect(compare(undefined, '!=', 'null')).toBe(false)
    expect(compare('ref', '!=', 'null')).toBe(true)
    expect(compare(undefined, '==', 'null')).toBe(true)
    expect(compare(undefined, '==', undefined)).toBe(false)
  })
})
