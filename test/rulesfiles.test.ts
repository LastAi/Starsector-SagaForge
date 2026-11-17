/**
 * The rule file list (GAME-0.98.5a-ASSESSMENT R1): 0.98.5a's settings.json "rules" names every rule
 * file the game loads, and each path is a merged CSV across the game and mods. The index must read
 * them all, and fall back to data/campaign/rules.csv when the key is missing (0.98a). Fake game
 * folders in .userdata/test-rules-tmp; the real install is only read.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, detectInstall, ruleFileList, DEFAULT_RULES_FILE } from '../src/main/gameindex'
import type { ValidInstall } from '../src/shared/api'
import { realDir } from './realdir'

const tmp = path.resolve(__dirname, '..', '.userdata', 'test-rules-tmp')
const HEAD = 'id,trigger,conditions,script,text,options,notes\n'
const row = (id: string, trigger = 'OpenCommLink', text = id) => `${id},${trigger},,,${text},,\n`

const write = (rel: string, data: string) => {
  const f = path.join(tmp, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, data)
}
const modInfo = (id: string) => `{"id": "${id}", "name": "${id}", "version": "1"}`

beforeAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  // ---- a 0.98.5a-style game: two listed rule files
  write('new/starsector-core/data/campaign/rules.csv', HEAD + '# a comment,,,,,,\n' + row('greet') + row('shared_id'))
  write('new/starsector-core/data/campaign/rules/story.csv', HEAD + row('story_a', 'StoryStart') + row('story_b', 'StoryNext') + row('shared_id', 'StoryNext'))
  write('new/starsector-core/data/campaign/rules/unlisted.csv', HEAD + row('never_loaded'))
  write('new/starsector-core/data/config/settings.json', '{\n\t# all the rule files that are loaded\n\t"rules":[\n\t\t"data/campaign/rules.csv",\n\t\t"data/campaign/rules/story.csv",\n\t],\n\t"hColor":[255,210,0,255],\n}\n')
  // an enabled mod: overrides a row at a listed path, and lists a file of its own (arrays append)
  write('new/mods/moda/mod_info.json', modInfo('moda'))
  write('new/mods/moda/data/campaign/rules/story.csv', HEAD + row('story_b', 'StoryNext', 'Mod text') + row('moda_extra', 'StoryNext'))
  write('new/mods/moda/data/campaign/rules.csv', HEAD + row('moda_greet'))
  write('new/mods/moda/data/campaign/rules/moda.csv', HEAD + row('moda_own'))
  write('new/mods/moda/data/config/settings.json', '{"rules": ["data/campaign/rules/moda.csv"]}')
  // a mod that isn't enabled: not in the merged settings, but its own listed file is still read
  write('new/mods/modb/mod_info.json', modInfo('modb'))
  write('new/mods/modb/data/campaign/rules/modb.csv', HEAD + row('modb_own'))
  write('new/mods/modb/data/config/settings.json', '{"rules": ["data/campaign/rules/modb.csv"]}')
  write('new/mods/enabled_mods.json', '{"enabledMods": ["moda"]}')

  // ---- a 0.98a-style game: no "rules" key, so only rules.csv counts
  write('old/starsector-core/data/campaign/rules.csv', HEAD + row('greet'))
  write('old/starsector-core/data/campaign/rules/story.csv', HEAD + row('story_a'))
  write('old/starsector-core/data/config/settings.json', '{"hColor":[255,210,0,255]}')
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('settings.json "rules" list', () => {
  it('normalizes and de-duplicates paths', () => {
    expect(ruleFileList({ rules: ['data/campaign/rules.csv', 'data\\campaign\\rules\\x.csv', './data/campaign/RULES.csv', '', null] })).toEqual(['data/campaign/rules.csv', 'data/campaign/rules/x.csv'])
    expect(ruleFileList({})).toEqual([])
    expect(ruleFileList({ rules: 'data/campaign/rules.csv' })).toEqual([])
  })

  it('reads every listed file in every source', async () => {
    const install = detectInstall(path.join(tmp, 'new')) as ValidInstall
    expect(install.ok).toBe(true)
    const c = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    expect(c.index.ruleFiles).toEqual(['data/campaign/rules.csv', 'data/campaign/rules/story.csv', 'data/campaign/rules/moda.csv'])
    const where = (id: string) => c.rules.filter((r) => r.id === id).map((r) => `${r.sourceId}:${r.file}`)
    expect(where('greet')).toEqual(['starsector-core:data/campaign/rules.csv'])
    expect(where('story_a')).toEqual(['starsector-core:data/campaign/rules/story.csv'])
    // the mod's row at the same path is recorded next to vanilla's (who wins is decided by the readers)
    expect(where('story_b')).toEqual(['starsector-core:data/campaign/rules/story.csv', 'moda:data/campaign/rules/story.csv'])
    expect(c.rules.find((r) => r.id === 'story_b' && r.sourceId === 'moda')?.text).toBe('Mod text')
    // the same id in two different listed files: both rows are kept (the game reports a clash)
    expect(where('shared_id')).toEqual(['starsector-core:data/campaign/rules.csv', 'starsector-core:data/campaign/rules/story.csv'])
    expect(where('moda_greet')).toEqual(['moda:data/campaign/rules.csv'])
    expect(where('moda_extra')).toEqual(['moda:data/campaign/rules/story.csv'])
    expect(where('moda_own')).toEqual(['moda:data/campaign/rules/moda.csv'])
    expect(where('modb_own')).toEqual(['modb:data/campaign/rules/modb.csv'])
    expect(where('never_loaded')).toEqual([])
    expect(c.index.ruleCounts).toEqual({ 'starsector-core': 5, moda: 4, modb: 1 })
    expect(c.rules.find((r) => r.id === 'story_a')?.line).toBe(2)
  })

  it('falls back to data/campaign/rules.csv without the key (0.98a)', async () => {
    const install = detectInstall(path.join(tmp, 'old')) as ValidInstall
    const c = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    expect(c.index.ruleFiles).toEqual([DEFAULT_RULES_FILE])
    expect(c.rules.map((r) => r.id)).toEqual(['greet'])
  })

  it.skipIf(!fs.existsSync('D:/Starsector_98_5a/starsector-core/data/campaign/rules/askoniaCrisis2.csv'))('reads vanilla 0.98.5a\'s askoniaCrisis2.csv', async () => {
    const install = detectInstall('D:/Starsector_98_5a') as ValidInstall
    expect(install.gameVersion).toBe('0.98.5a-RC5')
    const c = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const core = c.rules.filter((r) => r.sourceId === 'starsector-core')
    const byFile = (f: string) => core.filter((r) => r.file === f).length
    console.log(`0.98.5a vanilla rules: ${byFile('data/campaign/rules.csv')} in rules.csv, ${byFile('data/campaign/rules/askoniaCrisis2.csv')} in askoniaCrisis2.csv`)
    expect(c.index.ruleFiles).toContain('data/campaign/rules/askoniaCrisis2.csv')
    expect(byFile('data/campaign/rules/askoniaCrisis2.csv')).toBeGreaterThan(5000)
    expect(byFile('data/campaign/rules.csv')).toBeGreaterThan(10000)
  }, 180_000)

  it.skipIf(!realDir)('still reads the current install\'s rules', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const c = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    expect(c.index.ruleFiles?.[0]).toBe(DEFAULT_RULES_FILE)
    expect(c.rules.filter((r) => r.sourceId === 'starsector-core').length).toBeGreaterThan(1000)
  }, 180_000)
})
