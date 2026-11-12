/**
 * The Vanguard Compact example (PLAN.md §1, §8 "Acceptance"): checked against the real game index,
 * played through end to end with the exported rules, and its export compared with the files
 * checked in under test/expected/vanguard (a change in any writer shows up as a diff there).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { vanguardModel } from './fixtures/vanguard'
import { exampleFiles, exampleState } from './fixtures/vanguard-files'
import { checkModel, type CheckContext } from '../src/shared/checks'
import { unguardedWrecks } from '../src/shared/checks/quests'
import { itemKindLookup } from '../src/shared/export/items'
import { planExport } from '../src/shared/export'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { compileRules, emptyView, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, questState } from '../src/shared/play'
import { modelToWrites, planTexts } from '../src/shared/serialize'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import { defsFor } from '../src/shared/defs'
import { hashText } from '../src/main/install'
import type { ProjectState } from '../src/shared/project'
import type { ValidInstall } from '../src/shared/api'
import { realDir } from './realdir'

describe('Vanguard Compact example (acceptance)', () => {
  it.skipIf(!realDir)('has no errors against the game and every installed mod', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = vanguardModel()
    const loaded = exampleState(planTexts(m))
    const probs = checkModel({ model: m, index: cache.index, defs: defsFor(install.gameVersion), loaded, rules: cache.rules, styleChecks: false })
    const errors = probs.filter((p) => p.level === 'error')
    expect(errors.map((p) => p.message)).toEqual([])
  }, 120_000)

  it('plays The Lost Convoy from the offer to the reward, through the ambush and the arrivals', () => {
    const m = vanguardModel()
    const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
    const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib: true, phrases, itemKind: itemKindLookup(m.items) }).rows)
    const sim = newSimState()
    const ctx = newContext()
    ctx.tokens.$playerLastName = 'Varga'
    ctx.random = () => 0
    const e = new Engine(compileRules(rows), ctx, sagaHooks({ quests: m.quests, phrases: new Map(phrases.map((p) => [p.token, p])) }, sim))
    const q = m.quests[0]
    e.set('$global.vgc_lost_convoy_pay', 1)
    e.view.options = [{ id: startOptionId(q), text: '', order: 0, enabled: true }]
    e.select(startOptionId(q))
    expect(e.view.paragraphs.find((p) => p.kind === 'text')!.text).toMatch(/^"Captain\." Reyes/)
    expect(e.view.options.map((o) => o.id)).toContain('vgc_lost_convoy_double')
    e.select('vgc_lost_convoy_double')
    expect(e.get('$global.vgc_lost_convoy_pay')).toBe(2)
    e.select('vgc_lost_convoy_accept')
    expect(questState(e, q.id)).toEqual({ state: 'active', step: 'search' })
    expect(sim.spawned).toEqual(['vgc_belt_ambush'])
    // in game, Accept used to leave the offer's options in place (2026-11-11): now Reyes answers
    expect(e.view.options.map((o) => o.id)).toEqual(['vgc_lost_convoy_leave_accepted'])
    e.select('vgc_lost_convoy_leave_accepted')
    // the fleet is beaten (SagaLib fires the outcome trigger)
    e.fireBest('vgc_lost_convoy_ambush_defeated')
    // the player reaches the wreck
    e.set('$id', 'vgc_convoy_wreck')
    e.fireBest('OpenInteractionDialog')
    expect(e.view.paragraphs.some((p) => p.text.includes('Gained 1'))).toBe(true)
    expect(e.view.visual).toEqual({ kind: 'image', category: 'illustrations', key: 'vgc_wreck' })
    // the journal moves on as the black box is found, not when leaving (asked in game, 2026-11-11)
    expect(questState(e, q.id).step).toBe('return')
    // Leave closes the dialog: a wreck has no menu to go back to (it stayed open in game, 2026-11-11)
    e.select('vgc_lost_convoy_leave_wreck')
    expect(e.view.ended).toBe(true)
    // docking at Haven Station (a new dialog): the report, then double pay
    e.view = emptyView()
    e.set('$id', 'vgc_haven')
    e.fireBest('OpenInteractionDialog')
    e.select('vgc_lost_convoy_hand_over')
    expect(questState(e, q.id).state).toBe('success')
    expect(ctx.player.credits).toBe(120000 + 120000)
    // docking again shows the normal market dialog, not the report
    e.fired = []
    e.set('$id', 'vgc_haven')
    expect(e.candidates('OpenInteractionDialog').some((r) => r.row.id.startsWith('vgc_'))).toBe(false)

    // the wreck between the quests: Compact property, nothing to salvage (vanilla's salvage would remove it)
    const visitWreck = () => { e.view = emptyView(); e.fired = []; e.set('$id', 'vgc_convoy_wreck'); return e.fireBest('OpenInteractionDialog')?.row.id }
    expect(visitWreck()).toBe('vgc_wreck_lock_offer')
    expect(e.view.options.map((o) => o.id)).toEqual(['defaultLeave'])

    // Salvage Rights: accept at Reyes, then the wreck opens to vanilla's salvage
    const sr = m.quests.find((x) => x.id === 'vgc_salvage_rights')!
    e.view = emptyView()
    e.view.options = [{ id: startOptionId(sr), text: '', order: 0, enabled: true }]
    e.select(startOptionId(sr))
    e.select('vgc_salvage_rights_accept')
    expect(questState(e, sr.id)).toEqual({ state: 'active', step: 'survey' })
    expect(visitWreck()).toBe('vgc_salvage_rights_arrive')
    expect(e.view.options.map((o) => o.id)).toEqual(['vgc_salvage_rights_salvage'])
    e.select('vgc_salvage_rights_salvage')
    expect(questState(e, sr.id).state).toBe('success')
    // the link fired OpenInteractionDialog again: no rule of ours answers any more (vanilla's salvage does)
    expect(e.candidates('OpenInteractionDialog').some((r) => r.row.id.startsWith('vgc_'))).toBe(false)
  })

  it('warns when a quest\'s wreck has no conversation guarding it', () => {
    const m = vanguardModel()
    // it only reads the plan (quests and systems)
    const ctx = (model: typeof m) => ({ model }) as unknown as CheckContext
    expect(unguardedWrecks(ctx(m))).toEqual([])
    m.quests = m.quests.filter((q) => q.id !== 'vgc_wreck_lock')
    const w = unguardedWrecks(ctx(m))
    expect(w.map((p) => p.key)).toEqual(['wreck:vgc_convoy_wreck'])
    expect(w[0].message).toContain('"The Lost Convoy", "Salvage Rights"')
  })

  it('exports the files checked in under test/expected/vanguard', () => {
    const files = exampleFiles()
    const dir = path.join(__dirname, 'expected', 'vanguard')
    const update = !fs.existsSync(dir) || process.env.SF_UPDATE_EXPECTED === '1'
    for (const [p, text] of Object.entries(files)) {
      const f = path.join(dir, ...p.split('/'))
      if (update) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
      expect(fs.readFileSync(f, 'utf8'), p).toBe(text)
    }
    const listed = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? listed(path.join(d, x.name)) : [path.relative(dir, path.join(d, x.name)).replace(/\\/g, '/')]))
    expect(listed(dir).sort()).toEqual(Object.keys(files).sort())
  })
})
