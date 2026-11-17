/**
 * Test mod for Phase 7b (raids, bar scenes, place presets; no new SagaLib feature): mods\seven_b,
 * prefix svb_. In-game list: docs/INGAME-CHECKS.md "Phase 7b". Everything is at Test Range B; the
 * dev-mode profile "7b: go to Test Range B" (Ctrl+F9) takes the player there with marines.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import type { DialogNode, QuestPlan } from '../../../src/shared/model'
import { dlg, type TestModDef } from '../testmod'

function raid(): QuestPlan {
  const q = newQuest('svb_raid', 'Test 7b-1: raid', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == svb_outpost'], optionText: 'Test 7b-1, raid the outpost' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Outpost'
  offer.text = 'Test 7b-1. A smuggler outpost sits in a crater below. Raid it (Raid done continues the test) or go back (the planet\'s menu).'
  offer.options = [{ id: 'plan', text: 'Plan a raid' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'raid', type: 'raid', x: 520, y: 40, title: 'Outpost raid', text: 'Your marines study the outpost\'s defences. The smugglers have a few guns, nothing more.', objective: 'Seize the smugglers\' ledger', danger: 'MEDIUM', difficulty: 100, xp: 3000, tooltip: 'Test 7b-1: the only objective in this raid menu', raidText: 'Test 7b-1: this text shows during the raid, before vanilla\'s result screens.' },
    dlg('after', 800, 40, 'Test 7b-1 passed: the quest continues after the raid. The ledger is yours.', [{ id: 'done', text: 'Good' }], 'After the raid'),
    { id: 'menu', type: 'link', x: 1060, y: 40, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'plan', to: 'raid' }, { id: 'b', from: 'offer', handle: 'leave', to: 'menu' },
    { id: 'c', from: 'raid', handle: 'done', to: 'after' }, { id: 'd', from: 'after', handle: 'done', to: 'menu' }
  )
  return q
}

function spacer(): QuestPlan {
  const q = newQuest('svb_spacer', 'Test 7b-2: the nervous spacer', 'dialog')
  q.start = { kind: 'barScene', conditions: ['$market.id == svb_station'], optionText: 'Test 7b-2, talk to the nervous spacer', blurb: 'Test 7b-2: a nervous spacer keeps glancing at the door.', once: 'playthrough' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Spacer'
  offer.text = 'Test 7b-2. "You didn\'t see me," the spacer whispers. This scene is offered once per playthrough.'
  offer.options = [{ id: 'ask', text: 'Ask what is wrong' }, { id: 'go', text: 'Leave them be' }]
  q.nodes.push(
    dlg('why', 520, 0, '"Debts." They drain their glass. Back to the bar with Continue.', [{ id: 'nod', text: 'Nod' }], 'Why'),
    { id: 'bar', type: 'link', x: 800, y: 40, mode: 'bar', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'ask', to: 'why' }, { id: 'b', from: 'offer', handle: 'go', to: 'bar' }, { id: 'c', from: 'why', handle: 'nod', to: 'bar' }
  )
  return q
}

function gambler(): QuestPlan {
  const q = newQuest('svb_gambler', 'Test 7b-3: the gambler', 'dialog')
  q.start = { kind: 'barScene', conditions: ['$market.id == svb_station'], optionText: 'Test 7b-3, watch the gambler', blurb: 'Test 7b-3: a gambler shuffles cards at the back.', probability: 0.5 }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Gambler'
  offer.text = 'Test 7b-3. The gambler is here in about half of the months (all month, or not at all). Watch a hand: you should land back in the bar, not in the colony\'s menu.'
  offer.options = [{ id: 'watch', text: 'Watch a hand' }]
  q.nodes.push({ id: 'menu', type: 'link', x: 520, y: 40, mode: 'menu', target: '' })
  q.edges.push({ id: 'a', from: 'offer', handle: 'watch', to: 'menu' })
  return q
}

export const SEVEN_B: TestModDef = {
  id: 'seven_b', name: 'Saga Forge test 7b: raids, bar scenes', prefix: 'svb_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 7b (raids, bar scenes, place presets). Dev mode: Ctrl+F9, profile 7b.',
  model() {
    const m = emptyModel('svb_')
    m.project.saga.positions = { svb_raid: [40, 40], svb_spacer: [320, 40], svb_gambler: [600, 40] }

    // ---- the test range: a colony with a bar, an outpost planet to raid, a ruins planet
    const sys = newSystem('svb_range', 'Test Range B', 4000, 5500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'svb_station', 'Range Control B', 'star', 2200, 0)
    station.market = { ...newMarket('svb_station', 'Range Control B', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'] }
    const outpost = Object.assign(newEntity('planet', 'svb_outpost', 'Test outpost B', 'star', 2700, 20), { type: 'barren', conditions: ['no_atmosphere'], surveyed: 'full' as const })
    const jp = newEntity('jumpPoint', 'svb_jp', 'Test Range B Jump-point', 'star', 3600, 180)
    // 7b-5: ruins in the colonised system, kept unexplored by SagaLib (user, 2026-11-16)
    const kept = Object.assign(newEntity('planet', 'svb_kept_ruins', 'Test kept ruins B', 'star', 4200, 120), { type: 'barren', conditions: ['ruins_widespread', 'no_atmosphere'], surveyed: 'full' as const, ruinsUnexplored: true })
    sys.entities.push(station, outpost, kept, jp)
    m.systems.push(sys)
    // 7b-4: unexplored ruins, in a system WITHOUT a colony (vanilla marks ruins in a system with a
    // colony explored at new game; found in game 2026-11-16), like the preset "vast ruins, unexplored"
    const sys2 = newSystem('svb_ruins_range', 'Test Range B Ruins', 7000, 5500)
    sys2.addToExistingSaves = true
    const ruins = Object.assign(newEntity('planet', 'svb_ruins', 'Test ruins B', 'star', 3100, 60), { type: 'arid', conditions: ['ruins_vast', 'habitable'], surveyed: 'full' as const })
    sys2.entities.push(ruins, newEntity('jumpPoint', 'svb_ruins_jp', 'Test Range B Ruins Jump-point', 'star', 3600, 180))
    m.systems.push(sys2)

    m.quests.push(raid(), spacer(), gambler())

    m.testProfiles.push(
      { id: 'svb_go', name: '7b: go to Test Range B (with 200 marines)', quests: {}, flags: {}, player: { startAt: 'svb_station', credits: 50000, cargo: [{ item: 'marines', qty: 200 }] } },
      { id: 'svb_ruins', name: '7b: go to the ruins planet (preset test)', quests: {}, flags: {}, player: { startAt: 'svb_ruins' } },
      { id: 'svb_outpost', name: '7b: go to the outpost (raid test)', quests: {}, flags: {}, player: { startAt: 'svb_outpost', cargo: [{ item: 'marines', qty: 200 }] } }
    )
    return m
  }
}
