/**
 * Task #63: Nexerelin faction config for the mod's own factions (PLAN.md §10.3; FORMATS.md
 * "Nexerelin 0.12.2d", Faction config and Starting relations). SagaLib's side (relations left to
 * Nexerelin) is covered by its NexerelinTests.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { testModFiles, testModState } from './fixtures/testmod'
import { SIXTYTHREE_A, SIXTYTHREE_INDEX } from './fixtures/sixtythree'
import { realDir } from './realdir'
import { parseLooseObject } from '../src/shared/loosejson'
import { updateLooseText } from '../src/shared/jsonedit'
import { parseCsvRecords } from '../src/shared/csvedit'
import { planExport } from '../src/shared/export'
import { needsSagaLib13 } from '../src/shared/export/runtime'
import { effectiveConds, modUses } from '../src/shared/moduses'
import { modelFromProject, planTexts, modelToWrites } from '../src/shared/serialize'
import { nexConfigProblems } from '../src/shared/checks/nexerelin'
import { defsFor } from '../src/shared/defs'
import { removable } from '../src/main/modproject'
import { mergeFactionJson } from '../src/shared/faction'
import {
  NEX_FIELDS, NEX_MOD_FACTIONS, NEX_PLAN, NEX_USE_CONFIG_RELATIONS, hasStartFleet, importNexConfig, importNexFiles, newNexConfig, nexBool,
  nexConfigJson, nexConfigPath, nexOtherKeys, nexRelationPairs, NEX_PLAYER_CONFIG, hasPlayerFleets
} from '../src/shared/nexconfig'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'

const idx = (): GameIndex => ({ items: [], people: [], markets: [], variants: [], ...SIXTYTHREE_INDEX } as unknown as GameIndex)
const ctx = (m = SIXTYTHREE_A.model()): CheckContext => ({ model: m, index: idx(), defs: defsFor('0.98a-RC8'), loaded: testModState(SIXTYTHREE_A, m, planTexts(m)), rules: null, styleChecks: false })
const loose = (t: string) => parseLooseObject(t).value

/** The five installed faction mods that ship configs without depending on Nexerelin (FORMATS.md). */
const INSTALLED = ['Arma Armatura', 'Hazard Mining Incorporated', 'Industrial.Evolution', 'Random Assortment of Things', 'United Aurora Federation']
function installedConfigs(): { mod: string; file: string; text: string }[] {
  const out: { mod: string; file: string; text: string }[] = []
  const mods = path.join(realDir!, 'mods')
  for (const name of INSTALLED) {
    // the newest folder of the mod (Arma Armatura is installed twice)
    const dir = fs.readdirSync(mods).filter((d) => d.startsWith(name)).sort().pop()
    if (!dir) continue
    const cfg = path.join(mods, dir, 'data', 'config', 'exerelinFactionConfig')
    if (!fs.existsSync(cfg)) continue
    for (const f of fs.readdirSync(cfg)) if (f.endsWith('.json')) out.push({ mod: name, file: f, text: fs.readFileSync(path.join(cfg, f), 'utf8') })
  }
  return out
}

describe('Nexerelin faction config (task #63)', () => {
  describe.skipIf(!realDir)('the installed mods\' configs', () => {
    it('all five mods are found', () => {
      expect(new Set(installedConfigs().map((c) => c.mod))).toEqual(new Set(INSTALLED))
    })

    it('read in and written back without losing a key (startRelationships through the relations)', () => {
      const all = installedConfigs()
      expect(all.length).toBeGreaterThanOrEqual(15)
      for (const c of all) {
        const raw = loose(c.text)
        const { config, relations } = importNexConfig(raw)
        // what isn't a relation stays in the document
        for (const k of Object.keys(raw)) if (k !== NEX_USE_CONFIG_RELATIONS) expect(k in config || k === 'startRelationships', `${c.mod}/${c.file}: ${k}`).toBe(true)
        // written back: every key and value as before, plus the switch
        const back = nexConfigJson(config, relations)
        for (const [k, v] of Object.entries(raw)) {
          if (k === NEX_USE_CONFIG_RELATIONS) continue
          expect(back[k], `${c.mod}/${c.file}: ${k}`).toEqual(v)
        }
        expect(back[NEX_USE_CONFIG_RELATIONS]).toBe(true)
        expect(Object.keys(back).length).toBe(Object.keys(raw).length + (NEX_USE_CONFIG_RELATIONS in raw ? 0 : 1))
        // and the text updated in place parses to the same document (comments kept)
        const text = updateLooseText(c.text, back)
        expect(loose(text), `${c.mod}/${c.file} text`).toEqual(back)
        if (c.text.includes('#')) expect(text).toContain('#')
      }
    })

    it('the tab\'s fields read their values as Nexerelin does (no field holds a value of the wrong type)', () => {
      for (const c of installedConfigs()) {
        const raw = loose(c.text)
        for (const f of NEX_FIELDS) {
          const v = raw[f.key]
          if (v === undefined) continue
          if (f.kind === 'bool') expect(typeof v, `${c.file} ${f.key}`).toBe('boolean')
          if (f.kind === 'number') expect(typeof v, `${c.file} ${f.key}`).toBe('number')
          if (f.kind === 'text') expect(typeof v, `${c.file} ${f.key}`).toBe('string')
        }
      }
    })
  })

  it('import: relations join the faction\'s (designed ones win), "default" and unknown keys stay, the switch goes', () => {
    const { config, relations } = importNexConfig({ playableFaction: true, startRelationships: { hegemony: -0.5, pirates: -0.7, default: -0.1 }, useConfigRelationshipsInNonRandomSector: false, industrySeeds: [{ id: 'x', mult: 1 }] }, { pirates: -0.2 })
    expect(relations).toEqual({ hegemony: -0.5 })
    expect(config).toEqual({ playableFaction: true, startRelationships: { default: -0.1 }, industrySeeds: [{ id: 'x', mult: 1 }] })
    expect(nexOtherKeys(config)).toEqual(['industrySeeds'])
    // export puts the relations first and keeps "default"
    expect(nexConfigJson(config, { hegemony: -0.5, pirates: -0.2 })).toEqual({ playableFaction: true, startRelationships: { hegemony: -0.5, pirates: -0.2, default: -0.1 }, industrySeeds: [{ id: 'x', mult: 1 }], useConfigRelationshipsInNonRandomSector: true })
  })

  it('Nexerelin\'s defaults: starting faction follows playable, on by default follows starting', () => {
    expect(nexBool({}, 'playableFaction')).toBe(true)
    expect(nexBool({ playableFaction: false }, 'startingFaction')).toBe(false)
    expect(nexBool({ startingFaction: false }, 'enabledByDefault')).toBe(false)
    expect(nexBool({}, 'corvusCompatible')).toBe(false)
    expect(nexBool({}, 'canInvade')).toBe(true)
    expect(newNexConfig()).toEqual({ playableFaction: true, startingFaction: false, corvusCompatible: true })
  })

  it('exports one config per own faction, the mod_factions.csv block, and factions.json\'s "nexerelin"', () => {
    const files = testModFiles(SIXTYTHREE_A)
    const c = loose(files[nexConfigPath('sth_compact')])
    expect(c.startRelationships).toEqual({ hegemony: -0.6, independent: 0.55, tritachyon: 0.3 })
    expect(c[NEX_USE_CONFIG_RELATIONS]).toBe(true)
    expect(c.difficultyString).toBe('Test')
    expect(c.startShipsCombatSmall).toEqual([['hammerhead_Balanced', 'lasher_CS'], ['lasher_CS', 'lasher_CS']])
    const k = loose(files[nexConfigPath('sth_keep')])
    expect(k.noRandomizeRelations).toBe(true)
    expect(k.startRelationships).toEqual({ hegemony: 0.6, pirates: -0.6 })
    const rows = parseCsvRecords(files[NEX_MOD_FACTIONS]).map((r) => r.fields[0]).filter((x) => x && !x.startsWith('#'))
    expect(rows).toEqual(['faction', 'sth_compact', 'sth_keep'])
    expect(files[NEX_MOD_FACTIONS]).toContain('# sagaforge:begin nexerelin')
    const rt = JSON.parse(files['data/sagaforge/factions.json'])
    expect(rt.nexerelin).toEqual(['sth_compact', 'sth_keep'])
    // the relation with a mod condition stays SagaLib's (and keeps its condition there)
    expect(rt.relations.sth_compact.luddic_church).toEqual({ value: -0.8, modsWith: ['nexerelin'] })
    expect(files['mod_info.json']).toContain('"version": "1.3.0"')
    expect(files['mod_info.json']).not.toContain('"nexerelin"')
    // the plan file
    expect(JSON.parse(files[NEX_PLAN]).factions.sth_keep.noRandomizeRelations).toBe(true)
  })

  it('keeps hand-written rows and comments, updates in place, and removes a config it wrote when the faction loses it', () => {
    const m = SIXTYTHREE_A.model()
    const hand = 'faction\n# my own\nsth_handmade\n'
    const handCfg = '{\n\t# Saga Forge keeps this comment\n\t"playableFaction": true,\n\t"customStations": [{"id": "x"}],\n}\n'
    let files: Record<string, string> = { ...planTexts(m), [NEX_MOD_FACTIONS]: hand, [nexConfigPath('sth_compact')]: handCfg }
    const loaded = testModState(SIXTYTHREE_A, m, files)
    const p1 = planExport(m, loaded, idx(), null, { addDependency: true })
    const w1 = Object.fromEntries(p1.writes.map((x) => [x.path, x.text]))
    expect(w1[NEX_MOD_FACTIONS]).toContain('sth_handmade')
    expect(w1[NEX_MOD_FACTIONS]).toContain('sth_compact')
    expect(w1[nexConfigPath('sth_compact')]).toContain('# Saga Forge keeps this comment')
    // the model's config is what's written (the file's own keys only stay through the model, as on import)
    expect(loose(w1[nexConfigPath('sth_compact')]).difficultyString).toBe('Test')
    const proj = JSON.parse(w1['sagaforge/project.json'])
    expect(proj.exported.nexerelin).toBe('sth_compact,sth_keep')
    // sth_keep loses its config: its file goes, its row too
    files = { ...files, ...w1 }
    delete m.nexerelin!.sth_keep
    m.project = proj
    const p2 = planExport(m, testModState(SIXTYTHREE_A, m, files), idx(), null, { addDependency: true })
    const rm = p2.writes.find((x) => x.path === nexConfigPath('sth_keep'))
    expect(rm?.remove).toBe(true)
    expect(removable(nexConfigPath('sth_keep'))).toBe(true)
    const csv = p2.writes.find((x) => x.path === NEX_MOD_FACTIONS)!.text
    expect(csv).not.toMatch(/^sth_keep$/m)
    expect(csv).toContain('sth_handmade')
    expect(JSON.parse(p2.writes.find((x) => x.path === 'data/sagaforge/factions.json')!.text).nexerelin).toEqual(['sth_compact'])
  })

  it('a mod opened for the first time reads its own config files in (relations join the faction\'s)', () => {
    const m = SIXTYTHREE_A.model()
    const text = updateLooseText('{\n\t"playableFaction": true,\n\t# hand made\n\t"startRelationships": {"hegemony": -0.9, "default": -0.2},\n\t"rebelFleetSuffix": "Hands",\n}\n', { playableFaction: true, startRelationships: { hegemony: -0.9, default: -0.2 }, rebelFleetSuffix: 'Hands' })
    const st = { ...testModState(SIXTYTHREE_A, m, { [nexConfigPath('sth_keep')]: text }), factions: m.factions.map((f) => (f.kind === 'addition' ? { kind: 'addition' as const, id: f.id, file: f.file, text: '', hash: '', raw: f.raw, listed: true } : null)).filter((x) => !!x) }
    st.factionsRuntime = { relations: { sth_keep: { pirates: -0.6 } }, scripted: {} }
    const mm = modelFromProject(st)
    expect(mm.nexerelin!.sth_keep).toEqual({ playableFaction: true, startRelationships: { default: -0.2 }, rebelFleetSuffix: 'Hands' })
    expect(mm.factionsRuntime.relations.sth_keep).toEqual({ pirates: -0.6, hegemony: -0.9 })
    expect(mm.nexerelin!.sth_compact).toBeUndefined()
    // with a plan file (even an empty one) nothing is read in again
    const again = modelFromProject({ ...st, nexerelin: {} })
    expect(again.nexerelin).toEqual({})
    expect(importNexFiles(again, {})).toEqual([])
    // the plan file is saved
    expect(modelToWrites(mm, st).some((w) => w.path === NEX_PLAN)).toBe(true)
  })

  it('only own factions get one; relations with mod conditions stay SagaLib\'s', () => {
    const m = SIXTYTHREE_A.model()
    const eff = effectiveConds(m, idx(), 'sixtythree_a')
    expect(nexRelationPairs(m, 'sth_compact', eff)).toEqual({ inConfig: { hegemony: -0.6, independent: 0.55, tritachyon: 0.3 }, stayWithSagaLib: ['luddic_church'] })
    m.nexerelin!.hegemony = { playableFaction: false }
    const files = Object.keys(planExport(m, testModState(SIXTYTHREE_A, m, planTexts(m)), idx(), null).writes.reduce((a, w) => ({ ...a, [w.path]: 1 }), {}))
    expect(files).not.toContain(nexConfigPath('hegemony'))
    expect(nexConfigProblems(ctx(m)).map((p) => p.key)).toContain('nexnotown:hegemony')
  })

  it('Problems: a starting faction without a fleet, contradicting traits, liked and disliked, wrong types, unknown variants; the relations SagaLib keeps', () => {
    const m = SIXTYTHREE_A.model()
    expect(nexConfigProblems(ctx(m)).filter((p) => p.level !== 'info')).toEqual([])
    expect(nexConfigProblems(ctx(m)).map((p) => p.key)).toEqual(['nexstay:sth_compact'])
    const c = m.nexerelin!.sth_keep
    delete c.startShipsSolo
    expect(hasStartFleet(c)).toBe(false)
    c.diplomacyTraits = ['stalwart', 'foreverwar', 'rebel']
    c.factionsLiked = ['pirates']
    c.factionsDisliked = ['pirates']
    c.canInvade = 'yes'
    m.nexerelin!.sth_compact.startShipsSolo = [['no_such_variant']]
    const cx = ctx(m)
    cx.index = { ...cx.index, variants: [{ id: 'lasher_CS' }, { id: 'hammerhead_Balanced' }, { id: 'buffalo2_FS' }] } as never
    const keys = nexConfigProblems(cx).map((p) => p.key)
    expect(keys).toEqual(expect.arrayContaining(['nexnofleet:sth_keep', 'nexclash:sth_keep:stalwart:foreverwar', 'nextrait:sth_keep:rebel', 'nexlikes:sth_keep:pirates', 'nextype:sth_keep:canInvade', 'nexvariant:sth_compact:startShipsSolo:no_such_variant']))
    // a non-starting faction needs no fleet
    c.startingFaction = false
    expect(nexConfigProblems(ctx(m)).map((p) => p.key)).not.toContain('nexnofleet:sth_keep')
  })

  it('makes the mod a user of Nexerelin (optional fits) and needs SagaLib 1.3 only with relations to leave', () => {
    const m = SIXTYTHREE_A.model()
    const uses = modUses(m, idx(), { sourceId: 'sixtythree_a', frameworkFiles: [NEX_MOD_FACTIONS] }).get('nexerelin') ?? []
    expect(uses.map((u) => u.key)).toEqual(['file:nexconfig:sth_compact', 'file:nexconfig:sth_keep', 'file:nexconfig:player'])
    const eff = effectiveConds(m, idx(), 'sixtythree_a')
    expect(needsSagaLib13(m, new Map())).toBe(true)
    // no relations: nothing for SagaLib to leave
    m.factionsRuntime.relations = {}
    m.factionsRuntime.relationMods = {}
    m.project.mods = []
    expect(needsSagaLib13(m, new Map())).toBe(false)
    void eff
  })

  describe('ready-made fleets added to the player faction (free start, own faction)', () => {
    it('are exported as the mod\'s player.json with only the fleet lists, and no mod_factions.csv row', () => {
      const files = testModFiles(SIXTYTHREE_A)
      expect(loose(files[NEX_PLAYER_CONFIG])).toEqual({
        startShipsSolo: [['kite_original_Stock']],
        startShipsCombatSmall: [['hammerhead_Balanced', 'kite_original_Stock', 'kite_original_Stock']]
      })
      const rows = parseCsvRecords(files[NEX_MOD_FACTIONS]).map((r) => r.fields[0])
      expect(rows).not.toContain('player')
      expect(JSON.parse(files[NEX_PLAN]).player.startShipsSolo).toEqual([['kite_original_Stock']])
      expect(JSON.parse(files['sagaforge/project.json']).exported.nexerelinPlayer).toBe('1')
    })

    it('appended to Nexerelin\'s own player.json by the game\'s merge', () => {
      const nex = { startShipsSolo: [['wolf_Starting', 'kite_Starting']], startShipsCombatSmall: [['hammerhead_Balanced']], playableFaction: true }
      const merged = mergeFactionJson(nex, SIXTYTHREE_A.model().nexerelinPlayer) as Record<string, unknown>
      expect(merged.startShipsSolo).toEqual([['wolf_Starting', 'kite_Starting'], ['kite_original_Stock']])
      expect(merged.playableFaction).toBe(true)
    })

    it('the file Export wrote goes when the fleets do; a hand-made player.json is read in', () => {
      const m = SIXTYTHREE_A.model()
      const files: Record<string, string> = { ...testModFiles(SIXTYTHREE_A) }
      const proj = JSON.parse(files['sagaforge/project.json'])
      delete m.nexerelinPlayer
      m.project = proj
      expect(hasPlayerFleets(m)).toBe(false)
      const p = planExport(m, testModState(SIXTYTHREE_A, m, files), idx(), null)
      expect(p.writes.find((w) => w.path === NEX_PLAYER_CONFIG)?.remove).toBe(true)
      expect(removable(NEX_PLAYER_CONFIG)).toBe(true)
      // a mod without a plan file that ships player.json: read in
      const st = testModState(SIXTYTHREE_A, m, { [NEX_PLAYER_CONFIG]: '{ "startShipsSolo": [["lasher_CS"]], # mine\n}\n' })
      expect(modelFromProject(st).nexerelinPlayer).toEqual({ startShipsSolo: [['lasher_CS']] })
    })

    it('Problems: an unknown variant points to Fleets', () => {
      const m = SIXTYTHREE_A.model()
      m.nexerelinPlayer = { startShipsSolo: [['no_such_variant']] }
      const cx = ctx(m)
      cx.index = { ...cx.index, variants: [{ id: 'lasher_CS' }, { id: 'hammerhead_Balanced' }, { id: 'buffalo2_FS' }, { id: 'shepherd_Frontier' }] } as never
      const p = nexConfigProblems(cx).find((x) => x.key === 'nexvariant:player:startShipsSolo:no_such_variant')
      expect(p?.ref).toEqual({ page: 'fleets', id: 'nex=player' })
    })
  })
})
