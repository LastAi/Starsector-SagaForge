<script lang="ts">
  /**
   * The mod's images (R5; docs/DESIGN-PHASE1.md §3): by kind, as thumbnails with their size, a badge
   * when the size isn't vanilla's for that kind, and Import… (files or a folder; crop, resize, PNG,
   * the mod's prefix). Images waiting for Save are shown too.
   */
  import { IMAGE_KINDS, imageKind, type ImageKindId } from '../../../shared/imagekinds'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { images } from '../state/app.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import ImportImages from '../ui/ImportImages.svelte'
  import { loadImage } from '../ui/imageops'

  let kindId = $state<ImageKindId>((app.smoke ? (app.smokeArg as ImageKindId) : null) ?? 'portrait')
  const kind = $derived(imageKind(kindId))
  const own = $derived(project.loaded?.sourceId ?? '')
  let files = $state<{ path: string; pending: boolean; size?: { w: number; h: number } }[]>([])
  let loading = $state(false)
  // screenshot mode: "images:::import=<path>;<path>" opens the import dialog with these files (| stands for :)
  const smokeFiles = app.smokeModal?.startsWith('import=') ? app.smokeModal.slice(7).split(';').map((p) => p.split('|').join(':')) : []
  let importing = $state(app.smokeModal === 'import' || smokeFiles.length > 0)

  /** Flags and crests share graphics/factions: a file is a crest when its name says so. */
  const belongs = (p: string) => (kindId === 'crest' ? /crest/i.test(p) : kindId === 'flag' ? !/crest/i.test(p) : true)

  async function load() {
    if (!project.loaded) { files = []; return }
    loading = true
    const found = (await window.api.listImages(kind.folder)).filter((f) => f.sourceId === own).map((f) => f.path)
    const pending = project.pendingCopies.filter((c) => c.to.startsWith(`${kind.folder}/`)).map((c) => c.to)
    files = [...new Set([...pending, ...found])].filter(belongs).sort().map((p) => ({ path: p, pending: pending.includes(p) }))
    loading = false
    // sizes, read from the images themselves
    for (const f of files) {
      const c = project.pendingCopies.find((x) => x.to === f.path)
      const url = c?.bytes ? URL.createObjectURL(new Blob([c.bytes as BlobPart], { type: 'image/png' })) : c?.from ? await images.picked(c.from) : await images.url(f.path, own)
      if (!url) continue
      try { const img = await loadImage(url); f.size = { w: img.naturalWidth, h: img.naturalHeight }; files = [...files] } catch { /* unreadable: no size */ }
    }
  }
  $effect(() => { void kindId; void project.pendingCopies.length; void project.loaded; load() })
  const counts = $derived(files.filter((f) => f.size && (f.size.w !== kind.w || f.size.h !== kind.h)).length)
</script>

<div class="page">
  <aside class="left">
    <div class="sect">Kinds</div>
    <ul class="list">
      {#each IMAGE_KINDS as k (k.id)}<li class:on={k.id === kindId}><button class="li" onclick={() => (kindId = k.id)}><span>{k.label}</span><span class="sub">{k.w}×{k.h}</span></button></li>{/each}
    </ul>
    <p class="muted small pad">Images live in the mod's <span class="mono">graphics/</span> folders. Import… crops and resizes them to the size vanilla uses for each kind, converts them to PNG and adds the mod's prefix to the name. They are written on Save.</p>
  </aside>
  <section class="main">
    <div class="head">
      <h2>{kind.label}</h2><span class="muted small">{kind.help} {kind.w}×{kind.h} PNG in <span class="mono">{kind.folder}/</span></span>
      <span class="spacer"></span>
      <button class="primary" disabled={!project.m} onclick={() => (importing = true)}>Import…</button>
    </div>
    {#if !project.m}
      <div class="center muted">Pick an active mod first.</div>
    {:else if loading && !files.length}
      <div class="center muted">Reading…</div>
    {:else if !files.length}
      <div class="center muted">No {kind.label.toLowerCase()} images in this mod yet. Import… brings your own in.</div>
    {:else}
      {#if counts}<p class="warn small pad">{counts} image{counts === 1 ? '' : 's'} not at {kind.w}×{kind.h}: the game shows {counts === 1 ? 'it' : 'them'} scaled. Re-import to fix (tick "replace").</p>{/if}
      <div class="grid">
        {#each files as f (f.path)}
          <div class="tile" class:bad={f.size && (f.size.w !== kind.w || f.size.h !== kind.h)}>
            <ImageView path={f.path} w={kind.w >= kind.h ? 140 : Math.round(110 * kind.w / kind.h)} h={kind.w >= kind.h ? Math.round(140 * kind.h / kind.w) : 110} />
            <span class="mono name" title={f.path}>{f.path.replace(/^.*\//, '')}</span>
            <span class="small">{f.size ? `${f.size.w}×${f.size.h}` : ''}{f.pending ? ' · waiting for Save' : ''}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

{#if importing}
  <ImportImages kind={kindId} files={smokeFiles} onClose={() => (importing = false)} onDone={() => { importing = false; load() }} />
{/if}

<style>
  .page { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { display: flex; gap: 8px; width: 100%; border: none; background: none; padding: 4px 8px; text-align: left; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; padding: 12px; overflow: auto; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: #161a20; min-width: 0; }
  .tile.bad { border-color: var(--warn); }
  .name { font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .center { display: grid; place-items: center; flex: 1; padding: 20px; text-align: center; }
  .small { font-size: 11px; }
  .pad { padding: 6px 12px; }
  .warn { color: var(--warn); }
</style>
