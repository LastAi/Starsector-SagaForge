/**
 * Test mod for task #62 (a LunaLib settings page for the mod): mods\sixtytwo_a (prefix sta_), for the
 * 0.98a install (where LunaLib 2.0.5 is). LunaLib stays optional. Its page "Saga Forge test #62":
 *   sta_side_job   on/off "Enable the courier job" (on): a prerequisite of the courier job, so the
 *                  job's option at Waypoint 62 shows only while it is on.
 *   sta_difficulty choice Easy / Normal / Hard (Normal): the raiders' fleet size (× 0.5 / 1 / 2.5)
 *                  and the courier's pay (× 0.5 / 1 / 2).
 *   sta_bonus      whole number "Bonus pay (percent)" 0–300 (100): scales the 1,000-credit bonus.
 * Near "Test Range 62":
 *   sta_station    Waypoint 62: "Test 62, check the settings" (the values SagaLib set, a Branch on
 *                  the difficulty and on the bonus) and the courier job (option start).
 *   sta_drop       Drop 62: where the courier job ends.
 *   sta_raiders    pirates, 40 fleet points by the doctrine, spawned at Waypoint 62 while the job runs.
 * In dev mode, Ctrl+F9 › "62: go to Test Range 62".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newEncounter } from '../../src/shared/encounters'
import type { DialogNode, QuestPlan } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SIXTYTWO_GAME = '0.98a-RC8'

const AT = ['$id == sta_station']
const DIFF = { Easy: 0.5, Normal: 1, Hard: 2 }

/** (a), (b): the courier job, offered at Waypoint 62 while "Enable the courier job" is on. */
function courierQuest(): QuestPlan {
  const q = newQuest('sta_courier', 'Test 62: the courier job', 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 62 - the courier job' }
  q.requires = [{ flag: '$global.sta_side_job' }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 62 (a, b): a courier job to Drop 62. Raiders wait outside; their size and the pay follow the difficulty setting ($global.sta_difficulty). The bonus follows the bonus setting: that percent of 1,000 credits.'
  q.stages = [{ id: 'go', title: 'Deliver the parcel', journal: 'Test #62: carry the parcel to Drop 62. The raiders at Waypoint 62 are sized by the difficulty setting.', marker: 'sta_drop', kind: 'normal', renamedFrom: [] }]
  q.rewards = [
    { id: 'pay', credits: 10000, creditsScale: { setting: 'sta_difficulty', factors: { ...DIFF } } },
    { id: 'bonus', credits: 1000, creditsScale: { setting: 'sta_bonus' } }
  ]
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    { id: 'there', type: 'wait', x: 840, y: 40, mode: 'arrive', entity: 'sta_drop', takeover: true, optionText: 'Test 62 - deliver the parcel', arriveText: 'Test 62 (b): you deliver the parcel. Pay: 10,000 credits scaled by the difficulty (Easy 5,000 / Normal 10,000 / Hard 20,000), then the bonus: 1,000 credits x the bonus percent.' },
    { id: 'bonusAct', type: 'action', x: 1000, y: 40, title: 'Bonus', ops: [{ op: 'reward', reward: 'bonus' }] },
    { id: 'end', type: 'end', x: 1160, y: 40, outcome: 'success', reward: 'pay' },
    dlg('paid', 1240, 40, 'Test 62 (b): the parcel is delivered. The lines above show the bonus and the pay.', [{ id: 'close', text: 'Leave', shortcut: 'ESC' }]),
    { id: 'menu', type: 'link', x: 1320, y: 40, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'there' },
    { id: 'c', from: 'there', handle: 'next', to: 'bonusAct' },
    { id: 'c2', from: 'bonusAct', handle: 'next', to: 'end' }, { id: 'd', from: 'end', handle: 'next', to: 'paid' }, { id: 'd2', from: 'paid', handle: 'close', to: 'menu' },
    { id: 'e', from: 'offer', handle: 'decline', to: 'no' }
  )
  q.repeatable = true
  return q
}

/** (a), (c): the values SagaLib set, and Branches on the choice and the number. */
function statusDialog(): QuestPlan {
  const q = newQuest('sta_status', 'Test 62: check the settings', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: 'Test 62, check the settings' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 62 (a, c): SagaLib set these on load (LunaLib: the menu\'s values; without LunaLib: the defaults true, Normal, 100).\n\nCourier job enabled: $global.sta_side_job. Difficulty: $global.sta_difficulty. (Ask about the bonus: a Branch on the percent.)'
  offer.options = [{ id: 'diff', text: 'Ask about the difficulty' }, { id: 'bonus', text: 'Ask about the bonus' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'brd', type: 'branch', x: 520, y: 0, title: 'Difficulty', cases: [
      { id: 'hard', label: 'Hard', conditions: ['$global.sta_difficulty == Hard'] },
      { id: 'easy', label: 'Easy', conditions: ['$global.sta_difficulty == Easy'] }
    ] },
    dlg('isHard', 760, -80, 'Test 62: the Branch says Hard (raiders x 2.5, pay x 2).', [{ id: 'back1', text: 'Back' }]),
    dlg('isEasy', 760, 40, 'Test 62: the Branch says Easy (raiders x 0.5, pay x 0.5).', [{ id: 'back2', text: 'Back' }]),
    dlg('isNormal', 760, 160, 'Test 62: the Branch says Normal (raiders and pay as made).', [{ id: 'back3', text: 'Back' }]),
    { id: 'brb', type: 'branch', x: 520, y: 300, title: 'Bonus', cases: [{ id: 'big', label: 'At least 150%', conditions: ['$global.sta_bonus >= 150'] }] },
    dlg('bigBonus', 760, 280, 'Test 62: the bonus is at least 150 percent.', [{ id: 'back4', text: 'Back' }]),
    dlg('smallBonus', 760, 400, 'Test 62: the bonus is below 150 percent.', [{ id: 'back5', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 1000, y: 160, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'e1', from: 'offer', handle: 'diff', to: 'brd' }, { id: 'e2', from: 'offer', handle: 'bonus', to: 'brb' }, { id: 'e3', from: 'offer', handle: 'leave', to: 'menu' },
    { id: 'e4', from: 'brd', handle: 'hard', to: 'isHard' }, { id: 'e5', from: 'brd', handle: 'easy', to: 'isEasy' }, { id: 'e6', from: 'brd', handle: 'else', to: 'isNormal' },
    { id: 'e7', from: 'brb', handle: 'big', to: 'bigBonus' }, { id: 'e8', from: 'brb', handle: 'else', to: 'smallBonus' },
    ...['isHard', 'isEasy', 'isNormal', 'bigBonus', 'smallBonus'].map((n, i) => ({ id: `bk${i}`, from: n, handle: `back${i + 1}`, to: 'offer' }))
  )
  return q
}

export const SIXTYTWO_A: TestModDef = {
  id: 'sixtytwo_a', name: 'Saga Forge test #62: LunaLib settings', prefix: 'sta_', version: '1.0.0', gameVersion: SIXTYTWO_GAME,
  description: 'Throwaway test mod for Saga Forge task #62: a LunaLib settings page (an on/off, a choice and a whole number) read by quests, a fleet size and rewards. LunaLib optional. Dev mode: Ctrl+F9, profile 62.',
  model() {
    const m = emptyModel('sta_')
    // optional (Saga › Mods): never in mod_info.json; without LunaLib the defaults apply
    m.project.mods = [{ id: 'lunalib', name: 'LunaLib', use: 'optional' }]
    m.project.settings = [
      { id: 'sta_h_story', label: 'Test 62 story options', type: 'Header', default: '' },
      { id: 'sta_side_job', label: 'Enable the courier job', tooltip: 'Test 62 (a): while on, Waypoint 62 offers the courier job.', type: 'Boolean', default: 'true' },
      { id: 'sta_difficulty', label: 'Difficulty', tooltip: 'Test 62 (b): the raiders\' size (Easy x 0.5, Hard x 2.5) and the courier\'s pay (Easy x 0.5, Hard x 2).', type: 'Radio', default: 'Normal', choices: ['Easy', 'Normal', 'Hard'] },
      { id: 'sta_bonus', label: 'Bonus pay (percent)', tooltip: 'Test 62 (b): the courier\'s 1,000-credit bonus, in percent.', type: 'Int', default: '100', min: 0, max: 300 },
      { id: 'sta_note', label: 'These settings are shared by every save.', type: 'Text', default: '' }
    ]

    // ---- Test Range 62
    const sys = newSystem('sta_range', 'Test Range 62', 21000, -11000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'sta_station', 'Waypoint 62', 'star', 2000, 0)
    station.market = { ...newMarket('sta_station', 'Waypoint 62', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], people: [] }
    const drop = newEntity('station', 'sta_drop', 'Drop 62', 'star', 3400, 150)
    sys.entities.push(station, drop, newEntity('jumpPoint', 'sta_jp', 'Test Range 62 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    // ---- the raiders: 40 points by the doctrine, scaled by the difficulty
    const raiders = newEncounter('sta_raiders', 'Test 62 raiders', 'pirates')
    raiders.fleet = { faction: 'pirates', type: 'patrolMedium', size: 'fp', points: 40, quality: 0.5, name: 'Test 62 Raiders', sizeScale: { setting: 'sta_difficulty', factors: { Easy: 0.5, Normal: 1, Hard: 2.5 } } }
    raiders.spawn = { at: 'sta_station', when: 'quest-stage', quest: 'sta_courier', stage: 'go', despawnOnStageEnd: true }
    raiders.behavior = 'patrol'
    raiders.flags = { hostile: true, important: true, allowDisengage: true }
    m.encounters.push(raiders)

    m.quests.push(courierQuest(), statusDialog())
    m.testProfiles.push({ id: 'sta_go', name: '62: go to Test Range 62', quests: {}, flags: {}, player: { startAt: 'sta_station', credits: 100000, rep: { pirates: 0 }, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } })
    return m
  }
}
