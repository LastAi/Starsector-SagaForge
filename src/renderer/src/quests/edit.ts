/** Editing the open quest through the undo history. */
import type { QNode, QuestPlan } from '../../../shared/model'
import type { ModModel } from '../../../shared/serialize'
import { project } from '../state/project.svelte'
import { TARGET_DETAILS } from '../../../shared/targets'
import { itemVer } from '../state/itemver.svelte'
import { bountyIdsOf, existingBounties } from '../../../shared/bounties'
import { settingConditionTemplates } from '../../../shared/settings'

/** #64: in an open version (the versions strip), the fields the edit changes become that version's. */
export function editQuest(qid: string, fn: (q: QuestPlan, m: ModModel) => void): void {
  itemVer.edit<QuestPlan>('quest', qid, fn)
}

/** An edit of the quest itself, never of a version (on/off, kind, deleting). */
export function editQuestBase(qid: string, fn: (q: QuestPlan, m: ModModel) => void): void {
  project.change((m) => {
    const q = m.quests.find((x) => x.id === qid)
    if (q) fn(q, m)
  })
}

export function editNode<T extends QNode>(qid: string, nid: string, fn: (n: T, q: QuestPlan, m: ModModel) => void): void {
  editQuest(qid, (q, m) => {
    const n = q.nodes.find((x) => x.id === nid)
    if (n) fn(n as T, q, m)
  })
}

/** #59: the MagicLib bounties a quest can start or test: the ones it uses, the mod's own, the hand-written ones in its file. */
export function bountyChoices(q: QuestPlan | null): string[] {
  const m = project.m
  if (!m) return []
  const hand = project.loaded ? existingBounties(project.loaded.files, []).map((b) => b.id) : []
  return [...new Set([...(q ? bountyIdsOf(q) : []), ...(m.bounties ?? []).map((b) => b.id), ...hand])].filter((id) => id && id !== '?')
}

/** Condition templates offered by the "+ condition" menu (PLAN.md §4.3: a picker for common conditions). */
export function conditionTemplates(q: QuestPlan | null, factions: string[], quests: QuestPlan[], bounties: string[] = []): { label: string; line: string }[] {
  const out: { label: string; line: string }[] = []
  if (q) {
    for (const v of q.variables) {
      if (v.type !== 'target') { out.push({ label: `Variable ${v.name}`, line: `$global.${q.id}_${v.name} == ${v.initial || '1'}` }); continue }
      // Phase 7d (RC-R3): what the random target is like
      for (const d of TARGET_DETAILS.filter((x) => x.kind !== 'text')) {
        const k = `$global.${q.id}_${v.name}_${d.id}`
        out.push({ label: `Target ${v.name}: ${d.label}`, line: d.kind === 'bool' ? k : `${k} == vast` })
      }
      out.push({ label: `Target ${v.name}: its faction is…`, line: `$global.${q.id}_${v.name}_factionId == hegemony` })
    }
    for (const s of q.stages) out.push({ label: `At stage "${s.title}"`, line: `SF_AtStep ${q.id} ${s.id}` })
  }
  // #62: the mod's settings (Saga › Settings; SagaLib sets $global.<id> on every load)
  out.push(...settingConditionTemplates(project.m?.project.settings ?? []))
  const f = factions[0] ?? 'hegemony'
  out.push({ label: 'Commissioned with a faction', line: `$player.commissionFactionId == ${f}` })
  out.push({ label: 'Reputation at least…', line: `RepIsAtWorst ${f} FAVORABLE` })
  out.push({ label: 'Reputation at most…', line: `RepIsAtBest ${f} SUSPICIOUS` })
  out.push({ label: 'Flag is set', line: '$global.my_flag' })
  out.push({ label: 'Flag is not set', line: '!$global.my_flag' })
  out.push({ label: 'Player is female', line: '$player.gender == FEMALE' })
  for (const o of quests.filter((x) => x.id !== q?.id).slice(0, 12)) out.push({ label: `Quest "${o.title}" succeeded`, line: `SF_QuestDone ${o.id} success` })
  out.push({ label: 'Credits at least…', line: '$player.credits >= 10000' })
  out.push({ label: 'At a market of…', line: `$market.factionId == ${f}` })
  // Phase 7e (RC-R11): SagaLib 1.2 remembers every colony that decivilises
  out.push({ label: 'A colony has decivilised', line: '$global.sagaforge_deciv_<market id>' })
  // #70 (SagaLib 1.3): relations between two factions (vanilla's RepIsAtWorst is the player's), and who is away
  out.push({ label: 'Market owner gets on with a faction (at least…)', line: `SF_FactionRep $faction.id ${f} NEUTRAL` })
  out.push({ label: 'Market owner not hostile to a faction', line: `SF_FactionRep $faction.id ${f} notHostile` })
  for (const p of (project.m?.people ?? []).filter((x) => !!x.presence).slice(0, 8)) out.push({ label: `${`${p.name.first} ${p.name.last}`.trim() || p.id} is away (presence)`, line: `$global.sagaforge_away_${p.id}` })
  // #59 (SagaLib 1.3): a MagicLib bounty's state (unavailable = no MagicLib, or MagicLib doesn't have it)
  for (const b of bounties.slice(0, 8)) {
    for (const [s, what] of [['unavailable', 'unavailable (no MagicLib)'], ['offered', 'offered, not taken'], ['active', 'taken, running'], ['succeeded', 'succeeded'], ['failed', 'failed (flagship salvaged)'], ['ended', 'ended (any way)']] as const) {
      out.push({ label: `MagicLib bounty ${b}: ${what}`, line: `SF_BountyState ${b} ${s}` })
    }
  }
  return out
}
