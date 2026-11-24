/**
 * Task #67 (user-experience pass, docs/UX-PASS.md): the in-game checks Heliopolis doesn't cover, built
 * into mods\EditorScratchpadMod (the user's choice for extras, 2026-11-21; it is also the Ship Editor's
 * scratch mod: its hulls and variants are left alone). Prefix edi_, 0.98a, SagaLib 1.4.
 * In "Test Range 67":
 *   Waypoint 67  an independent station. "Test 67 - menu":
 *                (a) a Fight with a named fleet (Fleets page: two pirate ships with names and a captain),
 *                (b) a Fight from fleet points, with Left connected (a line, then back),
 *                (c) a picture by the player's gender (cargo_loading / hound_hangar),
 *                (d) a scene with a repeat text (Back from a question shows the short line),
 *                (e) 100 points to the Test 67 progress event (its stage has two outcomes).
 * (m) #67 U43: "Test 67 tax collector" (Hegemony, near Waypoint 67, a new one every day) hails the
 *     player when it reaches them: its comm-link dialog opens before the fleet screen, leaving is
 *     blocked. Pay 1,000 (it leaves: avoided), Refuse (it attacks), Flee (leaving is unblocked, it
 *     chases; caught again, it says so). The answers are the built-in Fleet response node group.
 * World event "Test 67 event" (the dev profile starts it): credits, a commodity, a special item,
 * reputation with a faction and a person, a story point, XP, and a flag for 3 days, all without a
 * dialog (campaign messages).
 * In dev mode, Ctrl+F9 › "67: go to Test Range 67" / "67: ... and start the world event".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newEncounter } from '../../src/shared/encounters'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newNode, newQuest } from '../../src/shared/quest'
import { eventForceKey } from '../../src/shared/export/events'
import type { DialogNode, FightNode, PersonDef, QEdge, QNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'
import { newCommDialog } from '../../src/shared/encounters'
import { BUILTIN_GROUPS } from '../../src/shared/groups'
import type { EncounterDef } from '../../src/shared/model'

/** #67 U43 (check m): the tax collector's comm dialog: a first meeting, or caught after fleeing. */
function taxComm(enc: EncounterDef): QuestPlan {
  const q = newCommDialog(enc)
  q.nodes = q.nodes.filter((n) => n.id !== 'offer' && n.id !== 'cut_link')
  q.edges = []
  const resp = (id: string, response: string, x: number, y: number): QNode => ({ id, type: 'group', x, y, group: 'sagaforge.fleet_response', values: { response } }) as QNode
  const branch: QNode = { id: 'met', type: 'branch', x: 260, y: 0, title: 'Fled before?', cases: [{ id: 'fled', label: 'The player fled from this fleet', conditions: ['$entity.sagaforge_fled'] }] } as QNode
  const first = dlg('offer', 520, 0, '"Test 67 (m): back taxes, captain. One thousand credits, or we take it out of your hull."', [{ id: 'pay', text: 'Pay 1,000 credits' }, { id: 'refuse', text: 'Refuse' }, { id: 'flee', text: 'Make a run for it' }], 'Greeting')
  const caught = dlg('caught', 520, 260, '"Test 67 (m): you ran. You will not run twice."', [{ id: 'fight', text: 'Power up the weapons' }], 'Caught')
  const pay: QNode = { id: 'take', type: 'action', x: 780, y: 0, title: 'Pay', ops: [{ op: 'credits', amount: -1000 }] } as QNode
  q.nodes.push(branch, first, caught, pay, resp('go', 'release', 1040, 0), resp('attack', 'fight', 780, 140), resp('run', 'flee', 780, 260), resp('attack2', 'fight', 780, 400))
  const e = (from: string, handle: string, to: string): QEdge => ({ id: `e_${from}_${handle}`, from, handle, to })
  q.edges.push(e('start', 'next', 'met'), e('met', 'fled', 'caught'), e('met', 'else', 'offer'), e('offer', 'pay', 'take'), e('take', 'next', 'go'), e('offer', 'refuse', 'attack'), e('offer', 'flee', 'run'), e('caught', 'fight', 'attack2'))
  return q
}

const STATION = 'edi_station'

const person = (id: string, last: string, first: string, faction: string, post: string, portrait: string, at?: string): PersonDef => ({
  id, name: { first, last }, gender: 'MALE', faction, rank: 'citizen', post, portrait,
  placement: at ? { at: 'market', market: at, inCommDirectory: true } : { at: 'none' }, tags: [], phrases: []
} as PersonDef)
export const BROKER: PersonDef = {
  ...person('edi_broker', 'Broker', 'Cal', 'independent', 'agent', 'graphics/portraits/portrait_mercenary03.png', STATION),
  // #67 U37 (check k): for a female player, Cal Broker is Callie Broker
  versions: [{ mods: ['setting:player_gender=FEMALE'], set: { 'name.first': 'Callie', gender: 'FEMALE', portrait: 'graphics/portraits/portrait_mercenary02.png' } }]
}
export const CORSAIR = person('edi_corsair', 'Vane', 'Rook', 'pirates', 'spaceCaptain', 'graphics/portraits/portrait_pirate01.png')

const fight = (id: string, x: number, y: number, fleet: FightNode['fleet'], engage: string): FightNode => {
  const n = newNode('fight', id, x, y) as FightNode
  n.title = engage
  n.fleet = fleet
  n.engageText = engage
  return n
}

/** "Test 67 - menu" at Waypoint 67. */
function menu(): QuestPlan {
  const q = newQuest('edi_menu', 'Test 67: menu', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: [`$id == ${STATION}`], optionText: 'Test 67 - menu' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Test 67'
  offer.text = 'Test 67: Saga Forge\'s user-experience pass. Pick a test.'
  offer.options = [
    { id: 'fa', text: '(a) Fight a named fleet (Vane\'s Pair)' },
    { id: 'fb', text: '(b) Fight 30 fleet points of pirates (Leave is connected)' },
    { id: 'pic', text: '(c) A picture by the player\'s gender' },
    { id: 'scene', text: '(d) A scene with a repeat text' },
    { id: 'prog', text: '(e) Add 100 points to the Test 67 progress event' },
    { id: 'leave', text: 'Leave', shortcut: 'ESC' }
  ]
  const pic = dlg('pic_say', 520, 320, 'Test 67 (c): the picture on the right depends on the player character: a female captain sees the hound in its hangar, a male captain the cargo loading. Change your character\'s gender in a new game, or compare with the editor\'s preview (Test context › Player is).', [{ id: 'pic_back', text: 'Back' }])
  pic.visual = { kind: 'illustration', category: 'illustrations', key: 'cargo_loading', female: { category: 'illustrations', key: 'hound_hangar' } }
  const scene = dlg('scene_say', 520, 480, 'Test 67 (d): this is the first-time text, long on purpose. It should show the first time you open this scene in a visit.\n\nAsk the questions; each "Back" should show only the short repeat line, with the same options (the asked ones gone).', [])
  scene.options = [{ id: 'q1', text: 'Ask the first question', showOnce: 'conversation' }, { id: 'q2', text: 'Ask the second question', showOnce: 'conversation' }, { id: 'scene_done', text: 'Done' }]
  scene.repeat = { text: 'Test 67 (d): the repeat text. "Anything else?"', highlights: ['the repeat text'], scope: 'visit' }
  const nodes: QNode[] = [
    fight('fa_fight', 520, 0, { faction: '', size: 'template', template: 'edi_pair' }, 'Engage Vane\'s Pair'),
    dlg('fa_won', 760, 0, 'Test 67 (a): you won. The ships had their names (Test 67 Flagship, Test 67 Hound) and Rook Vane commanded; his fleet\'s defeat count went up (dev console: $global.sagaforge_fleet_edi_pair_defeats).', [{ id: 'fa_back', text: 'Back to the menu' }]),
    fight('fb_fight', 520, 160, { faction: 'pirates', size: 'fp', points: 30, quality: 0.3, name: 'Test 67 pirates' }, 'Engage the Test 67 pirates'),
    dlg('fb_won', 760, 120, 'Test 67 (b): you won against the Test 67 pirates.', [{ id: 'fb_back', text: 'Back to the menu' }]),
    dlg('fb_left', 760, 220, 'Test 67 (b): you left (or lost). This line is the Left output; a fleet you damaged stays for 10 days.', [{ id: 'fb_back2', text: 'Back to the menu' }]),
    pic, scene,
    dlg('q1_say', 760, 440, 'Test 67 (d): the first answer.', [{ id: 'q1_back', text: 'Back' }]),
    dlg('q2_say', 760, 540, 'Test 67 (d): the second answer.', [{ id: 'q2_back', text: 'Back' }]),
    { id: 'prog_go', type: 'action', x: 520, y: 640, title: 'Progress', ops: [{ op: 'progress', event: 'edi_progress', points: 100, text: 'Test 67: you added 100 points' }] },
    dlg('prog_say', 760, 640, 'Test 67 (e): 100 points added. When the stage runs, no dialog should open: one of its two outcomes gives credits (a campaign message "Gained 1,111¢" or "Gained 2,222¢").', [{ id: 'prog_back', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 1000, y: 0, mode: 'menu', target: '' }
  ]
  const edges: QEdge[] = [
    { id: 'm1', from: 'offer', handle: 'fa', to: 'fa_fight' }, { id: 'm2', from: 'fa_fight', handle: 'won', to: 'fa_won' }, { id: 'm3', from: 'fa_won', handle: 'fa_back', to: 'menu' },
    { id: 'm4', from: 'offer', handle: 'fb', to: 'fb_fight' }, { id: 'm5', from: 'fb_fight', handle: 'won', to: 'fb_won' }, { id: 'm6', from: 'fb_fight', handle: 'left', to: 'fb_left' },
    { id: 'm7', from: 'fb_won', handle: 'fb_back', to: 'menu' }, { id: 'm8', from: 'fb_left', handle: 'fb_back2', to: 'menu' },
    { id: 'm9', from: 'offer', handle: 'pic', to: 'pic_say' }, { id: 'm10', from: 'pic_say', handle: 'pic_back', to: 'offer' },
    { id: 'm11', from: 'offer', handle: 'scene', to: 'scene_say' }, { id: 'm12', from: 'scene_say', handle: 'q1', to: 'q1_say' }, { id: 'm13', from: 'q1_say', handle: 'q1_back', to: 'scene_say' },
    { id: 'm14', from: 'scene_say', handle: 'q2', to: 'q2_say' }, { id: 'm15', from: 'q2_say', handle: 'q2_back', to: 'scene_say' }, { id: 'm16', from: 'scene_say', handle: 'scene_done', to: 'offer' },
    { id: 'm17', from: 'offer', handle: 'prog', to: 'prog_go' }, { id: 'm18', from: 'prog_go', handle: 'next', to: 'prog_say' }, { id: 'm19', from: 'prog_say', handle: 'prog_back', to: 'offer' },
    { id: 'm20', from: 'offer', handle: 'leave', to: 'menu' }
  ]
  q.nodes.push(...nodes)
  q.edges.push(...edges)
  return q
}

export const SCRATCH67: TestModDef = {
  id: 'EditorScratchpadMod', name: 'Editor Scratchpad Mod', prefix: 'edi_', version: '0.1.0', gameVersion: '0.98a-RC8',
  description: 'Scratch mod for testing the ship editor (tools/ship-editor) and Saga Forge\'s extra in-game checks (task #67: Test Range 67, Ctrl+F9 profiles 67). Contents are throwaway.',
  model() {
    const m = emptyModel('edi_')
    const sys = newSystem('edi_range', 'Test Range 67', 14000, 22000)
    sys.addToExistingSaves = true
    const station = newEntity('station', STATION, 'Waypoint 67', 'star', 2000, 0)
    station.market = { ...newMarket(STATION, 'Waypoint 67', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: [] }
    sys.entities.push(station, newEntity('jumpPoint', 'edi_jp', 'Test Range 67 Jump-point', 'star', 4500, 240))
    m.systems.push(sys)
    m.people.push({ ...BROKER }, { ...CORSAIR })
    // #67 U40 (check l): a mixed fleet near Waypoint 67: an Eagle always, 40 random points, and two extra groups
    const hunters = newEncounter('edi_hunters', 'Test 67 hunters', 'mercenary')
    hunters.fleet = { ...hunters.fleet, type: 'mercBountyHunter', size: 'explicit', variants: ['eagle_Assault'], randomPoints: 40, name: 'Test 67 hunters',
      extras: [{ chance: 0.5, pick: 'all', ships: [{ variant: 'hammerhead_Balanced' }, { variant: 'hammerhead_Elite' }] }, { chance: 1, pick: 1, ships: [{ variant: 'condor_Support', weight: 3 }, { variant: 'drover_Strike' }] }] }
    hunters.spawn = { at: STATION, when: 'periodic', days: 1 } as never
    hunters.behavior = 'guard'
    hunters.flags = { noRepImpact: true, important: true, allowDisengage: true }
    m.encounters.push(hunters)
    m.fleets = { templates: [{ id: 'edi_pair', name: 'Vane\'s Pair', faction: 'pirates', fleetType: 'patrolSmall', ships: [{ variant: 'lasher_CS', name: 'Test 67 Flagship' }, { variant: 'hound_d_pirates_Standard', name: 'Test 67 Hound' }], flagship: 0, captain: 'edi_corsair', quality: 0.5 }], typeNames: {} }
    m.quests.push(menu())
    // #67 U43 (check m): a hail on contact, answered with the Fleet response node group
    const tax = newEncounter('edi_tax', 'Test 67 tax collector', 'hegemony')
    tax.fleet = { ...tax.fleet, type: 'patrolSmall', size: 'fp', points: 30, name: 'Test 67 tax collector' }
    tax.spawn = { at: STATION, when: 'periodic', days: 1 } as never
    tax.behavior = 'intercept-player'
    tax.flags = { ...tax.flags, allowDisengage: false }
    tax.commDialog = 'edi_tax_comm'
    tax.hail = { text: "Test 67 (m): you're being hailed by the tax collector.", describe: true }
    // #67 U46 (check n): the encounter's own outcome actions (campaign messages, no dialog)
    tax.onDefeated = [{ op: 'set', key: '$global.edi_tax_beaten', value: 'true' }, { op: 'credits', amount: 567 }]
    tax.onAvoided = [{ op: 'xp', amount: 67 }]
    m.encounters.push(tax)
    m.nodeGroups = [structuredClone(BUILTIN_GROUPS[0])]
    m.quests.push(taxComm(tax))

    // U12: actions without a dialog (campaign messages instead of a dialog that flashes)
    m.events = [{
      id: 'edi_events', name: 'Test 67 events', min: 0, max: 1, intervalDays: 9999, firstAfterDays: 9999,
      events: [{
        id: 'edi_event', name: 'Test 67 event', weight: 1, conditions: [], once: true, durationDays: 0,
        news: { title: 'Test 67: the world event ran', text: 'Test 67 (f): no dialog opened. Bottom-left messages: +1,000 credits, 5 supplies, an alpha core, +3 with the independents, +5 with Cal Broker, a story point, 1,000 XP.', tag: 'Major events', at: STATION, days: 10 },
        start: [
          { op: 'credits', amount: 1000 }, { op: 'item', item: 'supplies', qty: 5 }, { op: 'item', item: 'alpha_core', qty: 1 },
          { op: 'rep', faction: 'independent', amount: 3 }, { op: 'rep', person: 'edi_broker', amount: 5 },
          { op: 'storyPoints', amount: 1 }, { op: 'xp', amount: 1000 }, { op: 'set', key: '$global.edi_event_ran', value: 'true', days: 3 }
        ],
        end: []
      }]
    }]
    m.progress = [{
      id: 'edi_progress', name: 'Test 67 progress', max: 100, startConditions: [],
      stages: [{ id: 'full', progress: 100, title: 'Full', text: 'Test 67 (e): this stage picked one of two outcomes, without a dialog.', actions: [],
        outcomes: [{ id: 'small', label: 'Small', weight: 1, actions: [{ op: 'credits', amount: 1111 }] }, { id: 'big', label: 'Big', weight: 1, actions: [{ op: 'credits', amount: 2222 }] }] }],
      factors: []
    }]

    const kit = { credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] }
    m.testProfiles.push(
      { id: 'edi_go', name: '67: go to Test Range 67', quests: {}, flags: {}, player: { startAt: STATION, ...kit } },
      { id: 'edi_event_go', name: '67: go to Test Range 67 and start the world event', quests: {}, flags: { [eventForceKey('edi_events')]: 'edi_event' }, player: { startAt: STATION, ...kit } }
    )
    return m
  }
}
