/**
 * Phase 7c (RC-R1, RC-R1b): random targets. The criteria catalog matches SagaLib's and vanilla's
 * HubMissionWithSearch; the export (targets, markers, SF_IsTarget arrivals); Play's mock targets;
 * the checks.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CRITERIA, criteriaFor, runtimeTargets } from '../src/shared/targets'
import { newQuest } from '../src/shared/quest'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { questRuntime, needsSagaLib12 } from '../src/shared/export/runtime'
import { targetProblems } from '../src/shared/checks/quests'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { applyMockTargets, mockTargetId, newSimState, sagaHooks } from '../src/shared/play'
import { emptyModel } from '../src/shared/serialize'
import type { DialogNode, QuestPlan } from '../src/shared/model'

const SAGALIB = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'src', 'lastai', 'sagalib')
const API = path.resolve(__dirname, '..', '..', '..', '.cache', 'api-new', 'com', 'fs', 'starfarer', 'api', 'impl', 'campaign', 'missions', 'hub', 'HubMissionWithSearch.java')

describe('the criteria catalog', () => {
  it.skipIf(!fs.existsSync(SAGALIB))('has the same ids as SagaLib, and SagaLib has a case for each', () => {
    const targets = fs.readFileSync(path.join(SAGALIB, 'core', 'Targets.java'), 'utf8')
    const block = (name: string) => targets.slice(targets.indexOf(`${name} =`), targets.indexOf(')));', targets.indexOf(`${name} =`)))
    const ids = [...block('CRITERIA').matchAll(/"(\w+)"/g)].map((m) => m[1])
    expect(ids).toEqual(CRITERIA.map((c) => c.id))
    const reqOnly = [...block('REQUIRE_ONLY').matchAll(/"(\w+)"/g)].map((m) => m[1]).sort()
    expect(reqOnly).toEqual(CRITERIA.filter((c) => !c.pref).map((c) => c.id).sort())
    const search = fs.readFileSync(path.join(SAGALIB, 'quest', 'TargetSearch.java'), 'utf8')
    for (const c of CRITERIA) {
      expect(search, c.id).toContain(`"${c.id}".equals(id)`)
      if (c.req) expect(search, c.req).toContain(`m.${c.req}(`)
      if (c.pref) expect(search, c.pref).toContain(`m.${c.pref}(`)
    }
  })

  it.skipIf(!fs.existsSync(API))('only names methods vanilla has', () => {
    const src = fs.readFileSync(API, 'utf8')
    for (const c of CRITERIA) for (const mth of [c.req, c.pref]) if (mth) expect(src, mth).toMatch(new RegExp(`public void ${mth}\\(`))
  })

  it('offers no system criteria for a market (vanilla\'s pickMarket ignores them)', () => {
    expect(criteriaFor('market').every((c) => c.group === 'market')).toBe(true)
    expect(criteriaFor('planet').some((c) => c.group === 'system')).toBe(true)
  })
})

function ruinQuest(): QuestPlan {
  const q = newQuest('sfw_ruin', 'Ruin', 'quest')
  q.start = { kind: 'contact', person: 'sfw_p', freq: 10 }
  q.variables.push({
    name: 'ruin', type: 'target', scope: 'quest', initial: '',
    target: { pick: 'planet', require: [{ id: 'plRuins', args: [] }, { id: 'sysWithin', args: ['giver', 12] }], prefer: [{ id: 'plConditions', args: ['ANY', ['decivilized']] }], systemFirst: true, mock: { name: 'Tomb', system: 'Askr', dist: 7.5, faction: '' } }
  })
  q.stages = [{ id: 'go', title: 'Go', journal: 'Go to $global.sfw_ruin_ruin_name.', marker: 'target:ruin', kind: 'normal', renamedFrom: [] }]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Ruins on $global.sfw_ruin_ruin_name, $global.sfw_ruin_ruin_dist light-years out.'
  q.nodes.push(
    { id: 'st', type: 'stage', x: 0, y: 0, stage: 'go' },
    { id: 'arrive', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'target:ruin', optionText: 'Search the ruins', arriveText: 'Dust and silence.' },
    { id: 'end', type: 'end', x: 0, y: 0, outcome: 'success' }
  )
  q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'arrive' }, { id: 'c', from: 'arrive', handle: 'next', to: 'end' })
  return q
}

describe('export', () => {
  it('writes the targets, a target marker and an arrival at the target', () => {
    const q = ruinQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const rt = questRuntime(q, c) as { targets: unknown[]; stages: { marker: string }[]; arrivals: string[]; entityFlags?: { entity: string }[] }
    expect(rt.targets).toEqual([{ var: 'ruin', pick: 'planet', require: [{ c: 'plRuins', args: [] }, { c: 'sysWithin', args: ['giver', 12] }], prefer: [{ c: 'plConditions', args: ['ANY', ['decivilized']] }], systemFirst: true }])
    expect(rt.stages[0].marker).toBe('$global.sfw_ruin_ruin')
    expect(rt.arrivals).toEqual(['$global.sfw_ruin_ruin'])
    expect(rt.entityFlags?.[0].entity).toBe('$global.sfw_ruin_ruin')
    const offer = c.rows.find((r) => r.trigger === 'PopulateOptions' && r.conditions.includes('SF_IsTarget'))
    expect(offer?.conditions.split('\n')[0]).toBe('SF_IsTarget sfw_ruin ruin')
    expect(runtimeTargets(q)).toHaveLength(1)
    const m = emptyModel('sfw_')
    m.quests.push(q)
    expect(needsSagaLib12(m)).toBe(true)
  })
})

describe('Play mode (RC-R1b)', () => {
  it('stands in with the mock, and arriving at it continues the quest', () => {
    const q = ruinQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const e = new Engine(compileRules(c.rows), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
    applyMockTargets(e, q)
    expect(e.get('$global.sfw_ruin_ruin')).toBe(mockTargetId('sfw_ruin', 'ruin'))
    expect(e.get('$global.sfw_ruin_ruin_name')).toBe('Tomb')
    e.set('$option', startOptionId(q))
    e.fireBest('DialogOptionSelected')
    expect(e.view.paragraphs.map((p) => p.text).join(' ')).toContain('Ruins on Tomb, 7.5 light-years out.')
    e.select('sfw_ruin_accept')
    // somewhere else: no option; at the mock: the arrival's option
    e.set('$id', 'other_planet')
    e.view.options = []
    e.fireAll('PopulateOptions')
    expect(e.view.options.some((o) => o.text === 'Search the ruins')).toBe(false)
    e.set('$id', mockTargetId('sfw_ruin', 'ruin'))
    e.fireAll('PopulateOptions')
    expect(e.view.options.some((o) => o.text === 'Search the ruins')).toBe(true)
  })
})

describe('checks', () => {
  it('reports criteria that don\'t fit, empty lists, unknown targets and conversations', () => {
    const q = ruinQuest()
    expect(targetProblems(q).filter((p) => p.level !== 'info')).toEqual([])
    const t = q.variables[0].target!
    t.pick = 'market'
    t.prefer.push({ id: 'mkFaction', args: [[]] }, { id: 'mkNotPlayer', args: [] })
    q.stages[0].marker = 'target:nope'
    q.kind = 'dialog'
    const msgs = targetProblems(q).filter((p) => p.level !== 'info').map((p) => p.message)
    expect(msgs.some((x) => x.includes('needs the kind "Quest"'))).toBe(true)
    expect(msgs.some((x) => x.includes('"Has ruins" doesn\'t narrow a market'))).toBe(true)
    expect(msgs.some((x) => x.includes('"Within N light-years" doesn\'t narrow a market pick (vanilla\'s market search ignores system criteria)'))).toBe(true)
    expect(msgs.some((x) => x.includes('"Faction is" has no factions yet'))).toBe(true)
    expect(msgs.some((x) => x.includes('can only require "Not the player\'s"'))).toBe(true)
    expect(msgs.some((x) => x.includes('the target "nope"'))).toBe(true)
  })
})
