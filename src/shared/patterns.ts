/**
 * Vanilla-safe patterns the editor points modders to (task #36): instead of only warning, each
 * check here comes with a one-click way to build the safe version.
 *  - a protected quest wreck: a conversation that answers OpenInteractionDialog at the wreck until
 *    a quest is done, so vanilla's salvage and ship recovery can't remove it (found in game,
 *    2026-11-11; the example's "Wreck: Compact property");
 *  - ending a branch with "back to the menu" (SF_BackToMenu): FireAll PopulateOptions adds nothing
 *    at a wreck or other entity and leaves the old options on screen (FORMATS.md);
 *  - placing a quest's fleet where the quest sends the player.
 */
import type { Problem } from './api'
import type { DialogNode, QuestPlan, StarSystemDef, SystemEntity } from './model'
import type { ModModel } from './serialize'
import { newQuest, uniqueId } from './quest'
import { encounterUses } from './encounters'

type Model = Pick<ModModel, 'quests' | 'systems' | 'encounters'>

// ---------------------------------------------------------------- protected wrecks

/** Quests that send the player to an entity (a stage marker or an Arrive node). */
export function questsSendingTo(quests: QuestPlan[], entityId: string): QuestPlan[] {
  return quests.filter((q) => q.kind === 'quest' && (q.stages.some((st) => st.marker === entityId) || q.nodes.some((n) => n.type === 'wait' && n.mode === 'arrive' && n.entity === entityId)))
}

/**
 * H2: a lock-like conversation only ever sends the player away: its nodes are dialog, branch and
 * link nodes, and every link leaves (vanilla's "defaultLeave", "cutCommLink") or jumps within it.
 * A scene that changes something, hands back to the place's menu or fires a trigger (a first-visit
 * welcome at a station) isn't a lock, so its place's Arrive nodes keep their own choice.
 */
export function isLockLike(q: QuestPlan): boolean {
  if (q.start.kind !== 'trigger' || q.start.trigger !== 'OpenInteractionDialog') return false
  return q.nodes.every((n) => {
    if (n.type === 'start' || n.type === 'note' || n.type === 'dialog' || n.type === 'branch') return true
    if (n.type !== 'link') return false
    return n.mode === 'node' || (n.mode === 'option' && (n.target === 'defaultLeave' || n.target === 'cutCommLink'))
  })
}

/** Every object a lock conversation answers at (RC-F2: their Arrive nodes stay takeovers). */
export function lockedEntityIds(quests: QuestPlan[]): Set<string> {
  const out = new Set<string>()
  for (const q of quests) {
    if (!isLockLike(q) || q.start.kind !== 'trigger') continue
    for (const c of q.start.conditions) { const m = /^\$id\s*==\s*(\S+)/.exec(c.trim()); if (m) out.add(m[1]) }
  }
  return out
}

/** Conversations that answer OpenInteractionDialog at the entity ("$id == <entity>"): its guards. */

export function guardsOf(quests: QuestPlan[], entityId: string): QuestPlan[] {
  const idCond = new RegExp(`^\\$id\\s*==\\s*${entityId}(\\s|$)`)
  return quests.filter((q) => q.start.kind === 'trigger' && q.start.trigger === 'OpenInteractionDialog' && q.start.conditions.some((c) => idCond.test(c.trim())))
}

/**
 * A conversation that stops vanilla's salvage at a wreck: it answers OpenInteractionDialog there
 * with "Leave" only, until `until` succeeds (null = always). Its score (500) is below the quests'
 * own arrival rules (1000), so those still win at their steps.
 */
export function newWreckLock(entity: Pick<SystemEntity, 'id' | 'name'>, until: string | null, takenIds: string[]): QuestPlan {
  const id = uniqueId(`${entity.id}_lock`, takenIds)
  const q = newQuest(id, `${entity.name}: protected`, 'dialog')
  q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: [`$id == ${entity.id} score:500`, ...(until ? [`!SF_QuestDone ${until} success`] : [])] }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Protected'
  offer.visual = { kind: 'keep' }
  offer.text = `Your sensors pick up a warning beacon on the ${entity.name.toLowerCase()}: registered property, salvage prohibited.\n\nTouching it now would bring trouble you don't need.`
  offer.highlights = ['salvage prohibited']
  offer.options = [{ id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  // vanilla answers "defaultLeave" itself (DismissDialog)
  q.nodes.push({ id: 'close', type: 'link', x: 520, y: 60, mode: 'option', target: 'defaultLeave' })
  q.edges.push({ id: 'e_close', from: 'offer', handle: 'leave', to: 'close' })
  q.notes = until
    ? `Keeps vanilla's salvage and ship recovery away from ${entity.id} until "${until}" succeeds. Made by Protect this wreck… on the Locations page; edit the text freely.`
    : `Keeps vanilla's salvage and ship recovery away from ${entity.id} for good. Made by Protect this wreck… on the Locations page; edit the text freely.`
  return q
}

/** The quest a wreck lock waits for by default: the last of the quests that send the player there. */
export function defaultLockUntil(quests: QuestPlan[], entityId: string): string | null {
  const users = questsSendingTo(quests, entityId)
  return users.length ? users[users.length - 1].id : null
}

/** Add a wreck lock to the model (the fix behind "Protect this wreck"). Returns the new conversation's id. */
export function protectWreck(m: Model, entityId: string, until?: string | null): string | null {
  const e = m.systems.flatMap((s) => s.entities).find((x) => x.id === entityId)
  if (!e) return null
  const q = newWreckLock(e, until === undefined ? defaultLockUntil(m.quests, entityId) : until, m.quests.map((x) => x.id))
  m.quests.push(q)
  return q.id
}

export function unguardedWreckProblems(m: Model): Problem[] {
  const out: Problem[] = []
  for (const s of m.systems) for (const e of s.entities) {
    if (e.kind !== 'derelict') continue
    const users = questsSendingTo(m.quests, e.id)
    if (!users.length || guardsOf(m.quests, e.id).length) continue
    out.push({
      level: 'warning', area: 'Quest',
      message: `"${e.name}" is a wreck that ${users.map((q) => `"${q.title}"`).join(', ')} sends the player to, but at other times it's an ordinary vanilla wreck: salvaging or recovering it removes it and the quest can't continue. Protect it: a short conversation answers at the wreck ("Leave" only) until the quest is done.`,
      ref: { page: 'locations', id: s.id, sub: e.id }, key: `wreck:${e.id}`,
      fixes: [{ label: 'Protect this wreck', action: 'protectWreck', arg: e.id }]
    })
  }
  return out
}

// ---------------------------------------------------------------- back to the menu

/** Turn a Link node into "back to the menu (or close)". */
export function linkToMenu(m: Model, questId: string, nodeId: string): boolean {
  const n = m.quests.find((q) => q.id === questId)?.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'link') return false
  n.mode = 'menu'
  n.target = ''
  delete n.fire
  return true
}

/**
 * Links that fire PopulateOptions themselves. At a menu (a market, a contact, a fleet) that is the
 * same as "back to the menu"; at a wreck or another entity without one it adds nothing and leaves
 * the last options on screen. A warning where the quest's dialog can happen at such a place, else
 * a hint.
 */
export function populateLinkProblems(m: Model, marketEntities: Set<string>, sagalib: boolean): Problem[] {
  if (!sagalib) return []
  const out: Problem[] = []
  const ownMarkets = new Set(m.systems.flatMap((s) => s.entities.flatMap((e) => (e.market ? [e.id, e.market.id] : []))))
  const atMenu = (id: string) => ownMarkets.has(id) || marketEntities.has(id)
  for (const q of m.quests) {
    for (const n of q.nodes) {
      if (n.type !== 'link' || n.mode !== 'trigger' || n.target !== 'PopulateOptions') continue
      const noMenu = conversationPlaces(q, n.id).filter((p) => p !== MENU && !atMenu(p))
      out.push({
        level: noMenu.length ? 'warning' : 'info', area: 'Quest',
        message: noMenu.length
          ? `Link "${n.id}" fires PopulateOptions, but the conversation that reaches it has no menu to go back to (${noMenu.join('; ')}): the old options would stay on screen. Use "back to the menu (or close)", which does the same at a menu and closes the dialog elsewhere.`
          : `Link "${n.id}" fires PopulateOptions. "Back to the menu (or close)" does the same at a menu and also closes the dialog at a wreck or other place without one.`,
        ref: { page: 'quests', id: q.id, sub: n.id }, key: `populate:${q.id}:${n.id}`,
        fixes: [{ label: 'Use back to the menu', action: 'linkToMenu', arg: { quest: q.id, node: n.id } }]
      })
    }
  }
  return out
}

const MENU = '(menu)'
/** Shown for conversations SagaLib opens by itself (after a battle, a timer): no menu behind them. */
const OWN_DIALOG = 'a dialog SagaLib opens (after a battle or a timer)'

/**
 * Where the conversation that reaches a node takes place: walks back along the edges to what
 * opened it. MENU for a contact, a bar, a menu option or a comm link; an entity id for an arrival
 * or a dialog opened at "$id == <entity>"; OWN_DIALOG after an encounter's outcome or a timer.
 */
export function conversationPlaces(q: QuestPlan, nodeId: string): string[] {
  const out = new Set<string>()
  const seen = new Set<string>()
  const todo = [nodeId]
  while (todo.length) {
    const id = todo.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = q.nodes.find((x) => x.id === id)
    if (!n) continue
    if (n.type === 'start') {
      const s = q.start
      if (s.kind === 'trigger' && s.trigger === 'OpenInteractionDialog') {
        const ids = s.conditions.flatMap((c) => /^\$id\s*==\s*(\S+)/.exec(c.trim())?.[1] ?? [])
        if (ids.length) { ids.forEach((x) => out.add(x)); continue }
      }
      out.add(MENU)
      continue
    }
    if (n.type === 'wait' && id !== nodeId) { out.add(n.mode === 'arrive' && n.entity ? n.entity : OWN_DIALOG); continue }
    for (const e of q.edges) {
      if (e.to !== id) continue
      const from = q.nodes.find((x) => x.id === e.from)
      // an encounter's outcome comes in a new dialog; "after spawning" continues the current one
      if (from?.type === 'encounter' && e.handle !== 'next') { out.add(OWN_DIALOG); continue }
      todo.push(e.from)
    }
  }
  return [...out]
}

// ---------------------------------------------------------------- where a quest's fleet waits

/** The system of an entity of this mod (null for vanilla entities: not known here). */
export function systemOf(systems: StarSystemDef[], entityId: string): StarSystemDef | null {
  return systems.find((s) => s.entities.some((e) => e.id === entityId)) ?? null
}

/** Places a quest sends the player to (stage markers and Arrive nodes), in order. */
export function questPlaces(q: QuestPlan): string[] {
  const out: string[] = []
  for (const st of q.stages) if (st.marker && !out.includes(st.marker)) out.push(st.marker)
  for (const n of q.nodes) if (n.type === 'wait' && n.mode === 'arrive' && n.entity && !out.includes(n.entity)) out.push(n.entity)
  return out
}

/** Suggested spawn places for an encounter: where the quests that spawn it send the player. */
export function spawnSuggestions(m: Model, encounterId: string): string[] {
  const out: string[] = []
  for (const u of encounterUses(m.quests, encounterId)) for (const p of questPlaces(u.quest)) if (!out.includes(p)) out.push(p)
  return out
}

/**
 * A quest's fleet that waits in another system than every place the quest sends the player: the
 * player may never meet it. Only checked when both are this mod's entities (systems known).
 */
export function encounterPlacementProblems(m: Model): Problem[] {
  const out: Problem[] = []
  for (const e of m.encounters) {
    if (e.spawn.when !== 'quest-stage' || !e.spawn.at) continue
    if (e.behavior !== 'ambush' && e.behavior !== 'guard') continue
    const at = systemOf(m.systems, e.spawn.at)
    if (!at) continue
    const places = spawnSuggestions(m, e.id)
    const known = places.map((p) => ({ p, s: systemOf(m.systems, p) })).filter((x) => x.s)
    if (!known.length || known.some((x) => x.s!.id === at.id)) continue
    out.push({
      level: 'warning', area: 'Encounter',
      message: `${e.name} waits in ${at.name}, but the quests that spawn it send the player to ${known.map((x) => `${x.p} (${x.s!.name})`).join(', ')}: the player may never meet it. Spawn it at the place the quest marks; SagaLib puts it next to the stage's marker when they share a system.`,
      ref: { page: 'encounters', id: e.id }, key: `placement:${e.id}`,
      fixes: [{ label: `Spawn at ${known[0].p}`, action: 'spawnAt', arg: { encounter: e.id, at: known[0].p } }]
    })
  }
  return out
}

export function spawnAt(m: Model, encounterId: string, at: string): boolean {
  const e = m.encounters.find((x) => x.id === encounterId)
  if (!e) return false
  e.spawn.at = at
  return true
}

/** Apply one of the fixes above (Problems page). */
export function applyPatternFix(m: Model, action: string, arg: unknown): boolean {
  if (action === 'protectWreck') return !!protectWreck(m, String(arg))
  if (action === 'linkToMenu') { const a = arg as { quest: string; node: string }; return linkToMenu(m, a.quest, a.node) }
  if (action === 'spawnAt') { const a = arg as { encounter: string; at: string }; return spawnAt(m, a.encounter, a.at) }
  return false
}
