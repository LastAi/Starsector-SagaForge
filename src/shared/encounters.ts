/** Encounters (PLAN.md §4.6): fleets spawned by a quest stage or at a location, with their comm dialog. */
import { PLAN_FORMAT, type EncounterDef, type QuestPlan, type ActionOp, type FleetTemplateDef } from './model'

/**
 * #67 U42 (user, 2026-11-22): an encounter's fleet as it is used. The Ships choice decides which
 * fields count: a named fleet brings its own faction, type, ships, quality and captain (the
 * encounter's hidden faction, type, points, variants… are kept for switching back, never used);
 * fleet points and exact ships use only their own fields. Checks, export, mod uses and the lists
 * read this, never the raw fleet.
 */
export function effectiveFleet(e: EncounterDef, m: { fleets?: { templates: FleetTemplateDef[] } }): EncounterDef['fleet'] {
  const f = e.fleet
  const common = { ...(f.extras?.length ? { extras: f.extras } : {}) }
  if (f.size === 'template') {
    const t = m.fleets?.templates.find((x) => x.id === f.template)
    return {
      faction: t?.faction ?? '', type: t?.fleetType ?? '', size: 'template', template: f.template,
      variants: t?.ships.map((s) => s.variant).filter(Boolean) ?? [],
      ...(t?.quality !== undefined ? { quality: t.quality } : {}), ...(t?.captain ? { flagshipCommander: t.captain } : {}), ...(t?.name ? { name: t.name } : {}),
      ...((f.randomPoints ?? 0) > 0 ? { randomPoints: f.randomPoints } : {}), ...common
    }
  }
  // the fields this choice uses, in their own order (exported files stay as they were)
  const allow = new Set(f.size === 'fp' ? ['faction', 'type', 'size', 'points', 'quality', 'flagshipCommander', 'name', 'sizeScale', 'extras']
    : ['faction', 'type', 'size', 'points', 'variants', 'quality', 'flagshipCommander', 'name', 'extras', ...((f.randomPoints ?? 0) > 0 ? ['randomPoints', 'sizeScale'] : [])])
  const out = Object.fromEntries(Object.entries(f).filter(([k, v]) => allow.has(k) && v !== undefined && !(k === 'extras' && !(v as unknown[]).length) && !(k === 'flagshipCommander' && !v) && !(k === 'name' && !v))) as EncounterDef['fleet']
  if (f.size === 'explicit' && !out.variants) out.variants = []
  return out
}
import type { Problem } from './api'
import type { ModModel } from './serialize'
import type { CheckContext } from './checks'
import { prefixProblem, ID_PATTERN } from './checks'
import { newQuest, startQuestStageProblem } from './quest'
import { EVENT_OPS } from './export/events'
import { encounterPlacementProblems } from './patterns'
import { isTodoActive } from './todo'
import { targetKey, targetVars } from './targets'

export function newEncounter(id: string, name: string, faction: string): EncounterDef {
  return {
    format: PLAN_FORMAT, id, name,
    fleet: { faction, type: 'patrolMedium', size: 'fp', points: 80, quality: 0.5 },
    spawn: { at: '', when: 'quest-stage', despawnOnStageEnd: true },
    behavior: 'ambush', flags: { hostile: true, important: true, allowDisengage: true }, outcomes: {}
  }
}

/** The condition that scopes a comm dialog to this encounter's fleet (FORMAT.md, Encounters). */
export const encounterScope = (id: string) => `$entity.sagaforge_encounter == ${id}`

/** A comm-link greeting for the encounter's fleet, as a conversation plan (edited in the quest editor). */
export function newCommDialog(enc: EncounterDef): QuestPlan {
  const q = newQuest(`${enc.id}_comm`, `${enc.name}: comm link`, 'dialog')
  q.start = { kind: 'trigger', trigger: 'OpenCommLink', conditions: [encounterScope(enc.id)] }
  const offer = q.nodes.find((n) => n.id === 'offer')
  if (offer?.type === 'dialog') {
    offer.title = 'Greeting'
    offer.text = '"You picked the wrong belt to fly through."'
    offer.options = [{ id: 'cut', text: 'Cut the comm link', shortcut: 'ESC' }]
  }
  // vanilla answers its own "cutCommLink" option (hang up), so the option simply is that one
  q.nodes.push({ id: 'cut_link', type: 'link', x: 520, y: 60, mode: 'option', target: 'cutCommLink' })
  q.edges.push({ id: 'e_cut', from: 'offer', handle: 'cut', to: 'cut_link' })
  return q
}

/** Quest nodes that spawn an encounter, and whether their outcomes lead anywhere. */
export function encounterUses(quests: QuestPlan[], id: string): { quest: QuestPlan; node: string; defeated: boolean; avoided: boolean }[] {
  const out: { quest: QuestPlan; node: string; defeated: boolean; avoided: boolean }[] = []
  for (const q of quests) for (const n of q.nodes) {
    if (n.type !== 'encounter' || n.encounter !== id) continue
    out.push({ quest: q, node: n.id, defeated: q.edges.some((e) => e.from === n.id && e.handle === 'defeated'), avoided: q.edges.some((e) => e.from === n.id && e.handle === 'avoided') })
  }
  return out
}

/**
 * #67 U46 (user, 2026-11-24): everything that spawns an encounter: quests' Encounter nodes and
 * "Spawn an encounter" actions, world events, progress stages, other encounters' outcomes, and a
 * quest stage picked on the encounter itself.
 */
export function encounterSpawners(m: Pick<ModModel, 'quests' | 'events' | 'progress' | 'encounters'>, id: string): { label: string; ref: { page: 'quests' | 'saga' | 'encounters'; id: string; sub?: string } }[] {
  const out: { label: string; ref: { page: 'quests' | 'saga' | 'encounters'; id: string; sub?: string } }[] = []
  const spawns = (ops: ActionOp[]) => ops.some((o) => o.op === 'spawn' && o.encounter === id)
  for (const q of m.quests) for (const n of q.nodes) {
    const t = (n as { title?: string }).title || n.id
    if (n.type === 'encounter' && n.encounter === id) out.push({ label: `${q.kind === 'quest' ? 'quest' : 'conversation'} ${q.title} › Encounter node ${t}`, ref: { page: 'quests', id: q.id, sub: n.id } })
    if (n.type === 'action' && spawns(n.ops)) out.push({ label: `${q.kind === 'quest' ? 'quest' : 'conversation'} ${q.title} › ${t} (Spawn an encounter)`, ref: { page: 'quests', id: q.id, sub: n.id } })
  }
  for (const s of m.events ?? []) for (const ev of s.events) if (spawns([...ev.start, ...ev.end])) out.push({ label: `world event ${ev.name || ev.id}`, ref: { page: 'saga', id: 'events', sub: s.id } })
  for (const p of m.progress ?? []) for (const st of p.stages) if (spawns(st.actions) || (st.outcomes ?? []).some((o) => spawns(o.actions))) out.push({ label: `progress event ${p.name || p.id} › stage ${st.title || st.id}`, ref: { page: 'saga', id: 'progress', sub: p.id } })
  for (const e of m.encounters) if (e.id !== id && (spawns(e.onDefeated ?? []) || spawns(e.onAvoided ?? []))) out.push({ label: `encounter ${e.name} (its outcome)`, ref: { page: 'encounters', id: e.id } })
  return out
}

export function encounterProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const entities = new Set([...m.systems.flatMap((s) => s.entities.map((e) => e.id)), ...ctx.index.markets.flatMap((x) => x.entities)])
  // Phase 7e (RC-R9): encounters a random-encounter pool spawns at vanilla's encounter points
  const pooled = new Map((m.pools ?? []).filter((p) => p.use === 'encounters').flatMap((p) => p.entries.map((x) => [x.id, p.name || p.id] as [string, string])))
  for (const e of m.encounters) {
    const ref = { page: 'encounters' as const, id: e.id }
    const inPool = pooled.get(e.id)
    if (inPool) out.push({ level: 'info', area: 'Encounter', ref, key: `encpool:${e.id}`, message: `${e.name}: random encounter pool "${inPool}" spawns it at vanilla's encounter points (its own spawn settings are only for quests).` })
    if (!ID_PATTERN.test(e.id)) out.push({ level: 'error', area: 'Encounter', message: `Encounter id "${e.id}" may only use lowercase letters, digits and _.`, ref })
    const pp = prefixProblem(m.project.prefix, e.id, 'Encounter', ref)
    if (pp) out.push(pp)
    // #67 U42: only the fields the Ships choice uses (a named fleet's own faction, type and ships)
    const f = effectiveFleet(e, m)
    const tpl = f.size === 'template' ? m.fleets?.templates.find((t) => t.id === f.template) : undefined
    if (f.size === 'template' && !tpl) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick a named fleet (Ships › a named fleet)${f.template ? `: "${f.template}" doesn't exist` : ''}.`, ref })
    else if (f.size === 'template' && !tpl!.ships.some((s) => s.variant)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: its named fleet ${tpl!.name || tpl!.id} has no ships yet.`, ref })
    if (f.size === 'template' && !tpl) { /* nothing more to check about its fleet */ } else
    if (!ctx.index.factions.some((x) => x.id === f.faction) && !m.factions.some((x) => x.id === f.faction)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no faction "${f.faction}".`, ref })
    // a mod may use its own fleet types (R22): a note, with where its name comes from
    if (!f.type.trim()) out.push({ level: 'error', area: 'Encounter', message: f.size === 'template' ? `${e.name}: its named fleet has no fleet type (Fleets › Fleet type).` : `${e.name}: pick a fleet type.`, ref })
    else if (!ctx.defs.fleetTypes.some((t) => t.id === f.type)) {
      // seen in game (8d): a type nothing names shows "No name for type [tradeSmall]" (vanilla's is smallTrader)
      const fac = m.factions.find((x) => x.id === f.faction)
      const ftn = (fac ? (fac.kind === 'addition' ? fac.raw.fleetTypeNames : fac.patch.set.fleetTypeNames) : undefined) as Record<string, unknown> | undefined
      const named = !!f.name?.trim() || typeof ftn?.[f.type] === 'string' || typeof ctx.index.fleetTypeNames?.[f.type] === 'string'
      // the same words in another order or form: tradeSmall ~ smallTrader
      const stems = (id: string) => id.split(/(?=[A-Z])|[_\s-]+/).filter(Boolean).map((w) => w.toLowerCase().slice(0, 5)).sort().join(' ')
      const close = ctx.defs.fleetTypes.find((t) => stems(t.id) === stems(f.type))
      if (named) out.push({ level: 'info', area: 'Encounter', message: `${e.name}: "${f.type}" is a fleet type of your own. Unless you set Fleet name, the fleet is named from its faction's name for "${f.type}" (Factions › Names & ranks › Fleet type names).`, ref, key: `fleettype:${e.id}` })
      else out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${f.type}" isn't a vanilla fleet type${close ? ` (did you mean "${close.id}"?)` : ''} and nothing names it: in game the fleet shows "No name for type [${f.type}]". Set Fleet name, pick a vanilla type, or name the type in the faction's Fleet type names.`, ref, key: `fleettype:${e.id}` })
    }
    if (f.size === 'explicit') {
      if (!f.variants?.length) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: list the ships (variants), or use fleet points.`, ref })
      for (const v of f.variants ?? []) if (!ctx.index.variants.some((x) => x.id === v)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: unknown variant "${v}".`, ref })
    } else if (f.size === 'fp' && (!f.points || f.points <= 0)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: fleet points must be above 0.`, ref })
    // #67 U43: a hail opens the comm dialog: it needs one
    if (e.hail && !e.commDialog) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: it hails the player, but has no comm-link dialog to open. Create one (Comm-link dialog), or turn the hail off.`, ref })
    // #67 U43: vanilla lets the player leave while 'allow disengage' is set, whatever blocks it
    if (e.hail && e.commDialog && e.hail.block !== false && e.flags?.allowDisengage) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: it hails and blocks leaving, but "player may disengage" is on, which lets the player leave anyway (vanilla). Turn it off (Flags) so the dialog decides; a Fleet response › fight turns it off too.`, ref, key: `hailallow:${e.id}` })
    // #67 U40: the extra groups
    for (const [gi, g] of (f.extras ?? []).entries()) {
      if (!g.ships.length) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: extra group ${gi + 1} has no ships; it adds nothing.`, ref })
      else if (g.chance <= 0) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: extra group ${gi + 1} has a 0% chance; it never joins.`, ref })
      for (const s of g.ships) if (!ctx.index.variants.some((x) => x.id === s.variant)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: extra group ${gi + 1}: unknown variant "${s.variant}".`, ref })
      if (g.pick !== 'all' && g.ships.length && g.ships.every((s) => (s.weight ?? 1) <= 0)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: extra group ${gi + 1}: every ship has weight 0, so they are drawn evenly.`, ref })
    }
    if (f.flagshipCommander && !m.people.some((p) => p.id === f.flagshipCommander)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: no person "${f.flagshipCommander}" in this mod.`, ref })
    if (!e.spawn.at && !isTodoActive(e, 'spawn.at') && !inPool) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it spawns.`, ref })
    // Phase 7d (RC-R2): at a quest's random target ($global.<quest>_<var>), resolved by SagaLib 1.2
    else if (e.spawn.at.startsWith('$global.') && !m.quests.some((q) => targetVars(q).some((v) => targetKey(q.id, v.name) === e.spawn.at))) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: "${e.spawn.at}" isn't a random target of any quest.`, ref })
    else if (e.spawn.at && !e.spawn.at.startsWith('$global.') && !entities.has(e.spawn.at)) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: "${e.spawn.at}" isn't an entity Saga Forge knows (vanilla entities made in code can't be listed).`, ref })
    if (e.behavior === 'travel' && !e.travelTo) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: pick where it travels to.`, ref })
    // Phase 8d (RC-R14): roaming fleets
    if (e.spawn.when === 'roaming') {
      if (!e.spawn.to) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: a roaming fleet needs a place to travel to.`, ref })
      else if (!entities.has(e.spawn.to)) out.push({ level: 'warning', area: 'Encounter', key: `roamto:${e.id}`, message: `${e.name}: "${e.spawn.to}" isn't an entity Saga Forge knows.`, ref })
      else if (e.spawn.to === e.spawn.at) out.push({ level: 'warning', area: 'Encounter', key: `roamsame:${e.id}`, message: `${e.name}: it travels from and to the same place.`, ref })
      if (!((e.spawn.days ?? 0) > 0)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: a roaming fleet needs the days between departures.`, ref })
      if ((e.spawn.max ?? 1) < 1) out.push({ level: 'warning', area: 'Encounter', key: `roammax:${e.id}`, message: `${e.name}: at most 0 on the way, so none ever leaves.`, ref })
      if (e.spawn.at && !ctx.index.markets?.some((mk) => mk.entities.includes(e.spawn.at) || mk.id === e.spawn.at) && !m.systems.some((s) => s.entities.some((x) => (x.id === e.spawn.at || x.market?.id === e.spawn.at) && !!x.market))) out.push({ level: 'info', area: 'Encounter', key: `roamfrom:${e.id}`, message: `${e.name}: "${e.spawn.at}" has no market; vanilla's routes like to start at one (a fleet still leaves from there).`, ref })
    }
    if (e.spawn.when === 'quest-stage') {
      const uses = encounterUses(m.quests, e.id)
      // an Action's "Spawn an encounter" counts too (a fleet that isn't fought: no outcomes needed)
      const byAction = m.quests.some((q) => q.nodes.some((n) => n.type === 'action' && n.ops.some((o) => o.op === 'spawn' && o.encounter === e.id)))
      // Phase 8d: a world event's actions spawn it
      const spawns = (ops: ActionOp[]) => ops.some((o) => o.op === 'spawn' && o.encounter === e.id)
      const byEvent = (m.events ?? []).some((s) => s.events.some((ev) => spawns([...ev.start, ...ev.end])))
        // H3: a progress event stage's actions (and its random outcomes) spawn it too
        || (m.progress ?? []).some((p) => p.stages.some((st) => spawns(st.actions) || (st.outcomes ?? []).some((oc) => spawns(oc.actions))))
      if (!uses.length && !byAction && !byEvent && !(e.spawn.quest && e.spawn.stage) && !inPool) out.push({ level: 'warning', area: 'Encounter', message: `${e.name}: no quest or world event spawns it yet (add an Encounter node, or set the quest and stage).`, ref })
      for (const u of uses) {
        if (!u.defeated) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Defeated outcome.`, ref: { page: 'quests', id: u.quest.id, sub: u.node }, fixes: [{ label: 'Open the quest', action: 'open' }] })
        if (!u.avoided) out.push({ level: 'error', area: 'Encounter', message: `${u.quest.title}: "${e.name}" has no Avoided outcome (the fleet can leave or be talked away).`, ref: { page: 'quests', id: u.quest.id, sub: u.node } })
      }
    }
    // #67 U46: its own outcome actions (no quest and nobody talked to when they run)
    for (const [label, ops] of [['When defeated', e.onDefeated ?? []], ['When avoided', e.onAvoided ?? []]] as const) for (const op of ops) {
      if (!EVENT_OPS.includes(op.op)) out.push({ level: 'error', area: 'Encounter', ref, message: `${e.name}, ${label}: "${op.op}" can't run here (no quest of its own).` })
      if ((op.op === 'spawn' || op.op === 'despawn') && op.encounter && !m.encounters.some((x) => x.id === op.encounter)) out.push({ level: 'error', area: 'Encounter', ref, message: `${e.name}, ${label}: there is no encounter "${op.encounter}".` })
      if (op.op === 'spawn' && op.encounter === e.id) out.push({ level: 'warning', area: 'Encounter', ref, key: `encoutself:${e.id}:${label}`, message: `${e.name}, ${label}: it spawns itself again at once.` })
      if (op.op === 'rep' && op.person === '$person') out.push({ level: 'error', area: 'Encounter', ref, message: `${e.name}, ${label}: reputation with "the person you're talking to": nobody is talked to when this runs. Name the person (e.g. the fleet's captain).` })
      if (op.op === 'progress' && op.event && !(m.progress ?? []).some((p) => p.id === op.event)) out.push({ level: 'error', area: 'Encounter', ref, message: `${e.name}, ${label}: "Add progress" names "${op.event}", which isn't one of the mod's progress events.` })
      if (op.op === 'startQuest') { const sp = startQuestStageProblem(op, m.quests); if (sp) out.push({ level: sp.level, area: 'Encounter', ref, key: sp.level === 'warning' ? `encoutstart:${e.id}:${op.quest}` : undefined, message: `${e.name}, ${label} ${sp.message}` }) }
    }
    if (e.commDialog && !m.quests.some((q) => q.id === e.commDialog)) out.push({ level: 'error', area: 'Encounter', message: `${e.name}: comm dialog "${e.commDialog}" doesn't exist.`, ref })
  }
  // #67 U43: a Fleet response (a cut comm link) only means something in a fleet's comm-link dialog
  const commOf = new Set(m.encounters.map((e) => e.commDialog).filter(Boolean))
  for (const q of m.quests) {
    if (q.inactive || commOf.has(q.id)) continue
    for (const n of q.nodes) if (n.type === 'link' && n.mode === 'close' && n.toFleet) out.push({ level: 'warning', area: 'Quest', message: `"${q.title}" › "${n.id}": cutting the comm link back to the fleet screen (or a Fleet response) only works in a fleet's comm-link dialog (Encounters › Comm-link dialog); here there's no fleet to let go or fight.`, ref: { page: 'quests', id: q.id, sub: n.id }, key: `fleetresp:${q.id}:${n.id}` })
  }
  out.push(...encounterPlacementProblems(m))
  return out
}
