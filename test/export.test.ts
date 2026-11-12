import { describe, expect, it } from 'vitest'
import { planExport, takeoverProblems } from '../src/shared/export'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newItem } from '../src/shared/export/items'
import { newQuest } from '../src/shared/quest'
import { hashText } from '../src/main/install'
import { parseLooseObject } from '../src/shared/loosejson'
import { handRules, findBlocks } from '../src/shared/export/blocks'
import { defsFor } from '../src/shared/defs'
import type { ProjectState } from '../src/shared/project'
import type { GameIndex } from '../src/shared/api'
import { lostConvoy, reyes } from './fixtures/vgc'

const index = { factions: [], items: [], people: [] } as unknown as GameIndex

function loadedFrom(files: Record<string, string>, m: ModModel): ProjectState {
  return {
    sourceId: 'vgc', modDir: '/x', isNew: false,
    modInfo: { id: 'vgc', name: 'Vanguard', version: '1.0.0', gameVersion: '0.98a', dependencies: files['mod_info.json'] ? ((parseLooseObject(files['mod_info.json']).value.dependencies ?? []) as { id: string }[]) : [] },
    project: m.project, quests: m.quests, people: m.people, items: m.items, systems: [], encounters: [], phrases: [], testProfiles: [],
    factionsRuntime: m.factionsRuntime, descriptions: m.descriptions, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}
function apply(files: Record<string, string>, writes: { path: string; text: string; remove?: boolean }[]) {
  const out = { ...files }
  for (const w of writes) { if (w.remove) delete out[w.path]; else out[w.path] = w.text }
  return out
}

function model(): ModModel {
  const m = emptyModel('vgc_')
  m.quests = [lostConvoy()]
  m.people = [reyes]
  const box = newItem('vgc_black_box', 'Convoy black box', 'quest_item', defsFor('0.98a'))
  box.description = 'A scorched flight recorder.'
  m.items = [box]
  m.descriptions['FACTION:vgc_vanguard'] = { text1: 'Free stations.' }
  m.project.illustrations = { vgc_wreck: 'graphics/illustrations/vgc_wreck.jpg' }
  return m
}

describe('export (PLAN.md §6)', () => {
  const hand = 'id,trigger,conditions,script,text,options,notes\nvgc_hand,OpenCommLink,$id == vgc_reyes,,Hand-written.,,\n'

  it('writes owned blocks and keys, keeps hand-written rows, adds the dependency when asked', () => {
    const m = model()
    const files = { 'data/campaign/rules.csv': hand, 'mod_info.json': '{\n\t"id": "vgc",\n\t"name": "Vanguard",\n}\n' }
    const plan = planExport(m, loadedFrom(files, m), index, null, { addDependency: true })
    const out = apply(files, plan.writes)
    expect(plan.usesSagaLib).toBe(true)
    expect(handRules(out['data/campaign/rules.csv'], 'vgc').map((r) => r.id)).toEqual(['vgc_hand'])
    expect(findBlocks(out['data/campaign/rules.csv']).map((b) => b.key)).toEqual(['quest=vgc_lost_convoy'])
    // the Quest item preset makes a special item with mission_item (it can't be sold; M0 in-game check 8)
    expect(out['data/campaign/special_items.csv']).toContain('vgc_black_box')
    expect(out['data/campaign/special_items.csv']).toContain('mission_item')
    expect(out['data/campaign/special_items.csv'].split('\n')[0]).toMatch(/^name,id,tags/)
    expect(out['data/campaign/special_items.csv']).toContain('A scorched flight recorder.')
        expect(out['data/strings/descriptions.csv']).toContain('vgc_vanguard,FACTION,Free stations.')
    expect((parseLooseObject(out['data/config/settings.json']).value.graphics as { illustrations: Record<string, string> }).illustrations.vgc_wreck).toBe('graphics/illustrations/vgc_wreck.jpg')
    expect(parseLooseObject(out['mod_info.json']).value.dependencies).toEqual([{ id: 'lastai_sagalib', name: 'SagaLib' }])
    expect(out['data/campaign/person_missions.csv']).toContain('vgc_lost_convoy,vgc_reyes,')
    expect(out['data/campaign/person_missions.csv']).toContain('lastai.sagalib.quest.SagaQuest')
    expect(out['data/config/sagaforge/content.csv']).toContain('vgc_lost_convoy,quest,data/sagaforge/quests/vgc_lost_convoy.json,vgc')
    const q = parseLooseObject(out['data/sagaforge/quests/vgc_lost_convoy.json']).value
    expect(q).toMatchObject({ format: 1, id: 'vgc_lost_convoy', stages: [{ id: 'find', renamedFrom: ['search'] }, { id: 'return' }], targets: [] })
    expect(parseLooseObject(out['data/sagaforge/people/vgc_people.json']).value.people).toHaveLength(1)

    // exporting again with nothing changed writes nothing but the bookkeeping
    const m2 = { ...m, project: parseLooseObject(out['sagaforge/project.json']).value } as unknown as ModModel
    const again = planExport(m2, loadedFrom(out, m2), index, null, { addDependency: true })
    expect(again.writes.map((w) => w.path)).toEqual([])
    expect(again.files.every((f) => f.state === 'same')).toBe(true)
  })

  it('stops for blocks edited by hand, overwrites or detaches on request, removes blocks of deleted quests', () => {
    const m = model()
    const files = { 'data/campaign/rules.csv': hand }
    const out = apply(files, planExport(m, loadedFrom(files, m), index, null).writes)
    const edited = { ...out, 'data/campaign/rules.csv': out['data/campaign/rules.csv'].replace('Accept the job', 'Accept it') }
    const p1 = planExport(m, loadedFrom(edited, m), index, null)
    expect(p1.handEdited.map((h) => h.key)).toEqual(['quest=vgc_lost_convoy'])
    expect(p1.writes.find((w) => w.path === 'data/campaign/rules.csv')).toBeUndefined()
    const p2 = planExport(m, loadedFrom(edited, m), index, null, { overwrite: ['data/campaign/rules.csv|quest=vgc_lost_convoy'] })
    expect(p2.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text).toContain('Accept the job')
    const p3 = planExport(m, loadedFrom(edited, m), index, null, { detach: ['data/campaign/rules.csv|quest=vgc_lost_convoy'] })
    const det = p3.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text
    expect(findBlocks(det)).toHaveLength(0)
    expect(det).toContain('Accept it')
    // the quest is deleted: its block goes, hand-written rows stay
    const gone = { ...m, quests: [] }
    const p4 = planExport(gone, loadedFrom(out, gone), index, null)
    const after = p4.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text
    expect(findBlocks(after)).toHaveLength(0)
    expect(handRules(after, 'vgc').map((r) => r.id)).toEqual(['vgc_hand'])
    expect(p4.writes.some((w) => w.path === 'data/sagaforge/quests/vgc_lost_convoy.json' && w.remove)).toBe(true)
  })

  it('a dialog-only mod without SagaLib exports no runtime files', () => {
    const m = emptyModel('vgc_')
    const q = newQuest('vgc_chat', 'Chat', 'dialog')
    q.nodes.push({ id: 'out', type: 'link', x: 0, y: 0, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' })
    q.edges.push({ id: 'x', from: 'offer', handle: 'leave', to: 'out' })
    m.quests = [q]
    const plan = planExport(m, loadedFrom({}, m), index, null, { addDependency: true })
    expect(plan.usesSagaLib).toBe(false)
    expect(plan.writes.map((w) => w.path).sort()).toEqual(['data/campaign/rules.csv'])
  })

  it('finds a greeting that would take over vanilla\'s (FireBest)', () => {
    const vanilla = [{ id: 'pirateGreeting', trigger: 'OpenCommLink', conditions: '$faction.id == pirates', script: '', text: '', options: '', notes: '', sourceId: 'starsector-core', file: '', line: 1 }]
    const ours = [{ ...vanilla[0], id: 'vgc_greet', conditions: '$faction.id == pirates\n$isHostile', sourceId: 'vgc' }]
    expect(takeoverProblems(ours, vanilla, 'vgc_', 'vgc')).toHaveLength(1)
    const scoped = [{ ...ours[0], conditions: '$faction.id == pirates\n$entity.vgc_ambush' }]
    expect(takeoverProblems(scoped, vanilla, 'vgc_', 'vgc')).toHaveLength(0)
  })
})
