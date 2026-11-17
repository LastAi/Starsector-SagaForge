/**
 * Test mod for Phase 7a (random pools, SagaLib 1.2): mods\seven_a, prefix sva_. In-game list:
 * docs/INGAME-CHECKS.md "Phase 7a: random pools". Everything is at Test Range A; the dev-mode
 * profile "7a: go to Test Range A" (Ctrl+F9) takes the player there.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import type { TestModDef } from '../testmod'
import { rollConversation } from '../testmod'

export const SEVEN_A: TestModDef = {
  id: 'seven_a', name: 'Saga Forge test 7a: random pools', prefix: 'sva_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 7a (SagaLib 1.2 pools). Dev mode: Ctrl+F9, profile 7a.',
  model() {
    const m = emptyModel('sva_')
    m.project.saga.positions = { sva_dice: [40, 40], sva_scan_a: [320, 40], sva_scan_b: [600, 40] }

    // ---- the test range: a station with a small market, two uncolonised planets, a jump point
    const sys = newSystem('sva_range', 'Test Range A', 1000, 5500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sva_station', 'Range Control A', 'star', 2200, 0)
    station.market = { ...newMarket('sva_station', 'Range Control A', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'] }
    // uncolonised planets: their dialog (vanilla surveyOpen) fires PopulateOptions; a derelict's doesn't
    const rocks = (['a', 'b'] as const).map((w, i) => Object.assign(newEntity('planet', `sva_rock_${w}`, `Test rock ${w.toUpperCase()}`, 'star', 2700, 15 + i * 20), { type: 'barren', conditions: ['no_atmosphere'], surveyed: 'full' as const }))
    const jp = newEntity('jumpPoint', 'sva_jp', 'Test Range A Jump-point', 'star', 3200, 180)
    sys.entities.push(station, ...rocks, jp)
    m.systems.push(sys)

    // ---- 7a-1: an inline Random branch rolled for the world, every kind of limit
    m.quests.push(rollConversation({
      id: 'sva_dice', title: 'Test 7a-1: the dice', at: 'sva_station', optionText: 'Test 7a-1, roll the dice (inline pool, world)',
      intro: 'Test 7a-1. Each roll picks one: Common 6, Uncommon 3, Rare 1 (at most 2 times), Once 2 (once per playthrough), Daily 2 (once a day), Rich 4 (only with 100,000 credits or more), Nothing 1.',
      cases: [
        { id: 'common', label: 'Common', conditions: [], weight: 6 },
        { id: 'uncommon', label: 'Uncommon', conditions: [], weight: 3 },
        { id: 'rare', label: 'Rare', conditions: [], weight: 1, limit: { max: 2 } },
        { id: 'once', label: 'Once', conditions: [], weight: 2, limit: { once: 'playthrough' } },
        { id: 'daily', label: 'Daily', conditions: [], weight: 2, limit: { cooldownDays: 1 } },
        { id: 'rich', label: 'Rich', conditions: ['$player.credits >= 100000'], weight: 4 }
      ],
      random: { nothing: 1, scope: 'global' },
      resultText: (l) => `Result: ${l}.`
    }))

    // ---- 7a-2: a named pool rolled per object, the same at two uncolonised planets
    m.pools!.push({
      id: 'sva_rock_finds', name: 'Rock finds', draw: 'pickOne', nothing: 2,
      notes: 'Test 7a-2: per object. Data core once per rock, Beacon at most once in the whole game.',
      entries: [
        { id: 'core', label: 'Data core', weight: 1, conditions: [], limit: { once: 'object' } },
        { id: 'scrap', label: 'Scrap', weight: 5, conditions: [] },
        { id: 'beacon', label: 'Beacon', weight: 2, conditions: [], limit: { max: 1 } }
      ]
    })
    const finds = [{ id: 'core', label: 'Data core', conditions: [] }, { id: 'scrap', label: 'Scrap', conditions: [] }, { id: 'beacon', label: 'Beacon', conditions: [] }]
    for (const [w, n] of [['a', 'A'], ['b', 'B']]) {
      m.quests.push(rollConversation({
        id: `sva_scan_${w}`, title: `Test 7a-2: scan rock ${n}`, at: `sva_rock_${w}`, optionText: 'Test 7a-2, scan the rock (named pool, per object)',
        intro: `Test 7a-2 at rock ${n}. Pool "Rock finds": Data core 1 (once per rock), Scrap 5, Beacon 2 (at most once in the game), Nothing 2. The same rock gives the same sequence after a reload.`,
        cases: finds.map((c) => ({ ...c })), random: { pool: 'sva_rock_finds', scope: 'object' },
        resultText: (l) => `Rock ${n}: ${l}.`
      }))
    }

    // ---- profiles (dev mode, Ctrl+F9)
    const at = { startAt: 'sva_station' }
    m.testProfiles.push(
      { id: 'sva_go', name: '7a: go to Test Range A', quests: {}, flags: {}, player: { ...at, credits: 50000 } },
      { id: 'sva_rich', name: '7a: rich (Rich becomes possible)', quests: {}, flags: {}, player: { ...at, credits: 200000 } },
      { id: 'sva_force_rare', name: '7a: force the next dice roll to Rare', quests: {}, flags: { '$global.sagaforge_pool_sva_dice_roll_force': 'rare' }, player: {} },
      { id: 'sva_force_core', name: '7a: force the next rock scan to Data core', quests: {}, flags: { '$global.sagaforge_pool_sva_rock_finds_force': 'core' }, player: {} }
    )
    return m
  }
}
