/**
 * Test mod for task #27 (MagicLib bounties; docs/DESIGN-MAGICLIB-BOUNTIES.md): mods\twentyseven_a
 * (prefix tsa_), for the 0.98a install where MagicLib 1.5.6 is. MagicLib is in its list of other
 * mods as optional (the bounty file is only read by MagicLib). Near "Test Range 27":
 *   tsa_b_raiders  a bounty made from the encounter tsa_raiders: a fixed place (the planet tsa_rock),
 *                  explicit ships, a captain of the mod, offered only at Range Control 27, whose
 *                  market id (tsa_station_market) differs from its entity id (tsa_station)
 *   tsa_b_hunt     a bounty made from the quest tsa_hunt: its contact, offer text with tokens, reward
 *                  (credits, reputation, an item into the loot), time limit, and its random target
 *                  "lair" translated into MagicLib's location fields; the fleet is sized by points
 *   tsa_status     a conversation at the station: which bounties MagicLib marked as succeeded
 * Both sources are "only as a bounty", so SagaLib doesn't spawn them as well. In dev mode, Ctrl+F9 ›
 * "27: go to Test Range 27" takes the fleet there.
 * Task #59 (SagaLib 1.3's MagicLib bridge) adds a quest that starts a bounty and a conversation that
 * reads its state (addTask59; INGAME-CHECKS.md "Task #59"). Task #69 adds quests that wait for a
 * bounty's end (addTask69; INGAME-CHECKS.md "Task #69").
 */
import { emptyModel, type ModModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newEncounter } from '../../src/shared/encounters'
import type { DialogNode, PersonDef, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const TWENTYSEVEN_GAME = '0.98a-RC8'

/** The hunt quest: contact → accept → stage → the hunters' encounter → success (paid) or failure. */
export function huntQuest(): QuestPlan {
  const q = newQuest('tsa_hunt', 'Test 27: hunt the Lantern Gang', 'quest')
  q.start = { kind: 'contact', person: 'tsa_broker', freq: 10, minRep: 'FAVORABLE', offerText: '"The Lantern Gang hides near $global.tsa_hunt_lair_name in $global.tsa_hunt_lair_system. 100% of the pay on proof, captain." (Test 27 (b): this text comes from the quest.)' }
  q.timeLimitDays = 60
  q.stages = [
    { id: 'go', title: 'Find the Lantern Gang', journal: 'Find the gang near $global.tsa_hunt_lair_name.', kind: 'normal', renamedFrom: [] },
    { id: 'won', title: 'Gang broken', journal: 'The Lantern Gang is broken. (Test 27 (b): the success text comes from the quest\'s success stage.)', kind: 'success', renamedFrom: [] },
    { id: 'lost', title: 'Gang escaped', journal: 'The gang got away.', kind: 'fail', renamedFrom: [] }
  ]
  q.rewards = [{ id: 'paid', credits: 20000, rep: [{ faction: 'independent', amount: 0.05 }], items: [{ item: 'hand_weapons', qty: 5 }] }]
  q.variables = [{
    name: 'lair', type: 'target', scope: 'quest', initial: '', target: {
      pick: 'planet',
      require: [{ id: 'sysNotPulsar', args: [] }],
      prefer: [{ id: 'sysTags', args: ['ANY', ['theme_ruins', 'theme_derelict']] }, { id: 'sysUnexplored', args: [] }, { id: 'sysInner', args: [] }, { id: 'sysWithin', args: ['giver', 12] }]
    }
  }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'enc', type: 'encounter', x: 680, y: 40, encounter: 'tsa_hunters' },
    { id: 'won', type: 'stage', x: 880, y: 0, stage: 'won' },
    { id: 'end', type: 'end', x: 1040, y: 0, outcome: 'success', reward: 'paid' },
    { id: 'lost', type: 'stage', x: 880, y: 140, stage: 'lost' },
    { id: 'end2', type: 'end', x: 1040, y: 140, outcome: 'fail' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'enc' },
    { id: 'c', from: 'enc', handle: 'defeated', to: 'won' }, { id: 'd', from: 'won', handle: 'next', to: 'end' },
    { id: 'e', from: 'enc', handle: 'avoided', to: 'lost' }, { id: 'f', from: 'lost', handle: 'next', to: 'end2' },
    { id: 'g', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/**
 * Task #59 (SagaLib 1.3's MagicLib bridge), at Range Control 27:
 *   tsa_job       a SagaLib quest: "unavailable" without MagicLib (says so, doesn't start); else
 *                 Start a MagicLib bounty tsa_b_ghost (never on the board), the stage "hunt", and
 *                 an option at the station to report: it reads the bounty's state (succeeded → the
 *                 quest succeeds and sets its true/false key; ended otherwise → it fails; still
 *                 running → come back later: the option is offered again)
 *   tsa_b_partner a board bounty whose quest requires "tsa_job ended with success": MagicLib's
 *                 trigger reads SagaLib's $sagaforge_success_tsa_job
 */
function addTask59(m: ModModel): void {
  const ghost = newEncounter('tsa_ghost', 'The Ghost', 'pirates')
  ghost.fleet = { faction: 'pirates', type: 'patrolSmall', size: 'explicit', variants: ['cerberus_d_pirates_Standard', 'hound_d_pirates_Overdriven'], quality: 0.3, name: 'The Ghost' }
  ghost.spawn = { at: 'tsa_shoal', when: 'new-game' }
  ghost.behavior = 'guard'
  ghost.flags = { hostile: true }
  const partner = newEncounter('tsa_partner', 'The Ghost\'s partner', 'pirates')
  partner.fleet = { faction: 'pirates', type: 'patrolSmall', size: 'explicit', variants: ['hound_d_pirates_Overdriven', 'hound_d_pirates_Overdriven'], quality: 0.3, name: 'Ghost\'s Partner' }
  partner.spawn = { at: 'tsa_shoal', when: 'new-game' }
  partner.behavior = 'guard'
  partner.flags = { hostile: true }
  m.encounters.push(ghost, partner)

  // ---- the job: start the bounty from the quest (or say it isn't available)
  const job = newQuest('tsa_job', 'Test 59: Range Control\'s contract', 'quest')
  job.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == tsa_station', 'SF_QuestState tsa_job notStarted'], optionText: 'Test 59, ask about Range Control\'s contract' }
  job.stages = [
    { id: 'hunt', title: 'Hunt the Ghost', journal: 'Test 59: hunt the Ghost (MagicLib\'s bounty intel says where), then report to Range Control 27.', nextStep: 'Report to Range Control 27', marker: 'tsa_station', kind: 'normal', renamedFrom: [] },
    { id: 'won', title: 'The Ghost is gone', journal: 'Test 59 (d): MagicLib marked the Ghost\'s bounty as succeeded.', kind: 'success', renamedFrom: [] },
    { id: 'lost', title: 'The Ghost got away', journal: 'Test 59: the Ghost\'s bounty ended without success.', kind: 'fail', renamedFrom: [] }
  ]
  const offer = job.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 59 (a). Range Control 27 has a contract on a pirate called the Ghost. It goes through MagicLib\'s bounty system, but it is never on the board: only this conversation hands it out.'
  offer.options = [{ id: 'accept', text: 'Sign the contract' }, { id: 'decline', text: 'Not now', shortcut: 'ESC' }]
  job.nodes.push(
    { id: 'avail', type: 'branch', x: 520, y: 40, title: 'Bounty available?', cases: [{ id: 'none', label: 'No MagicLib', conditions: ['SF_BountyState tsa_b_ghost unavailable'] }] },
    dlg('d_none', 760, -80, 'Test 59 (f): the bounty isn\'t available here. MagicLib isn\'t installed, so there is no contract to sign, and the quest doesn\'t start.', [{ id: 'back', text: 'Back' }]),
    { id: 'take', type: 'action', x: 760, y: 40, title: 'Take the bounty', ops: [{ op: 'startBounty', bounty: 'tsa_b_ghost' }] },
    { id: 'st', type: 'stage', x: 960, y: 40, stage: 'hunt' },
    dlg('d_signed', 1160, 40, 'Test 59 (b): contract signed. The highlighted "Accepted job" line above is MagicLib\'s own; its bounty intel has the Ghost\'s place (Ghost Shoal 27). Report here when it is done.', [{ id: 'ok', text: 'Go' }]),
    { id: 'report', type: 'wait', x: 1400, y: 40, mode: 'arrive', entity: 'tsa_station', optionText: 'Test 59, report on the Ghost', arriveText: 'Test 59: Range Control 27 checks MagicLib\'s records on the Ghost.' },
    { id: 'state', type: 'branch', x: 1640, y: 40, title: 'Bounty state', cases: [
      { id: 'won', label: 'Succeeded', conditions: ['SF_BountyState tsa_b_ghost succeeded'] },
      { id: 'lost', label: 'Ended otherwise', conditions: ['SF_BountyState tsa_b_ghost failed expired dismissed'] },
      { id: 'run', label: 'Still running', conditions: ['SF_BountyState tsa_b_ghost active'] }
    ] },
    { id: 'st_won', type: 'stage', x: 1880, y: -80, stage: 'won' },
    { id: 'end_won', type: 'end', x: 2080, y: -80, outcome: 'success' },
    dlg('d_won', 2280, -80, 'Test 59 (d) passed: MagicLib marked the bounty as succeeded, so Range Control\'s contract (this quest) ends with success. Its partner\'s bounty is on the board now (e).', [{ id: 'ok1', text: 'Good' }]),
    { id: 'st_lost', type: 'stage', x: 1880, y: 60, stage: 'lost' },
    { id: 'end_lost', type: 'end', x: 2080, y: 60, outcome: 'fail' },
    dlg('d_lost', 2280, 60, 'Test 59: the bounty ended without success (failed, expired or dismissed), so the contract fails.', [{ id: 'ok2', text: 'Back' }]),
    dlg('d_run', 1880, 200, 'Test 59 (c): MagicLib says the bounty is still active: the Ghost is out there. Come back when it is done.', [{ id: 'ok3', text: 'Back' }]),
    dlg('d_other', 1880, 320, 'Test 59: MagicLib says the bounty is neither running nor ended (offered, or unavailable since MagicLib was removed).', [{ id: 'ok4', text: 'Back' }]),
    { id: 'again', type: 'action', x: 2080, y: 260, title: 'Report again later', ops: [{ op: 'unset', key: '$global.tsa_job_report_done' }] },
    { id: 'menu', type: 'link', x: 2520, y: 40, mode: 'menu', target: '' }
  )
  job.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'avail' }, { id: 'b', from: 'offer', handle: 'decline', to: 'menu' },
    { id: 'c', from: 'avail', handle: 'none', to: 'd_none' }, { id: 'd', from: 'd_none', handle: 'back', to: 'menu' },
    { id: 'e', from: 'avail', handle: 'else', to: 'take' }, { id: 'f', from: 'take', handle: 'next', to: 'st' },
    { id: 'g', from: 'st', handle: 'next', to: 'd_signed' }, { id: 'h', from: 'd_signed', handle: 'ok', to: 'report' },
    { id: 'i', from: 'report', handle: 'next', to: 'state' },
    { id: 'j', from: 'state', handle: 'won', to: 'st_won' }, { id: 'k', from: 'st_won', handle: 'next', to: 'end_won' }, { id: 'l', from: 'end_won', handle: 'next', to: 'd_won' }, { id: 'm', from: 'd_won', handle: 'ok1', to: 'menu' },
    { id: 'n', from: 'state', handle: 'lost', to: 'st_lost' }, { id: 'o', from: 'st_lost', handle: 'next', to: 'end_lost' }, { id: 'p', from: 'end_lost', handle: 'next', to: 'd_lost' }, { id: 'q', from: 'd_lost', handle: 'ok2', to: 'menu' },
    { id: 'r', from: 'state', handle: 'run', to: 'd_run' }, { id: 's', from: 'd_run', handle: 'ok3', to: 'again' },
    { id: 't', from: 'state', handle: 'else', to: 'd_other' }, { id: 'u', from: 'd_other', handle: 'ok4', to: 'again' },
    { id: 'v', from: 'again', handle: 'next', to: 'menu' }
  )

  // ---- the partner: a board bounty offered only after the job succeeded (MagicLib reads SagaLib's ended key)
  const pq = newQuest('tsa_partner_job', 'Test 59 (e): the Ghost\'s partner', 'quest')
  pq.start = { kind: 'contact', person: 'tsa_broker', freq: 10, minRep: 'FAVORABLE', offerText: 'Test 59 (e): with the Ghost gone, its partner is on the board. MagicLib offers this only after Range Control\'s contract succeeded.' }
  pq.requires = [{ quest: 'tsa_job', ended: 'success' }]
  pq.rewards = [{ id: 'paid', credits: 8000, rep: [{ faction: 'independent', amount: 0.03 }] }]
  pq.nodes.push(
    { id: 'enc', type: 'encounter', x: 520, y: 40, encounter: 'tsa_partner' },
    { id: 'end', type: 'end', x: 760, y: 40, outcome: 'success', reward: 'paid' },
    { id: 'end2', type: 'end', x: 760, y: 160, outcome: 'fail' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  pq.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'enc' }, { id: 'b', from: 'enc', handle: 'defeated', to: 'end' },
    { id: 'c', from: 'enc', handle: 'avoided', to: 'end2' }, { id: 'd', from: 'offer', handle: 'decline', to: 'no' }
  )
  m.quests.push(job, pq)

  m.bounties!.push(
    {
      id: 'tsa_b_ghost', encounter: 'tsa_ghost', only: true, board: false, type: 'assassination', name: 'Test 59: the Ghost',
      description: 'Range Control 27\'s contract on the Ghost, at $location. Pay: $reward. (Test 59: never on the board, only from the quest.)',
      success: 'Test 59: the Ghost is gone. Report to Range Control 27.', forFaction: 'independent', credits: 10000, rep: 3, deadline: 60,
      offer: { markets: ['tsa_station_market'] }, show: { fleet: 'all', distance: 'system', arrow: true }
    },
    { id: 'tsa_b_partner', quest: 'tsa_partner_job', only: true, type: 'assassination', show: { distance: 'system', arrow: true } }
  )
}

/**
 * Task #69 (SagaLib 1.3: a Wait node on a MagicLib bounty's end), at Range Control 27:
 *   tsa_watch  "unavailable" without MagicLib (says so); else Start a MagicLib bounty tsa_b_watch (never
 *              on the board), the stage "hunt", then a Wait for the bounty: no report option, the quest
 *              goes on by itself in its own dialog, one per way it ended
 *   tsa_late   waits for the board bounty tsa_b_late (2-day deadline): take it on the board, let it
 *              expire, then ask: the bounty ended before the quest got to its Wait, so it goes on at once
 */
function addTask69(m: ModModel): void {
  const buoy = newEntity('planet', 'tsa_buoy', 'Watch Buoy 27', 'star', 3000, 300)
  buoy.type = 'barren'
  m.systems.find((s) => s.id === 'tsa_range')!.entities.push(buoy)
  const watcher = newEncounter('tsa_watcher', 'The Watcher', 'pirates')
  watcher.fleet = { faction: 'pirates', type: 'patrolSmall', size: 'explicit', variants: ['hound_d_pirates_Overdriven'], quality: 0.3, name: 'The Watcher' }
  watcher.spawn = { at: 'tsa_buoy', when: 'new-game' }
  watcher.behavior = 'guard'
  watcher.flags = { hostile: true }
  const drifter = newEncounter('tsa_drifter', 'The Drifter', 'pirates')
  drifter.fleet = { faction: 'pirates', type: 'patrolSmall', size: 'explicit', variants: ['hound_d_pirates_Overdriven'], quality: 0.3, name: 'The Drifter' }
  drifter.spawn = { at: 'tsa_buoy', when: 'new-game' }
  drifter.behavior = 'guard'
  drifter.flags = { hostile: true }
  m.encounters.push(watcher, drifter)

  // ---- the Watcher: start the bounty, then wait for its end (no report option)
  const q = newQuest('tsa_watch', 'Test 69: the Watcher\'s contract', 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == tsa_station', 'SF_QuestState tsa_watch notStarted'], optionText: 'Test 69, ask about the Watcher' }
  q.stages = [
    { id: 'hunt', title: 'Hunt the Watcher', journal: 'Test 69: beat the Watcher at Watch Buoy 27. No need to report: the contract goes on by itself when MagicLib says the bounty is done.', kind: 'normal', renamedFrom: [] },
    { id: 'won', title: 'The Watcher is gone', journal: 'Test 69 (b): the contract went on by itself after the bounty succeeded.', kind: 'success', renamedFrom: [] },
    { id: 'lost', title: 'The Watcher got away', journal: 'Test 69: the bounty ended without success.', kind: 'fail', renamedFrom: [] }
  ]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 69 (a). Range Control 27 has a contract on a pirate called the Watcher, through MagicLib\'s bounty system. This time there is nothing to report: when the bounty ends, the contract goes on by itself.'
  offer.options = [{ id: 'accept', text: 'Sign the contract' }, { id: 'decline', text: 'Not now', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'avail', type: 'branch', x: 520, y: 40, title: 'Bounty available?', cases: [{ id: 'none', label: 'No MagicLib', conditions: ['SF_BountyState tsa_b_watch unavailable'] }] },
    dlg('d_none', 760, -80, 'Test 69 (f): the bounty isn\'t available here. MagicLib isn\'t installed, so the quest doesn\'t start.', [{ id: 'back', text: 'Back' }]),
    { id: 'take', type: 'action', x: 760, y: 40, title: 'Take the bounty', ops: [{ op: 'startBounty', bounty: 'tsa_b_watch' }] },
    { id: 'st', type: 'stage', x: 960, y: 40, stage: 'hunt' },
    dlg('d_signed', 1160, 40, 'Test 69 (a): contract signed (MagicLib\'s "Accepted job" line above). Beat the Watcher at Watch Buoy 27; don\'t come back here.', [{ id: 'ok', text: 'Go' }]),
    { id: 'w', type: 'wait', x: 1400, y: 40, mode: 'bounty', bounty: 'tsa_b_watch' },
    dlg('d_won', 1640, -120, 'Test 69 (b) passed: this dialog opened by itself after MagicLib\'s bounty succeeded (SagaLib fired tsa_watch_w_succeeded). The contract ends with success.', [{ id: 'ok1', text: 'Good' }]),
    dlg('d_failed', 1640, 0, 'Test 69: the bounty failed (its flagship was salvaged), so the contract fails.', [{ id: 'ok2', text: 'Back' }]),
    dlg('d_exp', 1640, 120, 'Test 69: the bounty expired, so the contract fails.', [{ id: 'ok3', text: 'Back' }]),
    dlg('d_dis', 1640, 240, 'Test 69: the bounty was dismissed, so the contract fails.', [{ id: 'ok4', text: 'Back' }]),
    { id: 'st_won', type: 'stage', x: 1880, y: -120, stage: 'won' },
    { id: 'end_won', type: 'end', x: 2080, y: -120, outcome: 'success' },
    { id: 'st_lost', type: 'stage', x: 1880, y: 60, stage: 'lost' },
    { id: 'end_lost', type: 'end', x: 2080, y: 60, outcome: 'fail' },
    { id: 'menu', type: 'link', x: 2320, y: 0, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'avail' }, { id: 'b', from: 'offer', handle: 'decline', to: 'menu' },
    { id: 'c', from: 'avail', handle: 'none', to: 'd_none' }, { id: 'd', from: 'd_none', handle: 'back', to: 'menu' },
    { id: 'e', from: 'avail', handle: 'else', to: 'take' }, { id: 'f', from: 'take', handle: 'next', to: 'st' },
    { id: 'g', from: 'st', handle: 'next', to: 'd_signed' }, { id: 'h', from: 'd_signed', handle: 'ok', to: 'w' },
    { id: 'i', from: 'w', handle: 'succeeded', to: 'd_won' }, { id: 'j', from: 'w', handle: 'failed', to: 'd_failed' },
    { id: 'k', from: 'w', handle: 'expired', to: 'd_exp' }, { id: 'l', from: 'w', handle: 'dismissed', to: 'd_dis' },
    { id: 'm', from: 'd_won', handle: 'ok1', to: 'st_won' }, { id: 'n', from: 'st_won', handle: 'next', to: 'end_won' }, { id: 'o', from: 'end_won', handle: 'next', to: 'menu' },
    { id: 'p', from: 'd_failed', handle: 'ok2', to: 'st_lost' }, { id: 'q', from: 'd_exp', handle: 'ok3', to: 'st_lost' }, { id: 'r', from: 'd_dis', handle: 'ok4', to: 'st_lost' },
    { id: 's', from: 'st_lost', handle: 'next', to: 'end_lost' }, { id: 't', from: 'end_lost', handle: 'next', to: 'menu' }
  )

  // ---- the Drifter: a board bounty that ends before the quest gets to its Wait
  const late = newQuest('tsa_late', 'Test 69 (c): the Drifter', 'quest')
  late.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == tsa_station', 'SF_QuestState tsa_late notStarted'], optionText: 'Test 69 (c), ask about the Drifter' }
  late.stages = [
    { id: 'watch', title: 'Range Control watches the Drifter', journal: 'Test 69 (c): Range Control 27 watches the Drifter\'s bounty.', kind: 'normal', renamedFrom: [] },
    { id: 'done', title: 'The Drifter\'s bounty is over', journal: 'Test 69 (c): the Drifter\'s bounty ended.', kind: 'success', renamedFrom: [] }
  ]
  const lo = late.nodes.find((n) => n.id === 'offer') as DialogNode
  lo.text = 'Test 69 (c). Range Control 27 asks about the Drifter, a bounty on MagicLib\'s board with two days to run. If it has already run out, this quest goes on by itself as soon as this dialog closes.'
  lo.options = [{ id: 'accept', text: 'Tell them' }, { id: 'decline', text: 'Not now', shortcut: 'ESC' }]
  late.nodes.push(
    { id: 'avail', type: 'branch', x: 520, y: 40, title: 'Bounty available?', cases: [{ id: 'none', label: 'No MagicLib', conditions: ['SF_BountyState tsa_b_late unavailable'] }] },
    dlg('d_none', 760, -80, 'Test 69 (f): the Drifter\'s bounty isn\'t available. MagicLib isn\'t installed, so the quest doesn\'t start.', [{ id: 'back', text: 'Back' }]),
    { id: 'st', type: 'stage', x: 760, y: 40, stage: 'watch' },
    dlg('d_told', 960, 40, 'Test 69 (c): Range Control 27 will watch the Drifter\'s bounty. Close this dialog.', [{ id: 'ok', text: 'Leave' }]),
    { id: 'w', type: 'wait', x: 1160, y: 40, mode: 'bounty', bounty: 'tsa_b_late' },
    dlg('d_exp', 1400, -120, 'Test 69 (c) passed: the Drifter\'s bounty had expired, and this dialog opened by itself (SagaLib fired tsa_late_w_expired).', [{ id: 'ok1', text: 'Good' }]),
    dlg('d_won', 1400, 0, 'Test 69 (c): the Drifter\'s bounty succeeded (you beat it). The check wanted it to expire: take it and don\'t fight it.', [{ id: 'ok2', text: 'Back' }]),
    dlg('d_failed', 1400, 120, 'Test 69 (c): the Drifter\'s bounty failed (its flagship was salvaged).', [{ id: 'ok3', text: 'Back' }]),
    dlg('d_dis', 1400, 240, 'Test 69 (c): the Drifter\'s bounty was dismissed.', [{ id: 'ok4', text: 'Back' }]),
    { id: 'st_done', type: 'stage', x: 1640, y: 60, stage: 'done' },
    { id: 'end', type: 'end', x: 1840, y: 60, outcome: 'success' },
    { id: 'menu', type: 'link', x: 2080, y: 0, mode: 'menu', target: '' }
  )
  late.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'avail' }, { id: 'b', from: 'offer', handle: 'decline', to: 'menu' },
    { id: 'c', from: 'avail', handle: 'none', to: 'd_none' }, { id: 'd', from: 'd_none', handle: 'back', to: 'menu' },
    { id: 'e', from: 'avail', handle: 'else', to: 'st' }, { id: 'f', from: 'st', handle: 'next', to: 'd_told' }, { id: 'g', from: 'd_told', handle: 'ok', to: 'w' },
    { id: 'h', from: 'w', handle: 'expired', to: 'd_exp' }, { id: 'i', from: 'w', handle: 'succeeded', to: 'd_won' },
    { id: 'j', from: 'w', handle: 'failed', to: 'd_failed' }, { id: 'k', from: 'w', handle: 'dismissed', to: 'd_dis' },
    { id: 'l', from: 'd_exp', handle: 'ok1', to: 'st_done' }, { id: 'm', from: 'd_won', handle: 'ok2', to: 'st_done' },
    { id: 'n', from: 'd_failed', handle: 'ok3', to: 'st_done' }, { id: 'o', from: 'd_dis', handle: 'ok4', to: 'st_done' },
    { id: 'p', from: 'st_done', handle: 'next', to: 'end' }, { id: 'r', from: 'end', handle: 'next', to: 'menu' }
  )
  m.quests.push(q, late)

  m.bounties!.push(
    {
      id: 'tsa_b_watch', encounter: 'tsa_watcher', only: true, board: false, type: 'assassination', name: 'Test 69: the Watcher',
      description: 'Range Control 27\'s contract on the Watcher, at $location. Pay: $reward. (Test 69: never on the board, only from the quest.)',
      success: 'Test 69: the Watcher is gone.', forFaction: 'independent', credits: 6000, rep: 2, deadline: 60,
      offer: { markets: ['tsa_station_market'] }, show: { fleet: 'all', distance: 'system', arrow: true }
    },
    {
      id: 'tsa_b_late', encounter: 'tsa_drifter', only: true, type: 'assassination', name: 'Test 69 (c): the Drifter',
      description: 'The Drifter waits at $location. Two days only. (Test 69 (c): take it, don\'t fight it, let it run out.)',
      expired: 'Test 69 (c): the Drifter\'s bounty ran out.', forFaction: 'independent', credits: 3000, rep: 1, deadline: 2,
      offer: { markets: ['tsa_station_market'] }, show: { fleet: 'all', distance: 'system', arrow: true }
    }
  )
}

/** The bounty content shared by the golden tests and the test mod. */
export function bountyModel(): ModModel {
  const m = emptyModel('tsa_')
  m.project.mods = [{ id: 'MagicLib', name: 'MagicLib', use: 'optional' }]

  // #59: moved from (-15000, 14500), which crowded sixty_a's Test Range 60 on the map
  const sys = newSystem('tsa_range', 'Test Range 27', -21000, 15000)
  sys.addToExistingSaves = true
  const station = newEntity('station', 'tsa_station', 'Range Control 27', 'star', 2000, 0)
  station.market = { ...newMarket('tsa_station_market', 'Range Control 27', 'independent'), size: 4, people: ['tsa_broker'] }
  const rock = newEntity('planet', 'tsa_rock', 'Target Rock 27', 'star', 3500, 120)
  rock.type = 'barren'
  // #59: where the Ghost and its partner wait
  const shoal = newEntity('planet', 'tsa_shoal', 'Ghost Shoal 27', 'star', 4200, 260)
  shoal.type = 'rocky_ice'
  sys.entities.push(station, rock, shoal, newEntity('jumpPoint', 'tsa_jp', 'Test Range 27 Jump-point', 'star', 5000, 200))
  m.systems.push(sys)

  const broker: PersonDef = {
    id: 'tsa_broker', name: { first: 'Iles', last: 'Okafor' }, gender: 'MALE', faction: 'independent', rank: 'citizen', post: 'agent', portrait: 'graphics/portraits/portrait_mercenary01.png',
    placement: { at: 'market', market: 'tsa_station_market', inCommDirectory: true }, contact: { types: ['military'], importance: 'MEDIUM' }, tags: [], phrases: []
  }
  const raider: PersonDef = {
    id: 'tsa_raider', name: { first: 'Vell', last: 'Kasimir' }, gender: 'FEMALE', faction: 'pirates', rank: 'spaceCaptain', post: 'fleetCommander', portrait: 'graphics/portraits/portrait_pirate02.png', personality: 'reckless',
    placement: { at: 'none' }, tags: [], phrases: []
  }
  m.people.push(broker, raider)

  // ---- the raiders: a fixed place, explicit ships, the mod's captain
  const raiders = newEncounter('tsa_raiders', 'Kasimir\'s raiders', 'pirates')
  raiders.fleet = { faction: 'pirates', type: 'patrolMedium', size: 'explicit', variants: ['enforcer_d_pirates_Strike', 'hound_d_pirates_Overdriven', 'hound_d_pirates_Overdriven', 'cerberus_d_pirates_Standard'], quality: 0.3, flagshipCommander: 'tsa_raider', name: 'Kasimir\'s Raiders' }
  raiders.spawn = { at: 'tsa_rock', when: 'new-game' }
  raiders.behavior = 'guard'
  raiders.flags = { hostile: true, allowDisengage: false }
  raiders.commDialog = 'tsa_raiders_comm'
  const comm = newQuest('tsa_raiders_comm', 'Kasimir answers', 'dialog')
  ;(comm.nodes.find((n) => n.id === 'offer') as DialogNode).text = '"Range Control sent you? $tsa_raider_firstName Kasimir doesn\'t run." (Test 27 (a): the comm reply comes from the encounter\'s comm dialog.)'
  m.encounters.push(raiders)
  // its Leave goes back to the fleet's menu
  comm.nodes.push({ id: 'menu', type: 'link', x: 520, y: 40, mode: 'menu', target: '' })
  comm.edges.push({ id: 'a', from: 'offer', handle: 'leave', to: 'menu' })
  m.quests.push(comm)

  // ---- the hunters: sized by points, waiting at the hunt quest's random target
  const hunters = newEncounter('tsa_hunters', 'The Lantern Gang', 'pirates')
  hunters.fleet = { faction: 'pirates', type: 'patrolMedium', size: 'fp', points: 40, quality: 0.5, name: 'Lantern Gang' }
  hunters.spawn = { at: '$global.tsa_hunt_lair', when: 'quest-stage', quest: 'tsa_hunt', stage: 'go' }
  hunters.behavior = 'patrol'
  m.encounters.push(hunters)
  m.quests.push(huntQuest())

  m.bounties = [
    {
      id: 'tsa_b_raiders', encounter: 'tsa_raiders', only: true, type: 'assassination', name: 'Test 27 (a): Kasimir\'s raiders',
      description: 'Range Control 27 wants ==$name== gone from $location in $system. Pay: $reward. (Test 27 (a).)',
      success: 'Range Control 27 pays out. (Test 27 (a): success.)', expired: 'Someone else got Kasimir first.',
      forFaction: 'independent', credits: 15000, rep: 5, deadline: 90,
      offer: { markets: ['tsa_station_market'] }, show: { fleet: 'all', distance: 'system', arrow: true }
    },
    { id: 'tsa_b_hunt', quest: 'tsa_hunt', only: true, type: 'obliteration', flagship: 'enforcer_Elite', show: { distance: 'system', arrow: true } }
  ]

  // ---- a conversation: what MagicLib's memory keys say
  const st = newQuest('tsa_status', 'Test 27: bounty status', 'dialog')
  st.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == tsa_station'], optionText: 'Test 27, bounty status' }
  const offer = st.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 27: which bounties has MagicLib marked as succeeded?'
  offer.options = [{ id: 'check', text: 'Check' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  st.nodes.push(
    { id: 'br', type: 'branch', x: 520, y: 40, title: 'Succeeded?', cases: [
      { id: 'both', label: 'Both', conditions: ['$global.tsa_b_raiders_succeeded', '$global.tsa_b_hunt_succeeded'] },
      { id: 'raid', label: 'Raiders', conditions: ['$global.tsa_b_raiders_succeeded', '!$global.tsa_b_hunt_succeeded'] },
      { id: 'hunt', label: 'Hunt', conditions: ['$global.tsa_b_hunt_succeeded', '!$global.tsa_b_raiders_succeeded'] }
    ] },
    dlg('r_both', 760, 0, 'Both bounties succeeded (MagicLib set tsa_b_raiders_succeeded and tsa_b_hunt_succeeded).', [{ id: 'b1', text: 'Back' }]),
    dlg('r_raid', 760, 120, 'Only the raiders bounty succeeded (MagicLib set tsa_b_raiders_succeeded).', [{ id: 'b2', text: 'Back' }]),
    dlg('r_hunt', 760, 240, 'Only the hunt bounty succeeded (MagicLib set tsa_b_hunt_succeeded).', [{ id: 'b3', text: 'Back' }]),
    dlg('r_none', 760, 360, 'No bounty has succeeded yet.', [{ id: 'b4', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 1000, y: 100, mode: 'menu', target: '' }
  )
  st.edges.push(
    { id: 'e1', from: 'offer', handle: 'check', to: 'br' }, { id: 'e2', from: 'offer', handle: 'leave', to: 'menu' },
    { id: 'e3', from: 'br', handle: 'both', to: 'r_both' }, { id: 'e4', from: 'br', handle: 'raid', to: 'r_raid' },
    { id: 'e5', from: 'br', handle: 'hunt', to: 'r_hunt' }, { id: 'e6', from: 'br', handle: 'else', to: 'r_none' },
    { id: 'e7', from: 'r_both', handle: 'b1', to: 'offer' }, { id: 'e8', from: 'r_raid', handle: 'b2', to: 'offer' },
    { id: 'e9', from: 'r_hunt', handle: 'b3', to: 'offer' }, { id: 'e10', from: 'r_none', handle: 'b4', to: 'offer' }
  )
  m.quests.push(st)
  addTask59(m)
  addTask69(m)
  m.testProfiles.push({ id: 'tsa_go', name: '27: go to Test Range 27', quests: {}, flags: {}, player: { startAt: 'tsa_station', rep: { independent: 0.3 } } })
  return m
}

export const TWENTYSEVEN_A: TestModDef = {
  id: 'twentyseven_a', name: 'Saga Forge test #27: MagicLib bounties', prefix: 'tsa_', version: '1.2.0', gameVersion: TWENTYSEVEN_GAME,
  description: 'Throwaway test mod for Saga Forge tasks #27, #59 and #69: MagicLib bounties made from an encounter and a quest, a quest that starts one and reads its state, and quests that wait for a bounty to end. Needs SagaLib 1.3; MagicLib is optional (in its list). Dev mode: Ctrl+F9, profile 27.',
  model: bountyModel,
  // on purpose: #27's hunt shows the note for a criterion MagicLib can't use
  expectedWarnings: [/MagicLib bounty tsa_b_hunt \(location\): MagicLib can't: "Within N light-years"/]
}
