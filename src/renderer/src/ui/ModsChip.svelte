<script lang="ts">
  /** #60: the chip on an item's card and in lists: "only with Nexerelin" (dashed when part of it is set automatically). */
  import { condText, isNone } from '../../../shared/modlist'
  import { mods } from '../state/mods.svelte'
  interface Props { itemKey: string }
  let { itemKey }: Props = $props()
  const c = $derived(mods.effective.get(itemKey))
  const name = (id: string) => mods.name(id)
</script>

{#if c && !isNone(c.eff)}
  <span class="mchip" class:auto={c.from.length > 0} title={c.from.length ? c.from.map((f) => `${condText(f.cond, name)} (${f.why})`).join('\n') : 'Only with / Only without mods (Saga › Mods)'}>{condText(c.eff, name)}</span>
{/if}

<style>
  .mchip { font-size: 10px; border: 1px solid var(--accent-2); color: var(--accent); border-radius: 9px; padding: 0 6px; white-space: nowrap; margin-left: 4px; }
  .mchip.auto { border-style: dashed; }
</style>
