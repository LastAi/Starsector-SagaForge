/** Phase 3 (DESIGN-PHASE3.md): vanilla systems from Java source, types, "fits here", own types. */
import { describe, expect, it } from 'vitest'
import { codeSystemId, evalNumber, parseSystemsJava, stripComments } from '../src/shared/javasystems'
import { entityEntry, ownTypeInfos, planetEntry, planetFits, orbitIndex, procgenData, typeInfos, defaultEntityGroup } from '../src/shared/celestial'
import { addition, entityPos, fitContext, locationProblems, newEntity, newSystem } from '../src/shared/locations'
import { planExport } from '../src/shared/export'
import { emptyModel } from '../src/shared/serialize'
import { parseLooseObject } from '../src/shared/loosejson'
import { hashText } from '../src/main/install'
import type { GameIndex, NamedEntry } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'
import type { ModModel } from '../src/shared/serialize'
import type { CheckContext } from '../src/shared/checks'

const JAVA = `
package data.scripts.world.systems;
public class Askonia {
  public void generate(SectorAPI sector) {
    StarSystemAPI system = sector.createStarSystem("Askonia");
    PlanetAPI star = system.initStar("askonia", // id
        StarTypes.RED_GIANT, 1000f, 1500, 5f, 0.5f, 2f);
    PlanetAPI a1 = system.addPlanet("sindria", star, "Sindria", "rocky_metallic", 0, 150, 2900, 100);
    /* a jump point: its orbit is set twice, the last one wins */
    JumpPointAPI jumpPoint = Global.getFactory().createJumpPoint("askonia_jump_point_alpha", "Sindria Jump-point");
    OrbitAPI orbit = Global.getFactory().createCircularOrbit(a1, 0, 500, 30);
    jumpPoint.setOrbit(orbit);
    jumpPoint.setCircularOrbit( system.getEntityById("askonia"), 60, 3000, 100);
    system.addEntity(jumpPoint);
    SectorEntityToken nav = system.addCustomEntity(null, "Salus Navigation Buoy", "nav_buoy", Factions.DIKTAT);
    nav.setCircularOrbitPointingDown( a1, 110-60, 1400, 45);
    float beltRadius = 3600;
    system.addAsteroidBelt(star, 150, beltRadius, 170, 200, 250, Terrain.ASTEROID_BELT, "Stone River");
    system.addRingBand(star, "misc", "rings_dust0", 256f, 0, Color.white, 256f, 3570, 220f, null, null);
    float r2 = StarSystemGenerator.addOrbitingEntities(system, star, StarAge.OLD, 3, 5, 4000, 1, true);
    PlanetAPI lost = system.addPlanet("lost", star, "Lost", "barren", 0, 100, r2 + 500, 100);
  }
}`

describe('vanilla systems from Java source (R14)', () => {
  it('reads literal calls, variables, arithmetic and the last orbit; counts what it can\'t read', () => {
    const [s] = parseSystemsJava(JAVA, 'Askonia.java', 'starsector-core', (id) => id === 'askonia')
    expect(s).toMatchObject({ id: 'askonia', name: 'Askonia', star: { id: 'askonia', type: 'star_red_giant', radius: 1000, corona: 1500 } })
    const by = (id: string) => s.bodies.find((b) => b.id === id)
    expect(by('sindria')).toMatchObject({ kind: 'planet', type: 'rocky_metallic', focus: 'askonia', radius: 150, orbitRadius: 2900 })
    expect(by('askonia_jump_point_alpha')).toMatchObject({ focus: 'askonia', angle: 60, orbitRadius: 3000 })
    expect(s.bodies.find((b) => b.name === 'Salus Navigation Buoy')).toMatchObject({ id: '', focus: 'sindria', angle: 50, orbitRadius: 1400 })
    expect(s.bodies.find((b) => b.kind === 'asteroidBelt')).toMatchObject({ name: 'Stone River', orbitRadius: 3600, width: 170 })
    expect(s.bodies.find((b) => b.kind === 'ring')).toMatchObject({ orbitRadius: 3570, width: 256, type: 'rings_dust0' })
    // r2 comes from random generation: "lost" can't be placed, and is counted, not guessed
    expect(by('lost')).toBeUndefined()
    expect(s.skipped).toBe(1)
  })

  it('evaluates only simple arithmetic and matches starmap ids', () => {
    expect(evalNumber('230 + 60')).toBe(290)
    expect(evalNumber('500f')).toBe(500)
    expect(evalNumber('-(2 * 3) + 1')).toBe(-5)
    expect(evalNumber('Math.random()')).toBeNaN()
    expect(stripComments('a("//x") // c\nb /* d */ e')).toBe('a("//x") \nb  e')
    // TiaTaxet.java makes "Tia"; Eos.java makes "Eos Exodus"
    const known = (id: string) => ['tia', 'eos'].includes(id)
    expect(codeSystemId('TiaTaxet.java', 'Tia', known)).toBe('tia')
    expect(codeSystemId('Eos.java', 'Eos Exodus', known)).toBe('eos')
  })

  it('places additions that orbit the system\'s own bodies, and warns about unknown ones', () => {
    const [code] = parseSystemsJava(JAVA, 'Askonia.java', 'starsector-core', () => true)
    const sys = addition('askonia', 'Askonia')
    sys.entities.push({ ...newEntity('station', 'vgc_sindria_dock', 'Dock', 'sindria', 300, 0), orbit: { focus: 'sindria', radius: 300, angle: 0, days: 30 } })
    sys.entities.push(newEntity('station', 'vgc_nowhere', 'Nowhere', 'not_a_body', 300, 0))
    const p = entityPos(sys, 'vgc_sindria_dock', code)
    expect([p.x, Math.abs(p.y)]).toEqual([2900 + 300, 0])
    const m = emptyModel('vgc_')
    m.systems = [sys]
    const ctx = { model: m, index: { markets: [], systems: [{ id: 'askonia' }], planetTypes: [], customEntityTypes: [{ id: 'station_side02' }], conditions: [], industries: [], codeSystems: [code] }, loaded: { sourceId: 'vgc' } } as unknown as CheckContext
    const ps = locationProblems(ctx)
    expect(ps.filter((p) => p.message.includes('isn\'t one of Askonia\'s bodies')).map((p) => p.message)).toEqual([expect.stringContaining('"Nowhere" orbits "not_a_body"')])
    // "fits here" for a moon uses its planet's orbit
    const moon = { ...newEntity('moon', 'vgc_m', 'M', 'sindria', 400, 0) }
    expect(fitContext(sys, moon, code)).toEqual({ starType: 'star_red_giant', starRadius: 1000, orbitRadius: 2900 })
  })
})

describe('types and "fits here" (R15, R18–R20)', () => {
  const e = (id: string, by = 'starsector-core'): NamedEntry => ({ id, name: id, definedBy: by, changedBy: [] })
  it('keeps stars, resolves entity bases, and groups by kind', () => {
    const t = typeInfos(
      new Map([['star_yellow', e('star_yellow')], ['barren', e('barren')]]),
      new Map([['star_yellow', { name: 'Yellow Star', isStar: true, texture: 'graphics/planets/star.jpg', iconColor: [255, 255, 0, 255] }], ['barren', { name: 'Barren', texture: 'b.jpg' }]]),
      new Map([['comm_relay', e('comm_relay')], ['comm_relay_makeshift', e('comm_relay_makeshift')]]),
      new Map([['comm_relay', { defaultName: 'Comm Relay', sprite: 'r.png', tags: ['comm_relay', 'objective'] }], ['comm_relay_makeshift', { baseId: 'comm_relay', defaultName: 'Makeshift Comm Relay', tags: ['objective', 'makeshift'] }]])
    )
    expect(t.planets.find((p) => p.id === 'star_yellow')).toMatchObject({ isStar: true, iconColor: [255, 255, 0, 255] })
    // inherits the sprite, keeps its own tags (not appended to the base's)
    expect(t.entities.find((x) => x.id === 'comm_relay_makeshift')).toMatchObject({ name: 'Makeshift Comm Relay', sprite: 'r.png', tags: ['objective', 'makeshift'] })
    expect(defaultEntityGroup('station')).toBe('station')
    expect(defaultEntityGroup('derelict')).toBe('salvage')
  })

  it('recommends planet types by orbit and star, as vanilla\'s generator weighs them', () => {
    const pg = procgenData({ star_yellow: { habZoneStart: 3 }, star_neutron: { habZoneStart: -3 } }, [
      { id: '', type: 'CATEGORY', category: 'cat_hab3', frequency: '30', star_neutron: '0' },
      { id: '', type: 'CATEGORY', category: 'cat_barren', frequency: '100' },
      { id: 'terran', type: 'PLANET', category: 'cat_hab3', frequency: '10', habOffsetMin: '0', habOffsetMax: '0' },
      { id: 'barren', type: 'PLANET', category: 'cat_barren', frequency: '10', habOffsetMin: '-100', habOffsetMax: '100' }
    ])
    expect(orbitIndex(5800, 600)).toBe(3)
    expect(planetFits(pg, 'star_yellow', 3).filter((f) => f.fits).map((f) => f.id).sort()).toEqual(['barren', 'terran'])
    expect(planetFits(pg, 'star_yellow', 0).find((f) => f.id === 'terran')).toMatchObject({ weight: 0, fits: false })
    // a neutron star's multiplier of 0 rules the habitable category out
    expect(planetFits(pg, 'star_neutron', -3).find((f) => f.id === 'terran')!.weight).toBe(0)
  })
})

describe('the mod\'s own types (R21)', () => {
  const index = {
    factions: [], items: [], people: [], markets: [],
    planetTypes: [{ id: 'barren', name: 'Barren', isStar: false, texture: 'b.jpg', iconColor: [1, 2, 3, 255], raw: { name: 'Barren', descriptionId: 'barren', tilt: -27, texture: 'b.jpg', isStar: false }, definedBy: 'starsector-core', changedBy: [] }],
    customEntityTypes: [{ id: 'station_side02', name: 'Side Station', sprite: 's.png', sheet: '', icon: 'i.png', tags: ['station'], radius: 50, raw: {}, definedBy: 'starsector-core', changedBy: [] }]
  } as unknown as GameIndex
  function state(m: ModModel, files: Record<string, string>): ProjectState {
    return {
      sourceId: 'sfw', modDir: '/x', isNew: false, modInfo: { id: 'sfw', name: 'W', version: '1', gameVersion: '0.98a', dependencies: [] },
      project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime,
      descriptions: {}, factions: [], releases: [], files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
    }
  }

  it('copies the base planet\'s settings and inherits an entity\'s through baseId', () => {
    const p = { id: 'sfw_catnip', name: 'Catnip World', texture: 'graphics/planets/sfw_catnip.png', basedOn: 'barren', isStar: false }
    expect(planetEntry(p, index.planetTypes[0])).toEqual({ name: 'Catnip World', tilt: -27, texture: 'graphics/planets/sfw_catnip.png', isStar: false })
    expect(entityEntry({ id: 'sfw_tree', name: 'Cat Tree', sprite: 'graphics/stations/sfw_tree.png', size: 80, radius: 50, behavesLike: 'station_side02' }))
      .toEqual({ baseId: 'station_side02', defaultName: 'Cat Tree', defaultRadius: 50, sprite: 'graphics/stations/sfw_tree.png', spriteWidth: 80, spriteHeight: 80 })
    const own = ownTypeInfos({ entities: [{ id: 'sfw_tree', name: 'Cat Tree', sprite: 'x.png', size: 80, radius: 50, behavesLike: 'station_side02' }], planets: [p] }, index.planetTypes, index.customEntityTypes)
    expect(own.entities[0]).toMatchObject({ definedBy: 'mine', tags: ['station'] })
    expect(own.planets[0].iconColor).toEqual([1, 2, 3, 255])
  })

  it('exports them merged by key, keeping the mod\'s hand-written entries', () => {
    const m = emptyModel('sfw_')
    m.types = { entities: [{ id: 'sfw_tree', name: 'Cat Tree', sprite: 'graphics/stations/sfw_tree.png', size: 80, radius: 50, behavesLike: 'station_side02' }], planets: [] }
    const hand = '{\n\t"sfw_hand":{"defaultName":"Hand"},\n}\n'
    let files: Record<string, string> = { 'data/config/custom_entities.json': hand }
    const apply = (w: { path: string; text: string; remove?: boolean }[]) => { for (const x of w) { if (x.remove) delete files[x.path]; else files[x.path] = x.text } }
    apply(planExport(m, state(m, files), index, null).writes)
    expect(Object.keys(parseLooseObject(files['data/config/custom_entities.json']).value)).toEqual(['sfw_hand', 'sfw_tree'])
    m.project = parseLooseObject(files['sagaforge/project.json']).value as never
    m.types = { entities: [], planets: [] }
    apply(planExport(m, state(m, files), index, null).writes)
    expect(Object.keys(parseLooseObject(files['data/config/custom_entities.json']).value)).toEqual(['sfw_hand'])
  })

  it('checks the new system\'s star against the stars of the game and the mod', () => {
    const m = emptyModel('sfw_')
    const s = newSystem('sfw_a', 'A', 0, 0)
    s.star!.type = 'sfw_amber'
    m.systems = [s]
    const ctx = (mm: ModModel) => ({ model: mm, index: { ...index, planetTypes: [...index.planetTypes, { id: 'star_yellow', isStar: true, definedBy: 'starsector-core' }], systems: [], conditions: [], industries: [] }, loaded: { sourceId: 'sfw' } }) as unknown as CheckContext
    expect(locationProblems(ctx(m)).some((p) => p.message.includes('isn\'t a star type'))).toBe(true)
    m.types = { entities: [], planets: [{ id: 'sfw_amber', name: 'Amber', texture: 't.png', basedOn: 'star_yellow', isStar: true }] }
    expect(locationProblems(ctx(m)).some((p) => p.message.includes('isn\'t a star type'))).toBe(false)
  })
})
