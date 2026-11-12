import { describe, expect, it } from 'vitest'
import { additionEditor, overrideEditor, newFactionDoc, repLevelName, colorToHex, hexToColor } from '../src/shared/factionform'
import { emptyPatch, patchToJson } from '../src/shared/faction'
import { factionText, type FactionOverrideEdit } from '../src/shared/serialize'
import { parseLooseObject } from '../src/shared/loosejson'
import { defsFor } from '../src/shared/defs'

const vanilla = { id: 'hegemony', displayName: 'Hegemony', color: [245, 150, 30, 255], knownShips: { hulls: ['onslaught', 'colossus'], tags: ['heg'] }, hullFrequency: { hulls: { onslaught: 1 } } }
const otherMod = { knownShips: { hulls: ['armaa_x'] } }

describe('override editor: only this mod\'s patch changes', () => {
  const f: FactionOverrideEdit = { kind: 'override', id: 'hegemony', file: 'data/world/factions/hegemony.faction', patch: emptyPatch() }
  const ed = () => overrideEditor(f, [{ sourceId: 'starsector-core', raw: vanilla }, { sourceId: 'armaa', raw: otherMod }])

  it('shows the effective faction, with each source\'s list entries', () => {
    expect(ed().value('knownShips.hulls')).toEqual(['onslaught', 'colossus', 'armaa_x'])
    expect(ed().listLayers('knownShips.hulls').map((l) => [l.sourceId, l.values.length])).toEqual([['starsector-core', 2], ['armaa', 1], ['mine', 0]])
  })

  it('adds list entries and sets scalars and weights in the patch', () => {
    ed().addToList('knownShips.hulls', 'vgc_bulwark')
    ed().set('displayName', 'The Hegemony')
    ed().setWeight('hullFrequency.hulls', 'vgc_bulwark', 0.25)
    expect(patchToJson(f.patch)).toEqual({ displayName: 'The Hegemony', knownShips: { hulls: ['vgc_bulwark'] }, hullFrequency: { hulls: { vgc_bulwark: 0.25 } } })
    expect(ed().value('hullFrequency.hulls')).toEqual({ onslaught: 1, vgc_bulwark: 0.25 })
    expect(ed().isSet('displayName')).toBe(true)
  })

  it('refuses to remove a base entry, removes its own, and reverts', () => {
    expect(ed().removeFromList('knownShips.hulls', 'colossus')).toBe(false)
    expect(ed().removeFromList('knownShips.hulls', 'vgc_bulwark')).toBe(true)
    ed().revert('displayName')
    expect(patchToJson(f.patch)).toEqual({ hullFrequency: { hulls: { vgc_bulwark: 0.25 } } })
  })

  it('writes the patch file: only the patch, readable back as the same patch', () => {
    const text = factionText(f, undefined)
    const back = parseLooseObject(text).value
    expect(back).toEqual({ hullFrequency: { hulls: { vgc_bulwark: 0.25 } } })
    expect(text).not.toContain('onslaught')
  })
})

describe('addition editor and template', () => {
  it('creates a full faction document with vanilla\'s keys', () => {
    const doc = newFactionDoc('vgc_vanguard', 'Vanguard Compact')
    expect(doc).toMatchObject({ id: 'vgc_vanguard', displayName: 'Vanguard Compact', displayNameWithArticle: 'the Vanguard Compact' })
    expect((doc.color as number[]).length).toBe(4)
    const f = { kind: 'addition' as const, id: 'vgc_vanguard', file: 'x', raw: doc, listed: true }
    additionEditor(f).addToList('knownShips.hulls', 'hammerhead')
    additionEditor(f).addToList('knownShips.hulls', 'hammerhead')
    expect(additionEditor(f).value('knownShips.hulls')).toEqual(['hammerhead'])
    additionEditor(f).setWeight('names', 'myth', 2)
    expect(additionEditor(f).value('names')).toEqual({ modern: 1, world: 1, myth: 2 })
    // vanilla's Commission reads custom.offersCommissions (missing = false): new factions offer them (found in testing, 2026-11-11)
    expect(additionEditor(f).value('custom.offersCommissions')).toBe(true)
    additionEditor(f).set('custom.offersCommissions', false)
    expect((doc.custom as Record<string, unknown>).engagesInHostilities).toBe(true)
    expect(additionEditor(f).value('custom.offersCommissions')).toBe(false)
  })

  it('names reputation levels and converts colors', () => {
    const levels = defsFor('0.98a').repLevels
    expect(repLevelName(-0.5, levels)).toMatch(/hostile/i)
    expect(repLevelName(0, levels)).toMatch(/neutral/i)
    expect(repLevelName(0.3, levels)).toMatch(/welcoming/i)
    expect(colorToHex([63, 167, 160, 255])).toBe('#3fa7a0')
    expect(hexToColor('#3fa7a0', 200)).toEqual([63, 167, 160, 200])
  })
})
