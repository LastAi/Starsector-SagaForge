<script lang="ts">
  /**
   * Choose a planet, star or custom entity type by its picture (R18–R20; DESIGN-PHASE3.md §3–4):
   * filter chips by what the type is, a search, and for planets "fits here" from vanilla's random
   * generation (an estimate, never a rule).
   */
  import { untrack } from 'svelte'
  import Modal from '../ui/Modal.svelte'
  import TypeThumb from './TypeThumb.svelte'
  import { app } from '../state/app.svelte'
  import { ENTITY_GROUPS, PLANET_GROUPS, defaultEntityGroup, planetFits } from '../../../shared/celestial'
  import type { EntityTypeInfo, PlanetTypeInfo } from '../../../shared/api'

  interface Props {
    kind: 'planet' | 'star' | 'entity'
    current: string
    /** Planets: the star and orbit index for "fits here". */
    fit?: { starType: string; orbitIdx: number } | null
    /** Entities: the entity's kind, which picks the starting filter. */
    entityKind?: string
    /** Extra types (the mod's own, R21). */
    ownPlanets?: PlanetTypeInfo[]
    ownEntities?: EntityTypeInfo[]
    onPick: (id: string) => void
    onClose: () => void
  }
  let { kind, current, fit = null, entityKind = '', ownPlanets = [], ownEntities = [], onPick, onClose }: Props = $props()

  const index = $derived(app.index!)
  let q = $state('')
  // the starting filter only (the user changes it after)
  let group = $state<string | null>(untrack(() => (kind === 'entity' ? defaultEntityGroup(entityKind) : null)))
  let fitsOnly = $state(false)

  const catOf = $derived(new Map((index.procgen?.types ?? []).map((t) => [t.id, t.category])))
  const fits = $derived(kind === 'planet' && fit && index.procgen ? planetFits(index.procgen, fit.starType, fit.orbitIdx) : [])
  const fitOf = (id: string) => fits.find((f) => f.id === id)
  const srcName = (id: string) => (id === 'mine' ? 'this mod' : id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id)
  const match = (id: string, name: string) => !q || `${id} ${name}`.toLowerCase().includes(q.toLowerCase())

  const planets = $derived.by(() => {
    const all = [...ownPlanets, ...index.planetTypes.filter((t) => !ownPlanets.some((o) => o.id === t.id))]
    const list = all.filter((t) => (kind === 'star' ? t.isStar : !t.isStar) && match(t.id, t.name))
      .filter((t) => !group || PLANET_GROUPS.find((g) => g.id === group)!.test(t.id, catOf.get(t.id)))
      .filter((t) => !fitsOnly || fitOf(t.id)?.fits)
    if (!fits.length) return list
    const w = (id: string) => fitOf(id)?.weight ?? -1
    return [...list].sort((a, b) => w(b.id) - w(a.id))
  })
  // the game's internal types (base_*, map labels with no picture) only under "Other"
  const internal = (t: EntityTypeInfo) => /^base_/.test(t.id) || (!t.sprite && !t.sheet && !t.icon)
  const entities = $derived([...ownEntities, ...index.customEntityTypes.filter((t) => !ownEntities.some((o) => o.id === t.id))]
    .filter((t) => match(t.id, t.name) && (!group || ENTITY_GROUPS.find((g) => g.id === group)!.test(t)) && (group === 'other' || !internal(t) || t.id === current)))
  const groups = $derived(kind === 'entity' ? ENTITY_GROUPS.map((g) => ({ id: g.id, label: g.label })) : kind === 'planet' ? PLANET_GROUPS.map((g) => ({ id: g.id, label: g.label })) : [])
</script>

<Modal title={kind === 'star' ? 'Choose a star type' : kind === 'planet' ? 'Choose a planet type' : 'Choose an entity type'} width={900} onClose={onClose}>
  <div class="bar">
    <input type="search" placeholder="Filter by name or id…" bind:value={q} />
    {#if groups.length}
      <div class="chips">
        <button class:on={!group} onclick={() => (group = null)}>All</button>
        {#each groups as g (g.id)}<button class:on={group === g.id} onclick={() => (group = group === g.id ? null : g.id)}>{g.label}</button>{/each}
      </div>
    {/if}
    {#if kind === 'planet' && fits.length}
      <label class="small"><input type="checkbox" bind:checked={fitsOnly} /> Fits here only</label>
    {/if}
  </div>
  {#if kind === 'planet'}
    <p class="muted small">{fits.length ? `Sorted by how likely vanilla's random generation is to put each type at this orbit of a ${fit?.starType} (orbit ${fit?.orbitIdx}, an estimate). "Fits here" marks the likely ones; any type can be used.` : 'No recommendation for this star type (vanilla\'s generation tables don\'t list it).'}</p>
  {:else if kind === 'entity'}
    <p class="muted small">Types from custom_entities.json of the game, the installed mods and this mod. The filter starts at what this kind of entity usually is.</p>
  {/if}
  <div class="grid">
    {#if kind === 'entity'}
      {#each entities as t (t.id)}
        <button class="card" class:on={t.id === current} onclick={() => onPick(t.id)} title={t.tags.join(', ')}>
          <TypeThumb entity={t} size={64} />
          <span class="nm">{t.name}</span><span class="mono id">{t.id}</span><span class="src">{srcName(t.definedBy)}</span>
        </button>
      {:else}<div class="muted">No type matches.</div>{/each}
    {:else}
      {#each planets as t (t.id)}
        {@const f = fitOf(t.id)}
        <button class="card" class:on={t.id === current} onclick={() => onPick(t.id)}>
          <TypeThumb planet={t} size={64} />
          <span class="nm">{t.name}</span><span class="mono id">{t.id}</span>
          <span class="src">{srcName(t.definedBy)}{#if f?.fits} · <b class="fit">fits here</b>{:else if fits.length && f && !f.weight} · <span class="odd">unusual here</span>{/if}</span>
        </button>
      {:else}<div class="muted">No type matches.</div>{/each}
    {/if}
  </div>
  {#snippet actions()}<button onclick={onClose}>Cancel</button>{/snippet}
</Modal>

<style>
  .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
  .bar input[type='search'] { width: 220px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { padding: 1px 9px; font-size: 11px; border-radius: 10px; }
  .chips button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; max-height: 60vh; overflow: auto; padding: 2px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; text-align: center; background: #161a20; }
  .card.on { outline: 2px solid var(--accent); }
  .nm { font-size: 12px; }
  .id { font-size: 10px; color: var(--muted); word-break: break-all; }
  .src { font-size: 10px; color: var(--muted); }
  .fit { color: var(--good); font-weight: normal; }
  .odd { color: var(--warn); }
  .small { font-size: 12px; }
</style>
