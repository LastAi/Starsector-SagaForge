<script lang="ts">
  /**
   * #67 U39 (user, 2026-11-22): a starting list of ships "as a faction's fleets would have them":
   * a faction, a kind of fleet and a size; the variants come from vanilla's ship roles, only hulls the
   * faction knows (vanilla, the mod and its listed mods). Reroll for another draw; the list is a
   * starting point the author edits after adding it.
   */
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Field from './Field.svelte'
  import IdInput from './IdInput.svelte'
  import { app } from '../state/app.svelte'
  import { mods } from '../state/mods.svelte'
  import { project } from '../state/project.svelte'
  import { FLEET_KINDS, factionKnows, ownKnownShips, pickShips, type FleetSize } from '../../../shared/shipsets'

  let { faction: startFaction, onAdd, onClose }: { faction: string; onAdd: (variants: string[], replace: boolean) => void; onClose: () => void } = $props()

  let faction = $state(untrack(() => startFaction) || 'hegemony')
  let kind = $state('patrol')
  let size = $state<FleetSize>('medium')
  let seed = $state(1)
  const index = $derived(app.index)
  const factions = $derived([...(project.m?.factions ?? []).filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })), ...(index?.factions ?? []).map((f) => ({ id: f.id, name: f.name, definedBy: f.definedBy }))])
  const known = $derived(index ? factionKnows(index, faction, mods.visible, ownKnownShips(project.m?.factions ?? [], faction)) : null)
  const result = $derived(index && known ? pickShips(index, known, kind, size, mods.visible, seed) : { variants: [], empty: [] })
  const label = (id: string) => {
    const v = index?.variants.find((x) => x.id === id)
    const h = v?.hull ? index?.hulls.find((x) => x.id === v.hull) : undefined
    return `${h?.name ?? v?.hull ?? id}${v?.displayName ? ` (${v.displayName})` : ''}`
  }
</script>

<Modal title="Ships from a faction's fleet" {onClose} width={640} keepOpen>
  <div class="g">
    <Field label="Faction" help="Whose ships: the hulls it knows (its known ships and blueprint tags), from vanilla and the mods this mod lists.">
      <IdInput value={faction} options={factions} strict onCommit={(v) => { if (v) faction = v }} />
    </Field>
    <Field label="Kind" help="What kind of fleet: which of vanilla's ship roles fill it (warships, carriers, freighters…).">
      <select bind:value={kind}>{#each FLEET_KINDS as k (k.id)}<option value={k.id}>{k.label}</option>{/each}</select>
    </Field>
    <Field label="Size" help="About how many ships of each role. A starting point: you change the list after adding it.">
      <select bind:value={size}><option value="small">small</option><option value="medium">medium</option><option value="large">large</option></select>
    </Field>
  </div>
  <div class="sect">Ships <button class="mini" onclick={() => (seed = seed + 1)} title="Another draw by vanilla's weights">Reroll</button></div>
  {#if !result.variants.length}
    <p class="muted">The faction knows no ships for this kind of fleet{result.empty.length ? ` (${result.empty.join(', ')})` : ''}. Try another kind or faction.</p>
  {:else}
    <ol class="list">{#each result.variants as v, i (i)}<li><span>{label(v)}</span> <span class="mono muted small">{v}</span></li>{/each}</ol>
    {#if result.empty.length}<p class="muted small">Nothing the faction knows for: {result.empty.join(', ')}.</p>{/if}
  {/if}
  {#snippet actions()}
    <button onclick={onClose}>Cancel</button>
    <button disabled={!result.variants.length} onclick={() => onAdd(result.variants, true)} title="Replace the fleet's ships with these">Replace the ships</button>
    <button class="primary" disabled={!result.variants.length} onclick={() => onAdd(result.variants, false)}>Add {result.variants.length || ''}</button>
  {/snippet}
</Modal>

<style>
  .g { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 2px 10px; }
  .sect { margin: 10px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; gap: 8px; align-items: center; }
  .list { margin: 0; padding-left: 22px; max-height: 300px; overflow: auto; font-size: 12px; }
  .list li { padding: 1px 0; }
  .mini { padding: 0 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .small { font-size: 11px; }
</style>
