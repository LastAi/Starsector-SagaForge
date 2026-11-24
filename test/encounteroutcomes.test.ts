/** #67 U46 (user, 2026-11-24): an encounter's own outcome actions, whoever spawned it. */
import { describe, expect, it } from 'vitest'
import { encounterOutcomeRules, encounterOutcomesRuntime, encounterOutcomeTrigger } from '../src/shared/export/encounteroutcomes'
import { encounterRuntime, needsSagaLib14 } from '../src/shared/export/runtime'
import { newEncounter } from '../src/shared/encounters'
import { emptyModel } from '../src/shared/serialize'
import { describeCondition, namesFrom } from '../src/shared/conditions'

const enc = () => {
  const e = newEncounter('toc_warrant_patrol', 'Warrant patrol', 'hegemony')
  e.onDefeated = [{ op: 'set', key: '$global.toc_fought_hegemony', value: 'true' }, { op: 'progress', event: 'toc_progress', points: 50, text: '' }]
  return e
}

describe('#67 U46: encounter outcome actions', () => {
  it('writes a trigger and the ops SagaLib runs itself', () => {
    const o = encounterOutcomesRuntime(enc())
    expect(o.defeated).toBe(encounterOutcomeTrigger('toc_warrant_patrol', 'defeated'))
    expect(o.defeatedActions).toEqual([{ op: 'set', key: '$global.toc_fought_hegemony', value: 'true' }, { op: 'progress', event: 'toc_progress', points: 50 }])
    expect(o.avoided).toBeUndefined()
    expect(encounterOutcomeRules([enc()])).toEqual([])
  })
  it('the encounter file has no editor fields; the mod needs SagaLib 1.4', () => {
    const m = emptyModel('toc_')
    m.encounters.push(enc())
    const j = encounterRuntime(m.encounters[0], m)
    expect(j.onDefeated).toBeUndefined()
    expect((j.outcomes as Record<string, unknown>).defeated).toBe('SF_enc_toc_warrant_patrol_defeated')
    expect(needsSagaLib14(m)).toBe(true)
  })
  it('a raw rules line stays a rule on the trigger', () => {
    const e = enc()
    e.onAvoided = [{ op: 'line', line: 'AddText "They got away."' }]
    const rows = encounterOutcomeRules([e])
    expect(rows.map((r) => [r.trigger, r.script])).toEqual([['SF_enc_toc_warrant_patrol_avoided', 'AddText "They got away."']])
    expect(encounterOutcomesRuntime(e).avoidedActions).toBeUndefined()
  })
  it('conditions on how an encounter ended, in plain words', () => {
    const m = emptyModel('toc_')
    m.encounters.push(enc())
    const n = namesFrom(m)
    expect(describeCondition('$global.sagaforge_enc_toc_warrant_patrol_state == defeated', n)).toBe('Encounter "Warrant patrol": its fleet was beaten')
    expect(describeCondition('$global.sagaforge_fleet_toc_john_defeats >= 2', n)).toBe('Named fleet "toc_john" beaten at least 2 times')
  })
})
