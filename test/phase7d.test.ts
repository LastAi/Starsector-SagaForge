/**
 * Phase 7d (RC-R3, RC-R4, RC-R2): what the random target is like, a person there, and spawning
 * there (an encounter, or vanilla's mission spawning).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TARGET_DETAILS, TARGET_FACTS, runtimeTargets, targetPlaces } from '../src/shared/targets'
import { newQuest } from '../src/shared/quest'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { questRuntime } from '../src/shared/export/runtime'
import { targetProblems, wreckOptionProblems } from '../src/shared/checks/quests'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { applyMockTargets, mockTargetId, newSimState, sagaHooks } from '../src/shared/play'
import type { DialogNode, QuestPlan } from '../src/shared/model'

const SAGALIB = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'src', 'lastai', 'sagalib', 'core', 'Targets.java')

function contactQuest(): QuestPlan {
  const q = newQuest('sfw_tip', 'Tip-off', 'quest')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sfw_station'], optionText: 'Ask for work' }
  q.variables.push({
    name: 'post', type: 'target', scope: 'quest', initial: '',
    target: { pick: 'market', require: [{ id: 'mkSizeAtLeast', args: [4] }], prefer: [], person: { posts: ['portmaster'], rank: 'citizen' }, mock: { name: 'Mock port', faction: 'Hegemony', factionId: 'hegemony', details: { hostile: true, ruins: 'vast' }, personName: 'Ada Port' } }
  })
  q.stages = [
    { id: 'meet', title: 'Meet the portmaster', journal: 'Talk to $global.sfw_tip_post_personName.', marker: 'target:post.person', kind: 'normal', renamedFrom: [] },
    { id: 'cache', title: 'Find the cache', journal: 'A cache near $global.sfw_tip_post_name.', marker: 'target:post.spawned', kind: 'normal', renamedFrom: [] }
  ]
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Work.'
  q.nodes.push(
    { id: 'meet', type: 'stage', x: 0, y: 0, stage: 'meet' },
    { id: 'talk', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'target:post.person', optionText: 'Ask about the cache' },
    { id: 'spawn', type: 'action', x: 0, y: 0, title: 'Cache appears', ops: [{ op: 'spawnAtTarget', target: 'post', kind: 'entity', type: 'supply_cache', where: 'HIDDEN' }] },
    { id: 'cache', type: 'stage', x: 0, y: 0, stage: 'cache' },
    { id: 'found', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'target:post.spawned', optionText: 'Open the cache' },
    { id: 'end', type: 'end', x: 0, y: 0, outcome: 'success' }
  )
  q.edges.push(
    { id: 'a', from: 'offer', handle: 'accept', to: 'meet' }, { id: 'b', from: 'meet', handle: 'next', to: 'talk' }, { id: 'c', from: 'talk', handle: 'next', to: 'spawn' },
    { id: 'd', from: 'spawn', handle: 'next', to: 'cache' }, { id: 'e', from: 'cache', handle: 'next', to: 'found' }, { id: 'f', from: 'found', handle: 'next', to: 'end' }
  )
  return q
}

describe('details and facts', () => {
  it.skipIf(!fs.existsSync(SAGALIB))('are the same as SagaLib\'s', () => {
    const src = fs.readFileSync(SAGALIB, 'utf8')
    const arr = (name: string) => [...src.slice(src.indexOf(`${name} =`), src.indexOf('};', src.indexOf(`${name} =`))).matchAll(/"(\w+)"/g)].map((m) => m[1])
    expect(arr('FACTS')).toEqual([...TARGET_FACTS])
    expect(arr('DETAILS')).toEqual(TARGET_DETAILS.map((d) => d.id))
  })
})

describe('export', () => {
  it('writes the person, the spawn command and places at the person and the spawn', () => {
    const q = contactQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const rt = questRuntime(q, c) as { targets: { person?: unknown }[]; stages: { marker: string }[] }
    expect(rt.targets[0].person).toEqual({ posts: ['portmaster'], rank: 'citizen', faction: '' })
    expect(rt.stages.map((s) => s.marker)).toEqual(['$global.sfw_tip_post_person', '$global.sfw_tip_post_spawned'])
    expect(c.rows.some((r) => r.script.includes('SF_SpawnAtTarget sfw_tip post entity supply_cache HIDDEN'))).toBe(true)
    expect(c.rows.find((r) => r.options.includes('Ask about the cache'))?.conditions.split('\n')[0]).toBe('SF_IsTarget sfw_tip post person')
    expect(c.rows.find((r) => r.id === 'sfw_tip_found')?.conditions.split('\n')[0]).toBe('SF_IsTarget sfw_tip post spawned')
    expect(runtimeTargets(q)).toHaveLength(1)
    expect(targetPlaces(q).map((p) => p.id)).toEqual(['target:post', 'target:post.person', 'target:post.spawned'])
  })
})

describe('Play mode', () => {
  it('meets the mock person, spawns the cache and arrives at it', () => {
    const q = contactQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const e = new Engine(compileRules(c.rows), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
    applyMockTargets(e, q)
    expect(e.get('$global.sfw_tip_post_personName')).toBe('Ada Port')
    expect(e.get('$global.sfw_tip_post_hostile')).toBe(true)
    expect(e.get('$global.sfw_tip_post_deciv')).toBe(false)
    expect(e.get('$global.sfw_tip_post_ruins')).toBe('vast')
    e.set('$option', startOptionId(q))
    e.fireBest('DialogOptionSelected')
    e.select('sfw_tip_accept')
    // talking to the mock person: the option is there
    e.set('$id', `${mockTargetId('sfw_tip', 'post')}_person`)
    e.view = { visual: { kind: 'none' }, paragraphs: [], options: [], ended: false }
    e.fireAll('PopulateOptions')
    expect(e.view.options.some((o) => o.text === 'Ask about the cache')).toBe(true)
    e.select(e.view.options.find((o) => o.text === 'Ask about the cache')!.id)
    expect(e.get('$global.sfw_tip_post_spawned')).toBe(`${mockTargetId('sfw_tip', 'post')}_spawned`)
    e.set('$id', `${mockTargetId('sfw_tip', 'post')}_spawned`)
    e.view = { visual: { kind: 'none' }, paragraphs: [], options: [], ended: false }
    // arriving at a spawned cache takes over by default (vanilla's salvage dialog has no menu options)
    e.fireBest('OpenInteractionDialog')
    expect(e.fired).toContain('sfw_tip_found')
  })
})

describe('checks', () => {
  it('reports a person without a colony, places without their source, and unknown targets', () => {
    const q = contactQuest()
    expect(targetProblems(q).filter((p) => p.level === 'error')).toEqual([])
    q.variables[0].target!.pick = 'system'
    q.variables[0].target!.require = []
    const action = q.nodes.find((n) => n.id === 'spawn')!
    if (action.type === 'action') action.ops = [{ op: 'spawnAtTarget', target: 'nope', kind: 'entity', type: 'supply_cache' }]
    const msgs = targetProblems(q).filter((p) => p.level === 'error').map((p) => p.message)
    expect(msgs.some((x) => x.includes('a person needs a colony'))).toBe(true)
    expect(msgs.some((x) => x.includes('names "nope"'))).toBe(true)
    expect(msgs.some((x) => x.includes('no Action spawns anything there'))).toBe(true)
    q.variables[0].target!.person = undefined
    expect(targetProblems(q).filter((p) => p.level === 'error').some((p) => p.message.includes('has no person'))).toBe(true)
  })
})

describe('user decisions 2026-11-16', () => {
  it('an Arrive at what was spawned (or an entity pick) takes over by default, and can still be an option', () => {
    const q = contactQuest()
    const found = q.nodes.find((n) => n.id === 'found')!
    let c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.rows.find((r) => r.id === 'sfw_tip_found')?.trigger).toBe('OpenInteractionDialog')
    if (found.type === 'wait') found.takeover = false
    c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.rows.some((r) => r.trigger === 'PopulateOptions' && r.options.includes('Open the cache'))).toBe(true)
    expect(targetProblems(q).some((p) => p.key === 'tgtsalvage:sfw_tip:found')).toBe(true)
  })
  it('warns about a start option or a menu Arrive at a wreck', () => {
    const q = newQuest('sfw_w', 'Wreck', 'dialog')
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sfw_wreck'], optionText: 'Look' }
    q.nodes.push({ id: 'arr', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'sfw_wreck' })
    const m = { systems: [{ entities: [{ id: 'sfw_wreck', kind: 'derelict' }] }], quests: [q] }
    expect(wreckOptionProblems(q, m).map((p) => p.key)).toEqual(['wreckopt:sfw_w', 'wreckarrive:sfw_w:arr'])
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sfw_station'], optionText: 'Look' }
    q.nodes = q.nodes.map((n) => (n.id === 'arr' && n.type === 'wait' ? { ...n, takeover: true } : n))
    expect(wreckOptionProblems(q, m)).toEqual([])
  })
})
