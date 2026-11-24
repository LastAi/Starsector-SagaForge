/**
 * Test mod for task #80 (editor fixes found while building Heliopolis, H1–H7):
 * mods\eighty_a (prefix eta_), for the 0.98a install (D:\Starsector), SagaLib 1.4.
 * In "Test Range 80":
 *   Waypoint 80     an independent station. "Test 80 - menu" starts the test quests, adds
 *                   progress and buys the trade good; the Clerk (comm directory) has
 *                   "Test 80e - reputation"; the Quartermaster is the named person whose
 *                   reputation changes.
 *   Outpost 80      a second station with a market and a first-visit scene (H2); every test
 *                   quest's Arrive is an option in its menu.
 *   three derelicts (H1): a Tarsus (tarsus_d_Standard), the mod's own Kite variant
 *                   (eta_kite_Test, data/variants) and a random wreck.
 *   a fourth derelict, the "Wreck with a voice" (H4): an interjection on Explore.
 * World event "Test 80 event" (H5/H6 outside a dialog): started by its dev profile; it starts
 * quest B at its stage and gives the Quartermaster +3. Progress event "Test 80 progress" (100
 * points, from the menu): its stage starts quest C and gives the Quartermaster +4.
 * In dev mode, Ctrl+F9 › "80: go to Test Range 80" / "80: ... and start the world event".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newItem } from '../../src/shared/export/items'
import { eventForceKey } from '../../src/shared/export/events'
import { defsFor } from '../../src/shared/defs'
import type { DialogNode, PersonDef, QEdge, QNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const EIGHTY_GAME = '0.98a-RC8'
const OUTPOST = 'eta_outpost'

/** The mod's own variant (H1): a Kite with a different loadout, read by SagaLib's derelict builder. Hand-written in the mod (the write guard takes no .variant files). */
export const ETA_KITE_VARIANT = JSON.stringify({
  displayName: 'Test 80', fluxCapacitors: 5, fluxVents: 8, goalVariant: false, hullId: 'kite', hullMods: [], permaMods: [], sMods: [],
  variantId: 'eta_kite_Test',
  weaponGroups: [{ autofire: true, mode: 'LINKED', weapons: { 'WS 001': 'harpoon', 'WS 002': 'harpoon', 'WS 003': 'lightmg' } }]
}, null, 4) + '\n'

const person = (id: string, last: string, first: string, post: string, portrait: string): PersonDef => ({
  id, name: { first, last }, gender: 'FEMALE', faction: 'independent', rank: 'citizen', post, portrait,
  placement: { at: 'market', market: 'eta_station', inCommDirectory: true }, tags: [], phrases: []
})
export const CLERK = person('eta_clerk', 'Clerk', 'Ada', 'agent', 'graphics/portraits/portrait_mercenary01.png')
export const QUARTERMASTER = person('eta_quartermaster', 'Quartermaster', 'Bea', 'supplyOfficer', 'graphics/portraits/portrait_mercenary02.png')

/**
 * A quest started by another (manual start): Start → Stage (marker on Outpost 80) → Arrive at
 * Outpost 80 (an option in its menu) → a line → End.
 */
function startedQuest(id: string, title: string, letter: string, how: string): QuestPlan {
  const q = newQuest(id, title, 'quest')
  q.start = { kind: 'manual' }
  q.stages = [{ id: 'go', title: `Go to Outpost 80 (${letter})`, journal: `Test 80d-${letter}: this quest was started ${how}, at its stage "go". This journal entry and the marker on Outpost 80 should be here at once.`, kind: 'normal', renamedFrom: [], marker: OUTPOST }]
  const start = q.nodes[0]
  q.nodes = [start,
    { id: 'st', type: 'stage', x: 260, y: 40, stage: 'go' },
    { id: 'arrive', type: 'wait', x: 500, y: 40, mode: 'arrive', entity: OUTPOST, optionText: `Test 80d-${letter} - finish quest ${letter}` },
    dlg('done', 740, 40, `Test 80d-${letter}: the Arrive at Outpost 80 worked (an option in the station's menu). The quest ends now.`, [{ id: 'ok', text: 'Finish' }]),
    { id: 'end', type: 'end', x: 980, y: 40, outcome: 'success' },
    { id: 'menu', type: 'link', x: 1220, y: 40, mode: 'menu', target: '' }]
  q.edges = [
    { id: 'a', from: start.id, handle: 'next', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'arrive' }, { id: 'c', from: 'arrive', handle: 'next', to: 'done' },
    { id: 'd', from: 'done', handle: 'ok', to: 'end' }, { id: 'e', from: 'end', handle: 'next', to: 'menu' }
  ]
  return q
}

/** "Test 80 - menu" at Waypoint 80: start quest A (H5 in a dialog), add progress (H5/H6 in a progress stage), buy the trade good (H7). */
function menuConversation(): QuestPlan {
  const q = newQuest('eta_menu', 'Test 80: menu', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == eta_station'], optionText: 'Test 80 - menu' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Test 80'
  offer.text = 'Test 80: Saga Forge task #80. Pick a test.'
  offer.options = [
    { id: 'qa', text: '(d1) Start quest A from this dialog, at its stage' },
    { id: 'prog', text: '(d3/e3) Add 100 points to the Test 80 progress event' },
    { id: 'buy', text: '(f) Buy 5 Test 80 spice for 1,000 credits' },
    { id: 'leave', text: 'Leave', shortcut: 'ESC' }
  ]
  const nodes: QNode[] = [
    { id: 'qa_go', type: 'action', x: 520, y: 0, title: 'Start A', ops: [{ op: 'startQuest', quest: 'eta_qa', stage: 'go' }] },
    dlg('qa_said', 760, 0, 'Test 80 (d1): quest A started at its stage (SF_Start, then SF_Step). Its journal entry and the marker on Outpost 80 should be there now.', [{ id: 'qa_back', text: 'Back' }]),
    { id: 'prog_go', type: 'action', x: 520, y: 160, title: 'Progress', ops: [{ op: 'progress', event: 'eta_progress', points: 100, text: 'Test 80: you added 100 points' }] },
    dlg('prog_said', 760, 160, 'Test 80 (d3/e3): 100 points added. The progress event\'s stage should run now or soon: quest C starts at its stage, and the Quartermaster\'s reputation goes up by 4.', [{ id: 'prog_back', text: 'Back' }]),
    { id: 'buy_go', type: 'action', x: 520, y: 320, title: 'Buy', ops: [{ op: 'credits', amount: -1000 }, { op: 'item', item: 'eta_spice', qty: 5 }] },
    dlg('buy_said', 760, 320, 'Test 80 (f): 5 Test 80 spice in your cargo (a special item, stacks of 100). Try selling it at the market.', [{ id: 'buy_back', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 520, y: 480, mode: 'menu', target: '' }
  ]
  const edges: QEdge[] = [
    { id: 'm1', from: 'offer', handle: 'qa', to: 'qa_go' }, { id: 'm2', from: 'qa_go', handle: 'next', to: 'qa_said' }, { id: 'm3', from: 'qa_said', handle: 'qa_back', to: 'offer' },
    { id: 'm4', from: 'offer', handle: 'prog', to: 'prog_go' }, { id: 'm5', from: 'prog_go', handle: 'next', to: 'prog_said' }, { id: 'm6', from: 'prog_said', handle: 'prog_back', to: 'offer' },
    { id: 'm7', from: 'offer', handle: 'buy', to: 'buy_go' }, { id: 'm8', from: 'buy_go', handle: 'next', to: 'buy_said' }, { id: 'm9', from: 'buy_said', handle: 'buy_back', to: 'offer' },
    { id: 'm10', from: 'offer', handle: 'leave', to: 'menu' }
  ]
  q.nodes.push(...nodes)
  q.edges.push(...edges)
  return q
}

/** H6: talking to the Clerk, change the Quartermaster's reputation (named) and the Clerk's own ("the person you're talking to"). */
function repConversation(): QuestPlan {
  const q = newQuest('eta_rep', 'Test 80e: reputation', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == eta_clerk'], optionText: 'Test 80e - reputation' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Reputation'
  offer.text = 'Test 80 (e): you are talking to Ada Clerk. Each option changes one person\'s reputation by 5.'
  offer.options = [
    { id: 'named', text: '(e1) +5 with Bea Quartermaster (a named person, not the one you are talking to)' },
    { id: 'active', text: '(e2) +5 with the person you are talking to (Ada Clerk)' },
    { id: 'shown', text: '(e1b) -5 with Bea Quartermaster, as a dialog display' },
    { id: 'leave', text: 'Leave', shortcut: 'ESC' }
  ]
  const shown = dlg('shown', 520, 320, 'Test 80 (e1b): a display on this text: Bea Quartermaster -5 (AdjustRepPerson ... VENGEFUL -5). Ada Clerk is unchanged.', [{ id: 'shown_back', text: 'Back' }])
  shown.displays = [{ kind: 'rep', person: 'eta_quartermaster', amount: -5 }]
  q.nodes.push(
    { id: 'named_go', type: 'action', x: 520, y: 0, title: 'Named', ops: [{ op: 'rep', person: 'eta_quartermaster', amount: 5 }] },
    dlg('named_said', 760, 0, 'Test 80 (e1): Bea Quartermaster +5 (AdjustRepPerson eta_quartermaster COOPERATIVE 5). Ada Clerk is unchanged.', [{ id: 'named_back', text: 'Back' }]),
    { id: 'active_go', type: 'action', x: 520, y: 160, title: 'Active', ops: [{ op: 'rep', person: '$person', amount: 5 }] },
    dlg('active_said', 760, 160, 'Test 80 (e2): Ada Clerk +5 (AdjustRepActivePerson 5).', [{ id: 'active_back', text: 'Back' }]),
    shown,
    { id: 'menu', type: 'link', x: 520, y: 480, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'r1', from: 'offer', handle: 'named', to: 'named_go' }, { id: 'r2', from: 'named_go', handle: 'next', to: 'named_said' }, { id: 'r3', from: 'named_said', handle: 'named_back', to: 'offer' },
    { id: 'r4', from: 'offer', handle: 'active', to: 'active_go' }, { id: 'r5', from: 'active_go', handle: 'next', to: 'active_said' }, { id: 'r6', from: 'active_said', handle: 'active_back', to: 'offer' },
    { id: 'r7', from: 'offer', handle: 'shown', to: 'shown' }, { id: 'r8', from: 'shown', handle: 'shown_back', to: 'offer' },
    { id: 'r9', from: 'offer', handle: 'leave', to: 'menu' }
  )
  return q
}

/** H2: a first-visit scene at Outpost 80 that changes something and hands back (not a lock). */
function firstVisit(): QuestPlan {
  const q = newQuest('eta_first_visit', 'Test 80b: first visit', 'dialog')
  q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: [`$id == ${OUTPOST} score:1000`, '!$global.eta_outpost_met'] }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'First visit'
  offer.text = 'Test 80 (b): Outpost 80\'s first-visit scene. It plays once, then the station\'s own menu follows. Every later visit goes straight to the menu, where the test quests\' Arrive options are.'
  offer.options = [{ id: 'in', text: 'Continue' }]
  q.nodes.push(
    { id: 'met', type: 'action', x: 520, y: 0, title: 'Met', ops: [{ op: 'set', key: '$global.eta_outpost_met', value: 'true' }] },
    { id: 'open', type: 'link', x: 760, y: 0, mode: 'trigger', target: 'OpenInteractionDialog', fire: 'FireBest' }
  )
  q.edges.push({ id: 'f1', from: 'offer', handle: 'in', to: 'met' }, { id: 'f2', from: 'met', handle: 'next', to: 'open' })
  return q
}

/** H4: an interjection on Explore at the Wreck with a voice; one option goes Stage → Arrive and hands back. */
function voiceInTheWreck(): QuestPlan {
  const q = newQuest('eta_voice', 'Test 80c: a voice in the wreck', 'quest')
  q.start = { kind: 'interject', option: 'salExplore', conditions: ['$id == eta_wreck_voice'], probability: 1, once: 'entity' }
  q.stages = [{ id: 'home', title: 'Bring the survivor to Outpost 80', journal: 'Test 80c: the interjection set this stage, then handed back to Explore.', kind: 'normal', renamedFrom: [], marker: OUTPOST }]
  const start = q.nodes[0]
  q.nodes = [start,
    dlg('voice', 260, 40, 'Test 80 (c): before the salvage starts, a voice on the comm: "Is someone there? Take me to Outpost 80, please."\n\n(c1) "Take them aboard" sets the stage and should go straight on into vanilla\'s salvage, in this visit. (c2) "Ignore it" hands back by a Link.', [{ id: 'take', text: '(c1) Take them aboard' }, { id: 'ignore', text: '(c2) Ignore it' }]),
    { id: 'st', type: 'stage', x: 500, y: 0, stage: 'home' },
    { id: 'arrive', type: 'wait', x: 740, y: 0, mode: 'arrive', entity: OUTPOST, optionText: 'Test 80c - hand over the survivor' },
    dlg('there', 980, 0, 'Test 80 (c): the survivor thanks you and goes ashore. The quest ends.', [{ id: 'ok', text: 'Finish' }]),
    { id: 'end', type: 'end', x: 1220, y: 0, outcome: 'success' },
    { id: 'menu', type: 'link', x: 1460, y: 0, mode: 'menu', target: '' },
    { id: 'back', type: 'link', x: 500, y: 200, mode: 'option', target: 'salExplore' }]
  q.edges = [
    { id: 'a', from: start.id, handle: 'next', to: 'voice' }, { id: 'b', from: 'voice', handle: 'take', to: 'st' }, { id: 'c', from: 'st', handle: 'next', to: 'arrive' },
    { id: 'd', from: 'arrive', handle: 'next', to: 'there' }, { id: 'e', from: 'there', handle: 'ok', to: 'end' }, { id: 'f', from: 'end', handle: 'next', to: 'menu' },
    { id: 'g', from: 'voice', handle: 'ignore', to: 'back' }
  ]
  return q
}

export const EIGHTY_A: TestModDef = {
  id: 'eighty_a', name: 'Saga Forge test #80: Heliopolis findings', prefix: 'eta_', version: '1.0.0', gameVersion: EIGHTY_GAME,
  description: 'Throwaway test mod for Saga Forge task #80: derelicts from variants, a first-visit scene, an interjection that hands back after a stage, quests started at a stage, reputation with a named person, a special trade good. Dev mode: Ctrl+F9, profiles 80.',
  // data/variants/eta_kite_Test.variant (ETA_KITE_VARIANT) is hand-written in the mod: the write guard takes no .variant files
  // the mod's own variant is only in the index when the mod itself is (the editor with the mod open)
  expectedWarnings: [/unknown ship variant "eta_kite_Test"/],
  model() {
    const m = emptyModel('eta_')
    const sys = newSystem('eta_range', 'Test Range 80', 26000, -14000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'eta_station', 'Waypoint 80', 'star', 2000, 0)
    station.market = { ...newMarket('eta_station', 'Waypoint 80', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: [] }
    const outpost = newEntity('station', OUTPOST, 'Outpost 80', 'star', 3200, 120)
    outpost.market = { ...newMarket(OUTPOST, 'Outpost 80', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: [] }
    const wreck = (id: string, name: string, type: string, angle: number) => ({ ...newEntity('derelict', id, name, 'star', 2400, angle), type })
    sys.entities.push(station, outpost,
      wreck('eta_wreck_tarsus', 'Tarsus wreck (H1)', 'tarsus_d_Standard', 40),
      wreck('eta_wreck_own', 'Own-variant wreck (H1)', 'eta_kite_Test', 70),
      wreck('eta_wreck_random', 'Random wreck (H1)', 'wreck', 100),
      wreck('eta_wreck_voice', 'Wreck with a voice (H4)', 'wreck', 330),
      newEntity('jumpPoint', 'eta_jp', 'Test Range 80 Jump-point', 'star', 4500, 240))
    m.systems.push(sys)
    m.people.push({ ...CLERK }, { ...QUARTERMASTER })

    // H7: the special trade good preset
    const spice = Object.assign(newItem('eta_spice', 'Test 80 spice', 'special_trade_good', defsFor('0.98a')), { description: 'Test 80 (f): made with the "Special trade good" preset.' })
    m.items.push(spice)

    m.quests.push(
      menuConversation(), repConversation(), firstVisit(), voiceInTheWreck(),
      startedQuest('eta_qa', 'Test 80d: quest A', 'A', 'from a dialog\'s Action'),
      startedQuest('eta_qb', 'Test 80d: quest B', 'B', 'by a world event'),
      startedQuest('eta_qc', 'Test 80d: quest C', 'C', 'by a progress event stage')
    )

    // H5/H6 outside a dialog: a world event (forced by the dev profile) and a progress event stage
    m.events = [{
      id: 'eta_events', name: 'Test 80 events', min: 0, max: 1, intervalDays: 9999, firstAfterDays: 9999,
      events: [{
        id: 'eta_event', name: 'Test 80 event', weight: 1, conditions: [], once: true, durationDays: 0,
        news: { title: 'Test 80: the world event ran', text: 'Test 80 (d2/e4): this event started quest B at its stage and gave Bea Quartermaster +3.', tag: 'Major events', at: 'eta_station', days: 10 },
        start: [{ op: 'startQuest', quest: 'eta_qb', stage: 'go' }, { op: 'rep', person: 'eta_quartermaster', amount: 3 }], end: []
      }]
    }]
    m.progress = [{
      id: 'eta_progress', name: 'Test 80 progress', max: 100, startConditions: [],
      stages: [{ id: 'full', progress: 100, title: 'Full', text: 'Test 80 (d3/e3): this stage started quest C at its stage and gave Bea Quartermaster +4.', actions: [{ op: 'startQuest', quest: 'eta_qc', stage: 'go' }, { op: 'rep', person: 'eta_quartermaster', amount: 4 }] }],
      factors: []
    }]

    const kit = { credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }, { item: 'heavy_machinery', qty: 50 }] }
    m.testProfiles.push(
      { id: 'eta_go', name: '80: go to Test Range 80', quests: {}, flags: {}, player: { startAt: 'eta_station', ...kit } },
      { id: 'eta_event_go', name: '80: go to Test Range 80 and start the world event', quests: {}, flags: { [eventForceKey('eta_events')]: 'eta_event' }, player: { startAt: 'eta_station', ...kit } }
    )
    return m
  }
}
