<script lang="ts">
  /** #67 U19: a storyline's lane on the Saga board (behind its quest cards). */
  interface Props { data: { title: string; count: number; alone?: boolean; w: number; h: number } }
  let { data }: Props = $props()
</script>

<div class="lane" class:alone={data.alone} style="width:{data.w}px;height:{data.h}px">
  <span class="t">{data.title}</span><span class="n">{data.alone ? `${data.count} quest${data.count === 1 ? '' : 's'} with no story link` : `questline · ${data.count} quests`}</span>
</div>

<style>
  .lane { border: 1px solid #263243; border-radius: 8px; background: rgba(43, 127, 196, .05); position: relative; pointer-events: none; }
  .lane.alone { background: rgba(255, 255, 255, .02); border-style: dashed; }
  .t { position: absolute; left: 12px; top: 6px; font-size: 13px; font-weight: 600; color: #9fc3e6; }
  .n { position: absolute; left: 12px; top: 24px; font-size: 11px; color: var(--muted); }
</style>
