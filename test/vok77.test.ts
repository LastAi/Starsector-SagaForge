/**
 * Task #77 (PLAN.md §10.8, "Vaults of Knowledge: research"): the mod's techs and its factions' research
 * stances exported as VoK's CSV rows in owned blocks (hand-written rows stay, or are taken over), the
 * tech icons in settings.json, "unlocked by a quest" as a global flag, and SagaLib 1.4's VoK bridge
 * commands (SF_GrantResearch, SF_HasResearch) in quests and Play. SagaLib's side is tested in
 * mods/SagaLib (ResearchTests) and by its build (test/sagalib77.test.ts); the in-game check is
 * INGAME-CHECKS "Task #77".
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEVENTYSEVEN_A, SEVENTYSEVEN_HAND_TECHS, SEVENTYSEVEN_INDEX } from './fixtures/seventyseven'
import { testModFiles, testModState } from './fixtures/testmod'
import {
  VOK_FACTIONS_CSV, VOK_TECHS_CSV, factionFromRow, factionRow, handRows, researchOf, rewardsCell, techChoices, techFromRow, techRow, unlockFlag, usesVok, withoutHandRows
} from '../src/shared/research'
import { researchProblems } from '../src/shared/checks/research'
import { modProblems } from '../src/shared/checks/mods'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { needsSagaLib14 } from '../src/shared/export/runtime'
import { planExport } from '../src/shared/export'
import { findBlocks } from '../src/shared/export/blocks'
import { modelFromProject, modelToWrites, planTexts, type ModModel } from '../src/shared/serialize'
import { parseLooseObject } from '../src/shared/loosejson'
import { parseCsv, csvObjects } from '../src/shared/csv'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, type SimWorld } from '../src/shared/play'
import { skipEffects } from '../src/shared/questskip'
import { buildRegistry, flagProblems } from '../src/shared/flags'
import { modUses } from '../src/shared/moduses'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import type { CheckContext } from '../src/shared/checks'
import type { GameIndex, ValidInstall } from '../src/shared/api'
import { realDir } from './realdir'

const index = { sources: SEVENTYSEVEN_INDEX.sources, factions: SEVENTYSEVEN_INDEX.factions, people: [], markets: [], systems: [], items: SEVENTYSEVEN_INDEX.items, hulls: [], weapons: [], hullmods: [], industries: [], variants: [], codeSystems: [], places: [], researchTechs: SEVENTYSEVEN_INDEX.researchTechs } as unknown as GameIndex
const ctx = (m: ModModel, files: Record<string, string> = {}): CheckContext => ({ model: m, index, defs: {} as never, loaded: testModState(SEVENTYSEVEN_A, m, files), rules: null, styleChecks: false })
const exportOf = (m: ModModel, files: Record<string, string> = {}) => planExport(m, testModState(SEVENTYSEVEN_A, m, files), index, null, { addDependency: true })
const textOf = (plan: ReturnType<typeof exportOf>, p: string) => plan.writes.find((w) => w.path === p)?.text
const rowsOf = (text: string) => csvObjects(parseCsv(text)).filter((r) => r.id && !r.id.startsWith('#') || r.factionId && !r.factionId.startsWith('#'))
const tech = (m: ModModel, id: string) => m.research!.techs.find((t) => t.id === id)!

describe('#77 rows as Vaults of Knowledge reads them', () => {
  it('a tech: "none" without prerequisites, items id:qty, reward lines value:type, the quest flag in otherReq, the mod id', () => {
    const m = SEVENTYSEVEN_A.model()
    expect(techRow(tech(m, 'rsv_tech_basics'), 'seventyseven_a')).toMatchObject({ reqToResearchFirst: 'none', itemReqToResearch: '', iconId: 'basic', isResearchedFromStart: 'true', otherReq: '', modId: 'seventyseven_a', tier: '0', columnNumber: '0', rowNumber: '0' })
    expect(techRow(tech(m, 'rsv_tech_relay'), 'seventyseven_a')).toMatchObject({ reqToResearchFirst: 'aotd_tech_ind_base_template,rsv_tech_basics', itemReqToResearch: 'research_databank:1', iconId: 'rsv_tech_relay', isResearchedFromStart: 'false' })
    expect(techRow(tech(m, 'rsv_tech_vault'), 'x').otherReq).toBe('$rsv_tech_vault_unlocked:Finish Test 77 - the vault job at Waypoint 77.')
    const t = { ...tech(m, 'rsv_tech_gift'), rewards: [{ type: 'industry' as const, value: 'farming' }, { type: 'modifier' as const, value: 'Faster growth' }], quest: { text: 'Ask: the archivist' } }
    const r = techRow(t, 'x')
    expect(r.rewards).toBe('farming:industry\nFaster growth:modifier')
    // VoK splits otherReq on ":" into exactly two parts
    expect(r.otherReq).toBe('$rsv_tech_gift_unlocked:Ask - the archivist')
  })
  it('what VoK\'s reader would trip on: a colon in a modifier text, no rewards line at all', () => {
    const t = { id: 'x_t', name: 'Deep: Core', rewards: [{ type: 'modifier' as const, value: 'Test 77: faster' }, { type: 'industry' as const, value: 'farming' }] }
    expect(rewardsCell(t)).toBe('Test 77 - faster:modifier\nfarming:industry')
    // VoK fails on an empty rewards cell while the game loads: the name stands in
    expect(rewardsCell({ ...t, rewards: [] })).toBe('Deep - Core:modifier')
    expect(rewardsCell({ ...t, rewards: [{ type: 'ship', value: ' ' }] })).toBe('Deep - Core:modifier')
  })
  it('a faction stance: multipliers as numbers, forbidden techs comma-separated, empty lines left to VoK', () => {
    expect(factionRow('rsv_x', { stance: 'BALANCE', forbidden: ['a', 'b'], cashMult: 0.2, repMult: 1 })).toEqual({
      factionId: 'rsv_x', researchStance: 'BALANCE', forbidden_tech: 'a,b', db_cash_mult: '0.2', db_rep_mult: '1', initResponse: '', dialogSelectOptionName: '', dialogDismayOptionName: '', responseAfter: ''
    })
  })
  it('hand-written rows read back into the editor (VoK\'s own row format)', () => {
    const h = handRows(SEVENTYSEVEN_HAND_TECHS, 'id')
    expect(h.map((r) => r.key)).toEqual(['rsv_tech_hand'])
    const t = techFromRow(h[0].row)
    expect(t).toMatchObject({ id: 'rsv_tech_hand', name: 'Test 77: Hand-written', tier: 0, days: 10, requires: [], items: [{ id: 'research_databank', qty: 1 }], rewards: [{ type: 'modifier', value: 'A hand-written row outside the block' }], column: 3, row: 0, icon: 'basic' })
    expect(techRow(t, 'seventyseven_a')).toMatchObject(Object.fromEntries(Object.entries(h[0].row).filter(([k]) => k !== 'tags')))
    // VoK's sample row (FORMATS.md), multi-line rewards and the editor's quest flag
    const vok = 'id,name,tier,timeToResearch,reqToResearchFirst,itemReqToResearch,iconId,rewards,columnNumber,rowNumber,isResearchedFromStart,otherReq,tags,modId,,,\n' +
      'x_t,X,2,15,"a,b",research_databank:3,farming2,"farming:industry\nmining:industry",1,7,false,$x_t_unlocked:Do it,,x,,,\n' +
      ',,,,,,,,,,,,,,,,\n'
    const xt = techFromRow(handRows(vok, 'id')[0].row)
    expect(xt).toMatchObject({ requires: ['a', 'b'], rewards: [{ type: 'industry', value: 'farming' }, { type: 'industry', value: 'mining' }], quest: { text: 'Do it' } })
    expect(handRows(vok, 'id')).toHaveLength(1)
    const f = factionFromRow({ factionId: 'z', researchStance: 'cleanse', forbidden_tech: 'a, b', db_cash_mult: '0.2', db_rep_mult: '1', initResponse: 'Hi', dialogSelectOptionName: '', dialogDismayOptionName: '', responseAfter: '' })
    expect(f).toEqual({ stance: 'CLEANSE', forbidden: ['a', 'b'], cashMult: 0.2, repMult: 1, initResponse: 'Hi' })
  })
})

describe('#77 export', () => {
  it('writes both files (owned blocks), the tech icons into settings.json, and nothing for a mod without research', () => {
    const plan = exportOf(SEVENTYSEVEN_A.model())
    const techs = textOf(plan, VOK_TECHS_CSV)!
    expect(techs.split('\n')[0]).toBe('id,name,tier,timeToResearch,reqToResearchFirst,itemReqToResearch,iconId,rewards,columnNumber,rowNumber,isResearchedFromStart,otherReq,tags,modId')
    expect(findBlocks(techs).map((b) => b.key)).toEqual(['research'])
    expect(rowsOf(techs).map((r) => r.id)).toEqual(['rsv_tech_basics', 'rsv_tech_relay', 'rsv_tech_vault', 'rsv_tech_gift'])
    const fac = textOf(plan, VOK_FACTIONS_CSV)!
    expect(rowsOf(fac)).toEqual([expect.objectContaining({ factionId: 'rsv_institute', researchStance: 'PRIORITIZE', db_cash_mult: '2', db_rep_mult: '0.5', forbidden_tech: 'aotd_tech_hull_manufacture' })])
    const settings = parseLooseObject(textOf(plan, 'data/config/settings.json')!).value as { graphics: Record<string, Record<string, string>> }
    expect(settings.graphics.ui_icons_tech_tree).toEqual({ rsv_tech_relay: 'graphics/icons/tech/rsv_relay.png' })
    expect(plan.files.find((f) => f.path === 'data/config/settings.json')?.summary).toContain('1 tech icon for Vaults of Knowledge')
    const bare = exportOf(SEVENTYSEVEN_A.model() && { ...SEVENTYSEVEN_A.model(), research: { techs: [], factions: {} } })
    expect(bare.writes.some((w) => w.path === VOK_TECHS_CSV || w.path === VOK_FACTIONS_CSV)).toBe(false)
  })
  it('owned blocks keep hand-written rows, and stay the same on the next export', () => {
    const m = SEVENTYSEVEN_A.model()
    const handFac = 'factionId,researchStance,forbidden_tech,db_cash_mult,db_rep_mult,initResponse,dialogSelectOptionName,dialogDismayOptionName,responseAfter,\nrsv_other,BALANCE,,1,1,Hand.,,,,\n'
    const files = { [VOK_TECHS_CSV]: SEVENTYSEVEN_HAND_TECHS, [VOK_FACTIONS_CSV]: handFac }
    const plan = exportOf(m, files)
    const techs = textOf(plan, VOK_TECHS_CSV)!
    expect(techs.startsWith(SEVENTYSEVEN_HAND_TECHS)).toBe(true)
    expect(rowsOf(techs).map((r) => r.id)).toEqual(['rsv_tech_hand', 'rsv_tech_basics', 'rsv_tech_relay', 'rsv_tech_vault', 'rsv_tech_gift'])
    expect(plan.files.find((f) => f.path === VOK_TECHS_CSV)?.handRows).toBe(1)
    const fac = textOf(plan, VOK_FACTIONS_CSV)!
    expect(fac.startsWith(handFac)).toBe(true)
    // the faction file's header (with VoK's trailing empty column) is kept
    expect(findBlocks(fac)).toHaveLength(1)
    const again = exportOf(m, { ...files, [VOK_TECHS_CSV]: techs, [VOK_FACTIONS_CSV]: fac })
    expect(again.writes.some((w) => w.path === VOK_TECHS_CSV || w.path === VOK_FACTIONS_CSV)).toBe(false)
    // without techs the block goes and the hand-written row stays
    const none = exportOf({ ...m, research: { techs: [], factions: {} } }, { [VOK_TECHS_CSV]: techs })
    expect(textOf(none, VOK_TECHS_CSV)).toBe(SEVENTYSEVEN_HAND_TECHS)
  })
  it('a hand-written row taken into the editor leaves the hand-written part (the file never has an id twice)', () => {
    const m = SEVENTYSEVEN_A.model()
    m.research!.techs.push(techFromRow(handRows(SEVENTYSEVEN_HAND_TECHS, 'id')[0].row))
    const plan = exportOf(m, { [VOK_TECHS_CSV]: SEVENTYSEVEN_HAND_TECHS })
    const techs = textOf(plan, VOK_TECHS_CSV)!
    expect(rowsOf(techs).filter((r) => r.id === 'rsv_tech_hand')).toHaveLength(1)
    expect(handRows(techs, 'id')).toEqual([])
    expect(plan.files.find((f) => f.path === VOK_TECHS_CSV)?.summary).toContain('takes over 1 hand-written row (rsv_tech_hand)')
    expect(withoutHandRows('id,x\r\nkeep,1\r\ndrop,2\r\n', 'id', new Set(['drop']))).toEqual({ text: 'id,x\r\nkeep,1\r\n', removed: ['drop'] })
  })
  it('"unlocked by a quest" is a plain global flag; granting needs SagaLib 1.4', () => {
    const m = SEVENTYSEVEN_A.model()
    const vault = m.quests.find((q) => q.id === 'rsv_vault')!
    const rows = compileQuest(vault, { sagalib: true, phrases: [] }).rows
    expect(rows.some((r) => r.script.split('\n').includes('$global.rsv_tech_vault_unlocked = true'))).toBe(true)
    expect(unlockFlag('rsv_tech_vault')).toBe('$global.rsv_tech_vault_unlocked')
    const end = rows.find((r) => r.script.includes('SF_End rsv_vault success'))!
    expect(end.script.split('\n').slice(0, 2)).toEqual(['SF_End rsv_vault success', 'SF_GrantResearch rsv_tech_gift'])
    expect(researchOf(vault)).toEqual({ unlocks: ['rsv_tech_vault'], grants: ['rsv_tech_gift'], tests: [] })
    expect(researchOf(m.quests.find((q) => q.id === 'rsv_status')!)).toEqual({ unlocks: [], grants: ['aotd_tech_agriculture'], tests: ['rsv_tech_gift', 'aotd_tech_agriculture', 'aotd_tech_ind_base_template'] })
    expect(needsSagaLib14(m)).toBe(true)
    expect(testModFiles(SEVENTYSEVEN_A)['mod_info.json']).toContain('"version": "1.4.0"')
    // only an unlock: no SagaLib command, so not SagaLib 1.4
    const only = SEVENTYSEVEN_A.model()
    only.quests = [vault]
    for (const n of vault.nodes) if (n.type === 'end') delete n.research
    expect(needsSagaLib14(only)).toBe(false)
  })
})

describe('#77 the plan file and the editor', () => {
  it('saves sagaforge/research.json and reads it back', () => {
    const m = SEVENTYSEVEN_A.model()
    const plans = planTexts(m)
    expect(JSON.parse(plans['sagaforge/research.json'])).toMatchObject({ techs: m.research!.techs, factions: m.research!.factions })
    const loaded = { ...testModState(SEVENTYSEVEN_A, m, plans), research: JSON.parse(plans['sagaforge/research.json']) }
    expect(modelFromProject(loaded).research).toEqual(m.research)
    // nothing left: the plan file is removed
    const empty = { ...m, research: { techs: [], factions: {} } }
    expect(modelToWrites(empty, testModState(SEVENTYSEVEN_A, m, plans)).find((w) => w.path === 'sagaforge/research.json')?.remove).toBe(true)
  })
  it('picks: the mod\'s own techs first, then VoK\'s', () => {
    const c = techChoices(SEVENTYSEVEN_A.model(), index)
    expect(c.slice(0, 4).map((x) => x.where)).toEqual(['this mod', 'this mod', 'this mod', 'this mod'])
    expect(c.map((x) => x.id)).toContain('aotd_tech_agriculture')
    expect(c.find((x) => x.id === 'aotd_tech_agriculture')?.name).toBe('Agriculture Industrialization (VoK, tier 1)')
  })
  it('VoK is a used mod (Problems asks to list it), optional fits', () => {
    const m = SEVENTYSEVEN_A.model()
    expect(usesVok(m)).toBe(true)
    const uses = modUses(m, index, { sourceId: 'seventyseven_a', frameworkFiles: [VOK_TECHS_CSV] })
    expect(uses.get('aotd_vok')?.map((u) => u.key)).toEqual(['file:research', 'file:research:rsv_institute', 'file:questresearch:rsv_vault', 'file:questresearch:rsv_status'])
    m.project.mods = []
    expect(modProblems(ctx(m)).some((p) => /Vaults of Knowledge|aotd_vok/.test(p.message))).toBe(true)
  })
  it('the flags registry knows VoK reads the unlock flag', () => {
    const reg = buildRegistry(SEVENTYSEVEN_A.model(), [])
    expect(reg.get('$global.rsv_tech_vault_unlocked')?.readBy[0].where).toBe('Research "Test 77: Vault Protocols"')
    expect(flagProblems(reg, 'rsv_').filter((p) => p.message.includes('rsv_tech_vault_unlocked'))).toEqual([])
  })
  it('a quest skip sets the unlock flag and says it doesn\'t grant', () => {
    const vault = SEVENTYSEVEN_A.model().quests.find((q) => q.id === 'rsv_vault')!
    const fx = skipEffects(vault, 'won')
    expect(fx.flags.find((f) => f.key === '$global.rsv_tech_vault_unlocked')?.value).toBe(true)
    expect(fx.notes).toContain("Grants research rsv_tech_gift (end won); a skip doesn't.")
  })
})

describe('#77 checks', () => {
  it('the test mod has no research problems', () => {
    expect(researchProblems(ctx(SEVENTYSEVEN_A.model(), { [VOK_TECHS_CSV]: SEVENTYSEVEN_HAND_TECHS })).filter((p) => p.level !== 'info')).toEqual([])
  })
  it('ids, prerequisites, loops, places, quest unlocks and hand-written rows', () => {
    const m = SEVENTYSEVEN_A.model()
    const r = m.research!
    r.techs.push({ ...tech(m, 'rsv_tech_basics'), id: 'aotd_tech_agriculture', name: 'Clash' })
    tech(m, 'rsv_tech_relay').requires.push('nope_tech')
    tech(m, 'rsv_tech_vault').requires = ['rsv_tech_gift']
    tech(m, 'rsv_tech_gift').column = 0
    r.techs.push({ id: 'rsv_tech_lonely', name: 'Lonely', tier: 2, days: 5, requires: [], items: [], rewards: [], column: 0, row: 0, quest: { text: 'x' } })
    r.factions.rsv_institute.stance = 'FRIENDLY'
    const vault = m.quests.find((q) => q.id === 'rsv_vault')!
    vault.nodes.push({ id: 'x', type: 'action', x: 0, y: 0, ops: [{ op: 'unlockResearch', tech: 'rsv_tech_gift' }, { op: 'grantResearch', tech: '' }] })
    const hand = 'id,name,tier,timeToResearch,reqToResearchFirst,itemReqToResearch,iconId,rewards,columnNumber,rowNumber,isResearchedFromStart,otherReq,tags,modId\nrsv_h,H,one,10,,,,,0,0,false,,,x\n'
    const keys = researchProblems(ctx(m, { [VOK_TECHS_CSV]: hand })).map((p) => p.key?.split(':')[0])
    for (const k of ['techother', 'techreq', 'techloop', 'techspot', 'techneverq', 'facstance', 'resunlq', 'resop', 'handreq', 'handnum', 'handrw', 'technorw']) expect(keys).toContain(k)
  })
  it('icons: none is an error (VoK looks every one up); an id no installed mod lists is a warning', () => {
    const m = SEVENTYSEVEN_A.model()
    delete tech(m, 'rsv_tech_basics').icon
    tech(m, 'rsv_tech_vault').icon = 'farming9'
    tech(m, 'rsv_tech_gift').rewards.push({ ...tech(m, 'rsv_tech_gift').rewards[0] })
    const c = ctx(m)
    c.index = { ...index, researchIcons: ['basic', 'farming1'] } as GameIndex
    const p = researchProblems(c)
    expect(p.find((x) => x.key === 'technoicon:rsv_tech_basics')?.level).toBe('error')
    expect(p.find((x) => x.key === 'techicon:rsv_tech_vault')?.level).toBe('warning')
    expect(p.some((x) => x.key?.startsWith('techrwdup:rsv_tech_gift'))).toBe(true)
    // the mod's own image is checked as a file (Check mod), not as an id
    expect(p.some((x) => x.key === 'techicon:rsv_tech_relay')).toBe(false)
  })
  it('tier 0: VoK researches it at load (seen in game), so costs, prerequisites or a quest unlock never matter', () => {
    const m = SEVENTYSEVEN_A.model()
    tech(m, 'rsv_tech_vault').tier = 0
    expect(researchProblems(ctx(m)).find((x) => x.key === 'techtier0:rsv_tech_vault')?.message).toContain('"unlocked by a quest"')
    // researched from the start on purpose: no warning
    expect(researchProblems(ctx(m)).some((x) => x.key === 'techtier0:rsv_tech_basics')).toBe(false)
  })
})

describe('#77 Play', () => {
  const run = (vok: boolean) => {
    const m = SEVENTYSEVEN_A.model()
    const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib: true, phrases: [] }).rows)
    const w: SimWorld = { quests: m.quests, phrases: new Map(), mods: { lists: [], enabled: new Set(vok ? ['aotd_vok'] : []) }, research: { name: (id) => m.research!.techs.find((t) => t.id === id)?.name, fromStart: (id) => id === 'aotd_tech_ind_base_template' } }
    const e = new Engine(compileRules(rows), newContext(), sagaHooks(w, newSimState()))
    e.set('$id', 'rsv_station')
    e.fireAll('PopulateOptions')
    e.select(startOptionId(m.quests.find((q) => q.id === 'rsv_status')!))
    return e
  }
  const ask = (e: Engine, opt: string) => { e.select(`rsv_status_${opt}`); const t = e.view.paragraphs.map((p) => p.text).join(' | '); e.select(e.view.options[0].id); return t }
  it('with VoK: granting marks it researched; SF_HasResearch answers', () => {
    const e = run(true)
    expect(ask(e, 'agri')).toContain('no, the player hasn')
    e.select('rsv_status_grant')
    expect(e.view.paragraphs.map((p) => p.text).join(' | ')).toContain('Research completed: aotd_tech_agriculture')
    e.select(e.view.options[0].id)
    expect(ask(e, 'agri')).toContain('yes, the player has')
  })
  it('without VoK: granting does nothing and every answer is no', () => {
    const e = run(false)
    e.select('rsv_status_grant')
    expect(e.view.paragraphs.map((p) => p.text).join(' | ')).not.toContain('Research completed')
    expect(e.log.some((l) => l.text.includes('nothing happens (Vaults of Knowledge is off)'))).toBe(true)
    e.select(e.view.options[0].id)
    expect(ask(e, 'agri')).toContain('no, the player hasn')
    expect(ask(e, 'heg')).toContain('no, the Hegemony')
  })
})

describe('#77 the real install', () => {
  it.skipIf(!realDir)('indexes VoK\'s techs and stances (for prerequisites and grants)', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const vok = cache.index.sources.find((s) => s.id === 'aotd_vok')
    if (!vok) return
    const agri = cache.index.researchTechs?.find((t) => t.id === 'aotd_tech_agriculture')
    expect(agri).toMatchObject({ name: 'Agriculture Industrialization', tier: 1, modId: 'aotd_vok', fromStart: false, requires: ['aotd_tech_rudimentary_eq'], definedBy: 'aotd_vok' })
    expect(cache.index.researchTechs?.find((t) => t.id === 'aotd_tech_janus_device_analysis')?.otherReq).toBe('$playerCanUseGates:Must aqquire Janus Device.')
    expect(cache.index.researchFactions?.find((f) => f.id === 'tritachyon')?.stance).toBe('PRIORITIZE')
    // VoK's own file reads back through the editor's reader without loss of the columns it writes
    const text = fs.readFileSync(path.join(vok.dir, VOK_TECHS_CSV), 'utf8')
    for (const h of handRows(text, 'id')) {
      const t = techFromRow(h.row)
      const back = techRow(t, h.row.modId)
      for (const k of ['id', 'tier', 'timeToResearch', 'iconId', 'columnNumber', 'rowNumber', 'isResearchedFromStart', 'modId']) expect(back[k], `${h.key}.${k}`).toBe(h.row[k].trim())
      // costs as VoK reads them: an entry without exactly one ":" is skipped (VoK's own "research_databank10")
      expect(back.itemReqToResearch, `${h.key} costs`).toBe(h.row.itemReqToResearch.split(',').map((x) => x.trim()).filter((x) => x.split(':').length === 2).join(','))
      expect(back.reqToResearchFirst.split(','), `${h.key} requires`).toEqual(h.row.reqToResearchFirst.split(',').map((x) => x.trim()))
    }
  }, 120_000)
})
