/** #67 U45 (user, 2026-11-24): conditions in plain words, and where they can work. */
import { describe, expect, it } from 'vitest'
import { conditionScopeProblem, conditionScopeProblems, describeCondition, keyScope, namesFrom } from '../src/shared/conditions'
import { emptyModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'

const model = () => {
  const m = emptyModel('toc_')
  m.quests.push({ ...newQuest('toc_main', 'The Other Captain'), kind: 'quest' })
  m.progress = [{ id: 'toc_progress', name: 'Hegemony Warrant', max: 1000, startConditions: ['$global.toc_warrant_on'], stages: [{ id: 'patrol', progress: 300, title: 'Police patrols', text: '', actions: [] }], factors: [{ id: 'f', desc: 'Open', points: 50, conditions: ['$person.id == toc_varro'] }] }]
  return m
}
const n = { ...namesFrom(model()), faction: (id: string) => (id === 'hegemony' ? 'Hegemony' : undefined) }

describe('#67 U45: conditions in plain words', () => {
  it('flags, negation, comparisons', () => {
    expect(describeCondition('$global.toc_fought_hegemony', n)).toBe('Game flag toc_fought_hegemony is set (true)')
    expect(describeCondition('!$global.toc_name_cleared', n)).toBe('Game flag toc_name_cleared is not set (or false)')
    expect(describeCondition('$player.credits >= 10000', n)).toBe('The player has at least 10000 credits')
    expect(describeCondition('$player.gender == FEMALE', n)).toBe('The player is female')
    expect(describeCondition('$market.factionId == hegemony', n)).toBe('The market belongs to Hegemony')
  })
  it('quests, progress events and SagaLib commands by name', () => {
    expect(describeCondition('$global.toc_main_state == active', n)).toBe('Quest "The Other Captain" is running')
    expect(describeCondition('$global.toc_main_step == pay', n)).toBe('Quest "The Other Captain" is at stage pay')
    expect(describeCondition('$global.toc_progress_stage == patrol', n)).toBe('Progress event "Hegemony Warrant": its last stage reached is patrol')
    expect(describeCondition('SF_QuestDone toc_main success', n)).toBe('Quest "The Other Captain" succeeded')
    expect(describeCondition('RepIsAtWorst hegemony FAVORABLE', n)).toBe('Reputation with Hegemony is favorable or better')
    expect(describeCondition('!SF_HasMod nexerelin', n)).toBe('Not: Mod nexerelin is enabled')
    expect(describeCondition('Wait 3', { command: () => 'Waits a little.' })).toBe('Wait 3: Waits a little')
  })
  it('outside a dialog only $global and $player exist', () => {
    expect(keyScope('$global.x')).toBe('global')
    expect(keyScope('$option')).toBe('local')
    expect(conditionScopeProblem('$global.x', 'global')).toBeNull()
    expect(conditionScopeProblem('$player.credits >= 5', 'global')).toBeNull()
    expect(conditionScopeProblem('$person.id == toc_varro', 'global')).toContain('never true')
    expect(conditionScopeProblem('SF_FactionRep $faction.id hegemony NEUTRAL', 'global')).toContain('$faction.id')
    expect(conditionScopeProblem('$person.id == toc_varro', 'dialog')).toBeNull()
    expect(conditionScopeProblems(model()).map((p) => p.key)).toEqual(['condscope:toc_progress:f:$person.id == toc_varro'])
  })
})
