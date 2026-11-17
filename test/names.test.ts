/** Phase 2 (DESIGN-PHASE2.md): name lists (R3), faction runtime keys (RC-R13), Other keys survey (R7). */
import { describe, expect, it } from 'vitest'
import { planExport } from '../src/shared/export'
import { personNameRows, shipNameLists, poolCounts } from '../src/shared/export/names'
import { emptyModel, planTexts, modelToWrites, type ModModel } from '../src/shared/serialize'
import { nameProblems, nameCategoryTotals, usedByFactions } from '../src/shared/checks/names'
import { factionKeySurvey, factionKeyDoc, KNOWN_CUSTOM_KEYS } from '../src/shared/factionkeys'
import { FACTION_TABS, visibleFields, newFactionDoc, KNOWN_TOP_KEYS } from '../src/shared/factionform'
import { findBlocks } from '../src/shared/export/blocks'
import { parseCsvRecords } from '../src/shared/csvedit'
import { parseLooseObject } from '../src/shared/loosejson'
import { referenceSections } from '../src/shared/reference'
import { defsFor } from '../src/shared/defs'
import { hashText } from '../src/main/install'
import type { ProjectState } from '../src/shared/project'
import type { GameIndex } from '../src/shared/api'

const defs = defsFor('0.98a')

function index(extra: Partial<GameIndex> = {}): GameIndex {
  return {
    factions: [], items: [], people: [], markets: [], sources: [{ id: 'starsector-core', name: 'Starsector' }],
    nameCategories: [{ id: 'modern', counts: { 'starsector-core': { male: 10, female: 9, last: 30 } } }, { id: 'sfw_cats', counts: { sfw: { male: 0, female: 3, last: 0 } } }],
    shipNameLists: [{ id: 'GREEK', counts: { 'starsector-core': 700 } }],
    ...extra
  } as unknown as GameIndex
}

function state(m: ModModel, files: Record<string, string> = {}): ProjectState {
  return {
    sourceId: 'sfw', modDir: '/x', isNew: false,
    modInfo: { id: 'sfw', name: 'Workflow', version: '1.0.0', gameVersion: '0.98a', dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [],
    factionsRuntime: m.factionsRuntime, descriptions: {}, names: m.names, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}
const apply = (files: Record<string, string>, writes: { path: string; text: string; remove?: boolean }[]) => {
  const out = { ...files }
  for (const w of writes) { if (w.remove) delete out[w.path]; else out[w.path] = w.text }
  return out
}

function catMod(): ModModel {
  const m = emptyModel('sfw_')
  m.names.people.push({ id: 'sfw_cats', male: ['Tyger', ' Butters ', ''], female: ['Odile', 'Odile'], first: ['Whiskers'], last: ['Marsh'] })
  m.names.ships.push({ id: 'SFW_CATS', names: ['Thirty Days', 'Nine Lives', 'Thirty Days'] })
  const raw = newFactionDoc('sfw_cats', 'Uncollared')
  raw.names = { sfw_cats: 1 }
  raw.shipNameSources = { SFW_CATS: 1 }
  m.factions.push({ kind: 'addition', id: 'sfw_cats', file: 'data/world/factions/sfw_cats.faction', raw, listed: true })
  return m
}

describe('name lists: export (R3)', () => {
  it('writes person_names.csv rows as vanilla does, and ship lists without repeats', () => {
    const m = catMod()
    expect(personNameRows(m.names.people)).toEqual([
      { name: 'Tyger', gender: 'm', usage: 'f', category: 'sfw_cats' },
      { name: 'Butters', gender: 'm', usage: 'f', category: 'sfw_cats' },
      { name: 'Odile', gender: 'f', usage: 'f', category: 'sfw_cats' },
      { name: 'Whiskers', gender: '', usage: 'f', category: 'sfw_cats' },
      { name: 'Marsh', gender: '', usage: 'l', category: 'sfw_cats' }
    ])
    expect(poolCounts(m.names.people[0])).toEqual({ male: 3, female: 2, last: 1 })
    expect(shipNameLists(m.names.ships)).toEqual({ SFW_CATS: ['Thirty Days', 'Nine Lives'] })
  })

  it('exports into an owned block and merged keys, keeps hand-written keys, and removes only its own', () => {
    const m = catMod()
    const hand = '{\n\t# my own list\n\t"SFW_HAND": ["Kept"],\n}\n'
    let files: Record<string, string> = { 'data/strings/ship_names.json': hand }
    const p1 = planExport(m, state(m, files), index(), null)
    files = apply(files, p1.writes)
    const csv = files['data/characters/person_names.csv']
    expect(parseCsvRecords(csv)[0].fields).toEqual(['name', 'gender', 'usage', 'category'])
    expect(findBlocks(csv).map((b) => b.key)).toEqual(['names'])
    expect(csv).toContain('Whiskers,,f,sfw_cats')
    const sn = parseLooseObject(files['data/strings/ship_names.json']).value
    expect(sn).toEqual({ SFW_HAND: ['Kept'], SFW_CATS: ['Thirty Days', 'Nine Lives'] })
    expect(files['data/strings/ship_names.json']).toContain('# my own list')
    // the project remembers which keys it wrote
    m.project = parseLooseObject(files['sagaforge/project.json']).value as never
    expect(m.project.exported.shipNames).toBe('SFW_CATS')
    // delete both lists: the block goes, the hand-written key stays
    m.names = { people: [], ships: [] }
    files = apply(files, planExport(m, state(m, files), index(), null).writes)
    expect(findBlocks(files['data/characters/person_names.csv'])).toEqual([])
    expect(parseLooseObject(files['data/strings/ship_names.json']).value).toEqual({ SFW_HAND: ['Kept'] })
  })

  it('saves the lists in sagaforge/names.json, and removes the file when they are gone', () => {
    const m = catMod()
    expect(JSON.parse(planTexts(m)['sagaforge/names.json']).people[0].id).toBe('sfw_cats')
    const saved = Object.fromEntries(modelToWrites(m, state(emptyModel('sfw_'))).map((w) => [w.path, w.text]))
    m.names = { people: [], ships: [] }
    const w = modelToWrites(m, state(m, saved)).find((x) => x.path === 'sagaforge/names.json')
    expect(w?.remove).toBe(true)
  })
})

describe('name lists: checks (R3)', () => {
  const ctx = (m: ModModel, idx = index()) => ({ model: m, index: idx, defs, loaded: state(m), rules: null, styleChecks: true })

  it('counts the game\'s names without the mod\'s own earlier export, plus its plans', () => {
    const m = catMod()
    const t = nameCategoryTotals(index(), m, 'sfw')
    // the index's sfw_cats (3 women, exported earlier by this mod) is replaced by the plans
    expect(t.get('sfw_cats')).toMatchObject({ male: 3, female: 2, last: 1, sources: ['mine'] })
    expect(t.get('modern')?.sources).toEqual(['starsector-core'])
    expect(usedByFactions(m, 'people', 'sfw_cats')).toEqual(['sfw_cats'])
  })

  it('warns about missing names, shared ids, unknown sets and repeats', () => {
    const m = catMod()
    m.names.people[0].last = []
    m.names.people.push({ id: 'modern', male: ['Zed'], female: [], first: [], last: [] })
    m.names.ships.push({ id: 'bad,id', names: ['X'] })
    ;(m.factions[0] as { raw: Record<string, unknown> }).raw.names = { sfw_cats: 1, sfw_dogs: 1 }
    const ps = nameProblems(ctx(m))
    const msg = (s: string) => ps.find((p) => p.message.includes(s))
    expect(msg('"sfw_cats" has no last names')?.level).toBe('warning')
    expect(msg('"modern" adds to a category vanilla already has')?.level).toBe('warning')
    expect(msg('"bad,id": use letters')?.level).toBe('error')
    expect(msg('person name set "sfw_dogs"')?.level).toBe('warning')
    expect(msg('lists "Thirty Days" twice')?.level).toBe('style')
    // a set the game has is fine
    expect(ps.some((p) => p.message.includes('"modern" has no'))).toBe(false)
    expect(ps.some((p) => p.message.includes('ship name source'))).toBe(false)
  })
})

describe('faction runtime keys (RC-R13) and Other keys (R7)', () => {
  const behavior = FACTION_TABS.find((t) => t.id === 'behavior')!

  it('shows the expedition switches only while expeditions are on', () => {
    const doc: Record<string, unknown> = { custom: {} }
    const get = (p: string) => p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], doc)
    const paths = () => visibleFields(behavior, 'x', '0.98a', get).map((f) => f.path)
    expect(paths()).toContain('custom.punitiveExpeditionData')
    expect(paths()).not.toContain('custom.punitiveExpeditionData.territorial')
    expect(paths()).not.toContain('custom.pirateBaseStationTypes')
    doc.custom = { punitiveExpeditionData: { territorial: true }, makesPirateBases: true }
    expect(paths()).toContain('custom.punitiveExpeditionData.canBombard')
    expect(paths()).toContain('custom.pirateBaseStationTypes')
    // fleetTypeNames now has a field, so it isn't an "other key"
    expect(KNOWN_TOP_KEYS.has('fleetTypeNames')).toBe(true)
    expect(KNOWN_CUSTOM_KEYS.has('punitiveExpeditionData')).toBe(true)
  })

  it('surveys the keys vanilla factions use that have no field, most used first, with an example', () => {
    const s = factionKeySurvey([
      { faction: 'b', raw: { id: 'b', voices: {}, custom: { simulatorData: { showInSimulator: true }, offersCommissions: true } } },
      { faction: 'a', raw: { id: 'a', voices: { soldier: 1 }, displayName: 'A', custom: { simulatorData: { showInSimulator: false } } } },
      { faction: 'c', raw: { id: 'c', barSound: 'bar_ambience' } }
    ])
    expect(s.map((x) => [x.key, x.count])).toEqual([['custom.simulatorData', 2], ['voices', 2], ['barSound', 1]])
    // the first non-empty value is the example
    expect(s.find((x) => x.key === 'voices')!.example).toEqual({ faction: 'a', value: { soldier: 1 } })
    expect(factionKeyDoc('custom.fightToTheLast')).toMatch(/full assault/)
    expect(factionKeyDoc('somethingNew')).toMatch(/No description yet/)
  })

  it('has reference sections for fleet types and other keys', () => {
    const s = referenceSections(defs, { gameVersion: 'x', fleetTypeNames: { patrolSmall: 'Fast Picket' }, factionKeyUsage: [{ key: 'voices', count: 12, example: { faction: 'a', value: {} } }] })
    expect(s.find((x) => x.id === 'factions-fleet-types')!.rows.find((r) => r[0] === 'patrolSmall')).toEqual(['patrolSmall', 'Fast Picket'])
    expect(s.find((x) => x.id === 'factions-other-keys')!.rows[0]).toEqual(['voices', '12', factionKeyDoc('voices')])
  })
})
