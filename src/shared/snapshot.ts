/**
 * Task #64 (PLAN.md §10.6): a sector snapshot (SagaLib dev menu › Write sector snapshot) as a
 * source "seen in game". It adds the systems, places, markets and people the game files and Java
 * sources don't show (a mod that builds its sector in code), each tied to the mod that made it, so
 * they become pickable and checked. Pure.
 */
import type { MarketInfo, PersonInfo, PlaceInfo, SectorSnapshot, SnapshotInfo, SystemInfo } from './api'

/** The file SagaLib writes into the game's saves/common folder (the game adds ".data"). */
export const SNAPSHOT_FILE = 'sagaforge_snapshot.json'

export interface SnapshotKnown {
  systems: Set<string>
  places: Set<string>
  markets: Set<string>
  people: Set<string>
  /** The source that defines a faction (factions tie markets and people to their mod). */
  factionSource: (id: string) => string | undefined
  /** Installed mods: id → the id prefixes of their factions ("sfj_") and their own id ("sixtyfour_j_"), to tie unknown ids to them. */
  modPrefixes: Map<string, string[]>
  /** The mod being edited: its content is known from its plan, so the snapshot never adds it (found in game 2026-11-18). */
  exclude?: string | null
}

export interface SnapshotMerge {
  systems: SystemInfo[]
  places: PlaceInfo[]
  markets: MarketInfo[]
  people: PersonInfo[]
  added: SnapshotInfo['added']
  skipped: number
}

const CORE = 'starsector-core'
const titleCase = (id: string) => id.replace(/[_-]+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim()

/** The id prefix of a faction or mod id ("sfj_harbor" → "sfj_"), or null. */
export const idPrefix = (id: string): string | null => /^([A-Za-z0-9]+_)/.exec(id)?.[1] ?? null

/**
 * What the snapshot adds: only ids nothing else defines, each tied to a mod (by its faction, its id
 * prefix, or its system). What can't be tied to a mod is left out (vanilla's random systems change
 * with every new game).
 */
export function mergeSnapshot(snap: SectorSnapshot, known: SnapshotKnown): SnapshotMerge {
  const enabled = new Set((snap.mods ?? []).map((m) => m.id))
  const fromFaction = (f: string | undefined): string | null => {
    const s = f ? known.factionSource(f) : undefined
    return s && s !== CORE && !s.startsWith('code:') && (!enabled.size || enabled.has(s)) ? s : null
  }
  // the longest prefix the id starts with; one two mods share ties to neither
  const fromPrefix = (id: string): string | null => {
    let best: string | null = null, len = 0, tie = false
    for (const [mod, ps] of known.modPrefixes) {
      if (enabled.size && !enabled.has(mod) && mod !== known.exclude) continue
      for (const p of ps) {
        if (!id.startsWith(p) || p.length < len) continue
        if (p.length === len && best !== mod) tie = true
        else { tie = false; best = mod; len = p.length }
      }
    }
    return tie ? null : best
  }
  const mine = (mod: string | null | undefined) => !!mod && mod === known.exclude
  const out: SnapshotMerge = { systems: [], places: [], markets: [], people: [], added: {}, skipped: 0 }
  const count = (src: string, k: keyof SnapshotMerge['added'][string]) => { const a = (out.added[src] ??= { systems: 0, places: 0, markets: 0, people: 0 }); a[k]++ }
  const own = (definedBy: string) => ({ definedBy, changedBy: [] as string[] })

  // places and markets first (their faction or id), then systems by what is in them
  const sysOf = new Map<string, string>()
  const placeMod = new Map<string, string | null>()
  for (const p of snap.places ?? []) {
    if (!p.id) continue
    const mod = fromFaction(p.faction) ?? fromPrefix(p.id) ?? (p.system ? fromPrefix(p.system) : null)
    placeMod.set(p.id, mod)
    if (mod && p.system && !sysOf.has(p.system)) sysOf.set(p.system, mod)
  }
  const marketMod = new Map<string, string | null>()
  for (const mk of snap.markets ?? []) {
    if (!mk.id) continue
    const mod = fromFaction(mk.faction) ?? fromPrefix(mk.entity ?? mk.id) ?? fromPrefix(mk.id)
    marketMod.set(mk.id, mod)
    if (mod && mk.system && !sysOf.has(mk.system)) sysOf.set(mk.system, mod)
  }
  for (const s of snap.systems ?? []) {
    if (!s.id) continue
    const mod = fromPrefix(s.id) ?? sysOf.get(s.id) ?? null
    if (mod) sysOf.set(s.id, mod)
    if (known.systems.has(s.id) || mine(mod)) continue
    if (!mod) { out.skipped++; continue }
    out.systems.push({ id: s.id, name: s.name || titleCase(s.id), x: s.x ?? null, y: s.y ?? null, ...own(mod) })
    count(mod, 'systems')
  }
  // a market's own object is in the markets (not again as a place)
  const marketEntities = new Set((snap.markets ?? []).flatMap((mk) => [mk.entity || mk.id, mk.id]))
  for (const p of snap.places ?? []) {
    if (!p.id || known.places.has(p.id) || known.markets.has(p.id) || marketEntities.has(p.id)) continue
    const mod = placeMod.get(p.id) ?? (p.system ? sysOf.get(p.system) : undefined) ?? null
    if (mine(mod)) continue
    if (!mod) { out.skipped++; continue }
    out.places.push({ id: p.id, name: p.name || titleCase(p.id), system: p.system ?? '', kind: p.kind ?? 'custom', ...(p.faction ? { faction: p.faction } : {}), ...(p.market ? { market: p.market } : {}), ...own(mod) })
    count(mod, 'places')
  }
  const marketEntity = new Map<string, string>()
  for (const mk of snap.markets ?? []) {
    if (!mk.id) continue
    const entity = mk.entity || mk.id
    marketEntity.set(mk.id, entity)
    if (known.markets.has(entity) || known.markets.has(mk.id)) continue
    const mod = marketMod.get(mk.id) ?? (mk.system ? sysOf.get(mk.system) : undefined) ?? null
    if (mine(mod)) continue
    if (!mod) { out.skipped++; continue }
    // the editor's markets are known by their primary entity (what rules and SagaLib use)
    out.markets.push({ id: entity, name: mk.name || titleCase(entity), entities: entity === mk.id ? [entity] : [entity, mk.id], faction: mk.faction ?? '', size: mk.size ?? 0, system: mk.system ?? '', conditions: [], industries: [], submarkets: [], ...own(mod) })
    count(mod, 'markets')
  }
  for (const p of snap.people ?? []) {
    if (!p.id || known.people.has(p.id)) continue
    const atMarket = p.market ? marketMod.get(p.market) : undefined
    // by id only: people the game generates (a market's staff, "p_2ef2") get new ids every game (found in game 2026-11-18)
    void atMarket
    const mod = fromPrefix(p.id)
    if (mine(mod)) continue
    if (!mod) { out.skipped++; continue }
    out.people.push({ id: p.id, name: `${p.first ?? ''} ${p.last ?? ''}`.trim() || titleCase(p.id), faction: p.faction ?? '', market: p.market ? marketEntity.get(p.market) ?? p.market : '', portrait: p.portrait ?? '', kind: 'seen', ...(p.post ? { post: p.post } : {}), ...(p.rank ? { rank: p.rank } : {}), ...own(mod) })
    count(mod, 'people')
  }
  return out
}

/** Reads a snapshot file's text (rejects what isn't one). */
export function parseSnapshot(text: string): SectorSnapshot {
  const v = JSON.parse(text.replace(/^﻿/, '')) as SectorSnapshot
  if (!v || typeof v !== 'object' || v.format !== 1 || !Array.isArray(v.systems)) throw new Error('This is not a SagaLib sector snapshot (format 1 with systems, places, markets and people).')
  return v
}
