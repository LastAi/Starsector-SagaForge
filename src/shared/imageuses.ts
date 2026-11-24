/**
 * #67 U38 (user, 2026-11-22): where an image of the mod is used, so deleting it can warn first.
 * Looks for the image's path (or, for an illustration, its key) in every part of the mod's plan.
 */
import type { ModModel } from './serialize'

const PART: Record<string, string> = {
  quests: 'Quest', people: 'Person', items: 'Item', systems: 'System', encounters: 'Encounter', factions: 'Faction',
  types: 'Locations › types', fleets: 'Fleets', pools: 'Saga › Pools', events: 'Saga › Events', progress: 'Saga › Progress',
  scatter: 'Saga › Scatter', bounties: 'Bounty', research: 'Saga › Research', descriptions: 'Descriptions', factionsRuntime: 'Factions'
}

const label = (x: Record<string, unknown>): string => {
  const n = x.name
  const name = n && typeof n === 'object' ? [(n as { first?: string }).first, (n as { last?: string }).last].filter(Boolean).join(' ') : n
  return String(name || x.title || x.id || x.factionId || '')
}

/** "Person "John Starsector"", "Quest "The Other Captain"", … for every part that names the image. */
export function imageUses(m: ModModel, path: string): string[] {
  const out: string[] = []
  const ill = Object.entries(m.project.illustrations ?? {}).find(([, p]) => p === path)?.[0]
  const needles = [JSON.stringify(path), ...(ill ? [JSON.stringify(ill)] : [])]
  const has = (x: unknown) => { const s = JSON.stringify(x) ?? ''; return needles.some((n) => s.includes(n)) }
  for (const [k, v] of Object.entries(m)) {
    if (k === 'project' || v == null) continue
    const what = PART[k] ?? k
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === 'object' && has(x)) out.push(`${what} "${label(x as Record<string, unknown>)}"`) }
    else if (has(v)) out.push(what)
  }
  // the mod's own settings (mod icon, achievements, …), not its list of illustrations or image groups
  const { illustrations: _i, imageGroups: _g, ...rest } = m.project as unknown as Record<string, unknown>
  if (has(rest)) out.push('Saga (mod icon, achievements or settings)')
  return [...new Set(out)]
}
