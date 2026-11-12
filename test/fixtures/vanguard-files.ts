/** The Vanguard Compact example mod's files: plan files, faction files and the export (no test framework, so scripts can use it). */
import { vanguardModel, VGC } from './vanguard'
import { planExport } from '../../src/shared/export'
import { modelToWrites } from '../../src/shared/serialize'
import { hashText } from '../../src/main/install'
import type { ProjectState } from '../../src/shared/project'

export function exampleState(files: Record<string, string> = {}): ProjectState {
  const m = vanguardModel()
  return {
    sourceId: VGC.modId, modDir: '/x', isNew: false,
    modInfo: { id: VGC.modId, name: VGC.name, version: VGC.version, gameVersion: '0.98a-RC8', dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: { relations: {}, scripted: {} },
    descriptions: {}, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}

const MOD_INFO = '{\n\t"id": "vgc",\n\t"name": "Vanguard Compact",\n\t"author": "LastAi",\n\t"version": "1.0.0",\n\t"description": "Example mod made with Saga Forge.",\n\t"gameVersion": "0.98a-RC8",\n}\n'

/** Every file of the example mod: plan files, faction files, and the export. */
export function exampleFiles(): Record<string, string> {
  const m = vanguardModel()
  const base: Record<string, string> = { 'mod_info.json': MOD_INFO }
  const st0 = exampleState(base)
  const saved = { ...base }
  for (const w of modelToWrites(m, st0)) if (!w.remove) saved[w.path] = w.text
  const st = exampleState(saved)
  const plan = planExport(m, st, { factions: [], items: [], people: [], markets: [] } as never, null, { addDependency: true })
  const out = { ...saved }
  for (const w of plan.writes) { if (w.remove) delete out[w.path]; else out[w.path] = w.text }
  return out
}
