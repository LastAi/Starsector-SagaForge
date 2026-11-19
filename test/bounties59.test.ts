/**
 * Task #59 (SagaLib 1.3's MagicLib bridge): a quest starts a MagicLib bounty (SF_StartBounty) and
 * tests its state (SF_BountyState); the true/false quest-ended keys MagicLib's triggers can read;
 * "On the board" off. The shared golden case test/golden/bounties.json (SagaLib) covers the states.
 */
import { describe, expect, it } from 'vitest'
import { bountyJson, bountyIdsOf, QUEST_ONLY_KEY } from '../src/shared/bounties'
import { bountyProblems } from '../src/shared/checks/bounties'
import { compileQuest, exclusiveCases, startOptionId } from '../src/shared/export/questrules'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, bountyState, endBounty, modRecord, type SimWorld } from '../src/shared/play'
import { modsJson } from '../src/shared/modlist'
import { planExport } from '../src/shared/export'
import { modelToWrites, type ModModel } from '../src/shared/serialize'
import { bountyModel, TWENTYSEVEN_A } from './fixtures/twentyseven'
import { buildRegistry, flagProblems } from '../src/shared/flags'
import { testModFiles, testModState } from './fixtures/testmod'
import type { GameIndex } from '../src/shared/api'
import type { CheckContext } from '../src/shared/checks'
import type { ActionNode, QuestPlan } from '../src/shared/model'

const index = { sources: [], factions: [], people: [], markets: [], systems: [], items: [], hulls: [], variants: [], codeSystems: [], places: [] } as unknown as GameIndex
const ctx = (m: ModModel): CheckContext => ({ model: m, index, defs: {} as never, loaded: testModState(TWENTYSEVEN_A, m, {}), rules: null, styleChecks: false })
const job = (m: ModModel) => m.quests.find((q) => q.id === 'tsa_job')!

describe('#59: export', () => {
  it('Start a MagicLib bounty is SF_StartBounty, and the mod needs SagaLib 1.3', () => {
    const m = bountyModel()
    const rows = compileQuest(job(m), { sagalib: true, phrases: [] }).rows
    expect(rows.some((r) => r.script.split('\n').includes('SF_StartBounty tsa_b_ghost'))).toBe(true)
    expect(rows.some((r) => r.conditions.split('\n').includes('SF_BountyState tsa_b_ghost unavailable'))).toBe(true)
    const files = testModFiles(TWENTYSEVEN_A)
    expect(files['mod_info.json']).toContain('"id": "lastai_sagalib"')
    expect(files['mod_info.json']).toContain('"version": "1.3.0"')
    expect(files['mod_info.json']).not.toContain('"id": "MagicLib"')
    expect(files['data/campaign/rules.csv']).toContain('SF_StartBounty tsa_b_ghost')
  })
  it('a hand-written SF_ condition line marks the quest as using SagaLib', () => {
    const q: QuestPlan = { ...job(bountyModel()) }
    q.nodes = q.nodes.map((n) => (n.type === 'action' ? { ...n, ops: [] } : n))
    expect(compileQuest(q, { sagalib: true, phrases: [] }).usesSagaLib).toBe(true)
  })
  it('finds the bounties a quest starts or tests', () => {
    expect(bountyIdsOf(job(bountyModel()))).toEqual(['tsa_b_ghost'])
    expect(bountyIdsOf(bountyModel().quests.find((q) => q.id === 'tsa_status')!)).toEqual([])
  })
})

describe('#59: the bounty file', () => {
  it('"On the board" off: a trigger key nobody sets', () => {
    const m = bountyModel()
    const r = bountyJson(m, m.bounties!.find((b) => b.id === 'tsa_b_ghost')!)
    expect(r.json.trigger_memKeys_all).toEqual({ [QUEST_ONLY_KEY]: true })
    expect(r.notes.filter((n) => n.level !== 'info')).toEqual([])
  })
  it('a quest prerequisite reads SagaLib\'s true/false ended key', () => {
    const m = bountyModel()
    const r = bountyJson(m, m.bounties!.find((b) => b.id === 'tsa_b_partner')!)
    expect(r.json.trigger_memKeys_all).toEqual({ $sagaforge_success_tsa_job: true })
    expect(r.notes.filter((n) => n.level === 'warning')).toEqual([])
    const pq = m.quests.find((q) => q.id === 'tsa_partner_job')!
    pq.requires = [{ quest: 'tsa_job', ended: 'fail' }, { quest: 'tsa_status', ended: 'any' }, { quest: 'tsa_job', ended: 'any' }]
    const r2 = bountyJson(m, m.bounties!.find((b) => b.id === 'tsa_b_partner')!)
    expect(r2.json.trigger_memKeys_all).toEqual({ $sagaforge_fail_tsa_job: true })
    expect(r2.json.trigger_memKeys_any).toEqual({ $sagaforge_success_tsa_status: true, $sagaforge_fail_tsa_status: true })
    expect(r2.notes.filter((n) => n.level === 'warning').map((n) => n.message)).toEqual([expect.stringContaining('only one "ended either way"')])
  })
  it('a prerequisite on a quest that is only a bounty can\'t be read: warning', () => {
    const m = bountyModel()
    m.quests.find((q) => q.id === 'tsa_partner_job')!.requires = [{ quest: 'tsa_hunt', ended: 'success' }]
    const r = bountyJson(m, m.bounties!.find((b) => b.id === 'tsa_b_partner')!)
    expect(r.json.trigger_memKeys_all).toBeUndefined()
    expect(r.notes.some((n) => n.level === 'warning' && n.message.includes('exported only as a bounty'))).toBe(true)
  })
})

describe('#59: Problems', () => {
  it('the test mod has none', () => {
    expect(bountyProblems(ctx(bountyModel())).filter((p) => p.level !== 'info' && !p.message.includes('Within N light-years'))).toEqual([])
  })
  it('a start without a bounty, a state that isn\'t one, an untested start with MagicLib optional', () => {
    const m = bountyModel()
    const q = job(m)
    ;(q.nodes.find((n) => n.id === 'take') as ActionNode).ops.push({ op: 'startBounty', bounty: '' }, { op: 'startBounty', bounty: 'tsa_b_partner' })
    const br = q.nodes.find((n) => n.id === 'state')!
    if (br.type === 'branch') br.cases[2].conditions = ['SF_BountyState tsa_b_ghost running']
    const msgs = bountyProblems(ctx(m)).map((p) => `${p.level}: ${p.message}`)
    expect(msgs).toContainEqual(expect.stringMatching(/^error: .*"Start a MagicLib bounty" in "Take the bounty" has no bounty/))
    expect(msgs).toContainEqual(expect.stringMatching(/^error: .*"running" isn't a bounty state/))
    expect(msgs).toContainEqual(expect.stringMatching(/^warning: .*starts the MagicLib bounty tsa_b_partner but never tests its state\. MagicLib is optional/))
    // required: starting does something whenever the mod runs
    m.project.mods = [{ id: 'MagicLib', name: 'MagicLib', use: 'required' }]
    expect(bountyProblems(ctx(m)).some((p) => p.message.includes('never tests its state'))).toBe(false)
  })
  it('testing another mod\'s bounty isn\'t "a flag nothing sets" (MagicLib sets it)', () => {
    const m = bountyModel()
    const br = job(m).nodes.find((n) => n.id === 'avail')!
    if (br.type === 'branch') br.cases[0].conditions = ['SF_BountyState hmi_b_x unavailable']
    const reg = buildRegistry(m, [])
    expect(reg.get('$global.hmi_b_x')?.external).toBe('MagicLib')
    expect(flagProblems(reg, 'tsa_').map((p) => p.key)).not.toContain('flagunset:$global.hmi_b_x')
  })
  it('a bounty off the board that no quest starts', () => {
    const m = bountyModel()
    m.quests = m.quests.filter((q) => q.id !== 'tsa_job')
    expect(bountyProblems(ctx(m)).map((p) => p.key)).toContain('bountynoboard:tsa_b_ghost')
  })
  it('Branch cases on other states of one bounty aren\'t ambiguous', () => {
    expect(exclusiveCases(['SF_BountyState b succeeded'], ['SF_BountyState b failed expired'])).toBe(true)
    expect(exclusiveCases(['SF_BountyState b ended'], ['SF_BountyState b failed'])).toBe(false)
    expect(exclusiveCases(['SF_BountyState b active'], ['SF_BountyState c active'])).toBe(false)
    expect(exclusiveCases(['$global.x', '$global.y'], ['$global.y', '!$global.x'])).toBe(true)
    expect(exclusiveCases(['$global.v == 1'], ['$global.v == 2'])).toBe(true)
    expect(exclusiveCases(['SF_AtStep q a'], ['SF_AtStep q b'])).toBe(true)
    expect(compileQuest(job(bountyModel()), { sagalib: true, phrases: [] }).problems.some((p) => p.message.includes('same number of conditions'))).toBe(false)
  })
})

describe('#59: Play mode', () => {
  const m = bountyModel()
  const q = job(m)
  const rows = m.quests.flatMap((x) => compileQuest(x, { sagalib: true, phrases: [] }).rows)
  const run = (enabled: string[]) => {
    const w: SimWorld = { quests: m.quests, phrases: new Map(), mods: { lists: [modsJson(m.project, { id: 'twentyseven_a', name: 'x' }) as never], enabled: new Set(enabled) }, bounties: { known: (id) => id.startsWith('tsa_b_'), name: (id) => (id === 'tsa_b_ghost' ? 'Test 59: the Ghost' : id) } }
    const e = new Engine(compileRules(rows), newContext(), sagaHooks(w, newSimState()))
    modRecord(e, w.mods!)
    e.select(startOptionId(q))
    e.select('tsa_job_accept')
    return { e, w, text: () => e.view.paragraphs.map((p) => p.text).join(' | ') }
  }
  it('without MagicLib the quest says the bounty isn\'t available and doesn\'t start', () => {
    const { e, w, text } = run([])
    expect(text()).toContain('the bounty isn\'t available here')
    expect(e.get('$global.tsa_job_state')).toBeUndefined()
    expect(e.get('$global.tsa_b_ghost')).toBeUndefined()
    expect(bountyState(e, w, null, 'tsa_b_ghost')).toBe('unavailable')
  })
  it('with MagicLib it starts the bounty, and the report reads its state', () => {
    const { e, w, text } = run(['MagicLib'])
    expect(text()).toContain('Accepted job: Test 59: the Ghost')
    expect(text()).toContain('contract signed')
    expect(e.get('$global.tsa_b_ghost')).toBe(false)
    expect(e.get('$global.tsa_job_step')).toBe('hunt')
    expect(bountyState(e, w, null, 'tsa_b_ghost')).toBe('active')
    // still running: come back later (the report option is offered again)
    e.set('$id', 'tsa_station')
    e.select('tsa_job_report_go')
    expect(text()).toContain('still active')
    expect(e.get('$global.tsa_job_report_done')).toBe(true)
    e.select('tsa_job_ok3')
    expect(e.get('$global.tsa_job_report_done')).toBeUndefined()
    expect(e.view.options.map((o) => o.id)).not.toContain('tsa_job_ok3')
    // MagicLib ends it: the report ends the quest with success and its ended key
    endBounty(e, w, 'tsa_b_ghost', 'succeeded')
    e.select('tsa_job_report_go')
    expect(text()).toContain('(d) passed')
    expect(e.get('$global.tsa_job_state')).toBe('success')
    expect(e.get('$global.sagaforge_success_tsa_job')).toBe(true)
  })
})

describe('#59: Saga Forge writes the test mod the way the app would', () => {
  it('exports without errors', () => {
    const m = bountyModel()
    const base: Record<string, string> = { 'mod_info.json': '{\n\t"id": "twentyseven_a",\n\t"name": "T",\n\t"version": "1.0.0",\n}\n' }
    for (const wr of modelToWrites(m, testModState(TWENTYSEVEN_A, m, base))) if (!wr.remove) base[wr.path] = wr.text
    const plan = planExport(m, testModState(TWENTYSEVEN_A, m, base), index, null, {})
    expect(plan.problems.filter((p) => p.level === 'error')).toEqual([])
  })
})
