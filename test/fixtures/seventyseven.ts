/**
 * Test mod for task #77 (AoTD Vaults of Knowledge research; PLAN.md §10.8): mods\seventyseven_a
 * (prefix rsv_), for the 0.98a install (D:\Starsector, where VoK 5.0.7, ToT 1.0.13, BMO and Ashlib are).
 * VoK is optional: the mod loads and plays without it.
 *   Its own tech tree (Saga › Research; VoK names it after the mod, "Saga Forge test #77: VoK research"):
 *     rsv_tech_basics  "Test 77: Field Basics"      tier 0, researched from the start (VoK icon "basic")
 *     rsv_tech_relay   "Test 77: Relay Theory"      tier 1, needs VoK's Industrial Base Template and Field
 *                                                    Basics, costs 1 databank; the mod's own icon
 *                                                    graphics/icons/tech/rsv_relay.png (make it: INGAME-CHECKS)
 *     rsv_tech_vault   "Test 77: Vault Protocols"   tier 1, unlocked by a quest (VoK shows "Finish ... the vault")
 *     rsv_tech_gift    "Test 77: Granted Gift"      tier 2, needs Vault Protocols, 60 days; the vault job grants it
 *     rsv_tech_hand    "Test 77: Hand-written"      a hand-written row in the mod's aotd_tech_options.csv,
 *                                                    outside Saga Forge's block (tier 0, column 3)
 *   Faction rsv_institute "Test 77 Institute" (own station Waypoint 77): research stance PRIORITIZE,
 *     databanks ×2 credits, ×0.5 reputation, its own four lines, forbids VoK's Hull Manufacture.
 *     Its station commander Ira Voss (comm directory) buys databanks: VoK only offers the trade to a
 *     base, station or outpost commander or an administrator.
 *   rsv_vault   "Test 77: the vault" (option at Waypoint 77): Accept unlocks Vault Protocols (a flag), and
 *               the ending grants Granted Gift (SagaLib's VoK bridge).
 *   rsv_status  "Test 77, check research": SF_HasResearch questions (the player: Granted Gift, VoK's
 *               Agriculture Industrialization; the Hegemony: VoK's Industrial Base Template), the unlock
 *               flag, and "Grant VoK's Agriculture Industrialization" (a VoK tech granted by a quest).
 * In dev mode, Ctrl+F9 › "77: go to Test Range 77" (or "... with 5 databanks", VoK only).
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newFactionDoc } from '../../src/shared/factionform'
import { newQuest } from '../../src/shared/quest'
import type { DialogNode, QEdge, QNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SEVENTYSEVEN_GAME = '0.98a-RC8'
const AT = ['$id == rsv_station']

/** What the game index knows when built without the game: VoK's techs the mod names. */
export const SEVENTYSEVEN_INDEX = {
  sources: [{ id: 'starsector-core', name: 'Starsector', isCore: true }, { id: 'aotd_vok', name: 'AoTD- Vaults of Knowledge' }],
  factions: ['hegemony', 'independent'].map((id) => ({ id, name: id, definedBy: 'starsector-core', changedBy: [] })),
  items: [{ id: 'research_databank', name: 'Research Databank', kind: 'commodity', definedBy: 'aotd_vok', changedBy: [] }],
  researchTechs: [
    { id: 'aotd_tech_ind_base_template', name: 'Industrial Base Template', tier: 0, modId: 'aotd_vok', fromStart: true, requires: [], otherReq: '', definedBy: 'aotd_vok', changedBy: [] },
    { id: 'aotd_tech_agriculture', name: 'Agriculture Industrialization', tier: 1, modId: 'aotd_vok', fromStart: false, requires: ['aotd_tech_rudimentary_eq'], otherReq: '', definedBy: 'aotd_vok', changedBy: [] },
    { id: 'aotd_tech_hull_manufacture', name: 'Hull Manufacture', tier: 1, modId: 'aotd_vok', fromStart: false, requires: [], otherReq: '', definedBy: 'aotd_vok', changedBy: [] }
  ]
}

/** The hand-written row in the mod's aotd_tech_options.csv (VoK's header, as VoK's own file has it). */
export const SEVENTYSEVEN_HAND_TECHS = 'id,name,tier,timeToResearch,reqToResearchFirst,itemReqToResearch,iconId,rewards,columnNumber,rowNumber,isResearchedFromStart,otherReq,tags,modId\n' +
  'rsv_tech_hand,Test 77: Hand-written,0,10,none,research_databank:1,basic,A hand-written row outside the block:modifier,3,0,false,,,seventyseven_a\n'

/** A question in the status dialog: an option → a Branch on `cond` → "yes" / "no" text → back. */
function question(id: string, y: number, cond: string, yes: string, no: string): { nodes: QNode[]; edges: QEdge[] } {
  return {
    nodes: [
      { id: `${id}_br`, type: 'branch', x: 520, y, title: id, cases: [{ id: 'yes', label: 'yes', conditions: [cond] }] },
      dlg(`${id}_yes`, 760, y - 40, yes, [{ id: `${id}_b1`, text: 'Back' }]),
      dlg(`${id}_no`, 760, y + 40, no, [{ id: `${id}_b2`, text: 'Back' }])
    ],
    edges: [
      { id: `${id}_e0`, from: 'offer', handle: id, to: `${id}_br` },
      { id: `${id}_e1`, from: `${id}_br`, handle: 'yes', to: `${id}_yes` }, { id: `${id}_e2`, from: `${id}_br`, handle: 'else', to: `${id}_no` },
      { id: `${id}_e3`, from: `${id}_yes`, handle: `${id}_b1`, to: 'offer' }, { id: `${id}_e4`, from: `${id}_no`, handle: `${id}_b2`, to: 'offer' }
    ]
  }
}

/** (c): the vault job: Accept unlocks Vault Protocols; the ending grants Granted Gift. */
function vaultQuest(): QuestPlan {
  const q = newQuest('rsv_vault', 'Test 77: the vault', 'quest')
  q.icon = 'graphics/icons/missions/data_retrieval.png'
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 77 - the vault job' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 77 (c): the vault job. Accept makes "Test 77: Vault Protocols" researchable (its flag); then look at VoK\'s research screen, and finish it with "Test 77 - finish the vault job" in the station\'s menu: that gives "Test 77: Granted Gift" as researched (with Vaults of Knowledge).'
  q.stages = [{ id: 'go', title: 'Open the vault', journal: 'Test #77: finish the vault job at Waypoint 77.', kind: 'normal', renamedFrom: [] }]
  q.nodes.push(
    { id: 'unlock', type: 'action', x: 520, y: 40, title: 'Unlock Vault Protocols', ops: [{ op: 'unlockResearch', tech: 'rsv_tech_vault' }] },
    { id: 'st', type: 'stage', x: 760, y: 40, stage: 'go' },
    // the player looks at VoK's research screen in between, then finishes it from the station's menu
    { id: 'there', type: 'wait', x: 1000, y: 40, mode: 'arrive', entity: 'rsv_station', takeover: false, optionText: 'Test 77 - finish the vault job', arriveText: 'Test 77 (c): the vault opens.' },
    { id: 'won', type: 'end', x: 1240, y: 40, outcome: 'success', research: ['rsv_tech_gift'] },
    dlg('after', 1480, 40, 'Test 77 (c): the vault job is done. With Vaults of Knowledge, "Test 77: Granted Gift" is researched now (the line above, and VoK\'s tree); without it nothing else happened.', [{ id: 'close', text: 'Leave', shortcut: 'ESC' }]),
    { id: 'menu', type: 'link', x: 1720, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'unlock' }, { id: 'b', from: 'unlock', handle: 'next', to: 'st' }, { id: 'b2', from: 'st', handle: 'next', to: 'there' },
    { id: 'c', from: 'there', handle: 'next', to: 'won' },
    { id: 'd', from: 'won', handle: 'next', to: 'after' }, { id: 'e', from: 'after', handle: 'close', to: 'menu' },
    { id: 'f', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** (d): what SagaLib's VoK bridge answers, and granting one of VoK's own techs. */
function statusDialog(): QuestPlan {
  const q = newQuest('rsv_status', 'Test 77: check research', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 77, check research' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 77 (d): ask what Vaults of Knowledge says (through SagaLib\'s bridge). Without VoK every answer is "no", and granting does nothing.'
  offer.options = [
    { id: 'gift', text: 'Has the player researched "Granted Gift" (test 77)?' },
    { id: 'agri', text: 'Has the player researched VoK\'s "Agriculture Industrialization"?' },
    { id: 'heg', text: 'Has the Hegemony researched VoK\'s "Industrial Base Template"?' },
    { id: 'flag', text: 'Was "Vault Protocols" (test 77) unlocked by the vault job?' },
    // not ending in a quote: the game drops a '"' at the end of an option's label (seen in game, 2026-11-20)
    { id: 'grant', text: 'Grant "Agriculture Industrialization" (VoK)' },
    { id: 'leave', text: 'Leave', shortcut: 'ESC' }
  ]
  const qs = [
    question('gift', 0, 'SF_HasResearch rsv_tech_gift', 'Test 77 (d): yes, the player has "Test 77: Granted Gift".', 'Test 77 (d): no, the player hasn\'t "Test 77: Granted Gift".'),
    question('agri', 160, 'SF_HasResearch aotd_tech_agriculture', 'Test 77 (d): yes, the player has "Agriculture Industrialization".', 'Test 77 (d): no, the player hasn\'t "Agriculture Industrialization".'),
    question('heg', 320, 'SF_HasResearch aotd_tech_ind_base_template hegemony', 'Test 77 (d): yes, the Hegemony has "Industrial Base Template".', 'Test 77 (d): no, the Hegemony hasn\'t "Industrial Base Template" (or VoK is off).'),
    question('flag', 480, '$global.rsv_tech_vault_unlocked', 'Test 77 (d): yes, the vault job set the flag $global.rsv_tech_vault_unlocked.', 'Test 77 (d): no, the flag isn\'t set (the vault job wasn\'t accepted yet).')
  ]
  for (const x of qs) { q.nodes.push(...x.nodes); q.edges.push(...x.edges) }
  q.nodes.push(
    { id: 'granting', type: 'action', x: 520, y: 640, title: 'Grant Agriculture', ops: [{ op: 'grantResearch', tech: 'aotd_tech_agriculture' }] },
    dlg('granted', 760, 640, 'Test 77 (d): with VoK, "Agriculture Industrialization" is researched now (VoK\'s message, and its tree; Farming can be built). Without VoK nothing happened (one line in starsector.log).', [{ id: 'gback', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 520, y: 800, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'gr1', from: 'offer', handle: 'grant', to: 'granting' }, { id: 'gr2', from: 'granting', handle: 'next', to: 'granted' }, { id: 'gr3', from: 'granted', handle: 'gback', to: 'offer' },
    { id: 'lv', from: 'offer', handle: 'leave', to: 'menu' }
  )
  return q
}

export const SEVENTYSEVEN_A: TestModDef = {
  id: 'seventyseven_a', name: 'Saga Forge test #77: VoK research', prefix: 'rsv_', version: '1.0.0', gameVersion: SEVENTYSEVEN_GAME,
  indexStub: SEVENTYSEVEN_INDEX,
  handFiles: { 'data/campaign/aotd_tech_options.csv': SEVENTYSEVEN_HAND_TECHS },
  description: 'Throwaway test mod for Saga Forge task #77: its own Vaults of Knowledge tech tree, a faction research stance, a quest that unlocks one tech and grants another, and SF_HasResearch questions. VoK optional. Dev mode: Ctrl+F9, profile 77.',
  model() {
    const m = emptyModel('rsv_')
    m.project.mods = [{ id: 'aotd_vok', name: 'AoTD- Vaults of Knowledge', use: 'optional' }]

    // ---- the faction (an addition) and its research stance
    const inst = newFactionDoc('rsv_institute', 'Test 77 Institute')
    inst.color = [120, 160, 230, 255]
    m.factions.push({ kind: 'addition', id: 'rsv_institute', file: 'data/world/factions/rsv_institute.faction', raw: inst, listed: true })
    m.descriptions['FACTION:rsv_institute'] = { text1: 'Test 77: a faction with a Vaults of Knowledge research stance.' }
    m.research = {
      factions: {
        rsv_institute: {
          stance: 'PRIORITIZE', forbidden: ['aotd_tech_hull_manufacture'], cashMult: 2, repMult: 0.5,
          initResponse: 'Test 77 (b): the Institute\'s own greeting. "Databanks? Splendid, the Institute pays double."',
          selectOption: 'Test 77 - select databanks for the Institute',
          dismayOption: 'Test 77 - keep the databanks after all',
          responseAfter: 'Test 77 (b): the Institute\'s own farewell. "A pleasure, Commander."'
        }
      },
      techs: [
        { id: 'rsv_tech_basics', name: 'Test 77: Field Basics', tier: 0, days: 10, requires: [], items: [], rewards: [{ type: 'modifier', value: 'Test 77: researched from the start' }], column: 0, row: 0, icon: 'basic', fromStart: true },
        { id: 'rsv_tech_relay', name: 'Test 77: Relay Theory', tier: 1, days: 5, requires: ['aotd_tech_ind_base_template', 'rsv_tech_basics'], items: [{ id: 'research_databank', qty: 1 }], rewards: [{ type: 'modifier', value: 'Test 77: needs a VoK tech and one of this mod\'s' }], column: 0, row: 0, icon: 'graphics/icons/tech/rsv_relay.png' },
        { id: 'rsv_tech_vault', name: 'Test 77: Vault Protocols', tier: 1, days: 5, requires: [], items: [{ id: 'research_databank', qty: 1 }], rewards: [{ type: 'modifier', value: 'Test 77: unlocked by the vault job' }], column: 1, row: 0, icon: 'farming1', quest: { text: 'Finish Test 77 - the vault job at Waypoint 77.' } },
        { id: 'rsv_tech_gift', name: 'Test 77: Granted Gift', tier: 2, days: 60, requires: ['rsv_tech_vault'], items: [{ id: 'research_databank', qty: 3 }], rewards: [{ type: 'modifier', value: 'Test 77: granted by the vault job\'s ending' }], column: 0, row: 0, icon: 'basic' }
      ]
    }

    // ---- Test Range 77
    const sys = newSystem('rsv_range', 'Test Range 77', -26000, -14000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'rsv_station', 'Waypoint 77', 'star', 2000, 0)
    station.market = { ...newMarket('rsv_station', 'Waypoint 77', 'rsv_institute'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], people: [] }
    sys.entities.push(station, newEntity('jumpPoint', 'rsv_jp', 'Test Range 77 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)
    m.people.push({
      id: 'rsv_ira', name: { first: 'Ira', last: 'Voss' }, gender: 'FEMALE', faction: 'rsv_institute', rank: 'spaceCommander', post: 'stationCommander',
      portrait: 'graphics/portraits/portrait_mercenary02.png', placement: { at: 'market', market: 'rsv_station', inCommDirectory: true }, tags: [], phrases: []
    })

    m.quests.push(vaultQuest(), statusDialog())
    m.testProfiles.push(
      { id: 'rsv_go', name: '77: go to Test Range 77', quests: {}, flags: {}, player: { startAt: 'rsv_station', credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } },
      { id: 'rsv_dbs', name: '77: go, with 5 databanks (VoK only)', quests: {}, flags: {}, player: { startAt: 'rsv_station', credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }, { item: 'research_databank', qty: 5 }] } }
    )
    return m
  }
}
