<script lang="ts">
  /**
   * #67 U38 (user, 2026-11-22): the mod's originals (sagaforge/originals, Images › Original) as a grid
   * of medium previews; pick one or more and the import dialog makes a cropped, resized copy for its
   * kind (the original stays). Originals waiting for Save are offered too.
   */
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'
  import ImageView from './ImageView.svelte'
  import { ORIGINALS_FOLDER } from '../../../shared/imagekinds'
  import { project } from '../state/project.svelte'

  /** Each picked original: the file to read and its name in the mod (toc_jane), which the copy starts from. */
  let { onPick, onClose }: { onPick: (picked: { abs: string; name: string }[]) => void; onClose: () => void } = $props()
  const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

  /** path in the mod → the file to read (on disk, or the picked file waiting for Save) */
  let list = $state<{ path: string; abs: string }[]>([])
  let loading = $state(true)
  let q = $state('')
  let chosen = $state<string[]>([])
  const shown = $derived(list.filter((x) => !q.trim() || x.path.toLowerCase().includes(q.trim().toLowerCase())))
  const toggle = (p: string) => (chosen = chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p])

  onMount(async () => {
    const own = project.loaded?.sourceId
    const dir = (project.loaded?.modDir ?? '').replace(/\\/g, '/')
    const gone = new Set(project.pendingCopies.filter((c) => c.remove).map((c) => c.to))
    const found = (await window.api.listImages(ORIGINALS_FOLDER)).filter((f) => f.sourceId === own && !gone.has(f.path)).map((f) => ({ path: f.path, abs: `${dir}/${f.path}` }))
    const pending = project.pendingCopies.filter((c) => !c.remove && c.from && c.to.startsWith(`${ORIGINALS_FOLDER}/`)).map((c) => ({ path: c.to, abs: c.from! }))
    list = [...pending, ...found.filter((f) => !pending.some((p) => p.path === f.path))].sort((a, b) => a.path.localeCompare(b.path))
    loading = false
  })
</script>

<Modal title="Import from Originals" {onClose} width={820} keepOpen>
  <div class="bar">
    <input type="search" placeholder="Filter by name…" bind:value={q} />
    <span class="muted small">Click to select one or more. Each becomes a cropped, resized copy; the original stays in <span class="mono">{ORIGINALS_FOLDER}/</span>.</span>
  </div>
  {#if loading}
    <p class="muted">Reading…</p>
  {:else if !list.length}
    <p class="muted">No originals in this mod yet. Images › Original (not in the game) › Import… keeps your source images there as they are.</p>
  {:else}
    <div class="grid">
      {#each shown as o (o.path)}
        <button class="tile" class:sel={chosen.includes(o.path)} onclick={() => toggle(o.path)} ondblclick={() => onPick([{ abs: o.abs, name: nameOf(o.path) }])} title={o.path}>
          <ImageView path={o.path} w={180} h={140} />
          <span class="mono name">{o.path.replace(/^.*\//, '')}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#snippet actions()}<button onclick={onClose}>Cancel</button><button class="primary" disabled={!chosen.length} onclick={() => onPick(list.filter((o) => chosen.includes(o.path)).map((o) => ({ abs: o.abs, name: nameOf(o.path) })))}>Use {chosen.length || ''}</button>{/snippet}
</Modal>

<style>
  .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .bar input { width: 220px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 8px; max-height: 480px; overflow: auto; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: #161a20; color: inherit; cursor: pointer; min-width: 0; }
  .tile.sel { border-color: var(--accent); background: #1f2a38; box-shadow: 0 0 0 1px var(--accent); }
  .name { font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .small { font-size: 11px; }
</style>
