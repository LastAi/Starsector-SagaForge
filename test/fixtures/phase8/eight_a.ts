/**
 * Test mods for Phase 8a (loot groups): mods\eight_a (prefix sea_) and mods\eight_a_twin.
 *
 * F7-a: a loot pool made the editor's way adds alpha_core (100) to vanilla's group ai_cores1
 * (vanilla: nothing 100, gamma_core 5). F7-c: eight_a_twin adds the SAME row by hand. Four supply
 * caches at "Test Range 8A" each roll ai_cores1 40 times (a supply cache never drops cores itself):
 *   eight_a alone:            alpha ~100/205 = 49% of the rolls (about 20 of 40 per cache)
 *   with eight_a_twin, stack: alpha ~200/305 = 66% (about 26 of 40 per cache)
 *   with eight_a_twin, one wins: alpha ~49% again
 * F7-b: a quest reward that rolls vanilla's rare_tech group 3 times.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import type { DialogNode } from '../../../src/shared/model'
import type { TestModDef } from '../testmod'

export const EIGHT_A: TestModDef = {
  id: 'eight_a', name: 'Saga Forge test 8a: loot groups', prefix: 'sea_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 8a: a loot pool that adds to a vanilla drop group, and a reward that rolls one. Dev mode: Ctrl+F9, profile 8a.',
  model() {
    const m = emptyModel('sea_')
    // F7-a: added to vanilla's ai_cores1 by the editor's export
    m.pools!.push({ id: 'sea_more_alphas', name: 'More alpha cores', draw: 'pickOne', use: 'loot', addsTo: 'ai_cores1', entries: [{ id: 'alpha_core', label: 'Alpha core', weight: 100, conditions: [] }] })

    const sys = newSystem('sea_range', 'Test Range 8A', 10000, 8500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sea_station', 'Range Control 8A', 'star', 2000, 0)
    station.market = { ...newMarket('sea_station', 'Range Control 8A', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'] }
    const caches = ['a', 'b', 'c', 'd'].map((x, i) => {
      const e = Object.assign(newEntity('custom', `sea_cache_${x}`, `Core cache ${x.toUpperCase()}`, 'star', 2600, 20 + i * 25), { type: 'supply_cache' })
      e.loot = [{ group: 'ai_cores1', chances: 40 }]
      return e
    })
    sys.entities.push(station, ...caches, newEntity('jumpPoint', 'sea_jp', 'Test Range 8A Jump-point', 'star', 3400, 200))
    m.systems.push(sys)

    // F7-b: a reward that rolls vanilla's rare_tech group
    const q = newQuest('sea_reward', 'Test 8a-3: a reward of random items', 'quest')
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sea_station'], optionText: 'Test 8a-3, collect a random reward' }
    q.repeatable = true
    q.stages = [{ id: 'paid', title: 'Paid', journal: 'Test 8a-3.', kind: 'normal', renamedFrom: [] }]
    q.rewards = [{ id: 'loot', credits: 1000, loot: [{ group: 'rare_tech', chances: 3 }] }]
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = 'Test 8a-3. Accept: the reward is 1,000 credits and 3 rolls of vanilla\'s rare_tech drop group, shown as "Gained" lines. Repeatable.'
    q.nodes.push(
      { id: 'st', type: 'stage', x: 520, y: 40, stage: 'paid' },
      { id: 'end', type: 'end', x: 760, y: 40, outcome: 'success', reward: 'loot' },
      { id: 'menu', type: 'link', x: 1000, y: 40, mode: 'menu', target: '' },
      { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
    )
    q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'st', handle: 'next', to: 'end' }, { id: 'd', from: 'end', handle: 'next', to: 'menu' })
    m.quests.push(q)

    m.testProfiles.push({ id: 'sea_go', name: '8a: go to Test Range 8A (with 60 heavy machinery)', quests: {}, flags: {}, player: { startAt: 'sea_station', cargo: [{ item: 'heavy_machinery', qty: 60 }] } })
    return m
  }
}

/** F7-c: a second mod adding the same row to ai_cores1, by hand (nothing else). */
export const EIGHT_A_TWIN: TestModDef = {
  id: 'eight_a_twin', name: 'Saga Forge test 8a: twin row', prefix: 'seb_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 8a (F7-c): adds the same alpha_core row to vanilla group ai_cores1 as eight_a. Enable it for the second run only.',
  model() { return emptyModel('seb_') },
  extraFiles: { 'data/campaign/procgen/drop_groups.csv': 'commodity,group,freq\nalpha_core,ai_cores1,100\n' }
}
