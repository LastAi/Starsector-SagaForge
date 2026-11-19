/**
 * Test mod for task #65 (Nexerelin quest skip, MagicLib achievements): mods\sixtyfive_a (prefix sfv_),
 * for the 0.98a install (where Nexerelin 0.12.2d and MagicLib 1.5.6 are). Both stay optional.
 * Near "Test Range 65", at Waypoint 65:
 *   sfv_first   "Test 65: the first job" (option start). Accept, then Help (sets $global.sfv_first_helped,
 *               +500 XP, ends in success with the reward "pay" = 5,000 credits and unlocks the
 *               achievement sfv_first_done) or Refuse (ends in failure).
 *   sfv_second  "Test 65: the second job": needs the first job ended in success; ends in success and
 *               unlocks the hidden achievement sfv_second_done.
 *   sfv_status  "Test 65, check the skip": the first job's state, its flag, whether SagaLib saw it
 *               skipped, and the second job's state.
 * Saga › Quest skip: the chain sfv_chain "Test 65" with both jobs; a skip of the first means "Help".
 * Quest icons of the mod's own (follow-up, 2026-11-19: SagaLib loads a quest's icon before the game draws it):
 *   sfv_icon_option   "Test 65: icon, option start" (option at Waypoint 65), icon graphics/icons/missions/sfv_icon_option.png (red)
 *   sfv_icon_contact  "Test 65: icon, contact start" offered by Ada Kell (sfv_ada, comm directory), icon
 *                     graphics/icons/missions/sfv_icon_contact.png (blue). Both stay active (their journal entry
 *                     shows the icon) until "Test 65 - finish the icon jobs".
 *   The two PNGs are binary, so the build doesn't write them: make them with
 *   node scripts/make-test-art.mjs <dir> <color> and copy icon_box.png (INGAME-CHECKS "Task #65", icons).
 * In dev mode, Ctrl+F9 › "65: go to Test Range 65".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import type { DialogNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SIXTYFIVE_GAME = '0.98a-RC8'

const AT = ['$id == sfv_station']

/** The first job: two endings, a flag and XP on the way to the success. */
function firstQuest(): QuestPlan {
  const q = newQuest('sfv_first', 'Test 65: the first job', 'quest')
  q.icon = 'graphics/icons/missions/data_retrieval.png'
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 65 - the first job' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 65 (b): the first job. Help ends it in success (a flag, 500 XP, 5,000 credits and the achievement "Test 65: first job done"); Refuse ends it in failure.'
  q.stages = [
    { id: 'go', title: 'Decide', journal: 'Test #65: help or refuse, at Waypoint 65.', kind: 'normal', renamedFrom: [] },
    { id: 'done', title: 'Done', journal: 'Test #65: the first job is done.', kind: 'normal', renamedFrom: [] }
  ]
  q.rewards = [{ id: 'pay', credits: 5000 }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    dlg('choice', 760, 40, 'Test 65 (b): help, or refuse?', [{ id: 'help', text: 'Test 65 - help' }, { id: 'refuse', text: 'Test 65 - refuse' }]),
    { id: 'helped', type: 'action', x: 1000, y: -20, title: 'Helped', ops: [{ op: 'set', key: '$global.sfv_first_helped', value: 'true' }, { op: 'xp', amount: 500 }] },
    { id: 'st2', type: 'stage', x: 1160, y: -20, stage: 'done' },
    { id: 'won', type: 'end', x: 1320, y: -20, outcome: 'success', reward: 'pay', achievement: 'sfv_first_done' },
    { id: 'lost', type: 'end', x: 1000, y: 140, outcome: 'fail' },
    dlg('after', 1480, 40, "Test 65 (b): the first job ended. After Help, MagicLib's notice above says the achievement was unlocked; after Refuse there is none.", [{ id: 'close', text: 'Leave', shortcut: 'ESC' }]),
    { id: 'menu', type: 'link', x: 1640, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'choice' },
    { id: 'c', from: 'choice', handle: 'help', to: 'helped' }, { id: 'c2', from: 'helped', handle: 'next', to: 'st2' }, { id: 'c3', from: 'st2', handle: 'next', to: 'won' },
    { id: 'd', from: 'choice', handle: 'refuse', to: 'lost' },
    { id: 'e', from: 'won', handle: 'next', to: 'after' }, { id: 'f', from: 'lost', handle: 'next', to: 'after' }, { id: 'g', from: 'after', handle: 'close', to: 'menu' },
    { id: 'h', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** The second job: offered only once the first ended in success (played or skipped). */
function secondQuest(): QuestPlan {
  const q = newQuest('sfv_second', 'Test 65: the second job', 'quest')
  q.icon = 'graphics/icons/missions/data_retrieval.png'
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 65 - the second job' }
  q.requires = [{ quest: 'sfv_first', ended: 'success' }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 65 (b, c): the second job, offered because the first one ended in success. Helped in the first job: $global.sfv_first_helped.'
  q.stages = [{ id: 'go', title: 'Finish', journal: 'Test #65: finish the second job.', kind: 'normal', renamedFrom: [] }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'won', type: 'end', x: 760, y: 40, outcome: 'success', achievement: 'sfv_second_done' },
    dlg('after', 1000, 40, 'Test 65: the second job is done (and its hidden achievement unlocked, with MagicLib).', [{ id: 'close', text: 'Leave', shortcut: 'ESC' }]),
    { id: 'menu', type: 'link', x: 1240, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'won' },
    { id: 'c', from: 'won', handle: 'next', to: 'after' }, { id: 'd', from: 'after', handle: 'close', to: 'menu' },
    { id: 'e', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** Follow-up: a quest with the mod's own icon; it stays active until the finish option. */
function iconQuest(id: string, title: string, icon: string, start: QuestPlan['start'], what: string): QuestPlan {
  const q = newQuest(id, title, 'quest')
  q.icon = icon
  q.start = start
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = `Test 65 (icons): ${what} The lines below (Accepted, the stage) and its journal entry in the intel screen show its own icon, a ${icon.includes('option') ? 'red' : 'blue'} square, not a blank one.`
  q.stages = [{ id: 'go', title: 'Look at the icon', journal: "Test #65: look at this entry's icon in the intel list.", kind: 'normal', renamedFrom: [] }]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'there', type: 'wait', x: 760, y: 160, mode: 'arrive', entity: 'sfv_station', takeover: false, optionText: 'Test 65 - finish the icon jobs', arriveText: `Test 65 (icons): ${title} is done.` },
    { id: 'won', type: 'end', x: 1000, y: 160, outcome: 'success' },
    { id: 'menu2', type: 'link', x: 1240, y: 160, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'there' },
    { id: 'c', from: 'there', handle: 'next', to: 'won' }, { id: 'd', from: 'won', handle: 'next', to: 'menu2' },
    { id: 'e', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

/** (c): what a skip left in memory. */
function statusDialog(): QuestPlan {
  const q = newQuest('sfv_status', 'Test 65: check the skip', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 65, check the skip' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 65 (c): first job: $global.sfv_first_state, step $global.sfv_first_step, helped $global.sfv_first_helped, completed key $global.sfv_first_missionCompleted, skipped through Nexerelin $global.sagaforge_skipped_sfv_first. Second job: $global.sfv_second_state.'
  offer.options = [{ id: 'done', text: 'Ask whether the first job is done' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'br', type: 'branch', x: 520, y: 40, title: 'Done?', cases: [{ id: 'yes', label: 'Done (success)', conditions: ['SF_QuestDone sfv_first success'] }] },
    dlg('isDone', 760, 0, 'Test 65 (c): SF_QuestDone sfv_first success is true.', [{ id: 'back1', text: 'Back' }]),
    dlg('notDone', 760, 120, 'Test 65 (c): SF_QuestDone sfv_first success is false.', [{ id: 'back2', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 1000, y: 60, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'e1', from: 'offer', handle: 'done', to: 'br' }, { id: 'e2', from: 'offer', handle: 'leave', to: 'menu' },
    { id: 'e3', from: 'br', handle: 'yes', to: 'isDone' }, { id: 'e4', from: 'br', handle: 'else', to: 'notDone' },
    { id: 'e5', from: 'isDone', handle: 'back1', to: 'offer' }, { id: 'e6', from: 'notDone', handle: 'back2', to: 'offer' }
  )
  return q
}

export const SIXTYFIVE_A: TestModDef = {
  id: 'sixtyfive_a', name: 'Saga Forge test #65: quest skip and achievements', prefix: 'sfv_', version: '1.0.0', gameVersion: SIXTYFIVE_GAME,
  description: 'Throwaway test mod for Saga Forge task #65: two chained quests on Nexerelin\'s skip quests screen, and MagicLib achievements at their endings. Nexerelin and MagicLib optional. Dev mode: Ctrl+F9, profile 65.',
  model() {
    const m = emptyModel('sfv_')
    // optional (Saga › Mods): never in mod_info.json
    m.project.mods = [{ id: 'nexerelin', name: 'Nexerelin', use: 'optional' }, { id: 'MagicLib', name: 'MagicLib', use: 'optional' }]
    m.project.achievements = [
      { id: 'sfv_first_done', name: 'Test 65: first job done', description: 'Finished the first test job.', tooltip: 'Saga Forge task #65 test achievement.', image: 'graphics/icons/missions/data_retrieval.png', spoiler: 'VISIBLE', rarity: 'COMMON' },
      { id: 'sfv_second_done', name: 'Test 65: second job done', description: 'Finished the second test job.', spoiler: 'HIDDEN', rarity: 'RARE' }
    ]
    m.project.questSkip = [{
      id: 'sfv_chain', name: 'Test 65', image: 'graphics/icons/missions/data_retrieval.png', sortKey: 'ZZZZ_test65', tooltip: 'Saga Forge task #65: two test jobs at Waypoint 65.',
      quests: [
        { quest: 'sfv_first', name: 'Test 65: first', tooltip: 'The player helped at Waypoint 65 (success; 5,000 credits and 500 XP).', ending: 'won' },
        { quest: 'sfv_second', name: 'Test 65: second', tooltip: 'The player finished the second job.', ending: 'won' }
      ]
    }]

    // ---- Test Range 65
    const sys = newSystem('sfv_range', 'Test Range 65', 26000, -8000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sfv_station', 'Waypoint 65', 'star', 2000, 0)
    station.market = { ...newMarket('sfv_station', 'Waypoint 65', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], people: [] }
    sys.entities.push(station, newEntity('jumpPoint', 'sfv_jp', 'Test Range 65 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    m.quests.push(firstQuest(), secondQuest(), statusDialog())
    // follow-up: quest icons of the mod's own (an option start: no CSV row; a contact start: person_missions.csv)
    m.people.push({
      id: 'sfv_ada', name: { first: 'Ada', last: 'Kell' }, gender: 'FEMALE', faction: 'independent', rank: 'citizen', post: 'agent',
      portrait: 'graphics/portraits/portrait_mercenary02.png', placement: { at: 'market', market: 'sfv_station', inCommDirectory: true },
      contact: { types: ['trade'], importance: 'MEDIUM' }, tags: [], phrases: []
    })
    m.quests.push(
      iconQuest('sfv_icon_option', 'Test 65: icon, option start', 'graphics/icons/missions/sfv_icon_option.png', { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 65 - the icon job (option start)' }, 'an option start (no person_missions.csv row).'),
      iconQuest('sfv_icon_contact', 'Test 65: icon, contact start', 'graphics/icons/missions/sfv_icon_contact.png', { kind: 'contact', person: 'sfv_ada', freq: 1000 }, 'a contact start (its icon is also in person_missions.csv).')
    )
    m.testProfiles.push({ id: 'sfv_go', name: '65: go to Test Range 65', quests: {}, flags: {}, player: { startAt: 'sfv_station', credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } })
    return m
  }
}
