/** Editing the open quest through the undo history. */
import type { QNode, QuestPlan } from '../../../shared/model'
import type { ModModel } from '../../../shared/serialize'
import { project } from '../state/project.svelte'
import { TARGET_DETAILS } from '../../../shared/targets'

export function editQuest(qid: string, fn: (q: QuestPlan, m: ModModel) => void): void {
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

/** Condition templates offered by the "+ condition" menu (PLAN.md §4.3: a picker for common conditions). */
export function conditionTemplates(q: QuestPlan | null, factions: string[], quests: QuestPlan[]): { label: string; line: string }[] {
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
  return out
}
