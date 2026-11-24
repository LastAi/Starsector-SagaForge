/**
 * Test mod for task #75 (commodity targets, PLAN.md §10.8): mods\seventyfive_a (prefix cta_), for
 * 0.98a (D:\Starsector, where Industrial.Evolution 4.1.b is); needs SagaLib 1.4. Industrial.Evolution
 * and AoTD Theory of Toolbox are listed as optional (ToT only to show the editor's note; its in-game
 * check needs ToT's starfarer.api.jar, a user-run step). Near "Test Range 75":
 *   cta_station   Range Control 75 (independent): the three delivery jobs are options there
 *   cta_haul      (a) vanilla goods, 0.1 economy units, a market short of it, legal there
 *   cta_parts     (b) a chosen list (IndEvo_parts, metals), 0.02 economy units × the market's size
 *   cta_fixed     (c) any economy commodity in surplus, 100 cargo units, credits ×2 in the reward
 * Each job: accept → the broker names the goods (tokens) → "(Test) load the goods" gives them →
 * Arrive at the market → hand over (disabled without the goods) or come back later. Repeatable.
 * In dev mode, Ctrl+F9 › "75: go to Test Range 75".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import type { ActionNode, DialogNode, QuestPlan, TargetDef } from '../../src/shared/model'
import { dlg, type TestModDef } from './testmod'

export const SEVENTYFIVE_GAME = '0.98a-RC8'

const AT = ['$id == cta_station']

/** What the game index knows (when built without the game): IndEvo's commodity, for the chosen list. */
export const SEVENTYFIVE_INDEX = {
  sources: [{ id: 'starsector-core', name: 'Starsector', isCore: true }, { id: 'IndEvo', name: 'Industrial.Evolution' }, { id: 'aotd_theory_of_toolbox', name: 'AoTD - Theory of Toolbox' }],
  items: [{ id: 'IndEvo_parts', name: 'Ship Components', kind: 'commodity', icon: '', tags: [], basePrice: 120, desc: '', econUnit: 300, definedBy: 'IndEvo', changedBy: [] }]
}

/** A delivery job: option at Range Control 75 → stage (marker = the market) → Arrive there → hand over. */
function job(id: string, title: string, label: string, target: TargetDef, reward: QuestPlan['rewards'][number], extra: string): QuestPlan {
  const q = newQuest(id, `Test 75 - ${title}`, 'quest')
  const v = (f: string) => `$global.${id}_goods${f ? `_${f}` : ''}`
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: AT, optionText: `Test 75 (${label}), delivery job - ${title}` }
  // repeatable: each run searches again (several picks in one game)
  q.repeatable = true
  q.variables.push({ name: 'goods', type: 'target', scope: 'quest', initial: '', target })
  q.stages = [{ id: 'go', title: 'Deliver the goods', journal: `Test #75 (${label}): deliver ${v('amount')} ${v('commodity')} (${v('commodityId')}) to ${v('name')} in ${v('system')}, ${v('dist')} light-years away. Worth ${v('value')} credits at base price (${v('basePrice')} each).`, marker: 'target:goods', kind: 'normal', renamedFrom: [] }]
  q.rewards = [reward]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = `Test 75 (${label}): "I have a delivery job for you." (${title}. SagaLib picks the commodity and the market when you accept; ${extra})`
  const brief = dlg('brief', 660, 40, `Test 75 (${label}): "Take ${v('amount')} ${v('commodity')} to ${v('name')} (${v('faction')}, ${v('system')}). That's ${v('value')} credits of goods." Tokens: commodity "${v('commodity')}", id "${v('commodityId')}", amount ${v('amount')}, base price ${v('basePrice')}, value ${v('value')}, market id ${v('')}.`,
    [{ id: 'load', text: '(Test) Load the goods into my hold' }, { id: 'go', text: 'On my way' }])
  const there = dlg('handover', 1000, 40, `Test 75 (${label}): the dockmaster at ${v('name')} checks the manifest for ${v('amount')} ${v('commodity')}.`,
    [{ id: 'give', text: 'Hand over the goods' }, { id: 'later', text: 'Come back later' }])
  // the cargo check: the option is shown but disabled without the goods
  there.options[0].disabledIf = [`!SF_TargetCommodity ${id} goods has`]
  there.options[0].tooltip = 'Needs the goods in your cargo.'
  q.nodes.push(
    { id: 'st', type: 'stage', x: 520, y: 40, stage: 'go' },
    brief,
    { id: 'loadIt', type: 'action', x: 660, y: 200, ops: [{ op: 'targetCargo', target: 'goods', do: 'give' }] } as ActionNode,
    { id: 'arrive', type: 'wait', x: 880, y: 40, mode: 'arrive', entity: 'target:goods', optionText: `Test 75 (${label}) - deliver the goods` },
    there,
    { id: 'take', type: 'action', x: 1140, y: 0, ops: [{ op: 'targetCargo', target: 'goods', do: 'take' }, { op: 'unset', key: `$global.${id}_arrive_done` }] } as ActionNode,
    { id: 'end', type: 'end', x: 1280, y: 0, outcome: 'success', reward: reward.id },
    { id: 'menu2', type: 'link', x: 1420, y: 0, mode: 'menu', target: '' },
    // Arrive nodes run once: coming back later re-arms it
    { id: 'rearm', type: 'action', x: 1140, y: 140, ops: [{ op: 'unset', key: `$global.${id}_arrive_done` }] } as ActionNode,
    { id: 'menu3', type: 'link', x: 1280, y: 140, mode: 'menu', target: '' },
    { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'brief' },
    { id: 'c1', from: 'brief', handle: 'load', to: 'loadIt' }, { id: 'c2', from: 'loadIt', handle: 'next', to: 'arrive' }, { id: 'c3', from: 'brief', handle: 'go', to: 'arrive' },
    { id: 'd', from: 'arrive', handle: 'next', to: 'handover' },
    { id: 'e1', from: 'handover', handle: 'give', to: 'take' }, { id: 'e2', from: 'take', handle: 'next', to: 'end' }, { id: 'e3', from: 'end', handle: 'next', to: 'menu2' },
    { id: 'f1', from: 'handover', handle: 'later', to: 'rearm' }, { id: 'f2', from: 'rearm', handle: 'next', to: 'menu3' },
    { id: 'g', from: 'offer', handle: 'decline', to: 'no' }
  )
  return q
}

export const SEVENTYFIVE_A: TestModDef = {
  id: 'seventyfive_a', name: 'Saga Forge test #75: commodity targets', prefix: 'cta_', version: '1.0.0', gameVersion: SEVENTYFIVE_GAME,
  indexStub: SEVENTYFIVE_INDEX,
  description: 'Throwaway test mod for Saga Forge task #75: delivery jobs with a commodity at a market as the random target. Industrial.Evolution optional. Dev mode: Ctrl+F9, profile 75.',
  model() {
    const m = emptyModel('cta_')
    m.project.mods = [
      { id: 'IndEvo', name: 'Industrial.Evolution', use: 'optional' },
      { id: 'aotd_theory_of_toolbox', name: 'AoTD - Theory of Toolbox', use: 'optional' }
    ]

    // ---- Test Range 75
    const sys = newSystem('cta_range', 'Test Range 75', -2500, -1750)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'cta_station', 'Range Control 75', 'star', 2000, 0)
    station.market = { ...newMarket('cta_station', 'Range Control 75', 'independent'), size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'] }
    sys.entities.push(station, newEntity('jumpPoint', 'cta_jp', 'Test Range 75 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)

    // (a) vanilla goods (the default), a legal one the market is short of, not crew or marines, nothing military
    // (supplies and fuel: the test profile gives some, which would pass the cargo check), at a size 4+ colony not hostile to the player
    m.quests.push(job('cta_haul', 'vanilla goods', 'a', {
      pick: 'commodity',
      require: [{ id: 'cmShort', args: [] }, { id: 'cmLegal', args: [] }, { id: 'cmNotPersonnel', args: [] }, { id: 'cmTags', args: ['NOT_ANY', ['military']] }, { id: 'mkSizeAtLeast', args: [4] }, { id: 'mkNotHidden', args: [] }, { id: 'mkNotHostileTo', args: ['player'] }],
      prefer: [{ id: 'cmTags', args: ['ANY', ['expensive']] }],
      commodity: { which: 'vanilla', amount: { unit: 'econ', n: 0.1 } }, mock: { name: 'Port Mock', commodity: 'food', size: 5 }
    }, { id: 'pay', credits: 1000, targetCredits: { var: 'goods', mult: 1.5 } }, 'pay: 1,000 + 1.5 × the goods\' value'))

    // (b) a chosen list with another mod's commodity (Industrial.Evolution's ship components), × the market's size
    m.quests.push(job('cta_parts', 'IndEvo parts or metals', 'b', {
      pick: 'commodity',
      require: [{ id: 'cmLegal', args: [] }, { id: 'mkNotHidden', args: [] }, { id: 'mkNotHostileTo', args: ['player'] }],
      prefer: [{ id: 'cmShort', args: [] }],
      commodity: { which: 'list', ids: ['IndEvo_parts', 'metals'], amount: { unit: 'econ', n: 0.02, perSize: true } }, mock: { name: 'Forge Mock', commodity: 'metals', size: 6 }
    }, { id: 'pay', targetCredits: { var: 'goods', mult: 1 } }, 'ship components only with Industrial.Evolution; 0.02 economy units × the market\'s size; pay: the goods\' value'))

    // (c) any economy commodity with a surplus there and some in stock, a fixed 100 cargo units
    m.quests.push(job('cta_fixed', 'any commodity in surplus', 'c', {
      pick: 'commodity',
      require: [{ id: 'cmSurplus', args: [] }, { id: 'cmInStock', args: [1] }, { id: 'mkNotHidden', args: [] }, { id: 'mkNotHostileTo', args: ['player'] }],
      prefer: [{ id: 'cmProduced', args: [] }],
      commodity: { which: 'any', amount: { unit: 'cargo', n: 100 } }, mock: { name: 'Surplus Mock', size: 4 }
    }, { id: 'pay', credits: 500, targetCredits: { var: 'goods', mult: 2 } }, 'any economy commodity, 100 cargo units; pay: 500 + 2 × the goods\' value'))

    // (e) AoTD ToT's units: the goods ToT re-units (food ×0.1, rare_metals ×10, domestic_goods ×0.25, crew ×5),
    // no shortage needed (with ToT, markets are seldom short of anything but lobster; found in game)
    m.quests.push(job('cta_units', 'economy units (ToT)', 'e', {
      pick: 'commodity',
      require: [{ id: 'cmLegal', args: [] }, { id: 'mkNotHidden', args: [] }, { id: 'mkNotHostileTo', args: ['player'] }],
      prefer: [],
      commodity: { which: 'list', ids: ['food', 'rare_metals', 'domestic_goods', 'crew'], amount: { unit: 'econ', n: 0.1 } }, mock: { name: 'Units Mock', commodity: 'food', size: 5 }
    }, { id: 'pay', targetCredits: { var: 'goods', mult: 1 } }, '0.1 economy units of food, transplutonics, domestic goods or crew: vanilla 200 / 20 / 100 / 50, AoTD ToT 20 / 200 / 25 / 250; pay: the goods\' value'))

    m.testProfiles.push({ id: 'cta_go', name: '75: go to Test Range 75', quests: {}, flags: {}, player: { startAt: 'cta_station', credits: 500000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 500 }] } })
    return m
  }
}
