/**
 * Test mod for task #60 (optional and required mods, conditional content; PLAN.md §10.1, §10.2):
 * mods\sixty_a (prefix sxa_), for the 0.98a install where the third-party mods are. Its list of
 * other mods: Hazard Mining Incorporated (HMI) optional, Crew Replacer incompatible. Near "Test
 * Range 60":
 *   sxa_hmi_beacon     only with HMI       (an object of the system)
 *   sxa_quiet_beacon   only without HMI
 *   sxa_liaison        a person of HMI's faction: only with HMI, set automatically
 *   sxa_contract       a quest, only with HMI; sxa_followup needs it, so it is only with HMI too
 *   sxa_check          a conversation: a phrase case, options and a Branch case with / without HMI
 *   sxa_friends        a faction of the mod: a relation with HMI (only with HMI, automatic) and
 *                      hidden from the intel tab without HMI (scripted change)
 *   hmi.faction        a patch of HMI's own faction (adds the vanilla Hound): harmless without HMI
 * In dev mode, Ctrl+F9 › "60: go to Test Range 60" takes the fleet there.
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newFactionDoc } from '../../src/shared/factionform'
import type { DialogNode, PersonDef, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SIXTY_GAME = '0.98a-RC8'

const AT = ['$id == sxa_station']

/** A quest offered as an option at the station: offer, accept → stage → end (success) with credits. */
function optionQuest(id: string, title: string, option: string, text: string): QuestPlan {
  const q = newQuest(id, title, 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: option }
  q.stages = [{ id: 'go', title: 'Talk again', journal: `Test #60: ${title}.`, kind: 'normal', renamedFrom: [] }]
  q.rewards = [{ id: 'paid', credits: 100 }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = text
  offer.visual = { kind: 'person', person: 'sxa_liaison' }
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

export const SIXTY_A: TestModDef = {
  id: 'sixty_a', name: 'Saga Forge test #60: optional mods', prefix: 'sxa_', version: '1.0.0', gameVersion: SIXTY_GAME,
  // HMI's faction as the game index knows it (so the automatic "Only with HMI" applies when built without the game)
  indexStub: { factions: [{ id: 'HMI', name: 'H.M.I.', definedBy: 'HMI', changedBy: [] }], sources: [{ id: 'HMI', name: 'Hazard Mining Incorporated' }] },
  description: 'Throwaway test mod for Saga Forge task #60: content only with and only without Hazard Mining Incorporated, Crew Replacer marked incompatible. Dev mode: Ctrl+F9, profile 60.',
  model() {
    const m = emptyModel('sxa_')
    m.project.mods = [
      { id: 'HMI', name: 'Hazard Mining Incorporated', use: 'optional' },
      { id: 'aaacrew_replacer', name: 'Crew Replacer', use: 'incompatible', reason: 'Test #60: a made-up conflict, to see the warning' }
    ]

    // ---- the place
    const sys = newSystem('sxa_range', 'Test Range 60', -16000, 12500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sxa_station', 'Range Control 60', 'star', 2000, 0)
    station.market = { ...newMarket('sxa_station', 'Range Control 60', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: ['sxa_liaison'] }
    const hmi = newEntity('navBuoy', 'sxa_hmi_beacon', 'HMI Beacon 60', 'star', 3000, 90)
    hmi.mods = { with: ['HMI'] }
    const quiet = newEntity('navBuoy', 'sxa_quiet_beacon', 'Quiet Beacon 60', 'star', 3000, 270)
    quiet.mods = { without: ['HMI'] }
    sys.entities.push(station, hmi, quiet, newEntity('jumpPoint', 'sxa_jp', 'Test Range 60 Jump-point', 'star', 4000, 180))
    m.systems.push(sys)

    // ---- a person of HMI's faction: only with HMI, set automatically (PLAN.md §10.2)
    const liaison: PersonDef = {
      id: 'sxa_liaison', name: { first: 'Mara', last: 'Voss' }, gender: 'FEMALE', faction: 'HMI', rank: 'citizen', post: 'agent', portrait: 'graphics/portraits/portrait_corporate01.png',
      placement: { at: 'market', market: 'sxa_station', inCommDirectory: true }, tags: [], phrases: []
    }
    m.people.push(liaison)

    // ---- a conditional questline: the first quest only with HMI; the second needs it (spreads)
    const contract = optionQuest('sxa_contract', 'Test 60: HMI contract', 'Test 60, HMI contract (only with HMI)', '"Hazard Mining pays for a short survey." (Test 60 (a): this quest is only offered when HMI was enabled when the game started.)')
    contract.mods = { with: ['HMI'] }
    const followup = optionQuest('sxa_followup', 'Test 60: HMI follow-up', 'Test 60, HMI follow-up (after the contract)', '"One more job." (Test 60 (a): needs the HMI contract, so it is only with HMI too, from: Test 60: HMI contract.)')
    followup.requires = [{ quest: 'sxa_contract', ended: 'success' }]
    m.quests.push(contract, followup)

    // ---- a conversation: a phrase case, options and a Branch case with / without HMI
    const check = newQuest('sxa_check', 'Test 60: which mods count?', 'dialog')
    check.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 60, which mods count?' }
    const offer = check.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = 'Test 60. $sxa_check_offer_v1'
    offer.phrases = [{ token: '$sxa_check_offer_v1', owner: 'node:sxa_check/offer', mode: 'first-match', cases: [{ when: [], text: 'HMI counts in this game (phrase case only with HMI).', mods: { with: ['HMI'] } }], otherwise: 'HMI does not count in this game (phrase otherwise).' }]
    offer.options = [
      { id: 'hmi', text: 'Ask about Hazard Mining (only with HMI)', mods: { with: ['HMI'] } },
      { id: 'quiet', text: 'Ask about the quiet sector (only without HMI)', mods: { without: ['HMI'] } },
      { id: 'branch', text: 'Branch test' },
      { id: 'leave', text: 'Leave', shortcut: 'ESC' }
    ]
    check.nodes.push(
      dlg('r_hmi', 520, 0, 'Test 60: the HMI-only option. Only offered when HMI counts.', [{ id: 'back1', text: 'Back' }]),
      dlg('r_quiet', 520, 140, 'Test 60: the option only without HMI.', [{ id: 'back2', text: 'Back' }]),
      { id: 'br', type: 'branch', x: 520, y: 280, title: 'Branch test', cases: [{ id: 'with', label: 'With HMI', conditions: [], mods: { with: ['HMI'] } }] },
      dlg('b_with', 760, 260, 'Test 60: the Branch took the case "only with HMI".', [{ id: 'back3', text: 'Back' }]),
      dlg('b_else', 760, 380, 'Test 60: the Branch took "otherwise" (HMI does not count).', [{ id: 'back4', text: 'Back' }]),
      { id: 'menu', type: 'link', x: 1000, y: 100, mode: 'menu', target: '' }
    )
    check.edges.push(
      { id: 'e1', from: 'offer', handle: 'hmi', to: 'r_hmi' }, { id: 'e2', from: 'offer', handle: 'quiet', to: 'r_quiet' },
      { id: 'e3', from: 'offer', handle: 'branch', to: 'br' }, { id: 'e4', from: 'offer', handle: 'leave', to: 'menu' },
      { id: 'e5', from: 'br', handle: 'with', to: 'b_with' }, { id: 'e6', from: 'br', handle: 'else', to: 'b_else' },
      { id: 'e7', from: 'r_hmi', handle: 'back1', to: 'offer' }, { id: 'e8', from: 'r_quiet', handle: 'back2', to: 'offer' },
      { id: 'e9', from: 'b_with', handle: 'back3', to: 'offer' }, { id: 'e10', from: 'b_else', handle: 'back4', to: 'offer' }
    )
    m.quests.push(check)

    // ---- a faction of the mod that only matters with HMI
    m.factions.push({ kind: 'addition', id: 'sxa_friends', file: 'data/world/factions/sxa_friends.faction', raw: newFactionDoc('sxa_friends', 'Test 60 Friends'), listed: true })
    m.factionsRuntime.relations.sxa_friends = { HMI: 0.5, hegemony: -0.2 }
    m.factionsRuntime.scripted.sxa_friends = [{ op: 'hideFromIntelTab', path: '', value: '', mods: { without: ['HMI'] } }]
    // ---- (e) a patch of HMI's own faction: the game loads a .faction only through a factions.csv row, so without HMI it does nothing
    m.factions.push({ kind: 'override', id: 'HMI', file: 'data/world/factions/hmi.faction', patch: { set: {}, add: { 'knownShips.hulls': ['hound'] } } })

    m.testProfiles.push({ id: 'sxa_go', name: '60: go to Test Range 60', quests: {}, flags: {}, player: { startAt: 'sxa_station' } })
    return m
  }
}
