/** Editing the open quest through the undo history. */
import type { QNode, QuestPlan } from '../../../shared/model'
import type { ModModel } from '../../../shared/serialize'
import { project } from '../state/project.svelte'
import { TARGET_DETAILS } from '../../../shared/targets'
import { itemVer } from '../state/itemver.svelte'
import { bountyIdsOf, existingBounties } from '../../../shared/bounties'
import { settingConditionTemplates } from '../../../shared/settings'
import { useOf } from '../../../shared/modlist'
import { unlockFlag, VOK_ID } from '../../../shared/research'

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
      // #75 (SagaLib 1.4): the delivery's cargo check
      if (v.target?.pick === 'commodity') {
        out.push({ label: `Target ${v.name}: the player has its goods (amount in cargo)`, line: `SF_TargetCommodity ${q.id} ${v.name} has` })
        out.push({ label: `Target ${v.name}: the commodity is…`, line: `$global.${q.id}_${v.name}_commodityId == food` })
      }
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
  // #67 U43: in a fleet's comm dialog: the player fled from it earlier (a Fleet response › player flees)
  out.push({ label: 'The player fled from this fleet', line: '$entity.sagaforge_fled' })
  out.push({ label: 'Player is male', line: '$player.gender == MALE' }) // #67 U4 (task #81)
  for (const o of quests.filter((x) => x.id !== q?.id).slice(0, 12)) out.push({ label: `Quest "${o.title}" succeeded`, line: `SF_QuestDone ${o.id} success` })
  // #67 U45: a quest running, and a progress event's stage (both kept in $global: they work outside a dialog too)
  for (const o of quests.filter((x) => x.id !== q?.id && x.kind === 'quest').slice(0, 12)) out.push({ label: `Quest "${o.title}" is running`, line: `$global.${o.id}_state == active` })
  for (const p of (project.m?.progress ?? []).slice(0, 6)) for (const s of p.stages) out.push({ label: `Progress "${p.name}" last reached "${s.title}"`, line: `$global.${p.id}_stage == ${s.id}` })
  // #67 U46: how an encounter's last fleet ended, a named fleet's defeats (SagaLib keeps both in $global)
  for (const e of (project.m?.encounters ?? []).slice(0, 12)) {
    out.push({ label: `Encounter "${e.name}": its fleet was beaten`, line: `$global.sagaforge_enc_${e.id}_state == defeated` })
    out.push({ label: `Encounter "${e.name}": its fleet left unbeaten`, line: `$global.sagaforge_enc_${e.id}_state == avoided` })
  }
  for (const t of (project.m?.fleets?.templates ?? []).slice(0, 8)) out.push({ label: `Named fleet "${t.name || t.id}" beaten at least once`, line: `$global.sagaforge_fleet_${t.id}_defeats >= 1` })
  out.push({ label: 'Credits at least…', line: '$player.credits >= 10000' })
  out.push({ label: 'At a market of…', line: `$market.factionId == ${f}` })
  // Phase 7e (RC-R11): SagaLib 1.2 remembers every colony that decivilises
  out.push({ label: 'A colony has decivilised', line: '$global.sagaforge_deciv_<market id>' })
  // #70 (SagaLib 1.3): relations between two factions (vanilla's RepIsAtWorst is the player's), and who is away
  out.push({ label: 'Market owner gets on with a faction (at least…)', line: `SF_FactionRep $faction.id ${f} NEUTRAL` })
  out.push({ label: 'Market owner not hostile to a faction', line: `SF_FactionRep $faction.id ${f} notHostile` })
  for (const p of (project.m?.people ?? []).filter((x) => !!x.presence).slice(0, 8)) out.push({ label: `${`${p.name.first} ${p.name.last}`.trim() || p.id} is away (presence)`, line: `$global.sagaforge_away_${p.id}` })
  // #77 (SagaLib 1.4): VoK research (false without VoK); the mod's own techs first
  const m = project.m
  if (m && (m.research?.techs.length || ['required', 'optional'].includes(useOf(m.project, VOK_ID)))) {
    const t = m.research?.techs[0]?.id ?? 'aotd_tech_agriculture'
    out.push({ label: 'The player has researched a tech (VoK)', line: `SF_HasResearch ${t}` })
    out.push({ label: 'A faction has researched a tech (VoK)', line: `SF_HasResearch ${t} ${f}` })
    for (const x of (m.research?.techs ?? []).filter((y) => !!y.quest).slice(0, 6)) out.push({ label: `Research "${x.name || x.id}" was unlocked by a quest`, line: unlockFlag(x.id) })
  }
  // #59 (SagaLib 1.3): a MagicLib bounty's state (unavailable = no MagicLib, or MagicLib doesn't have it)
  for (const b of bounties.slice(0, 8)) {
    for (const [s, what] of [['unavailable', 'unavailable (no MagicLib)'], ['offered', 'offered, not taken'], ['active', 'taken, running'], ['succeeded', 'succeeded'], ['failed', 'failed (flagship salvaged)'], ['ended', 'ended (any way)']] as const) {
      out.push({ label: `MagicLib bounty ${b}: ${what}`, line: `SF_BountyState ${b} ${s}` })
    }
  }
  return out
}
