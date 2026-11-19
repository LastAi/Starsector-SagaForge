/** Phase 4 (DESIGN-PHASE4.md): the editor side of SagaLib 1.1. */
import { describe, expect, it } from 'vitest'
import { planExport } from '../src/shared/export'
import { needsSagaLib11 } from '../src/shared/export/runtime'
import { compileQuest } from '../src/shared/export/questrules'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newSystem, newEntity, newMarket, addition } from '../src/shared/locations'
import { newQuest } from '../src/shared/quest'
import { newEncounter } from '../src/shared/encounters'
import { worldProblems } from '../src/shared/checks/world'
import { interjectionProblems } from '../src/shared/checks/quests'
import { parseLooseObject } from '../src/shared/loosejson'
import { hashText } from '../src/main/install'
import type { GameIndex } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'
import type { CheckContext } from '../src/shared/checks'

const index = { factions: [], items: [], people: [], markets: [{ id: 'jangala', name: 'Jangala', entities: ['jangala'] }], codeSystems: [], planetTypes: [], customEntityTypes: [] } as unknown as GameIndex
function state(m: ModModel, files: Record<string, string> = {}): ProjectState {
  return {
    sourceId: 'vgc', modDir: '/x', isNew: false, modInfo: { id: 'vgc', name: 'V', version: '1', gameVersion: '0.98a-RC8', dependencies: files['mod_info.json'] ? (parseLooseObject(files['mod_info.json']).value.dependencies as { id: string }[]) : [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime, descriptions: {}, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}
const apply = (files: Record<string, string>, w: { path: string; text: string; remove?: boolean }[]) => { const o = { ...files }; for (const x of w) { if (x.remove) delete o[x.path]; else o[x.path] = x.text } return o }

function mod(): ModModel {
  const m = emptyModel('vgc_')
  m.project.options.translatable = false // these tests pin the SagaLib 1.1 logic; translatable texts need 1.2 (R31)
  const q = newQuest('vgc_q', 'Q')
  q.stages = [{ id: 'find', title: 'Find', journal: '', kind: 'normal', renamedFrom: [] }, { id: 'boom', title: 'Boom', journal: '', kind: 'normal', renamedFrom: [] }]
  m.quests = [q]
  const s = newSystem('vgc_dark', 'Dark', 0, 0)
  s.starless = true
  s.light = [10, 20, 30]
  const p = newEntity('planet', 'vgc_dark_i', 'Dark I', 'star', 2000, 0)
  p.conditions = ['ruins_scattered']
  p.surveyed = 'full'
  const probe = newEntity('derelict', 'vgc_probe', 'Probe', 'vgc_dark_i', 300, 0)
  probe.appears = { quest: 'vgc_q', stage: 'find' }
  s.entities = [p, probe]
  s.removals = [{ target: 'jangala', quest: 'vgc_q', stage: 'boom' }]
  m.systems = [s]
  return m
}

describe('export for SagaLib 1.1', () => {
  it('writes a starless system with its light, appearing objects, conditions and removals', () => {
    const m = mod()
    const files = apply({}, planExport(m, state(m), index, null, { addDependency: true }).writes)
    const sys = parseLooseObject(files['data/sagaforge/systems/vgc_dark.json']).value
    expect(sys.star).toBeNull()
    expect(sys.light).toEqual([10, 20, 30])
    expect(sys.starless).toBeUndefined()
    const ents = sys.entities as Record<string, unknown>[]
    expect(ents[0]).toMatchObject({ conditions: ['ruins_scattered'], surveyed: 'full' })
    expect(ents[1].appears).toEqual({ quest: 'vgc_q', stage: 'find' })
    expect(sys.removals).toEqual([{ target: 'jangala', quest: 'vgc_q', stage: 'boom' }])
    // the dependency names SagaLib 1.1
    expect(parseLooseObject(files['mod_info.json']).value.dependencies).toEqual([{ id: 'lastai_sagalib', name: 'SagaLib', version: '1.1.0' }])
  })

  it('adds the version to an existing SagaLib dependency only when 1.1 features are used', () => {
    const plain = emptyModel('vgc_')
    plain.project.options.translatable = false
    plain.systems = [newSystem('vgc_s', 'S', 0, 0)]
    expect(needsSagaLib11(plain)).toBe(false)
    const info = '{\n\t"id": "vgc",\n\t"dependencies": [{"id": "lastai_sagalib", "name": "SagaLib"}],\n}\n'
    expect(planExport(plain, state(plain, { 'mod_info.json': info }), index, null).writes.some((w) => w.path === 'mod_info.json')).toBe(false)
    const m = mod()
    const w = planExport(m, state(m, { 'mod_info.json': info }), index, null).writes.find((x) => x.path === 'mod_info.json')!
    expect((parseLooseObject(w.text).value.dependencies as Record<string, unknown>[])[0].version).toBe('1.1.0')
  })

  it('compiles the Action steps to SagaLib\'s commands', () => {
    const q = newQuest('vgc_q', 'Q')
    const a = { id: 'act', type: 'action' as const, x: 0, y: 0, ops: [{ op: 'placeEntity' as const, entity: 'vgc_probe' }, { op: 'removeEntity' as const, entity: 'vgc_station', decivilize: true }] }
    q.nodes.push(a)
    const start = q.nodes.find((n) => n.type === 'start')!
    q.edges.push({ id: 'e1', from: start.id, handle: 'next', to: 'act' })
    const c = compileQuest(q, { sagalib: true, phrases: [], sourceId: 'vgc' })
    const script = c.rows.map((r) => r.script).join('\n')
    expect(script).toContain('SF_PlaceEntity vgc_probe')
    expect(script).toContain('SF_RemoveEntity vgc_station decivilize')
    expect(c.usesSagaLib).toBe(true)
  })
})

describe('planet scenes without a takeover (RC-F2)', () => {
  function arriveQuest(entity = 'vgc_probe', extra: Record<string, unknown> = {}) {
    const q = newQuest('vgc_q', 'Q')
    q.stages = [{ id: 'find', title: 'Find', journal: '', kind: 'normal', renamedFrom: [] }]
    const start = q.nodes.find((n) => n.type === 'start')!
    q.nodes.push({ id: 'st', type: 'stage', x: 0, y: 0, stage: 'find' }, { id: 'arrive', type: 'wait', x: 0, y: 0, mode: 'arrive', entity, arriveText: 'The probe.', optionText: 'Search the probe', ...extra })
    q.edges.push({ id: 'a', from: start.id, handle: 'next', to: 'st' }, { id: 'b', from: 'st', handle: 'next', to: 'arrive' })
    return q
  }
  it('an Arrive is an option in the place\'s menu by default, and a takeover when asked or when a lock owns the place', () => {
    const rows = compileQuest(arriveQuest(), { sagalib: true, phrases: [] }).rows
    const offer = rows.find((r) => r.id === 'vgc_q_arrive_offer')!
    expect(offer.trigger).toBe('PopulateOptions')
    // #61: and only while the quest runs (a quest that failed at this step offered it before)
    expect(offer.conditions.split('\n')).toEqual(['$id == vgc_probe', '$global.vgc_q_step == find', '$global.vgc_q_state == active', '!$global.vgc_q_arrive_done'])
    expect(offer.options).toBe('5:vgc_q_arrive_go:Search the probe')
    expect(rows.find((r) => r.id === 'vgc_q_arrive')).toMatchObject({ trigger: 'DialogOptionSelected', conditions: '$option == vgc_q_arrive_go', text: 'The probe.' })
    expect(rows.some((r) => r.trigger === 'OpenInteractionDialog')).toBe(false)
    const take = compileQuest(arriveQuest('vgc_probe', { takeover: true }), { sagalib: true, phrases: [] }).rows
    expect(take.find((r) => r.id === 'vgc_q_arrive')!.trigger).toBe('OpenInteractionDialog')
    const locked = compileQuest(arriveQuest(), { sagalib: true, phrases: [], lockedEntities: new Set(['vgc_probe']) }).rows
    expect(locked.find((r) => r.id === 'vgc_q_arrive')!.trigger).toBe('OpenInteractionDialog')
  })

  it('marks the place important while the quest waits there (entityFlags, SagaLib 1.1)', () => {
    const m = emptyModel('vgc_')
    m.quests = [arriveQuest()]
    const files = apply({}, planExport(m, state(m), index, null).writes)
    expect(parseLooseObject(files['data/sagaforge/quests/vgc_q.json']).value.entityFlags).toEqual([{ entity: 'vgc_probe', flag: '$sagaforge_vgc_q_arrive', steps: ['find'], important: true }])
  })

  function interject(probability?: number, once?: 'none' | 'entity' | 'playthrough', handBack = true) {
    const q = newQuest('vgc_story', 'Story')
    q.kind = 'dialog'
    q.start = { kind: 'interject', option: 'salExplore', conditions: ['$customType == wreck'], probability, once }
    const start = q.nodes.find((n) => n.type === 'start')!
    q.nodes = [start]
    q.edges = []
    const d = { id: 'd', type: 'dialog' as const, x: 0, y: 0, visual: { kind: 'keep' as const }, displays: [], text: 'A log flickers on.', highlights: [], options: [{ id: 'go', text: 'Continue' }], conditions: [], script: [], phrases: [] }
    q.nodes.push(d, { id: 'back', type: 'link', x: 0, y: 0, mode: 'option', target: 'salExplore' })
    q.edges.push({ id: 'a', from: start.id, handle: 'next', to: 'd' })
    if (handBack) q.edges.push({ id: 'b', from: 'd', handle: 'go', to: 'back' })
    return q
  }
  it('an interjection cuts in before the option within its limits, and hands back', () => {
    const rows = compileQuest(interject(0.3, 'entity'), { sagalib: true, phrases: [] }).rows
    const go = rows.find((r) => r.id === 'vgc_story_start_go')!
    expect(go.trigger).toBe('DialogOptionSelected')
    expect(go.conditions.split('\n')).toEqual(['$option == salExplore', '$customType == wreck', '!$vgc_story_interjected', '!$entity.vgc_story_seen', 'RollProbability 0.3'])
    expect(go.script.split('\n').slice(0, 2)).toEqual(['$vgc_story_interjected = true 0', '$entity.vgc_story_seen = true'])
    // the hand-back: the dialog's option is salExplore itself; the local flag lets vanilla's rule answer it this time
    expect(rows.find((r) => r.id === 'vgc_story_d')!.options).toContain('salExplore:Continue')
  })

  it('checks that every path hands back, and warns about an unlimited interjection', () => {
    expect(interjectionProblems(interject(0.3, 'entity'))).toEqual([])
    const ps = interjectionProblems(interject(undefined, 'none', false)).map((p) => p.message)
    expect(ps.some((x) => x.includes('runs every time "salExplore" is picked'))).toBe(true)
    expect(ps.some((x) => x.includes('doesn\'t hand back'))).toBe(true)
  })
})

describe('guardrails (R26) and checks', () => {
  const ctx = (m: ModModel, files: Record<string, string> = {}) => ({ model: m, index, loaded: state(m, files), defs: {} }) as unknown as CheckContext
  it('warns about removing vanilla objects with a market, and about what still uses them', () => {
    const m = mod()
    m.quests[0].stages[0].marker = 'jangala'
    const msgs = worldProblems(ctx(m)).map((p) => p.message)
    expect(msgs.some((x) => x.includes('removing "jangala" (Jangala), an object of the game or another mod'))).toBe(true)
    expect(msgs.some((x) => x.includes('won\'t remove it unless "Its market" is decivilize'))).toBe(true)
    expect(msgs.some((x) => x.includes('still used by: Q › stage "Find" (map marker)'))).toBe(true)
  })

  it('checks appearing objects, place steps and the mod\'s salvage tables', () => {
    const m = mod()
    m.systems[0].entities[1].appears = { quest: 'vgc_q', stage: 'nope' }
    const q = m.quests[0]
    q.nodes.push({ id: 'act', type: 'action', x: 0, y: 0, ops: [{ op: 'placeEntity', entity: 'vgc_dark_i' }] })
    const ps = worldProblems(ctx(m, { 'data/campaign/procgen/drop_groups.csv': 'commodity,group\nx,y\n' })).map((p) => p.message)
    expect(ps.some((x) => x.includes('appears at a stage "Q" doesn\'t have'))).toBe(true)
    expect(ps.some((x) => x.includes('"vgc_dark_i" isn\'t an object that appears later'))).toBe(true)
    expect(ps.some((x) => x.includes('lacks vanilla\'s column freq'))).toBe(true)
  })

  it('a player-near encounter and a market on an addition need SagaLib 1.1 only where used', () => {
    const m = emptyModel('vgc_')
    const e = newEncounter('vgc_e', 'E', 'pirates')
    e.spawn.when = 'player-near'
    e.spawn.range = 1500
    m.encounters = [e]
    expect(needsSagaLib11(m)).toBe(true)
    const a = addition('corvus', 'Corvus')
    const st = newEntity('station', 'vgc_st', 'St', 'star', 500, 0)
    st.market = newMarket('vgc_st', 'St', 'independent')
    a.entities = [st]
    const m2 = emptyModel('vgc_')
    m2.systems = [a]
    expect(needsSagaLib11(m2)).toBe(false)
  })
})
