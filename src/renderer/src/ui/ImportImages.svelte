<script lang="ts">
  /**
   * Import images into the mod (R5 with R1 resize and R2 crop; docs/DESIGN-PHASE1.md §3): choose
   * files or a folder, pick the kind, check each file's name (the mod's prefix is added), crop it to
   * the kind's shape, and it is resized and converted to PNG. Written on Save, like every image.
   */
  import { onMount, untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Field from './Field.svelte'
  import CropBox from './CropBox.svelte'
  import { IMAGE_KINDS, imageKind, importPath, centredCrop, sameShape, illustrationKey, type ImageKindId } from '../../../shared/imagekinds'
  import { images, app, cleanError } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { loadImage, renderCanvas, toPng } from './imageops'

  interface Props {
    /** A fixed kind (from a picker), or let the user choose. */
    kind?: ImageKindId
    /** Files chosen already (absolute paths). */
    files?: string[]
    onDone: (paths: string[]) => void
    onClose: () => void
  }
  let { kind: fixedKind, files = [], onDone, onClose }: Props = $props()

  interface Item { abs: string; url: string; img: HTMLImageElement; name: string; crop: { x: number; y: number; w: number; h: number }; exists: boolean; replace: boolean; preview: string }
  let kindId = $state<ImageKindId>(untrack(() => fixedKind) ?? 'portrait')
  const kind = $derived(imageKind(kindId))
  let items = $state<Item[]>([])
  let sel = $state(0)
  let busy = $state(false)
  let error = $state<string | null>(null)
  const cur = $derived(items[sel])

  async function add(paths: string[]) {
    error = null
    const fresh: Item[] = []
    for (const abs of paths) {
      try {
        const url = await images.picked(abs)
        if (!url) throw new Error('not an image Saga Forge can read')
        const img = await loadImage(url)
        fresh.push({ abs, url, img, name: importPath(kind, abs, project.prefix), crop: centredCrop(img.naturalWidth, img.naturalHeight, kind), exists: false, replace: false, preview: '' })
      } catch (e) { error = `${abs.replace(/^.*[\\/]/, '')}: ${cleanError(e)}` }
    }
    items = [...items, ...fresh]
    await refresh()
  }
  // the kind changes the names, the crops and the previews
  async function refresh() {
    for (const it of items) {
      it.name = importPath(kind, it.abs, project.prefix)
      if (!it.crop || Math.abs(it.crop.w / it.crop.h - kind.w / kind.h) > 0.01) it.crop = centredCrop(it.img.naturalWidth, it.img.naturalHeight, kind)
    }
    const ex = await window.api.filesExist(items.map((i) => i.name))
    for (const it of items) it.exists = !!ex[it.name] || project.pendingCopies.some((c) => c.to === it.name)
    items = [...items]
    for (const it of items) updatePreview(it)
  }
  function updatePreview(it: Item) {
    const c = renderCanvas(it.img, it.crop, kind.w, kind.h)
    it.preview = c.toDataURL('image/png')
    items = [...items]
  }
  async function choose(folder: boolean) {
    const paths = await window.api.pickImages({ title: folder ? 'Choose a folder of images to import' : 'Choose images to import', folder })
    if (paths.length) await add(paths)
  }

  async function doImport() {
    const blocked = items.filter((i) => i.exists && !i.replace)
    if (blocked.length) { error = `Already in the mod: ${blocked.map((i) => i.name).join(', ')}. Rename them, or tick "replace".`; return }
    busy = true
    try {
      const out: string[] = []
      for (const it of items) {
        const bytes = await toPng(renderCanvas(it.img, it.crop, kind.w, kind.h))
        project.addImage(it.name, bytes, it.exists)
        out.push(it.name)
      }
      if (kind.id === 'illustration') project.change((m) => { for (const p of out) (m.project.illustrations ??= {})[illustrationKey(p)] = p })
      app.flash(`${out.length} image${out.length === 1 ? '' : 's'} imported (written on Save).`)
      onDone(kind.id === 'illustration' ? out.map(illustrationKey) : out)
    } catch (e) { error = cleanError(e) } finally { busy = false }
  }

  onMount(() => { if (files.length) add(files) })
  // only the kind triggers this (refresh() itself rewrites items)
  $effect(() => { void kindId; untrack(() => { if (items.length) refresh() }) })
</script>

<Modal title="Import images" {onClose} width={860}>
  <div class="top">
    <div class="g">
      <Field label="Kind" for="ii-k" help={`${kind.help} Saved as ${kind.w}×${kind.h} PNG in ${kind.folder}/.`}>
        <select id="ii-k" bind:value={kindId} disabled={!!fixedKind}>{#each IMAGE_KINDS as k (k.id)}<option value={k.id}>{k.label} ({k.w}×{k.h})</option>{/each}</select>
      </Field>
    </div>
    <div class="pick"><button onclick={() => choose(false)}>+ Files…</button><button onclick={() => choose(true)} title="Every image directly in a folder">+ A folder…</button></div>
  </div>

  {#if !items.length}
    <p class="muted">Choose one or more images, or a whole folder. Each is cropped to the {kind.label.toLowerCase()}'s shape, resized to {kind.w}×{kind.h} and saved as PNG with the mod's prefix in its name. Nothing is written until you Save.</p>
  {:else}
    <div class="body">
      <ul class="list">
        {#each items as it, i (it.abs)}
          <li class:on={i === sel}><button onclick={() => (sel = i)}>{#if it.preview}<img src={it.preview} alt="" />{/if}<span class="mono">{it.name.replace(/^.*\//, '')}</span>{#if it.exists}<span class="warn">exists</span>{/if}</button></li>
        {/each}
      </ul>
      {#if cur}
        <div class="edit">
          <div class="g">
            <Field label="Saved as" for="ii-n" help={`In the mod. The prefix "${project.prefix}" keeps it apart from other mods' files.`}>
              <input id="ii-n" type="text" class="mono" value={cur.name} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) { cur.name = v.startsWith(kind.folder + '/') ? v : `${kind.folder}/${v.replace(/^.*\//, '')}`; refresh() } }} />
              {#if cur.exists}<label class="chk"><input type="checkbox" bind:checked={cur.replace} /> replace the file already in the mod (the old one goes to sagaforge/backups)</label>{/if}
            </Field>
            <Field label="Crop" help={sameShape(cur.img.naturalWidth, cur.img.naturalHeight, kind) ? `Already the right shape (${cur.img.naturalWidth}×${cur.img.naturalHeight}): it is only resized.` : `${cur.img.naturalWidth}×${cur.img.naturalHeight}, a different shape: drag the frame to choose what to keep, drag its corner to resize it.`}>
              <div class="crop">
                <CropBox url={cur.url} natW={cur.img.naturalWidth} natH={cur.img.naturalHeight} aspect={kind.w / kind.h} crop={cur.crop} onChange={(c) => { cur.crop = c; updatePreview(cur) }} />
                <div class="res"><div class="muted small">Result, {kind.w}×{kind.h}</div>{#if cur.preview}<img src={cur.preview} alt="Result" style="width:{Math.min(kind.w, 200)}px" />{/if}</div>
              </div>
            </Field>
          </div>
          <div class="row"><button class="mini" onclick={() => { items = items.filter((_, i) => i !== sel); sel = Math.max(0, sel - 1) }}>Leave this one out</button></div>
        </div>
      {/if}
    </div>
  {/if}
  {#if error}<div class="bad">{error}</div>{/if}

  {#snippet actions()}<button onclick={onClose}>Cancel</button><button class="primary" disabled={!items.length || busy} onclick={doImport}>{busy ? 'Working…' : `Import ${items.length || ''}`}</button>{/snippet}
</Modal>

<style>
  .top { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 8px; }
  .g { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 2px 10px; flex: 1; }
  .pick { display: flex; gap: 6px; }
  .body { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; }
  .list { list-style: none; margin: 0; padding: 0; max-height: 440px; overflow: auto; border-right: 1px solid var(--border); }
  .list button { display: flex; gap: 6px; align-items: center; width: 100%; border: none; background: none; padding: 3px 4px; text-align: left; font-size: 11px; }
  .list li.on button { background: #1f2a38; }
  .list img { width: 32px; height: 32px; object-fit: contain; background: #000; flex: none; }
  .list .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .warn { color: var(--warn); font-size: 10px; margin-left: auto; }
  .crop { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .res img { display: block; background: #000; border: 1px solid var(--border); }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--warn); }
  .row { margin-top: 6px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .bad { color: var(--bad); margin-top: 8px; font-size: 12px; }
</style>
