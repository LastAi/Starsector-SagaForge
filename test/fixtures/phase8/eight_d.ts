/**
 * Test mod for Phase 8d-1 (world events, RC-R12 a): mods\eight_d (prefix sed_). One scheduler
 * near "Test Range 8D" that keeps 1–2 of three events running, checking every 3 days:
 *   sed_boom    weight 2, 5 days: news (Major events, at Range Control 8D), +100 credits, a flag
 *   sed_raid    weight 1, 4 days: news (Hostilities), spawns a pirate fleet at the station, removed at the end
 *   sed_once    once, 0 days:     news (Story); only ever once
 * In dev mode the profiles start a chosen event at once (the scheduler's force key).
 * 8d-2: "Test 8d roaming traders" leave Range Control 8D for Range Outpost 8D about every 2 days
 * (at most 2 on the way), stay 2 days and come back.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newEncounter } from '../../../src/shared/encounters'
import { eventForceKey } from '../../../src/shared/export/events'
import { newQuest } from '../../../src/shared/quest'
import type { DialogNode } from '../../../src/shared/model'
import type { TestModDef } from '../testmod'

export const EIGHT_D: TestModDef = {
  id: 'eight_d', name: 'Saga Forge test 8d: world events', prefix: 'sed_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 8d: a world event scheduler with news items, actions and a spawned fleet. Dev mode: Ctrl+F9, profiles 8d.',
  model() {
    const m = emptyModel('sed_')
    const sys = newSystem('sed_range', 'Test Range 8D', 13000, 5500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sed_station', 'Range Control 8D', 'star', 2000, 0)
    station.market = { ...newMarket('sed_station', 'Range Control 8D', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'] }
    const outpost = newEntity('station', 'sed_outpost', 'Range Outpost 8D', 'star', 4200, 180)
    sys.entities.push(station, outpost, newEntity('jumpPoint', 'sed_jp', 'Test Range 8D Jump-point', 'star', 3400, 200))
    m.systems.push(sys)

    const raiders = newEncounter('sed_raiders', 'Test 8d raiders', 'pirates')
    raiders.fleet = { ...raiders.fleet, type: 'patrolSmall', points: 30 }
    raiders.spawn = { at: 'sed_station', when: 'quest-stage', despawnOnStageEnd: false }
    raiders.behavior = 'patrol'
    raiders.flags = { hostile: false, important: true, allowDisengage: true }
    m.encounters.push(raiders)

    // 8d-2 (RC-R14): roaming traders between the station and the outpost, and back
    const traders = newEncounter('sed_traders', 'Test 8d roaming traders', 'independent')
    traders.fleet = { ...traders.fleet, type: 'smallTrader', points: 20 } // vanilla's id (seen in game: tradeSmall had no name)
    traders.spawn = { at: 'sed_station', when: 'roaming', to: 'sed_outpost', days: 2, max: 2, stayDays: 2, roundTrip: true }
    traders.behavior = 'patrol'
    traders.flags = { hostile: false, important: false, allowDisengage: true }
    m.encounters.push(traders)

    m.events = [{
      id: 'sed_news', name: 'Test 8d news', min: 1, max: 2, intervalDays: 3, firstAfterDays: 1,
      events: [
        {
          id: 'sed_boom', name: 'Market boom', weight: 2, conditions: [], durationDays: 5,
          news: { title: 'Test 8d: a market boom at Range Control 8D', text: 'Traders crowd Range Control 8D. (Test 8d: this event runs 5 days, gave you 100 credits and set $global.sed_boom_seen.)', tag: 'Major events', at: 'sed_station', days: 10 },
          start: [{ op: 'credits', amount: 100 }, { op: 'set', key: '$global.sed_boom_seen', value: 'true' }], end: []
        },
        {
          id: 'sed_raid', name: 'Pirate raid', weight: 1, conditions: [], durationDays: 4,
          news: { title: 'Test 8d: pirates near Range Control 8D', text: 'A pirate patrol was seen near Range Control 8D. (Test 8d: the fleet "Test 8d raiders" stays 4 days, then leaves.)', tag: 'Hostilities', at: 'sed_station', days: 10 },
          start: [{ op: 'spawn', encounter: 'sed_raiders' }], end: [{ op: 'despawn', encounter: 'sed_raiders' }]
        },
        {
          id: 'sed_once', name: 'One-time event', weight: 1, conditions: [], once: true, durationDays: 0,
          news: { title: 'Test 8d: a one-time event', text: 'This happens only once in a playthrough.', tag: 'Story', days: 10 },
          start: [{ op: 'set', key: '$global.sed_once_seen', value: 'true' }], end: []
        }
      ]
    }]

    // 8d-3 (RC-R12 b): a progress event that fills by itself and from a dialog option
    m.progress = [{
      id: 'sed_unrest', name: 'Test 8d: unrest at Range Control 8D', max: 1000, negative: true, startConditions: [], restartAt: 0,
      stages: [
        { id: 'rumours', progress: 300, title: 'Rumours', text: 'Rumours spread through the station. (Test 8d-P: +10 credits and $global.sed_rumours.)', actions: [{ op: 'credits', amount: 10 }, { op: 'set', key: '$global.sed_rumours', value: 'true' }] },
        { id: 'riots', progress: 600, title: 'Riots', text: 'Riots: it can go either way. (Test 8d-P: "calm" gives +50 credits, "burn" costs 5 reputation with the independents.)', actions: [],
          outcomes: [{ id: 'calm', label: 'Calm', weight: 2, actions: [{ op: 'credits', amount: 50 }] }, { id: 'burn', label: 'Burn', weight: 1, actions: [{ op: 'rep', faction: 'independent', amount: -5 }] }] },
        { id: 'settled', progress: 1000, title: 'Settled', text: 'Things settle down, and it starts over. (Test 8d-P: +500 experience.)', actions: [{ op: 'xp', amount: 500 }] }
      ],
      factors: [
        { id: 'monthly', desc: 'Grumbling (every month)', points: 50, conditions: [] },
        { id: 'boom', desc: 'The market boom', points: 150, conditions: ['$global.sed_boom_active'] }
      ]
    }]
    const stir = newQuest('sed_stir', 'Test 8d-P: stir up unrest', 'quest')
    stir.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sed_station'], optionText: 'Test 8d-P, stir up unrest (+250)' }
    stir.repeatable = true
    stir.stages = [{ id: 'stirred', title: 'Stirred', journal: 'Test 8d-P.', kind: 'normal', renamedFrom: [] }]
    const offer = stir.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = 'Test 8d-P. Agree: 250 one-time points for "Test 8d: unrest at Range Control 8D" (the event starts if it is not running).'
    stir.nodes.push(
      { id: 'add', type: 'action', x: 520, y: 40, title: 'Add progress', ops: [{ op: 'progress', event: 'sed_unrest', points: 250, text: 'You stirred up the crowd' }] },
      { id: 'st', type: 'stage', x: 640, y: 40, stage: 'stirred' },
      { id: 'end', type: 'end', x: 760, y: 40, outcome: 'success' },
      { id: 'menu', type: 'link', x: 1000, y: 40, mode: 'menu', target: '' },
      { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
    )
    stir.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'add' }, { id: 'a2', from: 'add', handle: 'next', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'st', handle: 'next', to: 'end' }, { id: 'd', from: 'end', handle: 'next', to: 'menu' })
    m.quests.push(stir)

    const go = (id: string, name: string, force?: string) => m.testProfiles.push({ id, name, quests: {}, flags: force ? { [eventForceKey('sed_news')]: force } : {}, player: { startAt: 'sed_station' } })
    go('sed_go', '8d: go to Test Range 8D')
    go('sed_raid', '8d: go to Test Range 8D and start the pirate raid', 'sed_raid')
    go('sed_boom', '8d: go to Test Range 8D and start the market boom', 'sed_boom')
    return m
  }
}
