/**
 * Test mod "grid_test" (user, 2026-11-16): a grid of systems over the top-left quarter of the
 * sector, made exactly as the editor's Locations › New system makes them (id = prefix + slug(name),
 * newSystem's defaults: a yellow star, nothing else; positions on the editor's 50-unit snap), 3,000
 * units apart (the closest the editor allows without its warning). Grid points near vanilla's fixed
 * systems are kept: they carry the editor's "too close" warning, as they would for a modder.
 * Tests map space, vanilla's random generation working around mod systems, hyperspace cloud
 * clearing and load time with many systems. Built by scripts/build-test-mod.ts grid_test.
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem } from '../../src/shared/locations'
import { slug } from '../../src/shared/quest'
import type { TestModDef } from './testmod'

export const GRID = { spacing: 3000, x0: -81000, x1: -3000, y0: 3000, y1: 51000 }

export const GRID_TEST: TestModDef = {
  id: 'grid_test', name: 'Saga Forge test: system grid', prefix: 'sgt_', version: '1.0.0',
  description: 'Throwaway test mod: a 3,000-unit grid of star systems over the top-left quarter of the sector, made as the Saga Forge editor makes them. New games only.',
  model() {
    const m = emptyModel('sgt_')
    let c = 0
    for (let x = GRID.x0; x <= GRID.x1; x += GRID.spacing) {
      c++
      let r = 0
      for (let y = GRID.y0; y <= GRID.y1; y += GRID.spacing) {
        r++
        const name = `Grid C${String(c).padStart(2, '0')} R${String(r).padStart(2, '0')}`
        // as LocationsPage.createSystem: id = prefix + slug(name), snapped to the editor's 50 units
        const id = m.project.prefix + slug(name).replace(new RegExp(`^${m.project.prefix}`), '')
        m.systems.push(newSystem(id, name, Math.round(x / 50) * 50, Math.round(y / 50) * 50))
      }
    }
    // dev mode: jump to the middle of the grid (a system's star is <system id>_star in SagaLib)
    const mid = m.systems[Math.floor(m.systems.length / 2)]
    m.testProfiles.push({ id: 'sgt_go', name: 'Grid: go to the middle of the grid', quests: {}, flags: {}, player: { startAt: `${mid.id}_star` } })
    return m
  }
}
