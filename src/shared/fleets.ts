/**
 * Fleets (Phase 5; DESIGN-PHASE5.md): the doctrine preview (R4), named fleet templates (R27) and
 * their checks. The preview uses vanilla's own numbers where the API sources give them
 * (FleetFactoryV3); everything else is labelled an estimate.
 */
import type { Problem } from './api'
import type { CheckContext } from './checks'
import type { FleetTemplateDef } from './model'
import { fullName } from './personname'

/** FleetFactoryV3.BASE_COUNTS_WITH_4 and MAX_EXTRA_WITH_4 (0.98a): ships per round by doctrine ship size 1–5 (small, medium, large, capital). */
const BASE_4 = [[9, 4, 2, 0], [7, 4, 2, 0], [4, 3, 3, 0], [1, 1, 1, 0], [1, 1, 1, 1]]
const EXTRA_4 = [[3, 2, 1, 1], [2, 2, 2, 1], [2, 2, 2, 1], [2, 2, 2, 3], [1, 1, 1, 1]]

export interface DoctrinePreview {
  /** Share of warships, carriers and phase ships (the doctrine's weights, normalised). */
  mix: { warships: number; carriers: number; phase: number }
  combatFreighters: number
  /** Expected ships of each size per round of the fleet factory (base + average random extra). */
  sizes: { frigates: number; destroyers: number; cruisers: number; capitals: number }
  /** The 1–5 trade-off vanilla factions keep at 7 points in total. */
  quality: { officers: number; ships: number; numbers: number }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** A faction's factionDoctrine block → what its fleets look like (vanilla's defaults where unset). */
export function doctrinePreview(doctrine: Record<string, unknown> | undefined): DoctrinePreview {
  const d = doctrine ?? {}
  const w = num(d.warships, 3), c = num(d.carriers, 2), p = num(d.phaseShips, 2)
  const sum = w + c + p || 1
  const size = Math.min(5, Math.max(1, Math.round(num(d.shipSize, 3))))
  const row = (i: number) => BASE_4[size - 1][i] + EXTRA_4[size - 1][i] / 2
  return {
    mix: { warships: w / sum, carriers: c / sum, phase: p / sum },
    combatFreighters: num(d.combatFreighterProbability, 0),
    sizes: { frigates: row(0), destroyers: row(1), cruisers: row(2), capitals: row(3) },
    quality: { officers: num(d.officerQuality, 2), ships: num(d.shipQuality, 3), numbers: num(d.numShips, 2) }
  }
}

/** Checks of the mod's named fleets and of encounters that use them. */
export function fleetProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const templates = m.fleets?.templates ?? []
  const seen = new Set<string>()
  const variants = new Set(ctx.index.variants.map((v) => v.id))
  const factions = new Set([...ctx.index.factions.map((f) => f.id), ...m.factions.map((f) => f.id)])
  for (const t of templates) {
    const ref = { page: 'fleets' as const, id: t.id }
    if (seen.has(t.id)) out.push({ level: 'error', area: 'Fleet', ref, message: `Two named fleets use the id "${t.id}".` })
    seen.add(t.id)
    if (!t.ships.length) out.push({ level: 'error', area: 'Fleet', ref, message: `${t.name || t.id}: add at least one ship.` })
    for (const s of t.ships) if (s.variant && !variants.has(s.variant)) out.push({ level: 'error', area: 'Fleet', ref, message: `${t.name || t.id}: unknown variant "${s.variant}".` })
    if (!factions.has(t.faction)) out.push({ level: 'error', area: 'Fleet', ref, message: `${t.name || t.id}: no faction "${t.faction}".` })
    if (t.captain) {
      const p = m.people.find((x) => x.id === t.captain)
      if (!p) out.push({ level: 'error', area: 'Fleet', ref, message: `${t.name || t.id}: the captain "${t.captain}" isn't one of the mod's people.` })
      else if (p.placement.at === 'market') out.push({ level: 'info', area: 'Fleet', ref, key: `captainmarket:${t.id}`, message: `${t.name || t.id}: its captain ${fullName(p.name)} also lives at a market; the same person commands the fleet when it is out.` })
    }
    if (t.flagship !== undefined && (t.flagship < 0 || t.flagship >= t.ships.length)) out.push({ level: 'warning', area: 'Fleet', ref, message: `${t.name || t.id}: the flagship isn't one of its ships; the first ship is used.` })
  }
  for (const e of m.encounters) {
    if (e.fleet.size !== 'template') continue
    if (!templates.some((t) => t.id === e.fleet.template)) out.push({ level: 'error', area: 'Encounter', ref: { page: 'encounters', id: e.id }, message: `${e.name}: pick one of the named fleets (Fleets page).` })
  }
  return out
}

/** The encounters that use a named fleet. */
export function templateUsers(encounters: { id: string; name: string; fleet: { size: string; template?: string } }[], id: string): { id: string; name: string }[] {
  return encounters.filter((e) => e.fleet.size === 'template' && e.fleet.template === id)
}

export function newTemplate(id: string, name: string, faction: string): FleetTemplateDef {
  return { id, name, faction, fleetType: 'patrolMedium', ships: [], flagship: 0 }
}
