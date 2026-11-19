/**
 * #27: MagicLib bounties (docs/DESIGN-MAGICLIB-BOUNTIES.md). Golden files in test/expected/bounties
 * hold each bounty as exported plus its mapping notes; UPDATE_GOLDEN=1 rewrites them (review the diff).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { bountyJson, bountyIdsOf, targetToMagic, magicText, existingBounties, newBounty, withoutBountyOnly, BOUNTY_FILE, VAYRA_FILE, type BountyNote } from '../src/shared/bounties'
import { planExport } from '../src/shared/export'
import { modelToWrites, type ModModel } from '../src/shared/serialize'
import { modUses } from '../src/shared/moduses'
import { bountyProblems } from '../src/shared/checks/bounties'
import { buildRegistry } from '../src/shared/flags'
import { bountyModel, TWENTYSEVEN_A } from './fixtures/twentyseven'
import { testModFiles, testModState } from './fixtures/testmod'
import type { GameIndex } from '../src/shared/api'

const GOLDEN = path.join(__dirname, 'expected', 'bounties')
const index = { factions: [], items: [], people: [], markets: [], sources: [], variants: [] } as unknown as GameIndex

function golden(name: string, value: unknown) {
  const file = path.join(GOLDEN, `${name}.json`)
  const text = JSON.stringify(value, null, 2) + '\n'
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(file)) { fs.mkdirSync(GOLDEN, { recursive: true }); fs.writeFileSync(file, text) }
  expect(text).toBe(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
}
const out = (m: ModModel, id: string) => { const b = m.bounties!.find((x) => x.id === id)!; const r = bountyJson(m, b, index); return { json: r.json, notes: r.notes } }

/** A third case: a market target, a template fleet, flag prerequisites, mod conditions. */
function marketModel(): ModModel {
  const m = bountyModel()
  m.fleets = { templates: [{ id: 'tsa_tpl', name: 'Iron Wake', faction: 'hegemony', fleetType: 'patrolLarge', ships: [{ variant: 'hound_Standard', name: 'HSS Scout' }, { variant: 'enforcer_Elite', name: 'HSS Anvil' }, { variant: 'hound_Standard' }], flagship: 1 }], typeNames: {} }
  m.encounters.push({ format: 1, id: 'tsa_wake', name: 'Iron Wake', fleet: { faction: 'hegemony', type: 'patrolLarge', size: 'template', template: 'tsa_tpl' }, spawn: { at: '$global.tsa_raid_port', when: 'quest-stage', quest: 'tsa_raid', stage: 'go' }, behavior: 'intercept-player', flags: {}, outcomes: {}, mods: { with: ['HMI'], without: ['nexerelin'] } })
  const q = JSON.parse(JSON.stringify(m.quests.find((x) => x.id === 'tsa_hunt'))) as typeof m.quests[number]
  q.id = 'tsa_raid'; q.title = 'Test 27: the Iron Wake'
  q.start = { kind: 'bar', freq: 5, prob: 0.5, blurb: 'A Hegemony officer drinks alone. Costs 5%.' }
  q.requires = [{ flag: '$global.tsa_b_raiders_succeeded' }, { flag: '!$global.tsa_raid_refused' }, { flag: '$player.tsa_x', is: '2' }, { quest: 'tsa_hunt', ended: 'success' }]
  q.rewards = [{ id: 'paid', credits: 5000, ships: ['hound_Standard'], xp: 1000 }]
  q.timeLimitDays = undefined
  q.variables = [{ name: 'port', type: 'target', scope: 'quest', initial: '', target: { pick: 'market', require: [{ id: 'mkFaction', args: [['pirates', 'luddic_path']] }, { id: 'mkSizeAtLeast', args: [4] }], prefer: [] } }]
  ;(q.nodes.find((n) => n.type === 'encounter') as { encounter: string }).encounter = 'tsa_wake'
  m.quests.push(q)
  m.bounties!.push({ id: 'tsa_b_wake', quest: 'tsa_raid', only: false, offer: { factions: ['hegemony'], alliedWith: false, minSize: 5, minLevel: 10, minDays: 30, weight: 2 }, scaling: 1.5 })
  return m
}

describe('MagicLib bounties: golden files', () => {
  it('an encounter with a fixed place, explicit ships and a captain (tsa_b_raiders)', () => golden('tsa_b_raiders', out(bountyModel(), 'tsa_b_raiders')))
  it('a quest with a random target, rewards and a fleet sized by points (tsa_b_hunt)', () => golden('tsa_b_hunt', out(bountyModel(), 'tsa_b_hunt')))
  it('a market target, a template fleet, prerequisites and mods (tsa_b_wake)', () => golden('tsa_b_wake', out(marketModel(), 'tsa_b_wake')))
})

describe('MagicLib bounties: mapping', () => {
  const lv = (n: BountyNote[], level: BountyNote['level']) => n.filter((x) => x.level === level)
  it('lists the market id and its entity id (MagicLib\'s trigger_market_id quirk)', () => {
    expect(out(bountyModel(), 'tsa_b_raiders').json.trigger_market_id).toEqual(['tsa_station_market', 'tsa_station'])
    // the hunt's offer comes from its contact's market
    expect(out(bountyModel(), 'tsa_b_hunt').json.trigger_market_id).toEqual(['tsa_station_market', 'tsa_station'])
  })
  it('translates a random target: themes, blacklist, distance, unexplored; says what it can\'t', () => {
    const r = targetToMagic({ pick: 'planet', require: [{ id: 'sysTags', args: ['NOT_ANY', ['theme_remnant']] }], prefer: [{ id: 'sysFringe', args: [] }, { id: 'plRuins', args: [] }] })
    expect(r.json).toEqual({ location_themes_blacklist: ['theme_already_occupied', 'theme_remnant'], location_entities: ['planet'], location_distance: 'FAR', location_defaultToAnyEntity: true })
    expect(lv(r.notes, 'warning').map((n) => n.message)).toEqual([expect.stringContaining('"Has ruins"')])
    const req = targetToMagic({ pick: 'system', require: [{ id: 'sysTags', args: ['ANY', ['theme_ruins']] }], prefer: [] })
    expect(req.json.location_defaultToAnyEntity).toBe(false)
    expect(targetToMagic({ pick: 'market', require: [{ id: 'mkSizeAtLeast', args: [3] }], prefer: [] }).notes.some((n) => n.level === 'error')).toBe(true)
    const ent = targetToMagic({ pick: 'entity', require: [{ id: 'enTags', args: ['ANY', ['station', 'wreck']] }, { id: 'enType', args: [['derelict_probe']] }], prefer: [] })
    expect(ent.json.location_entities).toEqual(['station', 'wreck'])
    expect(lv(ent.notes, 'warning')).toHaveLength(1)
  })
  it('converts texts: %% and MagicLib\'s tokens; warns about any other $', () => {
    const notes: BountyNote[] = []
    expect(magicText('Pay 50% to $p_name at $global.q_t_system, $playerName.', 'x', notes, { $p_name: '$name', '$global.q_t_system': '$system' })).toBe('Pay 50%% to $name at $system, $playerName.')
    expect(notes).toHaveLength(1)
    expect(notes[0].message).toContain('$playerName')
  })
  it('errors: a points fleet without a flagship, an id without the prefix, no place', () => {
    const m = bountyModel()
    m.bounties = [{ id: 'other_b', quest: 'tsa_hunt' }]
    const r = bountyJson(m, m.bounties[0], index)
    expect(lv(r.notes, 'error').map((n) => n.field).sort()).toEqual(['fleet', 'id'])
    m.encounters.find((e) => e.id === 'tsa_hunters')!.spawn.at = ''
    m.quests.find((q) => q.id === 'tsa_hunt')!.variables = []
    expect(lv(bountyJson(m, { id: 'tsa_b_x', quest: 'tsa_hunt', flagship: 'hound_Standard' }, index).notes, 'error').map((n) => n.field)).toEqual(['location'])
  })
  it('the flags check knows MagicLib sets $global.<id>_succeeded (and _failed, _expired)', () => {
    const reg = buildRegistry(bountyModel(), [])
    expect(reg.get('$global.tsa_b_raiders_succeeded')?.setBy[0].detail).toContain('MagicLib')
    expect(reg.get('$global.tsa_b_hunt_expired')?.types.has('bool')).toBe(true)
  })
  it('makes a new bounty with a free prefixed id', () => {
    const m = bountyModel()
    expect(newBounty(m, { quest: 'tsa_hunt' })).toEqual({ id: 'tsa_b_hunt2', quest: 'tsa_hunt', only: true, type: 'assassination' })
    expect(newBounty(m, { encounter: 'tsa_hunters' }).id).toBe('tsa_b_hunters')
  })
  it('Problems: warnings for what MagicLib can\'t, duplicate ids as errors', () => {
    const m = bountyModel()
    m.bounties!.push({ ...m.bounties![0] })
    const p = bountyProblems({ model: m, index } as never)
    expect(p.filter((x) => x.level === 'error').map((x) => x.key)).toEqual(['bountydup:tsa_b_raiders'])
    expect(p.some((x) => x.level === 'warning' && x.message.includes('Within N light-years'))).toBe(true)
  })
})

describe('MagicLib bounties: export', () => {
  const state = (m: ModModel, files: Record<string, string>) => testModState(TWENTYSEVEN_A, m, files)
  const saved = (m: ModModel, extra: Record<string, string> = {}) => {
    const base: Record<string, string> = { 'mod_info.json': '{\n\t"id": "twentyseven_a",\n\t"name": "T",\n\t"version": "1.0.0",\n}\n', ...extra }
    for (const w of modelToWrites(m, state(m, base))) if (!w.remove) base[w.path] = w.text
    return base
  }
  it('merges the bounties into magicBounty_data.json by key, keeping hand-written ones, and removes deleted ones', () => {
    const m = bountyModel()
    const hand = '{\n\t# hand-written\n\t"tsa_hand": {"job_name": "By hand", "fleet_faction": "pirates", "fleet_flagship_variant": "hound_Standard"},\n}\n'
    const files = saved(m, { [BOUNTY_FILE]: hand })
    const plan = planExport(m, state(m, files), index, null, {})
    expect(plan.problems.filter((p) => p.level === 'error')).toEqual([])
    const w = plan.writes.find((x) => x.path === BOUNTY_FILE)!
    expect(w.text).toContain('# hand-written')
    expect(Object.keys(JSON.parse(w.text.replace(/#.*\n/g, '\n').replace(/,(\s*[}\]])/g, '$1')))).toEqual(['tsa_hand', 'tsa_b_raiders', 'tsa_b_hunt', 'tsa_b_ghost', 'tsa_b_partner', 'tsa_b_watch', 'tsa_b_late'])
    // the next export without one of them removes only that key
    const project = JSON.parse(plan.writes.find((x) => x.path === 'sagaforge/project.json')!.text)
    const m2 = bountyModel(); m2.project = project; m2.bounties = m2.bounties!.filter((b) => b.id !== 'tsa_b_hunt')
    const plan2 = planExport(m2, state(m2, { ...saved(m2), [BOUNTY_FILE]: w.text }), index, null, {})
    const t2 = plan2.writes.find((x) => x.path === BOUNTY_FILE)!.text
    expect(t2).toContain('tsa_hand'); expect(t2).toContain('tsa_b_raiders'); expect(t2).not.toContain('tsa_b_hunt')
    expect(existingBounties({ [BOUNTY_FILE]: { text: t2 } }, ['tsa_b_raiders', 'tsa_b_ghost', 'tsa_b_partner', 'tsa_b_watch', 'tsa_b_late']).map((b) => [b.id, b.own])).toEqual([['tsa_hand', false], ['tsa_b_raiders', true], ['tsa_b_ghost', true], ['tsa_b_partner', true], ['tsa_b_watch', true], ['tsa_b_late', true]])
  })
  it('"only as a bounty": the quest and the encounter aren\'t exported for SagaLib', () => {
    const m = bountyModel()
    const plan = planExport(m, state(m, saved(m)), index, null, {})
    const paths = plan.writes.map((w) => w.path)
    expect(paths.some((p) => p.includes('tsa_hunt'))).toBe(false)
    expect(paths.some((p) => p.includes('tsa_raiders.') || p.includes('encounters/tsa_hunters'))).toBe(false)
    expect(plan.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text).not.toContain('quest=tsa_hunt')
    // and the bounty-only encounter's comm dialog
    expect(plan.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text).not.toContain('quest=tsa_raiders_comm')
    // the status conversation still goes out
    expect(plan.writes.find((w) => w.path === 'data/campaign/rules.csv')!.text).toContain('quest=tsa_status')
    // off: the quest is exported as well
    const m2 = bountyModel(); m2.bounties![1].only = false
    expect(withoutBountyOnly(m2).quests.some((q) => q.id === 'tsa_hunt')).toBe(true)
    expect(planExport(m2, state(m2, saved(m2)), index, null, {}).writes.find((w) => w.path === 'data/campaign/rules.csv')!.text).toContain('quest=tsa_hunt')
  })
  it('MagicLib: optional adds no dependency; required adds it (one click); unlisted is a use', () => {
    const m = bountyModel()
    const deps = (mm: ModModel, opts = {}) => { const p = planExport(mm, state(mm, saved(mm)), index, null, opts); const mi = p.writes.find((w) => w.path === 'mod_info.json'); return mi?.text ?? '' }
    expect(deps(m, { addRequired: true })).not.toContain('"id": "MagicLib"')
    const r = bountyModel(); r.project.mods = [{ id: 'MagicLib', name: 'MagicLib', use: 'required' }]
    expect(planExport(r, state(r, saved(r)), index, null, {}).requiredMissing.map((x) => x.id)).toEqual(['MagicLib'])
    expect(deps(r, { addRequired: true })).toContain('"id": "MagicLib"')
    const u = bountyModel(); u.project.mods = []
    // #59: the bounties, and the quest that starts and tests one
    expect(modUses(u, index, { sourceId: 'twentyseven_a' }).get('MagicLib')?.map((s) => s.key)).toEqual(['file:bounty:tsa_b_raiders', 'file:bounty:tsa_b_hunt', 'file:bounty:tsa_b_ghost', 'file:bounty:tsa_b_partner', 'file:bounty:tsa_b_watch', 'file:bounty:tsa_b_late', 'file:questbounty:tsa_job', 'file:questbounty:tsa_watch', 'file:questbounty:tsa_late'])
    const none = bountyModel(); none.bounties = []; none.project.mods = []; none.quests = none.quests.filter((q) => !bountyIdsOf(q).length)
    expect(modUses(none, index, { sourceId: 'twentyseven_a' }).has('MagicLib')).toBe(false)
  })
  it('lists the rows of the older vayraBounties CSV (read only)', () => {
    const csv = 'bounty_id,level,rank,firstName,lastName\n#note,,,,\ntsa_old,5,x,Ada,Reyes\n'
    expect(existingBounties({ [VAYRA_FILE]: { text: csv } }, [])).toEqual([{ id: 'tsa_old', name: 'Ada Reyes', file: VAYRA_FILE, own: false }])
  })
  it('builds the in-game test mod without export errors', () => {
    const files = testModFiles(TWENTYSEVEN_A)
    expect(Object.keys(JSON.parse(files[BOUNTY_FILE]))).toEqual(['tsa_b_raiders', 'tsa_b_hunt', 'tsa_b_ghost', 'tsa_b_partner', 'tsa_b_watch', 'tsa_b_late'])
    expect(files['mod_info.json']).not.toContain('"id": "MagicLib"')
  })
})
