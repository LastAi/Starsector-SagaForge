<script lang="ts">
  /** A stage's group frame on the quest chart (PLAN.md §5): behind the nodes, labelled with the stage. */
  interface Props { data: { label: string; color: string; w: number; h: number } }
  let { data }: Props = $props()
</script>

<div class="frame" style="width:{data.w}px;height:{data.h}px;border-color:{data.color};background:{data.color}10">
  <span style="color:{data.color}">{data.label}</span>
</div>

<style>
  .frame { border: 1px dashed; border-radius: 10px; pointer-events: none; position: relative; }
  span { position: absolute; top: -10px; left: 12px; font-size: 11px; padding: 0 6px; background: #0f1216; }
</style>
