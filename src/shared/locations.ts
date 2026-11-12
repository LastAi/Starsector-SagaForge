/** Locations (PLAN.md §4.5): new star systems and additions to existing ones. Pure helpers. */
import { PLAN_FORMAT, type MarketDef, type StarSystemDef, type SystemEntity } from './model'
import type { Problem, SystemInfo } from './api'
import type { CheckContext } from './checks'
import { prefixProblem, ID_PATTERN } from './checks'

export const ENTITY_KINDS: { kind: string; label: string; type: string; radius?: number }[] = [
  { kind: 'planet', label: 'Planet', type: 'barren', radius: 120 },
  { kind: 'moon', label: 'Moon', type: 'barren', radius: 60 },
  { kind: 'station', label: 'Station', type: 'station_side02' },
  { kind: 'jumpPoint', label: 'Jump point', type: 'jump_point' },
  { kind: 'asteroidBelt', label: 'Asteroid belt', type: 'asteroid_belt' },
  { kind: 'ring', label: 'Ring band', type: 'misc' },
  { kind: 'commRelay', label: 'Comm relay', type: 'comm_relay' },
  { kind: 'navBuoy', label: 'Nav buoy', type: 'nav_buoy' },
  { kind: 'sensorArray', label: 'Sensor array', type: 'sensor_array' },
  { kind: 'derelict', label: 'Derelict / wreck', type: 'wreck' },
  { kind: 'custom', label: 'Other custom entity', type: '' }
]

export function newSystem(id: string, name: string, x: number, y: number): StarSystemDef {
  return { format: PLAN_FORMAT, id, name, kind: 'new', hyperspace: [x, y], star: { type: 'star_yellow', radius: 600, corona: 300 }, entities: [], addToExistingSaves: false, tags: [] }
}

export function addition(systemId: string, name: string): StarSystemDef {
  return { format: PLAN_FORMAT, id: systemId, name, kind: 'existing', entities: [], addToExistingSaves: true }
}

export function newEntity(kind: string, id: string, name: string, focus: string, radius: number, angle: number): SystemEntity {
  const def = ENTITY_KINDS.find((k) => k.kind === kind) ?? ENTITY_KINDS[0]
  const e: SystemEntity = { id, kind, type: def.type, name, orbit: { focus, radius, angle, days: Math.round(Math.max(30, radius / 15)) } }
  if (def.radius) e.radius = def.radius
  if (kind === 'asteroidBelt' || kind === 'ring') { e.width = 300; e.count = kind === 'asteroidBelt' ? 100 : 1 }
  return e
}

export function newMarket(id: string, name: string, faction: string): MarketDef {
  return { id, name, faction, size: 4, conditions: ['population_4'], industries: ['population', 'spaceport'], submarkets: ['open_market', 'black_market', 'storage'], freePort: false, people: [] }
}

/** Position of an entity in the system (orbit focus chain), for drawing. Angles in degrees. */
export function entityPos(sys: StarSystemDef, id: string, depth = 0): { x: number; y: number } {
  if (id === 'star' || !id || depth > 10) return { x: 0, y: 0 }
  const e = sys.entities.find((x) => x.id === id)
  if (!e) return { x: 0, y: 0 }
  const f = entityPos(sys, e.orbit.focus, depth + 1)
  const a = (e.orbit.angle * Math.PI) / 180
  return { x: f.x + Math.cos(a) * e.orbit.radius, y: f.y - Math.sin(a) * e.orbit.radius }
}

/** Nearest vanilla/mod system to a hyperspace point, with distance in light-years (2000 units = 1 ly... the game uses 2000). */
export function nearest(systems: SystemInfo[], x: number, y: number): { sys: SystemInfo; ly: number } | null {
  let best: { sys: SystemInfo; d: number } | null = null
  for (const s of systems) {
    if (s.x == null || s.y == null) continue
    const d = Math.hypot(s.x - x, s.y - y)
    if (!best || d < best.d) best = { sys: s, d }
  }
  return best ? { sys: best.sys, ly: best.d / 2000 } : null
}

export function locationProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const ids = new Set<string>()
  const vanillaMarkets = new Set(ctx.index.markets.map((x) => x.id))
  for (const s of m.systems) {
    const ref = (sub?: string) => ({ page: 'locations' as const, id: s.id, sub })
    if (s.kind === 'new') {
      if (!ID_PATTERN.test(s.id)) out.push({ level: 'error', area: 'Location', message: `System id "${s.id}" may only use lowercase letters, digits and _.`, ref: ref() })
      const pp = prefixProblem(m.project.prefix, s.id, 'System', ref())
      if (pp) out.push(pp)
      if (ctx.index.systems.some((x) => x.id === s.id && x.definedBy !== ctx.loaded.sourceId)) out.push({ level: 'error', area: 'Location', message: `System id "${s.id}" is also used by ${ctx.index.systems.find((x) => x.id === s.id)!.definedBy}.`, ref: ref() })
      if (!s.hyperspace) out.push({ level: 'error', area: 'Location', message: `"${s.name}" has no place on the hyperspace map.`, ref: ref() })
      if (!s.addToExistingSaves) out.push({ level: 'info', area: 'Location', message: `"${s.name}" only appears in new games (Existing saves is off).`, ref: ref(), key: `newgameonly:${s.id}` })
    } else if (!ctx.index.systems.some((x) => x.id === s.id)) {
      out.push({ level: 'warning', area: 'Location', message: `Additions to "${s.id}": no such system in starmap.json (it may be made in code; SagaLib checks at load).`, ref: ref() })
    }
    for (const e of s.entities) {
      if (ids.has(e.id)) out.push({ level: 'error', area: 'Location', message: `Two entities use the id "${e.id}".`, ref: ref(e.id) })
      ids.add(e.id)
      const pp = prefixProblem(m.project.prefix, e.id, 'Entity', ref(e.id))
      if (pp) out.push(pp)
      if (e.orbit.focus !== 'star' && !s.entities.some((x) => x.id === e.orbit.focus) && s.kind === 'new') out.push({ level: 'error', area: 'Location', message: `"${e.name}" orbits "${e.orbit.focus}", which isn't in the system.`, ref: ref(e.id) })
      if ((e.kind === 'planet' || e.kind === 'moon') && e.type && !ctx.index.planetTypes.some((t) => t.id === e.type)) out.push({ level: 'error', area: 'Location', message: `"${e.name}": unknown planet type "${e.type}".`, ref: ref(e.id) })
      if (['station', 'commRelay', 'navBuoy', 'sensorArray', 'derelict', 'custom'].includes(e.kind) && e.type && !ctx.index.customEntityTypes.some((t) => t.id === e.type)) out.push({ level: 'error', area: 'Location', message: `"${e.name}": unknown custom entity type "${e.type}".`, ref: ref(e.id) })
      const mk = e.market
      if (mk) {
        if (vanillaMarkets.has(mk.id)) out.push({ level: 'error', area: 'Location', message: `Market id "${mk.id}" is also used by the game or another mod.`, ref: ref(e.id) })
        for (const c of mk.conditions) if (!ctx.index.conditions.some((x) => x.id === c)) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: unknown condition "${c}".`, ref: ref(e.id) })
        for (const i of mk.industries) if (!ctx.index.industries.some((x) => x.id === i)) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: unknown industry "${i}".`, ref: ref(e.id) })
        for (const p of mk.people) if (!m.people.some((x) => x.id === p)) out.push({ level: 'error', area: 'Location', message: `${mk.name}: no person "${p}" in this mod.`, ref: ref(e.id) })
        if (!mk.conditions.some((c) => /^population_\d+$/.test(c))) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: add a population_<size> condition, as vanilla markets have.`, ref: ref(e.id) })
      }
    }
  }
  for (const p of m.people) {
    if (p.placement.at === 'market' && p.placement.market) {
      const own = m.systems.some((s) => s.entities.some((e) => e.market?.id === (p.placement as { market: string }).market))
      if (!own && !vanillaMarkets.has(p.placement.market)) out.push({ level: 'error', area: 'Person', message: `${p.name.first} ${p.name.last}: no market "${p.placement.market}".`, ref: { page: 'people', id: p.id } })
    }
    const pp = prefixProblem(m.project.prefix, p.id, 'Person', { page: 'people', id: p.id })
    if (pp) out.push(pp)
    if (!p.portrait) out.push({ level: 'warning', area: 'Person', message: `${p.name.first} ${p.name.last} has no portrait.`, ref: { page: 'people', id: p.id } })
  }
  return out
}
