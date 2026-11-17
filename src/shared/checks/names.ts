/**
 * Name lists (R3; DESIGN-PHASE2.md §1): what every name category and ship name list holds once the
 * mod is exported (other sources from the game index, this mod from its plans), and the checks on
 * them and on the factions that use them.
 */
import type { GameIndex, Problem } from '../api'
import type { ModModel } from '../serialize'
import { cleanNames, poolCounts, type NameCounts } from '../export/names'
import { getPath, isObj } from '../faction'
import type { CheckContext } from './index'

export interface CategoryTotal extends NameCounts { id: string; sources: string[] }
export interface ShipListTotal { id: string; count: number; sources: string[] }

/** Name categories as the game will see them: other sources' counts plus this mod's pools ('mine'). */
export function nameCategoryTotals(index: GameIndex, model: ModModel | null, ownSourceId: string | null): Map<string, CategoryTotal> {
  const out = new Map<string, CategoryTotal>()
  const add = (id: string, src: string, c: NameCounts) => {
    if (!c.male && !c.female && !c.last) return
    const e = out.get(id) ?? { id, male: 0, female: 0, last: 0, sources: [] }
    e.male += c.male; e.female += c.female; e.last += c.last
    if (!e.sources.includes(src)) e.sources.push(src)
    out.set(id, e)
  }
  for (const cat of index.nameCategories ?? []) for (const [src, c] of Object.entries(cat.counts)) if (src !== ownSourceId) add(cat.id, src, c)
  for (const p of model?.names.people ?? []) add(p.id, 'mine', poolCounts(p))
  return out
}

/** Ship name lists as the game will see them. */
export function shipListTotals(index: GameIndex, model: ModModel | null, ownSourceId: string | null): Map<string, ShipListTotal> {
  const out = new Map<string, ShipListTotal>()
  const add = (id: string, src: string, n: number) => {
    if (!n) return
    const e = out.get(id) ?? { id, count: 0, sources: [] }
    e.count += n
    if (!e.sources.includes(src)) e.sources.push(src)
    out.set(id, e)
  }
  for (const l of index.shipNameLists ?? []) for (const [src, n] of Object.entries(l.counts)) if (src !== ownSourceId) add(l.id, src, n)
  for (const l of model?.names.ships ?? []) add(l.id, 'mine', cleanNames(l.names).length)
  return out
}

/** The weight maps the mod's factions set: additions' whole maps, overrides' patched keys. */
function factionWeights(m: ModModel, key: 'names' | 'shipNameSources'): { faction: string; ids: string[] }[] {
  return m.factions.map((f) => {
    const v = f.kind === 'addition' ? f.raw[key] : getPath(f.patch.set, key)
    return { faction: f.id, ids: isObj(v) ? Object.keys(v as Record<string, unknown>) : [] }
  })
}

/** The mod's factions that weight a name category or ship name list. */
export function usedByFactions(m: ModModel, kind: 'people' | 'ships', id: string): string[] {
  return factionWeights(m, kind === 'people' ? 'names' : 'shipNameSources').filter((x) => x.ids.includes(id)).map((x) => x.faction)
}

const POOL_ID = /^[A-Za-z0-9_]+$/

export function nameProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const own = ctx.loaded.sourceId
  const cats = nameCategoryTotals(ctx.index, m, own)
  const ships = shipListTotals(ctx.index, m, own)
  const others = (id: string, kind: 'people' | 'ships') => (kind === 'people' ? cats.get(id) : ships.get(id))?.sources.filter((s) => s !== 'mine') ?? []
  const srcName = (id: string) => (id === 'starsector-core' ? 'vanilla' : ctx.index.sources.find((s) => s.id === id)?.name ?? id)

  const seen = new Set<string>()
  for (const p of m.names.people) {
    const ref = { page: 'factions' as const, id: `@people:${p.id}` }
    if (!POOL_ID.test(p.id)) out.push({ level: 'error', area: 'Names', message: `Name list "${p.id}": use letters, digits and _ only (the game splits categories on commas).`, ref })
    if (seen.has(`p:${p.id}`)) out.push({ level: 'error', area: 'Names', message: `Two people's name lists are called "${p.id}".`, ref })
    seen.add(`p:${p.id}`)
    const c = poolCounts(p)
    const t = cats.get(p.id) ?? { male: 0, female: 0, last: 0 }
    const missing = [!t.male && 'first names for men', !t.female && 'first names for women', !t.last && 'last names'].filter(Boolean)
    if (!c.male && !c.female && !c.last) out.push({ level: 'warning', area: 'Names', message: `Name list "${p.id}" is empty.`, ref, key: `names-empty:${p.id}` })
    else if (missing.length) out.push({ level: 'warning', area: 'Names', message: `Name list "${p.id}" has no ${missing.join(' and no ')}: the game takes those from a random category instead (e.g. a human last name).`, ref, key: `names-missing:${p.id}` })
    const o = others(p.id, 'people')
    if (o.length) out.push({ level: 'warning', area: 'Names', message: `Name list "${p.id}" adds to a category ${o.map(srcName).join(', ')} already has: every faction using it gets these names too.`, ref, key: `names-shared:${p.id}` })
  }
  for (const l of m.names.ships) {
    const ref = { page: 'factions' as const, id: `@ships:${l.id}` }
    if (!POOL_ID.test(l.id)) out.push({ level: 'error', area: 'Names', message: `Ship name list "${l.id}": use letters, digits and _ only.`, ref })
    if (seen.has(`s:${l.id}`)) out.push({ level: 'error', area: 'Names', message: `Two ship name lists are called "${l.id}".`, ref })
    seen.add(`s:${l.id}`)
    if (!cleanNames(l.names).length) out.push({ level: 'warning', area: 'Names', message: `Ship name list "${l.id}" is empty.`, ref, key: `ships-empty:${l.id}` })
    const o = others(l.id, 'ships')
    if (o.length) out.push({ level: 'warning', area: 'Names', message: `Ship name list "${l.id}" is appended to the list ${o.map(srcName).join(', ')} already has: every faction using it gets these names too.`, ref, key: `ships-shared:${l.id}` })
    const trimmed = l.names.map((n) => n.trim()).filter(Boolean)
    const dup = trimmed.filter((n, i) => trimmed.indexOf(n) !== i)
    if (dup.length) out.push({ level: 'style', area: 'Names', message: `Ship name list "${l.id}" lists ${[...new Set(dup)].slice(0, 3).map((d) => `"${d}"`).join(', ')} twice (exported once).`, ref, key: `ships-dup:${l.id}` })
  }

  // factions weighting a category or list nobody has
  for (const { faction, ids } of factionWeights(m, 'names')) {
    for (const id of ids) if (!cats.has(id)) out.push({ level: 'warning', area: 'Faction', message: `${faction}: person name set "${id}" has no names in the game, any mod or this mod's name lists, so the game picks a random category.`, ref: { page: 'factions', id: faction }, key: `nameset:${faction}:${id}` })
  }
  for (const { faction, ids } of factionWeights(m, 'shipNameSources')) {
    for (const id of ids) if (!ships.has(id)) out.push({ level: 'warning', area: 'Faction', message: `${faction}: ship name source "${id}" isn't a ship name list of the game, any mod or this mod.`, ref: { page: 'factions', id: faction }, key: `shipnames:${faction}:${id}` })
  }
  return out
}
