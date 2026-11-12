/** Faction checks (PLAN.md §4.1): ids, collisions, overrides that would break a merge. */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'

/**
 * Ids in a faction's lists that the game checks when it loads (an unknown one is fatal, e.g.
 * "Invalid illegal commodity id"): commodities, hulls, wings, weapons, hullmods.
 */
function unknownIds(doc: Record<string, unknown>, ctx: CheckContext): string[] {
  const out: string[] = []
  const ix = ctx.index
  const own = ctx.model.items
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), doc)
  const checks: [string, (id: string) => boolean][] = [
    ['illegalCommodities', (id) => ix.items.some((i) => i.id === id && i.kind === 'commodity') || own.some((i) => i.id === id && i.kind === 'commodity')],
    ['knownShips.hulls', (id) => ix.hulls.some((h) => h.id === id)],
    ['priorityShips.hulls', (id) => ix.hulls.some((h) => h.id === id)],
    ['knownFighters.fighters', (id) => ix.wings.some((w) => w.id === id)],
    ['knownWeapons.weapons', (id) => ix.weapons.some((w) => w.id === id)],
    ['knownHullMods.hullMods', (id) => ix.hullmods.some((h) => h.id === id)]
  ]
  for (const [path, ok] of checks) for (const id of list(get(path))) if (!ok(id)) out.push(`${path}: "${id}"`)
  return out
}

export function factionProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const { model, index } = ctx
  const ownSource = ctx.loaded.sourceId
  for (const f of model.factions) {
    const ref = { page: 'factions' as const, id: f.id }
    // patch adds are stored by dotted path; expand them for the id check
    const expanded: Record<string, unknown> = f.kind === 'addition' ? f.raw : JSON.parse(JSON.stringify(f.patch.set))
    if (f.kind === 'override') for (const [p, v] of Object.entries(f.patch.add)) {
      const keys = p.split('.')
      let cur = expanded
      for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>
      cur[keys[keys.length - 1]] = v
    }
    for (const bad of unknownIds(expanded, ctx)) {
      out.push({ level: 'error', area: 'Faction', message: `"${f.id}": unknown id in ${bad}. The game refuses to start with an unknown id in a faction's lists.`, ref })
    }
    if (f.kind === 'addition') {
      if (!ID_PATTERN.test(f.id)) out.push({ level: 'error', area: 'Faction', message: `Faction id "${f.id}" may only use lowercase letters, digits and _.`, ref })
      const p = prefixProblem(model.project.prefix, f.id, 'Faction', ref)
      if (p) out.push(p)
      const other = index.factions.find((x) => x.id === f.id && x.definedBy !== ownSource)
      if (other) out.push({ level: 'error', area: 'Faction', message: `Faction id "${f.id}" is also defined by ${other.definedBy === 'starsector-core' ? 'vanilla' : other.definedBy}.`, ref, key: `factioncollision:${f.id}` })
      if (!f.listed) out.push({ level: 'error', area: 'Faction', message: `"${f.id}" is not listed in the mod's factions.csv, so the game won't load it.`, ref, fixes: [{ label: 'List it', action: 'listFaction', arg: f.id }] })
      if (!f.raw.displayName) out.push({ level: 'error', area: 'Faction', message: `"${f.id}" has no display name.`, ref })
      for (const k of ['color', 'baseUIColor', 'darkUIColor']) {
        const c = f.raw[k]
        if (c !== undefined && !(Array.isArray(c) && c.length === 4)) out.push({ level: 'warning', area: 'Faction', message: `"${f.id}": ${k} should have 4 numbers (red, green, blue, alpha).`, ref })
      }
    } else {
      const target = index.factions.find((x) => x.id === f.id)
      if (!target) out.push({ level: 'error', area: 'Faction', message: `Override of "${f.id}": no such faction in the game or any installed mod.`, ref })
      for (const [path, v] of Object.entries(f.patch.set)) {
        if (/color$/i.test(path) && Array.isArray(v) && v.length !== 4) {
          out.push({ level: 'error', area: 'Faction', message: `Override of "${f.id}": ${path} must have exactly 4 numbers, otherwise the game appends it to the original color.`, ref })
        }
      }
      const scripted = model.factionsRuntime.scripted[f.id] ?? []
      for (const s of scripted) {
        out.push({ level: 'warning', area: 'Faction', message: `Override of "${f.id}": "${s.op} ${s.path} ${s.value}" is a scripted change applied by SagaLib on load. Other mods that add it back would be undone.`, ref, key: `scripted:${f.id}:${s.path}:${s.value}` })
      }
    }
  }
  return out
}
