/**
 * Test mod for Phase 7e (loot, defenders, random encounters, scatter, the deciv guard; SagaLib
 * 1.2): mods\seven_e, prefix sve_. In-game list: docs/INGAME-CHECKS.md "Phase 7e".
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import { newEncounter } from '../../../src/shared/encounters'
import type { DialogNode } from '../../../src/shared/model'
import type { TestModDef } from '../testmod'

export const SEVEN_E: TestModDef = {
  id: 'seven_e', name: 'Saga Forge test 7e: loot, encounters, scatter', prefix: 'sve_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 7e (loot tables, defenders, random encounters, scatter, the deciv guard; SagaLib 1.2). Dev mode: Ctrl+F9, profile 7e.',
  model() {
    const m = emptyModel('sve_')
    m.project.saga.positions = { sve_report: [40, 40] }

    // 7e-1: a loot table of the mod's own (drop_groups.csv)
    m.pools!.push({
      id: 'sve_cache_loot', name: 'Test cache loot', draw: 'pickOne', use: 'loot', nothing: 5,
      entries: [
        { id: 'metals', label: 'Metals', weight: 10, conditions: [] },
        { id: 'supplies', label: 'Supplies', weight: 10, conditions: [] },
        { id: 'alpha_core', label: 'Alpha core', weight: 1, conditions: [] }
      ]
    })
    // 7e-3: random encounters at vanilla's encounter points (high frequency, for testing)
    const raiders = newEncounter('sve_raiders', 'Test 7e-3 raiders', 'pirates')
    raiders.fleet = { ...raiders.fleet, points: 20, name: 'Test 7e-3 raiders' }
    raiders.spawn = { at: '', when: 'quest-stage', despawnOnStageEnd: false }
    m.encounters.push(raiders)
    m.pools!.push({
      id: 'sve_raids', name: 'Test raids', draw: 'pickOne', use: 'encounters', points: ['slipstream', 'outside_system'], frequency: 200,
      entries: [{ id: 'sve_raiders', label: 'Test 7e-3 raiders', weight: 1, conditions: [] }]
    })

    // the test range: a protected colony (7e-5), a guarded cache (7e-1, 7e-2) and a wreck with loot
    const sys = newSystem('sve_range', 'Test Range E', 7000, 8500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sve_station', 'Range Control E', 'star', 2200, 0)
    station.market = { ...newMarket('sve_station', 'Range Control E', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], protectFromDeciv: true }
    const cache = Object.assign(newEntity('custom', 'sve_cache', 'Test 7e-1 cache', 'star', 2700, 30), { type: 'supply_cache' })
    cache.loot = [{ group: 'sve_cache_loot', chances: 4 }, { group: 'rare_tech', chances: 1 }]
    cache.defenders = { faction: 'pirates', minStr: 10, maxStr: 20 }
    const wreck = newEntity('derelict', 'sve_wreck', 'Test 7e-1 wreck', 'star', 2700, 60)
    wreck.loot = [{ group: 'sve_cache_loot', value: 4000 }]
    sys.entities.push(station, cache, wreck, newEntity('jumpPoint', 'sve_jp', 'Test Range E Jump-point', 'star', 3400, 180))
    m.systems.push(sys)

    // 7e-4: scatter (also in an existing save, so adding the mod mid-game works)
    m.scatter!.push({
      id: 'sve_beacons', name: 'Test 7e-4 probes', count: 3, addToExistingSaves: true,
      target: { pick: 'planet', require: [{ id: 'plUnpopulated', args: [] }, { id: 'sysWithin', args: ['giver', 25] }], prefer: [{ id: 'sysUnexplored', args: [] }] },
      entity: { type: 'derelict_probe', name: 'Test 7e-4 probe' },
      // measured from Range Control E, not from the player (user, 2026-11-16)
      from: 'sve_station',
      loot: [{ group: 'sve_cache_loot', chances: 2 }],
      defenders: { faction: 'remnant', prob: 0.5, minStr: 5, maxStr: 10 }
    })

    // a conversation that reports what SagaLib did
    const q = newQuest('sve_report', 'Test 7e: report', 'dialog')
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sve_station'], optionText: 'Test 7e, what did SagaLib place?' }
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.title = 'Report'
    offer.text = 'Test 7e-4: scatter "Test 7e-4 probes" placed $global.sagaforge_scatter_sve_beacons_done of 3 (the log names where). Test 7e-1: the cache and the wreck nearby have loot of the mod\'s own drop group; the cache is guarded by pirates.'
    offer.options = [{ id: 'leave', text: 'Leave', shortcut: 'ESC' }]
    q.nodes.push({ id: 'menu', type: 'link', x: 520, y: 40, mode: 'menu', target: '' })
    q.edges.push({ id: 'a', from: 'offer', handle: 'leave', to: 'menu' })
    m.quests.push(q)

    m.testProfiles.push({ id: 'sve_go', name: '7e: go to Test Range E', quests: {}, flags: {}, player: { startAt: 'sve_station', credits: 50000 } })
    return m
  }
}
