/**
 * Test mod for Phase 7c (random targets, SagaLib 1.2): mods\seven_c, prefix svc_. In-game list:
 * docs/INGAME-CHECKS.md "Phase 7c". Each test is a quest offered at Range Control C ("Test 7c-N, …");
 * accepting runs vanilla's search (the first Stage node), and the next dialog shows what it found.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import type { DialogNode, QuestPlan, TargetDef } from '../../../src/shared/model'
import { dlg, type TestModDef } from '../testmod'

const facts = (q: string, v: string) => `$global.${q}_${v}_name (system "$global.${q}_${v}_system", $global.${q}_${v}_dist light-years from here, faction "$global.${q}_${v}_faction")`

/** Offer → accept → Stage (runs the search) → "found" dialog → Arrive at the target (an option there) → End. */
function targetQuest(id: string, n: string, title: string, v: string, target: TargetDef, what: string, arriveOption: string): QuestPlan {
  const q = newQuest(id, `Test 7c-${n}: ${title}`, 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == svc_station'], optionText: `Test 7c-${n}, ${title}` }
  q.variables.push({ name: v, type: 'target', scope: 'quest', initial: '', target })
  q.stages = [{ id: 'go', title: `Go to the ${v}`, journal: `Test 7c-${n}: go to $global.${id}_${v}_name in $global.${id}_${v}_system.`, nextStep: `Go to $global.${id}_${v}_name`, marker: `target:${v}`, kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((x) => x.id === 'offer') as DialogNode
  offer.title = 'Offer'
  offer.text = `Test 7c-${n}. Accept to let vanilla's mission search pick ${what}. The next text names it.`
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    dlg('found', 760, 40, `Test 7c-${n}: the search picked ${facts(id, v)}. It is marked on the map and in the journal.`, [{ id: 'ok', text: 'Fly there' }], 'Found'),
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' },
    { id: 'arrive', type: 'wait', x: 760, y: 220, mode: 'arrive', entity: `target:${v}`, optionText: arriveOption, arriveText: `Test 7c-${n} passed: you reached the target.` },
    { id: 'end', type: 'end', x: 1000, y: 220, outcome: 'success' },
    { id: 'menu2', type: 'link', x: 1240, y: 220, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' },
    { id: 'c', from: 'st', handle: 'next', to: 'found' }, { id: 'd', from: 'found', handle: 'ok', to: 'arrive' },
    { id: 'f', from: 'arrive', handle: 'next', to: 'end' }, { id: 'g', from: 'end', handle: 'next', to: 'menu2' }
  )
  return q
}

/** 7c-4: a target nothing can match: the quest doesn't start, and the Branch says so. */
function never(): QuestPlan {
  const q = newQuest('svc_never', 'Test 7c-4: an impossible target', 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == svc_station'], optionText: 'Test 7c-4, an impossible target' }
  q.variables.push({ name: 'none', type: 'target', scope: 'quest', initial: '', target: { pick: 'planet', require: [{ id: 'plGasGiant', args: [] }, { id: 'plNotGasGiant', args: [] }], prefer: [], mock: { name: 'Nowhere' } } })
  q.stages = [{ id: 'go', title: 'Go', journal: 'Should never start.', marker: 'target:none', kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((x) => x.id === 'offer') as DialogNode
  offer.text = 'Test 7c-4. The target must be a gas giant and not a gas giant: nothing matches, so accepting must not start the quest.'
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'check', type: 'branch', x: 760, y: 40, title: 'Started?', cases: [{ id: 'started', label: 'started (wrong)', conditions: ['SF_QuestState svc_never active'] }] },
    dlg('bad', 1000, 0, 'Test 7c-4 FAILED: the quest started although nothing can match.', [{ id: 'bad_ok', text: 'Note it' }], 'Wrong'),
    dlg('good', 1000, 140, 'Test 7c-4 passed: nothing matched, so the quest didn\'t start. The log says which target found nothing.', [{ id: 'good_ok', text: 'Good' }], 'Right'),
    { id: 'menu', type: 'link', x: 1240, y: 40, mode: 'menu', target: '' },
    { id: 'end', type: 'end', x: 1240, y: 200, outcome: 'fail' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'menu' },
    { id: 'c', from: 'st', handle: 'next', to: 'check' }, { id: 'd', from: 'check', handle: 'started', to: 'bad' }, { id: 'e', from: 'check', handle: 'else', to: 'good' },
    { id: 'f', from: 'bad', handle: 'bad_ok', to: 'end' }, { id: 'g', from: 'good', handle: 'good_ok', to: 'menu' }
  )
  return q
}

export const SEVEN_C: TestModDef = {
  id: 'seven_c', name: 'Saga Forge test 7c: random targets', prefix: 'svc_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 7c (SagaLib 1.2 random targets). Dev mode: Ctrl+F9, profile 7c.',
  model() {
    const m = emptyModel('svc_')
    m.project.saga.positions = { svc_ruin: [40, 40], svc_market: [320, 40], svc_system: [600, 40], svc_never: [880, 40] }
    const sys = newSystem('svc_range', 'Test Range C', 1000, 8500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'svc_station', 'Range Control C', 'star', 2200, 0)
    station.market = { ...newMarket('svc_station', 'Range Control C', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'] }
    const jp = newEntity('jumpPoint', 'svc_jp', 'Test Range C Jump-point', 'star', 3200, 180)
    sys.entities.push(station, jp)
    m.systems.push(sys)

    m.quests.push(
      targetQuest('svc_ruin', '1', 'a planet with ruins', 'ruin', {
        pick: 'planet', require: [{ id: 'plUnpopulated', args: [] }, { id: 'sysWithin', args: ['giver', 25] }], prefer: [{ id: 'plRuins', args: [] }, { id: 'plUnexploredRuins', args: [] }],
        systemFirst: false, mock: { name: 'Mock ruin world', system: 'Mock system', dist: 9.5, faction: '' }
      }, 'an uncolonised planet within 25 light-years, preferably with unexplored ruins', 'Test 7c-1, search the ruins'),
      targetQuest('svc_market', '2', 'a Hegemony market', 'post', {
        pick: 'market', require: [{ id: 'mkFaction', args: [['hegemony']] }, { id: 'mkSizeAtLeast', args: [5] }], prefer: [{ id: 'mkMilitary', args: [] }],
        mock: { name: 'Mock Hegemony world', system: 'Mock system', dist: 14, faction: 'Hegemony' }
      }, 'a Hegemony colony of size 5 or more, preferably with a military base', 'Test 7c-2, report to the garrison'),
      targetQuest('svc_system', '3', 'a star system', 'sys', {
        pick: 'system', require: [{ id: 'sysWithin', args: ['giver', 15] }], prefer: [{ id: 'sysUnexplored', args: [] }, { id: 'sysTags', args: ['ANY', ['theme_ruins', 'theme_derelict']] }],
        mock: { name: 'Mock system', system: 'Mock system', dist: 6, faction: '' }
      }, 'a star system within 15 light-years, preferably unexplored, with ruins or derelicts', 'Test 7c-3, scan the system'),
      never()
    )
    m.testProfiles.push({ id: 'svc_go', name: '7c: go to Test Range C', quests: {}, flags: {}, player: { startAt: 'svc_station', credits: 50000 } })
    return m
  }
}
