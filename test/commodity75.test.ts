/**
 * #75 (PLAN.md §10.8): commodity targets. The criteria map to vanilla's HubMissionWithSearch
 * commodity methods (yes/no only; no demand thresholds), amounts come from econUnit, the tokens
 * Play sets match SagaLib's (golden commodity.json covers both), the "vanilla goods" default is
 * vanilla's commodities.csv, and the export, checks and mod uses know the new kind.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { allowedCommodities, atMarket, cargoUnits, commodityFacts, commodityValue, CRITERIA, criteriaFor, runtimeTargets, VANILLA_GOODS } from '../src/shared/targets'
import { newQuest } from '../src/shared/quest'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { needsSagaLib14, questRuntime } from '../src/shared/export/runtime'
import { targetProblems } from '../src/shared/checks/quests'
import { effectiveConds, questRefs } from '../src/shared/moduses'
import type { GameIndex } from '../src/shared/api'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { applyMockTargets, applyReward, mockCommodity, newSimState, sagaHooks, type SimWorld } from '../src/shared/play'
import { emptyModel } from '../src/shared/serialize'
import { parseCsvRecords } from '../src/shared/csvedit'
import type { ActionNode, DialogNode, QuestPlan } from '../src/shared/model'

const API = path.resolve(__dirname, '..', '..', '..', '.cache', 'api-old', 'com', 'fs', 'starfarer', 'api', 'impl', 'campaign', 'missions', 'hub', 'HubMissionWithSearch.java')
const SEARCH = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'src', 'lastai', 'sagalib', 'quest', 'TargetSearch.java')
const COMMODITIES = 'D:/Starsector/starsector-core/data/campaign/commodities.csv'
const COMMODITIES_JAVA = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'src', 'lastai', 'sagalib', 'core', 'Commodities.java')

const cm = CRITERIA.filter((c) => c.group === 'commodity')

describe('criteria', () => {
  it('offers the commodity criteria (and the market ones) only for a commodity pick', () => {
    expect(cm.length).toBe(13)
    expect(criteriaFor('commodity').map((c) => c.group).every((g) => g === 'market' || g === 'commodity')).toBe(true)
    expect(criteriaFor('commodity').filter((c) => c.group === 'market').length).toBe(criteriaFor('market').length)
    for (const p of ['system', 'planet', 'entity', 'market'] as const) expect(criteriaFor(p).some((c) => c.group === 'commodity')).toBe(false)
  })

  it('has no demand thresholds, and production / shortage / surplus only as yes or no', () => {
    const methods = cm.flatMap((c) => [c.req, c.pref]).filter(Boolean) as string[]
    expect(methods.some((x) => /Demand/.test(x))).toBe(false)
    for (const c of cm.filter((x) => /Production|Deficit|Surplus/.test(x.req ?? ''))) expect(c.args, c.id).toEqual([])
  })

  it.skipIf(!fs.existsSync(API))('names commodity methods vanilla 0.98a has', () => {
    const src = fs.readFileSync(API, 'utf8')
    for (const c of cm) for (const mth of [c.req, c.pref]) if (mth) expect(src, mth).toMatch(new RegExp(`public void ${mth}\\(`))
    expect(src).toMatch(/public SearchData getSearch\(\)/)
    expect(src).toMatch(/public CommodityOnMarketAPI pickCommodity\(\)/)
  })

  it.skipIf(!fs.existsSync(SEARCH))('maps yes to AtLeast(1) and no to AtMost(0) in SagaLib', () => {
    const src = fs.readFileSync(SEARCH, 'utf8')
    for (const [id, mth, n] of [['cmProduced', 'CommodityProductionAtLeast', 1], ['cmNotProduced', 'CommodityProductionAtMost', 0], ['cmShort', 'CommodityDeficitAtLeast', 1], ['cmNotShort', 'CommodityDeficitAtMost', 0], ['cmSurplus', 'CommoditySurplusAtLeast', 1], ['cmNoSurplus', 'CommoditySurplusAtMost', 0]] as const) {
      const line = src.split('\n').find((l) => l.includes(`"${id}".equals(id)`)) ?? ''
      expect(line, id).toContain(`m.require${mth}(${n})`)
      expect(line, id).toContain(`m.prefer${mth}(${n})`)
    }
  })
})

describe('which commodities and how much', () => {
  it('defaults to vanilla\'s 18 trade goods, the same list as SagaLib', () => {
    const t = { pick: 'commodity' as const, require: [], prefer: [] }
    expect(allowedCommodities(t)).toEqual([...VANILLA_GOODS])
    expect(VANILLA_GOODS.length).toBe(18)
    expect(allowedCommodities({ ...t, commodity: { which: 'any', amount: { unit: 'econ', n: 1 } } })).toBeNull()
    expect(allowedCommodities({ ...t, commodity: { which: 'list', ids: ['IndEvo_parts'], amount: { unit: 'econ', n: 1 } } })).toEqual(['IndEvo_parts'])
    if (fs.existsSync(COMMODITIES_JAVA)) {
      const java = fs.readFileSync(COMMODITIES_JAVA, 'utf8')
      const block = java.slice(java.indexOf('VANILLA_GOODS ='), java.indexOf('));', java.indexOf('VANILLA_GOODS =')))
      expect([...block.matchAll(/"(\w+)"/g)].map((m) => m[1])).toEqual([...VANILLA_GOODS])
    }
  })

  it.skipIf(!fs.existsSync(COMMODITIES))('is every vanilla economy commodity that isn\'t nonecon or meta', () => {
    const recs = parseCsvRecords(fs.readFileSync(COMMODITIES, 'utf8'))
    const head = recs[0].fields.map((f) => f.trim())
    const id = head.indexOf('id'), tags = head.indexOf('tags')
    const econ = recs.slice(1).map((r) => ({ id: (r.fields[id] ?? '').trim(), tags: (r.fields[tags] ?? '').split(',').map((x) => x.trim()) }))
      .filter((r) => r.id && !r.id.startsWith('#') && !r.tags.includes('nonecon') && !r.tags.includes('meta')).map((r) => r.id)
    expect([...econ].sort()).toEqual([...VANILLA_GOODS].sort())
  })

  it('turns economy units into cargo units with econUnit (vanilla\'s or ToT\'s), × size, or fixed', () => {
    const econ = { unit: 'econ' as const, n: 0.1 }
    expect(cargoUnits(econ, 2000, 5)).toBe(200) // vanilla food
    expect(cargoUnits(econ, 200, 5)).toBe(20) // AoTD ToT food (×0.1)
    expect(cargoUnits(econ, 2000, 5)).toBe(cargoUnits(econ, 2000, 9)) // size only with perSize
    expect(cargoUnits({ ...econ, perSize: true }, 2000, 6)).toBe(1200)
    expect(cargoUnits({ unit: 'cargo', n: 75, perSize: true }, 2000, 6)).toBe(75)
    expect(cargoUnits(econ, 5, 1)).toBe(1) // 0.5 rounds up
    expect(cargoUnits(econ, 1, 1)).toBe(1) // at least 1
    expect(cargoUnits(econ, 25, 1)).toBe(3)
    expect(commodityValue(100.4, 50)).toBe(5020)
  })
})

function delivery(): QuestPlan {
  const q = newQuest('sfc_haul', 'Haul', 'quest')
  q.start = { kind: 'contact', person: 'sfc_p', freq: 10 }
  q.variables.push({
    name: 'goods', type: 'target', scope: 'quest', initial: '',
    target: { pick: 'commodity', require: [{ id: 'cmShort', args: [] }, { id: 'cmLegal', args: [] }, { id: 'mkSizeAtLeast', args: [4] }], prefer: [{ id: 'cmTags', args: ['ANY', ['expensive']] }],
      commodity: { which: 'vanilla', amount: { unit: 'econ', n: 0.1 } }, mock: { name: 'Port Mock', commodity: 'food', size: 5 } }
  })
  q.rewards.push({ id: 'pay', credits: 500, targetCredits: { var: 'goods', mult: 1.5 } })
  q.stages = [{ id: 'go', title: 'Go', journal: 'Take $global.sfc_haul_goods_amount $global.sfc_haul_goods_commodity to $global.sfc_haul_goods_name.', marker: 'target:goods', kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Bring $global.sfc_haul_goods_amount $global.sfc_haul_goods_commodity to $global.sfc_haul_goods_name.'
  q.nodes.push(
    { id: 'st', type: 'stage', x: 0, y: 0, stage: 'go' },
    { id: 'arrive', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'target:goods', optionText: 'Deliver the goods', arriveText: 'The dockmaster checks the manifest.' },
    { id: 'chk', type: 'branch', x: 0, y: 0, cases: [{ id: 'has', label: 'has the goods', conditions: ['SF_TargetCommodity sfc_haul goods has'] }] },
    { id: 'take', type: 'action', x: 0, y: 0, ops: [{ op: 'targetCargo', target: 'goods', do: 'take' }, { op: 'targetCredits', target: 'goods', mult: 0.5 }] } as ActionNode,
    { id: 'end', type: 'end', x: 0, y: 0, outcome: 'success', reward: 'pay' }
  )
  q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'arrive' }, { id: 'c', from: 'arrive', handle: 'next', to: 'chk' },
    { id: 'd', from: 'chk', handle: 'has', to: 'take' }, { id: 'e', from: 'take', handle: 'next', to: 'end' })
  return q
}

const FOOD = { id: 'food', name: 'food', econUnit: 2000, basePrice: 20 }
const world = (q: QuestPlan): SimWorld => ({ quests: [q], phrases: new Map(), commodity: (id) => (id === 'food' ? FOOD : id === 'rare_metals' ? { id, name: 'transplutonics', econUnit: 200, basePrice: 200 } : undefined) })

describe('export', () => {
  it('writes the commodity part, the commands and SagaLib 1.4', () => {
    const q = delivery()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const rt = questRuntime(q, c) as { targets: Record<string, unknown>[]; rewards: Record<string, unknown>[] }
    expect(rt.targets[0]).toMatchObject({ var: 'goods', pick: 'commodity', commodity: { which: 'vanilla', amount: { unit: 'econ', n: 0.1 } } })
    expect(rt.targets[0].require).toEqual([{ c: 'cmShort', args: [] }, { c: 'cmLegal', args: [] }, { c: 'mkSizeAtLeast', args: [4] }])
    expect(rt.rewards[0]).toMatchObject({ id: 'pay', credits: 500, targetCredits: { var: 'goods', mult: 1.5 } })
    const scripts = c.rows.map((r) => r.script).join('\n')
    expect(scripts).toContain('SF_TargetCommodity sfc_haul goods take')
    expect(scripts).toContain('SF_TargetCommodity sfc_haul goods credits 0.5')
    expect(c.rows.some((r) => r.conditions.includes('SF_TargetCommodity sfc_haul goods has'))).toBe(true)
    // Arrive at the target = its market (SF_IsTarget reads the market id)
    expect(c.rows.some((r) => r.conditions.split('\n')[0] === 'SF_IsTarget sfc_haul goods')).toBe(true)
    const m = emptyModel('sfc_')
    m.quests.push(q)
    expect(needsSagaLib14(m)).toBe(true)
    m.quests[0] = { ...q, variables: [], rewards: [], nodes: q.nodes.filter((n) => n.type !== 'action' && n.type !== 'branch') }
    expect(needsSagaLib14(m)).toBe(false)
    // "list": only then the ids; perSize only for economy units
    q.variables[0].target!.commodity = { which: 'list', ids: ['IndEvo_parts'], amount: { unit: 'cargo', n: 50, perSize: true } }
    expect(runtimeTargets(q)[0].commodity).toEqual({ which: 'list', ids: ['IndEvo_parts'], amount: { unit: 'cargo', n: 50 } })
  })
})

describe('Play mode', () => {
  it('picks the mock\'s commodity, sets the tokens, checks and takes the cargo, pays for the goods', () => {
    const q = delivery()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const w = world(q)
    const e = new Engine(compileRules(c.rows), newContext(), sagaHooks(w, newSimState()))
    applyMockTargets(e, q, w)
    expect(e.get('$global.sfc_haul_goods_commodityId')).toBe('food')
    expect(e.get('$global.sfc_haul_goods_amount')).toBe(200)
    expect(e.get('$global.sfc_haul_goods_value')).toBe(4000)
    e.set('$option', startOptionId(q))
    e.fireBest('DialogOptionSelected')
    expect(e.view.paragraphs.map((p) => p.text).join(' ')).toContain('Bring 200 food to Port Mock.')
    const has = () => e.evalCondition({ kind: 'command', name: 'SF_TargetCommodity', args: ['sfc_haul', 'goods', 'has'], negate: false } as never)
    expect(has()).toBe(false)
    e.ctx.player.cargo.food = 230
    expect(has()).toBe(true)
    const credits = e.ctx.player.credits
    e.runScript(compileRules([{ id: 'x', trigger: 't', conditions: '', script: 'SF_TargetCommodity sfc_haul goods take\nSF_TargetCommodity sfc_haul goods credits 0.5', text: '', options: '', notes: '', sourceId: 'g', file: 'f', line: 0 }]).byId.get('x')!)
    expect(e.ctx.player.cargo.food).toBe(30)
    expect(e.ctx.player.credits - credits).toBe(2000)
    applyReward(e, q, q.rewards[0], w)
    expect(e.ctx.player.credits - credits).toBe(2000 + 500 + 6000)
  })

  it('without a mock commodity, picks one of the allowed ones', () => {
    const q = delivery()
    const t = q.variables[0].target!
    delete t.mock!.commodity
    t.commodity = { which: 'list', ids: ['rare_metals'], amount: { unit: 'econ', n: 0.1 } }
    expect(mockCommodity(t, world(q)).name).toBe('transplutonics')
    t.commodity = { which: 'vanilla', amount: { unit: 'econ', n: 0.1 } }
    expect(VANILLA_GOODS as readonly string[]).toContain(mockCommodity(t, world(q), () => 0.99).id)
    const facts = new Map(commodityFacts('sfc_haul', 'goods', t, { id: 'rare_metals', name: 'transplutonics', econUnit: 200, basePrice: 200 }, 5))
    expect(facts.get('$global.sfc_haul_goods_amount')).toBe(20)
  })
})

describe('checks and mod uses', () => {
  it('reports an empty list, a zero amount, unknown targets and a take without a cargo check', () => {
    const q = delivery()
    expect(targetProblems(q).filter((p) => p.level !== 'info')).toEqual([])
    const t = q.variables[0].target!
    t.commodity = { which: 'list', ids: [], amount: { unit: 'econ', n: 0 } }
    q.rewards[0].targetCredits = { var: 'nope', mult: 1 }
    ;(q.nodes.find((n) => n.id === 'chk') as { cases: { conditions: string[] }[] }).cases[0].conditions = []
    const msgs = targetProblems(q).filter((p) => p.level !== 'info').map((p) => p.message)
    expect(msgs.some((x) => x.includes('"these commodities" has no commodity ids'))).toBe(true)
    expect(msgs.some((x) => x.includes('the amount must be more than 0'))).toBe(true)
    expect(msgs.some((x) => x.includes('Reward pay') && x.includes('"nope"'))).toBe(true)
    expect(msgs.some((x) => x.includes('never tests that the player has them'))).toBe(true)
  })

  it('makes a quest "only with" a mod only when every listed commodity is that optional mod\'s (found in game)', () => {
    const q = delivery()
    const m = emptyModel('sfc_')
    m.project.mods = [{ id: 'IndEvo', name: 'Industrial.Evolution', use: 'optional' }]
    m.quests.push(q)
    const item = (id: string, src: string) => ({ id, name: id, kind: 'commodity', icon: '', tags: [], basePrice: 1, desc: '', definedBy: src, changedBy: [] })
    const ix = { sources: [{ id: 'starsector-core', name: 'Starsector', isCore: true }, { id: 'IndEvo', name: 'IndEvo' }], items: [item('metals', 'starsector-core'), item('IndEvo_parts', 'IndEvo')] } as unknown as GameIndex
    q.variables[0].target!.commodity = { which: 'list', ids: ['IndEvo_parts', 'metals'], amount: { unit: 'econ', n: 0.1 } }
    expect(effectiveConds(m, ix, 'sfc').get('quest:sfc_haul')!.eff.with).toEqual([])
    q.variables[0].target!.commodity = { which: 'list', ids: ['IndEvo_parts'], amount: { unit: 'econ', n: 0.1 } }
    expect(effectiveConds(m, ix, 'sfc').get('quest:sfc_haul')!.eff.with).toEqual(['IndEvo'])
  })

  it('counts a chosen commodity as a use of its mod; a commodity target is at a market', () => {
    const q = delivery()
    q.variables[0].target!.commodity = { which: 'list', ids: ['IndEvo_parts'], amount: { unit: 'econ', n: 0.1 } }
    expect(questRefs(q).some((r) => r.kind === 'item' && r.id === 'IndEvo_parts')).toBe(true)
    expect(atMarket(q.variables[0].target)).toBe(true)
  })
})
