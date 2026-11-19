/**
 * #27: MagicLib bounties in Problems: what the bounty editor's mapping report says (errors block
 * the export, warnings name what MagicLib can't do), plus duplicate ids.
 * #59: quests that start or test bounties (SF_StartBounty, SF_BountyState; SagaLib 1.3's bridge),
 * and (SagaLib 1.3) Wait nodes on a bounty's end.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { bountyIdsOf, bountyJson, existingBounties } from '../bounties'
import { BOUNTY_STATES } from '../play'
import type { QuestPlan } from '../model'
import { currentStage } from '../export/questrules'

export function bountyProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const seen = new Set<string>()
  for (const b of m.bounties ?? []) {
    const ref: Problem['ref'] = b.quest ? { page: 'quests', id: b.quest, sub: `bounty:${b.id}` } : { page: 'encounters', id: b.encounter ?? '', sub: `bounty:${b.id}` }
    if (seen.has(b.id)) out.push({ level: 'error', area: 'Bounty', message: `Two MagicLib bounties have the id "${b.id}".`, ref, key: `bountydup:${b.id}` })
    seen.add(b.id)
    const r = bountyJson(m, b, ctx.index)
    for (const n of r.notes) {
      if (n.level === 'info') continue
      out.push({ level: n.level, area: 'Bounty', message: `MagicLib bounty ${b.id} (${n.field}): ${n.message}`, ref, key: `bounty:${b.id}:${n.field}:${n.message.slice(0, 40)}` })
    }
    // #59: off the board and started by no quest: nobody can ever take it
    if (b.board === false && !m.quests.some((q) => questStarts(q).includes(b.id))) out.push({ level: 'warning', area: 'Bounty', message: `MagicLib bounty ${b.id} isn't on the board, and no quest starts it ("Start a MagicLib bounty"): the player can never take it.`, ref, key: `bountynoboard:${b.id}` })
  }
  out.push(...questBountyProblems(ctx))
  return out
}

/** The bounties a quest's Action nodes start (op and script lines). */
function questStarts(q: QuestPlan): string[] {
  const out: string[] = []
  for (const n of q.nodes) if (n.type === 'action') for (const op of n.ops) {
    if (op.op === 'startBounty' && op.bounty) out.push(op.bounty)
    else if (op.op === 'line') { const mm = /^\s*SF_StartBounty\s+(\S+)/.exec(op.line); if (mm) out.push(mm[1]) }
  }
  return out
}

/** Every SF_BountyState line of a quest (its conditions, as written). */
function stateLines(q: QuestPlan): string[] {
  const lines: string[] = []
  for (const n of q.nodes) {
    if (n.type === 'branch') for (const c of n.cases) lines.push(...c.conditions)
    if (n.type === 'dialog') { lines.push(...n.conditions); for (const o of n.options) lines.push(...(o.showIf ?? []), ...(o.disabledIf ?? [])); for (const p of n.phrases) for (const cs of p.cases) lines.push(...cs.when) }
  }
  if ('conditions' in q.start) lines.push(...q.start.conditions)
  for (const r of q.requires) if ('flag' in r) lines.push(r.flag)
  return lines.filter((l) => /^\s*!?SF_BountyState\b/.test(l))
}

function questBountyProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const own = new Set((m.bounties ?? []).map((b) => b.id))
  const hand = new Set(existingBounties(ctx.loaded?.files ?? {}, []).map((b) => b.id))
  const magic = (m.project.mods ?? []).find((x) => x.id === 'MagicLib')?.use
  for (const q of m.quests) {
    if (q.inactive) continue
    const ids = bountyIdsOf(q)
    if (!ids.length && !q.nodes.some((n) => (n.type === 'action' && n.ops.some((o) => o.op === 'startBounty')) || (n.type === 'wait' && n.mode === 'bounty'))) continue
    const ref = (node?: string): Problem['ref'] => ({ page: 'quests', id: q.id, ...(node ? { sub: node } : {}) })
    for (const n of q.nodes) if (n.type === 'action') for (const op of n.ops) if (op.op === 'startBounty' && !op.bounty) out.push({ level: 'error', area: 'Quest', message: `${q.title}: "Start a MagicLib bounty" in "${n.title || n.id}" has no bounty.`, ref: ref(n.id), key: `bountyop:${q.id}:${n.id}` })
    for (const l of stateLines(q)) {
      const words = l.trim().replace(/^!/, '').split(/\s+/).slice(2)
      if (!words.length) out.push({ level: 'error', area: 'Quest', message: `${q.title}: "${l.trim()}" needs a state (${BOUNTY_STATES.join(', ')} or ended).`, ref: ref(), key: `bountystate:${q.id}:${l}` })
      for (const w of words) if (!(BOUNTY_STATES as readonly string[]).includes(w) && w !== 'ended') out.push({ level: 'error', area: 'Quest', message: `${q.title}: "${l.trim()}": "${w}" isn't a bounty state (${BOUNTY_STATES.join(', ')} or ended).`, ref: ref(), key: `bountystate:${q.id}:${l}:${w}` })
    }
    for (const id of ids) {
      if (!own.has(id) && !hand.has(id)) out.push({ level: 'info', area: 'Quest', message: `${q.title}: the MagicLib bounty "${id}" isn't one of this mod's: it must be in another mod's magicBounty_data.json (that mod enabled). Otherwise SagaLib sees it as unavailable.`, ref: ref(), key: `bountyother:${q.id}:${id}` })
    }
    // SagaLib 1.3: Wait nodes on a bounty's end
    const waits = q.nodes.filter((n): n is Extract<QuestPlan['nodes'][number], { type: 'wait' }> => n.type === 'wait' && n.mode === 'bounty')
    for (const n of waits) {
      const label = `${q.title}: "Wait for a MagicLib bounty" (${n.id})`
      if (!n.bounty?.trim()) { out.push({ level: 'error', area: 'Quest', message: `${label} has no bounty.`, ref: ref(n.id), key: `bountywait:${q.id}:${n.id}` }); continue }
      if (q.kind !== 'quest') { out.push({ level: 'error', area: 'Quest', message: `${label}: only a quest can wait (SagaLib watches the bounty while the quest is at a step); this is a conversation.`, ref: ref(n.id), key: `bountywaitkind:${q.id}:${n.id}` }); continue }
      if (!currentStage(q, n.id)) out.push({ level: 'warning', area: 'Quest', message: `${label}: no Stage comes before it, so SagaLib watches the bounty as soon as the quest starts, not when the quest gets here. Put a Stage node before the Wait.`, ref: ref(n.id), key: `bountywaitstage:${q.id}:${n.id}` })
      const open = (['succeeded', 'failed', 'expired'] as const).filter((o) => !q.edges.some((e) => e.from === n.id && e.handle === o))
      if (open.length) out.push({ level: 'warning', area: 'Quest', message: `${label}: ${open.map((o) => `"${o}"`).join(', ')} ${open.length > 1 ? 'aren\'t' : 'isn\'t'} connected. If the bounty ends that way the quest waits there for good.`, ref: ref(n.id), key: `bountywaitopen:${q.id}:${n.id}` })
    }
    // MagicLib optional (or not listed): starting does nothing without it, so the quest should say so
    if (magic !== 'required') {
      const tested = new Set(stateLines(q).map((l) => l.trim().replace(/^!/, '').split(/\s+/)[1]))
      const starts = new Set(questStarts(q))
      for (const id of starts) if (!tested.has(id)) out.push({ level: 'warning', area: 'Quest', message: `${q.title} starts the MagicLib bounty ${id} but never tests its state. MagicLib is ${magic ?? 'not listed'}: without it the bounty is unavailable and starting it does nothing. Test "MagicLib bounty ${id} is unavailable" in a Branch before, and tell the player.`, ref: ref(), key: `bountyuntested:${q.id}:${id}` })
      // a wait on a bounty from the board: without MagicLib it never ends, so the quest would wait for good
      for (const id of new Set(waits.map((n) => n.bounty?.trim() ?? '').filter(Boolean))) if (!tested.has(id) && !starts.has(id)) out.push({ level: 'warning', area: 'Quest', message: `${q.title} waits for the MagicLib bounty ${id} but never tests its state. MagicLib is ${magic ?? 'not listed'}: without it the bounty is unavailable and the quest waits for good. Test "MagicLib bounty ${id} is unavailable" in a Branch before, and tell the player.`, ref: ref(), key: `bountywaituntested:${q.id}:${id}` })
    }
  }
  return out
}
