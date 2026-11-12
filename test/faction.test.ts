import { describe, expect, it } from 'vitest'
import { effectiveFaction, jsonToPatch, mergeFactionJson, patchToJson, emptyPatch } from '../src/shared/faction'
import { defsFor } from '../src/shared/defs'

describe('the game\'s JSON merge (docs/FORMATS.md)', () => {
  it('merges objects by key and appends arrays', () => {
    const base = { knownShips: { hulls: ['onslaught'], tags: ['heg'] }, displayName: 'Hegemony' }
    const patch = { knownShips: { hulls: ['mm_ship'] }, displayName: 'Heg' }
    expect(mergeFactionJson(base, patch)).toEqual({ knownShips: { hulls: ['onslaught', 'mm_ship'], tags: ['heg'] }, displayName: 'Heg' })
  })

  it('replaces 4-element color/button arrays and music_ arrays', () => {
    expect(mergeFactionJson({ color: [1, 2, 3, 4] }, { color: [5, 6, 7, 8] })).toEqual({ color: [5, 6, 7, 8] })
    expect(mergeFactionJson({ baseUIColor: [1, 2, 3, 4] }, { baseUIColor: [5, 6, 7, 8] })).toEqual({ baseUIColor: [5, 6, 7, 8] })
    expect(mergeFactionJson({ music_x: ['a'] }, { music_x: ['b'] })).toEqual({ music_x: ['b'] })
    // a 3-number color is appended: exactly the hazard the checks warn about
    expect(mergeFactionJson({ color: [1, 2, 3, 4] }, { color: [5, 6, 7] })).toEqual({ color: [1, 2, 3, 4, 5, 6, 7] })
  })

  it('empties an array that starts with core_clearArray', () => {
    expect(mergeFactionJson({ a: [1, 2] }, { a: ['core_clearArray', 3] })).toEqual({ a: [3] })
    expect(mergeFactionJson({}, { a: ['core_clearArray', 3] })).toEqual({ a: [3] })
  })
})

describe('faction patches', () => {
  it('splits a patch file into set and add, and writes it back', () => {
    const json = { color: [200, 40, 40, 255], knownShips: { hulls: ['a', 'b'] }, custom: { foo: 1 } }
    const p = jsonToPatch(json)
    expect(p.set).toEqual({ color: [200, 40, 40, 255], custom: { foo: 1 } })
    expect(p.add).toEqual({ 'knownShips.hulls': ['a', 'b'] })
    expect(patchToJson(p)).toEqual(json)
  })

  it('computes the effective faction over layers plus the patch', () => {
    const p = emptyPatch()
    p.add['knownShips.hulls'] = ['mine']
    p.set.displayName = 'X'
    const eff = effectiveFaction([{ knownShips: { hulls: ['v'] }, displayName: 'V' }, { knownShips: { hulls: ['other_mod'] } }], p)
    expect(eff).toEqual({ knownShips: { hulls: ['v', 'other_mod', 'mine'] }, displayName: 'X' })
  })
})

describe('game definitions 0.98a', () => {
  const d = defsFor('0.98a-RC8')
  it('loads and has the core sections', () => {
    expect(d.gameVersion).toMatch(/^0\.98a/)
    for (const name of ['AddCredits', 'AdjustRep', 'ShowPersonVisual', 'SetStoryOption', 'FireBest', 'AddRemoveCommodity', 'ShowImageVisual', 'SF_Step', 'SF_End']) {
      expect(d.ruleCommands.find((c) => c.name === name), name).toBeTruthy()
    }
    for (const c of d.ruleCommands) {
      expect(Array.isArray(c.forms) && c.forms.every(Array.isArray), c.name).toBe(true)
    }
    expect(d.tokens.some((t) => t.token === '$playerName')).toBe(true)
    expect(d.triggers.some((t) => t.name === 'DialogOptionSelected')).toBe(true)
    expect(d.repLevels.length).toBeGreaterThan(5)
    expect(d.codePeople.some((p) => p.id === 'baird')).toBe(true)
  })
})
