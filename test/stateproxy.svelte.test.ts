/**
 * #67 (found by the user, 2026-11-21): edits run on Svelte state in the app. A list created on the
 * state with `(x ??= []).push(...)` was lost (the push went into the plain array, not the state's
 * copy), so an item's first version vanished. These run the edits on real $state (a tiny module
 * compiled with Svelte's compiler, as the app's are).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileModule } from 'svelte/compiler'
import { beforeAll, describe, expect, it } from 'vitest'
import { editInVersion, resolveItem } from '../src/shared/itemversions'
import { addToGroup, groupsOf } from '../src/shared/imagegroups'

let state: <T>(v: T) => T
let snapshot: <T>(v: T) => T
beforeAll(async () => {
  const js = compileModule('export const state = (v) => { const s = $state(v); return s }\nexport const snapshot = (v) => $state.snapshot(v)\n', { generate: 'client', filename: 'stateproxy.svelte.js' }).js.code
  const dir = path.resolve('.userdata', 'test-tmp')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'stateproxy.mjs')
  fs.writeFileSync(file, js)
  ;({ state, snapshot } = await import(pathToFileURL(file).href))
})

describe('edits on Svelte state', () => {
  it("an item's first version is kept", () => {
    const p = state<any>({ id: 'vgc_tyger', name: { first: '', last: 'Tyger' }, gender: 'FEMALE' })
    editInVersion(p, ['aotd_vok'], (x: any) => { x.name = { first: '', last: 'Tiger' } })
    editInVersion(p, ['aotd_vok'], (x: any) => { x.gender = 'MALE' })
    expect(snapshot(p).versions).toEqual([{ mods: ['aotd_vok'], set: { 'name.last': 'Tiger', gender: 'MALE' } }])
    expect(resolveItem(p, []).value.gender).toBe('FEMALE')
  })
  it("a kind's first image group is kept", () => {
    const proj = state<any>({})
    addToGroup(proj, 'portrait', 'Cats', ['graphics/portraits/a.png'])
    expect(groupsOf(proj, 'portrait').map((g) => g.images)).toEqual([['graphics/portraits/a.png']])
  })
  it('the old pattern loses the first element (why the fix is needed)', () => {
    const o = state<any>({})
    ;(o.list ??= []).push(1)
    expect(snapshot(o).list).toEqual([])
  })
})

describe('renaming a setting on Svelte state', () => {
  it('reaches version tokens and keys', async () => {
    const { renameSetting } = await import('../src/shared/settings')
    const m = state<any>({ project: { settings: [{ id: 'a_x' }] }, people: [{ id: 'p', versions: [{ mods: ['setting:a_x=on'], set: { gender: 'MALE' } }] }], testProfiles: [{ flags: { '$global.a_x': 'true' } }] })
    renameSetting(m, 'a_x', 'a_y')
    expect(snapshot(m).people[0].versions[0].mods).toEqual(['setting:a_y=on'])
    expect(snapshot(m).testProfiles[0].flags).toEqual({ '$global.a_y': 'true' })
  })
})
