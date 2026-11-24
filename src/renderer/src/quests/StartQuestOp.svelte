<script lang="ts">
  /**
   * H5: "Start another quest": the quest, and the stage it starts at (SF_Step after SF_Start), so
   * its journal entry, marker and first Arrive are there at once. Picking a quest preselects the
   * stage its Start leads straight into.
   */
  import type { QuestPlan } from '../../../shared/model'
  import { firstStageOf } from '../../../shared/quest'

  interface Props {
    quest: string
    stage?: string
    quests: QuestPlan[]
    onChange: (quest: string, stage: string | undefined) => void
  }
  let { quest, stage, quests, onChange }: Props = $props()
  const target = $derived(quests.find((x) => x.id === quest))
</script>

<select title="The quest to start" value={quest} onchange={(e) => { const v = e.currentTarget.value; onChange(v, firstStageOf(quests.find((x) => x.id === v) ?? ({ nodes: [], edges: [] } as unknown as QuestPlan))) }}>
  <option value="">quest…</option>
  {#each quests as x (x.id)}<option value={x.id}>{x.title}</option>{/each}
  {#if quest && !target}<option value={quest}>{quest} (missing)</option>{/if}
</select>
<select title="The stage it starts at: its journal entry, marker and the Arrive nodes of that stage are there at once. Without one the quest is only marked active and its first Stage node never runs." value={stage ?? ''} onchange={(e) => onChange(quest, e.currentTarget.value || undefined)}>
  <option value="">only mark it active</option>
  {#each target?.stages ?? [] as st (st.id)}<option value={st.id}>at stage: {st.title || st.id}</option>{/each}
  {#if stage && !target?.stages.some((st) => st.id === stage)}<option value={stage}>at stage: {stage} (missing)</option>{/if}
</select>
