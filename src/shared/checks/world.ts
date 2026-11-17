/**
 * SagaLib 1.1 checks (DESIGN-PHASE4.md): objects that appear or disappear during quests and their
 * guardrails, starless systems, planet conditions, player-near encounters, and the mod's own salvage
 * tables (RC-F6).
 */
import type { Problem, ProblemRef } from '../api'
import type { ModModel } from '../serialize'
import type { CheckContext } from './index'
import { parseCsvRecords } from '../csvedit'

/** What in the mod points at an object (to warn before it is removed). */
export function usersOf(m: ModModel, id: string, marketId?: string): string[] {
  const out: string[] = []
  for (const q of m.quests) {
    for (const st of q.stages) if (st.marker === id) out.push(`${q.title} › stage "${st.title}" (map marker)`)
    for (const n of q.nodes) {
      const o = n as unknown as Record<string, unknown>
      if (n.type === 'wait' && o.entity === id) out.push(`${q.title} › ${n.id}`)
      if (n.type === 'dialog' && (n.visual.kind === 'planet' || n.visual.kind === 'mapMarker') && n.visual.entity === id) out.push(`${q.title} › ${n.id} (picture)`)
    }
  }
  for (const e of m.encounters) {
    if (e.spawn.at === id) out.push(`encounter ${e.name} (spawns there)`)
    if (e.travelTo === id) out.push(`encounter ${e.name} (travels there)`)
  }
  if (marketId) for (const p of m.people) if (p.placement.at === 'market' && p.placement.market === marketId) out.push(`${p.name.first} ${p.name.last} (lives at its market)`)
  return out
}

export function worldProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const ownIds = new Set(m.systems.flatMap((s) => s.entities.map((e) => e.id)))
  const gameIds = new Set([...(ctx.index.codeSystems ?? []).flatMap((c) => c.bodies.map((b) => b.id).filter(Boolean)), ...ctx.index.markets.flatMap((x) => x.entities)])
  const questStage = (quest: string | undefined, stage: string | undefined) => {
    const q = m.quests.find((x) => x.id === quest)
    return { q, ok: !!q && !!q.stages.find((s) => s.id === stage) }
  }
  // found in game (2026-11-16): a new system placed on top of a vanilla one (Test Range E at 200
  // units from Mayasura). Vanilla's random systems avoid systems that exist when they are made,
  // but nothing moves a mod's system off a fixed vanilla one; vanilla's closest pair is 3,065 apart.
  const MIN_GAP = 3000
  const placed = [
    ...(ctx.index.systems ?? []).filter((x) => x.x !== null && x.y !== null).map((x) => ({ id: x.id, name: x.name, x: x.x as number, y: x.y as number, own: false })),
    ...m.systems.filter((s) => s.kind === 'new' && s.hyperspace).map((s) => ({ id: s.id, name: s.name, x: s.hyperspace![0], y: s.hyperspace![1], own: true }))
  ]
  // user (2026-11-16): outside the sector's normal area is allowed (modders hide secret places in
  // the dark beyond it), but worth a warning that can be dismissed
  const sw = ctx.index.sectorSize?.[0] ?? 164000
  const sh = ctx.index.sectorSize?.[1] ?? 104000
  for (const s of m.systems) {
    if (s.kind !== 'new' || !s.hyperspace) continue
    const [x, y] = s.hyperspace
    if (Math.abs(x) > sw / 2 || Math.abs(y) > sh / 2) out.push({ level: 'warning', area: 'Location', ref: { page: 'locations', id: s.id }, key: `sysedge:${s.id}`, message: `${s.name} (${x.toLocaleString('en-US')}, ${y.toLocaleString('en-US')}) is outside the sector's normal area (±${(sw / 2).toLocaleString('en-US')} × ±${(sh / 2).toLocaleString('en-US')}): out in the dark beyond the map's edge. Fine for a hidden place; if that's the idea, ignore this with a reason.` })
  }
  for (const s of m.systems) {
    if (s.kind !== 'new' || !s.hyperspace) continue
    const [x, y] = s.hyperspace
    for (const o of placed) {
      if (o.id === s.id || (o.own && o.id < s.id)) continue // each own pair once
      const d = Math.round(Math.hypot(o.x - x, o.y - y))
      if (d < MIN_GAP) out.push({ level: 'warning', area: 'Location', ref: { page: 'locations', id: s.id }, key: `sysclose:${s.id}:${o.id}`, message: `${s.name} is ${d.toLocaleString('en-US')} units from ${o.own ? '' : 'the game\'s '}${o.name} in hyperspace: their stars overlap or crowd each other on the map (vanilla keeps its systems at least 3,000 apart). Move it on the hyperspace map.` })
    }
  }
  for (const s of m.systems) {
    const ref = (sub?: string): ProblemRef => ({ page: 'locations', id: s.id, sub })
    // found in game (2026-11-16): at new game vanilla marks every system with a colony surveyed and its ruins explored
    const colony = s.entities.some((x) => !!x.market)
    for (const e of s.entities) {
      if (colony && !e.market && !e.ruinsUnexplored && e.conditions?.some((c) => /^ruins_/.test(c))) out.push({ level: 'warning', area: 'Location', ref: ref(e.id), key: `ruinscolony:${e.id}`, message: `"${e.name}" has ruins in a system with a colony: at new game vanilla marks such ruins as already explored (and the planet fully surveyed), so "Explore the ruins" never shows there. Tick "Ruins stay unexplored" on the planet (SagaLib 1.2), or put it in a system without a colony.` })
    }
    for (const e of s.entities) {
      if (e.appears && e.appears.quest !== undefined) {
        const { q, ok } = questStage(e.appears.quest, e.appears.stage)
        if (!ok) out.push({ level: 'error', area: 'Location', ref: ref(e.id), message: `"${e.name}" appears ${q ? `at a stage "${q.title}" doesn't have` : 'with a quest that doesn\'t exist'}: pick the quest and stage.` })
      }
      if (e.appears) {
        const focus = s.entities.find((x) => x.id === e.orbit.focus)
        if (focus?.appears && !e.replaces && !(focus.appears.quest === e.appears.quest && focus.appears.stage === e.appears.stage)) out.push({ level: 'warning', area: 'Location', ref: ref(e.id), message: `"${e.name}" orbits "${focus.name}", which also appears later: make sure it is placed first, or "${e.name}" isn't placed.`, key: `appfocus:${e.id}` })
      }
      if (e.replaces && !ownIds.has(e.replaces) && !gameIds.has(e.replaces)) out.push({ level: 'warning', area: 'Location', ref: ref(e.id), message: `"${e.name}" replaces "${e.replaces}", which isn't an object of this mod or a known vanilla one.`, key: `replaces:${e.id}` })
      if (e.conditions?.length && e.market) out.push({ level: 'info', area: 'Location', ref: ref(e.id), message: `"${e.name}" has a market: its own conditions list is used, not the uncolonised planet's.`, key: `condmarket:${e.id}` })
    }
    for (const r of s.removals ?? []) {
      if (!r.target) { out.push({ level: 'error', area: 'Location', ref: ref(), message: `${s.name}: a removal has no object.` }); continue }
      const { q, ok } = questStage(r.quest, r.stage)
      if (!ok) out.push({ level: 'error', area: 'Location', ref: ref(), message: `${s.name}: the removal of "${r.target}" ${q ? `needs a stage of "${q.title}"` : 'needs a quest'}.` })
      const own = ownIds.has(r.target)
      const mk = ctx.index.markets.find((x) => x.entities.includes(r.target))
      if (!own) out.push({ level: 'warning', area: 'Location', ref: ref(), key: `removevanilla:${r.target}`, message: `${s.name}: removing "${r.target}"${mk ? ` (${mk.name})` : ''}, an object of ${gameIds.has(r.target) ? 'the game or another mod' : 'unknown origin'}. Vanilla's or other mods' content may depend on it (missions, events, markets), and the change is permanent in the save.` })
      if (mk && r.market !== 'decivilize') out.push({ level: 'warning', area: 'Location', ref: ref(), key: `removemarket:${r.target}`, message: `${s.name}: "${r.target}" has the market ${mk.name}; SagaLib won't remove it unless "Its market" is decivilize.` })
      const ownEnt = s.entities.find((x) => x.id === r.target) ?? m.systems.flatMap((x) => x.entities).find((x) => x.id === r.target)
      const users = usersOf(m, r.target, ownEnt?.market?.id ?? mk?.id)
      if (users.length) out.push({ level: 'warning', area: 'Location', ref: ref(), key: `removeusers:${r.target}`, message: `"${r.target}" is removed when ${q?.title ?? 'its quest'} reaches "${r.stage}", but is still used by: ${users.slice(0, 4).join('; ')}${users.length > 4 ? '; …' : ''}. Make sure those come before the removal.` })
    }
  }
  // Action steps that remove objects: the same guardrail for vanilla's
  for (const q of m.quests) for (const n of q.nodes) {
    if (n.type !== 'action') continue
    for (const op of n.ops) {
      if (op.op === 'placeEntity' && op.entity && !m.systems.some((s) => s.entities.some((e) => e.id === op.entity && e.appears))) out.push({ level: 'error', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, message: `${q.title} › ${n.id}: "${op.entity}" isn't an object that appears later (Locations › Appears).` })
      if (op.op === 'removeEntity' && op.entity && !ownIds.has(op.entity)) out.push({ level: 'warning', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id }, key: `removevanilla-op:${q.id}:${op.entity}`, message: `${q.title} › ${n.id} removes "${op.entity}", an object of the game or another mod: their content may depend on it, and it is permanent in the save.` })
    }
  }
  // walk W4: an arrival tests the object's own id ($id), so a market id there never matches
  const marketHost = new Map<string, string>()
  for (const s of m.systems) for (const e of s.entities) if (e.market?.id && e.market.id !== e.id) marketHost.set(e.market.id, e.id)
  for (const mk of ctx.index.markets) if (mk.entities.length && !mk.entities.includes(mk.id)) marketHost.set(mk.id, mk.entities[0])
  for (const q of m.quests) for (const n of q.nodes) {
    if (n.type !== 'wait' || n.mode !== 'arrive' || !n.entity) continue
    const host = marketHost.get(n.entity)
    if (!host || ownIds.has(n.entity) || gameIds.has(n.entity)) continue
    out.push({
      level: 'error', area: 'Quest', ref: { page: 'quests', id: q.id, sub: n.id },
      message: `${q.title} › ${n.id}: "${n.entity}" is a market's id, but an arrival waits for the object the player visits, whose id is "${host}". As it is, the arrival never happens in game.`,
      fixes: [{ label: `Use "${host}"`, action: 'arrivePlace', arg: { quest: q.id, node: n.id, entity: host } }]
    })
  }
  for (const e of m.encounters) if (e.spawn.when === 'player-near' && (e.spawn.range ?? 0) < 0) out.push({ level: 'error', area: 'Encounter', ref: { page: 'encounters', id: e.id }, message: `${e.name}: the range can't be negative.` })

  // RC-F6: the mod's own salvage tables must keep vanilla's columns
  const HEADERS: Record<string, string[]> = {
    'data/campaign/procgen/drop_groups.csv': ['commodity', 'group', 'freq'],
    'data/campaign/procgen/salvage_entity_gen_data.csv': ['id', 'rating', 'detection_range', 'type', 'autoXP', 'xpDiscover', 'xpSalvage', 'tags', 'drop_value', 'drop_random', 'defFaction', 'defQuality', 'probDefenders', 'minStr', 'maxStr', 'minSize', 'maxSize', 'probStation', 'stationRole']
  }
  for (const [path, want] of Object.entries(HEADERS)) {
    const text = ctx.loaded.files[path]?.text
    if (!text) continue
    const head = (parseCsvRecords(text)[0]?.fields ?? []).map((h) => h.trim())
    const missing = want.filter((c) => !head.includes(c))
    if (missing.length) out.push({ level: 'error', area: 'Salvage', file: path, message: `${path} lacks vanilla's column${missing.length === 1 ? '' : 's'} ${missing.join(', ')}: the game merges it by column name, so those rows lose them.` })
  }
  return out
}
