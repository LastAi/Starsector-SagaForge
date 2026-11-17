/** Set later (R9) and Inactive (R10): docs/DESIGN-PHASE1.md §1–2. */
import { describe, expect, it } from 'vitest'
import { vanguardModel } from './fixtures/vanguard'
import { exampleState } from './fixtures/vanguard-files'
import { activeTodos, isTodoActive, markTodo, todoProblems, todoValue, unmarkTodo, setTodoNote } from '../src/shared/todo'
import { exportableModel, inactiveProblems, inactiveQuests, releaseBlockers, softenInactive } from '../src/shared/inactive'
import { renameNode } from '../src/shared/quest'
import { renameStage, makeSnapshot, saveWarnings } from '../src/shared/release'
import { planTexts } from '../src/shared/serialize'
import { planExport } from '../src/shared/export'
import { questProblems } from '../src/shared/checks/quests'
import { defsFor } from '../src/shared/defs'
import type { CheckContext } from '../src/shared/checks'
import type { GameIndex } from '../src/shared/api'

const index = { factions: [], items: [], people: [], markets: [] } as unknown as GameIndex

describe('Set later (R9)', () => {
  it('reads field paths, including array elements by id', () => {
    const m = vanguardModel()
    const q = m.quests[0]
    expect(todoValue(q, 'start.person')).toBe('vgc_reyes')
    expect(todoValue(q, 'stages#search.marker')).toBe('vgc_convoy_wreck')
    expect(todoValue(q, 'nodes#arrive.entity')).toBe('vgc_convoy_wreck')
    expect(todoValue(q, 'nodes#nope.entity')).toBe('')
  })

  it('stays to do until the field changes from the value it had when marked', () => {
    const m = vanguardModel()
    const it0 = m.items[0]
    const placeholder = it0.icon
    markTodo(it0, 'icon', 'art from the artist')
    expect(isTodoActive(it0, 'icon')).toBe(true) // the placeholder icon doesn't count as done
    expect(it0.todo!.icon).toEqual({ note: 'art from the artist', was: placeholder })
    it0.icon = 'graphics/icons/cargo/real.png'
    expect(isTodoActive(it0, 'icon')).toBe(false)
    it0.icon = ''
    expect(isTodoActive(it0, 'icon')).toBe(true) // empty again: still to do
    setTodoNote(it0, 'icon', '')
    expect(it0.todo!.icon.note).toBeUndefined()
    unmarkTodo(it0, 'icon')
    expect(it0.todo).toBeUndefined()
  })

  it('lists active to-dos in Problems (no key, so they can\'t be ignored) and silences the same "missing" check', () => {
    const m = vanguardModel()
    const q = m.quests[0]
    q.start = { ...(q.start as { kind: 'contact' }), person: '' } as typeof q.start
    const ctx = { model: m, index: { people: [], items: [], illustrations: [], markets: [], factions: [] }, defs: defsFor('0.98a') } as unknown as CheckContext
    expect(questProblems(ctx, q).some((p) => p.message.startsWith('Start: pick the contact'))).toBe(true)
    markTodo(q, 'start.person', 'Pops, step 4')
    expect(questProblems(ctx, q).some((p) => p.message.startsWith('Start: pick the contact'))).toBe(false)
    const t = todoProblems(m)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ level: 'todo', ref: { page: 'quests', id: q.id } })
    expect(t[0].message).toBe('The Lost Convoy › Start › Contact: set later (Pops, step 4).')
    expect(t[0].key).toBeUndefined()
  })

  it('follows node and stage renames, and Save drops to-dos that are done', () => {
    const m = vanguardModel()
    const q = m.quests[0]
    const node = q.nodes.find((n) => n.id === 'arrive') as { entity?: string }
    node.entity = ''
    markTodo(q, 'nodes#arrive.entity')
    renameNode(q, 'arrive', 'reach_wreck')
    expect(Object.keys(q.todo!)).toEqual(['nodes#reach_wreck.entity'])
    expect(activeTodos(m)[0].ref).toEqual({ page: 'quests', id: q.id, sub: 'reach_wreck' })
    markTodo(q, 'stages#search.title')
    renameStage(m, q.id, 'search', 'find', 'alias')
    expect(Object.keys(q.todo!).sort()).toEqual(['nodes#reach_wreck.entity', 'stages#find.title'])
    // the stage's title changes: that one is done and isn't saved; the empty place still is
    q.stages[0].title = 'Find the wreck'
    const saved = JSON.parse(planTexts(m)['sagaforge/quests/vgc_lost_convoy.quest.json'])
    expect(Object.keys(saved.todo)).toEqual(['nodes#reach_wreck.entity'])
  })

  it('never reaches the game files', () => {
    const m = vanguardModel()
    markTodo(m.people[0], 'portrait')
    markTodo(m.encounters[0], 'spawn.at')
    const out = planExport(m, exampleState(), index, null).writes.map((w) => w.text).join('\n')
    expect(out).not.toContain('"todo"')
  })
})

describe('Inactive (R10)', () => {
  it('a person or a quest marked inactive is not exported, and nor is a quest its inactive contact offers', () => {
    const m = vanguardModel()
    m.people[0].inactive = true // Reyes: both her quests are offered by her
    expect([...inactiveQuests(m)]).toEqual([['vgc_lost_convoy', 'contact'], ['vgc_salvage_rights', 'contact']])
    const ex = exportableModel(m)
    expect(ex.people).toEqual([])
    expect(ex.quests.map((q) => q.id).sort()).toEqual(['vgc_belt_ambush_comm', 'vgc_wreck_lock'])
    // Haven still lists her in the plan, but not in what is exported
    expect(m.systems[0].entities.find((e) => e.id === 'vgc_haven')!.market!.people).toEqual(['vgc_reyes'])
    expect(ex.systems[0].entities.find((e) => e.id === 'vgc_haven')!.market!.people).toEqual([])

    const plan = planExport(m, exampleState(), index, null)
    const paths = plan.writes.map((w) => w.path)
    expect(paths).not.toContain('data/sagaforge/quests/vgc_lost_convoy.json')
    const rules = plan.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text
    expect(rules).not.toContain('vgc_lost_convoy')
    expect(plan.writes.find((w) => w.path === 'data/campaign/person_missions.csv')?.text ?? '').not.toContain('vgc_lost_convoy')
  })

  it('files exported before are removed when their content is made inactive', () => {
    const m = vanguardModel()
    const before = planExport(m, exampleState(), index, null)
    const files = Object.fromEntries(before.writes.map((w) => [w.path, w.text]))
    m.quests.find((q) => q.id === 'vgc_salvage_rights')!.inactive = true
    const after = planExport(m, exampleState(files), index, null)
    expect(after.writes.find((w) => w.path === 'data/sagaforge/quests/vgc_salvage_rights.json')?.remove).toBe(true)
  })

  it('active content that uses an inactive person is an error; problems inside inactive content are warnings', () => {
    const m = vanguardModel()
    m.people[0].inactive = true
    const lc = m.quests.find((q) => q.id === 'vgc_lost_convoy')!
    lc.start = { kind: 'bar', freq: 10, prob: 1 } // now active again (no longer offered by Reyes)
    const probs = inactiveProblems(m)
    expect(probs.filter((p) => p.level === 'error' && p.ref?.id === 'vgc_lost_convoy').length).toBeGreaterThan(0)
    expect(probs.some((p) => p.message.includes('$vgc_reyes_title'))).toBe(true)
    expect(probs.find((p) => p.ref?.id === 'vgc_salvage_rights')?.level).toBe('warning') // offered by the inactive Reyes
    // a problem located inside inactive content is softened
    const soft = softenInactive(m, [{ level: 'error', area: 'Quest', message: 'x', ref: { page: 'quests', id: 'vgc_salvage_rights' } }])
    expect(soft[0]).toMatchObject({ level: 'warning', message: '(inactive) x' })
  })

  it('to-dos in inactive content don\'t hold back a release', () => {
    const m = vanguardModel()
    const sr = m.quests.find((q) => q.id === 'vgc_salvage_rights')!
    sr.stages[0].marker = ''
    markTodo(sr, 'stages#survey.marker')
    expect(releaseBlockers(m)).toHaveLength(1)
    sr.inactive = true
    expect(releaseBlockers(m)).toHaveLength(0)
  })

  it('making released content inactive is a save warning', () => {
    const m = vanguardModel()
    const rel = makeSnapshot(m, '1.0.0')
    m.people[0].inactive = true
    const w = saveWarnings(m, rel)
    expect(w.find((p) => p.key === 'save:1.0.0:person:vgc_reyes')?.message).toContain('made inactive')
    expect(w.find((p) => p.key === 'save:1.0.0:quest:vgc_lost_convoy')?.message).toContain('its contact is inactive')
  })
})
