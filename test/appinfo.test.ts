/**
 * Saga Forge's and SagaLib's versions (user, 2026-11-19): the constants follow package.json and
 * SagaLib's mod_info.json; Problems warns about an older or newer SagaLib in the mods folder and a mod
 * made with a newer Saga Forge; saving stamps the version and never lowers a newer one.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAGA_FORGE_VERSION, SAGALIB_MADE_FOR } from '../src/shared/appinfo'
import { appVersionProblems, savedByNewer } from '../src/shared/checks/appversions'
import { emptyModel, planTexts } from '../src/shared/serialize'
import { PLAN_FORMAT } from '../src/shared/model'
import { newQuest } from '../src/shared/quest'
import type { CheckContext } from '../src/shared/checks'

const root = path.resolve(__dirname, '..')
const libInfo = path.resolve(root, '..', '..', 'mods', 'SagaLib', 'mod_info.json')

const ctx = (opts: { lib?: string | null; dep?: string; quest?: boolean; savedWith?: string; format?: number }): CheckContext => {
  const m = emptyModel('x_')
  if (opts.quest) m.quests.push(newQuest('x_q', 'Q'))
  if (opts.savedWith) m.project.savedWith = opts.savedWith
  if (opts.format) m.project.format = opts.format
  const sources = opts.lib === null ? [] : [{ id: 'lastai_sagalib', name: 'SagaLib', version: opts.lib ?? SAGALIB_MADE_FOR }]
  return { model: m, index: { sources } as never, loaded: { modInfo: { dependencies: opts.dep ? [{ id: 'lastai_sagalib', version: opts.dep }] : [] } } as never } as unknown as CheckContext
}
const keys = (c: CheckContext) => appVersionProblems(c).map((p) => `${p.level}:${p.key}`)

describe('versions', () => {
  it('the constants follow package.json and SagaLib\'s mod_info.json', () => {
    expect(SAGA_FORGE_VERSION).toBe(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version)
    if (fs.existsSync(libInfo)) {
      const v = JSON.parse(fs.readFileSync(libInfo, 'utf8')).version
      expect(SAGALIB_MADE_FOR).toBe(typeof v === 'string' ? v : `${v.major}.${v.minor}.${v.patch}`)
    }
  })
  it('the SagaLib it is made for: nothing to say', () => {
    expect(keys(ctx({ quest: true }))).toEqual([])
  })
  it('an older SagaLib: always a warning, saying when the mod itself needs more', () => {
    expect(keys(ctx({ lib: '1.2.0' }))).toEqual(['warning:libold:1.2.0'])
    const p = appVersionProblems(ctx({ lib: '1.2.0', dep: '1.3.0', quest: true }))
    expect(p[0].message).toContain("the launcher won't enable it with 1.2.0")
  })
  it('a newer SagaLib, or a mod that asks for one: update Saga Forge', () => {
    expect(keys(ctx({ lib: '9.0.0' }))).toEqual(['warning:libnew:9.0.0'])
    expect(keys(ctx({ dep: '9.0.0' }))).toEqual(['warning:sfnewerlib'])
  })
  it('no SagaLib installed: a warning only when the mod needs it', () => {
    expect(keys(ctx({ lib: null }))).toEqual([])
    expect(keys(ctx({ lib: null, quest: true }))).toEqual(['warning:libmissing'])
  })
  it('a mod saved by a newer Saga Forge or in a newer plan format: an error', () => {
    expect(keys(ctx({ savedWith: '99.0.0' }))).toEqual(['error:sfnewer'])
    expect(keys(ctx({ format: PLAN_FORMAT + 1 }))).toEqual(['error:sfnewer'])
    expect(savedByNewer(emptyModel('x_'))).toBeNull()
  })
  it('saving stamps this version, and never lowers a newer one or its format', () => {
    const m = emptyModel('x_')
    expect(JSON.parse(planTexts(m)['sagaforge/project.json']).savedWith).toBe(SAGA_FORGE_VERSION)
    m.project.savedWith = '0.9.0'
    expect(JSON.parse(planTexts(m)['sagaforge/project.json']).savedWith).toBe(SAGA_FORGE_VERSION)
    m.project.savedWith = '99.0.0'
    m.project.format = PLAN_FORMAT + 1
    const j = JSON.parse(planTexts(m)['sagaforge/project.json'])
    expect([j.savedWith, j.format]).toEqual(['99.0.0', PLAN_FORMAT + 1])
  })
})
