<script lang="ts">
  /** #60: a read-only list's "Show all installed mods" switch (default: vanilla, this mod and its listed mods). */
  import { mods } from '../state/mods.svelte'
  import { project } from '../state/project.svelte'
  interface Props { list: string; hidden?: number }
  let { list, hidden = 0 }: Props = $props()
</script>

{#if project.m}
  <label class="sam" title="This list shows vanilla, this mod and the mods in its list (Saga › Mods). Switch on to see every installed mod; picking from one that isn't listed offers to add it.">
    <input type="checkbox" checked={!!mods.showAll[list]} onchange={(e) => (mods.showAll[list] = e.currentTarget.checked)} /> Show all installed mods{#if hidden && !mods.showAll[list]}<span class="muted"> ({hidden} hidden)</span>{/if}
  </label>
{/if}

<style>
  .sam { font-size: 11px; color: var(--muted); display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; text-transform: none; letter-spacing: normal; padding: 0 10px 4px; }
</style>
