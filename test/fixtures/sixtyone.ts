/**
 * Test mod for task #61 (markets changing owner, protection from Nexerelin's invasions; PLAN.md
 * §10.3; the random sector is on hold): mods\sixtyone_a (prefix soa_), for the 0.98a install where
 * Nexerelin 0.12.2d is. Nexerelin is optional. Near "Test Range 61":
 *   soa_station       Range Control 61 (independent): the test quests are options there
 *   soa_outpost       Outpost 61 (pirates): watched by the owner-change quests; invade it
 *   soa_bastion       Bastion 61 (pirates), protected from invasion: never an invasion target
 *   soa_keep / soa_fail / soa_stage   "If a market of this quest changes owner": keep going, fail,
 *                     go to stage "lost" (a dialog follows it)
 * In dev mode, Ctrl+F9 › "61: go to Test Range 61"; the dev menu's "Change a market's owner" stands
 * in for an invasion.
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import type { DialogNode, PersonDef, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SIXTYONE_GAME = '0.98a-RC8'

const AT = ['$id == soa_station']

/** What the game index knows (when built without the game). */
export const SIXTYONE_INDEX = {
  sources: [{ id: 'starsector-core', name: 'Starsector', isCore: true }, { id: 'nexerelin', name: 'Nexerelin' }],
  markets: [{ id: 'jangala', name: 'Jangala', entities: ['jangala'], faction: 'hegemony', size: 6, system: 'corvus', definedBy: 'starsector-core', changedBy: [], conditions: [], industries: [], submarkets: [] }]
}

/** An option quest at Range Control: offer, accept → stage (marker) → Arrive → end (success), with credits. */
function optionQuest(id: string, title: string, option: string, text: string, marker: string, arrive: string, arriveText: string): QuestPlan {
  const q = newQuest(id, title, 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: option }
  q.stages = [{ id: 'go', title: 'Go there', journal: `Test #61: ${title}.`, marker, kind: 'normal', renamedFrom: [] }]
  q.rewards = [{ id: 'paid', credits: 100 }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = text
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'there', type: 'wait', x: 640, y: 40, mode: 'arrive', entity: arrive, optionText: `${title} - report`, arriveText },
    { id: 'end', type: 'end', x: 780, y: 40, outcome: 'success', reward: 'paid' },
    { id: 'menu', type: 'link', x: 920, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'there' },
    { id: 'c', from: 'there', handle: 'next', to: 'end' }, { id: 'd', from: 'end', handle: 'next', to: 'menu' },
    { id: 'e', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** A quest that watches Outpost 61 and Range Control 61 (its marker and its Arrive). */
function ownerQuest(id: string, title: string, how: string): QuestPlan {
  return optionQuest(id, `Test 61 - ${title}`, `Test 61, owner change - ${title}`,
    `"Keep an eye on Outpost 61 for us, then report back." (Test 61 (a): if Outpost 61 or Range Control 61 changes owner, this quest ${how}.)`,
    'soa_outpost', 'soa_station', `Test 61 (a): you report back. Changed owner: "$global.${id}_ownerChanged", new owner: "$global.${id}_newOwner" (unset tokens show as they are when nothing changed).`)
}

export const SIXTYONE_A: TestModDef = {
  id: 'sixtyone_a', name: 'Saga Forge test #61: markets changing owner', prefix: 'soa_', version: '1.0.0', gameVersion: SIXTYONE_GAME,
  indexStub: SIXTYONE_INDEX,
  description: 'Throwaway test mod for Saga Forge task #61: quests reacting to a market changing owner, a market protected from invasion. Nexerelin optional. Dev mode: Ctrl+F9, profile 61.',
  model() {
    const m = emptyModel('soa_')
    m.project.mods = [{ id: 'nexerelin', name: 'Nexerelin', use: 'optional' }]

    // ---- Test Range 61
    const sys = newSystem('soa_range', 'Test Range 61', -15000, 18000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'soa_station', 'Range Control 61', 'star', 2000, 0)
    station.market = { ...newMarket('soa_station', 'Range Control 61', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport', 'grounddefenses'] }
    const outpost = newEntity('station', 'soa_outpost', 'Outpost 61', 'star', 3200, 120)
    outpost.market = { ...newMarket('soa_outpost', 'Outpost 61', 'pirates'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: ['soa_boss'] }
    const bastion = newEntity('station', 'soa_bastion', 'Bastion 61', 'star', 3200, 240)
    bastion.market = { ...newMarket('soa_bastion', 'Bastion 61', 'pirates'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], protectFromInvasion: true }
    sys.entities.push(station, outpost, bastion, newEntity('jumpPoint', 'soa_jp', 'Test Range 61 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    // ---- the outpost's administrator (Nexerelin re-flags the post when it captures the outpost)
    const person = (id: string, first: string, last: string, faction: string, post: string, market: string): PersonDef => ({
      id, name: { first, last }, gender: 'FEMALE', faction, rank: 'citizen', post, portrait: 'graphics/portraits/portrait_corporate01.png',
      placement: { at: 'market', market, inCommDirectory: true }, tags: [], phrases: []
    })
    m.people.push(person('soa_boss', 'Rook', 'Dalla', 'pirates', 'administrator', 'soa_outpost'))

    // ---- (a) markets changing owner: keep going, fail, go to a stage
    const keep = ownerQuest('soa_keep', 'keep going', 'keeps going (the report shows the keys)')
    keep.ownerChange = { do: 'keep' }
    const fail = ownerQuest('soa_fail', 'fail', 'fails')
    fail.ownerChange = { do: 'fail' }
    const stage = ownerQuest('soa_stage', 'go to a stage', 'moves to stage "Lost" and a message opens')
    stage.stages.push({ id: 'lost', title: 'The outpost changed hands', journal: 'Test #61: a watched market changed owner; the quest moved to this stage.', kind: 'normal', renamedFrom: [] })
    stage.ownerChange = { do: 'stage', stage: 'lost' }
    stage.nodes.push(
      { id: 'lost', type: 'stage', x: 520, y: 360, stage: 'lost' },
      dlg('news', 660, 360, 'Test 61 (a): news reaches you: $global.soa_stage_ownerChanged now belongs to $global.soa_stage_newOwner. The quest moved to stage "The outpost changed hands" (what follows its Stage node runs).', [{ id: 'ok', text: 'Close' }]),
      { id: 'close', type: 'link', x: 820, y: 360, mode: 'menu', target: '' }
    )
    stage.edges.push({ id: 'l1', from: 'lost', handle: 'next', to: 'news' }, { id: 'l2', from: 'news', handle: 'ok', to: 'close' })
    m.quests.push(keep, fail, stage)

    m.testProfiles.push({ id: 'soa_go', name: '61: go to Test Range 61', quests: {}, flags: {}, player: { startAt: 'soa_station', credits: 500000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } })
    return m
  }
}
