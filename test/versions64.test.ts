/**
 * Task #64 (PLAN.md §10.6): versions by installed mods, named places, the dialog rules of versions,
 * the export, the checks, the sector snapshot and the Reyes test mod (sixtyfour_a).
 */
import { describe, expect, it } from 'vitest'
import { cellInfo, diffPaths, editInVersion, emitRuntimeVersions, getAt, resolveItem, resolveRuntime, revertPath, setAt, subsets, type ItemVersion } from '../src/shared/itemversions'
import { cubes, lowerPlaces, resolveModel, versionedRuleRows } from '../src/shared/modelversions'
import { mergeSnapshot } from '../src/shared/snapshot'
import { compileQuest } from '../src/shared/export/questrules'
import { testModFiles } from './fixtures/testmod'
import { SIXTYFOUR_A, SIXTYFOUR_B, MOD1, MOD2 } from './fixtures/sixtyfour'
import { checkModel } from '../src/shared/checks'
import { literalNameProblems } from '../src/shared/checks/versions'
import { runtimeMentioned } from '../src/shared/play'
import { translationEntries } from '../src/shared/translate'
import type { PersonDef } from '../src/shared/model'
import { parseLooseObject } from '../src/shared/loosejson'

const reyes = (): PersonDef & { versions: ItemVersion[] } => ({
  id: 'r', name: { first: 'Ilse', last: 'Reyes' }, gender: 'FEMALE', faction: 'independent', rank: '', post: '', portrait: 'a.png',
  placement: { at: 'market', market: 'home', inCommDirectory: true }, tags: [], phrases: [],
  versions: [{ mods: ['m1'], set: { 'placement.market': 'away' } }, { mods: ['m2'], set: { 'name.last': 'Okafor', portrait: 'b.png' } }]
})

describe('#64 paths, diff and resolution', () => {
  it('follows key[id] paths and removes with null', () => {
    const o = { a: { b: 1 }, list: [{ id: 'x', v: 1 }, { token: '$t', v: 2 }] }
    expect(getAt(o, 'list[x].v')).toBe(1)
    expect(getAt(o, 'list[$t].v')).toBe(2)
    expect(setAt(o, 'a.c.d', 3)).toBe(true)
    expect(o.a).toEqual({ b: 1, c: { d: 3 } })
    expect(setAt(o, 'list[x]', null)).toBe(true)
    expect(o.list.length).toBe(1)
    expect(setAt(o, 'list[nope].v', 1)).toBe(false)
  })
  it('diffs objects key by key and arrays with the same ids element by element', () => {
    const a = { n: { f: 'a', l: 'b' }, nodes: [{ id: 'x', t: '1' }, { id: 'y', t: '2' }], tags: ['p'] }
    const b = { n: { f: 'a', l: 'c' }, nodes: [{ id: 'x', t: '1' }, { id: 'y', t: '3' }], tags: ['p', 'q'] }
    expect(diffPaths(a, b)).toEqual({ 'n.l': 'c', 'nodes[y].t': '3', tags: ['p', 'q'] })
    expect(diffPaths({ x: 1 }, {})).toEqual({ x: null })
  })
  it('resolves the Reyes example: 4 combinations, inheritance', () => {
    const p = reyes()
    expect(resolveItem(p, []).value.placement).toEqual({ at: 'market', market: 'home', inCommDirectory: true })
    expect(resolveItem(p, ['m1']).value.name.last).toBe('Reyes')
    const both = resolveItem(p, ['m1', 'm2']).value
    expect([both.name.last, both.portrait, (both.placement as { market: string }).market]).toEqual(['Okafor', 'b.png', 'away'])
    expect('versions' in both).toBe(false)
  })
  it('edits a version: a changed field is stored there, a field changed back inherits, Revert', () => {
    const p = reyes()
    editInVersion(p, ['m1', 'm2'], (x) => { x.name.first = 'Ana' })
    expect(p.versions.find((v) => v.mods.length === 2)?.set).toEqual({ 'name.first': 'Ana' })
    editInVersion(p, ['m1', 'm2'], (x) => { x.name.last = 'Okafor' }) // inherited from m2: nothing stored
    expect(p.versions.find((v) => v.mods.length === 2)?.set).toEqual({ 'name.first': 'Ana' })
    revertPath(p, ['m1', 'm2'], 'name.first')
    expect(p.versions.some((v) => v.mods.length === 2)).toBe(false)
    expect(p.name.first).toBe('Ilse')
  })
  it('a conflict is asked in the combined cell, and the answer resolves it', () => {
    const p = reyes()
    p.versions[0].set['name.last'] = 'Vale'
    const c = cellInfo(p, ['m1', 'm2'])
    expect(c.conflicts.map((x) => x.path)).toEqual(['name.last'])
    expect(c.conflicts[0].values.map((v) => v.value)).toEqual(['Vale', 'Okafor'])
    editInVersion(p, ['m1', 'm2'], (x) => { x.name.last = 'Vale' })
    expect(cellInfo(p, ['m1', 'm2']).conflicts).toEqual([])
  })
  it('emits SagaLib versions that resolve to every combination exactly', () => {
    const p = reyes()
    const json = (on: string[]) => resolveItem(p, on).value as unknown as Record<string, unknown>
    const { base, versions } = emitRuntimeVersions(['m1', 'm2'], json)
    expect(versions.map((v) => v.id)).toEqual(['m1', 'm2'])
    for (const c of subsets(['m1', 'm2'])) expect(resolveRuntime({ ...base, versions }, c).value).toEqual(json(c))
  })
  it('splits combinations into as few literal sets as possible', () => {
    expect(cubes([[], ['b']], ['a', 'b'])).toEqual([[['a', false]]])
    expect(cubes([[], ['a'], ['b']], ['a', 'b'])).toEqual([[['a', false]], [['a', true], ['b', false]]])
  })
})

describe('#64 Reyes test mod (sixtyfour_a)', () => {
  const files = testModFiles(SIXTYFOUR_A)
  const people = JSON.parse(files['data/sagaforge/people/sixtyfour_a_people.json'])
  const rules = files['data/campaign/rules.csv']

  it('writes the person once, with SagaLib versions per optional mod', () => {
    const r = people.people.find((p: { id: string }) => p.id === 'sfa_reyes')
    expect(r.versions.map((v: { id: string }) => v.id)).toEqual([MOD2, MOD1].sort())
    for (const c of subsets([MOD1, MOD2])) {
      const v = resolveRuntime(r, c).value as unknown as PersonDef
      expect([v.name.last, (v.placement as { market: string }).market]).toEqual([c.includes(MOD2) ? 'Okafor' : 'Reyes', c.includes(MOD1) ? 'sfj_port' : 'sfa_station'])
    }
    // her name tokens follow her version (versioned phrases)
    expect(r.phrases.find((p: { token: string }) => p.token === '$sfa_reyes_name').otherwise).toBe('Ilse Reyes')
  })
  it('the conversation: a quest file with versions, the swapped node as an extra rule, the start following the named place', () => {
    const q = JSON.parse(files['data/sagaforge/quests/sfa_meet.json'])
    // found in game 2026-11-18: the file must name both mods, or SagaLib never sets the Mod2 flag the swapped rule tests
    expect(runtimeMentioned(q)).toEqual([MOD2, MOD1].sort())
    expect(rules).toContain('$global.sfv_sfa_meet_sixtyfour_b score:100')
    expect(rules).toContain('$global.sfv_sfa_meet_sixtyfour_j score:100')
    // the start option is at the named place: base and Mod1 copies exclude each other
    expect(rules).toMatch(/\$id == sfa_station[\s\S]*!\$global\.sfv_sfa_meet_sixtyfour_j/)
    expect(rules).toMatch(/\$id == sfj_port[\s\S]*\$global\.sfv_sfa_meet_sixtyfour_j/)
  })
  it('"after Mod2\'s quest" is only with Mod2 (automatic), and the factions file has versions', () => {
    const q = JSON.parse(files['data/sagaforge/quests/sfa_after.json'])
    expect(q.modsWith).toEqual([MOD2])
    expect(q.requires).toEqual(['SF_QuestDone sfb_errand success'])
    const f = JSON.parse(files['data/sagaforge/factions.json'])
    expect(resolveRuntime(f, [MOD1]).value).toMatchObject({ relations: { sfa_guild: { hegemony: 0.1, sfj_harbor: 0.6 } } })
    expect(resolveRuntime(f, [MOD2]).value).toMatchObject({ scripted: { sfa_guild: [{ op: 'set', path: 'displayName', value: 'Reyes Guild (Mod2)' }] } })
    expect(parseLooseObject(files['mod_info.json']).value.dependencies).toContainEqual({ id: 'lastai_sagalib', name: 'SagaLib', version: '1.3.0' })
  })
  it('version texts are offered for translation', () => {
    const e = translationEntries([{ id: 'sfa_meet', type: 'quest', json: JSON.parse(files['data/sagaforge/quests/sfa_meet.json']) }, { id: 'p', type: 'people', json: people }])
    expect(e.some((x) => x.context.includes('(version') && x.original === 'Okafor')).toBe(true)
  })
  it('Mod2 (sixtyfour_b) exports its content for the index', () => {
    const b = testModFiles(SIXTYFOUR_B)
    expect(b['data/config/sagaforge/content.csv']).toContain('sfb_errand,quest,')
    expect(b['data/config/sagaforge/content.csv']).toContain('sfb_range,system,')
  })
})

describe('#64 dialog rules and named places', () => {
  it('only the changed node gets an extra rule; same conditions → score, not exclusive', () => {
    const q = SIXTYFOUR_A.model().quests.find((x) => x.id === 'sfa_meet')!
    const base = { ...q, versions: q.versions!.filter((v) => v.mods.length === 2) }
    const r = versionedRuleRows(q.id, [MOD1, MOD2], (on) => lowerPlaces(resolveItem(base, on).value), (x) => compileQuest(x, { sagalib: true, phrases: [] }).rows)
    const plain = compileQuest(lowerPlaces(resolveItem(base, []).value), { sagalib: true, phrases: [] }).rows
    expect(r.extra).toBe(1)
    expect(r.rows.length).toBe(plain.length + 1)
  })
  it('lowers named places in conditions, markers and Arrive', () => {
    const q = SIXTYFOUR_A.model().quests.find((x) => x.id === 'sfa_meet')!
    expect((lowerPlaces(q).start as { conditions: string[] }).conditions).toEqual(['$id == sfa_station'])
  })
})

describe('#64 checks', () => {
  it('a versioned name spelled out in a text is a warning', () => {
    const m = SIXTYFOUR_A.model()
    ;(m.quests[0].nodes.find((n) => n.id === 'offer') as { text: string }).text = 'Reyes waves.'
    expect(literalNameProblems(m).map((p) => p.key)).toContain('vername:sfa_meet/offer:sfa_reyes')
  })
  it('a conflict is an error; a version using an unknown place is "not checked"; another optional mod\'s content in a version is an error', () => {
    const m = SIXTYFOUR_A.model()
    const r = m.people[0]
    r.versions!.push({ mods: [MOD1], set: {} })
    r.versions![0].set['name.last'] = 'Vale'
    const index = { factions: [], items: [], people: [], markets: [], systems: [], sources: [], hulls: [], variants: [], weapons: [], wings: [], portraits: [], illustrations: [], customEntityTypes: [], planetTypes: [], conditions: [], industries: [], submarkets: [], ruleCounts: {}, problems: [], extensions: [] }
    const loaded = { sourceId: 'sixtyfour_a', files: {}, modInfo: { id: 'sixtyfour_a', name: 'x', version: '1', gameVersion: '', dependencies: [] }, factions: [] }
    const probs = checkModel({ model: m, index: index as never, defs: { ranks: [], posts: [] } as never, loaded: loaded as never, rules: null, styleChecks: false }).filter((p) => p.area === 'Versions')
    expect(probs.some((p) => p.level === 'error' && p.key?.startsWith('verconflict:person:sfa_reyes'))).toBe(true)
    expect(probs.some((p) => p.key === 'verunknown:person:sfa_reyes:entity:sfj_port')).toBe(true)
  })
})

describe('#64 sector snapshot', () => {
  it('adds what nothing else defines, tied to its mod by faction or id prefix; leaves the rest out', () => {
    const r = mergeSnapshot({
      format: 1, mods: [{ id: MOD1 }],
      systems: [{ id: 'sfj_haven', name: 'Haven' }, { id: 'random_system_1', name: 'Random' }, { id: 'corvus' }],
      places: [{ id: 'sfj_port', name: 'Haven Port', system: 'sfj_haven', kind: 'station', faction: 'sfj_harbor', market: 'sfj_port' }, { id: 'rock_1', system: 'random_system_1', kind: 'planet' }],
      markets: [{ id: 'sfj_port', entity: 'sfj_port', name: 'Haven Port', faction: 'sfj_harbor', size: 4, system: 'sfj_haven' }],
      people: [{ id: 'sfj_harbormaster', first: 'Mara', last: 'Quell', faction: 'sfj_harbor', market: 'sfj_port', post: 'portmaster' }]
    }, { systems: new Set(['corvus']), places: new Set(), markets: new Set(), people: new Set(), factionSource: (id) => (id === 'sfj_harbor' ? MOD1 : undefined), modPrefixes: new Map([[MOD1, ['sfj_']]]) })
    expect(r.systems.map((x) => x.id)).toEqual(['sfj_haven'])
    expect(r.markets.map((x) => [x.id, x.definedBy])).toEqual([['sfj_port', MOD1]])
    expect(r.people.map((x) => [x.id, x.definedBy, x.market])).toEqual([['sfj_harbormaster', MOD1, 'sfj_port']])
    expect(r.places).toEqual([])
    expect(r.skipped).toBe(2)
    expect(r.added[MOD1]).toEqual({ systems: 1, places: 0, markets: 1, people: 1 })
  })
})

describe('#64 resolveModel', () => {
  it('resolves every versioned item for a combination', () => {
    const m = SIXTYFOUR_A.model()
    const both = resolveModel(m, [MOD1, MOD2])
    expect(both.people[0].name.last).toBe('Okafor')
    expect(both.quests[0].places?.[0].entity).toBe('sfj_port')
    expect(both.factionsRuntime.relations.sfa_guild.sfj_harbor).toBe(0.6)
    expect(both.people[0].versions).toBeUndefined()
  })
})

import { buildIndex, detectInstall } from '../src/main/gameindex'
import { defsFor } from '../src/shared/defs'
import { planTexts } from '../src/shared/serialize'
import { testModState } from './fixtures/testmod'
import type { ValidInstall } from '../src/shared/api'
import { realDir } from './realdir'

describe('#64 test mods against the real game', () => {
  it('both build on SagaLib 1.3 (sixtyfour_b needs only 1.2) and have a profile to their test range', () => {
    expect(testModFiles(SIXTYFOUR_A)['mod_info.json']).toContain('"version": "1.3.0"')
    expect(testModFiles(SIXTYFOUR_B)['mod_info.json']).toContain('"version": "1.2.0"')
  })
  it.skipIf(!realDir)('sixtyfour_a has no errors against the game (the stand-ins may not be installed: warnings only)', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = SIXTYFOUR_A.model()
    const probs = checkModel({ model: m, index: cache.index, defs: defsFor(install.gameVersion), loaded: testModState(SIXTYFOUR_A, m, planTexts(m)), rules: cache.rules, styleChecks: false })
    expect(probs.filter((p) => p.level === 'error').map((p) => p.message)).toEqual([])
    // the Java stand-in's market is "not checked" until a sector snapshot is imported
    const installed = cache.index.sources.some((s) => s.id === MOD1)
    if (installed) expect(probs.some((p) => p.key === 'verunknown:person:sfa_reyes:entity:sfj_port')).toBe(true)
  }, 120_000)
})

describe('#64 the index reads other Saga Forge mods (content.csv)', () => {
  // the throwaway test mods are archived in "old test mods" (2026-11-24); a rebuilt one is back in mods
  const ws = [require('node:path').resolve(__dirname, '..', '..', '..', 'mods'), require('node:path').resolve(__dirname, '..', '..', '..', 'old test mods')]
    .find((d: string) => require('node:fs').existsSync(require('node:path').join(d, 'sixtyfour_b'))) ?? require('node:path').resolve(__dirname, '..', '..', '..', 'mods')
  const have = require('node:fs').existsSync(require('node:path').join(ws, 'sixtyfour_b', 'data', 'config', 'sagaforge', 'content.csv'))
  it.skipIf(!realDir || !have)('systems, markets, places, people and quests of sixtyfour_b, with it as their origin; its dialog with its texts', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: ws, activeModDir: require('node:path').join(ws, 'sixtyfour_a') })
    const ix = cache.index
    expect(ix.sagaQuests?.find((q) => q.id === 'sfb_errand')).toMatchObject({ title: 'Test 64B: an errand', definedBy: MOD2, stages: ['go'] })
    expect(ix.markets.find((x) => x.id === 'sfb_outpost')).toMatchObject({ definedBy: MOD2, system: 'sfb_range', faction: 'independent' })
    expect(ix.systems.find((x) => x.id === 'sfb_range')?.definedBy).toBe(MOD2)
    expect(ix.places?.find((x) => x.id === 'sfb_jp')?.definedBy).toBe(MOD2)
    expect(ix.people.find((x) => x.id === 'sfb_courier')?.definedBy).toBe(MOD2)
    // the active mod's own exported files aren't read as another mod's
    expect(ix.sagaQuests?.some((q) => q.id === 'sfa_meet')).toBe(false)
    // its rules show the texts of its text.json, not $sft- tokens
    const r = cache.rules.find((x) => x.id === 'sfb_errand_offer')
    expect(r?.text).toContain('Take this to the next system')
    expect(r?.text).not.toContain('$sft-')
  }, 120_000)
})

describe('#64 item and description versions (text.json, installed mods)', () => {
  it('writes leaf paths only: name, icon, base price; a description added in a version field by field', () => {
    const def = { ...SIXTYFOUR_A, model: () => {
      const m = SIXTYFOUR_A.model()
      m.items.push({ kind: 'commodity', id: 'sfa_ore', name: 'Reyes ore', icon: 'graphics/icons/cargo/ore.png', basePrice: 10, stackSize: 100, cargoSpace: 1, tags: [], description: '', otherColumns: {},
        versions: [{ mods: [MOD2], set: { name: 'Okafor ore', icon: 'graphics/icons/cargo/rare_ore.png', basePrice: 25, description: 'Ore with a second name.' } }] })
      return m
    } }
    const t = JSON.parse(testModFiles(def)['data/sagaforge/text.json'])
    expect(t.items.sfa_ore).toEqual({ name: 'Reyes ore' })
    const v = t.versions.find((x: { modsWith: string[] }) => x.modsWith.join() === MOD2)
    expect(v.set).toEqual({ 'items.sfa_ore.name': 'Okafor ore', 'items.sfa_ore.icon': 'graphics/icons/cargo/rare_ore.png', 'items.sfa_ore.basePrice': 25, 'descriptions.sfa_ore|RESOURCE.text1': 'Ore with a second name.' })
    expect(resolveRuntime(t, [MOD2]).value).toMatchObject({ items: { sfa_ore: { name: 'Okafor ore', basePrice: 25 } } })
  })
})

describe('#64 sector snapshot: found in game 2026-11-18', () => {
  it('never adds the mod being edited, and a prefix two mods share ties to neither', () => {
    const r = mergeSnapshot({
      format: 1, mods: [{ id: 'sixtyfour_a' }, { id: MOD1 }],
      systems: [{ id: 'sfa_range' }, { id: 'sixtyfour_j_extra' }],
      places: [{ id: 'sfa_station', system: 'sfa_range', faction: 'independent' }],
      markets: [], people: [{ id: 'sixtyfour_x_person' }]
    }, { systems: new Set(), places: new Set(), markets: new Set(), people: new Set(), factionSource: () => undefined,
      modPrefixes: new Map([['sixtyfour_a', ['sfa_', 'sixtyfour_a_']], [MOD1, ['sfj_', 'sixtyfour_j_']]]), exclude: 'sixtyfour_a' })
    expect(r.systems.map((x) => [x.id, x.definedBy])).toEqual([['sixtyfour_j_extra', MOD1]])
    expect(r.places).toEqual([])
    expect(r.added.sixtyfour_a).toBeUndefined()
    expect(r.skipped).toBe(1) // sixtyfour_x_person: no mod
  })
})
