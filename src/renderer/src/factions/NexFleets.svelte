<script lang="ts">
  /**
   * #63: Nexerelin's ready-made fleets of a faction config (startShips<Type>: a list of fleets, a
   * fleet a list of variant ids), on Fleets › New-game fleets. Used for the mod's own factions and
   * for the fleets it adds to the player faction (player.json, appended to Nexerelin's).
   */
  import { NEX_START_FLEETS, startFleets, type NexConfig } from '../../../shared/nexconfig'
  import IdInput from '../ui/IdInput.svelte'

  interface Props {
    config: NexConfig
    variantOptions: { id: string; name?: string }[]
    /** Apply an edit to the config (through the undo history). */
    onEdit: (fn: (c: NexConfig) => void) => void
  }
  let { config, variantOptions, onEdit }: Props = $props()

  const fleets = $derived(startFleets(config))
  const shown = $derived(NEX_START_FLEETS.filter((t) => fleets[t.key]?.length))
  function editFleets(key: string, fn: (l: string[][]) => string[][]) {
    onEdit((c) => {
      const cur = Array.isArray(c[key]) ? (c[key] as unknown[]).filter(Array.isArray).map((f) => (f as unknown[]).map(String)) : []
      const next = fn(cur).filter((f) => f.length)
      if (next.length) c[key] = next
      else delete c[key]
    })
  }
  let addType = $state('startShipsSolo')
  /** #67: "+ another fleet" did nothing (an empty fleet isn't stored): a new row waits here for its first ship. */
  let adding = $state<Record<string, boolean>>({})
  const known = (id: string) => !variantOptions.length || variantOptions.some((o) => o.id === id)
</script>

{#each shown as t (t.key)}
  <div class="fleettype">
    <span class="ft">{t.label}</span>
    <div class="fl">
      {#each fleets[t.key] as fl, fi (fi)}
        <div class="chips">
          <span class="muted small">#{fi + 1}</span>
          {#each fl as ship, si (si)}
            <span class="chip mono" title={variantOptions.find((o) => o.id === ship)?.name ?? 'unknown variant'} class:bad={!known(ship)}>{ship}<button class="x" title="Remove" onclick={() => editFleets(t.key, (l) => l.map((x, i) => (i === fi ? x.filter((_, j) => j !== si) : x)))}>✕</button></span>
          {/each}
          <span class="addchip"><IdInput value="" options={variantOptions} placeholder="+ variant…" width="170px" clearOnCommit onCommit={(id) => { if (id) editFleets(t.key, (l) => l.map((x, i) => (i === fi ? [...x, id] : x))) }} /></span>
          <button class="mini" title="Remove this fleet" onclick={() => editFleets(t.key, (l) => l.filter((_, i) => i !== fi))}>✕ fleet</button>
        </div>
      {/each}
      {#if adding[t.key]}
        <div class="chips">
          <span class="muted small">#{fleets[t.key].length + 1}</span>
          <span class="addchip"><IdInput value="" options={variantOptions} placeholder="first variant…" width="170px" clearOnCommit onCommit={(id) => { if (id) { editFleets(t.key, (l) => [...l, [id]]); adding[t.key] = false } }} /></span>
          <button class="mini" onclick={() => (adding[t.key] = false)}>Cancel</button>
        </div>
      {:else}
        <button class="mini" onclick={() => (adding[t.key] = true)}>+ another {t.label.toLowerCase()} fleet</button>
      {/if}
    </div>
  </div>
{:else}<div class="muted small">No ready-made fleets yet.</div>{/each}
<div class="row2">
  <select bind:value={addType}>{#each NEX_START_FLEETS as t (t.key)}<option value={t.key}>{t.label}</option>{/each}</select>
  <IdInput value="" options={variantOptions} placeholder="first ship (variant id)…" width="220px" clearOnCommit onCommit={(id) => { if (id) editFleets(addType, (l) => [...l, [id]]) }} />
  <span class="muted small">adds a new fleet of that type</span>
</div>

<style>
  .fleettype { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 6px; padding: 4px 0; border-bottom: 1px solid #1e242c; }
  .ft { font-size: 12px; }
  .fl { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 4px; }
  .chip.bad { border-color: var(--bad); color: var(--bad); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; color: var(--muted); }
  .chip .x:hover { color: var(--bad); }
  .addchip :global(input) { font-size: 11px; padding: 1px 6px; border-radius: 10px; }
  .row2 { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 12px; }
</style>
