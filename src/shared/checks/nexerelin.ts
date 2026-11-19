/**
 * #61 (PLAN.md §10.3): markets changing owner:
 *  - "If a market of this quest changes owner" with nothing to watch;
 *  - with Nexerelin in the mod's list (Saga › Mods): a quest contact whose post Nexerelin re-flags
 *    when it captures the market.
 */
import type { Problem, ProblemFix } from '../api'
import type { CheckContext } from './index'
import { nexListed } from '../modlist'
import { INVASION_POSTS, POST_NAMES, marketOf, questWatch } from '../nexerelin'
import { NEX_PLAYER, NEX_FIELDS, NEX_START_FLEETS, NEX_TRAIT_CLASHES, NEX_TRAITS, hasStartFleet, nexBool, nexRelationPairs, startFleets } from '../nexconfig'
import { effectiveConds } from '../moduses'

export function nexerelinProblems(ctx: CheckContext): Problem[] {
  const { model: m, index } = ctx
  const out: Problem[] = []

  // ---- owner changes with nothing to watch
  for (const q of m.quests) {
    if (!q.ownerChange || q.kind !== 'quest') continue
    if (!questWatch(q, m, index).length) out.push({ level: 'info', area: 'Quest', message: `"${q.title}": "If a market of this quest changes owner" is set, but the quest names no market (its contact's market, a stage marker, an Arrive place or a random market target). SagaLib still watches the giver's market of a mission.`, ref: { page: 'quests', id: q.id }, key: `nexwatch:${q.id}` })
  }
  if (!nexListed(m.project)) return [...out, ...nexConfigProblems(ctx)]

  // ---- quest contacts with a post Nexerelin re-flags on capture
  for (const q of m.quests) {
    const s = q.start
    if ((s.kind !== 'contact' && s.kind !== 'bar') || !s.person) continue
    const p = m.people.find((x) => x.id === s.person)
    const vp = p ? null : index.people?.find((x) => x.id === s.person)
    const post = p?.post ?? vp?.post ?? ''
    const marketId = p ? (p.placement.at === 'market' ? p.placement.market : '') : vp?.market ?? ''
    if (!(INVASION_POSTS as readonly string[]).includes(post) || !marketId) continue
    const mk = marketOf(marketId, m, index)
    if (mk?.protect) continue
    const who = p ? `${p.name.first} ${p.name.last}`.trim() || p.id : vp?.name || s.person
    const fixes: ProblemFix[] = mk?.own ? [{ label: 'Protect the market from invasion', action: 'protectInvasion', arg: mk.id }] : []
    out.push({
      level: 'warning', area: 'Nexerelin',
      message: `${who}, the contact of "${q.title}", is the ${POST_NAMES[post] ?? post} at ${mk?.name ?? marketId}. When Nexerelin's invasions capture that market, the new owner's faction takes over this post (administrators, portmasters, supply officers and station, base and outpost commanders), so the contact changes faction too. Give them another post, protect the market from invasion, or plan for it ("If a market of this quest changes owner").`,
      ref: p ? { page: 'people', id: p.id } : { page: 'quests', id: q.id }, fixes, key: `nexpost:${q.id}:${s.person}`
    })
  }

  out.push(...nexConfigProblems(ctx))
  return out
}

/**
 * #63: the Nexerelin faction configs (Factions › Nexerelin):
 *  - a starting faction without ready-made fleets (info: Nexerelin then offers only Custom);
 *  - traits Nexerelin treats as incompatible, unknown traits, a liked and disliked faction;
 *  - relations with mod conditions (they stay SagaLib's, so random relations don't change them);
 *  - fields of the wrong type (Nexerelin's opt* readers then use the default);
 *  - a config of a faction that isn't the mod's own (it is kept, but never exported).
 */
export function nexConfigProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const cfgs = m.nexerelin ?? {}
  // ready-made fleets (Fleets › New-game fleets): variants nobody has
  const vs = new Set((ctx.index.variants ?? []).map((v) => v.id))
  const fleetProblems = (id: string, c: Record<string, unknown>, who: string) => {
    if (!vs.size) return
    for (const [k, list] of Object.entries(startFleets(c))) {
      for (const v of list.flat()) if (!vs.has(v)) out.push({ level: 'warning', area: 'Nexerelin', message: `${who}'s ready-made fleet (${NEX_START_FLEETS.find((t) => t.key === k)?.label ?? k}) names the variant "${v}", which no installed mod or the game has. Nexerelin can't build that ship.`, ref: { page: 'fleets', id: `nex=${id}` }, key: `nexvariant:${id}:${k}:${v}` })
    }
  }
  if (m.nexerelinPlayer) fleetProblems(NEX_PLAYER, m.nexerelinPlayer, 'The player faction')
  if (!Object.keys(cfgs).length) return out
  const own = new Set(m.factions.filter((f) => f.kind === 'addition').map((f) => f.id))
  const eff = effectiveConds(m, ctx.index, ctx.loaded.sourceId)
  for (const [id, c] of Object.entries(cfgs)) {
    const ref = { page: 'factions' as const, id, sub: 'nexerelin' }
    if (!own.has(id)) { out.push({ level: 'warning', area: 'Nexerelin', message: `A Nexerelin config is kept for "${id}", which isn't one of this mod's factions, so it isn't exported (only the mod's own factions get one).`, ref, key: `nexnotown:${id}` }); continue }
    if (nexBool(c, 'startingFaction') && !hasStartFleet(c)) {
      out.push({ level: 'info', area: 'Nexerelin', message: `${id} is a starting faction in Nexerelin's new-game list but has no ready-made fleets: a player who joins it only gets Nexerelin's Custom button (a fleet built from its known ships). Add some under Fleets › New-game fleets if you want preset choices.`, ref: { page: 'fleets', id: `nex=${id}` }, key: `nexnofleet:${id}` })
    }
    fleetProblems(id, c, id)
    const traits = Array.isArray(c.diplomacyTraits) ? c.diplomacyTraits.map(String) : []
    for (const t of traits) if (!NEX_TRAITS.some((x) => x.id === t)) out.push({ level: 'info', area: 'Nexerelin', message: `${id}: "${t}" isn't one of Nexerelin 0.12.2d's diplomacy traits; Nexerelin ignores it.`, ref, key: `nextrait:${id}:${t}` })
    for (const [a, b] of NEX_TRAIT_CLASHES) if (traits.includes(a) && traits.includes(b)) out.push({ level: 'warning', area: 'Nexerelin', message: `${id} has the traits ${a} and ${b}, which contradict each other (Nexerelin never gives them together).`, ref, key: `nexclash:${id}:${a}:${b}` })
    const liked = Array.isArray(c.factionsLiked) ? c.factionsLiked.map(String) : []
    const disliked = Array.isArray(c.factionsDisliked) ? c.factionsDisliked.map(String) : []
    for (const f of liked) if (disliked.includes(f)) out.push({ level: 'warning', area: 'Nexerelin', message: `${id} both likes and dislikes ${f}.`, ref, key: `nexlikes:${id}:${f}` })
    for (const fd of NEX_FIELDS) {
      const v = c[fd.key]
      if (v === undefined) continue
      const bad = fd.kind === 'bool' ? typeof v !== 'boolean' : fd.kind === 'number' ? typeof v !== 'number' : (fd.kind === 'text' || fd.kind === 'longtext') ? typeof v !== 'string' : false
      if (bad) out.push({ level: 'warning', area: 'Nexerelin', message: `${id}: ${fd.label} (${fd.key}) is ${JSON.stringify(v)}, not a ${fd.kind === 'bool' ? 'true/false' : fd.kind === 'number' ? 'number' : 'text'}; Nexerelin then uses its default.`, ref, key: `nextype:${id}:${fd.key}` })
    }
    const stay = nexRelationPairs(m, id, eff).stayWithSagaLib
    if (stay.length) out.push({ level: 'info', area: 'Nexerelin', message: `${id}'s starting relation${stay.length === 1 ? '' : 's'} with ${stay.join(', ')} depend${stay.length === 1 ? 's' : ''} on other mods, so ${stay.length === 1 ? 'it isn\'t' : 'they aren\'t'} in the Nexerelin config: SagaLib sets ${stay.length === 1 ? 'it' : 'them'} after Nexerelin, and random relations don't change ${stay.length === 1 ? 'it' : 'them'}.${nexBool(c, 'startingFaction') ? ` A player who joins ${id} at the start doesn't get ${stay.length === 1 ? 'it' : 'them'}: Nexerelin copies the faction's relations to the player before SagaLib sets ${stay.length === 1 ? 'it' : 'them'}.` : ''}`, ref, key: `nexstay:${id}` })
  }
  return out
}
