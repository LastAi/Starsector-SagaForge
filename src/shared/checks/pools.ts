/**
 * Random pool checks (Phase 7a, DESIGN-PHASE7.md; RANDOM-CONTENT-ASSESSMENT.md §6.4).
 */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem } from '.'
import { branchPool } from '../pools'
import { criteriaFor, criterion } from '../targets'

export function poolProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const pools = m.pools ?? []
  // Phase 8a: every drop group of the game and the installed mods; the mod's own rows don't count as "already there"
  const own = ctx.loaded?.sourceId
  const groupRows = new Map<string, { item: string; definedBy: string }[]>()
  for (const r of ctx.index?.dropGroups ?? []) groupRows.set(r.group, [...(groupRows.get(r.group) ?? []), r])
  const ownGroups = new Set(pools.filter((p) => p.use === 'loot' && !p.addsTo).map((p) => p.id))
  const lootRef = (group: string, who: string, ref: Problem['ref'], key: string) => {
    if (!group.trim()) return
    const adder = pools.find((p) => p.id === group && p.use === 'loot' && p.addsTo)
    if (adder) { out.push({ level: 'error', area: 'Loot', ref, message: `${who}: "${group}" is a loot pool that adds to "${adder.addsTo}", not a group of its own: roll "${adder.addsTo}" instead.` }); return }
    if (!ownGroups.has(group) && !(groupRows.get(group)?.length)) out.push({ level: 'warning', area: 'Loot', ref, key, message: `${who}: drop group "${group}" isn't one of the mod's loot tables or a group of the game or an installed mod: it drops nothing.` })
  }
  const ids = new Set<string>()
  for (const p of pools) {
    const ref = { page: 'saga' as const, id: 'pools', sub: p.id }
    if (ids.has(p.id)) out.push({ level: 'error', area: 'Pool', ref, message: `Two pools have the id "${p.id}".` })
    ids.add(p.id)
    const pp = prefixProblem(m.project.prefix, p.id, 'Pool', ref)
    if (pp) out.push(pp)
    if (!p.entries.length) out.push({ level: 'warning', area: 'Pool', ref, key: `poolempty:${p.id}`, message: `Pool "${p.name || p.id}" has no entries: it always gives nothing.` })
    else if (!p.entries.some((e) => e.weight > 0) && !(p.nothing ?? 0)) out.push({ level: 'error', area: 'Pool', ref, message: `Pool "${p.name || p.id}": every weight is 0, so nothing can ever be picked.` })
    const eids = new Set<string>()
    for (const e of p.entries) {
      if (e.id === 'nothing') out.push({ level: 'error', area: 'Pool', ref, message: `Pool "${p.name || p.id}": "nothing" is reserved and can't be an entry's id.` })
      if (eids.has(e.id)) out.push({ level: 'error', area: 'Pool', ref, message: `Pool "${p.name || p.id}": two entries have the id "${e.id}".` })
      eids.add(e.id)
      // Phase 7e: what a loot or encounter pool's entries must be
      if (p.use === 'loot') {
        const known = lootKnown(ctx, e.id)
        if (known === false) out.push({ level: 'warning', area: 'Pool', ref, key: `lootid:${p.id}:${e.id}`, message: `Loot pool "${p.name || p.id}": "${e.id}" isn't a commodity, item_<special item>, wpn_<weapon> or ftr_<wing> the game or the mod knows.` })
        if (e.conditions.length || e.limit) out.push({ level: 'warning', area: 'Pool', ref, key: `lootcond:${p.id}:${e.id}`, message: `Loot pool "${p.name || p.id}": vanilla's drop groups have no conditions or limits; "${e.id}"'s are ignored.` })
      }
      if (p.use === 'encounters' && !m.encounters.some((x) => x.id === e.id)) out.push({ level: 'error', area: 'Pool', ref, message: `Encounter pool "${p.name || p.id}": "${e.id}" isn't one of the mod's encounters.` })
    }
    if (p.use === 'loot' && p.addsTo) {
      const rows = groupRows.get(p.addsTo) ?? []
      if (!rows.length) out.push({ level: 'warning', area: 'Pool', ref, key: `addsto:${p.id}`, message: `Loot pool "${p.name || p.id}" adds to "${p.addsTo}", which no drop_groups.csv of the game or an installed mod defines: it makes a new group of that name instead.` })
      if (p.nothing) out.push({ level: 'warning', area: 'Pool', ref, key: `addsnothing:${p.id}`, message: `Loot pool "${p.name || p.id}": a "nothing" share isn't added to "${p.addsTo}" (it would change the group's own odds for everyone); it is left out.` })
      for (const e of p.entries) {
        const there = rows.filter((r) => r.item === e.id && r.definedBy !== own)
        // checked in game (F7-c, 2026-11-16): two rows for one item in one group don't add up, one wins
        if (there.length) out.push({ level: 'warning', area: 'Pool', ref, key: `addsdup:${p.id}:${e.id}`, message: `Loot pool "${p.name || p.id}": "${p.addsTo}" already has "${e.id}" (${there.map((r) => r.definedBy === 'starsector-core' ? 'vanilla' : r.definedBy).join(', ')}). The rows don't add up: only one weight counts, so this row may replace the other (or be replaced, by load order).` })
      }
    }
    if (p.use === 'encounters' && !p.points?.length) out.push({ level: 'warning', area: 'Pool', ref, key: `encpts:${p.id}`, message: `Encounter pool "${p.name || p.id}" has no encounter points (slipstream, outside a system): it never fires.` })
    if (p.use === 'encounters' && (p.frequency ?? 10) <= 0) out.push({ level: 'warning', area: 'Pool', ref, key: `encfreq:${p.id}`, message: `Encounter pool "${p.name || p.id}" has frequency 0: it never fires.` })
  }
  for (const q of m.quests) for (const n of q.nodes) {
    if (n.type !== 'branch' || !n.random) continue
    const ref = { page: 'quests' as const, id: q.id, sub: n.id }
    const label = `${q.title} › ${n.title || n.id}`
    if (n.random.pool) {
      const p = pools.find((x) => x.id === n.random!.pool)
      if (!p) continue // the compiler reports a missing pool
      if (p.use && p.use !== 'branch') { out.push({ level: 'error', area: 'Quest', ref, message: `${label}: pool "${p.name || p.id}" is a ${p.use === 'loot' ? 'loot table (a drop group)' : 'random encounter pool'}, not for Random branches.` }); continue }
      const want = p.entries.map((e) => e.id).join(',')
      const have = n.cases.map((c) => c.id).join(',')
      if (want !== have) out.push({ level: 'warning', area: 'Quest', ref, key: `poolcases:${q.id}:${n.id}`, message: `${label}: its cases don't match pool "${p.name || p.id}" any more (entries added, removed or renamed). A pick with no case stops the conversation: use Update cases on the branch.` })
    } else {
      const p = branchPool(q, n, pools)
      if (p && ids.has(p.id)) out.push({ level: 'error', area: 'Quest', ref, message: `${label}: its own pool's id "${p.id}" is also a named pool's id.` })
      if (p && !p.entries.some((e) => e.weight > 0) && !(p.nothing ?? 0)) out.push({ level: 'error', area: 'Quest', ref, message: `${label}: every weight is 0, so the roll always gives nothing.` })
    }
  }
  // Phase 7e (RC-F7): salvage loot and defenders on the mod's entities
  for (const sys of m.systems) for (const e of sys.entities) {
    const ref = { page: 'locations' as const, id: sys.id, sub: e.id }
    for (const l of e.loot ?? []) {
      if (!l.group.trim()) out.push({ level: 'error', area: 'Location', ref, message: `${e.name}: a loot row has no drop group.` })
      else lootRef(l.group, `${e.name}`, ref, `lootgroup:${e.id}:${l.group}`)
      if (!(l.chances ?? 0) && !(l.value ?? 0)) out.push({ level: 'error', area: 'Location', ref, message: `${e.name}: loot "${l.group}" needs chances or a value.` })
    }
    if (e.defenders && !ctx.index.factions.some((f) => f.id === e.defenders!.faction) && !m.factions.some((f) => f.id === e.defenders!.faction)) out.push({ level: 'error', area: 'Location', ref, message: `${e.name}: defenders' faction "${e.defenders.faction}" doesn't exist.` })
    if (e.defenders && e.defenders.minStr > e.defenders.maxStr) out.push({ level: 'warning', area: 'Location', ref, key: `defstr:${e.id}`, message: `${e.name}: the defenders' minimum strength is above the maximum.` })
    if ((e.loot?.length || e.defenders) && e.market) out.push({ level: 'warning', area: 'Location', ref, key: `lootmarket:${e.id}`, message: `${e.name}: loot and defenders are for salvage (derelicts, caches, stations without a colony); a colony has neither.` })
  }
  // Phase 8a (F7-b): rewards that roll drop groups
  for (const q of m.quests) for (const r of q.rewards) for (const l of r.loot ?? []) {
    const ref = { page: 'quests' as const, id: q.id }
    if (!l.group.trim()) { out.push({ level: 'error', area: 'Quest', ref, message: `${q.title}: reward "${r.id}" has random items without a drop group.` }); continue }
    if (!(l.chances ?? 0) && !(l.value ?? 0)) out.push({ level: 'error', area: 'Quest', ref, message: `${q.title}: reward "${r.id}": random items from "${l.group}" need rolls or a value.` })
    lootRef(l.group, `${q.title}: reward "${r.id}"`, ref, `rewardloot:${q.id}:${r.id}:${l.group}`)
  }
  // Phase 7e (RC-R10): scatter at new game
  const scIds = new Set<string>()
  for (const sc of m.scatter ?? []) {
    const ref = { page: 'saga' as const, id: 'scatter', sub: sc.id }
    if (scIds.has(sc.id)) out.push({ level: 'error', area: 'Scatter', ref, message: `Two scatters have the id "${sc.id}".` })
    scIds.add(sc.id)
    const pp = prefixProblem(m.project.prefix, sc.id, 'Scatter', ref)
    if (pp) out.push(pp)
    if (!(sc.count >= 1)) out.push({ level: 'error', area: 'Scatter', ref, message: `Scatter "${sc.name}": place at least 1.` })
    if (!sc.entity.type.trim()) out.push({ level: 'error', area: 'Scatter', ref, message: `Scatter "${sc.name}": pick a custom entity type (supply_cache, derelict_probe, …).` })
    else if (!ctx.index.customEntityTypes.some((t) => t.id === sc.entity.type) && !m.types?.entities.some((t) => t.id === sc.entity.type)) out.push({ level: 'error', area: 'Scatter', ref, message: `Scatter "${sc.name}": unknown custom entity type "${sc.entity.type}".` })
    const fits = new Set(criteriaFor(sc.target.pick).map((c) => c.id))
    for (const c of [...sc.target.require, ...sc.target.prefer]) if (!fits.has(c.id)) out.push({ level: 'error', area: 'Scatter', ref, message: `Scatter "${sc.name}": "${criterion(c.id)?.label ?? c.id}" doesn't narrow a ${sc.target.pick} pick.` })
    if (!sc.target.require.length && !sc.target.prefer.length) out.push({ level: 'warning', area: 'Scatter', ref, key: `scany:${sc.id}`, message: `Scatter "${sc.name}" has no criteria: any ${sc.target.pick} in the sector, the core worlds too. Add some (e.g. unexplored systems, the fringe).` })
    if (sc.from && !m.systems.some((sy) => sy.entities.some((e) => e.id === sc.from || e.market?.id === sc.from)) && !ctx.index.markets.some((x) => x.id === sc.from || x.entities.includes(sc.from!))) out.push({ level: 'warning', area: 'Scatter', ref, key: `scfrom:${sc.id}`, message: `Scatter "${sc.name}": "${sc.from}" isn't a place Saga Forge knows; if the game doesn't have it, distances are measured from the player.` })
    for (const l of sc.loot ?? []) lootRef(l.group, `Scatter "${sc.name}"`, ref, `lootgroup:${sc.id}:${l.group}`)
    for (const l of sc.loot ?? []) if (!(l.chances ?? 0) && !(l.value ?? 0)) out.push({ level: 'error', area: 'Scatter', ref, message: `Scatter "${sc.name}": loot "${l.group}" needs chances or a value.` })
  }
  return out
}

/** A loot entry id: true = known, false = unknown, null = can't tell (vanilla's filter syntax, nothing). */
function lootKnown(ctx: CheckContext, id: string): boolean | null {
  if (id.includes(':') || id.includes('{')) return null
  const m = ctx.model
  const has = (l: { id: string }[] | undefined, x: string) => !!l?.some((i) => i.id === x)
  if (id.startsWith('item_')) return has(ctx.index.items, id.slice(5)) || has(m.items, id.slice(5))
  if (id.startsWith('wpn_')) return has(ctx.index.weapons, id.slice(4))
  if (id.startsWith('ftr_')) return has(ctx.index.wings, id.slice(4))
  return has(ctx.index.items, id) || has(m.items, id)
}
