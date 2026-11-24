/**
 * Task #79 (SagaLib 1.4; docs/FORMATS.md "Plugins"): the Plugin node and the "Run a plugin" op run one
 * of the mod's own classes through SF_RunPlugin; the exported rules branch on the result kept in
 * $global.<quest>_<node>_result. Export rows, Play mode (it asks what the plugin returned), checks,
 * the class list read from the mod's jars, the SagaLib 1.4 dependency, the flags registry and the
 * script view. SagaLib's side: mods/SagaLib PluginTests and the golden case plugins.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { COIN, MISSING, PGA_JAR, SEVENTYNINE_A, SEVENTYNINE_JARS, pluginConversation } from './fixtures/seventynine'
import { testModState } from './fixtures/testmod'
import { compileQuest, nodeRuleId, startOptionId, optionId } from '../src/shared/export/questrules'
import { eventOpLines } from '../src/shared/export/events'
import { needsSagaLib14 } from '../src/shared/export/runtime'
import { planExport } from '../src/shared/export'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, pluginOutcome, PLUGIN_OPTION } from '../src/shared/play'
import { pluginProblems } from '../src/shared/checks/plugins'
import { buildRegistry, flagProblems } from '../src/shared/flags'
import { handlesOf, newNode } from '../src/shared/quest'
import { questScript } from '../src/shared/script'
import { skipEffects } from '../src/shared/questskip'
import { parsePluginCall, pluginLine, pluginToken, removePluginResult, renamePluginResult, usesPlugins, pluginClassChoices, unquotedOperator } from '../src/shared/plugins'
import { classHeader, jarsInfo, modJars } from '../src/main/jars'
import { makeZip } from '../src/main/zipwrite'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { parseLooseObject } from '../src/shared/loosejson'
import type { CheckContext } from '../src/shared/checks'
import type { GameIndex } from '../src/shared/api'
import type { JarInfo } from '../src/shared/project'
import type { PluginNode, QuestPlan } from '../src/shared/model'

const index = { sources: [], factions: [], people: [], markets: [], systems: [], items: [], hulls: [], weapons: [], hullmods: [], industries: [], variants: [], codeSystems: [], places: [] } as unknown as GameIndex
const model = (q: QuestPlan = pluginConversation()): ModModel => { const m = emptyModel('pga_'); m.quests.push(q); return m }
const ctx = (m: ModModel, jars: JarInfo[] | undefined = SEVENTYNINE_JARS): CheckContext => ({ model: m, index, defs: {} as never, loaded: { ...testModState(SEVENTYNINE_A, m, {}), jars }, rules: null, styleChecks: false })
const node = (q: QuestPlan, id: string) => q.nodes.find((n) => n.id === id) as PluginNode

describe('#79 the SF_RunPlugin line', () => {
  it('writes the class, where it comes from and the arguments, each "key=value" quoted (the game refuses an unquoted "=" in a command line)', () => {
    expect(pluginToken('chance', '0.5')).toBe('"chance=0.5"')
    expect(pluginToken('text', 'Hello "you"')).toBe('"text=Hello \'you\'"')
    expect(pluginToken('owner', '$faction.id')).toBe('"owner=$faction.id"')
    expect(pluginToken('empty', '')).toBe('"empty="')
    expect(pluginLine(' a.B ', [{ key: 'chance', value: '0.5' }, { key: ' ', value: 'skipped' }, { key: 'text', value: 'two words' }], { quest: 'q', node: 'n' }))
      .toBe('SF_RunPlugin a.B "quest=q" "node=n" "chance=0.5" "text=two words"')
    expect(pluginLine('a.B', [])).toBe('SF_RunPlugin a.B')
  })

  it('finds an "=" outside quotes in a hand-written line', () => {
    expect(unquotedOperator('SF_RunPlugin a.B "quest=q" chance=0.5 loud')).toBe('chance=0.5')
    expect(unquotedOperator('SF_RunPlugin a.B "quest=q" "text=a = b" loud')).toBeNull()
    expect(unquotedOperator('$global.x = 1')).toBeNull()
    const q = pluginConversation()
    q.nodes.push({ id: 'hand', type: 'action', x: 0, y: 0, ops: [{ op: 'line', line: 'SF_RunPlugin pga.plugins.CoinFlip node=x' }] })
    expect(pluginProblems(ctx(model(q))).find((p) => p.key === 'pluginunquoted:pga_test:hand:0')?.level).toBe('error')
  })

  it('reads a line as SagaLib does (golden case plugins.json has the rest)', () => {
    const mem: Record<string, unknown> = { '$global.x': 2 }
    expect(parsePluginCall(['a.B', 'quest=q', 'node=n', 'k=v=w', 'flag', 'n=$global.x', 'm=$global.none'], (k) => mem[k]))
      .toEqual({ className: 'a.B', quest: 'q', node: 'n', args: { k: 'v=w', flag: 'true', n: '2', m: '' } })
    expect(parsePluginCall([], () => undefined)).toBeNull()
  })
})

describe('#79 Plugin node: export', () => {
  const q = pluginConversation()
  const c = compileQuest(q, { sagalib: true, phrases: [] })
  const row = (id: string) => c.rows.find((r) => r.id === id)!

  it('runs the plugin, then fires its result trigger: one rule per connected result and a fallback', () => {
    const main = row(nodeRuleId(q, 'flip'))
    expect(main.trigger).toBe('DialogOptionSelected')
    expect(main.conditions).toBe(`$option == ${optionId(q, 'flip')}`)
    expect(main.script.split('\n')).toEqual([`SF_RunPlugin ${COIN} "quest=pga_test" "node=flip" "chance=0.5" "text=Test 79 (a): the coin spins in the air..." "owner=$faction.id"`, 'FireBest pga_test_flip_result'])
    expect(row('pga_test_flip_ok')).toMatchObject({ trigger: 'pga_test_flip_result', conditions: '$global.pga_test_flip_result == ok', script: 'FireBest pga_test_r_flip_ok' })
    expect(row('pga_test_flip_odd')).toMatchObject({ trigger: 'pga_test_flip_result', conditions: '$global.pga_test_flip_result == odd', script: 'FireBest pga_test_r_flip_odd' })
    expect(row('pga_test_flip_next')).toMatchObject({ trigger: 'pga_test_flip_result', conditions: '', script: 'FireBest pga_test_r_flip_next' })
    expect(c.nodeOf['pga_test_flip_ok']).toBe('flip')
    expect(c.usesSagaLib).toBe(true)
    expect(c.problems.filter((p) => p.level === 'error')).toEqual([])
  })

  it('a node without results is one rule: the line, then what follows', () => {
    expect(row(nodeRuleId(q, 'missing')).script.split('\n')).toEqual([`SF_RunPlugin ${MISSING} "quest=pga_test" "node=missing"`, 'FireBest pga_test_r_missing_next'])
    expect(c.rows.some((r) => r.trigger === 'pga_test_missing_result')).toBe(false)
  })

  it('a result that leads nowhere has no rule (it takes the fallback); nothing after the node goes back to the menu', () => {
    const q2 = pluginConversation()
    q2.edges = q2.edges.filter((e) => !(e.from === 'flip' && (e.handle === 'odd' || e.handle === 'next')))
    const c2 = compileQuest(q2, { sagalib: true, phrases: [] })
    expect(c2.rows.some((r) => r.id === 'pga_test_flip_odd')).toBe(false)
    expect(c2.rows.find((r) => r.id === 'pga_test_flip_next')?.script).toBe('SF_BackToMenu')
    // with no connected result at all: one rule
    q2.edges = q2.edges.filter((e) => e.from !== 'flip')
    const c3 = compileQuest(q2, { sagalib: true, phrases: [] })
    expect(c3.rows.find((r) => r.id === 'pga_test_flip')?.script.split('\n')[1]).toBe('SF_BackToMenu')
  })

  it('an Action\'s "Run a plugin" carries its quest and node; a world event\'s has neither', () => {
    expect(row(nodeRuleId(q, 'act')).script.split('\n')).toEqual([`SF_RunPlugin ${COIN} "quest=pga_test" "node=act" "chance=0" "text=Test 79 (c): the Action's plugin runs (chance 0: always tails)."`, 'FireBest pga_test_act_br'])
    expect(eventOpLines({ op: 'plugin', className: COIN, args: [{ key: 'chance', value: '1' }] })).toEqual([`SF_RunPlugin ${COIN} "chance=1"`])
    expect(eventOpLines({ op: 'plugin', className: ' ', args: [] })).toEqual([])
  })

  it('two rules with one id are an error (a node "x_ok" next to node "x" with the result "ok")', () => {
    const q2 = pluginConversation()
    const d = q2.nodes.find((n) => n.id === 'r_flip_ok')!
    q2.edges = q2.edges.map((e) => (e.from === d.id ? { ...e, from: 'flip_ok' } : e.to === d.id ? { ...e, to: 'flip_ok' } : e))
    d.id = 'flip_ok'
    const p = compileQuest(q2, { sagalib: true, phrases: [] }).problems.filter((x) => x.key?.startsWith('ruledup:'))
    expect(p.map((x) => x.message)).toEqual([expect.stringContaining('Two rules get the id pga_test_flip_ok')])
  })

  it('outputs: one per result, then "otherwise"; the template has none', () => {
    expect(handlesOf(node(q, 'flip')).map((h) => h.id)).toEqual(['ok', 'odd', 'next'])
    expect(handlesOf(node(q, 'missing'))).toEqual([{ id: 'next', label: '' }])
    expect(handlesOf({ ...node(q, 'flip'), results: ['ok', 'ok', '', 'next'] }).map((h) => h.id)).toEqual(['ok', 'next'])
    expect(newNode('plugin', 'p', 0, 0)).toEqual({ id: 'p', x: 0, y: 0, type: 'plugin', title: '', className: '', args: [], results: [] })
  })

  it('renaming a result moves its link; removing one drops it', () => {
    const q2 = pluginConversation()
    renamePluginResult(q2, 'flip', 'ok', 'heads')
    expect(node(q2, 'flip').results).toEqual(['heads', 'odd'])
    expect(q2.edges.find((e) => e.from === 'flip' && e.handle === 'heads')?.to).toBe('r_flip_ok')
    removePluginResult(q2, 'flip', 'odd')
    expect(q2.edges.some((e) => e.from === 'flip' && e.handle === 'odd')).toBe(false)
  })

  it('the script view names the plugin and its results; a quest skip notes that it doesn\'t run', () => {
    const blocks = questScript(q, model(q))
    expect(blocks.find((b) => b.node === 'flip')?.text).toBe('Flip a coin: the plugin CoinFlip runs (chance=0.5, text=Test 79 (a): the coin spins in the air..., owner=$faction.id). It returns ok / odd, or nothing.')
    const quest: QuestPlan = { ...pluginConversation(), kind: 'quest', id: 'pga_q' }
    quest.nodes.push({ id: 'won', type: 'end', x: 0, y: 0, outcome: 'success' })
    quest.edges = quest.edges.filter((e) => !(e.from === 'r_flip_ok')).concat({ id: 'w', from: 'r_flip_ok', handle: 'b_r_flip_ok', to: 'won' })
    expect(skipEffects(quest, 'won').notes.some((n) => n.includes('The plugin pga.plugins.CoinFlip'))).toBe(true)
  })
})

describe('#79 Play mode: the plugin can\'t run in the editor, so Play asks what it returned', () => {
  const start = () => {
    const q = pluginConversation()
    const sim = newSimState()
    const e = new Engine(compileRules(compileQuest(q, { sagalib: true, phrases: [] }).rows), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, sim))
    e.set('$id', 'pga_station')
    e.fireAll('PopulateOptions')
    e.select(startOptionId(q))
    return { q, e }
  }
  const texts = (e: Engine) => e.view.paragraphs.map((p) => p.text).join(' | ')

  it('a result button takes that output, and keeps the result for later Branches', () => {
    const { q, e } = start()
    e.select(optionId(q, 'flip'))
    expect(e.view.options.map((o) => o.text)).toEqual(['(Play) The plugin returns "ok"', '(Play) The plugin returns "odd"', '(Play) No result, or the plugin fails'])
    expect(e.view.options.every((o) => o.id.startsWith(PLUGIN_OPTION))).toBe(true)
    expect(texts(e)).toContain('(the plugin CoinFlip runs here in game)')
    pluginOutcome(e, e.view.options[1].id)
    expect(texts(e)).toContain('the plugin returned "odd"')
    expect(e.get('$global.pga_test_flip_result')).toBe('odd')
    e.select(optionId(q, 'b_r_flip_odd'))
    e.select(optionId(q, 'last'))
    expect(texts(e)).toContain('the last flip (a) returned "odd"')
  })

  it('"no result" takes the otherwise output and unsets the key', () => {
    const { q, e } = start()
    e.set('$global.pga_test_broken_result', 'old')
    e.select(optionId(q, 'broken'))
    expect(e.view.options.map((o) => o.text)).toEqual(['(Play) The plugin returns "ok"', '(Play) No result, or the plugin fails'])
    pluginOutcome(e, e.view.options[1].id)
    expect(texts(e)).toContain('the plugin threw, so SagaLib logged one error')
    expect(e.get('$global.pga_test_broken_result')).toBeUndefined()
  })

  it('a node without results, and an Action\'s plugin, just go on (a note says it runs in game)', () => {
    const { q, e } = start()
    e.select(optionId(q, 'missing'))
    expect(texts(e)).toContain('(the plugin NoSuchPlugin runs here in game)')
    expect(texts(e)).toContain('there is no such class')
    e.select(optionId(q, 'b_r_missing_next'))
    e.select(optionId(q, 'act'))
    expect(texts(e)).toContain('(the plugin CoinFlip runs here in game)')
    expect(e.log.some((l) => l.text.includes(`Plugin ${COIN} (chance=0, text=`))).toBe(true)
  })
})

describe('#79 checks', () => {
  const probs = (m: ModModel, jars?: JarInfo[]) => pluginProblems(ctx(m, jars))

  it('the test mod: only the class that is missing on purpose', () => {
    expect(probs(model()).map((p) => p.message)).toEqual([expect.stringContaining(`the class ${MISSING} isn't in the mod's jars (${PGA_JAR})`)])
  })

  it('no jar listed, a jar not built, a class that isn\'t a plugin', () => {
    expect(probs(model(), []).map((p) => p.key)).toEqual(['pluginnojar'])
    expect(probs(model(), [{ path: PGA_JAR, found: false, classes: [] }]).map((p) => p.key)).toEqual([`pluginjar:${PGA_JAR}`])
    const notPlugin: JarInfo[] = [{ ...SEVENTYNINE_JARS[0], classes: [{ name: COIN, plugin: false }] }]
    expect(probs(model(), notPlugin).map((p) => p.key)).toEqual(expect.arrayContaining(['pluginnotplugin:pga_test:flip', 'pluginclass:pga_test:broken']))
    // jars not read (no loaded state): no jar checks
    const c = ctx(model())
    expect(pluginProblems({ ...c, loaded: { ...c.loaded, jars: undefined } }).length).toBe(0)
  })

  it('a class, argument keys and result ids', () => {
    const q = pluginConversation()
    const f = node(q, 'flip')
    f.className = ''
    node(q, 'sure').className = 'not a class'
    node(q, 'broken').args = [{ key: 'quest', value: 'x' }, { key: 'a b', value: '1' }, { key: 'k', value: '1' }, { key: 'k', value: '2' }, { key: '', value: 'lost' }]
    node(q, 'missing').results = ['next', 'bad-id', 'ok', 'ok']
    const keys = probs(model(q)).map((p) => `${p.level}:${p.key}`)
    expect(keys).toEqual(expect.arrayContaining([
      'error:pluginnoclass:pga_test:flip', 'error:pluginbadclass:pga_test:sure',
      'error:pluginargres:pga_test:broken:quest', 'error:pluginargkey:pga_test:broken:a b', 'warning:pluginargdup:pga_test:broken:k', 'warning:pluginargnokey:pga_test:broken',
      'error:pluginresnext:pga_test:missing', 'error:pluginresid:pga_test:missing:bad-id', 'error:pluginresdup:pga_test:missing:ok', 'warning:pluginresloose:pga_test:missing:ok'
    ]))
  })

  it('world events and progress stages are checked too', () => {
    const m = model()
    m.events = [{ id: 'pga_sched', name: 'S', min: 0, max: 1, intervalDays: 10, events: [{ id: 'pga_ev', name: 'Ev', weight: 1, conditions: [], durationDays: 5, start: [{ op: 'plugin', className: '', args: [] }], end: [] }] }] as never
    expect(probs(m).some((p) => p.key === 'pluginnoclass:ev:pga_ev:start:0' && p.ref?.page === 'saga')).toBe(true)
  })
})

describe('#79 export and the flags registry', () => {
  it('needs SagaLib 1.4.0, for a Plugin node and for an op alone', () => {
    expect(needsSagaLib14(model())).toBe(true)
    const m = emptyModel('pga_')
    expect(needsSagaLib14(m)).toBe(false)
    m.events = [{ id: 'pga_sched', name: 'S', min: 0, max: 1, intervalDays: 10, events: [{ id: 'pga_ev', name: 'Ev', weight: 1, conditions: [], durationDays: 5, start: [{ op: 'plugin', className: COIN, args: [] }], end: [] }] }] as never
    expect(usesPlugins(m)).toBe(true)
    expect(needsSagaLib14(m)).toBe(true)
  })

  it('the export writes the rows and raises the SagaLib dependency to 1.4.0', () => {
    const m = SEVENTYNINE_A.model()
    const files = { 'mod_info.json': '{\n\t"id": "seventynine_a",\n\t"name": "x",\n\t"version": "1.0.0",\n\t"gameVersion": "0.98a-RC8",\n\t"jars": ["jars/pga_plugins.jar"]\n}\n' }
    const plan = planExport(m, testModState(SEVENTYNINE_A, m, files), index, null, { addDependency: true })
    const info = parseLooseObject(plan.writes.find((w) => w.path === 'mod_info.json')!.text).value as { dependencies: { id: string; version: string }[]; jars: string[] }
    expect(info.dependencies).toEqual([{ id: 'lastai_sagalib', name: 'SagaLib', version: '1.4.0' }])
    expect(info.jars).toEqual(['jars/pga_plugins.jar'])
    const rules = plan.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text
    // rules.csv doubles the quotes inside a quoted cell
    expect(rules).toContain('SF_RunPlugin pga.plugins.CoinFlip ""quest=pga_test"" ""node=flip"" ""chance=0.5""')
    expect(rules).toContain('$global.pga_test_flip_result == ok')
  })

  it('the result key is set by SagaLib (its Branches read it without a problem)', () => {
    const reg = buildRegistry(model(), [])
    const e = reg.get('$global.pga_test_flip_result')!
    expect(e.setBy[0].detail).toContain('set by SagaLib to what the plugin pga.plugins.CoinFlip returns')
    expect(e.readBy.length).toBeGreaterThan(0)
    expect(reg.get('$global.pga_test_act_result')?.setBy.length).toBe(1)
    expect(flagProblems(reg, 'pga_').filter((p) => p.message.includes('_result'))).toEqual([])
  })
})

// ---------------------------------------------------------------- the jar reader (main/jars.ts)

/** A minimal class file: a name, a superclass, interfaces and access flags, no members. */
function classFile(name: string, sup: string, interfaces: string[] = [], access = 0x0021): Buffer {
  const pool: Buffer[] = []
  let n = 1
  const utf = (s: string) => { const b = Buffer.from(s, 'utf8'); const h = Buffer.alloc(3); h[0] = 1; h.writeUInt16BE(b.length, 1); pool.push(Buffer.concat([h, b])); return n++ }
  const cls = (s: string) => { const u = utf(s); const b = Buffer.alloc(3); b[0] = 7; b.writeUInt16BE(u, 1); pool.push(b); return n++ }
  // a long takes two slots (the reader must skip it right)
  const long = () => { const b = Buffer.alloc(9); b[0] = 5; pool.push(b); n += 2 }
  long()
  const self = cls(name), parent = cls(sup), ifs = interfaces.map(cls)
  const head = Buffer.alloc(10); head.writeUInt32BE(0xcafebabe, 0); head.writeUInt16BE(0, 4); head.writeUInt16BE(52, 6); head.writeUInt16BE(n, 8)
  const tail = Buffer.alloc(8 + 2 * ifs.length + 6)
  tail.writeUInt16BE(access, 0); tail.writeUInt16BE(self, 2); tail.writeUInt16BE(parent, 4); tail.writeUInt16BE(ifs.length, 6)
  ifs.forEach((x, i) => tail.writeUInt16BE(x, 8 + 2 * i))
  return Buffer.concat([head, ...pool, tail])
}

const TMP = path.resolve(__dirname, '..', '.userdata', 'test-tmp-79')
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }))

describe('#79 the mod\'s jars (zip central directory and class headers; no Java)', () => {
  it('reads a class header', () => {
    expect(classHeader(classFile('x/A', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin']))).toEqual({ name: 'x/A', super: 'java/lang/Object', interfaces: ['lastai/sagalib/api/SagaPlugin'], access: 0x0021 })
    expect(classHeader(Buffer.from('nope'))).toBeNull()
  })

  it('finds the plugins: directly, through a superclass or an interface in the jars; not abstract, not anonymous', () => {
    const dir = path.join(TMP, 'mod')
    fs.mkdirSync(path.join(dir, 'jars'), { recursive: true })
    const entries = [
      ['x/Direct', classFile('x/Direct', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin'])],
      ['x/Sub', classFile('x/Sub', 'x/Direct')],
      ['x/Base', classFile('x/Base', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin'], 0x0421)],
      ['x/MyApi', classFile('x/MyApi', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin'], 0x0601)],
      ['x/ViaApi', classFile('x/ViaApi', 'java/lang/Object', ['x/MyApi'])],
      ['x/Other', classFile('x/Other', 'java/lang/Object')],
      ['x/Hidden', classFile('x/Hidden', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin'], 0x0020)],
      ['x/Direct$1', classFile('x/Direct$1', 'java/lang/Object', ['lastai/sagalib/api/SagaPlugin'])],
      ['x/Direct$Inner', classFile('x/Direct$Inner', 'x/Direct')]
    ] as const
    fs.writeFileSync(path.join(dir, 'jars', 'p.jar'), makeZip([...entries.map(([n, data]) => ({ name: `${n}.class`, data })), { name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\n') }]))
    fs.writeFileSync(path.join(dir, 'jars', 'broken.jar'), 'not a zip')
    fs.writeFileSync(path.join(dir, 'mod_info.json'), '{ "id": "m", # loose json\n "jars": ["jars/p.jar", "jars/missing.jar", "jars/broken.jar"] }')
    const jars = modJars(dir)
    expect(jars.map((j) => [j.path, j.found])).toEqual([['jars/p.jar', true], ['jars/missing.jar', false], ['jars/broken.jar', false]])
    expect(jars[2].error).toBe("can't be read as a jar")
    expect(jars[0].classes).toEqual([
      { name: 'x.Base', plugin: false }, { name: 'x.Direct', plugin: true }, { name: 'x.Direct$Inner', plugin: true }, { name: 'x.Hidden', plugin: false },
      { name: 'x.MyApi', plugin: false }, { name: 'x.Other', plugin: false }, { name: 'x.Sub', plugin: true }, { name: 'x.ViaApi', plugin: true }
    ])
    expect(pluginClassChoices(jars).slice(0, 4).map((c) => c.id)).toEqual(['x.Direct', 'x.Direct$Inner', 'x.Sub', 'x.ViaApi'])
    expect(modJars(path.join(TMP, 'none'))).toEqual([])
    expect(jarsInfo([])).toEqual([])
  })

  it('reads the test mod\'s real jar when it is built (mods/seventynine_a, bash build.sh)', () => {
    const mod = path.resolve(__dirname, '..', '..', '..', 'mods', 'seventynine_a')
    if (!fs.existsSync(path.join(mod, PGA_JAR))) return
    const jars = modJars(mod)
    expect(jars).toEqual(SEVENTYNINE_JARS)
  })
})
