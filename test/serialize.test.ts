import { describe, expect, it } from 'vitest'
import { factionsCsvText, factionText, modelFromProject, modelToWrites, emptyModel, planTexts } from '../src/shared/serialize'
import { hashText } from '../src/main/install'
import type { ProjectState } from '../src/shared/project'
import { newProjectFile } from '../src/shared/model'

function state(files: Record<string, string>, factions: ProjectState['factions'] = []): ProjectState {
  return {
    sourceId: 'my_mod', modDir: '/x', modInfo: { id: 'my_mod', name: 'My', version: '1', gameVersion: '', dependencies: [] }, isNew: false,
    project: newProjectFile('mm_'), quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [],
    factionsRuntime: { relations: {}, scripted: {} }, descriptions: {}, factions, releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}

describe('saving the model', () => {
  it('writes nothing when nothing changed', () => {
    const m = emptyModel('mm_')
    const texts = planTexts(m)
    const st = state(texts)
    st.project = m.project
    expect(modelToWrites(modelFromProject(st), st)).toEqual([])
  })

  it('writes a changed plan file with the hash it was read with, and removes deleted quest files', () => {
    const m = emptyModel('mm_')
    const st = state({ ...planTexts(m), 'sagaforge/quests/mm_old.quest.json': '{}' })
    const writes = modelToWrites(m, st)
    expect(writes).toEqual([{ path: 'sagaforge/quests/mm_old.quest.json', text: '', remove: true, expectedHash: hashText('{}') }])
    m.project.prefix = 'nn_'
    const w2 = modelToWrites(m, st).find((w) => w.path === 'sagaforge/project.json')!
    expect(w2.expectedHash).toBe(hashText(planTexts(emptyModel('mm_'))['sagaforge/project.json']))
  })

  it('patches an existing faction file in place, keeping comments', () => {
    const old = '# my comment\n{\n\t"id":"mm_x", # inline\n\t"displayName":"X",\n}\n'
    const t = factionText({ kind: 'addition', id: 'mm_x', file: 'f', raw: { id: 'mm_x', displayName: 'Y' }, listed: true }, old)
    expect(t).toBe('# my comment\n{\n\t"id":"mm_x", # inline\n\t"displayName":"Y",\n}\n')
  })

  it('writes an override as the patch only, with a header', () => {
    const t = factionText({ kind: 'override', id: 'hegemony', file: 'data/world/factions/hegemony.faction', patch: { set: {}, add: { 'knownShips.hulls': ['mm_ship'] } } }, undefined)
    expect(t).toMatch(/^# Saga Forge override of hegemony/)
    expect(t).toContain('"mm_ship"')
    expect(t).not.toContain('displayName')
  })

  it('keeps factions.csv rows of others and adds or drops only ours', () => {
    const old = 'faction\r\ndata/world/factions/other.faction\r\n'
    const add = factionsCsvText(old, [{ kind: 'addition', id: 'a', file: 'data/world/factions/a.faction', raw: {}, listed: true }])
    expect(add).toBe('faction\r\ndata/world/factions/other.faction\r\ndata/world/factions/a.faction\r\n')
    const drop = factionsCsvText(add!, [{ kind: 'addition', id: 'a', file: 'data/world/factions/a.faction', raw: {}, listed: false }])
    expect(drop).toBe(old)
    expect(factionsCsvText(old, [])).toBe(old)
  })
})
