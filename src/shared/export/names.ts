/**
 * Name lists (R3; DESIGN-PHASE2.md §1) → the mod's data/characters/person_names.csv rows (a merged
 * spreadsheet: added to vanilla's) and the lists of its data/strings/ship_names.json (merged JSON:
 * a list with an existing id is appended to it).
 */
import type { NamePool, ShipNameList } from '../model'

export const PERSON_NAMES_HEADER = ['name', 'gender', 'usage', 'category']

/** One name per entry: trimmed, empty and repeated entries dropped (order kept). */
export function cleanNames(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const n = raw.trim()
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/** person_names.csv rows of the pools, as vanilla writes them (gender m / f / empty, usage f / l). */
export function personNameRows(pools: NamePool[]): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  for (const p of pools) {
    const add = (names: string[], gender: string, usage: string) => { for (const name of cleanNames(names)) rows.push({ name, gender, usage, category: p.id }) }
    add(p.male, 'm', 'f')
    add(p.female, 'f', 'f')
    add(p.first, '', 'f')
    add(p.last, '', 'l')
  }
  return rows
}

/** The ship name lists as the JSON object to merge into the mod's ship_names.json. */
export function shipNameLists(lists: ShipNameList[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const l of lists) { const n = cleanNames(l.names); if (n.length) out[l.id] = n }
  return out
}

/** What a pool gives the game: name counts by gender and use (empty gender counts for both). */
export interface NameCounts { male: number; female: number; last: number }
export function poolCounts(p: NamePool): NameCounts {
  const any = cleanNames(p.first).length
  return { male: cleanNames(p.male).length + any, female: cleanNames(p.female).length + any, last: cleanNames(p.last).length }
}
