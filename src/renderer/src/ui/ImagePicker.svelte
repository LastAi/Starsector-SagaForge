<script lang="ts">
  /**
   * Choose an image by its picture (R28; docs/DESIGN-PHASE1.md §3): the mod's own images of the
   * kind first, then the game's and other mods' (marked by source), with a search box and Import….
   * Illustrations are chosen by key (their settings.json name), everything else by path.
   */
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'
  import ImageView from './ImageView.svelte'
  import ImportImages from './ImportImages.svelte'
  import { imageKind } from '../../../shared/imagekinds'
  import { picker } from '../state/imagepicker.svelte'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'

  const req = $derived(picker.req!)
  const kind = $derived(imageKind(req.kind))
  const isIll = $derived(req.kind === 'illustration')
  interface Entry { value: string; path: string; sourceId: string; mine: boolean }
  let all = $state<Entry[]>([])
  let loading = $state(true)
  let filter = $state('')
  let chosen = $state<string[]>([])
  let importing = $state(false)
  /** Walk F31: Import… goes straight to the file dialog (the kind is known), then the crop step. */
  let importFiles = $state<string[]>([])
  async function startImport() {
    const paths = await window.api.pickImages({ title: `Choose ${kind.label.toLowerCase()} images to import` })
    if (!paths.length) return
    importFiles = paths
    importing = true
  }
  const own = $derived(project.loaded?.sourceId ?? '')
  const srcName = (id: string) => (id === 'starsector-core' ? 'vanilla' : id === own ? 'this mod' : app.index?.sources.find((s) => s.id === id)?.name ?? id)

  async function load() {
    loading = true
    let list: Entry[]
    if (isIll) {
      // illustrations: by key, from the game's and mods' settings.json, plus this mod's own
      const mine = Object.entries(project.m?.project.illustrations ?? {}).map(([k, p]) => ({ value: k, path: p, sourceId: own, mine: true }))
      const game = (app.index?.illustrations ?? []).filter((i) => i.category === 'illustrations' && !mine.some((x) => x.value === i.key)).map((i) => ({ value: i.key, path: i.path, sourceId: i.definedBy, mine: false }))
      list = [...mine, ...game]
    } else {
      const found = await window.api.listImages(kind.folder)
      const pending = project.pendingCopies.filter((c) => c.to.startsWith(`${kind.folder}/`) && !found.some((f) => f.path === c.to)).map((c) => ({ path: c.to, sourceId: own }))
      list = [...pending, ...found].map((f) => ({ value: f.path, path: f.path, sourceId: f.sourceId, mine: f.sourceId === own }))
      // walk F31: flags and crests share graphics/factions; vanilla names crests "crest_…"
      const isCrest = (p: string) => /crest/i.test(p.replace(/^.*\//, ''))
      if (kind.id === 'flag') list = list.filter((x) => !isCrest(x.path))
      if (kind.id === 'crest') list = list.filter((x) => isCrest(x.path))
    }
    // the mod's own first, then by path
    all = list.sort((a, b) => (a.mine === b.mine ? a.path.localeCompare(b.path) : a.mine ? -1 : 1))
    loading = false
  }
  onMount(load)

  const shown = $derived.by(() => {
    const f = filter.trim().toLowerCase()
    return (f ? all.filter((e) => `${e.value} ${e.path} ${srcName(e.sourceId)}`.toLowerCase().includes(f)) : all).slice(0, 400)
  })
  const matches = $derived(filter.trim() ? all.filter((e) => `${e.value} ${e.path} ${srcName(e.sourceId)}`.toLowerCase().includes(filter.trim().toLowerCase())).length : all.length)

  function click(v: string) {
    if (!req.multi) { picker.close([v]); return }
    chosen = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]
  }
</script>

<Modal title={req.title ?? `Choose ${req.multi ? 'images' : 'an image'}: ${kind.label.toLowerCase()} (${kind.w}×${kind.h})`} onClose={() => picker.close([])} width={900}>
  <div class="bar">
    <input type="search" placeholder="Filter by name or source…" bind:value={filter} />
    <span class="muted small">{loading ? 'Reading the game and mods…' : `${matches} image${matches === 1 ? '' : 's'}${matches > shown.length ? `, first ${shown.length} shown: filter to narrow` : ''}`}</span>
    <span class="spacer"></span>
    <button onclick={startImport} title="Bring your own images into the mod: pick the files, then crop; resized and named with the prefix">Import…</button>
  </div>
  <div class="grid">
    {#each shown as e (e.value + e.sourceId)}
      <button class="tile" class:on={chosen.includes(e.value) || req.current === e.value} class:mine={e.mine} onclick={() => click(e.value)} title={`${e.path} (${srcName(e.sourceId)})`}>
        <ImageView path={e.path} sourceId={e.sourceId} w={kind.w >= kind.h ? 120 : Math.round(96 * kind.w / kind.h)} h={kind.w >= kind.h ? Math.round(120 * kind.h / kind.w) : 96} />
        <span class="name mono">{(isIll ? e.value : e.path.replace(/^.*\//, '')).slice(0, 28)}</span>
        <span class="src">{srcName(e.sourceId)}</span>
      </button>
    {:else}{#if !loading}<p class="muted">No {kind.label.toLowerCase()} images found{filter ? ' for this filter' : ''}. Import… brings your own into the mod.</p>{/if}{/each}
  </div>
  {#snippet actions()}
    <button onclick={() => picker.close([])}>Cancel</button>
    {#if req.multi}<button class="primary" disabled={!chosen.length} onclick={() => picker.close(chosen)}>Add {chosen.length || ''}</button>{/if}
  {/snippet}
</Modal>

{#if importing}
  <ImportImages kind={req.kind} files={importFiles} onClose={() => (importing = false)} onDone={(paths) => { importing = false; if (req.multi) { chosen = [...chosen, ...paths]; load() } else picker.close(paths.slice(0, 1)) }} />
{/if}

<style>
  .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .bar input { width: 260px; }
  .spacer { flex: 1; }
  .small { font-size: 11px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; max-height: 60vh; overflow: auto; padding: 2px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px; border: 1px solid var(--border); border-radius: 6px; background: #161a20; min-width: 0; }
  .tile.mine { border-color: #2f6b38; }
  .tile.on { border-color: var(--accent); background: #1f2a38; }
  .name { font-size: 10px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .src { font-size: 10px; color: var(--muted); }
</style>
