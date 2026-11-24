/**
 * Task #76 (PLAN.md §10.8): mods that never run together. The built-in list (AoTD's Theory of
 * Toolbox and the modules that need it never run with Industrial.Evolution) plus the mod's own `neverWith` marks in project.json: the versions
 * strip has no cell for such a combination, the combination checks and Play mode's switches skip it,
 * and "Only with A and B" for such a pair is a warning.
 */
import { describe, expect, it } from 'vitest'
import { combinations, KNOWN_NEVER, neverPairs, neverWithOf, possible, switchPlay, versionCells } from '../src/shared/modlist'
import { combinationProblems, modProblems, neverTogetherProblems } from '../src/shared/checks/mods'
import { versionCheckProblems } from '../src/shared/checks/versions'
import { effectiveConds } from '../src/shared/moduses'
import { planTexts } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import { testModState } from './fixtures/testmod'
import { SIXTY_A } from './fixtures/sixty'
import type { GameIndex, SourceInfo } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'
import type { DialogNode, ModUse, ProjectFile } from '../src/shared/model'

const src = (id: string, extra: Partial<SourceInfo> = {}): SourceInfo => ({ id, name: id, version: '1.0', folder: id, dir: '', realDir: '', isCore: id === 'starsector-core', enabled: true, isLink: false, writable: false, writeDir: '', inGameMods: true, dependencies: [], gameVersion: '', utility: false, sortString: '', ...extra })

function index(): GameIndex {
  return {
    sources: [src('starsector-core'), src('aotd_vok', { name: 'Vaults of Knowledge' }), src('IndEvo', { name: 'Industrial.Evolution' }), src('HMI'), src('uaf'), src('sixty_a', { writable: true })],
    activeSourceId: 'sixty_a',
    factions: [], people: [], markets: [], systems: [], items: [], industries: [], conditions: [], submarkets: [], hulls: [],
    wings: [], weapons: [], hullmods: [], variants: [], illustrations: [], portraits: [], customEntityTypes: [], planetTypes: [], sounds: [], music: [], ruleCounts: {},
    ui: { colors: {}, fonts: {} }, problems: [], stats: { filesRead: 0, ms: 0 }, extensions: [], ext: {}, install: { ok: true, root: '', coreDir: '', modsDir: null, gameVersion: '0.98a-RC8' }, modsMode: 'workspace', workspaceDir: null, modsRoot: null
  } as unknown as GameIndex
}

const VOK: ModUse = { id: 'aotd_vok', name: 'Vaults of Knowledge', use: 'optional' }
const INDEVO: ModUse = { id: 'IndEvo', name: 'Industrial.Evolution', use: 'optional' }

/** The #60 test mod with these optional mods instead of its own list. */
function model(mods: ModUse[]) {
  const m = SIXTY_A.model()
  m.project.mods = mods
  return m
}
const ctx = (m: ReturnType<typeof model>): CheckContext => ({ model: m, index: index(), defs: defsFor('0.98a-RC8'), loaded: testModState(SIXTY_A, m, planTexts(m)), rules: null, styleChecks: false })

describe('the list of mods that never run together', () => {
  it('knows ToT and the AoTD modules that need it with Industrial.Evolution; Dreams of Past runs with it', () => {
    expect(KNOWN_NEVER.map((x) => x.join('|')).sort()).toEqual(['aotd_sop|IndEvo', 'aotd_theory_of_toolbox|IndEvo', 'aotd_vok|IndEvo'])
    const p: Pick<ProjectFile, 'mods'> = { mods: [] }
    expect(neverWithOf(p, 'IndEvo').map((x) => x.id).sort()).toEqual(['aotd_sop', 'aotd_theory_of_toolbox', 'aotd_vok'])
    expect(neverWithOf(p, 'Cryo_but_better')).toEqual([])
    expect(possible(['Cryo_but_better', 'IndEvo'], neverPairs(p))).toBe(true)
    expect(neverWithOf(p, 'aotd_vok')).toEqual([{ id: 'IndEvo', known: true }])
    expect(possible(['aotd_vok', 'aotd_sop'], neverPairs(p))).toBe(true)
    expect(possible(['aotd_sop', 'HMI', 'IndEvo'], neverPairs(p))).toBe(false)
  })
  it('adds the pairs marked in Saga › Mods (either side), without repeating a known one', () => {
    const p: Pick<ProjectFile, 'mods'> = { mods: [{ id: 'HMI', name: 'HMI', use: 'optional', neverWith: ['uaf'] }, { id: 'IndEvo', name: 'IndEvo', use: 'optional', neverWith: ['aotd_vok'] }] }
    const pairs = neverPairs(p)
    expect(pairs.filter((x) => !x.known)).toEqual([{ a: 'HMI', b: 'uaf', known: false }])
    expect(neverWithOf(p, 'uaf')).toEqual([{ id: 'HMI', known: false }])
    expect(pairs.find((x) => x.b === 'IndEvo' && x.a === 'aotd_vok')?.known).toBe(true)
  })
  it('round-trips neverWith through project.json', () => {
    const m = model([{ ...VOK }, { id: 'HMI', name: 'HMI', use: 'optional', neverWith: ['uaf'] }, { id: 'uaf', name: 'UAF', use: 'optional' }])
    const saved = JSON.parse(planTexts(m)['sagaforge/project.json']) as ProjectFile
    expect(saved.mods!.find((x) => x.id === 'HMI')!.neverWith).toEqual(['uaf'])
    expect(saved.mods!.find((x) => x.id === 'aotd_vok')!.neverWith).toBeUndefined()
    expect(neverPairs(saved).filter((x) => !x.known)).toEqual([{ a: 'HMI', b: 'uaf', known: false }])
    // saved again unchanged
    const again = model(saved.mods!)
    expect(JSON.parse(planTexts(again)['sagaforge/project.json']).mods).toEqual(saved.mods)
  })
})

describe('the versions strip', () => {
  it('has no cell for VoK + Industrial.Evolution', () => {
    expect(versionCells({ mods: [VOK, INDEVO] }, 4, false)).toEqual([[], ['aotd_vok'], ['IndEvo']])
  })
  it('keeps the other combinations, and drops a pair marked by hand', () => {
    const hmi: ModUse = { id: 'HMI', name: 'HMI', use: 'optional' }
    expect(versionCells({ mods: [VOK, INDEVO, hmi] }, 4, false).map((c) => c.join('+'))).toEqual(['', 'aotd_vok', 'HMI', 'IndEvo', 'HMI+aotd_vok', 'HMI+IndEvo'])
    expect(versionCells({ mods: [{ ...hmi, neverWith: ['uaf'] }, { id: 'uaf', name: 'UAF', use: 'optional' }] }, 4, false).map((c) => c.join('+'))).toEqual(['', 'HMI', 'uaf'])
    expect(versionCells({ mods: [hmi, { id: 'uaf', name: 'UAF', use: 'optional' }] }, 4, false)).toHaveLength(4)
  })
})

describe('the combination checks and Play mode skip impossible combinations', () => {
  it('combinations() drops them when given the pairs', () => {
    expect(combinations(['aotd_vok', 'IndEvo'], 64, neverPairs({ mods: [] })).map((s) => [...s].join('+'))).toEqual(['', 'aotd_vok', 'IndEvo'])
    expect(combinations(['aotd_vok', 'IndEvo'])).toHaveLength(4)
  })
  it('a node whose options only fail with both mods is fine when they never run together', () => {
    const setUp = (mods: ModUse[]) => {
      const m = model(mods)
      const [a, b] = mods.map((x) => x.id)
      const q = m.quests.find((x) => x.id === 'sxa_check')!
      const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
      offer.options.forEach((op, i) => { op.mods = { without: [i % 2 ? b : a] } })
      return combinationProblems(m, effectiveConds(m, index(), 'sixty_a')).filter((p) => p.key?.startsWith('modcombo:sxa_check:offer'))
    }
    // HMI and UAF can run together: with both, no option is left
    expect(setUp([{ id: 'HMI', name: 'HMI', use: 'optional' }, { id: 'uaf', name: 'UAF', use: 'optional' }]).map((p) => p.key)).toEqual(['modcombo:sxa_check:offer:HMI+uaf'])
    // marked by hand: skipped
    expect(setUp([{ id: 'HMI', name: 'HMI', use: 'optional', neverWith: ['uaf'] }, { id: 'uaf', name: 'UAF', use: 'optional' }])).toEqual([])
    // built in: skipped
    expect(setUp([VOK, INDEVO])).toEqual([])
  })
  it('the versions check asks for no value in the impossible cell, and warns about a version for it', () => {
    const run = (mods: ModUse[]) => {
      const m = model(mods)
      const [a, b] = mods.map((x) => x.id)
      m.people[0].versions = [{ mods: [a], set: { 'name.last': 'Alpha' } }, { mods: [b], set: { 'name.last': 'Beta' } }]
      return versionCheckProblems(ctx(m))
    }
    expect(run([{ id: 'HMI', name: 'HMI', use: 'optional' }, { id: 'uaf', name: 'UAF', use: 'optional' }]).some((p) => p.key?.startsWith('verconflict:'))).toBe(true)
    expect(run([VOK, INDEVO]).some((p) => p.key?.startsWith('verconflict:'))).toBe(false)
    const m = model([VOK, INDEVO])
    m.people[0].versions = [{ mods: ['IndEvo', 'aotd_vok'], set: { 'name.last': 'Both' } }]
    expect(versionCheckProblems(ctx(m)).find((p) => p.key?.startsWith('vernever:'))?.level).toBe('warning')
  })
  it('Play mode: turning one on turns off the mods that never run with it', () => {
    const pairs = neverPairs({ mods: [] })
    expect([...switchPlay(new Set(['IndEvo', 'HMI']), 'aotd_vok', true, pairs)].sort()).toEqual(['HMI', 'aotd_vok'])
    expect([...switchPlay(new Set(['aotd_vok']), 'IndEvo', true, pairs)]).toEqual(['IndEvo'])
    expect([...switchPlay(new Set(['aotd_vok', 'HMI']), 'HMI', false, pairs)]).toEqual(['aotd_vok'])
  })
})

describe('"Only with A and B" for a pair that never runs together', () => {
  it('is a warning on items, options and Branch cases', () => {
    const m = model([VOK, INDEVO])
    const q = m.quests.find((x) => x.id === 'sxa_check')!
    q.mods = { with: ['aotd_vok', 'IndEvo'] }
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.options[0].mods = { with: ['IndEvo', 'aotd_vok'] }
    offer.options[1].mods = { with: ['IndEvo', 'aotd_vok'], anyOf: true }
    const ps = neverTogetherProblems(m)
    expect(ps.map((p) => p.key)).toEqual(['modnever:quest:sxa_check', `modnever:sxa_check:offer:${offer.options[0].id}`])
    expect(ps.every((p) => p.level === 'warning')).toBe(true)
    expect(modProblems(ctx(m)).some((p) => p.key === 'modnever:quest:sxa_check')).toBe(true)
  })
  it('says nothing for mods that can run together', () => {
    const m = model([{ id: 'HMI', name: 'HMI', use: 'optional' }, { id: 'uaf', name: 'UAF', use: 'optional' }])
    m.quests[0].mods = { with: ['HMI', 'uaf'] }
    expect(neverTogetherProblems(m)).toEqual([])
  })
})
