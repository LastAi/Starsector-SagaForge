/**
 * #67 U39 (user, 2026-11-22): ships "as a faction's fleets would have them", the way vanilla builds
 * fleets: a faction knows some hulls (knownShips: hull ids and blueprint tags), vanilla's ship roles
 * (default_ship_roles.json) say which variants fill each role and how often. Used by the variant
 * picker's "the faction's ships" filter and by "+ From a faction's fleet…" (a starting list the
 * author then edits). Only the sources that count for the mod (vanilla, the mod, its listed mods).
 */
import type { GameIndex } from './api'
import { isVisible } from './modlist'

export interface Known { hulls: Set<string>; tags: Set<string> }

/** What a faction knows: its file and patches of the visible sources, plus the mod's own edits (raw knownShips). */
export function factionKnows(ix: GameIndex, faction: string, visible: Set<string>, own: Record<string, unknown>[] = []): Known {
  const out: Known = { hulls: new Set(), tags: new Set() }
  for (const l of ix.factions.find((f) => f.id === faction)?.knownShips ?? []) {
    if (!isVisible(l.sourceId, visible)) continue
    for (const h of l.hulls) out.hulls.add(h)
    for (const t of l.tags) out.tags.add(t)
  }
  for (const raw of own) {
    const k = (raw.knownShips ?? {}) as { hulls?: unknown; tags?: unknown }
    for (const h of Array.isArray(k.hulls) ? k.hulls : []) out.hulls.add(String(h))
    for (const t of Array.isArray(k.tags) ? k.tags : []) out.tags.add(String(t))
  }
  return out
}

/** Whether a faction knows a hull (by id, or by one of its tags). */
export function knowsHull(ix: GameIndex, known: Known, hullId: string): boolean {
  if (known.hulls.has(hullId)) return true
  const h = ix.hulls.find((x) => x.id === hullId)
  return !!h?.tags?.some((t) => known.tags.has(t))
}

/** The variants of the visible sources whose hull the faction knows. */
export function knownVariants(ix: GameIndex, known: Known, visible: Set<string>): GameIndex['variants'] {
  return ix.variants.filter((v) => isVisible(v.definedBy, visible) && !!v.hull && knowsHull(ix, known, v.hull))
}

/** Kinds of fleet, as roles and how many ships of each per size (a starting point, not vanilla's exact mix). */
export const FLEET_KINDS: { id: string; label: string; sizes: Record<'small' | 'medium' | 'large', [string, number][]> }[] = [
  { id: 'patrol', label: 'Patrol (warships)', sizes: { small: [['combatSmall', 3]], medium: [['combatSmall', 3], ['combatMedium', 2]], large: [['combatSmall', 2], ['combatMedium', 3], ['combatLarge', 2], ['combatCapital', 1]] } },
  { id: 'fast', label: 'Raiders (fast attack)', sizes: { small: [['fastAttack', 3]], medium: [['fastAttack', 3], ['combatSmall', 2]], large: [['fastAttack', 3], ['combatMedium', 3], ['combatLarge', 1]] } },
  { id: 'carrier', label: 'Carrier group', sizes: { small: [['carrierSmall', 2], ['combatSmall', 1]], medium: [['carrierMedium', 2], ['combatSmall', 2]], large: [['carrierLarge', 2], ['carrierMedium', 1], ['combatMedium', 2]] } },
  { id: 'phase', label: 'Phase ships', sizes: { small: [['phaseSmall', 3]], medium: [['phaseSmall', 2], ['phaseMedium', 2]], large: [['phaseMedium', 2], ['phaseLarge', 2], ['phaseCapital', 1]] } },
  { id: 'trade', label: 'Trade convoy (escorted)', sizes: { small: [['freighterSmall', 2], ['escortSmall', 1]], medium: [['freighterMedium', 2], ['tankerSmall', 1], ['escortSmall', 2]], large: [['freighterLarge', 2], ['tankerMedium', 1], ['escortMedium', 2], ['combatMedium', 1]] } },
  { id: 'civilian', label: 'Civilian (liners, personnel)', sizes: { small: [['linerSmall', 1], ['personnelSmall', 1]], medium: [['linerMedium', 1], ['personnelMedium', 1], ['escortSmall', 1]], large: [['linerLarge', 1], ['personnelLarge', 1], ['escortMedium', 2]] } }
]
export type FleetSize = 'small' | 'medium' | 'large'

/** A role's variants the faction can use, with vanilla's weights (the visible sources' rows; weight 0 left out). */
export function roleChoices(ix: GameIndex, known: Known, role: string, visible: Set<string>): { variant: string; weight: number }[] {
  const byId = new Map(ix.variants.map((v) => [v.id, v]))
  const w = new Map<string, number>()
  for (const r of ix.shipRoles ?? []) if (r.role === role && isVisible(r.definedBy, visible)) w.set(r.variant, r.weight)
  return [...w].filter(([v, x]) => { const h = byId.get(v)?.hull; return x > 0 && !!h && knowsHull(ix, known, h) }).map(([variant, weight]) => ({ variant, weight }))
}

/** A small seeded random (so Reroll gives another list, the same seed the same one). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

/** Ships for a kind and size of fleet: each role's count drawn by vanilla's weights. Roles with nothing the faction knows are reported. */
export function pickShips(ix: GameIndex, known: Known, kind: string, size: FleetSize, visible: Set<string>, seed = 1): { variants: string[]; empty: string[] } {
  const k = FLEET_KINDS.find((x) => x.id === kind) ?? FLEET_KINDS[0]
  const r = rng(seed)
  const out: string[] = [], empty: string[] = []
  for (const [role, n] of k.sizes[size]) {
    const choices = roleChoices(ix, known, role, visible)
    if (!choices.length) { empty.push(role); continue }
    const total = choices.reduce((a, c) => a + c.weight, 0)
    for (let i = 0; i < n; i++) {
      let x = r() * total
      const c = choices.find((c) => (x -= c.weight) < 0) ?? choices[choices.length - 1]
      out.push(c.variant)
    }
  }
  return { variants: out, empty }
}

/** The mod's own faction edits as knownShips objects: a new faction's file, or a change's set + added entries. */
export function ownKnownShips(edits: import('./serialize').FactionEdit[], faction: string): Record<string, unknown>[] {
  return edits.filter((f) => f.id === faction).map((f) => {
    if (f.kind === 'addition') return f.raw
    const set = ((f.patch.set.knownShips ?? {}) as { hulls?: unknown[]; tags?: unknown[] })
    return { knownShips: { hulls: [...(set.hulls ?? []), ...(f.patch.add['knownShips.hulls'] ?? [])], tags: [...(set.tags ?? []), ...(f.patch.add['knownShips.tags'] ?? [])] } }
  })
}
