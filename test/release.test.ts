import { describe, expect, it } from 'vitest'
import { makeSnapshot, saveWarnings, applySaveFix, renameStage } from '../src/shared/release'
import { styleChecks } from '../src/shared/checks/style'
import { emptyModel } from '../src/shared/serialize'
import { newSystem } from '../src/shared/locations'
import { reconcile } from '../src/shared/play'
import { lostConvoy } from './fixtures/vgc'
import type { CheckContext } from '../src/shared/checks'

function model() {
  const m = emptyModel('vgc_')
  m.quests = [lostConvoy()]
  m.systems = [newSystem('vgc_kestrel', 'Kestrel', 0, 0)]
  return m
}

describe('release snapshots and save warnings (PLAN.md §6)', () => {
  it('warns when a released stage disappears, and the alias fix removes the warning', () => {
    const m = model()
    const rel = makeSnapshot(m, '1.0.0')
    expect(rel.quests.vgc_lost_convoy.stages).toEqual(['find', 'return'])
    // 1.1.0: "find" renamed to "locate" without an alias
    renameStage(m, 'vgc_lost_convoy', 'find', 'locate', 'drop')
    const w = saveWarnings(m, rel)
    const stage = w.find((p) => p.key === 'save:1.0.0:stage:vgc_lost_convoy:find')!
    expect(stage.level).toBe('save')
    expect(stage.message).toMatch(/lose their place/)
    applySaveFix(m, 'aliasStage', { quest: 'vgc_lost_convoy', from: 'find', to: 'locate' })
    expect(saveWarnings(m, rel).some((p) => p.key?.includes('stage:'))).toBe(false)
    // and the Stage node followed the rename
    expect(m.quests[0].nodes.find((n) => n.id === 'go')).toMatchObject({ stage: 'locate' })
  })

  it('a renamed stage with an alias keeps a save\'s progress (reconciliation)', () => {
    const m = model()
    renameStage(m, 'vgc_lost_convoy', 'find', 'locate', 'alias')
    const mem = new Map<string, unknown>([['$global.vgc_lost_convoy_state', 'active'], ['$global.vgc_lost_convoy_step', 'find']])
    const log = reconcile({ get: (k) => mem.get(k), set: (k, v) => mem.set(k, v) }, ['vgc_lost_convoy'], m.quests)
    expect(mem.get('$global.vgc_lost_convoy_step')).toBe('locate')
    expect(log[0]).toMatch(/now locate/)
  })

  it('notes new systems that only appear in new games, and removed people', () => {
    const m = emptyModel('vgc_')
    m.people = [{ id: 'vgc_reyes', name: { first: 'I', last: 'R' }, gender: 'FEMALE', faction: 'x', rank: '', post: '', portrait: '', placement: { at: 'none' }, tags: [], phrases: [] }]
    const rel = makeSnapshot(m, '1.0.0')
    m.people = []
    m.systems = [newSystem('vgc_new', 'New', 0, 0)]
    const keys = saveWarnings(m, rel).map((p) => p.key)
    expect(keys).toContain('save:1.0.0:person:vgc_reyes')
    expect(keys).toContain('save:1.0.0:newsys:vgc_new')
  })
})

describe('style checks (off by default)', () => {
  it('only run when switched on, and find vanilla convention slips', () => {
    const m = model()
    const offer = m.quests[0].nodes.find((n) => n.id === 'catch')
    if (offer?.type === 'dialog') offer.text = '"Pirates, probably. It pays 40,000  credits'
    const ctx = { model: m, styleChecks: false } as unknown as CheckContext
    expect(styleChecks(ctx)).toEqual([])
    const msgs = styleChecks({ ...ctx, styleChecks: true }).map((p) => p.message)
    expect(msgs.some((x) => /quotation mark/.test(x))).toBe(true)
    expect(msgs.some((x) => /doubled spaces/.test(x))).toBe(true)
    expect(msgs.some((x) => /highlight the number 40,000/.test(x))).toBe(true)
  })
})
