/**
 * Task #62: a LunaLib settings page for the mod (Saga › Settings, PLAN.md §10.4). The shared golden
 * case settings.json (SagaLib) covers the runtime: the values in $global.<id>, the defaults
 * without LunaLib, the multipliers. These cover the export, the Problems lines, the flags
 * registry, the condition pickers' lines and Play mode's memory.
 */
import { describe, expect, it } from 'vitest'
import { testModFiles, testModState } from './fixtures/testmod'
import { SIXTYTWO_A } from './fixtures/sixtytwo'
import { settingProblems } from '../src/shared/checks/settings'
import { modUses } from '../src/shared/moduses'
import { buildRegistry } from '../src/shared/flags'
import { needsSagaLib13 } from '../src/shared/export/runtime'
import { planExport } from '../src/shared/export'
import { parseCsvRecords } from '../src/shared/csvedit'
import { planTexts } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, rewardCredits, fleetPoints, sagaHooks, type SimWorld } from '../src/shared/play'
import { runtimeScale, scaleFactor, settingConditionTemplates, settingRow, settingsMemory, settingsRead, settingValue, usesSettings, LUNA_SETTINGS_CSV, LUNA_SETTINGS_CONFIG } from '../src/shared/settings'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'

const idx = (): GameIndex => ({ factions: [{ id: 'pirates', name: 'Pirates' }, { id: 'independent', name: 'Independent' }], items: [], people: [], markets: [], sources: [], activeSourceId: 'sixtytwo_a' } as unknown as GameIndex)
function ctx(m = SIXTYTWO_A.model()): CheckContext {
  return { model: m, index: idx(), defs: defsFor('0.98a-RC8'), loaded: testModState(SIXTYTWO_A, m, planTexts(m)), rules: null, styleChecks: false }
}

describe('LunaLib settings page (task #62)', () => {
  it('exports LunaSettings.csv in an owned block, lists it for SagaLib, and needs SagaLib 1.3 but not LunaLib', () => {
    const files = testModFiles(SIXTYTWO_A)
    const csv = files[LUNA_SETTINGS_CSV]
    expect(csv.split('\n')[0]).toBe('fieldID,fieldName,fieldType,defaultValue,secondaryValue,fieldDescription,minValue,maxValue,tab')
    expect(csv).toContain('# sagaforge:begin settings')
    const rows = parseCsvRecords(csv).map((r) => r.fields).filter((f) => f[0] && !f[0].startsWith('#')).slice(1)
    expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([
      ['sta_h_story', 'Header', 'Test 62 story options'], ['sta_side_job', 'Boolean', 'true'], ['sta_difficulty', 'Radio', 'Normal'], ['sta_bonus', 'Int', '100'], ['sta_note', 'Text', 'These settings are shared by every save.']
    ])
    expect(rows[2][4]).toBe('Easy,Normal,Hard')
    expect([rows[3][6], rows[3][7]]).toEqual(['0', '300'])
    expect(files['data/config/sagaforge/content.csv']).toContain('sixtytwo_a_settings,settings,data/config/LunaSettings.csv,sixtytwo_a')
    expect(files['mod_info.json']).toContain('"version": "1.3.0"')
    expect(files['mod_info.json']).not.toContain('lunalib')
    // no icon: no LunaSettingsConfig.json
    expect(files[LUNA_SETTINGS_CONFIG]).toBeUndefined()
  })

  it('writes the scales as SagaLib reads them: an Int setting is a percent (per 100)', () => {
    const files = testModFiles(SIXTYTWO_A)
    const q = JSON.parse(files['data/sagaforge/quests/sta_courier.json'])
    expect(q.rewards).toEqual([
      { id: 'pay', credits: 10000, creditsScale: { setting: 'sta_difficulty', factors: { Easy: 0.5, Normal: 1, Hard: 2 } } },
      { id: 'bonus', credits: 1000, creditsScale: { setting: 'sta_bonus', per: 100 } }
    ])
    expect(q.requires).toEqual(['$global.sta_side_job'])
    expect(JSON.parse(files['data/sagaforge/encounters/sta_raiders.json']).fleet.sizeScale).toEqual({ setting: 'sta_difficulty', factors: { Easy: 0.5, Normal: 1, Hard: 2.5 } })
    // the switch is a prerequisite: the option-start rule tests it
    expect(files['data/campaign/rules.csv']).toMatch(/sta_courier_start[^\n]*\n?[^\n]*\$global\.sta_side_job/)
  })

  it('a scale on a fleet that is not sized by points is left out (with a warning)', () => {
    const m = SIXTYTWO_A.model()
    m.encounters[0].fleet.size = 'explicit'
    m.encounters[0].fleet.variants = ['wolf_Assault']
    const files = testModFiles({ ...SIXTYTWO_A, model: () => m })
    expect(JSON.parse(files['data/sagaforge/encounters/sta_raiders.json']).fleet.sizeScale).toBeUndefined()
    expect(settingProblems(ctx(m)).map((p) => p.key)).toContain('scalefleetsize:sta_raiders')
  })

  it('writes LunaSettingsConfig.json with the icon, and keeps hand-written rows of LunaSettings.csv', () => {
    const m = SIXTYTWO_A.model()
    m.project.settingsIcon = 'graphics/icons/mod/sta_icon.png'
    const hand = 'fieldID,fieldName,fieldType,defaultValue,secondaryValue,fieldDescription,minValue,maxValue,tab\nsta_mine,Hand made,Boolean,false,,,,,\n'
    const loaded = testModState(SIXTYTWO_A, m, { ...planTexts(m), [LUNA_SETTINGS_CSV]: hand })
    const plan = planExport(m, loaded, idx(), null, { addDependency: true })
    const w = Object.fromEntries(plan.writes.map((x) => [x.path, x.text]))
    expect(JSON.parse(w[LUNA_SETTINGS_CONFIG].replace(/,(\s*[}\]])/g, '$1'))).toEqual({ sixtytwo_a: { iconPath: 'graphics/icons/mod/sta_icon.png' } })
    expect(w[LUNA_SETTINGS_CSV]).toContain('sta_mine,Hand made,Boolean,false')
    expect(w[LUNA_SETTINGS_CSV]).toContain('sta_side_job,Enable the courier job')
    // no settings and no block: a hand-made file isn't touched
    const m2 = SIXTYTWO_A.model()
    m2.project.settings = []
    const p2 = planExport(m2, testModState(SIXTYTWO_A, m2, { ...planTexts(m2), [LUNA_SETTINGS_CSV]: hand }), idx(), null, { addDependency: true })
    expect(p2.writes.some((x) => x.path === LUNA_SETTINGS_CSV)).toBe(false)
  })

  it('reads values as SagaLib: Boolean true/false, whole Int, Radio falls back to the default for an unknown choice', () => {
    expect(settingValue('Boolean', 'TRUE')).toBe(true)
    expect(settingValue('Boolean', 'yes')).toBeUndefined()
    expect(settingValue('Int', '4.0')).toBe(4)
    expect(settingValue('Int', '1.5')).toBeUndefined()
    expect(settingValue('Double', '1.5')).toBe(1.5)
    const defs = SIXTYTWO_A.model().project.settings!
    const mem = settingsMemory(defs, { sta_difficulty: 'Brutal', sta_bonus: '150' })
    expect(Object.fromEntries(mem)).toEqual({ '$global.sta_side_job': true, '$global.sta_difficulty': 'Normal', '$global.sta_bonus': 150 })
  })

  it('scales: percent, factors, unknown values, clamping', () => {
    const defs = SIXTYTWO_A.model().project.settings!
    const get = (vals: Record<string, unknown>) => (k: string) => vals[k]
    expect(runtimeScale({ setting: 'sta_bonus' }, defs)).toEqual({ setting: 'sta_bonus', per: 100 })
    expect(scaleFactor(runtimeScale({ setting: 'sta_bonus' }, defs), get({ '$global.sta_bonus': 250 }))).toBe(2.5)
    expect(scaleFactor({ setting: 'sta_difficulty', factors: { Hard: 2 } }, get({ '$global.sta_difficulty': 'Easy' }))).toBe(1)
    expect(scaleFactor({ setting: 'x', per: 1 }, get({ '$global.x': 1e9 }))).toBe(100)
    expect(scaleFactor({ setting: 'x', per: 1 }, get({ '$global.x': -3 }))).toBe(0)
    expect(scaleFactor({ setting: 'x' }, get({}))).toBe(1)
  })

  it('Play mode: the defaults, then a menu change, scale the pay and the raiders', () => {
    const m = SIXTYTWO_A.model()
    const ctx2 = newContext()
    for (const [k, v] of settingsMemory(m.project.settings!, {})) ctx2.memory.set(k, v)
    const w: SimWorld = { quests: m.quests, phrases: new Map(), settings: m.project.settings, encounters: m.encounters }
    const e = new Engine(compileRules([]), ctx2, sagaHooks(w, newSimState()))
    const q = m.quests.find((x) => x.id === 'sta_courier')!
    expect(rewardCredits(e, q.rewards[0], w)).toBe(10000)
    expect(rewardCredits(e, q.rewards[1], w)).toBe(1000)
    expect(fleetPoints(e, w, 'sta_raiders')).toBe(40)
    e.set('$global.sta_difficulty', 'Hard')
    e.set('$global.sta_bonus', 150)
    expect(rewardCredits(e, q.rewards[0], w)).toBe(20000)
    expect(rewardCredits(e, q.rewards[1], w)).toBe(1500)
    expect(fleetPoints(e, w, 'sta_raiders')).toBe(100)
    e.set('$global.sta_difficulty', 'Easy')
    expect(fleetPoints(e, w, 'sta_raiders')).toBe(20)
  })

  it('the flags registry marks settings, and what reads them', () => {
    const reg = buildRegistry(SIXTYTWO_A.model(), [])
    const sw = reg.get('$global.sta_side_job')!
    expect(sw.setting).toBe('Enable the courier job')
    expect(sw.setBy[0].detail).toMatch(/set by SagaLib on every load/)
    expect(sw.readBy.length).toBeGreaterThan(0)
    expect([...reg.get('$global.sta_bonus')!.types]).toEqual(['number'])
    expect(reg.get('$global.sta_difficulty')!.readBy.some((u) => /scales/.test(u.detail))).toBe(true)
    expect(reg.has('$global.sta_h_story')).toBe(false)
  })

  it('knows where settings are read, so a mod reading them needs SagaLib 1.3', () => {
    const m = SIXTYTWO_A.model()
    const r = settingsRead(m)
    expect([...r.keys()].sort()).toEqual(['sta_bonus', 'sta_difficulty', 'sta_side_job'])
    expect(usesSettings(m)).toBe(true)
    expect(needsSagaLib13(m, new Map())).toBe(true)
    const bare = SIXTYTWO_A.model()
    bare.quests = []
    bare.encounters = []
    expect(usesSettings(bare)).toBe(false)
  })

  it('the settings page counts as an (optional) use of LunaLib in Saga › Mods', () => {
    const m = SIXTYTWO_A.model()
    expect(modUses(m, idx(), { sourceId: 'sixtytwo_a', frameworkFiles: [LUNA_SETTINGS_CSV] }).get('lunalib')?.map((s) => s.key)).toEqual(['file:settings'])
    m.project.settings = []
    expect(modUses(m, idx(), { sourceId: 'sixtytwo_a', frameworkFiles: [] }).has('lunalib')).toBe(false)
  })

  it('condition picker lines', () => {
    const lines = settingConditionTemplates(SIXTYTWO_A.model().project.settings!).map((t) => t.line)
    expect(lines).toEqual(['$global.sta_side_job', '!$global.sta_side_job', '$global.sta_difficulty == Easy', '$global.sta_difficulty == Normal', '$global.sta_difficulty == Hard', '$global.sta_bonus >= 100'])
  })

  it('Problems: ids, defaults, choices, ranges, a choice no setting has, scales', () => {
    expect(settingProblems(ctx()).map((p) => p.key)).toEqual([])
    const m = SIXTYTWO_A.model()
    const s = m.project.settings!
    s.push({ id: 'other_x', label: 'X', type: 'Boolean', default: 'maybe' })
    s.push({ id: 'sta_bonus', label: 'Again', type: 'Int', default: '500', min: 10, max: 5 })
    s.push({ id: 'sta_pick', label: 'Pick', type: 'Radio', default: 'C', choices: ['A', 'B'] })
    s.push({ id: 'sta_name', label: 'Name', type: 'String', default: 'x' })
    m.quests[0].rewards[0].creditsScale = { setting: 'sta_name' }
    m.quests[0].rewards[1].creditsScale = { setting: 'sta_nothing' }
    m.encounters[0].fleet.sizeScale = { setting: 'sta_side_job', factors: { true: 1, false: 1 } }
    const st = m.quests.find((q) => q.id === 'sta_status')!
    const br = st.nodes.find((n) => n.id === 'brd')!
    if (br.type === 'branch') br.cases[0].conditions = ['$global.sta_difficulty == Hardd']
    const keys = settingProblems(ctx(m)).map((p) => `${p.level}:${p.key}`)
    expect(keys).toEqual(expect.arrayContaining([
      'warning:prefix:Setting:other_x', 'error:settingdefault:other_x', 'error:settingdup:sta_bonus', 'error:settingrange:sta_bonus',
      'warning:settingdefchoice:sta_pick', 'warning:settingchoice:sta_difficulty:Hardd:quest Test 62: check the settings',
      'warning:scaletype:sta_courier/pay', 'error:scalenone:sta_courier/bonus', 'warning:scaleones:enc:sta_raiders'
    ]))
  })

  it('a LunaSettings row: Header and Text show their label (LunaLib draws defaultValue), numbers get LunaLib\'s range', () => {
    expect(settingRow({ id: 'h', label: 'Head', type: 'Header', default: 'x' }).defaultValue).toBe('Head')
    expect(settingRow({ id: 'n', label: 'N', type: 'Double', default: '1.5' })).toMatchObject({ minValue: '0', maxValue: '100' })
  })
})

describe('an Arrive at a place without a market (found in game with sixtytwo_a, 2026-11-18)', () => {
  it('warns: vanilla\'s defaultOpenDialog shows only Leave there, so a menu option never appears', async () => {
    const { wreckOptionProblems } = await import('../src/shared/checks/quests')
    const m = SIXTYTWO_A.model()
    const q = m.quests.find((x) => x.id === 'sta_courier')!
    expect(wreckOptionProblems(q, m).map((p) => p.key)).toEqual([])
    const there = q.nodes.find((n) => n.id === 'there')!
    if (there.type === 'wait') there.takeover = false
    expect(wreckOptionProblems(q, m).map((p) => p.key)).toEqual(['plainarrive:sta_courier:there'])
    // a market makes its menu fire PopulateOptions
    m.systems[0].entities.find((e) => e.id === 'sta_drop')!.market = m.systems[0].entities.find((e) => e.id === 'sta_station')!.market
    expect(wreckOptionProblems(q, m)).toEqual([])
  })
})

describe('warnings added after the in-game check (user, 2026-11-18)', () => {
  it('a whole-number setting shown in text reads "100.0"', () => {
    const m = SIXTYTWO_A.model()
    expect(settingProblems(ctx(m)).filter((p) => p.key?.startsWith('settingintext:'))).toEqual([])
    const st = m.quests.find((q) => q.id === 'sta_status')!
    const offer = st.nodes.find((n) => n.id === 'offer')!
    if (offer.type === 'dialog') offer.text += ' Bonus: $global.sta_bonus percent.'
    expect(settingProblems(ctx(m)).map((p) => p.key)).toContain('settingintext:sta_bonus:quest Test 62: check the settings, node offer')
    // a condition on it is fine; the choice setting in text is fine
    expect(settingProblems(ctx(m)).filter((p) => p.key?.includes('sta_difficulty') || p.key?.includes('brb'))).toEqual([])
  })

  it('an arrival that takes over at a place without a menu and goes straight back to the menu', async () => {
    const { wreckOptionProblems } = await import('../src/shared/checks/quests')
    const m = SIXTYTWO_A.model()
    const q = m.quests.find((x) => x.id === 'sta_courier')!
    expect(wreckOptionProblems(q, m)).toEqual([])
    // without the closing Dialog: there → bonus → end → back to the menu
    q.edges = q.edges.map((e) => (e.id === 'd' ? { ...e, to: 'menu' } : e))
    expect(wreckOptionProblems(q, m).map((p) => p.key)).toEqual(['menulessclose:sta_courier:there'])
    // at a place with a market it goes back to that market's menu: fine
    m.systems[0].entities.find((e) => e.id === 'sta_drop')!.market = m.systems[0].entities.find((e) => e.id === 'sta_station')!.market
    expect(wreckOptionProblems(q, m)).toEqual([])
  })
})
