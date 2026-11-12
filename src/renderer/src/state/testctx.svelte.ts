/** The Test context shared by the dialog previews and Play mode, plus lookups into the index and the mod. */
import { defaultTestContext, contextFrom, type Lookup, type TestContext } from '../../../shared/rules/context'
import type { PlayContext } from '../../../shared/rules/engine'
import type { PersonLook } from '../dialog/DialogPreview.svelte'
import { app } from './app.svelte'
import { project } from './project.svelte'

const KEY = 'sf.testctx'

function load(): TestContext {
  try { return { ...defaultTestContext(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return defaultTestContext() }
}

export const testCtx = $state<TestContext>(load())

export function saveTestCtx(): void {
  try { localStorage.setItem(KEY, JSON.stringify(testCtx)) } catch { /* ignore */ }
}

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase())

/** Faction display data from the mod's own factions first, then the index. */
export function factionLook(id: string): { name: string; withArticle: string; long: string; color?: number[]; crest?: string } | null {
  const own = project.m?.factions.find((f) => f.id === id && f.kind === 'addition')
  if (own && own.kind === 'addition') {
    const r = own.raw
    return { name: String(r.displayName ?? id), withArticle: String(r.displayNameWithArticle ?? ''), long: String(r.displayNameLong ?? ''), color: r.color as number[], crest: String(r.crest ?? '') }
  }
  const f = app.index?.factions.find((x) => x.id === id)
  return f ? { name: f.name, withArticle: `the ${f.name}`, long: f.name, color: f.color ?? undefined, crest: f.crest } : null
}

export const lookup: Lookup = {
  person(id) {
    const p = project.m?.people.find((x) => x.id === id)
    if (p) {
      const rank = app.defs.ranks.find((r) => r.id === p.rank)?.name ?? p.rank
      const post = app.defs.posts.find((r) => r.id === p.post)?.name ?? p.post
      return { first: p.name.first, last: p.name.last, gender: p.gender, rank, post, faction: p.faction }
    }
    const ip = app.index?.people.find((x) => x.id === id)
    if (ip) {
      const [first, ...rest] = ip.name.split(' ')
      return { first, last: rest.join(' '), gender: 'ANY', rank: '', post: '', faction: ip.faction }
    }
    return null
  },
  faction: (id) => factionLook(id),
  market(id) {
    const m = app.index?.markets.find((x) => x.id === id)
    if (m) return { name: m.name, faction: m.faction }
    for (const s of project.m?.systems ?? []) for (const e of s.entities) if (e.market?.id === id || e.id === id) return { name: e.market?.name ?? e.name, faction: e.market?.faction ?? '' }
    return null
  }
}

/** How a person looks on the visual panel. */
export function personLook(id: string): PersonLook | null {
  const realId = id === '$person' || id.startsWith('$') ? testCtx.person : id
  if (!realId) return { name: '(the person you talk to)', rank: '', faction: '', portrait: '' }
  const p = project.m?.people.find((x) => x.id === realId)
  const l = lookup.person(realId)
  if (!l) return { name: titleCase(realId), rank: '', faction: '', portrait: '' }
  const f = factionLook(l.faction)
  return {
    name: `${l.first} ${l.last}`.trim(),
    rank: [l.rank, l.post].filter(Boolean).join(' · '),
    faction: f?.name ?? l.faction,
    factionColor: f?.color,
    crest: f?.crest,
    portrait: p?.portrait ?? app.index?.people.find((x) => x.id === realId)?.portrait ?? ''
  }
}

export function itemIcon(id: string): string | null {
  const own = project.m?.items.find((i) => i.id === id)
  if (own) return own.icon
  if (id === 'credits') return 'graphics/icons/cargo/credits.png'
  return app.index?.items.find((i) => i.id === id)?.icon ?? null
}

export function illustrationPath(category: string, key: string): string | null {
  const own = project.m?.project.illustrations?.[key]
  if (own && category === 'illustrations') return own
  return app.index?.illustrations.find((i) => i.category === category && i.key === key)?.path ?? null
}

export function itemName(id: string): string {
  return project.m?.items.find((i) => i.id === id)?.name ?? app.index?.items.find((i) => i.id === id)?.name ?? id
}

export function makePlayContext(): PlayContext {
  return contextFrom($state.snapshot(testCtx) as TestContext, app.defs, lookup)
}
