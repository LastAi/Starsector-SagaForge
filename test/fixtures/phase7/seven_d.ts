/**
 * Test mod for Phase 7d (at the random target, SagaLib 1.2): mods\seven_d, prefix svd_. In-game list:
 * docs/INGAME-CHECKS.md "Phase 7d". Every test is a quest offered at Range Control D.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import { newEncounter } from '../../../src/shared/encounters'
import type { DialogNode, QuestPlan } from '../../../src/shared/model'
import { dlg, type TestModDef } from '../testmod'

const offerAt = (q: QuestPlan, n: string, text: string) => {
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == svd_station'], optionText: `Test 7d-${n}, ${q.title.replace(/^Test 7d-\d: /, '')}` }
  const offer = q.nodes.find((x) => x.id === 'offer') as DialogNode
  offer.title = 'Offer'
  offer.text = text
}

/** 7d-1: a Branch on what the picked planet is like (RC-R3). */
function facts(): QuestPlan {
  const q = newQuest('svd_facts', 'Test 7d-1: what the target is like', 'quest')
  offerAt(q, '1', 'Test 7d-1 (repeatable). Accept: vanilla picks an uncolonised planet within 30 light-years (ruins preferred), never in a dangerous or Remnant system, then a Branch reads what it is like. Its themes must never list theme_unsafe, theme_remnant_main or theme_remnant_secondary.')
  // repeatable, so the safe-system filter can be checked over many picks (user, 2026-11-16)
  q.repeatable = true
  const k = (f: string) => `$global.svd_facts_world_${f}`
  q.variables.push({ name: 'world', type: 'target', scope: 'quest', initial: '', target: { pick: 'planet', require: [{ id: 'plUnpopulated', args: [] }, { id: 'sysWithin', args: ['giver', 30] }, { id: 'sysTags', args: ['NOT_ANY', ['theme_unsafe', 'theme_remnant_main', 'theme_remnant_secondary']] }], prefer: [{ id: 'plRuins', args: [] }], mock: { name: 'Mock world', system: 'Mock system', dist: 12, details: { hasRuins: true, ruins: 'vast' } } } })
  q.stages = [{ id: 'go', title: 'Look at the world', journal: 'Test 7d-1: $global.svd_facts_world_name in $global.svd_facts_world_system.', marker: 'target:world', kind: 'normal', renamedFrom: [] }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'what', type: 'branch', x: 760, y: 40, title: 'What is it like', cases: [
      { id: 'deciv', label: 'decivilised', conditions: [k('deciv')] },
      { id: 'ruins', label: 'has ruins', conditions: [k('hasRuins'), `!${k('deciv')}`] },
      { id: 'gas', label: 'a gas giant', conditions: [k('gasGiant'), `!${k('deciv')}`, `!${k('hasRuins')}`] }
    ] },
    dlg('r_deciv', 1000, -60, `Test 7d-1: the Branch says DECIVILISED. ${k('name')}: ruins "${k('ruins')}", themes "${k('theme')}". Check it on the planet.`, [{ id: 'ok1', text: 'Noted' }], 'Decivilised'),
    dlg('r_ruins', 1000, 60, `Test 7d-1: the Branch says RUINS (${k('ruins')}). ${k('name')}: unexplored ruins ${k('unexploredRuins')}, ruins system ${k('ruinsTheme')}, themes "${k('theme')}". Check it on the planet.`, [{ id: 'ok2', text: 'Noted' }], 'Ruins'),
    dlg('r_gas', 1000, 180, `Test 7d-1: the Branch says GAS GIANT. ${k('name')}, themes "${k('theme')}".`, [{ id: 'ok3', text: 'Noted' }], 'Gas giant'),
    dlg('r_plain', 1000, 300, `Test 7d-1: the Branch says NONE of them. ${k('name')}: ruins "${k('ruins')}", pulsar ${k('pulsar')}, black hole ${k('blackHole')}, nebula ${k('nebula')}, unexplored system ${k('unexplored')}, themes "${k('theme')}".`, [{ id: 'ok4', text: 'Noted' }], 'Plain'),
    { id: 'end', type: 'end', x: 1240, y: 120, outcome: 'success' },
    { id: 'menu', type: 'link', x: 1480, y: 120, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'st', handle: 'next', to: 'what' },
    { id: 'd1', from: 'what', handle: 'deciv', to: 'r_deciv' }, { id: 'd2', from: 'what', handle: 'ruins', to: 'r_ruins' }, { id: 'd3', from: 'what', handle: 'gas', to: 'r_gas' }, { id: 'd4', from: 'what', handle: 'else', to: 'r_plain' },
    ...['ok1', 'ok2', 'ok3', 'ok4'].map((o, i) => ({ id: `e${i}`, from: `r_${['deciv', 'ruins', 'gas', 'plain'][i]}`, handle: o, to: 'end' })),
    { id: 'f', from: 'end', handle: 'next', to: 'menu' }
  )
  return q
}

/** 7d-2: a person at a picked colony (RC-R4), then a cache spawned near it (RC-R2). */
function contact(): QuestPlan {
  const q = newQuest('svd_contact', 'Test 7d-2: a person and a cache', 'quest')
  offerAt(q, '2', 'Test 7d-2. Accept: vanilla picks a colony (size 4+, not hostile) and its portmaster or supply officer (or a new one). Talk to them, then find the cache that appears.')
  q.variables.push({ name: 'port', type: 'target', scope: 'quest', initial: '', target: {
    pick: 'market', require: [{ id: 'mkSizeAtLeast', args: [4] }, { id: 'mkNotHostileTo', args: ['player'] }, { id: 'mkNotPlayer', args: [] }], prefer: [{ id: 'mkNotMilitary', args: [] }],
    person: { posts: ['portmaster', 'supplyOfficer'], rank: 'citizen' }, mock: { name: 'Mock port', faction: 'Independent', factionId: 'independent', personName: 'Mock Portmaster' }
  } })
  q.stages = [
    { id: 'meet', title: 'Meet the contact', journal: 'Test 7d-2: talk to $global.svd_contact_port_personName at $global.svd_contact_port_name.', marker: 'target:port.person', kind: 'normal', renamedFrom: [] },
    { id: 'cache', title: 'Find the cache', journal: 'Test 7d-2: a cache was dropped near $global.svd_contact_port_name.', marker: 'target:port.spawned', kind: 'normal', renamedFrom: [] }
  ]
  q.nodes.push(
    { id: 'meet', type: 'stage', x: 520, y: 40, stage: 'meet' },
    dlg('told', 760, 40, 'Test 7d-2: go to $global.svd_contact_port_name and talk to $global.svd_contact_port_personName (comm directory).', [{ id: 'go_meet', text: 'On my way' }], 'Told'),
    { id: 'talk', type: 'wait', x: 1000, y: 40, mode: 'arrive', entity: 'target:port.person', optionText: 'Test 7d-2, ask about the cache', arriveText: '"The cache? It\'s out there now. Marked on your map."' },
    { id: 'spawn', type: 'action', x: 1240, y: 40, title: 'Cache appears', ops: [{ op: 'spawnAtTarget', target: 'port', kind: 'entity', type: 'supply_cache', where: 'ORBITING_PLANET_OR_STAR' }] },
    { id: 'cache', type: 'stage', x: 1480, y: 40, stage: 'cache' },
    { id: 'found', type: 'wait', x: 1720, y: 40, mode: 'arrive', entity: 'target:port.spawned', arriveText: 'Test 7d-2 passed: the cache was spawned near the target and this arrival found it. It is removed when the quest ends.' },
    { id: 'end', type: 'end', x: 1960, y: 40, outcome: 'success' },
    // the cache's own (vanilla) dialog after ours
    { id: 'open', type: 'link', x: 2200, y: 40, mode: 'trigger', target: 'OpenInteractionDialog', fire: 'FireBest' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'meet' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'meet', handle: 'next', to: 'told' },
    { id: 'd', from: 'told', handle: 'go_meet', to: 'talk' }, { id: 'e', from: 'talk', handle: 'next', to: 'spawn' }, { id: 'f', from: 'spawn', handle: 'next', to: 'cache' },
    { id: 'g', from: 'cache', handle: 'next', to: 'found' }, { id: 'h', from: 'found', handle: 'next', to: 'end' }, { id: 'i', from: 'end', handle: 'next', to: 'open' }
  )
  return q
}

/** 7d-3: an encounter that spawns at the picked planet (RC-R2). */
function hunt(): QuestPlan {
  const q = newQuest('svd_hunt', 'Test 7d-3: pirates at the target', 'quest')
  offerAt(q, '3', 'Test 7d-3. Accept: vanilla picks an uncolonised planet within 20 light-years, and a small pirate fleet waits there.')
  q.variables.push({ name: 'lair', type: 'target', scope: 'quest', initial: '', target: { pick: 'planet', require: [{ id: 'plUnpopulated', args: [] }, { id: 'sysWithin', args: ['giver', 20] }, { id: 'sysTags', args: ['NOT_ANY', ['theme_unsafe', 'theme_remnant_main', 'theme_remnant_secondary']] }], prefer: [], mock: { name: 'Mock lair', system: 'Mock system', dist: 8 } } })
  q.stages = [{ id: 'hunt', title: 'Hunt the pirates', journal: 'Test 7d-3: pirates near $global.svd_hunt_lair_name in $global.svd_hunt_lair_system.', marker: 'target:lair', kind: 'normal', renamedFrom: [] }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'hunt' },
    { id: 'pirates', type: 'encounter', x: 760, y: 40, encounter: 'svd_lair_pirates' },
    dlg('told', 1000, -40, 'Test 7d-3: the pirates are at $global.svd_hunt_lair_name ($global.svd_hunt_lair_system).', [{ id: 'go', text: 'Hunt them' }], 'Told'),
    dlg('left', 1000, 260, 'Test 7d-3: the pirates left (Avoided). The fleet did spawn at the target; that is the part being tested.', [{ id: 'left_ok', text: 'Fine' }], 'Left'),
    dlg('won', 1000, 120, 'Test 7d-3 passed: the fleet spawned at the target and was beaten.', [{ id: 'ok', text: 'Good' }], 'Won'),
    { id: 'end', type: 'end', x: 1240, y: 120, outcome: 'success' },
    { id: 'menu', type: 'link', x: 1240, y: -40, mode: 'menu', target: '' },
    { id: 'menu2', type: 'link', x: 1480, y: 120, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'st', handle: 'next', to: 'pirates' },
    { id: 'd', from: 'pirates', handle: 'next', to: 'told' }, { id: 'e', from: 'told', handle: 'go', to: 'menu' },
    { id: 'f', from: 'pirates', handle: 'defeated', to: 'won' }, { id: 'f2', from: 'pirates', handle: 'avoided', to: 'left' }, { id: 'f3', from: 'left', handle: 'left_ok', to: 'end' }, { id: 'g', from: 'won', handle: 'ok', to: 'end' }, { id: 'h', from: 'end', handle: 'next', to: 'menu2' }
  )
  return q
}

export const SEVEN_D: TestModDef = {
  id: 'seven_d', name: 'Saga Forge test 7d: at the random target', prefix: 'svd_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 7d (target facts, a person there, spawning there; SagaLib 1.2). Dev mode: Ctrl+F9, profile 7d.',
  model() {
    const m = emptyModel('svd_')
    m.project.saga.positions = { svd_facts: [40, 40], svd_contact: [320, 40], svd_hunt: [600, 40] }
    const sys = newSystem('svd_range', 'Test Range D', 4000, 8500)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'svd_station', 'Range Control D', 'star', 2200, 0)
    station.market = { ...newMarket('svd_station', 'Range Control D', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'] }
    sys.entities.push(station, newEntity('jumpPoint', 'svd_jp', 'Test Range D Jump-point', 'star', 3200, 180))
    m.systems.push(sys)

    const enc = newEncounter('svd_lair_pirates', 'Lair pirates', 'pirates')
    enc.spawn = { at: '$global.svd_hunt_lair', when: 'quest-stage', despawnOnStageEnd: true }
    enc.fleet = { ...enc.fleet, points: 30, name: 'Test 7d-3 pirates' }
    m.encounters.push(enc)

    m.quests.push(facts(), contact(), hunt())
    m.testProfiles.push({ id: 'svd_go', name: '7d: go to Test Range D', quests: {}, flags: {}, player: { startAt: 'svd_station', credits: 50000 } })
    return m
  }
}
