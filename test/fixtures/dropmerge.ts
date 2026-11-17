/**
 * Test mod "drop_merge_test" (user, 2026-11-16): does a mod's drop_groups.csv row ADD to a vanilla
 * drop group, or REPLACE it? The deciding test before Saga Forge lets modders add to vanilla's
 * groups (today: the mod's own groups only).
 *
 * The mod adds one hand-written row, alpha_core to vanilla's group "basic" (vanilla: metals 20,
 * heavy_machinery 1, supplies 10, fuel 10). Two supply caches at "Drop Test Range" each roll
 * "basic" 10 times on top of their own loot (vanilla's supply_cache rolls the "supply" and
 * "parts_33" groups, which have no metals). So, salvaging a cache:
 *   alpha cores AND metals     the row was added to vanilla's group (merge works)
 *   alpha cores, no metals     the group was replaced
 *   metals, no alpha cores     the mod's row was ignored
 * The row is hand-written on purpose: Saga Forge doesn't write rows into vanilla's groups.
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity } from '../../src/shared/locations'
import type { TestModDef } from './testmod'

export const DROP_MERGE_TEST: TestModDef = {
  id: 'drop_merge_test', name: 'Saga Forge test: drop group merge', prefix: 'sdm_', version: '1.0.0',
  description: 'Throwaway test mod: adds alpha_core to vanilla drop group basic, and two caches that roll it. Tells whether a mod adds to or replaces a vanilla drop group. Dev mode: Ctrl+F9.',
  model() {
    const m = emptyModel('sdm_')
    const sys = newSystem('sdm_range', 'Drop Test Range', 10000, 5500)
    sys.addToExistingSaves = true
    const caches = ['a', 'b'].map((x, i) => {
      const e = Object.assign(newEntity('custom', `sdm_cache_${x}`, `Drop test cache ${x.toUpperCase()}`, 'star', 2400, i * 40), { type: 'supply_cache' })
      e.loot = [{ group: 'basic', chances: 10 }]
      return e
    })
    sys.entities.push(...caches, newEntity('jumpPoint', 'sdm_jp', 'Drop Test Range Jump-point', 'star', 3400, 180))
    m.systems.push(sys)
    m.testProfiles.push({ id: 'sdm_go', name: 'Drop test: go to the caches', quests: {}, flags: {}, player: { startAt: 'sdm_cache_a', cargo: [{ item: 'heavy_machinery', qty: 20 }] } })
    return m
  },
  extraFiles: {
    // hand-written, outside Saga Forge: one row added to vanilla's group "basic"
    'data/campaign/procgen/drop_groups.csv': 'commodity,group,freq\nalpha_core,basic,41\n'
  }
}
