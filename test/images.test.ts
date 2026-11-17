/** Images page (R5, R1, R2): file names, crops, the size check. */
import { describe, expect, it } from 'vitest'
import { IMAGE_KINDS, imageKind, importPath, centredCrop, sameShape, illustrationKey } from '../src/shared/imagekinds'
import { imageSizeProblems, kindOfPath } from '../src/shared/checks/images'
import type { CheckContext } from '../src/shared/checks'

describe('image kinds', () => {
  it('match vanilla 0.98a\'s sizes and folders', () => {
    expect(Object.fromEntries(IMAGE_KINDS.map((k) => [k.id, `${k.folder} ${k.w}x${k.h}`]))).toEqual({
      flag: 'graphics/factions 410x256', crest: 'graphics/factions 256x256', portrait: 'graphics/portraits 128x128',
      cargoIcon: 'graphics/icons/cargo 80x80', missionIcon: 'graphics/icons/missions 64x64', illustration: 'graphics/illustrations 480x300',
      // Phase 3 (R21): vanilla's station sprites and planet textures
      entitySprite: 'graphics/stations 160x160', mapIcon: 'graphics/icons/map 64x64', planetTexture: 'graphics/planets 1024x512'
    })
  })

  it('names an import with the kind\'s folder, the prefix and .png', () => {
    const p = imageKind('portrait')
    expect(importPath(p, 'D:\\Mod Planing Room\\Unorganized\\Beta\\Mainecoon_Beta.jpg', 'sfw_')).toBe('graphics/portraits/sfw_mainecoon_beta.png')
    expect(importPath(p, '[Char]Tyger_Alpha.jpg', 'sfw_')).toBe('graphics/portraits/sfw_char_tyger_alpha.png')
    expect(importPath(p, 'sfw_already.png', 'sfw_')).toBe('graphics/portraits/sfw_already.png') // no double prefix
    expect(importPath(imageKind('flag'), 'heliopolis.png', 'sfw_')).toBe('graphics/factions/sfw_heliopolis_flag.png')
    expect(importPath(imageKind('crest'), 'heliopolis_crest.png', 'sfw_')).toBe('graphics/factions/sfw_heliopolis_crest.png')
    expect(illustrationKey('graphics/illustrations/sfw_probe_cryo.png')).toBe('sfw_probe_cryo')
  })

  it('starts the crop centred and as large as fits the kind\'s shape', () => {
    // the probe illustration: 1200×896 (4:3) into 480×300 (16:10)
    expect(centredCrop(1200, 896, imageKind('illustration'))).toEqual({ x: 0, y: 73, w: 1200, h: 750 })
    // a 1024² portrait is already square
    expect(centredCrop(1024, 1024, imageKind('portrait'))).toEqual({ x: 0, y: 0, w: 1024, h: 1024 })
    expect(sameShape(1024, 1024, imageKind('portrait'))).toBe(true)
    expect(sameShape(1200, 896, imageKind('illustration'))).toBe(false)
    // a wide image into a square: crop the sides
    expect(centredCrop(400, 200, imageKind('crest'))).toEqual({ x: 100, y: 0, w: 200, h: 200 })
  })
})

describe('image size check (R5)', () => {
  it('knows flags from crests in the shared folder, and warns about other sizes', () => {
    expect(kindOfPath('graphics/factions/sfw_cats_crest.png')?.id).toBe('crest')
    expect(kindOfPath('graphics/factions/sfw_cats_flag.png')?.id).toBe('flag')
    expect(kindOfPath('graphics/ships/x.png')).toBeNull()
    const ctx = { imageSizes: {
      'graphics/portraits/sfw_a.png': { w: 128, h: 128 },
      'graphics/portraits/sfw_b.png': { w: 1024, h: 1024 },
      'graphics/illustrations/sfw_c.png': { w: 1200, h: 896 }
    } } as unknown as CheckContext
    const p = imageSizeProblems(ctx)
    expect(p.map((x) => x.file)).toEqual(['graphics/portraits/sfw_b.png', 'graphics/illustrations/sfw_c.png'])
    expect(p[0].message).not.toContain('stretched')
    expect(p[1].message).toContain('stretched')
  })
})
