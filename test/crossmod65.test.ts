/**
 * Task #65 (PLAN.md §10, the deferred cross-mod items): Nexerelin's quest skip, MagicLib achievements,
 * and the shared-drop-group warning. SagaLib's side (the skip's rewards, SF_Achievement's bridge) is
 * tested in mods/SagaLib (QuestSkipTests); the in-game check is INGAME-CHECKS "Task #65".
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SIXTYFIVE_A } from './fixtures/sixtyfive'
import { EIGHT_A } from './fixtures/phase8/eight_a'
import { testModFiles, testModState } from './fixtures/testmod'
import { defaultEnding, needsInChain, questSkipJson, skipEffects, skipEndings, skipFlags, skipPath, skipRuntime, skipValue, QUEST_SKIP_PLUGIN } from '../src/shared/questskip'
import { achievementsOf, handAchievementIds, preloadImages } from '../src/shared/achievements'
import { achievementProblems, questSkipProblems } from '../src/shared/checks/crossmod65'
import { modProblems } from '../src/shared/checks/mods'
import { handDropRows, poolProblems } from '../src/shared/checks/pools'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { needsSagaLib13 } from '../src/shared/export/runtime'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, questState, sagaHooks } from '../src/shared/play'
import { buildRegistry, flagProblems } from '../src/shared/flags'
import { planExport } from '../src/shared/export'
import { modelToWrites, type ModModel } from '../src/shared/serialize'
import { hashText } from '../src/main/install'
import { parseCsvRecords } from '../src/shared/csvedit'
import type { CheckContext } from '../src/shared/checks'
import type { DropGroupRow, GameIndex } from '../src/shared/api'

const index = { sources: [], factions: [], people: [], markets: [], systems: [], items: [], hulls: [], variants: [], codeSystems: [], places: [] } as unknown as GameIndex
const ctx = (m: ModModel, files: Record<string, string> = {}, idx: GameIndex = index): CheckContext => ({ model: m, index: idx, defs: {} as never, loaded: testModState(SIXTYFIVE_A, m, files), rules: null, styleChecks: false })
const first = (m: ModModel) => m.quests.find((q) => q.id === 'sfv_first')!
const second = (m: ModModel) => m.quests.find((q) => q.id === 'sfv_second')!

describe('#65 quest skip: the ending and what it leaves', () => {
  it('lists the endings (End nodes and success/fail stages) and defaults to a success', () => {
    const m = SIXTYFIVE_A.model()
    expect(skipEndings(first(m)).map((e) => `${e.node}:${e.outcome}`)).toEqual(['won:success', 'lost:fail'])
    expect(defaultEnding(first(m))).toBe('won')
    expect(skipPath(first(m), 'won')).toEqual(['start', 'offer', 'st', 'choice', 'helped', 'st2', 'won'])
  })
  it('success: SagaLib\'s state and step, vanilla\'s completed key, the ended key, the flag on the way; rewards on the way', () => {
    const fx = skipEffects(first(SIXTYFIVE_A.model()), 'won')
    expect(Object.fromEntries(fx.flags.map((f) => [f.key, f.value]))).toEqual({
      '$global.sfv_first_state': 'success', '$global.sfv_first_step': 'done', '$global.sfv_first_missionCompleted': true,
      '$global.sagaforge_success_sfv_first': true, '$global.sfv_first_helped': true
    })
    // the plugin marks it skipped after giving the rewards; Nexerelin's flags come first, so it isn't one of them
    expect(fx.flags.some((f) => f.key.includes('sagaforge_skipped'))).toBe(false)
    expect(fx.rewards).toEqual([{ id: 'pay', credits: 5000 }, { id: 'skip_won', xp: 500 }])
    // achievements are for playing it: a skip doesn't unlock them, and says so
    expect(fx.notes).toEqual(["Unlocks MagicLib achievement sfv_first_done (end won); a skip doesn't."])
  })
  it('fail: no completed key, the fail key, nothing from the other branch', () => {
    const fx = skipEffects(first(SIXTYFIVE_A.model()), 'lost')
    expect(Object.fromEntries(fx.flags.map((f) => [f.key, f.value]))).toEqual({ '$global.sfv_first_state': 'fail', '$global.sfv_first_step': 'go', '$global.sagaforge_fail_sfv_first': true })
    expect(fx.rewards).toEqual([])
  })
  it('keys left out, more keys, values as Nexerelin reads them, and what a skip doesn\'t do', () => {
    const m = SIXTYFIVE_A.model()
    const q = first(m)
    const helped = q.nodes.find((n) => n.id === 'helped')!
    if (helped.type === 'action') helped.ops.push({ op: 'set', key: '$entity.sfv_seen', value: 'true' }, { op: 'startQuest', quest: 'sfv_second' }, { op: 'line', line: '$global.sfv_count++' })
    q.variables.push({ name: 'count', type: 'number', scope: 'quest', initial: '2' })
    const fx = skipFlags(q, { quest: q.id, ending: 'won', omit: ['$global.sfv_first_step'], extra: [{ key: '$player.sfv_met', value: '3' }] })
    expect(fx.flags.find((f) => f.key === '$global.sfv_first_step')?.omitted).toBe(true)
    expect(fx.flags.find((f) => f.key === '$player.sfv_met')).toMatchObject({ value: 3, extra: true })
    expect(fx.flags.find((f) => f.key === '$global.sfv_first_count')?.value).toBe(2)
    expect(fx.notes.join(' ')).toContain('$entity.sfv_seen')
    expect(fx.notes.join(' ')).toContain('Starts quest sfv_second')
    expect(fx.notes.join(' ')).toContain('adds to a value')
    expect([skipValue('true'), skipValue('3.5'), skipValue('"a b"'), skipValue('word')]).toEqual([true, 3.5, 'a b', 'word'])
  })
  it('questSkip.json: one chain naming SagaLib\'s plugin, the quests forced on and off by their prerequisites', () => {
    const m = SIXTYFIVE_A.model()
    const j = questSkipJson(m)
    expect(j.questChains.sfv_chain).toMatchObject({ name: 'Test 65', quests: ['sfv_first', 'sfv_second'], plugin: QUEST_SKIP_PLUGIN, sortKey: 'ZZZZ_test65' })
    expect(j.quests.sfv_first).toMatchObject({ name: 'Test 65: first', idsToForceOnWhenEnabled: [], idsToForceOffWhenDisabled: ['sfv_second'] })
    expect(j.quests.sfv_second).toMatchObject({ idsToForceOnWhenEnabled: ['sfv_first'], idsToForceOffWhenDisabled: [] })
    expect((j.quests.sfv_first as { sectorMemFlags: Record<string, unknown> }).sectorMemFlags).toMatchObject({ $sfv_first_state: 'success', $sfv_first_helped: true })
    expect(needsInChain(m, m.project.questSkip![0], 'sfv_second')).toEqual(['sfv_first'])
    // an inactive quest leaves the chain; an empty chain isn't written
    second(m).inactive = true
    expect(questSkipJson(m).questChains.sfv_chain).toMatchObject({ quests: ['sfv_first'] })
    first(m).inactive = true
    expect(questSkipJson(m).questChains.sfv_chain).toBeUndefined()
  })
  it('the quest JSON\'s skip section: the rewards (off: none) and people to show', () => {
    const m = SIXTYFIVE_A.model()
    expect(skipRuntime(m, first(m))).toEqual({ rewards: [{ id: 'pay', credits: 5000 }, { id: 'skip_won', xp: 500 }] })
    expect(skipRuntime(m, second(m))).toBeNull()
    m.project.questSkip![0].quests[0].rewards = false
    m.project.questSkip![0].quests[0].unhide = ['sfv_ada']
    expect(skipRuntime(m, first(m))).toEqual({ unhide: ['sfv_ada'] })
  })
})

describe('#65 achievements', () => {
  it('an End node\'s achievement and the action are SF_Achievement lines', () => {
    const m = SIXTYFIVE_A.model()
    const rows = compileQuest(first(m), { sagalib: true, phrases: [] }).rows
    const end = rows.find((r) => r.script.includes('SF_End sfv_first success'))!
    expect(end.script.split('\n').slice(0, 3)).toEqual(['SF_Reward sfv_first pay', 'SF_End sfv_first success', 'SF_Achievement sfv_first_done'])
    const helped = first(m).nodes.find((n) => n.id === 'helped')!
    if (helped.type === 'action') helped.ops.push({ op: 'achievement', achievement: 'sfv_second_done' })
    expect(compileQuest(first(m), { sagalib: true, phrases: [] }).rows.some((r) => r.script.split('\n').includes('SF_Achievement sfv_second_done'))).toBe(true)
    expect(achievementsOf(first(m)).map((a) => a.id)).toEqual(['sfv_second_done', 'sfv_first_done'])
  })
  it('Play: MagicLib\'s notice in the dialog', () => {
    const m = SIXTYFIVE_A.model()
    const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib: true, phrases: [] }).rows)
    const e = new Engine(compileRules(rows), newContext(), sagaHooks({ quests: m.quests, phrases: new Map(), achievements: { name: (id) => m.project.achievements?.find((a) => a.id === id)?.name } }, newSimState()))
    e.set('$id', 'sfv_station')
    e.fireAll('PopulateOptions')
    e.select(startOptionId(first(m)))
    e.select('sfv_first_accept')
    e.select('sfv_first_help')
    expect(e.view.paragraphs.map((p) => p.text).join(' | ')).toContain('Achievement unlocked: Test 65: first job done')
    expect(questState(e, 'sfv_first').state).toBe('success')
  })
  it('Play: Nexerelin\'s flags of a skip make the next quest offered', () => {
    const m = SIXTYFIVE_A.model()
    const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib: true, phrases: [] }).rows)
    const e = new Engine(compileRules(rows), newContext(), sagaHooks({ quests: m.quests, phrases: new Map() }, newSimState()))
    e.set('$id', 'sfv_station')
    e.fireAll('PopulateOptions')
    const opts = () => e.view.options.map((o) => o.id)
    expect(opts()).not.toContain(startOptionId(second(m)))
    // what Nexerelin sets from questSkip.json (sector memory = $global)
    const flags = (questSkipJson(m).quests.sfv_first as { sectorMemFlags: Record<string, unknown> }).sectorMemFlags
    for (const [k, v] of Object.entries(flags)) e.set(`$global.${k.slice(1)}`, v as never)
    e.fireAll('PopulateOptions')
    expect(opts()).toContain(startOptionId(second(m)))
    expect(opts()).not.toContain(startOptionId(first(m)))
  })
  it('hand-written rows of magic_achievements.csv are read past the block', () => {
    const files = testModFiles(SIXTYFIVE_A)
    const text = 'id,name,description,tooltip,script,image,spoilerLevel,rarity\nsfv_hand,Hand,Did it.,,org.magiclib.achievements.MagicAchievement,,VISIBLE,COMMON\n' + files['data/config/magic_achievements.csv'].split('\n').slice(1).join('\n')
    expect(handAchievementIds(text)).toEqual(['sfv_hand'])
  })
})

describe('#65 export', () => {
  it('the test mod: the files, SagaLib 1.3, the images loaded at startup, no dependency on Nexerelin or MagicLib', () => {
    const files = testModFiles(SIXTYFIVE_A)
    expect(files['mod_info.json']).toContain('"version": "1.3.0"')
    expect(files['mod_info.json']).not.toContain('"id": "nexerelin"')
    expect(files['mod_info.json']).not.toContain('"id": "MagicLib"')
    const csv = parseCsvRecords(files['data/config/magic_achievements.csv']).map((r) => r.fields)
    expect(csv[0]).toEqual(['id', 'name', 'description', 'tooltip', 'script', 'image', 'spoilerLevel', 'rarity'])
    expect(csv.find((r) => r[0] === 'sfv_second_done')).toEqual(['sfv_second_done', 'Test 65: second job done', 'Finished the second test job.', '', 'org.magiclib.achievements.MagicAchievement', '', 'HIDDEN', 'RARE'])
    expect(JSON.parse(files['data/config/settings.json']).graphics.sfv_images).toEqual(preloadImages(SIXTYFIVE_A.model()))
    expect(JSON.parse(files['data/sagaforge/quests/sfv_first.json']).skip.rewards).toHaveLength(2)
    expect(needsSagaLib13(SIXTYFIVE_A.model(), new Map())).toBe(true)
  })
  it('questSkip.json is merged: hand-written entries stay, a renamed chain replaces the old one', () => {
    const m = SIXTYFIVE_A.model()
    const base = testModFiles(SIXTYFIVE_A)
    const hand = JSON.parse(base['data/config/exerelin/questSkip.json'])
    hand.questChains.sfv_hand = { name: 'By hand', image: 'x.png', quests: ['sfv_hq'] }
    hand.quests.sfv_hq = { name: 'Hand quest' }
    const files = { ...base, 'data/config/exerelin/questSkip.json': JSON.stringify(hand, null, 2) }
    m.project.exported = JSON.parse(base['sagaforge/project.json']).exported
    m.project.questSkip![0].id = 'sfv_line'
    const state = testModState(SIXTYFIVE_A, m, files)
    for (const w of modelToWrites(m, state)) if (!w.remove) state.files[w.path] = { text: w.text, hash: hashText(w.text) }
    const plan = planExport(m, state, index, null, {})
    const out = JSON.parse(plan.writes.find((w) => w.path === 'data/config/exerelin/questSkip.json')!.text)
    expect(Object.keys(out.questChains).sort()).toEqual(['sfv_hand', 'sfv_line'])
    expect(Object.keys(out.quests).sort()).toEqual(['sfv_first', 'sfv_hq', 'sfv_second'])
  })
})

describe('#65 checks', () => {
  it('the test mod has no problems of its own', () => {
    const m = SIXTYFIVE_A.model()
    expect([...achievementProblems(ctx(m)), ...questSkipProblems(ctx(m))].filter((p) => p.level !== 'info').map((p) => p.message)).toEqual([])
    expect(flagProblems(buildRegistry(m, []), m.project.prefix).filter((p) => p.level !== 'info').map((p) => p.message)).toEqual([])
  })
  it('a chain without an image, a mismatched prerequisite, a quest in two chains, a bad ending, a long name', () => {
    const m = SIXTYFIVE_A.model()
    const c = m.project.questSkip![0]
    c.image = ''
    c.quests[0].ending = 'lost'
    c.quests[1].name = 'Test 65: the second job, a long name'
    m.project.questSkip!.push({ id: 'sfv_other', name: 'Other', image: 'x.png', quests: [{ quest: 'sfv_first', ending: 'nope' }] })
    const keys = questSkipProblems(ctx(m)).map((p) => `${p.level}:${p.key}`)
    expect(keys).toContain('error:skipnoimage:sfv_chain')
    expect(keys).toContain('warning:skipmismatch:sfv_second:sfv_first')
    expect(keys).toContain('error:skiptwice:sfv_first')
    expect(keys).toContain('error:skipending:sfv_first')
    expect(keys).toContain('info:skiplong:sfv_second')
  })
  it('an achievement never unlocked, one without a name, a quest unlocking another mod\'s, an empty action', () => {
    const m = SIXTYFIVE_A.model()
    m.project.achievements!.push({ id: 'sfv_lonely', name: '', description: '', spoiler: 'VISIBLE', rarity: 'COMMON' })
    const helped = first(m).nodes.find((n) => n.id === 'helped')!
    if (helped.type === 'action') helped.ops.push({ op: 'achievement', achievement: 'other_mod_ach' }, { op: 'achievement', achievement: '' })
    const keys = achievementProblems(ctx(m)).map((p) => `${p.level}:${p.key}`)
    expect(keys).toEqual(expect.arrayContaining(['warning:achunused:sfv_lonely', 'error:achnoname:sfv_lonely', 'info:achother:sfv_first:other_mod_ach', 'error:achop:sfv_first:helped']))
  })
  it('Nexerelin and MagicLib not in the mod\'s list: Problems asks (optional suggested)', () => {
    const m = SIXTYFIVE_A.model()
    m.project.mods = []
    const p = modProblems(ctx(m)).filter((x) => x.key?.startsWith('modunlisted:'))
    expect(p.map((x) => x.key).sort()).toEqual(['modunlisted:MagicLib', 'modunlisted:nexerelin'])
    expect(p.every((x) => x.fixes?.[0].label === 'Add as optional')).toBe(true)
  })
})

describe('#65 shared drop groups (PLAN.md §10.7, question 5)', () => {
  // the throwaway test mods are archived in "old test mods" (2026-11-24); a rebuilt one is back in mods
  const MODS = [path.resolve(__dirname, '..', '..', '..', 'mods'), path.resolve(__dirname, '..', '..', '..', 'old test mods')].find((d) => fs.existsSync(path.join(d, 'eight_a_twin'))) ?? path.resolve(__dirname, '..', '..', '..', 'mods')
  const rowsOf = (mod: string): DropGroupRow[] => {
    const f = path.join(MODS, mod, 'data', 'campaign', 'procgen', 'drop_groups.csv')
    return handDropRows(fs.readFileSync(f, 'utf8').replace(/^#.*$/gm, '')).map((r) => ({ ...r, freq: 100, definedBy: mod }))
  }
  it.skipIf(!fs.existsSync(path.join(MODS, 'eight_a_twin')))('eight_a + eight_a_twin, the same row: the warning fires (the twin is installed next to it)', () => {
    const m = EIGHT_A.model()
    const idx = { items: [{ id: 'alpha_core', name: 'Alpha Core', kind: 'commodity' }], weapons: [], wings: [], factions: [], customEntityTypes: [], dropGroups: [...rowsOf('eight_a'), ...rowsOf('eight_a_twin')] }
    expect(rowsOf('eight_a_twin')).toEqual([{ item: 'alpha_core', group: 'ai_cores1', freq: 100, definedBy: 'eight_a_twin' }])
    const out = poolProblems({ model: m, index: idx, loaded: { sourceId: 'eight_a', files: {} } } as unknown as CheckContext)
    const w = out.find((p) => p.key === 'addsdup:sea_more_alphas:alpha_core')
    expect(w?.level).toBe('warning')
    expect(w?.message).toContain('eight_a_twin')
    expect(w?.message).toContain("don't add up")
    // its own row doesn't count as "already there"
    const alone = poolProblems({ model: m, index: { ...idx, dropGroups: rowsOf('eight_a') }, loaded: { sourceId: 'eight_a', files: {} } } as unknown as CheckContext)
    expect(alone.some((p) => p.key?.startsWith('addsdup:'))).toBe(false)
  })
  it('a hand-written row of the mod\'s own drop_groups.csv is checked too (rows in Saga Forge\'s block are the pools\')', () => {
    const m = EIGHT_A.model()
    m.pools = []
    const text = 'commodity,group,freq\nalpha_core,ai_cores1,50\ngamma_core,own_group,5\n# sagaforge:begin loot hash=0 (generated by Saga Forge; edits here are overwritten),,\nbeta_core,ai_cores1,1\n# sagaforge:end loot,,\n'
    expect(handDropRows(text)).toEqual([{ item: 'alpha_core', group: 'ai_cores1' }, { item: 'gamma_core', group: 'own_group' }])
    const idx = { items: [], weapons: [], wings: [], factions: [], customEntityTypes: [], dropGroups: [{ group: 'ai_cores1', item: 'alpha_core', freq: 100, definedBy: 'eight_a_twin' }, { group: 'ai_cores1', item: 'beta_core', freq: 1, definedBy: 'eight_a_twin' }] }
    const out = poolProblems({ model: m, index: idx, loaded: { sourceId: 'eight_a', files: { 'data/campaign/procgen/drop_groups.csv': { text, hash: '' } } } } as unknown as CheckContext)
    expect(out.filter((p) => p.key?.startsWith('handdropdup:')).map((p) => p.key)).toEqual(['handdropdup:ai_cores1:alpha_core'])
  })
})
