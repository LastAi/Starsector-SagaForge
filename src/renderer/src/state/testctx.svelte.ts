/** The Test context shared by the dialog previews and Play mode, plus lookups into the index and the mod. */
import { defaultTestContext, contextFrom, type Lookup, type TestContext } from '../../../shared/rules/context'
import { mods } from './mods.svelte'
import { factionColor } from '../../../shared/modlist'
import type { PlayContext } from '../../../shared/rules/engine'
import type { PersonLook } from '../dialog/DialogPreview.svelte'
import { app } from './app.svelte'
import { project } from './project.svelte'
import { resolveItem } from '../../../shared/itemversions'
import type { PersonDef } from '../../../shared/model'
import { repLevelId } from '../../../shared/replevels'
import { settingsMemory, settingTokensOn } from '../../../shared/settings'
import { fullName, splitIndexName, storedName } from '../../../shared/personname'

/**
 * #64: what Play mode and the Test context count for versions: the optional mods' switches, and
 * (#67 U18) the Test context's values of the settings marked for versions, as SagaLib records them
 * when the game starts (Play's own setting controls, LunaLib's menu mid-game, don't change them).
 */
export function playVersionOn(): string[] {
  return [...mods.playMods(), ...settingTokensOn(project.m?.project.settings, testCtx.settings ?? {}, testCtx.playerGender)]
}

/** #64: a person of the mod in the version the optional mods' switches (and #67 U18 the settings) pick (Test context, Play mode). */
function ownPerson(id: string): PersonDef | undefined {
  const p = project.m?.people.find((x) => x.id === id)
  return p?.versions?.length ? resolveItem(p, playVersionOn()).value : p
}

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
  // #67: the colour of the sources that count for the active mod, not every installed mod's patch
  return f ? { name: f.name, withArticle: `the ${f.name}`, long: f.name, color: factionColor(f, mods.visible) ?? undefined, crest: f.crest } : null
}

export const lookup: Lookup = {
  person(id) {
    const p = ownPerson(id)
    if (p) {
      const rank = app.defs.ranks.find((r) => r.id === p.rank)?.name ?? p.rank
      const post = app.defs.posts.find((r) => r.id === p.post)?.name ?? p.post
      // #79: as exported (a one-name person: first "", the one name last)
      const n = storedName(p)
      return { first: n.first, last: n.last, gender: p.gender, rank, post, faction: p.faction }
    }
    const ip = app.index?.people.find((x) => x.id === id)
    if (ip) {
      // #79: another mod's person with one word for a name is a one-name person
      const n = splitIndexName(ip.name)
      return { first: n.first, last: n.last, gender: 'ANY', rank: '', post: '', faction: ip.faction }
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
  const p = ownPerson(realId)
  const l = lookup.person(realId)
  if (!l) return { name: titleCase(realId), rank: '', faction: '', portrait: '' }
  const f = factionLook(l.faction)
  return {
    name: fullName(l),
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

/** #75: a commodity as a commodity target needs it (the mod's own, else the game index); undefined when unknown. */
export function commodityInfo(id: string): { id: string; name: string; econUnit: number; basePrice: number } | undefined {
  const own = project.m?.items.find((i) => i.id === id && i.kind === 'commodity')
  if (own) return { id, name: own.name.toLowerCase(), econUnit: Number(own.otherColumns?.econUnit) || 1, basePrice: own.basePrice }
  const ix = app.index?.items.find((i) => i.id === id && i.kind === 'commodity')
  return ix ? { id, name: ix.name.toLowerCase(), econUnit: ix.econUnit || 1, basePrice: ix.basePrice } : undefined
}

/** #75: every economy commodity the game index knows (not nonecon, not meta). */
export function economyCommodities(): string[] {
  const ids = new Set<string>()
  for (const i of [...(app.index?.items ?? []), ...(project.m?.items ?? [])]) if (i.kind === 'commodity' && !i.tags.includes('nonecon') && !i.tags.includes('meta')) ids.add(i.id)
  return [...ids]
}

export function makePlayContext(): PlayContext {
  const ctx = contextFrom($state.snapshot(testCtx) as TestContext, app.defs, lookup)
  // #60: the optional mods' switches (Test context, Play mode)
  ctx.mods = mods.playEnabled()
  // #70: SF_FactionRep reads the mod's starting relations
  ctx.relation = editorRelation
  // #70: a person with a presence rule who isn't switched to away is present
  // #62: the mod's settings as SagaLib sets them on load: the Test context's values, else the defaults (a Memory entry wins)
  for (const [k, v] of settingsMemory(project.m?.project.settings ?? [], testCtx.settings ?? {})) if (!ctx.memory.has(k)) ctx.memory.set(k, v)
  for (const p of project.m?.people ?? []) if (p.presence && !testCtx.away?.includes(p.id) && !ctx.memory.has(`$global.sagaforge_away_${p.id}`)) ctx.memory.set(`$global.sagaforge_away_${p.id}`, false)
  return ctx
}

/**
 * #70: faction A's relation with B as a level, from the mod's starting relations (Factions page),
 * either way round; undefined when the mod doesn't set it (vanilla sets most in code, so Play asks).
 */
export function editorRelation(a: string, b: string): string | undefined {
  if (a === b) return 'COOPERATIVE'
  const fr = project.m?.factionsRuntime.relations
  const v = fr?.[a]?.[b] ?? fr?.[b]?.[a]
  return v === undefined ? undefined : repLevelId(v, app.defs.repLevels)
}
