/**
 * Random pools (Phase 7a, DESIGN-PHASE7.md; RANDOM-CONTENT-ASSESSMENT.md §6): the runtime JSON
 * SagaLib reads (data/sagaforge/pools/<id>.json) and Play mode's copy of SagaLib's
 * core/Pools.roll, picking the same entry from the same seed (golden case pools.json).
 */
import type { BranchNode, PoolEntryPlan, PoolPlan, QuestPlan } from './model'
import { JavaRandom, drawSeed } from './javarandom'

export const NOTHING = 'nothing'
export const PICK_KEY = '$sagaforge_pick'
export const SEED_KEY = '$global.sagaforge_seed'
export const DAYS_KEY = '$global.sagaforge_days'

const k = (scope: string, pool: string, rest: string) => `${scope}sagaforge_pool_${pool}_${rest}`
export const countKey = (pool: string, entry: string) => k('$global.', pool, `${entry}_count`)
export const doneKey = (pool: string, entry: string) => k('$entity.', pool, `${entry}_done`)
export const dayKey = (pool: string, entry: string) => k('$global.', pool, `${entry}_day`)
export const lastKey = (pool: string) => k('$global.', pool, 'last')
export const drawsKey = (pool: string, object: boolean) => k(object ? '$entity.' : '$global.', pool, 'draws')
export const forceKey = (pool: string) => k('$global.', pool, 'force')

/** The pool a Random branch rolls: a named pool, or its own cases (id <quest>_<node>). */
export function branchPool(q: QuestPlan, n: BranchNode, pools: PoolPlan[]): PoolPlan | null {
  if (!n.random) return null
  if (n.random.pool) return pools.find((p) => p.id === n.random!.pool) ?? null
  return {
    id: `${q.id}_${n.id}`, name: n.title || n.id, draw: 'pickOne', nothing: n.random.nothing ?? 0,
    entries: n.cases.map((c): PoolEntryPlan => ({ id: c.id, label: c.label, weight: c.weight ?? 1, conditions: c.conditions, limit: c.limit }))
  }
}

/** The JSON SagaLib reads. */
export function runtimePool(p: PoolPlan): Record<string, unknown> {
  return {
    format: 1, id: p.id, draw: p.draw, nothing: p.nothing ?? 0,
    // Phase 7e: random encounters at vanilla's encounter points
    ...(p.use === 'encounters' ? { use: 'encounters', points: p.points ?? [], frequency: p.frequency ?? 10 } : {}),
    entries: p.entries.map((e) => {
      const o: Record<string, unknown> = { id: e.id, weight: e.weight, conditions: e.conditions }
      if (e.limit?.once) o.once = e.limit.once
      if (e.limit?.cooldownDays) o.cooldownDays = e.limit.cooldownDays
      if (e.limit?.max) o.max = e.limit.max
      return o
    })
  }
}

/** Each entry's chance if all are eligible, and the nothing share (for the inspector). */
export function chances(p: PoolPlan): { id: string; chance: number }[] {
  const total = p.entries.reduce((s, e) => s + Math.max(0, e.weight), 0) + Math.max(0, p.nothing ?? 0)
  const of = (w: number) => (total > 0 ? Math.max(0, w) / total : 0)
  return [...p.entries.map((e) => ({ id: e.id, chance: of(e.weight) })), ...(p.nothing ? [{ id: NOTHING, chance: of(p.nothing) }] : [])]
}

export interface PoolMemory { get(key: string): unknown; set(key: string, v: unknown): void }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0 }
const truthy = (v: unknown) => !(v === undefined || v === null || v === false || v === 0 || v === '' || v === 'false')

/** SagaLib's Pools.eligible. */
export function eligible(p: PoolPlan, e: PoolEntryPlan, mem: PoolMemory, cond: ((line: string) => boolean) | null, object: boolean): boolean {
  if (e.weight <= 0) return false
  const count = num(mem.get(countKey(p.id, e.id)))
  const once = e.limit?.once
  if ((once === 'playthrough' || (once === 'object' && !object)) && count >= 1) return false
  if (once === 'object' && object && truthy(mem.get(doneKey(p.id, e.id)))) return false
  if (e.limit?.max && count >= e.limit.max) return false
  if (e.limit?.cooldownDays) {
    const last = mem.get(dayKey(p.id, e.id))
    if (last !== undefined && num(mem.get(DAYS_KEY)) - num(last) < e.limit.cooldownDays) return false
  }
  return !cond || e.conditions.every((c) => cond(c))
}

/** SagaLib's Pools.roll: the pick (an entry id or "nothing"), with the same memory writes. */
export function rollPool(p: PoolPlan, mem: PoolMemory, cond: ((line: string) => boolean) | null, base: bigint, object: boolean, force: string | null): string {
  const dk = drawsKey(p.id, object)
  const draws = num(mem.get(dk))
  let pick = NOTHING
  if (force && (force === NOTHING || p.entries.some((e) => e.id === force))) pick = force
  else {
    const ok = p.entries.map((e) => eligible(p, e, mem, cond, object))
    // float sums, as Java adds floats
    let total = Math.fround(Math.max(0, p.nothing ?? 0))
    p.entries.forEach((e, i) => { if (ok[i]) total = Math.fround(total + Math.fround(e.weight)) })
    if (total > 0) {
      const x = Math.fround(new JavaRandom(drawSeed(base, p.id, draws)).nextFloat() * total)
      let at = 0
      for (let i = 0; i < p.entries.length; i++) {
        if (!ok[i]) continue
        at = Math.fround(at + Math.fround(p.entries[i].weight))
        if (x < at) { pick = p.entries[i].id; break }
      }
    }
  }
  mem.set(dk, draws + 1)
  mem.set(PICK_KEY, pick)
  mem.set(lastKey(p.id), pick)
  if (pick !== NOTHING) {
    const ck = countKey(p.id, pick)
    mem.set(ck, num(mem.get(ck)) + 1)
    if (object) mem.set(doneKey(p.id, pick), true)
    mem.set(dayKey(p.id, pick), num(mem.get(DAYS_KEY)))
  }
  return pick
}

/** A seed from memory (a number or numeric text), or null. */
export function seedOf(v: unknown): bigint | null {
  if (v === undefined || v === null || v === '') return null
  try { return BigInt(typeof v === 'number' ? Math.trunc(v) : String(v).trim()) } catch { return null }
}

/**
 * Phase 8a: the drop groups a loot row or reward can roll: the mod's own loot tables (a pool that
 * adds to another group is not a group itself) and every group of the game and the installed mods.
 */
export function dropGroupChoices(pools: PoolPlan[], index: { dropGroups?: { group: string; item: string; definedBy: string }[] } | null): { id: string; name: string }[] {
  const own = pools.filter((p) => p.use === 'loot' && !p.addsTo).map((p) => ({ id: p.id, name: p.name }))
  const counts = new Map<string, { n: number; core: boolean }>()
  for (const r of index?.dropGroups ?? []) { const c = counts.get(r.group) ?? { n: 0, core: false }; c.n++; if (r.definedBy === 'starsector-core') c.core = true; counts.set(r.group, c) }
  const others = [...counts.entries()].filter(([g]) => !own.some((o) => o.id === g)).sort((a, b) => a[0].localeCompare(b[0])).map(([g, c]) => ({ id: g, name: `${c.core ? 'vanilla' : 'a mod'}, ${c.n} row${c.n === 1 ? '' : 's'}` }))
  return [...own, ...others]
}
