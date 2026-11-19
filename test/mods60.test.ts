/**
 * Task #60 (PLAN.md §10.1, §10.2): the mod's list of other mods and conditional content: the
 * conditions as rules and SagaLib JSON, what is offered, the uses-scan and automatic and inherited
 * conditions, the export (mods.json, required mods, SagaLib 1.3), the checks, Play mode, the
 * release notes. The shared golden case mods.json (SagaLib) covers the start record.
 */
import { describe, expect, it } from 'vitest'
import { addCond, combinations, condLines, effLines, gateJson, holds, noConds, offeredMods, visibleSources, modsJson } from '../src/shared/modlist'
import { effectiveConds, lowerModConds, modUses, nodeGuards, usersOf } from '../src/shared/moduses'
import { combinationProblems, loadOrderProblems, modProblems, indexWithout } from '../src/shared/checks/mods'
import { planExport } from '../src/shared/export'
import { modListNotes } from '../src/shared/releasepack'
import { testModFiles, testModState } from './fixtures/testmod'
import { SIXTY_A } from './fixtures/sixty'
import { compileQuest } from '../src/shared/export/questrules'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, modRecord } from '../src/shared/play'
import { planTexts } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import type { GameIndex, SourceInfo } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'
import type { RuleRow } from '../src/shared/rules/types'

const src = (id: string, extra: Partial<SourceInfo> = {}): SourceInfo => ({ id, name: id.toUpperCase(), version: '1.0', folder: id, dir: '', realDir: '', isCore: id === 'starsector-core', enabled: true, isLink: false, writable: false, writeDir: '', inGameMods: true, dependencies: [], gameVersion: '', utility: false, sortString: '', ...extra })
const o = (id: string, definedBy: string) => ({ id, name: id, definedBy, changedBy: [] })

/** A game index with vanilla, HMI (a faction, a hull), Nexerelin, a library, SagaLib, a translation and the test mod. */
function index(): GameIndex {
  return {
    sources: [src('starsector-core'), src('HMI', { name: 'Hazard Mining Incorporated', dependencies: ['lw_lazylib'] }), src('lw_lazylib', { name: 'LazyLib' }), src('nexerelin', { name: 'Nexerelin' }),
      src('lastai_sagalib', { name: 'SagaLib' }), src('vgc_xx', { name: 'VGC in XX', translates: 'vgc' }), src('sixty_a', { name: 'Saga Forge test #60', writable: true }), src('uaf', { name: 'UAF' })],
    activeSourceId: 'sixty_a',
    factions: [o('hegemony', 'starsector-core'), o('HMI', 'HMI'), o('uaf_faction', 'uaf')], people: [], markets: [{ ...o('hmi_base', 'HMI'), entities: ['hmi_base'], faction: 'HMI', size: 4, system: 'x', conditions: [], industries: [], submarkets: [] }],
    systems: [], items: [], industries: [], conditions: [], submarkets: [], hulls: [{ ...o('hmi_auctor', 'HMI'), hullSize: 'FRIGATE', designation: '', tech: '', hints: '', isSkin: false }, { ...o('hound', 'starsector-core'), hullSize: 'FRIGATE', designation: '', tech: '', hints: '', isSkin: false }],
    wings: [], weapons: [], hullmods: [], variants: [], illustrations: [], portraits: [], customEntityTypes: [], planetTypes: [], sounds: [], music: [], ruleCounts: {},
    ui: { colors: {}, fonts: {} }, problems: [], stats: { filesRead: 0, ms: 0 }, extensions: [], ext: {}, install: { ok: true, root: '', coreDir: '', modsDir: null, gameVersion: '0.98a-RC8' }, modsMode: 'workspace', workspaceDir: null, modsRoot: null
  } as unknown as GameIndex
}

function ctx(m = SIXTY_A.model(), rules: RuleRow[] | null = null): CheckContext {
  return { model: m, index: index(), defs: defsFor('0.98a-RC8'), loaded: testModState(SIXTY_A, m, planTexts(m)), rules, styleChecks: false }
}

describe('conditions as rules and SagaLib JSON (PLAN.md §10.2 table)', () => {
  it('writes every listed mod, "any of" and the negations', () => {
    expect(condLines({ with: ['A', 'B'] })).toEqual(['SF_HasMod A B'])
    expect(condLines({ with: ['A', 'B'], anyOf: true })).toEqual(['SF_HasAnyMod A B'])
    expect(condLines({ without: ['A', 'B'] })).toEqual(['!SF_HasMod A', '!SF_HasMod B'])
    expect(condLines({ with: ['A'], without: ['B'] })).toEqual(['SF_HasMod A', '!SF_HasMod B'])
    const e = addCond(addCond(noConds(), { with: ['A'] }), { with: ['B', 'C'], anyOf: true })
    expect(effLines(e)).toEqual(['SF_HasMod A', 'SF_HasAnyMod B C'])
    expect(gateJson(e)).toEqual({ modsWith: ['A'], modsAny: [['B', 'C']] })
    expect(holds(e, new Set(['A', 'C']))).toBe(true)
    expect(holds(e, new Set(['A']))).toBe(false)
    expect(combinations(['A', 'B']).map((s) => [...s].join('+'))).toEqual(['', 'A', 'B', 'A+B'])
  })
})

describe('Saga › Mods: what is offered and what lists show', () => {
  it('offers every installed mod but this one, SagaLib, translations; libraries of listed mods apart', () => {
    const { mods, libraries } = offeredMods(index(), SIXTY_A.model().project, 'sixty_a')
    expect(mods.map((s) => s.id).sort()).toEqual(['HMI', 'nexerelin', 'uaf'])
    expect(libraries.map((s) => s.id)).toEqual(['lw_lazylib'])
    expect([...visibleSources(SIXTY_A.model().project, 'sixty_a')].sort()).toEqual(['HMI', 'sixty_a', 'starsector-core'])
  })
})

describe('uses and effective conditions', () => {
  const m = SIXTY_A.model()
  const eff = effectiveConds(m, index(), 'sixty_a', (id) => (id === 'HMI' ? 'Hazard Mining' : id))
  it('finds what uses another mod (Origin of every id)', () => {
    const uses = modUses(m, index(), { sourceId: 'sixty_a', frameworkFiles: ['data/config/LunaSettings.csv'] })
    expect([...uses.keys()].sort()).toEqual(['HMI', 'lunalib'])
    expect(uses.get('HMI')!.map((u) => u.key).sort()).toEqual(['override:HMI', 'person:sxa_liaison', 'relation:sxa_friends/HMI'])
  })
  it('adds "Only with" for references to an optional mod (automatic, greyed)', () => {
    expect(eff.get('person:sxa_liaison')!.eff.with).toEqual(['HMI'])
    expect(eff.get('person:sxa_liaison')!.from[0].why).toBe('uses Hazard Mining')
    expect(eff.get('relation:sxa_friends/HMI')!.eff.with).toEqual(['HMI'])
    expect(eff.get('relation:sxa_friends/hegemony')!.eff.with).toEqual([])
  })
  it('spreads along prerequisites, and to what only conditional content uses', () => {
    expect(eff.get('quest:sxa_followup')!.eff.with).toEqual(['HMI'])
    expect(eff.get('quest:sxa_followup')!.from[0].why).toBe('from: Test 60: HMI contract')
    expect(eff.get('quest:sxa_check')!.eff.with).toEqual([])
    // a person only conditional quests use gets their condition; one also used without keeps none
    const m2 = SIXTY_A.model()
    m2.people.push({ ...m2.people[0], id: 'sxa_clerk', faction: 'independent', placement: { at: 'none' } })
    for (const q of m2.quests) if (q.id === 'sxa_contract') (q.nodes.find((n) => n.id === 'offer') as { speaker?: string }).speaker = 'sxa_clerk'
    expect(effectiveConds(m2, index(), 'sixty_a').get('person:sxa_clerk')!.eff.with).toEqual(['HMI'])
    for (const q of m2.quests) if (q.id === 'sxa_check') (q.nodes.find((n) => n.id === 'offer') as { speaker?: string }).speaker = 'sxa_clerk'
    expect(effectiveConds(m2, index(), 'sixty_a').get('person:sxa_clerk')!.eff.with).toEqual([])
    expect(usersOf(m2).get('person:sxa_clerk')!.sort()).toEqual(['quest:sxa_check', 'quest:sxa_contract'])
  })
  it('knows which mods guard each node (options and Branch cases)', () => {
    const q = m.quests.find((x) => x.id === 'sxa_check')!
    const g = nodeGuards(q, undefined)
    expect(g.get('r_hmi')!.with).toEqual(['HMI'])
    expect(g.get('r_quiet')!.without).toEqual(['HMI'])
    expect(g.get('b_with')!.with).toEqual(['HMI'])
    expect(g.get('b_else')!.with).toEqual([])
  })
  it('folds them into rule conditions for the export and Play mode', () => {
    const low = lowerModConds(m, eff)
    const check = low.quests.find((x) => x.id === 'sxa_check')!
    const offer = check.nodes.find((n) => n.id === 'offer') as import('../src/shared/model').DialogNode
    expect(offer.options.find((x) => x.id === 'hmi')!.showIf).toEqual(['SF_HasMod HMI'])
    expect(offer.phrases[0].cases[0].when).toEqual(['SF_HasMod HMI'])
    expect(low.quests.find((x) => x.id === 'sxa_followup')!.start).toMatchObject({ conditions: ['$id == sxa_station', 'SF_HasMod HMI'] })
    // the model itself is untouched
    expect((m.quests.find((x) => x.id === 'sxa_check')!.nodes.find((n) => n.id === 'offer') as typeof offer).options[0].showIf).toBeUndefined()
  })
})

describe('export', () => {
  const files = testModFiles(SIXTY_A)
  it('writes mods.json and lists it for SagaLib 1.3', () => {
    expect(JSON.parse(files['data/sagaforge/mods.json'])).toMatchObject({ mod: 'sixty_a', prefix: 'sxa_', mods: [{ id: 'HMI', use: 'optional' }, { id: 'aaacrew_replacer', use: 'incompatible', reason: expect.stringContaining('made-up') }] })
    expect(files['data/config/sagaforge/content.csv']).toContain('sixty_a_mods,mods,data/sagaforge/mods.json,sixty_a')
    expect(files['mod_info.json']).toContain('"version": "1.3.0"')
    // optional and incompatible mods never go into dependencies
    expect(files['mod_info.json']).not.toContain('HMI')
  })
  it('writes modsWith / modsWithout on SagaLib content and SF_HasMod in rules', () => {
    expect(JSON.parse(files['data/sagaforge/quests/sxa_contract.json']).modsWith).toEqual(['HMI'])
    expect(JSON.parse(files['data/sagaforge/quests/sxa_followup.json']).modsWith).toEqual(['HMI'])
    expect(JSON.parse(files['data/sagaforge/people/sixty_a_people.json']).people[0].modsWith).toEqual(['HMI'])
    const sys = JSON.parse(files['data/sagaforge/systems/sxa_range.json'])
    expect(sys.entities.find((e: { id: string }) => e.id === 'sxa_quiet_beacon').modsWithout).toEqual(['HMI'])
    expect(sys.entities.find((e: { id: string }) => e.id === 'sxa_hmi_beacon').mods).toBeUndefined()
    const fac = JSON.parse(files['data/sagaforge/factions.json'])
    expect(fac.relations.sxa_friends.HMI).toEqual({ value: 0.5, modsWith: ['HMI'] })
    expect(fac.relations.sxa_friends.hegemony).toBe(-0.2)
    expect(fac.scripted.sxa_friends).toEqual([{ op: 'hideFromIntelTab', modsWithout: ['HMI'] }])
    const rules = files['data/campaign/rules.csv']
    expect(rules).toMatch(/sxa_check_offer_o1,sxa_check_offer_options,SF_HasMod HMI,/)
    expect(rules).toMatch(/sxa_check_offer_o2,sxa_check_offer_options,!SF_HasMod HMI,/)
  })
  it('adds required mods to mod_info.json when asked, with the minimum version, and the sortString', () => {
    const m = SIXTY_A.model()
    m.project.mods!.push({ id: 'nexerelin', name: 'Nexerelin', use: 'required', minVersion: '0.12.2' })
    m.project.sortString = 'Hazard ~ test'
    const state = testModState(SIXTY_A, m, { ...planTexts(m), 'mod_info.json': '{\n\t"id": "sixty_a",\n\t"version": "1.0.0",\n}\n' })
    const asked = planExport(m, state, index(), null, {})
    expect(asked.requiredMissing.map((r) => r.id)).toEqual(['nexerelin'])
    const done = planExport(m, state, index(), null, { addRequired: true })
    const mi = done.writes.find((w) => w.path === 'mod_info.json')!.text
    expect(mi).toContain('"id": "nexerelin"')
    expect(mi).toContain('"version": "0.12.2"')
    expect(mi).toContain('"sortString": "Hazard ~ test"')
  })
})

describe('checks', () => {
  it('a used mod that isn\'t listed is a Problem with Add as required / optional', () => {
    const m = SIXTY_A.model()
    m.project.mods = m.project.mods!.filter((x) => x.id !== 'HMI')
    const p = modProblems(ctx(m)).find((x) => x.key === 'modunlisted:HMI')!
    expect(p.level).toBe('warning')
    expect(p.fixes!.map((f) => f.label)).toEqual(['Add as required', 'Add as optional'])
  })
  it('content of an incompatible mod is an error; game-loaded rows of an optional mod too', () => {
    const m = SIXTY_A.model()
    m.project.mods!.push({ id: 'uaf', name: 'UAF', use: 'incompatible' })
    m.people[0].faction = 'uaf_faction'
    ;(m.factions[0] as { raw: Record<string, unknown> }).raw.knownShips = { hulls: ['hmi_auctor', 'hound'] }
    const ps = modProblems(ctx(m))
    expect(ps.some((p) => p.level === 'error' && p.key?.startsWith('modincompat:uaf:person:sxa_liaison'))).toBe(true)
    expect(ps.find((p) => p.key === 'modgameloaded:faction:sxa_friends:hmi_auctor')?.level).toBe('error')
    expect(ps.some((p) => p.key === 'modgameloaded:faction:sxa_friends:hound')).toBe(false)
  })
  it('every combination of the optional mods leaves options and Branch cases', () => {
    const m = SIXTY_A.model()
    const eff = effectiveConds(m, index(), 'sixty_a')
    expect(combinationProblems(m, eff)).toEqual([])
    const q = m.quests.find((x) => x.id === 'sxa_check')!
    const offer = q.nodes.find((n) => n.id === 'offer') as import('../src/shared/model').DialogNode
    for (const op of offer.options) op.mods = { with: ['HMI'] }
    q.edges = q.edges.filter((e) => !(e.from === 'br' && e.handle === 'else'))
    const ps = combinationProblems(m, eff)
    expect(ps.map((p) => p.key)).toEqual(['modcombo:sxa_check:offer:'])
    m.project.mods!.push({ id: 'uaf', name: 'UAF', use: 'optional' })
    offer.options[2].mods = undefined
    const ps2 = combinationProblems(m, effectiveConds(m, index(), 'sixty_a'))
    expect(ps2.map((p) => p.key)).toEqual(['modcombo:sxa_check:br:'])
  })
  it('a patch of another mod\'s faction that loads first gets a sortString offer', () => {
    const m = SIXTY_A.model()
    const c = ctx(m)
    c.index.sources = [src('starsector-core'), src('sixty_a', { name: 'Saga Forge test #60' }), src('HMI', { name: 'Hazard Mining Incorporated' })]
    expect(loadOrderProblems(c)).toEqual([]) // the patch only adds to a list
    ;(m.factions[1] as { patch: { set: Record<string, unknown> } }).patch.set = { displayName: 'H.M.I. (patched)' }
    const p = loadOrderProblems(c)[0]
    expect(p.fixes![0]).toMatchObject({ action: 'setSortString', arg: 'Hazard Mining Incorporated ~ Saga Forge test #60: optional mods' })
  })
  it('an optional mod\'s own rule command is an error; its text tokens outside a guard a warning (Check mod)', () => {
    const m = SIXTY_A.model()
    m.project.mods!.push({ id: 'nexerelin', name: 'Nexerelin', use: 'optional' })
    const q = m.quests.find((x) => x.id === 'sxa_check')!
    const offer = q.nodes.find((n) => n.id === 'offer') as import('../src/shared/model').DialogNode
    offer.script = ['Nex_SomethingOfNexerelin']
    offer.text += ' $nex_war_name'
    const r = q.nodes.find((n) => n.id === 'r_hmi') as typeof offer
    r.text += ' $nex_war_name'
    const rules = [{ id: 'nex1', trigger: 't', conditions: '', script: '$global.nex_war_name = x\nNex_SomethingOfNexerelin', text: '', options: '', notes: '', sourceId: 'nexerelin', file: '', line: 1 }] as RuleRow[]
    const ps = modProblems(ctx(m, rules))
    expect(ps.some((p) => p.level === 'error' && p.key === 'modcommand:sxa_check:offer:Nex_SomethingOfNexerelin')).toBe(true)
    expect(ps.some((p) => p.level === 'warning' && p.key === 'modtoken:sxa_check:offer:$global.nex_war_name')).toBe(false)
    // $nex_war_name is a local key here; the global one is what nexerelin sets
    offer.text += ' $global.nex_war_name'
    const ps2 = modProblems(ctx(m, rules))
    expect(ps2.some((p) => p.key === 'modtoken:sxa_check:offer:$global.nex_war_name')).toBe(true)
  })
  it('the second pass works on the index without the optional mods', () => {
    const ix = indexWithout(index(), new Set(['HMI']))
    expect(ix.factions.map((f) => f.id)).toEqual(['hegemony', 'uaf_faction'])
    expect(ix.sources.some((s) => s.id === 'HMI')).toBe(false)
  })
})

describe('Play mode', () => {
  it('runs the exported rules with the optional mods as switched', () => {
    const m = SIXTY_A.model()
    const low = lowerModConds(m, effectiveConds(m, index(), 'sixty_a'))
    const q = low.quests.find((x) => x.id === 'sxa_check')!
    const phrases = q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : []))
    const rows = compileQuest(q, { sagalib: true, phrases }).rows
    const run = (on: string[]) => {
      const w = { quests: low.quests, phrases: new Map(phrases.map((p) => [p.token, p])), mods: { lists: [modsJson(m.project, { id: 'sixty_a', name: 'x' }) as never], enabled: new Set(on) } }
      const e = new Engine(compileRules(rows), newContext(), sagaHooks(w, newSimState()))
      modRecord(e, w.mods)
      e.ctx.memory.set('$option', 'sxa_check_start')
      e.fireBest('sxa_check_offer')
      return { options: e.view.options.map((x) => x.id), text: e.view.paragraphs.map((p) => p.text).join(' ') }
    }
    const with_ = run(['HMI'])
    expect(with_.options).toContain('sxa_check_hmi')
    expect(with_.options).not.toContain('sxa_check_quiet')
    const without = run([])
    expect(without.options).toContain('sxa_check_quiet')
    expect(without.options).not.toContain('sxa_check_hmi')
  })
})

describe('release notes', () => {
  it('lists Requires, Works with (and the new-game rule) and Known conflicts', () => {
    const t = modListNotes({ mods: [{ id: 'HMI', name: 'Hazard Mining Incorporated', use: 'optional' }, { id: 'x', name: 'Crew Replacer', use: 'incompatible', reason: 'both change crew' }, { id: 'n', name: 'Nexerelin', use: 'required', minVersion: '0.12.2' }] }, [{ id: 'lastai_sagalib', name: 'SagaLib', version: '1.3.0' }])
    expect(t).toBe('Requires:\n- SagaLib 1.3.0\n- Nexerelin 0.12.2\n\nWorks with (optional):\n- Hazard Mining Incorporated\nAdd or remove these mods only before starting a new game.\n\nKnown conflicts:\n- Crew Replacer: both change crew\n')
  })
})
