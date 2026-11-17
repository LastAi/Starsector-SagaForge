/**
 * Write guard and file-writing tests (adapted from Ship Editor's). Everything happens in
 * .userdata/test-tmp with a FAKE game folder; the real Starsector folder is never involved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { checkWritable, createMod, writeText, workspaceProblem, type WriteRules } from '../src/main/workspace'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import { loadProject, writeFiles, modPath, removable } from '../src/main/modproject'
import { planExport } from '../src/shared/export'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { hashText } from '../src/main/install'
import { parseLooseObject } from '../src/shared/loosejson'
import type { ValidInstall } from '../src/shared/api'

const tmp = path.resolve(__dirname, '..', '.userdata', 'test-tmp')
const game = path.join(tmp, 'fakegame')
const gameMods = path.join(game, 'mods')
const core = path.join(game, 'starsector-core')
const ws = path.join(tmp, 'ws')
const wsRules: WriteRules = { modsRoot: ws, gameRoot: game, gameMods: false }
const gameRules: WriteRules = { modsRoot: gameMods, gameRoot: game, gameMods: true }

const writeCore = (rel: string, data: string | Buffer) => {
  const f = path.join(core, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, data)
}
const modInfo = (id: string) => `{"id": "${id}", "name": "${id}", "version": "1"}`

beforeAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  writeCore('data/campaign/rules.csv', 'id,trigger,conditions,script,text,options,notes\n# a comment,,,,,,\ngreet,OpenCommLink,,,Hello.,,\n')
  writeCore('data/world/factions/factions.csv', 'faction\ndata/world/factions/hegemony.faction\n')
  writeCore('data/world/factions/hegemony.faction', '{\n\t"id":"hegemony",\n\t"displayName":"Hegemony",\n\t"color":[245,150,30,255],\n\t"knownShips":{"hulls":["onslaught"]},\n}\n')
  fs.mkdirSync(path.join(gameMods, 'thirdparty'), { recursive: true })
  fs.writeFileSync(path.join(gameMods, 'thirdparty', 'mod_info.json'), modInfo('thirdparty'))
  fs.writeFileSync(path.join(gameMods, 'enabled_mods.json'), '{"enabledMods": []}')
  fs.symlinkSync(core, path.join(gameMods, 'corelink'), 'junction')
  fs.mkdirSync(ws, { recursive: true })
  fs.symlinkSync(core, path.join(ws, 'sneaky'), 'junction')
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('write guard, workspace mode', () => {
  it('allows data files inside a mod folder in the workspace', () => {
    expect(() => checkWritable(path.join(ws, 'mymod', 'data', 'world', 'factions', 'a.faction'), wsRules)).not.toThrow()
    expect(() => checkWritable(path.join(ws, 'mymod', 'data', 'campaign', 'rules.csv'), wsRules)).not.toThrow()
  })

  it('refuses anything else', () => {
    expect(() => checkWritable(path.join(tmp, 'elsewhere.json'), wsRules)).toThrow(/outside a mod folder/)
    expect(() => checkWritable(path.join(ws, 'loose.json'), wsRules)).toThrow(/outside a mod folder/)
    expect(() => checkWritable(path.join(ws, '..', 'ws2', 'm', 'a.json'), wsRules)).toThrow(/outside/)
    expect(() => checkWritable(path.join(ws, 'sneaky', 'data', 'x.json'), wsRules)).toThrow(/Starsector folder/)
    expect(() => checkWritable(path.join(ws, 'mymod', 'evil.exe'), wsRules)).toThrow(/file type/)
    expect(() => checkWritable(path.join(ws, 'mymod', 'src', 'Hook.java'), wsRules)).toThrow(/file type/)
    expect(() => checkWritable(path.join(ws, 'm', 'a.json'), { ...wsRules, modsRoot: null })).toThrow(/No mods folder/)
    expect(() => checkWritable(path.join(gameMods, 'thirdparty', 'a.json'), { ...wsRules, modsRoot: gameMods })).toThrow(/Starsector folder/)
  })

  it('rejects a workspace inside the game folder', () => {
    expect(workspaceProblem(gameMods, game)).toMatch(/inside the Starsector folder/)
    expect(workspaceProblem(ws, game)).toBeNull()
  })

  it('writes atomically', () => {
    const f = writeText(path.join(ws, 'mymod', 'x.json'), '{}', wsRules)
    expect(fs.readFileSync(f, 'utf8')).toBe('{}')
    expect(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })
})

describe('write guard, working directly in the game mods folder', () => {
  it('allows mod folders in <game>/mods', () => {
    expect(() => checkWritable(path.join(gameMods, 'thirdparty', 'data', 'a.json'), gameRules)).not.toThrow()
  })

  it('still refuses the base game, files in the mods folder itself, and links into the base game', () => {
    expect(() => checkWritable(path.join(gameMods, 'enabled_mods.json'), gameRules)).toThrow(/outside a mod folder/)
    expect(() => checkWritable(path.join(gameMods, 'corelink', 'data', 'x.json'), gameRules)).toThrow(/Starsector folder/)
    expect(() => checkWritable(path.join(core, 'data', 'x.json'), gameRules)).toThrow(/outside a mod folder/)
  })

  it('marks mods in <game>/mods as usable, except links into the base game', async () => {
    const install = detectInstall(game) as ValidInstall
    const cache = await buildIndex(install, { mode: 'game', workspaceDir: null, activeModDir: null })
    expect(cache.sources.find((s) => s.id === 'thirdparty')!.writable).toBe(true)
    expect(cache.sources.find((s) => s.isCore)!.writable).toBe(false)
    const ws0 = await buildIndex(install, { mode: 'workspace', workspaceDir: ws, activeModDir: null })
    expect(ws0.sources.find((s) => s.id === 'thirdparty')!.writable).toBe(false)
  })
})

describe('mod project: load and write', () => {
  let install: ValidInstall
  let modDir: string

  it('creates a mod with mod_info.json', () => {
    install = detectInstall(game) as ValidInstall
    expect(install.ok).toBe(true)
    modDir = createMod({ id: 'my_mod', name: 'My Mod', gameVersion: '0.98a-RC8' }, wsRules)
    expect(parseLooseObject(fs.readFileSync(path.join(modDir, 'mod_info.json'), 'utf8')).value).toMatchObject({ id: 'my_mod', gameVersion: '0.98a-RC8' })
    expect(() => createMod({ id: 'my_mod', name: 'Again', gameVersion: '' }, wsRules)).toThrow(/already exists/)
  })

  it('refuses paths that leave the mod', () => {
    expect(() => modPath(modDir, '../other/x.json')).toThrow(/Bad path/)
    expect(() => modPath(modDir, '')).toThrow()
  })

  it('writes new files, refuses changed-on-disk files, and keeps backups', async () => {
    const r1 = await writeFiles(modDir, { backup: true, writes: [
      { path: 'sagaforge/project.json', text: '{"format":1,"prefix":"mm_"}\n', expectedHash: null },
      { path: 'data/world/factions/hegemony.faction', text: '{\n\t"knownShips":{"hulls":["mm_ship"]},\n}\n', expectedHash: null }
    ] }, wsRules)
    expect(r1.conflicts).toEqual([])
    expect(r1.written.sort()).toEqual(['data/world/factions/hegemony.faction', 'sagaforge/project.json'])
    expect(r1.backupDir).toBeUndefined() // nothing existed before

    // a new file that exists already is a conflict (expectedHash null)
    const r2 = await writeFiles(modDir, { backup: true, writes: [{ path: 'sagaforge/project.json', text: 'x', expectedHash: null }] }, wsRules)
    expect(r2.conflicts).toEqual(['sagaforge/project.json'])
    expect(fs.readFileSync(path.join(modDir, 'sagaforge', 'project.json'), 'utf8')).toContain('mm_')

    // changing with the right hash writes and backs up the old text
    const old = fs.readFileSync(path.join(modDir, 'sagaforge', 'project.json'), 'utf8')
    const r3 = await writeFiles(modDir, { backup: true, writes: [{ path: 'sagaforge/project.json', text: '{"format":1,"prefix":"mm2_"}\n', expectedHash: hashText(old) }] }, wsRules)
    expect(r3.written).toEqual(['sagaforge/project.json'])
    expect(r3.backupDir).toBeTruthy()
    expect(fs.readFileSync(path.join(r3.backupDir!, 'sagaforge', 'project.json'), 'utf8')).toBe(old)

    // only plan files may be removed
    await expect(writeFiles(modDir, { backup: false, writes: [{ path: 'data/campaign/rules.csv', text: '', remove: true }] }, wsRules)).rejects.toThrow(/can be removed/)
    // code is never written
    await expect(writeFiles(modDir, { backup: false, writes: [{ path: 'src/X.java', text: '' }] }, wsRules)).rejects.toThrow(/file type/)
  })

  it('keeps only the last 10 backups', async () => {
    for (let i = 0; i < 12; i++) {
      const cur = fs.readFileSync(path.join(modDir, 'sagaforge', 'project.json'), 'utf8')
      await writeFiles(modDir, { backup: true, writes: [{ path: 'sagaforge/project.json', text: `{"format":1,"prefix":"p${i}_"}\n`, expectedHash: hashText(cur) }] }, wsRules, new Date(Date.UTC(2030, 0, 1, 0, 0, i)))
    }
    expect(fs.readdirSync(path.join(modDir, 'sagaforge', 'backups')).length).toBe(10)
  })

  it('loads the project: an override at vanilla\'s path is an override, a new file an addition', async () => {
    await writeFiles(modDir, { backup: false, writes: [
      { path: 'data/world/factions/mm_new.faction', text: '{"id":"mm_new","displayName":"New"}\n' },
      { path: 'data/world/factions/factions.csv', text: 'faction\ndata/world/factions/mm_new.faction\n' }
    ] }, wsRules)
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: ws, activeModDir: modDir })
    const src = cache.sources.find((s) => s.id === 'my_mod')!
    const p = await loadProject(cache, src)
    expect(p.project.prefix).toBe('p11_')
    const kinds = Object.fromEntries(p.factions.map((f) => [f.id, f.kind]))
    expect(kinds).toEqual({ hegemony: 'override', mm_new: 'addition' })
    expect(p.factions.find((f) => f.id === 'mm_new')!.listed).toBe(true)
    // the index records who changes hegemony
    expect(cache.index.factions.find((f) => f.id === 'hegemony')!.changedBy).toEqual(['my_mod'])
    expect(p.files['data/world/factions/factions.csv']).toBeTruthy()
  })

  it('exports, deletes a quest, exports again: its SagaLib file is removed and backed up (R11)', async () => {
    const reload = async () => {
      const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: ws, activeModDir: modDir })
      return { cache, loaded: await loadProject(cache, cache.sources.find((s) => s.id === 'my_mod')!) }
    }
    let tick = 0 // later than the earlier test's 2030 backups, which are pruned by name
    const exportModel = async (m: ModModel) => {
      const { cache, loaded } = await reload()
      const plan = planExport(m, loaded, cache.index, null, { addDependency: true })
      return writeFiles(modDir, { writes: plan.writes, backup: true }, wsRules, new Date(Date.UTC(2031, 0, 1, 0, 0, ++tick)))
    }
    const m = emptyModel('p11_')
    m.quests.push(newQuest('p11_gone', 'Gone soon', 'quest'), newQuest('p11_stays', 'Stays', 'quest'))
    const r1 = await exportModel(m)
    expect(r1.conflicts).toEqual([])
    const gone = path.join(modDir, 'data', 'sagaforge', 'quests', 'p11_gone.json')
    expect(fs.existsSync(gone)).toBe(true)

    m.quests = m.quests.filter((q) => q.id !== 'p11_gone')
    const r2 = await exportModel(m)
    expect(r2.conflicts).toEqual([])
    expect(r2.written).toContain('data/sagaforge/quests/p11_gone.json')
    expect(fs.existsSync(gone)).toBe(false)
    expect(fs.existsSync(path.join(modDir, 'data', 'sagaforge', 'quests', 'p11_stays.json'))).toBe(true)
    expect(fs.existsSync(path.join(r2.backupDir!, 'data', 'sagaforge', 'quests', 'p11_gone.json'))).toBe(true)
    // the SagaLib index no longer lists it
    expect(fs.readFileSync(path.join(modDir, 'data', 'config', 'sagaforge', 'content.csv'), 'utf8')).not.toContain('p11_gone')
  })

  it('writes imported image bytes, keeps an existing file, and replaces it with a backup when asked (R5)', async () => {
    const png = (n: number) => new Uint8Array([137, 80, 78, 71, n])
    const at = path.join(modDir, 'graphics', 'portraits', 'p11_cat.png')
    const r1 = await writeFiles(modDir, { writes: [], backup: true, copies: [{ to: 'graphics/portraits/p11_cat.png', bytes: png(1) }] }, wsRules)
    expect(r1.written).toEqual(['graphics/portraits/p11_cat.png'])
    // without replace, an existing image is kept
    await writeFiles(modDir, { writes: [], backup: true, copies: [{ to: 'graphics/portraits/p11_cat.png', bytes: png(2) }] }, wsRules)
    expect([...fs.readFileSync(at)].at(-1)).toBe(1)
    // with replace, the old one goes to the backups
    const r3 = await writeFiles(modDir, { writes: [], backup: true, copies: [{ to: 'graphics/portraits/p11_cat.png', bytes: png(3), replace: true }] }, wsRules, new Date(Date.UTC(2032, 0, 1)))
    expect([...fs.readFileSync(at)].at(-1)).toBe(3)
    expect([...fs.readFileSync(path.join(r3.backupDir!, 'graphics', 'portraits', 'p11_cat.png'))].at(-1)).toBe(1)
  })

  it('removes only plan files, faction files and generated SagaLib files', () => {
    for (const p of ['sagaforge/x.json', 'data/world/factions/a.faction', 'data/sagaforge/quests/q.json', 'data/sagaforge/people/p_people.json', 'data/config/sagaforge/content.csv']) expect(removable(p), p).toBe(true)
    for (const p of ['data/campaign/rules.csv', 'data/sagaforge/../campaign/rules.csv', 'data/config/settings.json', 'data/sagaforge/quests/q.java', 'mod_info.json', 'graphics/portraits/a.png']) expect(removable(p), p).toBe(false)
  })
})
