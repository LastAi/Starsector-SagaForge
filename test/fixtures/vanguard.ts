/**
 * The Vanguard Compact example mod (PITCH.md walkthrough, PLAN.md §1 and §8): the 1.0 acceptance
 * scenario. Built into D:\ModTools\mods\VanguardCompact by scripts/build-example.ts through the
 * same save and export code the app uses, and compared with test/expected/vanguard by the tests.
 */
import { emptyModel, type ModModel } from '../../src/shared/serialize'
import { newFactionDoc } from '../../src/shared/factionform'
import { newItem } from '../../src/shared/export/items'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newEncounter, newCommDialog } from '../../src/shared/encounters'
import { newQuest } from '../../src/shared/quest'
import { defsFor } from '../../src/shared/defs'
import type { QuestPlan, DialogNode } from '../../src/shared/model'
import { reyes } from './vgc'

export const VGC = { modId: 'vgc', name: 'Vanguard Compact', version: '1.0.0', prefix: 'vgc_' }

export function lostConvoyFull(): QuestPlan {
  const q: QuestPlan = {
    format: 1, id: 'vgc_lost_convoy', title: 'The Lost Convoy', kind: 'quest', icon: 'graphics/icons/missions/retrieve_from_derelict.png',
    start: { kind: 'contact', person: 'vgc_reyes', freq: 1000, minRep: 'FAVORABLE', offerText: 'Commodore Reyes is looking for someone to find a missing convoy.', optionText: 'Ask about the missing convoy' },
    requires: [],
    stages: [
      { id: 'search', title: 'Find the convoy', journal: 'A Compact convoy went dark in the Kestrel belt. Find it.', nextStep: 'Search the Kestrel belt', marker: 'vgc_convoy_wreck', kind: 'normal', renamedFrom: [] },
      { id: 'return', title: 'Report to Reyes', journal: 'You found the convoy. Bring the black box to Commodore Reyes on Haven Station.', nextStep: 'Return to Haven Station', marker: 'vgc_haven', kind: 'normal', renamedFrom: [] }
    ],
    variables: [{ name: 'pay', type: 'number', scope: 'quest', initial: '1' }],
    rewards: [
      { id: 'paid', credits: 60000, rep: [{ faction: 'vgc_vanguard', amount: 5 }], personRep: [{ person: 'vgc_reyes', amount: 5 }] },
      { id: 'paid_double', credits: 120000, rep: [{ faction: 'vgc_vanguard', amount: 5 }] }
    ],
    repeatable: false,
    nodes: [
      { id: 'start', type: 'start', x: 0, y: 120 },
      {
        id: 'offer', type: 'dialog', x: 220, y: 60, title: 'Offer', speaker: 'vgc_reyes', visual: { kind: 'person', person: 'vgc_reyes' }, displays: [], conditions: [], script: [], phrases: [],
        highlights: ['Kestrel belt', '60,000'],
        text: '"$vgc_reyes_title." Reyes doesn\'t look up from her slate. "One of our convoys went dark near the Kestrel belt eleven days ago. Three freighters, forty crew."\n\n"Find them, and the Compact pays 60,000 credits."',
        options: [
          { id: 'accept', text: 'Accept the job' },
          { id: 'catch', text: '"What\'s the catch?"', showOnce: 'conversation' },
          { id: 'double', text: '"Forty crew is worth more than that."', story: { cost: 1 }, showIf: ['$global.vgc_lost_convoy_pay == 1'], tooltip: 'Use a story point to double the pay.' },
          { id: 'decline', text: '"Not interested."', shortcut: 'ESC' }
        ]
      },
      { id: 'catch', type: 'dialog', x: 520, y: 0, title: 'Catch', visual: { kind: 'keep' }, displays: [], highlights: [], conditions: [], script: [], phrases: [], text: '"Pirates, probably. The belt is where they hide."', options: [{ id: 'back', text: 'Back' }] },
      { id: 'pay2', type: 'action', x: 520, y: 160, title: 'Double pay', ops: [{ op: 'set', key: '$global.vgc_lost_convoy_pay', value: '2' }] },
      { id: 'no', type: 'link', x: 520, y: 300, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' },
      { id: 'go', type: 'stage', x: 760, y: 60, stage: 'search' },
      { id: 'ambush', type: 'encounter', x: 980, y: 60, encounter: 'vgc_belt_ambush' },
      { id: 'arrive', type: 'wait', x: 1220, y: 0, mode: 'arrive', entity: 'vgc_convoy_wreck', arriveText: 'The convoy\'s hulks drift among the rocks, cold and silent.' },
      {
        id: 'wreck', type: 'dialog', x: 1700, y: 0, title: 'Wreck found', visual: { kind: 'illustration', category: 'illustrations', key: 'vgc_wreck' }, conditions: [], script: [], phrases: [], highlights: [],
        displays: [{ kind: 'commodity', item: 'vgc_black_box', qty: 1 }, { kind: 'text', text: 'The black box is scorched, but intact.', small: true, color: 'textGrayColor' }],
        text: 'Your salvage crews board the lead freighter. In the bridge wreckage they find what you came for.',
        options: [{ id: 'leave_wreck', text: 'Leave' }]
      },
      { id: 'ret', type: 'stage', x: 1460, y: 0, stage: 'return' },
      {
        id: 'report', type: 'dialog', x: 1940, y: 0, title: 'Report', speaker: 'vgc_reyes', visual: { kind: 'person', person: 'vgc_reyes' }, displays: [], highlights: [], phrases: [], script: [],
        conditions: [],
        text: 'Reyes turns the black box over in her hands. "So they didn\'t make it. But now their families will know why."',
        options: [{ id: 'hand_over', text: 'Hand over the black box' }]
      },
      {
        id: 'payout', type: 'branch', x: 2180, y: 0, title: 'Pay', cases: [{ id: 'double', label: 'Double pay', conditions: ['$global.vgc_lost_convoy_pay == 2'] }]
      },
      { id: 'done', type: 'end', x: 2420, y: -40, outcome: 'success', reward: 'paid' },
      { id: 'done_double', type: 'end', x: 2420, y: 80, outcome: 'success', reward: 'paid_double' },
      {
        id: 'accepted', type: 'dialog', x: 1220, y: 300, title: 'Accepted', speaker: 'vgc_reyes', visual: { kind: 'keep' }, displays: [], highlights: ['Kestrel belt'], conditions: [], script: [], phrases: [],
        text: 'Reyes nods once. "The convoy\'s last position is in your nav computer. Start with the Kestrel belt, and watch for raiders."',
        options: [{ id: 'leave_accepted', text: '"I\'ll find them."' }]
      },
      { id: 'dock', type: 'wait', x: 1940, y: 160, mode: 'arrive', entity: 'vgc_haven', arriveText: 'As you dock, a message from Commodore Reyes is waiting: she wants to see you at once.' },
      { id: 'back', type: 'link', x: 2660, y: 0, mode: 'trigger', target: 'OpenInteractionDialog', fire: 'FireBest' },
      { id: 'bluffed', type: 'action', x: 1220, y: 160, title: 'They left', ops: [{ op: 'set', key: '$global.vgc_signal_heard', value: 'true' }] },
      { id: 'note', type: 'note', x: 220, y: 320, text: 'Bad ending idea: sell the survivors to the pirates (soldCrew).' }
    ],
    edges: [
      { id: 'e1', from: 'start', handle: 'next', to: 'offer' },
      { id: 'e2', from: 'offer', handle: 'accept', to: 'go' },
      { id: 'e3', from: 'offer', handle: 'catch', to: 'catch' },
      { id: 'e4', from: 'catch', handle: 'back', to: 'offer' },
      { id: 'e5', from: 'offer', handle: 'double', to: 'pay2' },
      { id: 'e6', from: 'pay2', handle: 'next', to: 'offer' },
      { id: 'e7', from: 'offer', handle: 'decline', to: 'no' },
      { id: 'e8', from: 'go', handle: 'next', to: 'ambush' },
      { id: 'e8b', from: 'ambush', handle: 'next', to: 'accepted' },
      { id: 'e8c', from: 'accepted', handle: 'leave_accepted', to: 'no' },
      { id: 'e9', from: 'ambush', handle: 'defeated', to: 'arrive' },
      { id: 'e10', from: 'ambush', handle: 'avoided', to: 'bluffed' },
      { id: 'e11', from: 'bluffed', handle: 'next', to: 'arrive' },
      { id: 'e12', from: 'arrive', handle: 'next', to: 'ret' },
      { id: 'e13', from: 'ret', handle: 'next', to: 'wreck' },
      { id: 'e13b', from: 'wreck', handle: 'leave_wreck', to: 'dock' },
      { id: 'e13c', from: 'dock', handle: 'next', to: 'report' },
      { id: 'e14', from: 'report', handle: 'hand_over', to: 'payout' },
      { id: 'e15', from: 'payout', handle: 'double', to: 'done_double' },
      { id: 'e16', from: 'payout', handle: 'else', to: 'done' },
      { id: 'e17', from: 'done', handle: 'next', to: 'back' },
      { id: 'e18', from: 'done_double', handle: 'next', to: 'back' }
    ]
  }
  return q
}

export function salvageRights(): QuestPlan {
  const q = newQuest('vgc_salvage_rights', 'Salvage Rights', 'quest')
  q.start = { kind: 'contact', person: 'vgc_reyes', freq: 1000, minRep: 'FAVORABLE', offerText: 'Reyes wants the convoy\'s cargo recovered before the scavengers get it.', optionText: 'Ask about salvage rights' }
  q.requires = [{ quest: 'vgc_lost_convoy', ended: 'success' }]
  q.stages = [{ id: 'survey', title: 'Survey the wreck', journal: 'Survey the convoy wreck in the Kestrel belt.', marker: 'vgc_convoy_wreck', kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.speaker = 'vgc_reyes'
  offer.visual = { kind: 'person', person: 'vgc_reyes' }
  offer.text = '"The convoy\'s cargo is still out there, $vgc_reyes_title. I\'d rather we had it than the scavengers."'
  q.nodes.push(
    { id: 'go', type: 'stage', x: 520, y: 40, stage: 'survey' },
    { id: 'no', type: 'link', x: 520, y: 160, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' },
    // the player flies to the wreck: the rights are transmitted and vanilla's salvage takes over
    { id: 'arrive', type: 'wait', x: 760, y: 40, mode: 'arrive', entity: 'vgc_convoy_wreck', arriveText: 'You transmit the salvage rights Reyes granted you. The Compact warning beacons on the hulks fall silent.' },
    {
      id: 'rights', type: 'dialog', x: 1000, y: 40, title: 'Rights granted', visual: { kind: 'keep' }, displays: [], highlights: [], conditions: [], script: [], phrases: [],
      text: 'The convoy\'s holds are yours to work now, and whatever your crews can recover.',
      options: [{ id: 'salvage', text: 'Begin salvage' }]
    },
    { id: 'end', type: 'end', x: 1240, y: 40, outcome: 'success' },
    // back into the wreck's own (vanilla) dialog: the lock and this quest no longer answer it
    { id: 'salvage_open', type: 'link', x: 1480, y: 40, mode: 'trigger', target: 'OpenInteractionDialog', fire: 'FireBest' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'go' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' },
    { id: 'c', from: 'go', handle: 'next', to: 'arrive' }, { id: 'd', from: 'arrive', handle: 'next', to: 'rights' },
    { id: 'e', from: 'rights', handle: 'salvage', to: 'end' }, { id: 'f', from: 'end', handle: 'next', to: 'salvage_open' }
  )
  return q
}

/**
 * The convoy wreck is Compact property until Salvage Rights is done: vanilla's salvage and ship
 * recovery would remove it and break both quests (found in testing, 2026-11-11). Lower score than
 * the quests' own arrival rules (score 1000), so those still win at their steps.
 */
export function wreckLock(): QuestPlan {
  const q = newQuest('vgc_wreck_lock', 'Wreck: Compact property', 'dialog')
  q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_convoy_wreck score:500', '!SF_QuestDone vgc_salvage_rights success'] }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Compact property'
  offer.visual = { kind: 'illustration', category: 'illustrations', key: 'vgc_wreck' }
  offer.text = 'Three freighters drift in loose formation among the rocks. Each hull broadcasts a Vanguard Compact warning beacon: registered property, salvage prohibited.\n\nTouching them without the Compact\'s leave would be piracy.'
  offer.highlights = ['salvage prohibited']
  offer.options = [{ id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  // vanilla answers "defaultLeave" itself (DismissDialog)
  q.nodes.push({ id: 'close', type: 'link', x: 520, y: 60, mode: 'option', target: 'defaultLeave' })
  q.edges.push({ id: 'e_close', from: 'offer', handle: 'leave', to: 'close' })
  return q
}

export function vanguardModel(): ModModel {
  const defs = defsFor('0.98a')
  const m = emptyModel(VGC.prefix)
  m.project.saga.positions = { vgc_lost_convoy: [40, 40], vgc_salvage_rights: [320, 40], vgc_belt_ambush_comm: [40, 220], vgc_wreck_lock: [320, 220] }

  // ---- faction (a new one) and a change to Hegemony (a patch)
  const doc = newFactionDoc('vgc_vanguard', 'Vanguard Compact')
  Object.assign(doc, {
    displayNameLong: 'Vanguard Compact of Free Stations', displayNameLongWithArticle: 'the Vanguard Compact of Free Stations', entityNamePrefix: 'Vanguard',
    logo: 'graphics/factions/vgc_vanguard_flag.png', crest: 'graphics/factions/vgc_vanguard_crest.png', shipNamePrefix: 'VCS',
    knownShips: { tags: ['base_bp', 'lowtech_bp'], hulls: ['hammerhead', 'sunder', 'buffalo', 'kite', 'hound', 'enforcer'] }
  })
  m.factions.push({ kind: 'addition', id: 'vgc_vanguard', file: 'data/world/factions/vgc_vanguard.faction', raw: doc, listed: true })
  m.factions.push({ kind: 'override', id: 'hegemony', file: 'data/world/factions/hegemony.faction', patch: { set: { hullFrequency: { hulls: { buffalo: 0.25 } } }, add: { 'knownShips.hulls': ['buffalo', 'kite'], 'knownShips.tags': ['lowtech_bp'] } } })
  m.factionsRuntime.relations.vgc_vanguard = { hegemony: -0.5, independent: 0.3, pirates: -0.75 }
  m.descriptions['FACTION:vgc_vanguard'] = { text1: 'A compact of free stations on the edge of the Persean Sector, bound by a shared navy and a stubborn refusal to be anyone\'s province.' }

  // ---- a person with phrases
  m.people.push({ ...JSON.parse(JSON.stringify(reyes)), portrait: 'graphics/portraits/vgc_reyes.png', rank: 'spaceCommander', post: 'stationCommander', placement: { at: 'market', market: 'vgc_haven', inCommDirectory: true } })
  m.phrases.push({ token: '$vgc_farewell', owner: 'mod', mode: 'random', cases: [{ when: [], text: 'Fair winds.' }, { when: [], text: 'Keep your burn clean.' }], otherwise: 'Safe travels.' })

  // ---- an item
  const box = newItem('vgc_black_box', 'Convoy black box', 'quest_item', defs)
  box.icon = 'graphics/icons/cargo/vgc_black_box.png'
  box.description = 'A scorched flight recorder from a Vanguard Compact convoy. The data core is intact.'
  m.items.push(box)
  m.project.illustrations = { vgc_wreck: 'graphics/illustrations/vgc_wreck.png' }

  // ---- a location: Kestrel, with Haven Station and its market
  const sys = newSystem('vgc_kestrel', 'Kestrel', -5200, -7600)
  sys.addToExistingSaves = true
  const planet = newEntity('planet', 'vgc_kestrel_i', 'Kestrel I', 'star', 2600, 40)
  planet.type = 'barren'
  const haven = newEntity('station', 'vgc_haven', 'Haven Station', 'vgc_kestrel_i', 450, 0)
  haven.market = { ...newMarket('vgc_haven', 'Haven Station', 'vgc_vanguard'), size: 5, conditions: ['population_5'], industries: ['population', 'spaceport', 'militarybase', 'orbitalstation'], people: ['vgc_reyes'] }
  const belt = newEntity('asteroidBelt', 'vgc_kestrel_belt', 'Kestrel Belt', 'star', 4200, 0)
  const wreck = newEntity('derelict', 'vgc_convoy_wreck', 'Convoy wreck', 'star', 4200, 120)
  const jp = newEntity('jumpPoint', 'vgc_kestrel_jp', 'Kestrel Jump-point', 'star', 3400, 200)
  const relay = newEntity('commRelay', 'vgc_kestrel_relay', 'Kestrel Relay', 'star', 3000, 300)
  sys.entities.push(planet, haven, belt, wreck, jp, relay)
  m.systems.push(sys)
  m.descriptions['CUSTOM:vgc_haven'] = { text1: 'A ring of habitat modules around a captured fuel depot, Haven Station is the Compact\'s capital in all but name.' }

  // ---- an encounter with its own comm dialog (a story-point bluff makes them leave)
  const enc = newEncounter('vgc_belt_ambush', 'Belt ambush', 'pirates')
  enc.spawn = { at: 'vgc_kestrel_belt', when: 'quest-stage', despawnOnStageEnd: true }
  enc.fleet.name = 'Belt Raiders'
  const comm = newCommDialog(enc)
  const greet = comm.nodes.find((n) => n.id === 'offer') as DialogNode
  greet.text = '"You picked the wrong belt to fly through, $playerSirOrMadam. Cut your engines."'
  greet.options = [{ id: 'bluff', text: '"A Compact battle group is two jumps behind me."', story: { cost: 1 } }, { id: 'cut', text: 'Cut the comm link', shortcut: 'ESC' }]
  comm.nodes.push({ id: 'leave', type: 'action', x: 520, y: 180, title: 'They leave', ops: [{ op: 'despawn', encounter: 'vgc_belt_ambush' }] })
  comm.nodes.push({ id: 'left', type: 'dialog', x: 760, y: 180, title: 'They believe you', visual: { kind: 'keep' }, displays: [], highlights: [], conditions: [], script: ['EndConversation'], phrases: [], text: 'A long pause. "...Not worth it." The pirate fleet turns away.', options: [] })
  comm.edges.push({ id: 'e_bluff', from: 'offer', handle: 'bluff', to: 'leave' }, { id: 'e_left', from: 'leave', handle: 'next', to: 'left' })
  enc.commDialog = comm.id
  m.encounters.push(enc)

  // ---- quests
  const lc = lostConvoyFull()
  m.quests.push(lc, salvageRights(), comm, wreckLock())

  // ---- a test profile
  m.testProfiles.push({
    id: 'after_convoy', name: 'After the convoy, commissioned',
    quests: { vgc_lost_convoy: { state: 'success', step: 'return' }, vgc_salvage_rights: { state: 'active', step: 'survey' } },
    flags: { '$global.vgc_signal_heard': 'true' },
    player: { credits: 250000, commission: 'vgc_vanguard', rep: { vgc_vanguard: 0.5 }, cargo: [{ item: 'vgc_black_box', qty: 1 }], startAt: 'vgc_haven' }
  })
  m.testProfiles.push({ id: 'at_report', name: 'Convoy found, report to Reyes', quests: { vgc_lost_convoy: { state: 'active', step: 'return' } }, flags: {}, player: { cargo: [{ item: 'vgc_black_box', qty: 1 }], startAt: 'vgc_haven' } })
  return m
}
