/**
 * #61 (PLAN.md §10.3): Nexerelin without a bridge. Which of a quest's markets SagaLib watches for
 * an owner change ("ownerChange") and the posts
 * Nexerelin re-flags when it captures a market. Pure.
 */
import type { GameIndex } from './api'
import type { ModModel } from './serialize'
import type { QuestPlan } from './model'
import { targetKey, targetPartKey, targetVarOf } from './targets'

/** FORMATS.md "Nexerelin 0.12.2d": SectorManager.POSTS_TO_CHANGE_ON_CAPTURE (vanilla Ranks ids). */
export const INVASION_POSTS = ['baseCommander', 'outpostCommander', 'stationCommander', 'portmaster', 'supplyOfficer', 'administrator'] as const
export const POST_NAMES: Record<string, string> = { baseCommander: 'base commander', outpostCommander: 'outpost commander', stationCommander: 'station commander', portmaster: 'portmaster', supplyOfficer: 'supply officer', administrator: 'administrator' }

/** The trigger SagaLib fires after "go to a stage" (the rule runs what follows that Stage node). */
export const ownerChangeTrigger = (q: string) => `${q}_ownerChanged`
export const ownerChangedKey = (q: string) => `$global.${q}_ownerChanged`
export const newOwnerKey = (q: string) => `$global.${q}_newOwner`

const isFixed = (id: string | undefined): id is string => !!id && !targetVarOf(id) && !id.startsWith('place:')

/** The market of an id (an entity with a market, or a market id), from the mod's own systems and the index; null = not a market. */
export function marketOf(id: string, m: ModModel, index: GameIndex | null): { id: string; name: string; faction: string; size: number; own: boolean; protect: boolean } | null {
  for (const s of m.systems) for (const e of s.entities) if (e.id === id && e.market) return { id: e.id, name: e.market.name || e.name || e.id, faction: e.market.faction, size: e.market.size, own: true, protect: !!e.market.protectFromInvasion }
  const mk = index?.markets?.find((x) => x.id === id || x.entities?.includes(id))
  return mk ? { id: mk.id, name: mk.name, faction: mk.faction, size: mk.size, own: false, protect: false } : null
}

/** The contact's market (the giver's), from the mod's person or the index. */
export function contactMarket(q: QuestPlan, m: ModModel, index: GameIndex | null): string | null {
  const s = q.start
  if ((s.kind !== 'contact' && s.kind !== 'bar') || !s.person) return null
  const p = m.people.find((x) => x.id === s.person)
  if (p) return p.placement.at === 'market' ? p.placement.market || null : null
  return index?.people?.find((x) => x.id === s.person)?.market || null
}

/**
 * The quest's markets SagaLib watches for an owner change: the giver's market, stage markers,
 * Arrive places and named places that are markets, and random targets that pick a market (their
 * memory key; SagaLib reads the picked id). SagaLib adds the giver's market of the running mission.
 */
export function questWatch(q: QuestPlan, m: ModModel, index: GameIndex | null): string[] {
  const out: string[] = []
  const add = (x: string | null | undefined) => { if (x && !out.includes(x)) out.push(x) }
  const fixed = (id: string | undefined) => { if (isFixed(id) && marketOf(id, m, index)) add(id) }
  add(contactMarket(q, m, index))
  for (const st of q.stages) fixed(st.marker)
  for (const n of q.nodes) if (n.type === 'wait' && n.mode === 'arrive') fixed(n.entity)
  for (const pl of q.places ?? []) fixed(pl.entity)
  for (const v of q.variables) if (v.type === 'target' && (v.target?.pick === 'market' || v.target?.pick === 'commodity')) add(targetKey(q.id, v.name))
  // a marker or Arrive at a target's person stands for its market too
  for (const st of q.stages) { const v = targetVarOf(st.marker); if (v && q.variables.some((x) => x.name === v && (x.target?.pick === 'market' || x.target?.pick === 'commodity'))) add(targetPartKey(q.id, v, '')) }
  return out
}

/** The quest JSON's "ownerChange" (SagaLib 1.3), or nothing when the quest doesn't watch its markets. */
export function ownerChangeJson(q: QuestPlan, m: ModModel, index: GameIndex | null): Record<string, unknown> | null {
  const oc = q.ownerChange
  if (!oc) return null
  const markets = questWatch(q, m, index)
  const stage = oc.do === 'stage' ? oc.stage ?? '' : ''
  const node = stage ? q.nodes.find((n) => n.type === 'stage' && n.stage === stage) : undefined
  return { do: oc.do, ...(stage ? { stage } : {}), ...(node && q.edges.some((e) => e.from === node.id) ? { trigger: ownerChangeTrigger(q.id) } : {}), markets }
}
