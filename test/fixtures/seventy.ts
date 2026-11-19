/**
 * Test mod for task #70 (a character's presence depends on who controls their market):
 * mods\seventy_a (prefix sya_), for the 0.98a install. Near "Test Range 70":
 *   sya_station   Waypoint 70 (independent): Captain Hale Varro (sya_loyal), a Hegemony loyalist,
 *                 present only while the station's owner is at least Neutral with the Hegemony;
 *                 while away he is listed at Refuge 70. He offers "Test 70: the loyalist's job".
 *   sya_refuge    Refuge 70 (hegemony): where he goes while away.
 *   sya_check     a conversation at Waypoint 70: a Branch on SF_FactionRep $faction.id hegemony
 *                 NEUTRAL, and his away flag.
 * In dev mode, Ctrl+F9 › "70: go to Test Range 70"; the dev menu's "Change a market's owner" and
 * "War or peace" change the owner and the relation.
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import type { DialogNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SEVENTY_GAME = '0.98a-RC8'

const AT = ['$id == sya_station']

/** The loyalist's contact quest: offer, accept → stage → Arrive at Refuge 70 → success. */
function jobQuest(): QuestPlan {
  const q = newQuest('sya_job', 'Test 70: the loyalist\'s job', 'quest')
  q.start = { kind: 'contact', person: 'sya_loyal', freq: 10, offerText: '"Carry a sealed report to Refuge 70 for me." (Test 70 (a): Captain Varro offers this only while he is present at Waypoint 70.)' }
  q.stages = [{ id: 'go', title: 'Deliver the report', journal: 'Test #70: carry the report to Refuge 70.', marker: 'sya_refuge', kind: 'normal', renamedFrom: [] }]
  q.rewards = [{ id: 'paid', credits: 1000 }]
  q.ownerChange = { do: 'keep' }
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'there', type: 'wait', x: 680, y: 40, mode: 'arrive', entity: 'sya_refuge', optionText: 'Test 70 - deliver the report', arriveText: 'Test 70: you deliver the report.' },
    { id: 'end', type: 'end', x: 840, y: 40, outcome: 'success', reward: 'paid' },
    { id: 'menu', type: 'link', x: 1000, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'there' },
    { id: 'c', from: 'there', handle: 'next', to: 'end' }, { id: 'd', from: 'end', handle: 'next', to: 'menu' },
    { id: 'e', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** (d) A conversation at Waypoint 70: SF_FactionRep in a Branch, and the away flag in the text. */
function checkDialog(): QuestPlan {
  const q = newQuest('sya_check', 'Test 70: who runs the station?', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 70, ask who runs the station' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 70 (d): the station belongs to $theFaction. Captain Varro away: $global.sagaforge_away_sya_loyal.'
  offer.options = [{ id: 'rep', text: 'Does the owner get on with the Hegemony?' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'br', type: 'branch', x: 520, y: 40, title: 'Owner and Hegemony', cases: [{ id: 'ok', label: 'At least Neutral', conditions: ['SF_FactionRep $faction.id hegemony NEUTRAL'] }] },
    dlg('yes', 760, 0, 'Test 70 (d): SF_FactionRep says the owner is at least Neutral with the Hegemony.', [{ id: 'back1', text: 'Back' }]),
    dlg('nope', 760, 140, 'Test 70 (d): SF_FactionRep says the owner is worse than Neutral with the Hegemony.', [{ id: 'back2', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 1000, y: 80, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'e1', from: 'offer', handle: 'rep', to: 'br' }, { id: 'e2', from: 'offer', handle: 'leave', to: 'menu' },
    { id: 'e3', from: 'br', handle: 'ok', to: 'yes' }, { id: 'e4', from: 'br', handle: 'else', to: 'nope' },
    { id: 'e5', from: 'yes', handle: 'back1', to: 'offer' }, { id: 'e6', from: 'nope', handle: 'back2', to: 'offer' }
  )
  return q
}

export const SEVENTY_A: TestModDef = {
  id: 'seventy_a', name: 'Saga Forge test #70: presence by market owner', prefix: 'sya_', version: '1.0.0', gameVersion: SEVENTY_GAME,
  description: 'Throwaway test mod for Saga Forge task #70: a Hegemony loyalist present only while his station\'s owner gets on with the Hegemony, and SF_FactionRep. Dev mode: Ctrl+F9, profile 70.',
  model() {
    const m = emptyModel('sya_')

    // ---- Test Range 70
    const sys = newSystem('sya_range', 'Test Range 70', 21000, -17000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sya_station', 'Waypoint 70', 'star', 2000, 0)
    station.market = { ...newMarket('sya_station', 'Waypoint 70', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], people: ['sya_loyal'] }
    const refuge = newEntity('station', 'sya_refuge', 'Refuge 70', 'star', 3200, 150)
    refuge.market = { ...newMarket('sya_refuge', 'Refuge 70', 'hegemony'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'] }
    sys.entities.push(station, refuge, newEntity('jumpPoint', 'sya_jp', 'Test Range 70 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    // ---- the loyalist (not a staff post: Nexerelin would re-flag one on capture)
    m.people.push({
      id: 'sya_loyal', name: { first: 'Hale', last: 'Varro' }, gender: 'MALE', faction: 'hegemony', rank: 'spaceCaptain', post: 'agent',
      portrait: 'graphics/portraits/portrait_hegemony02.png', placement: { at: 'market', market: 'sya_station', inCommDirectory: true },
      contact: { types: ['military'], importance: 'MEDIUM' }, presence: { atLeast: 'NEUTRAL', elsewhere: 'sya_refuge' }, tags: [], phrases: []
    })
    m.quests.push(jobQuest(), checkDialog())

    m.testProfiles.push({ id: 'sya_go', name: '70: go to Test Range 70', quests: {}, flags: {}, player: { startAt: 'sya_station', credits: 500000, rep: { pirates: 0 }, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } })
    return m
  }
}
