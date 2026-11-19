/**
 * Test mods for task #64 (versions by installed mods, other mods' content; PLAN.md §10.6), for the
 * 0.98a install (D:\Starsector). Three mods:
 *
 *   sixtyfour_a  the mod with versions (prefix sfa_). Its optional mods:
 *                  Mod1 = sixtyfour_j, a Java mod (a hand-written stand-in, mods\sixtyfour_j: its
 *                         system, market and harbor master exist only in its code, so Saga Forge
 *                         knows them only from a sector snapshot)
 *                  Mod2 = sixtyfour_b, a mod made with Saga Forge (below: its system, market,
 *                         person and quest are read from its content.csv)
 *   sixtyfour_b  the Saga Forge stand-in (prefix sfb_)
 *
 * The Reyes example (PLAN.md §10.6 table):
 *   Base        Ilse Reyes at Range Control 64 (sfa_station), her own dialog
 *   + Mod1      her location: Haven Port (sfj_port, the Java mod's market)
 *   + Mod2      her last name (Okafor) and portrait
 *   + both      Mod1's location + Mod2's name and portrait + the swapped dialog
 * Her conversation starts at a named place ("place:home") that has the same versions, so the
 * option follows her. "After Mod2's errand" (sfa_after) needs sixtyfour_b's quest sfb_errand: only
 * with Mod2, set automatically. sfa_guild's display name is "Reyes Guild (Mod2)" in the Mod2
 * version (a scripted faction change), and its relation with the Java mod's faction exists only in
 * the Mod1 version (a starting relation).
 *
 * Dev mode: Ctrl+F9 › "64: go to Test Range 64" (or "64: go to Haven Port", only with Mod1).
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newFactionDoc } from '../../src/shared/factionform'
import type { DialogNode, PersonDef, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SIXTYFOUR_GAME = '0.98a-RC8'
export const MOD1 = 'sixtyfour_j'
export const MOD2 = 'sixtyfour_b'

/** A quest offered as an option at a place: offer, accept → stage → end (success) with credits. */
function optionQuest(id: string, title: string, at: string, option: string, text: string, person?: string): QuestPlan {
  const q = newQuest(id, title, 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: [`$id == ${at}`], optionText: option }
  q.stages = [{ id: 'go', title: 'Talk again', journal: `Test #64: ${title}.`, kind: 'normal', renamedFrom: [] }]
  q.rewards = [{ id: 'paid', credits: 100 }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = text
  if (person) offer.visual = { kind: 'person', person }
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'end', type: 'end', x: 640, y: 40, outcome: 'success', reward: 'paid' },
    { id: 'menu', type: 'link', x: 800, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'end' },
    { id: 'c', from: 'end', handle: 'next', to: 'menu' }, { id: 'd', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

export const SIXTYFOUR_A: TestModDef = {
  id: 'sixtyfour_a', name: 'Saga Forge test #64: versions', prefix: 'sfa_', version: '1.0.0', gameVersion: SIXTYFOUR_GAME,
  // the other mods as the game index knows them (so the automatic "Only with" applies when built without the game)
  indexStub: {
    sources: [{ id: MOD1, name: 'Saga Forge 64: Java stand-in' }, { id: MOD2, name: 'Saga Forge 64: Saga Forge stand-in' }],
    factions: [{ id: 'sfj_harbor', name: 'Haven Harbor Authority', definedBy: MOD1, changedBy: [] }],
    sagaQuests: [{ id: 'sfb_errand', title: 'Test 64B: an errand', kind: 'quest', stages: ['go'], definedBy: MOD2, changedBy: [] }],
    markets: [{ id: 'sfj_port', name: 'Haven Port', entities: ['sfj_port'], faction: 'sfj_harbor', size: 4, system: 'sfj_haven', conditions: [], industries: [], submarkets: [], definedBy: MOD1, changedBy: [] }]
  },
  description: 'Throwaway test mod for Saga Forge task #64: one character (Ilse Reyes) with versions for two optional mods, a Java stand-in and a Saga Forge stand-in. Dev mode: Ctrl+F9, profile 64.',
  model() {
    const m = emptyModel('sfa_')
    m.project.mods = [
      { id: MOD1, name: 'Saga Forge 64: Java stand-in', use: 'optional' },
      { id: MOD2, name: 'Saga Forge 64: Saga Forge stand-in', use: 'optional' }
    ]

    // ---- the place
    const sys = newSystem('sfa_range', 'Test Range 64', -21000, 21000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sfa_station', 'Range Control 64', 'star', 2000, 0)
    station.market = { ...newMarket('sfa_station', 'Range Control 64', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: ['sfa_reyes'] }
    sys.entities.push(station, newEntity('jumpPoint', 'sfa_jp', 'Test Range 64 Jump-point', 'star', 4000, 180))
    m.systems.push(sys)

    // ---- Reyes: Mod1 moves her, Mod2 renames her and changes her portrait
    const reyes: PersonDef = {
      id: 'sfa_reyes', name: { first: 'Ilse', last: 'Reyes' }, gender: 'FEMALE', faction: 'independent', rank: 'citizen', post: 'agent', portrait: 'graphics/portraits/portrait_mercenary02.png',
      placement: { at: 'market', market: 'sfa_station', inCommDirectory: true }, tags: [], phrases: [],
      versions: [
        { mods: [MOD1], set: { 'placement.market': 'sfj_port' } },
        { mods: [MOD2], set: { 'name.last': 'Okafor', portrait: 'graphics/portraits/portrait_corporate02.png' } }
      ]
    }
    m.people.push(reyes)

    // ---- her conversation, at a named place that follows her; both mods: the swapped dialog
    const meet = newQuest('sfa_meet', 'Test 64: talk to Reyes', 'dialog')
    meet.places = [{ id: 'home', name: 'Where Reyes is', entity: 'sfa_station' }]
    meet.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == place:home'], optionText: 'Test 64, talk to Reyes' }
    const offer = meet.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.visual = { kind: 'person', person: 'sfa_reyes' }
    offer.text = '"I\'m $sfa_reyes_name." (Test 64: her own dialog. Her last name and portrait come from her version; the name in this line is the token $sfa_reyes_name.)'
    offer.options = [{ id: 'where', text: 'Ask where she works' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
    meet.nodes.push(
      dlg('where', 520, 0, '"Here, at this station." (Test 64: Base and Mod2: Range Control 64, in Test Range 64. Mod1 and both: Haven Port, in Haven 64J.)', [{ id: 'back', text: 'Back' }]),
      { id: 'menu', type: 'link', x: 800, y: 100, mode: 'menu', target: '' }
    )
    meet.edges.push({ id: 'e1', from: 'offer', handle: 'where', to: 'where' }, { id: 'e2', from: 'offer', handle: 'leave', to: 'menu' }, { id: 'e3', from: 'where', handle: 'back', to: 'offer' })
    meet.versions = [
      { mods: [MOD1], set: { 'places[home].entity': 'sfj_port' } },
      { mods: [MOD1, MOD2].sort(), set: { 'nodes[offer].text': '"$sfa_reyes_lastName, Haven Port, and a story I owe you." (Test 64: the SWAPPED dialog, only when both stand-in mods were enabled at new game.)' } }
    ]
    m.quests.push(meet)

    // ---- "after Mod2's quest": only with Mod2, set automatically
    m.quests.push(optionQuest('sfa_after', 'Test 64: after Mod2\'s errand', 'sfa_station', 'Test 64, after Mod2\'s errand', '"You ran the errand for the outpost." (Test 64: offered only after sixtyfour_b\'s quest "Test 64B: an errand" ended well; only with Mod2.)'))
    m.quests[m.quests.length - 1].requires = [{ quest: 'sfb_errand', ended: 'success' }]

    // ---- a faction of the mod: a starting relation in the Mod1 version, a display name in the Mod2 version
    m.factions.push({ kind: 'addition', id: 'sfa_guild', file: 'data/world/factions/sfa_guild.faction', raw: newFactionDoc('sfa_guild', 'Reyes Guild'), listed: true })
    m.factionsRuntime.relations.sfa_guild = { hegemony: 0.1 }
    m.factionsRuntime.versions = [
      { mods: [MOD1], set: { 'relations.sfa_guild.sfj_harbor': 0.6 } },
      { mods: [MOD2], set: { 'scripted.sfa_guild': [{ op: 'set', path: 'displayName', value: 'Reyes Guild (Mod2)' }] } }
    ]

    m.testProfiles.push(
      { id: 'sfa_go', name: '64: go to Test Range 64', quests: {}, flags: {}, player: { startAt: 'sfa_station' } },
      { id: 'sfa_haven', name: '64: go to Haven Port (only with Mod1)', quests: {}, flags: {}, player: { startAt: 'sfj_port' } }
    )
    return m
  }
}

/** Mod2: a mod made with Saga Forge, whose content the editor reads from its content.csv. */
export const SIXTYFOUR_B: TestModDef = {
  id: MOD2, name: 'Saga Forge 64: Saga Forge stand-in', prefix: 'sfb_', version: '1.0.0', gameVersion: SIXTYFOUR_GAME,
  description: 'Throwaway stand-in mod for Saga Forge task #64 (Mod2, made with Saga Forge): an outpost, a courier and an errand quest. Dev mode: Ctrl+F9, profile 64B.',
  model() {
    const m = emptyModel('sfb_')
    const sys = newSystem('sfb_range', 'Test Range 64B', -27000, 21000)
    sys.addToExistingSaves = true
    const outpost = newEntity('station', 'sfb_outpost', 'Outpost 64B', 'star', 2200, 90)
    outpost.market = { ...newMarket('sfb_outpost', 'Outpost 64B', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: ['sfb_courier'] }
    sys.entities.push(outpost, newEntity('jumpPoint', 'sfb_jp', 'Test Range 64B Jump-point', 'star', 4000, 200))
    m.systems.push(sys)
    m.people.push({
      id: 'sfb_courier', name: { first: 'Tomas', last: 'Brecht' }, gender: 'MALE', faction: 'independent', rank: 'citizen', post: 'agent', portrait: 'graphics/portraits/portrait_mercenary05.png',
      placement: { at: 'market', market: 'sfb_outpost', inCommDirectory: true }, tags: [], phrases: []
    })
    m.quests.push(optionQuest('sfb_errand', 'Test 64B: an errand', 'sfb_outpost', 'Test 64B, run an errand', '"Take this to the next system and back." (Test 64B: accept to finish it at once; sixtyfour_a\'s "after Mod2\'s errand" needs it.)', 'sfb_courier'))
    m.testProfiles.push({ id: 'sfb_go', name: '64B: go to Outpost 64B', quests: {}, flags: {}, player: { startAt: 'sfb_outpost' } })
    return m
  }
}
