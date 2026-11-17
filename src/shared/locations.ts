/** Locations (PLAN.md §4.5): new star systems and additions to existing ones. Pure helpers. */
import { PLAN_FORMAT, type MarketDef, type StarSystemDef, type SystemEntity } from './model'
import type { CodeBody, CodeSystem, Problem, SystemInfo } from './api'
import type { CheckContext } from './checks'
import { prefixProblem, ID_PATTERN } from './checks'
import { isTodoActive } from './todo'

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

/**
 * Shortcuts in the "add entity" menu for a custom entity of a given type (kind 'custom', so SagaLib
 * needs nothing new). Shown only when the installed game has the type.
 */
export const ENTITY_PRESETS: { key: string; label: string; kind: string; type: string }[] = [
  // 0.98.5a: hidden base with its own dialog, neutrino signature and discovery XP (GAME-0.98.5a-ASSESSMENT I8)
  { key: 'asteroidBase', label: 'Asteroid base', kind: 'custom', type: 'asteroid_base' }
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

/**
 * Place one of the mod's people at a market (or nowhere, with null), keeping the two places that
 * say so in step: the person's placement and the markets' people lists (SagaLib reads both and
 * only logs a warning when they disagree). Markets of other mods or vanilla only go in the placement.
 */
export function setPersonMarket(m: { people: { id: string; placement: import('./model').Placement }[]; systems: StarSystemDef[] }, personId: string, marketId: string | null): void {
  const p = m.people.find((x) => x.id === personId)
  if (!p) return
  for (const s of m.systems) for (const e of s.entities) {
    if (!e.market) continue
    const listed = e.market.people.includes(personId)
    if (e.market.id === marketId && !listed) e.market.people.push(personId)
    if (e.market.id !== marketId && listed) e.market.people = e.market.people.filter((x) => x !== personId)
  }
  if (marketId) p.placement = { at: 'market', market: marketId, inCommDirectory: p.placement.at === 'market' ? p.placement.inCommDirectory : true }
  else if (p.placement.at === 'market') p.placement = { at: 'none' }
}

/** Replace a whole-word id in every string of a plan object (rule conditions, markers, places). */
function replaceIdDeep(v: unknown, from: string, to: string): unknown {
  const re = new RegExp(`(^|[^A-Za-z0-9_])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g')
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return x.replace(re, (_m, pre: string) => pre + to)
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = walk(x[i]); return x }
    if (x && typeof x === 'object') { const o = x as Record<string, unknown>; for (const k of Object.keys(o)) o[k] = walk(o[k]); return o }
    return x
  }
  return walk(v)
}

/**
 * Walk F27: change an entity's id and everything in the mod that points at it: other entities'
 * orbits, replacements and removals, its description, a market with the same id, and every quest,
 * encounter and test profile string that names it (stage markers, Arrive places, pictures, Action
 * steps, rule conditions such as a wreck lock's "$id == …", spawn places, start places).
 */
export function renameEntity(m: { systems: StarSystemDef[]; quests: unknown[]; encounters: unknown[]; testProfiles: unknown[]; descriptions: Record<string, unknown>; people: { placement: import('./model').Placement }[] }, from: string, to: string): void {
  for (const s of m.systems) {
    for (const e of s.entities) {
      if (e.id === from) {
        e.id = to
        if (e.market?.id === from) {
          e.market.id = to
          for (const p of m.people) if (p.placement.at === 'market' && p.placement.market === from) p.placement.market = to
        }
      }
      if (e.orbit.focus === from) e.orbit.focus = to
      if (e.replaces === from) e.replaces = to
    }
    for (const r of s.removals ?? []) if (r.target === from) r.target = to
  }
  const key = `CUSTOM:${from}`
  if (key in m.descriptions) { m.descriptions[`CUSTOM:${to}`] = m.descriptions[key]; delete m.descriptions[key] }
  for (const list of [m.quests, m.encounters, m.testProfiles]) for (let i = 0; i < list.length; i++) list[i] = replaceIdDeep(list[i], from, to)
}

/**
 * Position of an entity in the system (orbit focus chain), for drawing. Angles in degrees. `code`
 * is the system as read from Java source (R14): additions may orbit its bodies.
 */
export function entityPos(sys: StarSystemDef, id: string, code?: CodeSystem | null, depth = 0): { x: number; y: number } {
  if (id === 'star' || !id || depth > 12) return { x: 0, y: 0 }
  const e = sys.entities.find((x) => x.id === id)
  if (e) {
    const f = entityPos(sys, e.orbit.focus, code, depth + 1)
    const a = (e.orbit.angle * Math.PI) / 180
    return { x: f.x + Math.cos(a) * e.orbit.radius, y: f.y - Math.sin(a) * e.orbit.radius }
  }
  return code ? codePos(code, id, depth) : { x: 0, y: 0 }
}

/** Position of a body of a system read from Java source (its star at 0,0). */
export function codePos(code: CodeSystem, id: string, depth = 0): { x: number; y: number } {
  if (!id || id === code.star?.id || depth > 12) return { x: 0, y: 0 }
  const b = code.bodies.find((x) => x.id === id)
  if (!b) return { x: 0, y: 0 }
  return bodyPos(code, b, depth)
}
export function bodyPos(code: CodeSystem, b: CodeBody, depth = 0): { x: number; y: number } {
  const f = codePos(code, b.focus, depth + 1)
  const a = (b.angle * Math.PI) / 180
  return { x: f.x + Math.cos(a) * b.orbitRadius, y: f.y - Math.sin(a) * b.orbitRadius }
}

/** The star type and the orbit (radius from the star) that decide "fits here" for an entity (R18). */
export function fitContext(sys: StarSystemDef, e: SystemEntity, code?: CodeSystem | null): { starType: string; starRadius: number; orbitRadius: number } | null {
  const star = sys.kind === 'new' ? sys.star : code?.star
  if (!star) return null
  // walk up to the body that orbits the star: a moon uses its planet's orbit
  let cur: { focus: string; radius: number } = { focus: e.orbit.focus, radius: e.orbit.radius }
  for (let i = 0; i < 12; i++) {
    if (cur.focus === 'star' || cur.focus === code?.star?.id) break
    const p = sys.entities.find((x) => x.id === cur.focus)
    const b = p ? null : code?.bodies.find((x) => x.id === cur.focus)
    if (p) cur = { focus: p.orbit.focus, radius: p.orbit.radius }
    else if (b) cur = { focus: b.focus, radius: b.orbitRadius }
    else break
  }
  return { starType: star.type, starRadius: star.radius, orbitRadius: cur.radius }
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
      if (s.star && ctx.index.planetTypes.some((t) => t.isStar) && !ctx.index.planetTypes.some((t) => t.id === s.star!.type && t.isStar) && !m.types?.planets.some((t) => t.id === s.star!.type && t.isStar)) out.push({ level: 'error', area: 'Location', message: `"${s.name}": "${s.star.type}" isn't a star type of the game, a mod or this mod.`, ref: ref() })
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
      // an addition orbiting a body of the existing system (R14): known when its source could be read
      if (s.kind === 'existing' && e.orbit.focus !== 'star' && !s.entities.some((x) => x.id === e.orbit.focus)) {
        const code = ctx.index.codeSystems?.find((c) => c.id === s.id)
        if (code?.bodies.length && !code.bodies.some((b) => b.id === e.orbit.focus) && code.star?.id !== e.orbit.focus) out.push({ level: 'warning', area: 'Location', message: `"${e.name}" orbits "${e.orbit.focus}", which isn't one of ${s.name}'s bodies read from its source (it may be made elsewhere in code; SagaLib skips the entity if it can't find it).`, ref: ref(e.id), key: `focus:${e.id}` })
      }
      if ((e.kind === 'planet' || e.kind === 'moon') && e.type && !ctx.index.planetTypes.some((t) => t.id === e.type) && !m.types?.planets.some((t) => t.id === e.type)) out.push({ level: 'error', area: 'Location', message: `"${e.name}": unknown planet type "${e.type}".`, ref: ref(e.id) })
      if (['station', 'commRelay', 'navBuoy', 'sensorArray', 'derelict', 'custom'].includes(e.kind) && e.type && !ctx.index.customEntityTypes.some((t) => t.id === e.type) && !m.types?.entities.some((t) => t.id === e.type)) out.push({ level: 'error', area: 'Location', message: `"${e.name}": unknown custom entity type "${e.type}".`, ref: ref(e.id) })
      const mk = e.market
      if (mk) {
        if (vanillaMarkets.has(mk.id)) out.push({ level: 'error', area: 'Location', message: `Market id "${mk.id}" is also used by the game or another mod.`, ref: ref(e.id) })
        for (const c of mk.conditions) if (!ctx.index.conditions.some((x) => x.id === c)) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: unknown condition "${c}".`, ref: ref(e.id) })
        for (const i of mk.industries) if (!ctx.index.industries.some((x) => x.id === i)) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: unknown industry "${i}".`, ref: ref(e.id) })
        for (const p of mk.people) {
          const person = m.people.find((x) => x.id === p)
          if (!person) out.push({ level: 'error', area: 'Location', message: `${mk.name}: no person "${p}" in this mod.`, ref: ref(e.id) })
          else if (person.placement.at === 'market' && person.placement.market !== mk.id) out.push({ level: 'warning', area: 'Location', message: `${mk.name} lists ${person.name.first} ${person.name.last}, but their placement is the market "${person.placement.market}". SagaLib keeps them there; remove them from one of the two.`, ref: ref(e.id), key: `twomarkets:${p}` })
        }
        if (!mk.conditions.some((c) => /^population_\d+$/.test(c))) out.push({ level: 'warning', area: 'Location', message: `${mk.name}: add a population_<size> condition, as vanilla markets have.`, ref: ref(e.id) })
      }
    }
  }
  // the mod's own celestial types (R21)
  const own = ctx.loaded.sourceId
  for (const t of [...(m.types?.entities ?? []), ...(m.types?.planets ?? [])]) {
    const ref = { page: 'locations' as const }
    const pp = prefixProblem(m.project.prefix, t.id, 'Type', ref)
    if (pp) out.push(pp)
    const other = [...ctx.index.customEntityTypes, ...ctx.index.planetTypes].find((x) => x.id === t.id && x.definedBy !== own)
    if (other) out.push({ level: 'warning', area: 'Type', message: `Type "${t.id}" is also a type of ${other.definedBy === 'starsector-core' ? 'vanilla' : other.definedBy}: the merge changes it for everyone. Use another id.`, ref, key: `typeclash:${t.id}` })
    if ('sprite' in t && !t.sprite) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: choose a sprite.`, ref })
    if ('texture' in t && !t.texture) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: choose a texture.`, ref })
    if ('behavesLike' in t && !ctx.index.customEntityTypes.some((x) => x.id === t.behavesLike)) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: it behaves like "${t.behavesLike}", which isn't an entity type.`, ref })
    if ('basedOn' in t && !ctx.index.planetTypes.some((x) => x.id === t.basedOn)) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: it is based on "${t.basedOn}", which isn't a planet or star type.`, ref })
  }
  for (const p of m.people) {
    if (p.placement.at === 'market' && p.placement.market) {
      const own = m.systems.some((s) => s.entities.some((e) => e.market?.id === (p.placement as { market: string }).market))
      if (!own && !vanillaMarkets.has(p.placement.market)) out.push({ level: 'error', area: 'Person', message: `${p.name.first} ${p.name.last}: no market "${p.placement.market}".`, ref: { page: 'people', id: p.id } })
    }
    const pp = prefixProblem(m.project.prefix, p.id, 'Person', { page: 'people', id: p.id })
    if (pp) out.push(pp)
    if (!p.portrait && !isTodoActive(p, 'portrait')) out.push({ level: 'warning', area: 'Person', message: `${p.name.first} ${p.name.last} has no portrait.`, ref: { page: 'people', id: p.id } })
  }
  return out
}
