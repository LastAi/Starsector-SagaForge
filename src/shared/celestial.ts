/**
 * Planet, star and custom entity types (R15, R18–R20; DESIGN-PHASE3.md §1, §4): what the game index
 * keeps of planets.json and custom_entities.json, and vanilla's random-generation tables used for
 * "fits here". Pure helpers, used by the index (main) and the Locations page.
 */
import type { EntityTypeInfo, NamedEntry, PlanetTypeInfo, ProcgenData } from './api'
import type { CustomEntityTypeDef, CustomPlanetTypeDef, ModTypes } from './model'
import { mergeFactionJson } from './faction'

const numList = (v: unknown): number[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null)
const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** Types with their merged entries; entity types inherit what they don't set from their baseId. */
export function typeInfos(
  planets: Map<string, NamedEntry>, planetRaw: Map<string, Record<string, unknown>>,
  entities: Map<string, NamedEntry>, entityRaw: Map<string, Record<string, unknown>>
): { planets: PlanetTypeInfo[]; entities: EntityTypeInfo[] } {
  const p: PlanetTypeInfo[] = [...planets.values()].map((e) => {
    const raw = planetRaw.get(e.id) ?? {}
    return { ...e, name: s(raw.name) || e.id, isStar: raw.isStar === true, texture: s(raw.texture), iconColor: numList(raw.iconColor), raw }
  })
  const resolved = new Map<string, Record<string, unknown>>()
  const effective = (id: string, depth = 0): Record<string, unknown> => {
    if (resolved.has(id)) return resolved.get(id)!
    const raw = entityRaw.get(id) ?? {}
    const base = typeof raw.baseId === 'string' && raw.baseId !== id && depth < 8 ? effective(raw.baseId, depth + 1) : {}
    const out = mergeFactionJson(base, raw) as Record<string, unknown>
    // tags and layers belong to the type that sets them (the merge would append the base's)
    if (Array.isArray(raw.tags)) out.tags = raw.tags
    if (Array.isArray(raw.layers)) out.layers = raw.layers
    resolved.set(id, out)
    return out
  }
  const en: EntityTypeInfo[] = [...entities.values()].map((e) => {
    const raw = effective(e.id)
    const r = typeof raw.defaultRadius === 'number' ? raw.defaultRadius : null
    return { ...e, name: s(raw.defaultName) || e.id, sprite: s(raw.sprite), sheet: s(raw.sheet), icon: s(raw.icon), tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [], radius: r, raw: entityRaw.get(e.id) ?? {} }
  })
  const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  return { planets: p.sort(byName), entities: en.sort(byName) }
}

/** The mod's own types (R21) as the type lists show them (source 'mine'), on top of their base type. */
export function ownTypeInfos(types: ModTypes | undefined, planetTypes: PlanetTypeInfo[], entityTypes: EntityTypeInfo[]): { planets: PlanetTypeInfo[]; entities: EntityTypeInfo[] } {
  const own = { definedBy: 'mine', changedBy: [] as string[] }
  return {
    planets: (types?.planets ?? []).map((t) => {
      const base = planetTypes.find((x) => x.id === t.basedOn)
      return { id: t.id, name: t.name || t.id, isStar: t.isStar, texture: t.texture, iconColor: base?.iconColor ?? null, raw: planetEntry(t, base), ...own }
    }),
    entities: (types?.entities ?? []).map((t) => {
      const base = entityTypes.find((x) => x.id === t.behavesLike)
      return { id: t.id, name: t.name || t.id, sprite: t.sprite, sheet: '', icon: t.icon ?? '', tags: base?.tags ?? [], radius: t.radius, raw: entityEntry(t), ...own }
    })
  }
}

/** planets.json entry of the mod's own planet or star type: its base's settings, its own name and texture. */
export function planetEntry(t: CustomPlanetTypeDef, base: PlanetTypeInfo | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base?.raw ?? {}) }
  delete out.descriptionId
  out.name = t.name || t.id
  out.texture = t.texture
  out.isStar = t.isStar
  return out
}

/** custom_entities.json entry of the mod's own entity type: inherits from its base (baseId). */
export function entityEntry(t: CustomEntityTypeDef): Record<string, unknown> {
  const out: Record<string, unknown> = {
    baseId: t.behavesLike, defaultName: t.name || t.id, defaultRadius: t.radius,
    sprite: t.sprite, spriteWidth: t.size, spriteHeight: t.size
  }
  if (t.icon) { out.icon = t.icon; out.iconWidth = 24; out.iconHeight = 24 }
  if (t.interactionImage) out.interactionImage = t.interactionImage
  return out
}

/** Vanilla types a new entity type can behave like (they draw one sprite; sheet-based types are left out). */
export function behaviourBases(entityTypes: EntityTypeInfo[]): EntityTypeInfo[] {
  return entityTypes.filter((t) => t.definedBy === 'starsector-core' && t.sprite && !t.sheet && !/^base_/.test(t.id))
}

const FIXED = new Set(['id', 'type', 'category', 'frequency', 'habOffsetMin', 'habOffsetMax', 'habOffsetYOUNG', 'habOffsetAVERAGE', 'habOffsetOLD', 'tags', 'probOrbits', 'minOrbits', 'maxOrbits', 'minRadius', 'maxRadius', 'minColor', 'maxColor'])

/** planet_gen_data.csv rows → categories and types with their multipliers (a blank cell is 1). */
export function procgenData(stars: Record<string, { habZoneStart: number }>, rows: Record<string, string>[]): ProcgenData {
  const n = (v: string | undefined, d: number) => { const t = (v ?? '').trim(); if (!t) return d; const x = Number(t); return Number.isFinite(x) ? x : d }
  const mult = (r: Record<string, string>) => {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(r)) if (!FIXED.has(k) && (v ?? '').trim() !== '' && Number.isFinite(Number(v))) m[k] = Number(v)
    return m
  }
  const out: ProcgenData = { stars, categories: [], types: [] }
  for (const r of rows) {
    const type = (r.type ?? '').trim(), cat = (r.category ?? '').trim()
    if (!cat) continue
    if (type === 'CATEGORY') out.categories.push({ id: cat, freq: n(r.frequency, 0), mult: mult(r) })
    else if ((r.id ?? '').trim() && !(r.id ?? '').startsWith('#')) {
      out.types.push({ id: r.id.trim(), kind: type, category: cat, freq: n(r.frequency, 0), habMin: n(r.habOffsetMin, -1000), habMax: n(r.habOffsetMax, 1000), habAvg: n(r.habOffsetAVERAGE, 0), mult: mult(r) })
    }
  }
  return out
}

/** The orbit index vanilla's generator would give an orbit (StarSystemGenerator: 750–1250 start, ~1400 per orbit). */
export function orbitIndex(orbitRadius: number, starRadius: number): number {
  return Math.max(0, Math.floor((orbitRadius - starRadius - 1000) / 1400))
}

export interface Fit { id: string; weight: number; fits: boolean }

/**
 * How likely vanilla's random generation is to put each planet type at this orbit of this star
 * (an estimate: average star age, no nebula or moon rules). Highest weight first.
 */
export function planetFits(pg: ProcgenData, starType: string, orbitIdx: number): Fit[] {
  const hab = pg.stars[starType]?.habZoneStart
  if (hab == null) return []
  const m = (x: Record<string, number>, k: string) => (k in x ? x[k] : 1)
  const out: Fit[] = []
  for (const t of pg.types) {
    if (t.kind !== 'PLANET') continue
    const c = pg.categories.find((x) => x.id === t.category)
    if (!c) continue
    const lo = hab + t.habMin + t.habAvg, hi = hab + t.habMax + t.habAvg
    const w = c.freq * m(c.mult, starType) * t.freq * m(t.mult, starType)
    out.push({ id: t.id, weight: orbitIdx >= lo && orbitIdx <= hi ? w : 0, fits: false })
  }
  const total = out.reduce((a, b) => a + b.weight, 0)
  // "fits here": the types that together make up most of the chance (or any with a real share)
  for (const f of out) f.fits = total > 0 && f.weight / total >= 0.03
  return out.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
}

/** Filter groups for planet types (R18), by vanilla's procgen category where known, else by id. */
export const PLANET_GROUPS: { id: string; label: string; test: (id: string, cat: string | undefined) => boolean }[] = [
  { id: 'giant', label: 'Gas giants', test: (id, c) => c === 'cat_giant' || /giant/.test(id) },
  { id: 'hab', label: 'Habitable', test: (id, c) => !!c && /^cat_hab/.test(c) },
  { id: 'barren', label: 'Barren / rocky', test: (id, c) => c === 'cat_barren' || /barren|rocky/.test(id) },
  { id: 'frozen', label: 'Frozen', test: (id, c) => c === 'cat_frozen' || c === 'cat_cryovolcanic' || /frozen|ice|cryo/.test(id) },
  { id: 'hot', label: 'Lava', test: (id, c) => c === 'cat_lava' || /lava/.test(id) },
  { id: 'toxic', label: 'Toxic', test: (id, c) => c === 'cat_toxic' || /toxic/.test(id) },
  { id: 'irradiated', label: 'Irradiated', test: (id, c) => c === 'cat_irradiated' || /irradiated/.test(id) }
]

/** Filter groups for custom entity types (R20), by tag. The entity's kind picks one by default. */
export const ENTITY_GROUPS: { id: string; label: string; test: (t: EntityTypeInfo) => boolean }[] = [
  { id: 'station', label: 'Stations', test: (t) => t.tags.includes('station') },
  { id: 'objective', label: 'Relays, buoys, arrays', test: (t) => t.tags.includes('objective') },
  { id: 'salvage', label: 'Salvageable', test: (t) => t.tags.includes('salvageable') },
  { id: 'dialog', label: 'With a dialog', test: (t) => t.tags.includes('has_interaction_dialog') },
  { id: 'other', label: 'Other', test: (t) => !['station', 'objective', 'salvageable', 'has_interaction_dialog'].some((x) => t.tags.includes(x)) }
]

/** The filter an entity kind starts with (its recommendation). */
export function defaultEntityGroup(kind: string): string | null {
  return kind === 'station' ? 'station' : kind === 'derelict' ? 'salvage' : ['commRelay', 'navBuoy', 'sensorArray'].includes(kind) ? 'objective' : null
}
