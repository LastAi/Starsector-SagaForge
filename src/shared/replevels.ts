/**
 * #70: relation levels between factions, as SagaLib 1.3's core.Presence reads them (the game's
 * RepLevel, worst first). Shared by Play mode's SagaLib copy (play.ts) and the rules engine's
 * previews (SF_FactionRep).
 */
import { REP_LEVELS } from './model'

const LEVELS: readonly string[] = REP_LEVELS

/** The level an "atLeast" stands for (notHostile = INHOSPITABLE, as FactionAPI.isHostileTo), or null. */
export function repLevelOf(atLeast: string | undefined): string | null {
  if (!atLeast) return null
  if (atLeast.toLowerCase() === 'nothostile') return 'INHOSPITABLE'
  const u = atLeast.toUpperCase()
  return LEVELS.includes(u) ? u : null
}

/** `is` is `atLeast` or better; null when either isn't a level. */
export function levelAtLeast(is: string | null | undefined, atLeast: string): boolean | null {
  const min = repLevelOf(atLeast)
  if (!is || !min || !LEVELS.includes(is)) return null
  return LEVELS.indexOf(is) >= LEVELS.indexOf(min)
}

/** The level of a relation value (-1..1) by the game's thresholds (GameDefinitions.repLevels, ordered worst first). */
export function repLevelId(v: number, levels: { id: string; min: number }[]): string {
  let best = levels[0]?.id ?? 'NEUTRAL'
  for (const l of levels) if (v >= l.min) best = l.id
  return best
}

/** Every line ("!"-negated too) among the strings in `value` (deep) that calls SF_FactionRep: dialog conditions, Branch cases, phrase cases. */
export function factionRepLines(value: unknown): string[] {
  const out = new Set<string>()
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { for (const l of v.split('\n')) if (/^\s*!?SF_FactionRep\b/.test(l)) out.add(l.trim()); return }
    if (Array.isArray(v)) { for (const x of v) walk(x); return }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(value)
  return [...out]
}

/** Faction A's relation with B as a level (both ways; a faction with itself is COOPERATIVE); undefined = not known here. */
export type RelationLookup = (a: string, b: string) => string | null | undefined
