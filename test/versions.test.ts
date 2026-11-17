/** #47: migration install, per-mod target, version comparison, version problems, migration report. */
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { defsFor } from '../src/shared/defs'
import { diffDefs, diffIndexes, versionDiff, versionLabels } from '../src/shared/versiondiff'
import { fitsForms, lineCommand, replaceRefs, versionProblems } from '../src/shared/versionrefs'
import { defsOnlyDiff, migrationReport, movePlayerPortraits, needsMigration } from '../src/shared/migration'
import { installAges, sameFamily, versionFamily } from '../src/shared/version'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { newEncounter } from '../src/shared/encounters'
import { planExport } from '../src/shared/export'
import { emptyPatch } from '../src/shared/faction'
import { checkWritable, type WriteRules } from '../src/main/workspace'
import { snapshotMod, writeFiles } from '../src/main/modproject'
import { hashText } from '../src/main/install'
import { parseLooseObject } from '../src/shared/loosejson'
import type { GameIndex } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'

const old = defsFor('0.98a'), neu = defsFor('0.98.5a')
const named = (id: string, by = 'starsector-core') => ({ id, name: id, definedBy: by, changedBy: [] })
function idx(version: string, variants: string[], extra: Partial<GameIndex> = {}): GameIndex {
  return {
    install: { gameVersion: version }, factions: [named('hegemony')], hulls: [], variants: variants.map((v) => named(v)), wings: [], weapons: [], hullmods: [], items: [],
    industries: [], conditions: [], submarkets: [], customEntityTypes: [named('station_side02')], planetTypes: [], music: [], portraits: [], illustrations: [], sources: [{ id: 'starsector-core' }], ...extra
  } as unknown as GameIndex
}

describe('versions', () => {
  it('compares by release and orders the two installs by age, not by slot', () => {
    expect(versionFamily('0.98.5a-RC5')).toBe('0.98.5a')
    expect(sameFamily('0.98a-RC8', '0.98a-RC7')).toBe(true)
    expect(installAges('0.98.5a-RC5', '0.98a-RC8')).toEqual({ older: 'migration', newer: 'main' })
    expect(needsMigration('0.98a-RC8', '0.98.5a-RC5')).toBe(true)
    expect(needsMigration('0.98.5a-RC5', '0.98a-RC8')).toBe(false)
    expect(needsMigration('0.98a-RC7', '0.98a-RC8')).toBe(false)
  })

  it('finds the known 0.98a → 0.98.5a definition changes, including command forms', () => {
    const d = diffDefs(old, neu)
    expect(d.onlyNewer.command).toContain('ShowPlayerPerson')
    expect(d.onlyNewer.post).toContain('personnelOfficer')
    expect(d.commandForms.map((c) => c.name)).toEqual(expect.arrayContaining(['RepIsAtWorst', 'SetPersonHidden', 'MovePersonToMarket']))
  })

  it('compares game data of vanilla only, and labels ids for pickers', () => {
    const o = idx('0.98a-RC8', ['kite_Stock', 'wolf_Assault'], { variants: [named('kite_Stock'), named('wolf_Assault'), named('modship', 'somemod')] } as Partial<GameIndex>)
    const n = idx('0.98.5a-RC5', ['wolf_Assault', 'new_Variant'])
    expect(diffIndexes(o, n)).toEqual({ onlyNewer: { variant: ['new_Variant'] }, onlyOlder: { variant: ['kite_Stock'] } })
    const d = versionDiff({ defs: old, index: o, ruleIds: ['a', 'gone'] }, { defs: neu, index: n, ruleIds: ['a', 'fresh'] })
    expect(d.onlyOlder.rule).toEqual(['gone'])
    const l = versionLabels(d)
    expect(l.get('new_Variant')).toEqual({ text: '0.98.5a only', kind: 'newer' })
    expect(l.get('kite_Stock')).toEqual({ text: 'removed in 0.98.5a', kind: 'removed' })
    expect(l.has('gone')).toBe(false) // rule ids aren't picked
  })
})

describe('version problems and fixes (§5)', () => {
  function mod(): ModModel {
    const m = emptyModel('vgc_')
    const e = newEncounter('vgc_raid', 'Raid', 'hegemony')
    e.fleet.size = 'explicit'
    e.fleet.variants = ['new_Variant', 'wolf_Assault']
    m.encounters = [e]
    m.people = [{ id: 'vgc_p', name: { first: 'A', last: 'B' }, gender: 'MALE', faction: 'hegemony', rank: 'criminal', post: 'citizen', portrait: '', placement: { at: 'none' }, tags: [], phrases: [] }]
    const q = newQuest('vgc_q', 'Q')
    const dlg = q.nodes.find((n) => n.type === 'dialog')
    if (dlg && dlg.type === 'dialog') { dlg.script = ['ShowPlayerPerson', 'RepIsAtWorst FRIENDLY'] }
    m.quests = [q]
    return m
  }
  const o = idx('0.98a-RC8', ['kite_Stock', 'wolf_Assault']), n = idx('0.98.5a-RC5', ['wolf_Assault', 'new_Variant'])
  const d = versionDiff({ defs: old, index: o }, { defs: neu, index: n })

  it('targeting the older version: newer-only ids, commands and forms are errors with fixes', () => {
    const ps = versionProblems(mod(), d, false, old)
    const msgs = ps.map((p) => p.message)
    expect(msgs.some((x) => x.includes('variant "new_Variant" (0.98.5a only)'))).toBe(true)
    expect(msgs.some((x) => x.includes('rank "criminal"'))).toBe(true)
    if (ps.some((p) => p.message.includes('ShowPlayerPerson'))) expect(msgs.some((x) => x.includes('"ShowPlayerPerson" (0.98.5a only) isn\'t a command'))).toBe(true)
    expect(msgs.some((x) => x.includes('RepIsAtWorst takes <faction> <level>') || x.includes('RepIsAtWorst takes'))).toBe(true)
    expect(ps.every((p) => p.level === 'error' && p.area === 'Version')).toBe(true)
    expect(ps[0].fixes!.map((f) => f.action)).toEqual(['versionReplace', 'versionRemove', 'versionTarget'])
  })

  it('targeting the newer version: removed ids are the errors; replace and remove fix every use', () => {
    const m = mod()
    m.encounters[0].fleet.variants = ['kite_Stock', 'kite_Stock', 'wolf_Assault']
    expect(versionProblems(m, d, true, neu).filter((p) => p.message.includes('kite_Stock')).length).toBe(2)
    expect(replaceRefs(m, 'variant', 'kite_Stock', 'wolf_Assault')).toBe(2)
    expect(m.encounters[0].fleet.variants).toEqual(['wolf_Assault', 'wolf_Assault', 'wolf_Assault'])
    expect(replaceRefs(m, 'rank', 'criminal', null)).toBe(1)
    expect(m.people[0].rank).toBe('')
  })

  it('reads a rule line\'s command and checks argument counts against the forms', () => {
    expect(lineCommand('!RepIsAtWorst hegemony FRIENDLY')).toEqual({ name: 'RepIsAtWorst', args: ['hegemony', 'FRIENDLY'] })
    expect(lineCommand('$global.x == 1')).toBeNull()
    const f = old.ruleCommands.find((c) => c.name === 'RepIsAtWorst')!.forms
    expect(fitsForms(f, 2)).toBe(true)
    expect(fitsForms(f, 1)).toBe(false)
  })
})

describe('migration report (§7)', () => {
  const loaded = (m: ModModel, deps: string[] = []) => ({ id: 'vgc', name: 'V', version: '1', gameVersion: '0.98a-RC8', dependencies: deps.map((id) => ({ id })) })
  it('lists what must change, with safe fixes, notes where the mod uses the area, and what is new', () => {
    const m = emptyModel('vgc_')
    m.factions.push({ kind: 'override', id: 'player', file: 'data/world/factions/player.faction', patch: { ...emptyPatch(), add: { 'portraits.standard_male': ['graphics/portraits/vgc_a.png'] } } })
    const raw: Record<string, unknown> = { id: 'vgc_f', custom: { offersCommissions: true } }
    m.factions.push({ kind: 'addition', id: 'vgc_f', file: 'data/world/factions/vgc_f.faction', raw, listed: true })
    const diff = defsOnlyDiff(old, neu, '0.98a-RC8', '0.98.5a-RC5')
    const items = migrationReport({ model: m, modInfo: loaded(m, ['lw_lazylib']), handRuleIds: ['some_rule'], diff, target: '0.98.5a-RC5', targetDefs: neu, targetIndex: idx('0.98.5a-RC5', []) })
    const keys = items.map((i) => i.key)
    expect(keys).toEqual(expect.arrayContaining(['must:playerPortraits', 'must:gameVersion', 'must:dep:lw_lazylib', 'must:rules-unknown', 'note:commission', 'new:command']))
    expect(items.find((i) => i.key === 'must:playerPortraits')!.fix).toMatchObject({ safe: true })
    expect(movePlayerPortraits(m)).toBe(1)
    const p = m.factions[0]
    expect(p.kind === 'override' && p.patch.add).toEqual({ 'portraits.player_male': ['graphics/portraits/vgc_a.png'] })
  })
})

describe('export writes the target\'s gameVersion (§6)', () => {
  it('updates mod_info.json when the target differs', () => {
    const m = emptyModel('vgc_')
    const info = '{\n\t"id": "vgc",\n\t"gameVersion": "0.98a-RC8",\n}\n'
    const st = { sourceId: 'vgc', modDir: '/x', isNew: false, modInfo: { id: 'vgc', name: 'V', version: '1', gameVersion: '0.98a-RC8', dependencies: [] }, project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime, descriptions: {}, factions: [], releases: [], files: { 'mod_info.json': { text: info, hash: hashText(info) } }, errors: [] } as ProjectState
    const w = planExport(m, st, idx('0.98.5a-RC5', []), null, { gameVersion: '0.98.5a-RC5' }).writes.find((x) => x.path === 'mod_info.json')!
    expect(parseLooseObject(w.text).value.gameVersion).toBe('0.98.5a-RC5')
    expect(planExport(m, st, idx('0.98a-RC8', []), null, { gameVersion: '0.98a-RC8' }).writes.some((x) => x.path === 'mod_info.json')).toBe(false)
  })
})

describe('both installs stay untouched; snapshots are never pruned', () => {
  const tmp = path.resolve(__dirname, '..', '.userdata', 'test-tmp-versions')
  const ws = path.join(tmp, 'ws'), other = path.join(tmp, 'other-game')
  const rules: WriteRules = { modsRoot: ws, gameRoot: path.join(tmp, 'main-game'), gameMods: false, otherGameRoots: [other] }
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('refuses the other install even through a mod path inside it', () => {
    fs.mkdirSync(path.join(other, 'mods', 'm'), { recursive: true })
    expect(() => checkWritable(path.join(other, 'mods', 'm', 'x.json'), { ...rules, modsRoot: path.join(other, 'mods') })).toThrow(/other Starsector folder/)
  })

  it('takes a named snapshot that backup pruning leaves alone', async () => {
    const mod = path.join(ws, 'vgc')
    fs.mkdirSync(path.join(mod, 'data'), { recursive: true })
    fs.writeFileSync(path.join(mod, 'mod_info.json'), '{"id":"vgc"}')
    fs.writeFileSync(path.join(mod, 'data', 'a.csv'), 'id\n1\n')
    const snap = await snapshotMod(mod, '0.98a', rules, new Date('2026-01-01T00:00:00Z'))
    expect(fs.existsSync(path.join(snap, 'data', 'a.csv'))).toBe(true)
    // 12 ordinary backups: the 10 newest are kept, and the snapshot too
    for (let i = 0; i < 12; i++) {
      const text = `id\n${i + 2}\n`
      const cur = fs.readFileSync(path.join(mod, 'data', 'a.csv'), 'utf8')
      await writeFiles(mod, { writes: [{ path: 'data/a.csv', text, expectedHash: hashText(cur) }], backup: true }, rules, new Date(Date.UTC(2026, 1, 1, 0, i)))
    }
    const dirs = fs.readdirSync(path.join(mod, 'sagaforge', 'backups'))
    expect(dirs.filter((d) => d.endsWith(' 0.98a'))).toHaveLength(1)
    expect(dirs.filter((d) => !d.includes(' '))).toHaveLength(10)
  })
})
