<script lang="ts">
  /** A quest or conversation on the Saga overview board (PLAN.md §4.8). */
  import { Handle, Position } from '@xyflow/svelte'
  import type { QuestPlan } from '../../../shared/model'

  interface Props { data: { quest: QuestPlan; start: string; people: string[]; problems: number } }
  let { data }: Props = $props()
  const q = $derived(data.quest)
  const ends = $derived(q.nodes.filter((n) => n.type === 'end').map((n) => (n as { outcome: string }).outcome))
</script>

<div class="card" class:dialog={q.kind === 'dialog'}>
  <Handle type="target" position={Position.Left} />
  <div class="h"><span>{q.title}</span>{#if data.problems}<span class="p">{data.problems}</span>{/if}</div>
  <div class="b">
    <div class="muted">{data.start}</div>
    {#if q.kind === 'quest'}<div>{q.stages.length} stage{q.stages.length === 1 ? '' : 's'}{ends.length ? ` · ends: ${[...new Set(ends)].join(', ')}` : ''}</div>{:else}<div class="muted">conversation only</div>{/if}
    {#if data.people.length}<div class="muted">{data.people.join(', ')}</div>{/if}
    <div class="mono id">{q.id}</div>
  </div>
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .card { width: 210px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.4); color: var(--text); }
  .card.dialog { border-style: dashed; }
  .h { padding: 4px 8px; background: #2b7fc4; color: #fff; font-weight: 600; border-radius: 5px 5px 0 0; display: flex; justify-content: space-between; }
  .card.dialog .h { background: #3a4452; }
  .p { background: var(--bad); border-radius: 8px; padding: 0 5px; font-size: 11px; }
  .b { padding: 5px 8px; display: flex; flex-direction: column; gap: 2px; }
  .muted { color: var(--muted); }
  .id { font-size: 10px; color: var(--muted); }
  .mono { font-family: var(--mono); }
</style>
