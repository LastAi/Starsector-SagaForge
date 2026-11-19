/**
 * Test mod for task #63 (Nexerelin faction config for the mod's own factions; PLAN.md §10.3):
 * mods\sixtythree_a (prefix sth_), for the 0.98a install where Nexerelin 0.12.2d is. Nexerelin is
 * optional. Two factions, each with a station in "Test Range 63":
 *   sth_compact  "Test 63 Compact": a full config (starting faction with ready-made fleets, difficulty
 *                "Test", tooltip, morality, alignments, traits, likes/dislikes, fleet names, free
 *                market). Starting relations: Hegemony -0.6 (Hostile), Independent 0.55 (Friendly),
 *                Tri-Tachyon 0.3 (Welcoming), and Luddic Church -0.8 (Vengeful) only with Nexerelin
 *                (a relation with mod conditions: SagaLib sets it, after Nexerelin, never randomized).
 *   sth_keep     "Test 63 Keepers": starting faction, "Keep relations when randomized" on.
 *                Relations: Hegemony 0.6 (Friendly), pirates -0.6 (Hostile).
 *   player       ready-made fleets added to Nexerelin's player faction (free start, own faction):
 *                a Kite as one more Frigate fleet, and a small combat fleet Hammerhead + 2 Kites.
 * In dev mode, Ctrl+F9 › "63: go to Test Range 63".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newFactionDoc } from '../../src/shared/factionform'
import type { TestModDef } from './testmod'

export const SIXTYTHREE_GAME = '0.98a-RC8'

/** What the game index knows (when built without the game). */
export const SIXTYTHREE_INDEX = {
  sources: [{ id: 'starsector-core', name: 'Starsector', isCore: true }, { id: 'nexerelin', name: 'Nexerelin' }],
  factions: ['hegemony', 'independent', 'tritachyon', 'luddic_church', 'pirates'].map((id) => ({ id, name: id, definedBy: 'starsector-core', changedBy: [] }))
}

export const SIXTYTHREE_A: TestModDef = {
  id: 'sixtythree_a', name: 'Saga Forge test #63: Nexerelin faction config', prefix: 'sth_', version: '1.0.0', gameVersion: SIXTYTHREE_GAME,
  indexStub: SIXTYTHREE_INDEX,
  description: 'Throwaway test mod for Saga Forge task #63: two factions with Nexerelin faction configs (new-game list, starting relations). Nexerelin optional. Dev mode: Ctrl+F9, profile 63.',
  model() {
    const m = emptyModel('sth_')
    m.project.mods = [{ id: 'nexerelin', name: 'Nexerelin', use: 'optional' }]

    // ---- the two factions (additions), listed in factions.csv
    const compact = newFactionDoc('sth_compact', 'Test 63 Compact')
    compact.color = [214, 160, 60, 255]
    const keep = newFactionDoc('sth_keep', 'Test 63 Keepers')
    keep.color = [90, 200, 120, 255]
    m.factions.push(
      { kind: 'addition', id: 'sth_compact', file: 'data/world/factions/sth_compact.faction', raw: compact, listed: true },
      { kind: 'addition', id: 'sth_keep', file: 'data/world/factions/sth_keep.faction', raw: keep, listed: true }
    )
    m.descriptions['FACTION:sth_compact'] = { text1: 'Test 63: a faction with a full Nexerelin config.' }
    m.descriptions['FACTION:sth_keep'] = { text1: 'Test 63: a faction that keeps its starting relations when Nexerelin randomizes them.' }

    // ---- starting relations (the one source; Export writes them into the configs too)
    m.factionsRuntime.relations = {
      sth_compact: { hegemony: -0.6, independent: 0.55, tritachyon: 0.3, luddic_church: -0.8 },
      sth_keep: { hegemony: 0.6, pirates: -0.6 }
    }
    m.factionsRuntime.relationMods = { sth_compact: { luddic_church: { with: ['nexerelin'] } } }

    // ---- the Nexerelin configs
    m.nexerelin = {
      sth_compact: {
        playableFaction: true, startingFaction: true, corvusCompatible: true,
        difficultyString: 'Test',
        ngcTooltip: 'Test 63 (a): this tooltip comes from the faction\'s Nexerelin config, made in Saga Forge.',
        startShipsSolo: [['lasher_CS']],
        startShipsCombatSmall: [['hammerhead_Balanced', 'lasher_CS'], ['lasher_CS', 'lasher_CS']],
        startShipsTradeSmall: [['buffalo2_FS', 'lasher_CS']],
        morality: 'good',
        alignments: { diplomatic: 1, corporate: 0.5, militarist: -0.5 },
        diplomacyTraits: ['pacifist', 'helps_allies'],
        factionsLiked: ['independent'],
        factionsDisliked: ['hegemony'],
        invasionFleetName: 'Test 63 Liberation Fleet',
        responseFleetName: 'Test 63 Answer Fleet',
        rebelFleetSuffix: 'Test 63 Rebels',
        freeMarket: true, tariffMult: 0.8
      },
      sth_keep: {
        playableFaction: true, startingFaction: true, corvusCompatible: true,
        difficultyString: 'Test, kept',
        ngcTooltip: 'Test 63 (c): keeps its starting relations when Nexerelin randomizes them.',
        startShipsSolo: [['shepherd_Frontier']],
        noRandomizeRelations: true,
        morality: 'neutral'
      }
    }

    // ---- ready-made fleets added to the player faction (appended to Nexerelin's player.json lists)
    m.nexerelinPlayer = {
      startShipsSolo: [['kite_original_Stock']],
      startShipsCombatSmall: [['hammerhead_Balanced', 'kite_original_Stock', 'kite_original_Stock']]
    }

    // ---- Test Range 63: a station of each faction, and a neutral one to start at
    const sys = newSystem('sth_range', 'Test Range 63', 21000, -5000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sth_station', 'Range Control 63', 'star', 2000, 0)
    station.market = { ...newMarket('sth_station', 'Range Control 63', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'] }
    const cHome = newEntity('station', 'sth_compact_home', 'Compact Hold 63', 'star', 3000, 120)
    cHome.market = { ...newMarket('sth_compact_home', 'Compact Hold 63', 'sth_compact'), size: 5, conditions: ['population_5'], industries: ['population', 'spaceport', 'militarybase', 'grounddefenses'] }
    const kHome = newEntity('station', 'sth_keep_home', 'Keepers Hold 63', 'star', 3000, 240)
    kHome.market = { ...newMarket('sth_keep_home', 'Keepers Hold 63', 'sth_keep'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport', 'patrolhq'] }
    sys.entities.push(station, cHome, kHome, newEntity('jumpPoint', 'sth_jp', 'Test Range 63 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    m.testProfiles.push({ id: 'sth_go', name: '63: go to Test Range 63', quests: {}, flags: {}, player: { startAt: 'sth_station', credits: 100000, cargo: [{ item: 'supplies', qty: 200 }, { item: 'fuel', qty: 200 }] } })
    return m
  }
}
