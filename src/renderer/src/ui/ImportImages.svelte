<script lang="ts">
  /**
   * Import images into the mod (R5 with R1 resize and R2 crop; docs/DESIGN-PHASE1.md §3): choose
   * files or a folder, pick the kind, name each one (the mod's prefix is added), crop it to the
   * kind's shape, and it is resized and converted to PNG. Written on Save, like every image.
   * #67 U38 (user, 2026-11-22): a Name field (the path is only a preview: editing the path was
   * overwritten), the Original kind (kept as it is in sagaforge/originals), a red crop frame when the
   * result is enlarged, and "+ From Originals…" (a copy of an original, cropped for the kind).
   */
  import { onMount, untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Field from './Field.svelte'
  import CropBox from './CropBox.svelte'
  import OriginalsPicker from './OriginalsPicker.svelte'
  import { IMAGE_KINDS, imageKind, importName, kindPath, kindSize, isOriginal, upscales, centredCrop, sameShape, illustrationKey, type ImageKindId } from '../../../shared/imagekinds'
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

  /** `name`: the file name without folder and extension; `named`: typed by the user (the kind doesn't change it). */
  interface Item { abs: string; url: string; img: HTMLImageElement; /** The name it starts from: the file's, or an original's name in the mod. */ base: string; name: string; named: boolean; crop: { x: number; y: number; w: number; h: number }; exists: boolean; replace: boolean; preview: string }
  let kindId = $state<ImageKindId>(untrack(() => fixedKind) ?? 'portrait')
  const kind = $derived(imageKind(kindId))
  const original = $derived(isOriginal(kind))
  let items = $state<Item[]>([])
  let sel = $state(0)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let pickingOriginals = $state(false)
  /**
   * #67 U38 (user, 2026-11-22): the previews' background, to see where an image is transparent
   * (only the preview: transparency is kept in the files). Remembered.
   */
  const BACKGROUNDS = { black: '#000', grey: '#7d7d7d', checkers: 'repeating-conic-gradient(#a8a8a8 0% 25%, #e2e2e2 0% 50%) 0 0 / 14px 14px' } as const
  let bg = $state<keyof typeof BACKGROUNDS>((localStorage.getItem('sf.imgbg') as keyof typeof BACKGROUNDS) in BACKGROUNDS ? (localStorage.getItem('sf.imgbg') as keyof typeof BACKGROUNDS) : 'black')
  $effect(() => { try { localStorage.setItem('sf.imgbg', bg) } catch { /* ignore */ } })
  const cur = $derived(items[sel])
  const pathOf = (it: Item) => kindPath(kind, it.name, it.abs)
  const fileBase = (abs: string) => abs.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')

  /** `bases`: the names to start from (an original's name in the mod, e.g. toc_jane); else the file's. */
  async function add(paths: string[], bases: string[] = []) {
    error = null
    const fresh: Item[] = []
    for (const [i, abs] of paths.entries()) {
      const base = bases[i] ?? fileBase(abs)
      try {
        const url = await images.picked(abs)
        if (!url) throw new Error('not an image Saga Forge can read')
        const img = await loadImage(url)
        fresh.push({ abs, url, img, base, name: importName(kind, base, project.prefix), named: false, crop: centredCrop(img.naturalWidth, img.naturalHeight, kind), exists: false, replace: false, preview: '' })
      } catch (e) { error = `${abs.replace(/^.*[\\/]/, '')}: ${cleanError(e)}` }
    }
    items = [...items, ...fresh]
    await refresh()
  }
  // the kind changes the names (unless typed), the crops and the previews
  async function refresh() {
    for (const it of items) {
      it.name = importName(kind, it.named ? it.name : it.base, project.prefix)
      if (!it.crop || original || Math.abs(it.crop.w / it.crop.h - kind.w / kind.h) > 0.01) it.crop = centredCrop(it.img.naturalWidth, it.img.naturalHeight, kind)
    }
    await checkExisting()
    for (const it of items) updatePreview(it)
  }
  async function checkExisting() {
    const ex = await window.api.filesExist(items.map(pathOf))
    for (const it of items) it.exists = !!ex[pathOf(it)] || project.pendingCopies.some((c) => c.to === pathOf(it) && !c.remove)
    items = [...items]
  }
  function updatePreview(it: Item) {
    it.preview = original ? it.url : renderCanvas(it.img, it.crop, kind.w, kind.h).toDataURL('image/png')
    items = [...items]
  }
  async function rename(it: Item, typed: string) {
    if (!typed.trim()) return
    it.name = importName(kind, typed, project.prefix)
    it.named = true
    it.replace = false
    await checkExisting()
  }
  async function choose(folder: boolean) {
    const paths = await window.api.pickImages({ title: folder ? 'Choose a folder of images to import' : 'Choose images to import', folder })
    if (paths.length) await add(paths)
  }

  async function doImport() {
    const blocked = items.filter((i) => i.exists && !i.replace)
    if (blocked.length) { error = `Already in the mod: ${blocked.map(pathOf).join(', ')}. Rename them, or tick "replace".`; return }
    const twice = items.map(pathOf).find((p, i, a) => a.indexOf(p) !== i)
    if (twice) { error = `Two images would be saved as ${twice}: rename one.`; return }
    busy = true
    try {
      const out: string[] = []
      for (const it of items) {
        const to = pathOf(it)
        // an original is copied as it is; the others are cropped, resized and made PNG
        if (original) project.copyIn(it.abs, to, it.exists)
        else project.addImage(to, await toPng(renderCanvas(it.img, it.crop, kind.w, kind.h)), it.exists)
        out.push(to)
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

<Modal title="Import images" {onClose} width={860} keepOpen>
  <div class="top">
    <div class="g">
      <Field label="Kind" for="ii-k" help={original ? kind.help : `${kind.help} Saved as ${kind.w}×${kind.h} PNG in ${kind.folder}/.`}>
        <select id="ii-k" bind:value={kindId} disabled={!!fixedKind}>{#each IMAGE_KINDS as k (k.id)}<option value={k.id}>{k.label} ({kindSize(k)})</option>{/each}</select>
      </Field>
    </div>
    <div class="pick">
      <button onclick={() => choose(false)}>+ Files…</button><button onclick={() => choose(true)} title="Every image directly in a folder">+ A folder…</button>
      {#if !original}<button onclick={() => (pickingOriginals = true)} title="Your originals in sagaforge/originals (Images › Original): a cropped, resized copy for this kind; the original stays">+ From Originals…</button>{/if}
    </div>
  </div>

  {#if !items.length}
    <p class="muted">{original ? 'Choose one or more images, or a whole folder. Each is kept as it is (no crop, no resize, same format), renamed with the mod\'s prefix, in sagaforge/originals/. Nothing is written until you Save.' : `Choose one or more images, a whole folder, or your originals. Each is cropped to the ${kind.label.toLowerCase()}'s shape, resized to ${kind.w}×${kind.h} and saved as PNG with the mod's prefix in its name. Nothing is written until you Save.`}</p>
  {:else}
    <div class="bgsw" role="group" aria-label="Preview background"><span class="muted small">Preview background</span>{#each Object.keys(BACKGROUNDS) as k (k)}<button class="mini" class:on={bg === k} onclick={() => (bg = k as keyof typeof BACKGROUNDS)} title="Only the preview: transparent parts stay transparent in the file">{k}</button>{/each}</div>
    <div class="body" style="--imgbg: {BACKGROUNDS[bg]}">
      <ul class="list">
        {#each items as it, i (it.abs)}
          <li class:on={i === sel}><button onclick={() => (sel = i)}>{#if it.preview}<img src={it.preview} alt="" />{/if}<span class="mono">{it.name}</span>{#if it.exists}<span class="warn">exists</span>{/if}{#if !original && upscales(it.crop, kind)}<span class="up" title="Smaller than {kind.w}×{kind.h}: it will be enlarged">↑</span>{/if}</button></li>
        {/each}
      </ul>
      {#if cur}
        <div class="edit">
          <div class="g">
            <Field label="Name" for="ii-n" help={`The file's name. The prefix "${project.prefix}" is added (it keeps the mod's files apart from other mods'); spaces become _.`}>
              {#key cur.abs}<input id="ii-n" type="text" class="mono" value={cur.name} onchange={(e) => { if (e.currentTarget.value.trim()) rename(cur, e.currentTarget.value); else e.currentTarget.value = cur.name }} />{/key}
            </Field>
            <Field label="Saved as" help={original ? 'In the mod, where the game never loads it.' : 'In the mod.'}>
              <span class="mono path">{pathOf(cur)}</span>
              {#if cur.exists}<label class="chk"><input type="checkbox" bind:checked={cur.replace} /> replace the file already in the mod (the old one goes to sagaforge/backups)</label>{/if}
            </Field>
            {#if original}
              <Field label="Image" help={`${cur.img.naturalWidth}×${cur.img.naturalHeight}, kept as it is.`}>
                <span class="origwrap"><img class="orig" src={cur.url} alt="" /></span>
              </Field>
            {:else}
              {@const up = upscales(cur.crop, kind)}
              <Field label="Crop" help={(sameShape(cur.img.naturalWidth, cur.img.naturalHeight, kind) ? `Already the right shape (${cur.img.naturalWidth}×${cur.img.naturalHeight}): it is only resized.` : `${cur.img.naturalWidth}×${cur.img.naturalHeight}, a different shape: drag the frame to choose what to keep, drag its corner to resize it.`) + (up ? ` Red frame: the part you keep (${Math.round(cur.crop.w)}×${Math.round(cur.crop.h)}) is smaller than ${kind.w}×${kind.h}, so it is enlarged and looks blurrier; a bigger frame or a bigger source helps.` : '')}>
                <div class="crop">
                  <CropBox url={cur.url} natW={cur.img.naturalWidth} natH={cur.img.naturalHeight} aspect={kind.w / kind.h} crop={cur.crop} warn={up} onChange={(c) => { cur.crop = c; updatePreview(cur) }} />
                  <div class="res"><div class="muted small" class:upw={up}>Result, {kind.w}×{kind.h}{up ? ' (enlarged)' : ''}</div>{#if cur.preview}<img src={cur.preview} alt="Result" style="width:{Math.min(kind.w, 200)}px" />{/if}</div>
                </div>
              </Field>
            {/if}
          </div>
          <div class="row"><button class="mini" onclick={() => { items = items.filter((_, i) => i !== sel); sel = Math.max(0, sel - 1) }}>Leave this one out</button></div>
        </div>
      {/if}
    </div>
  {/if}
  {#if error}<div class="bad">{error}</div>{/if}

  {#snippet actions()}<button onclick={onClose}>Cancel</button><button class="primary" disabled={!items.length || busy} onclick={doImport}>{busy ? 'Working…' : `Import ${items.length || ''}`}</button>{/snippet}
</Modal>

{#if pickingOriginals}
  <OriginalsPicker onClose={() => (pickingOriginals = false)} onPick={(picked) => { pickingOriginals = false; const fresh = picked.filter((p) => !items.some((i) => i.abs === p.abs)); add(fresh.map((p) => p.abs), fresh.map((p) => p.name)) }} />
{/if}

<style>
  .top { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 8px; }
  .g { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 2px 10px; flex: 1; }
  .pick { display: flex; gap: 6px; }
  .body { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; }
  .list { list-style: none; margin: 0; padding: 0; max-height: 440px; overflow: auto; border-right: 1px solid var(--border); }
  .list button { display: flex; gap: 6px; align-items: center; width: 100%; border: none; background: none; padding: 3px 4px; text-align: left; font-size: 11px; }
  .list li.on button { background: #1f2a38; }
  .list img { width: 32px; height: 32px; object-fit: contain; background: var(--imgbg, #000); flex: none; }
  .list .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .warn { color: var(--warn); font-size: 10px; margin-left: auto; }
  .up { color: #ff3b3b; font-weight: 700; margin-left: 2px; }
  .upw { color: #ff6b6b; }
  .path { display: block; padding: 4px 0; color: var(--muted); word-break: break-all; font-size: 12px; }
  /* #67 U38 (user): its own shape (the box stretched every original to the same one) */
  /* the image's own size and shape (no bars): the wrapper keeps it from being stretched to the column's width */
  .origwrap { display: inline-block; align-self: flex-start; line-height: 0; }
  .orig { display: block; width: auto; height: auto; max-width: min(520px, 100%); max-height: 340px; background: var(--imgbg, #000); border: 1px solid var(--border); }
  .bgsw { display: flex; gap: 4px; align-items: center; margin: 0 0 6px 212px; }
  .bgsw .on { border-color: var(--accent); color: #fff; }
  .crop { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .res img { display: block; background: var(--imgbg, #000); border: 1px solid var(--border); }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--warn); }
  .row { margin-top: 6px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .bad { color: var(--bad); margin-top: 8px; font-size: 12px; }
</style>
