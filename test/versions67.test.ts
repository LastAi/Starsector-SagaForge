/**
 * #67 U18 (SagaLib 1.4): versions by a setting fixed at new game. A setting marked for versions
 * (Boolean or Radio) gives setting tokens `setting:<id>=<value>` in a version's mods: resolution,
 * the strip's cells, the export (settingsWith, never in modsWith), Play's on-set and the checks.
 */
import { describe, expect, it } from 'vitest'
import { cellInfo, combinationCount, comboKey, comboOf, editInVersion, emitRuntimeVersions, mentionedMods, resolveItem, resolveRuntime, rtVersion, subsets, withRuntimeVersions, type ItemVersion } from '../src/shared/itemversions'
import { versionCells } from '../src/shared/modlist'
import { settingTokensOn, tokenLabel, tokenProblem, versionSettings } from '../src/shared/settings'
import { chooseVersions, chosenVersion, recordSettings, runtimeMentioned, settingRecordKey, type VersionedJson } from '../src/shared/play'
import { usesSettingVersions, versionedRuleRows } from '../src/shared/modelversions'
import { needsSagaLib14 } from '../src/shared/export/runtime'
import { compileQuest } from '../src/shared/export/questrules'
import { checkModel } from '../src/shared/checks'
import { testModFiles } from './fixtures/testmod'
import { SIXTYFOUR_A, MOD1, MOD2 } from './fixtures/sixtyfour'
import { parseLooseObject } from '../src/shared/loosejson'
import type { PersonDef, SettingDef } from '../src/shared/model'
import type { ModModel } from '../src/shared/serialize'

const HARD = 'setting:sfa_hard=true'
const SOUTH = 'setting:sfa_route=South'
const NORTH = 'setting:sfa_route=North'

const settings = (): SettingDef[] => [
  { id: 'sfa_hard', label: 'Hard mode', type: 'Boolean', default: 'false', versions: true },
  { id: 'sfa_route', label: 'Route', type: 'Radio', default: 'North', choices: ['North', 'South', 'East'], versions: true },
  { id: 'sfa_bonus', label: 'Bonus', type: 'Int', default: '100' },
  { id: 'sfa_plain', label: 'Plain', type: 'Boolean', default: 'true' }
]

const person = (): PersonDef & { versions: ItemVersion[] } => ({
  id: 'r', name: { first: 'Ilse', last: 'Reyes' }, gender: 'FEMALE', faction: 'independent', rank: '', post: '', portrait: 'a.png',
  placement: { at: 'market', market: 'home', inCommDirectory: true }, tags: [], phrases: [],
  versions: [
    { mods: [HARD], set: { portrait: 'hard.png' } },
    { mods: ['m1'], set: { 'placement.market': 'away' } },
    { mods: ['m1', HARD].sort(), set: { 'name.last': 'Vale' } },
    { mods: [SOUTH], set: { 'placement.market': 'south' } }
  ]
})

describe('#67 U18 setting tokens: keys and resolution', () => {
  it('a token goes through comboKey / comboOf and sorts with the mods (Java String order)', () => {
    expect(comboKey([HARD, 'm1'])).toBe('m1+setting:sfa_hard=true')
    expect(comboOf('m1+setting:sfa_hard=true')).toEqual(['m1', HARD])
  })
  it('resolves by the tokens that count; the most specific wins (a token counts like a mod)', () => {
    const p = person()
    expect(resolveItem(p, []).value.portrait).toBe('a.png')
    expect(resolveItem(p, [HARD]).value.portrait).toBe('hard.png')
    expect(resolveItem(p, ['setting:sfa_hard=false']).value.portrait).toBe('a.png')
    const both = resolveItem(p, ['m1', HARD]).value
    expect([both.name.last, both.portrait, (both.placement as { market: string }).market]).toEqual(['Vale', 'hard.png', 'away'])
    expect(resolveItem(p, [SOUTH]).value.placement).toMatchObject({ market: 'south' })
    // m1 and South both set the market with the same specificity: the cell that combines them must decide
    expect(resolveItem(p, ['m1', SOUTH]).conflicts).toEqual(['placement.market'])
  })
  it('subsets never hold two values of one setting; tokens aren\'t counted in max', () => {
    const s = subsets(['a', SOUTH, NORTH, HARD], 1)
    expect(s.some((c) => c.includes(SOUTH) && c.includes(NORTH))).toBe(false)
    expect(s.length).toBe(2 * 3 * 2)
    expect(combinationCount(['a', SOUTH, NORTH, HARD])).toBe(12)
  })
  it('edits in a token cell are stored in that version; cellInfo lists its fields and conflicts', () => {
    const p = person()
    editInVersion(p, [SOUTH], (x) => { x.name.first = 'Ana' })
    expect(p.versions.find((v) => comboKey(v.mods) === SOUTH)?.set).toEqual({ 'placement.market': 'south', 'name.first': 'Ana' })
    expect(cellInfo(p, ['m1', SOUTH]).conflicts.map((c) => c.path)).toEqual(['placement.market'])
  })
})

describe('#67 U18 cells and labels', () => {
  const project = { mods: [{ id: 'm1', name: 'Mod One', use: 'optional' as const }, { id: 'm2', name: 'Mod Two', use: 'optional' as const }], settings: settings() }
  it('mod subsets, then each value alone and with each single mod (only marked Boolean / Radio settings)', () => {
    const keys = versionCells(project).map(comboKey)
    expect(keys.slice(0, 4)).toEqual(['base', 'm1', 'm2', 'm1+m2'])
    for (const t of [HARD, 'setting:sfa_hard=false', NORTH, SOUTH, 'setting:sfa_route=East']) {
      expect(keys).toContain(t)
      expect(keys).toContain(comboKey(['m1', t]))
      expect(keys).toContain(comboKey(['m2', t]))
      expect(keys).not.toContain(comboKey(['m1', 'm2', t]))
    }
    expect(keys.some((k) => k.includes('sfa_bonus') || k.includes('sfa_plain'))).toBe(false)
    // #67 U37: the player's gender (male, female) is always there too
    expect(keys.length).toBe(4 + 7 * 3)
    // items and descriptions: no setting cells
    expect(versionCells(project, 4, false).length).toBe(4)
  })
  it('a choice with "+" gives no cell; labels read "Route = South", "Hard mode = on"', () => {
    const defs = settings()
    defs[1].choices = ['North', 'A+B']
    expect(versionCells({ mods: [], settings: defs }).map(comboKey)).not.toContain('setting:sfa_route=A+B')
    expect(tokenLabel(SOUTH, settings())).toBe('Route = South')
    expect(tokenLabel(HARD, settings())).toBe('Hard mode = on')
    expect(tokenLabel('setting:sfa_hard=false', settings())).toBe('Hard mode = off')
  })
  it('token problems: missing, not marked, wrong type, a value it can\'t take', () => {
    const defs = settings()
    expect(tokenProblem(HARD, defs)).toBeNull()
    expect(tokenProblem('setting:nope=true', defs)).toMatch(/doesn't exist/)
    expect(tokenProblem('setting:sfa_plain=true', defs)).toMatch(/isn't marked/)
    expect(tokenProblem('setting:sfa_bonus=5', defs)).toMatch(/only on\/off and choice/)
    expect(tokenProblem('setting:sfa_route=West', defs)).toMatch(/can't be "West"/)
    expect(versionSettings(defs).map((s) => s.id)).toEqual(['sfa_hard', 'sfa_route', 'player_gender'])
  })
})

describe('#67 U18 Play mode', () => {
  it('counts the Test context\'s values of the marked settings (defaults when unset)', () => {
    expect(settingTokensOn(settings(), {})).toEqual(['setting:sfa_hard=false', NORTH])
    expect(settingTokensOn(settings(), { sfa_hard: 'true', sfa_route: 'South', sfa_plain: 'false' })).toEqual([HARD, SOUTH])
    // a choice the setting doesn't have: the default, as SagaLib
    expect(settingTokensOn(settings(), { sfa_route: 'West' })).toEqual(['setting:sfa_hard=false', NORTH])
    const on = ['m1', ...settingTokensOn(settings(), { sfa_hard: 'true' })]
    expect(resolveItem(person(), on).value.name.last).toBe('Vale')
  })
  it('chooses from the recorded values (SagaLib\'s algorithm); a later change keeps the choice', () => {
    const mem = new Map<string, unknown>()
    const e = { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => { mem.set(k, v) } }
    const item = { id: 'r', portrait: 'a.png', versions: [{ id: HARD, settingsWith: ['sfa_hard=true'], set: { portrait: 'hard.png' } }] }
    const v: VersionedJson = { kind: 'person', owner: 'sfa', item }
    expect(runtimeMentioned(item)).toEqual([HARD])
    recordSettings(e as never, settings(), { sfa_hard: 'true' })
    expect(mem.get(settingRecordKey('sfa_hard'))).toBe('true')
    expect(mem.get(settingRecordKey('sfa_route'))).toBe('North')
    chooseVersions(e as never, { lists: [], enabled: new Set() }, [v])
    expect(chosenVersion(e as never, v)).toEqual({ id: 'r', portrait: 'hard.png' })
    recordSettings(e as never, settings(), { sfa_hard: 'false' })
    expect(mem.get(settingRecordKey('sfa_hard'))).toBe('true')
  })
})

describe('#67 U18 export', () => {
  it('settingsWith for tokens, never inside modsWith; specificity counts them', () => {
    const p = person()
    const vs = emitRuntimeVersions(mentionedMods(p), (on) => resolveItem(p, on).value as never).versions
    for (const v of vs) expect((v.modsWith ?? []).some((x) => x.startsWith('setting:'))).toBe(false)
    expect(vs.find((v) => v.id === HARD)).toEqual({ id: HARD, settingsWith: ['sfa_hard=true'], set: { portrait: 'hard.png' } })
    expect(vs.find((v) => v.id === 'm1+setting:sfa_hard=true')).toMatchObject({ modsWith: ['m1'], settingsWith: ['sfa_hard=true'] })
    const json = withRuntimeVersions(mentionedMods(p), (on) => resolveItem(p, on).value as never)
    for (const c of subsets(mentionedMods(p))) expect(resolveRuntime(json, c).value).toEqual(resolveItem(p, c).value)
  })
  it('a token whose version changes only dialog still gets an empty version (SagaLib must mention it to set the quest flag)', () => {
    const json = withRuntimeVersions([SOUTH], () => ({ id: 'q' }))
    expect(json.versions).toEqual([{ id: SOUTH, settingsWith: ['sfa_route=South'], set: {} }])
  })

  const model = (): ModModel => {
    const m = SIXTYFOUR_A.model()
    m.project.settings = settings()
    const r = m.people.find((x) => x.id === 'sfa_reyes')!
    r.versions = [...(r.versions ?? []), { mods: [HARD], set: { portrait: 'graphics/portraits/portrait_pirate01.png' } }]
    const q = m.quests.find((x) => x.id === 'sfa_meet')!
    q.versions = [...(q.versions ?? []), { mods: [SOUTH], set: { 'nodes[offer].text': '"South it is." (Test 67: the Route = South version.)' } }]
    return m
  }
  const files = testModFiles({ ...SIXTYFOUR_A, model })
  it('the person file carries settingsWith; the quest dialog tests the token\'s flag; mod_info asks for SagaLib 1.4', () => {
    const people = JSON.parse(files['data/sagaforge/people/sixtyfour_a_people.json'])
    const r = people.people.find((p: { id: string }) => p.id === 'sfa_reyes')
    expect(r.versions.some((v: { settingsWith?: string[] }) => v.settingsWith?.includes('sfa_hard=true'))).toBe(true)
    expect(runtimeMentioned(r)).toEqual([MOD2, MOD1, HARD].sort())
    expect(r.versions.every((v: { modsWith?: string[] }) => !(v.modsWith ?? []).some((x) => x.startsWith('setting:')))).toBe(true)
    expect(resolveRuntime(r, [HARD]).value).toMatchObject({ portrait: 'graphics/portraits/portrait_pirate01.png' })
    const q = JSON.parse(files['data/sagaforge/quests/sfa_meet.json'])
    expect(runtimeMentioned(q)).toContain(SOUTH)
    expect(files['data/campaign/rules.csv']).toContain('$global.sfv_sfa_meet_setting_sfa_route_South score:100')
    expect(parseLooseObject(files['mod_info.json']).value.dependencies).toContainEqual({ id: 'lastai_sagalib', name: 'SagaLib', version: '1.4.0' })
    // the mods list names mods only
    expect(files['data/sagaforge/mods.json']).not.toContain('setting:')
  })
  it('needs SagaLib 1.4 only with a setting version', () => {
    const m = model()
    expect(usesSettingVersions(m)).toBe(true)
    expect(needsSagaLib14(m)).toBe(true)
    expect(usesSettingVersions(SIXTYFOUR_A.model())).toBe(false)
  })
  it('dialog rules: no rule for two values of one setting', () => {
    const q = model().quests.find((x) => x.id === 'sfa_meet')!
    q.versions = [{ mods: [SOUTH], set: { 'nodes[offer].text': 'S' } }, { mods: [NORTH], set: { 'nodes[offer].text': 'N' } }]
    const r = versionedRuleRows(q.id, [NORTH, SOUTH], (on) => resolveItem(q, on).value, (x) => compileQuest(x, { sagalib: true, phrases: [] }).rows)
    expect(r.extra).toBe(2)
    expect(r.rows.some((x) => x.conditions.includes('sfa_route_South') && x.conditions.includes('sfa_route_North'))).toBe(false)
  })
})

describe('#67 U18 checks', () => {
  const index = { factions: [], items: [], people: [], markets: [], systems: [], sources: [], hulls: [], variants: [], weapons: [], wings: [], portraits: [], illustrations: [], customEntityTypes: [], planetTypes: [], conditions: [], industries: [], submarkets: [], ruleCounts: {}, problems: [], extensions: [] }
  const loaded = { sourceId: 'sixtyfour_a', files: {}, modInfo: { id: 'sixtyfour_a', name: 'x', version: '1', gameVersion: '', dependencies: [] }, factions: [] }
  const check = (m: ModModel) => checkModel({ model: m, index: index as never, defs: { ranks: [], posts: [] } as never, loaded: loaded as never, rules: null, styleChecks: false }).filter((p) => p.area === 'Versions')
  it('a setting that is missing, not marked, of another type, or a value it can\'t take: an error each', () => {
    const m = SIXTYFOUR_A.model()
    m.project.settings = settings()
    const r = m.people.find((x) => x.id === 'sfa_reyes')!
    const bad = ['setting:nope=true', 'setting:sfa_plain=false', 'setting:sfa_bonus=5', 'setting:sfa_route=West']
    r.versions = [...(r.versions ?? []), ...bad.map((t) => ({ mods: [t], set: { portrait: `${t}.png` } })), { mods: [HARD], set: { portrait: 'ok.png' } }]
    const errs = check(m).filter((p) => p.level === 'error' && p.key?.startsWith('versetting:'))
    expect(errs.map((p) => p.key).sort()).toEqual(bad.map((t) => `versetting:person:sfa_reyes:${t}`).sort())
    expect(errs.find((p) => p.key!.endsWith('sfa_route=West'))!.message).toMatch(/can't be "West"/)
    // tokens are never reported as mods that aren't optional
    expect(check(m).some((p) => p.key?.startsWith('vermod:') && p.key.includes('setting:'))).toBe(false)
  })
  it('a marked choice with "+", a version with two values of one setting, an item version by a setting', () => {
    const m = SIXTYFOUR_A.model()
    m.project.settings = settings()
    m.project.settings[1].choices = ['North', 'A+B']
    const r = m.people.find((x) => x.id === 'sfa_reyes')!
    r.versions = [...(r.versions ?? []), { mods: [HARD, 'setting:sfa_hard=false'], set: { portrait: 'x.png' } }]
    m.items.push({ id: 'sfa_thing', name: 'Thing', versions: [{ mods: [HARD], set: { name: 'Hard thing' } }] } as never)
    const p = check(m)
    expect(p.some((x) => x.level === 'error' && x.key === 'versetplus:sfa_route')).toBe(true)
    expect(p.some((x) => x.level === 'error' && x.key?.startsWith('versettwice:person:sfa_reyes'))).toBe(true)
    expect(p.find((x) => x.key === `versetting:item:sfa_thing:${HARD}`)?.message).toMatch(/can't pick them/)
  })
  it('a conflict between a mod version and a setting version is asked in their combined cell', () => {
    const m = SIXTYFOUR_A.model()
    m.project.settings = settings()
    const r = m.people.find((x) => x.id === 'sfa_reyes')!
    r.versions = [...(r.versions ?? []), { mods: [HARD], set: { 'name.last': 'Hardy' } }]
    expect(check(m).some((x) => x.level === 'error' && x.key === `verconflict:person:sfa_reyes:${comboKey([MOD2, HARD])}:name.last`)).toBe(true)
  })
})

describe('#67 U37 versions by the player\'s gender', () => {
  const MALE = 'setting:player_gender=MALE', FEMALE = 'setting:player_gender=FEMALE'
  it('always offered (no setting needed), labelled "Player = female", valid everywhere settings are', () => {
    const keys = versionCells({ mods: [], settings: [] }).map(comboKey)
    expect(keys).toEqual(['base', MALE, FEMALE])
    expect(tokenLabel(FEMALE, [])).toBe('Player = female')
    expect(tokenProblem(FEMALE, undefined)).toBeNull()
    expect(tokenProblem('setting:player_gender=ANY', [])).toMatch(/can't be "ANY"/)
    // items and descriptions are chosen before any save: no cells there
    expect(versionCells({ mods: [], settings: [] }, 4, false)).toEqual([[]])
  })
  it('Play mode and the dialog preview use the Test context\'s player', () => {
    expect(settingTokensOn([], {}, 'FEMALE')).toEqual([FEMALE])
    expect(settingTokensOn([], {})).toEqual([])
  })
})

describe('#67 U37 export', () => {
  it('a version for a female player exports as settingsWith player_gender=FEMALE (what SagaLib records)', () => {
    expect(rtVersion(['setting:player_gender=FEMALE'], { firstName: 'Joan' })).toEqual({ id: 'setting:player_gender=FEMALE', settingsWith: ['player_gender=FEMALE'], set: { firstName: 'Joan' } })
  })
})
