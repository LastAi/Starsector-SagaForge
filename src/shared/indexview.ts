/**
 * #67 U33 (user, 2026-11-22): the game index as the active mod's game would have it. The index reads
 * every installed mod; where several mods define or change one entry (a vanilla market a mod
 * changes, a CSV row a mod replaces, a planet type a mod patches), it keeps each mod's own version
 * (`layers`, `rawLayers`, faction `layerValues`). The view replays the merge with only the sources
 * that count for the mod (vanilla, the mod, its listed mods), so names, owners, positions and type
 * looks are the ones that mod's game has. Which entries a list shows is still the lists' filter
 * (mods.filter and Show all installed mods); this only fixes the values.
 */
import type { GameIndex, Origin } from './api'
import { isVisible } from './modlist'
import { mergeFactionJson } from './faction'
import { typeInfos } from './celestial'

export type MergeHow = 'json' | 'csv' | boolean

/** One entry merged into the one before it (the index's rule: a CSV row replaces vanilla's once; JSON and `true` replace; `false` keeps). */
export function mergeEntry<T extends Origin & { id: string }>(prev: T | undefined, entry: T, how: MergeHow): T {
  if (!prev) return entry
  if (prev.definedBy === entry.definedBy && !prev.changedBy.length) return { ...entry, changedBy: prev.changedBy }
  const changedBy = [...prev.changedBy, entry.definedBy]
  const replace = how === 'csv' ? prev.definedBy === 'starsector-core' && !prev.changedBy.length : how !== false
  return replace ? { ...entry, definedBy: prev.definedBy, changedBy } : { ...prev, changedBy }
}

/** An index entry with the version each source gave (only when more than one source did). */
export type Layered<T> = T & { layers?: Omit<T, 'layers' | 'layerHow'>[]; layerHow?: MergeHow }

/** The entry as the visible sources make it (unchanged when every source counts, or none of its layers is visible). */
export function effectiveOf<T extends Origin & { id: string }>(e: Layered<T>, visible: Set<string>): Layered<T> {
  const layers = e.layers as T[] | undefined
  if (!layers || layers.length < 2) return e
  const vis = layers.filter((l) => isVisible(l.definedBy, visible))
  if (!vis.length || vis.length === layers.length) return e
  let cur: T | undefined
  for (const l of vis) cur = mergeEntry(cur, { ...(l as T), changedBy: [] }, e.layerHow ?? true)
  return { ...(cur as T), layers, layerHow: e.layerHow }
}

/** A JSON object merged over its visible layers (planet and entity types). */
const mergedRaw = (layers: { sourceId: string; raw: Record<string, unknown> }[], visible: Set<string>): Record<string, unknown> | null => {
  const vis = layers.filter((l) => isVisible(l.sourceId, visible))
  if (!vis.length || vis.length === layers.length) return null
  let raw: Record<string, unknown> = {}
  for (const l of vis) raw = mergeFactionJson(raw, l.raw) as Record<string, unknown>
  return raw
}

/** The index as the mod with these visible sources sees it. */
export function indexView(ix: GameIndex, visible: Set<string>): GameIndex {
  const out: Record<string, unknown> = { ...ix }
  // every list of entries with per-source layers
  for (const [k, v] of Object.entries(ix)) {
    if (!Array.isArray(v) || !v.some((x) => x && typeof x === 'object' && Array.isArray((x as { layers?: unknown }).layers))) continue
    out[k] = v.map((x) => (x && typeof x === 'object' && 'layers' in x ? effectiveOf(x as Layered<Origin & { id: string }>, visible) : x))
  }
  // factions: name, colour, logo and crest from the visible layers
  out.factions = ix.factions.map((f) => {
    const ls = (f.layerValues ?? []).filter((l) => isVisible(l.sourceId, visible))
    if (!f.layerValues || ls.length === f.layerValues.length || !ls.length) return f.changedBy.every((c) => isVisible(c, visible)) ? f : { ...f, changedBy: f.changedBy.filter((c) => isVisible(c, visible)) }
    const last = <K extends 'name' | 'logo' | 'crest'>(key: K) => [...ls].reverse().find((l) => l[key] !== undefined)?.[key]
    const color = [...(f.colors ?? [])].reverse().find((c) => isVisible(c.sourceId, visible))?.color ?? f.color
    return { ...f, name: last('name') ?? f.name, logo: last('logo') ?? f.logo, crest: last('crest') ?? f.crest, color, changedBy: f.changedBy.filter((c) => isVisible(c, visible)) }
  })
  // the dialog's colours and fonts (settings.json): the visible sources' own values, in load order
  if (ix.ui?.layers?.length) {
    const colors: Record<string, number[]> = {}, fonts: Record<string, string> = {}
    for (const l of ix.ui.layers) if (isVisible(l.sourceId, visible)) { Object.assign(colors, l.colors); Object.assign(fonts, l.fonts) }
    out.ui = { ...ix.ui, colors, fonts }
  }
  // planet and entity types: their JSON merged over the visible layers, then re-read (names, colours, textures, sprites)
  if (ix.planetTypes.some((t) => t.rawLayers) || ix.customEntityTypes.some((t) => t.rawLayers)) {
    const pRaw = new Map(ix.planetTypes.map((t) => [t.id, (t.rawLayers && mergedRaw(t.rawLayers, visible)) ?? t.raw]))
    const eRaw = new Map(ix.customEntityTypes.map((t) => [t.id, (t.rawLayers && mergedRaw(t.rawLayers, visible)) ?? t.raw]))
    const types = typeInfos(new Map(ix.planetTypes.map((t) => [t.id, t])), pRaw, new Map(ix.customEntityTypes.map((t) => [t.id, t])), eRaw)
    out.planetTypes = types.planets
    out.customEntityTypes = types.entities
  }
  return out as unknown as GameIndex
}
