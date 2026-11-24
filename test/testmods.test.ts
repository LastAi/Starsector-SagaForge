/**
 * The Phase 7 test mods (mods\seven_a, ...; scripts/build-test-mod.ts): each builds, needs the
 * SagaLib version it tests, has a profile that takes the player to its test range, and has no
 * errors or option-label warnings against the real game index.
 */
import { describe, expect, it } from 'vitest'
import { testModFiles, testModState, type TestModDef } from './fixtures/testmod'
import { SEVEN_A } from './fixtures/phase7/seven_a'
import { SEVEN_B } from './fixtures/phase7/seven_b'
import { SEVEN_C } from './fixtures/phase7/seven_c'
import { SEVEN_D } from './fixtures/phase7/seven_d'
import { SEVEN_E } from './fixtures/phase7/seven_e'
import { GRID_TEST, GRID } from './fixtures/gridtest'
import { DROP_MERGE_TEST } from './fixtures/dropmerge'
import { EIGHT_A } from './fixtures/phase8/eight_a'
import { EIGHT_C } from './fixtures/phase8/eight_c'
import { EIGHT_D } from './fixtures/phase8/eight_d'
import { SIXTY_A } from './fixtures/sixty'
import { TWENTYSEVEN_A } from './fixtures/twentyseven'
import { SIXTYONE_A } from './fixtures/sixtyone'
import { SIXTYTWO_A } from './fixtures/sixtytwo'
import { SEVENTYFIVE_A } from './fixtures/seventyfive'
import { SEVENTYSEVEN_A } from './fixtures/seventyseven'
import { SEVENTYNINE_A } from './fixtures/seventynine'
import { EIGHTY_A } from './fixtures/eighty'
import { SCRATCH67 } from './fixtures/scratch67'
import { SIXTYTHREE_A } from './fixtures/sixtythree'
import { SIXTYFIVE_A } from './fixtures/sixtyfive'
import { checkModel } from '../src/shared/checks'
import { planTexts } from '../src/shared/serialize'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import { defsFor } from '../src/shared/defs'
import type { ValidInstall } from '../src/shared/api'
import { realDir } from './realdir'

// #67 U12: eight_d and eighty_a run event actions without a dialog (SagaLib 1.4)
const MODS: [TestModDef, string][] = [[SEVEN_A, '1.2.0'], [SEVEN_B, '1.2.0'], [SEVEN_C, '1.2.0'], [SEVEN_D, '1.2.0'], [SEVEN_E, '1.2.0'], [DROP_MERGE_TEST, '1.2.0'], [EIGHT_A, '1.2.0'], [EIGHT_C, '1.2.0'], [EIGHT_D, '1.4.0'], [SIXTY_A, '1.3.0'], [TWENTYSEVEN_A, '1.3.0'], [SIXTYONE_A, '1.3.0'], [SIXTYTWO_A, '1.3.0'], [SIXTYTHREE_A, '1.3.0'], [SIXTYFIVE_A, '1.3.0'], [SEVENTYFIVE_A, '1.4.0'], [SEVENTYSEVEN_A, '1.4.0'], [SEVENTYNINE_A, '1.4.0'], [EIGHTY_A, '1.4.0'], [SCRATCH67, '1.4.0']]

describe.each(MODS)('test mod %s', (def, lib) => {
  it('builds, depends on the SagaLib it tests and teleports to its test range', () => {
    const files = testModFiles(def)
    expect(files['mod_info.json']).toContain(`"version": "${lib}"`)
    const profiles = JSON.parse(files['data/sagaforge/dev/test_profiles.json']).profiles as { player: { startAt?: string } }[]
    const ids = new Set(def.model().systems.flatMap((s) => [...s.entities.map((e) => e.id), `${s.id}_star`]))
    const starts = profiles.map((p) => p.player.startAt).filter(Boolean)
    expect(starts.length).toBeGreaterThan(0)
    for (const s of starts) expect(ids.has(s!)).toBe(true)
  })

  it.skipIf(!realDir)('has no errors or warnings against the game', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = def.model()
    const probs = checkModel({ model: m, index: cache.index, defs: defsFor(install.gameVersion), loaded: testModState(def, m, planTexts(m)), rules: cache.rules, styleChecks: false })
    expect(probs.filter((p) => p.level === 'error' || p.level === 'warning').map((p) => p.message).filter((msg) => !(def.expectedWarnings ?? []).some((r) => r.test(msg)))).toEqual([])
  }, 120_000)
})

describe('systems too close in hyperspace (found in game 2026-11-16)', () => {
  it.skipIf(!realDir)('warns when a new system sits on a vanilla one (Test Range E was 200 units from Mayasura)', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = SEVEN_E.model()
    m.systems[0].hyperspace = [-6200, -200]
    const probs = checkModel({ model: m, index: cache.index, defs: defsFor(install.gameVersion), loaded: testModState(SEVEN_E, m, planTexts(m)), rules: cache.rules, styleChecks: false })
    expect(probs.some((p) => p.key === 'sysclose:sve_range:mayasura')).toBe(true)
  }, 120_000)
})

describe('grid_test (user, 2026-11-16)', () => {
  it('is a 3,000-unit grid over the top-left quarter, made as the editor makes systems', () => {
    const m = GRID_TEST.model()
    expect(m.systems).toHaveLength(27 * 17)
    for (const sy of m.systems) {
      expect(sy.id).toMatch(/^sgt_grid_c[0-9]{2}_r[0-9]{2}$/)
      expect(sy.entities).toEqual([])
      const [x, y] = sy.hyperspace!
      expect(x % 50 === 0 && y % 50 === 0).toBe(true)
      expect(x >= -82000 && x < 0 && y > 0 && y <= 52000).toBe(true)
    }
    expect(GRID.spacing).toBe(3000)
    const files = testModFiles(GRID_TEST)
    expect(Object.keys(files).filter((f) => f.startsWith('data/sagaforge/systems/'))).toHaveLength(459)
  })
  it.skipIf(!realDir)('has no errors; its only warnings are the "too close" ones near vanilla systems', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = GRID_TEST.model()
    const probs = checkModel({ model: m, index: cache.index, defs: defsFor(install.gameVersion), loaded: testModState(GRID_TEST, m, planTexts(m)), rules: cache.rules, styleChecks: false })
    expect(probs.filter((p) => p.level === 'error').map((p) => p.message)).toEqual([])
    const warns = probs.filter((p) => p.level === 'warning')
    expect(warns.every((p) => p.key?.startsWith('sysclose:'))).toBe(true)
    console.log(`grid_test: ${warns.length} systems near vanilla ones`)
  }, 120_000)
})

describe('drop_merge_test (user, 2026-11-16)', () => {
  it('adds exactly one hand-written row to vanilla group basic', () => {
    const files = testModFiles(DROP_MERGE_TEST)
    expect(files['data/campaign/procgen/drop_groups.csv']).toBe('commodity,group,freq\nalpha_core,basic,41\n')
    const sys = JSON.parse(files['data/sagaforge/systems/sdm_range.json'])
    expect(sys.entities.filter((e: { loot?: unknown }) => e.loot).map((e: { loot: unknown }) => e.loot)).toEqual([[{ group: 'basic', chances: 10 }], [{ group: 'basic', chances: 10 }]])
  })
})
