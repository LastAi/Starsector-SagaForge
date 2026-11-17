/**
 * Phase 8b (R32): release packaging. The zip (name, one folder, what stays out), the Version
 * Checker file and its list, the forum post draft, and the releases folder's guard.
 */
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { forumPost, leftOutOfRelease, releaseDetailProblems, releaseFolder, releaseName, releaseText, vcVersion, versionFileText } from '../src/shared/releasepack'
import { crc32 } from '../src/main/zipwrite'
import { packRelease, releaseDirProblem } from '../src/main/release'
import { readZipEntry } from '../src/main/gameversion'
import { testModFiles } from './fixtures/testmod'
import { EIGHT_A } from './fixtures/phase8/eight_a'
import type { WriteRules } from '../src/main/workspace'

const tmp = path.resolve(__dirname, '..', '.userdata', 'test-release-tmp')
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const info = { id: 'vgc', name: 'Vanguard Compact', gameVersion: '0.98a-RC8', version: '1.1.0', dependencies: [{ id: 'lastai_sagalib', name: 'SagaLib' }] }

describe('names and contents', () => {
  it('names the zip as the forum title rule: [game version] Mod name version', () => {
    expect(releaseName(info, '1.1.0')).toBe('[0.98a] Vanguard Compact 1.1.0')
    expect(releaseName({ ...info, name: 'A: B/C?' }, '2.0')).toBe('[0.98a] A B C 2.0')
    expect(releaseFolder(info)).toBe('Vanguard Compact')
  })
  it('leaves out the plans, the test profiles, hidden and temporary files', () => {
    expect(leftOutOfRelease('sagaforge/quests/a.quest.json')).toBeTruthy()
    expect(leftOutOfRelease('data/sagaforge/dev/test_profiles.json')).toBeTruthy()
    expect(leftOutOfRelease('.git/config')).toBeTruthy()
    expect(leftOutOfRelease('graphics/Thumbs.db')).toBeTruthy()
    expect(leftOutOfRelease('data/sagaforge/quests/a.json')).toBeNull()
    expect(leftOutOfRelease('mod_info.json')).toBeNull()
  })
  it('drops the test profiles from content.csv (dev mode would miss the file)', () => {
    const csv = testModFiles(EIGHT_A)['data/config/sagaforge/content.csv']
    expect(csv).toContain('data/sagaforge/dev/')
    const out = releaseText('data/config/sagaforge/content.csv', csv)
    expect(out).not.toContain('data/sagaforge/dev/')
    expect(out).toContain('sea_reward,quest,')
    expect(releaseText('data/campaign/rules.csv', csv)).toBe(csv)
  })
})

describe('Version Checker', () => {
  it('writes nothing without a master address', () => {
    expect(versionFileText(info, '1.1.0', {})).toBeNull()
  })
  it('writes the file in Version Checker\'s shape', () => {
    const t = versionFileText(info, '1.1.0', { masterVersionUrl: 'https://raw.githubusercontent.com/me/vgc/main/vgc.version', threadId: 'https://fractalsoftworks.com/forum/index.php?topic=12345.0', downloadUrl: 'https://x/y.zip' })!
    expect(JSON.parse(t)).toEqual({ masterVersionFile: 'https://raw.githubusercontent.com/me/vgc/main/vgc.version', modName: 'Vanguard Compact', directDownloadURL: 'https://x/y.zip', modThreadId: 12345, modVersion: { major: 1, minor: 1, patch: 0 } })
    expect(vcVersion('0.3.2a')).toEqual({ major: 0, minor: 3, patch: '2a' })
  })
  it('is exported with a row in version_files.csv', () => {
    const def = { ...EIGHT_A, model: () => { const m = EIGHT_A.model(); m.project.release = { masterVersionUrl: 'https://raw.githubusercontent.com/me/x/main/eight_a.version' }; return m } }
    const files = testModFiles(def)
    expect(JSON.parse(files['eight_a.version']).modVersion).toEqual({ major: 1, minor: 0, patch: 0 })
    expect(files['data/config/version/version_files.csv']).toMatch(/^version file\n# sagaforge:begin[^\n]*\neight_a\.version\n# sagaforge:end/)
    expect(testModFiles(EIGHT_A)['eight_a.version']).toBeUndefined()
  })
  it('points out addresses that won\'t work', () => {
    expect(releaseDetailProblems({ masterVersionUrl: 'https://github.com/me/x/blob/main/x.version' }).join()).toMatch(/Raw/)
    expect(releaseDetailProblems({ masterVersionUrl: 'vgc.version' }).join()).toMatch(/web address/)
    expect(releaseDetailProblems({ threadId: 'abc' }).join()).toMatch(/topic=/)
    expect(releaseDetailProblems({ threadId: '12345', masterVersionUrl: 'https://raw.githubusercontent.com/a/b/c/x.version' })).toEqual([])
  })
})

describe('forum post draft', () => {
  it('follows FORUM_POST_RULES.md: title with the game version, requirements, AI use, no Markdown', () => {
    const t = forumPost({ info, version: '1.1.0', details: { status: 'Beta', catchLine: 'A small faction.', license: 'MIT' }, contents: ['1 faction', '2 quests'] })
    expect(t.split('\n')[0]).toBe('[size=18pt][b][0.98a] Vanguard Compact 1.1.0 [Beta][/b][/size]')
    const order = ['A small faction.', 'Requirements', 'Note from the author', 'AI use disclaimer', 'How it works', 'License']
    const at = order.map((s) => t.indexOf(s))
    expect(at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1]))).toBe(true)
    expect(t).toContain('[url=https://github.com/LastAi/Starsector-SagaLib]SagaLib[/url]')
    expect(t).toContain('Adds 1 faction and 2 quests.')
    expect(t).toContain('[WRITE: your own words]')
    expect(t).not.toMatch(/\*\*|^#/m)
  })
})

describe('the zip', () => {
  const mods = path.join(tmp, 'mods')
  const mod = path.join(mods, 'vgc')
  const rules: WriteRules = { modsRoot: mods, gameRoot: path.join(tmp, 'Starsector'), gameMods: false }
  const put = (rel: string, text: string) => { const f = path.join(mod, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }

  it('crc32 is the standard one', () => expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926))

  it('packs one folder named after the mod, without plans and dev files, and the forum post next to it', async () => {
    fs.rmSync(tmp, { recursive: true, force: true })
    put('mod_info.json', '{ "id": "vgc", "name": "Vanguard Compact", "version": "1.1.0", "gameVersion": "0.98a-RC8" }')
    put('data/campaign/rules.csv', 'id,trigger\n')
    put('data/config/sagaforge/content.csv', 'id,type,path,mod\nq,quest,data/sagaforge/quests/q.json,vgc\np,profiles,data/sagaforge/dev/test_profiles.json,vgc\n')
    put('data/sagaforge/quests/q.json', '{}')
    put('data/sagaforge/dev/test_profiles.json', '{}')
    put('sagaforge/project.json', '{}')
    put('.git/HEAD', 'x')
    const out = path.join(tmp, 'releases')
    const r = await packRelease({ modDir: mod, releasesDir: out, version: '1.1.0', forumPost: 'post\nline', overwrite: false, rules })
    if ('exists' in r) throw new Error('exists')
    expect(path.basename(r.zip)).toBe('[0.98a] Vanguard Compact 1.1.0.zip')
    expect(r.files).toBe(4)
    expect(r.leftOut.map((x) => x.path).sort()).toEqual(['.git/HEAD', 'data/sagaforge/dev/test_profiles.json', 'sagaforge/project.json'])
    expect(readZipEntry(r.zip, 'Vanguard Compact/mod_info.json')?.toString()).toContain('"1.1.0"')
    expect(readZipEntry(r.zip, 'Vanguard Compact/data/config/sagaforge/content.csv')?.toString()).not.toContain('dev/')
    expect(readZipEntry(r.zip, 'Vanguard Compact/sagaforge/project.json')).toBeNull()
    expect(fs.readFileSync(r.post, 'utf8')).toBe('post\r\nline')
    // a second pack asks first
    expect(await packRelease({ modDir: mod, releasesDir: out, version: '1.1.0', forumPost: '', overwrite: false, rules })).toEqual({ exists: r.zip })
  })

  it('refuses a version mod_info.json doesn\'t have, and a releases folder in a mod or the game', async () => {
    await expect(packRelease({ modDir: mod, releasesDir: path.join(tmp, 'releases'), version: '1.2.0', forumPost: '', overwrite: true, rules })).rejects.toThrow(/Export with version 1.2.0 first/)
    expect(releaseDirProblem(path.join(mod, 'releases'), rules)).toMatch(/inside a mod/)
    expect(releaseDirProblem(path.join(tmp, 'Starsector', 'mods'), rules)).toMatch(/Starsector/)
    expect(releaseDirProblem(path.join(tmp, 'releases'), rules)).toBeNull()
  })
})
