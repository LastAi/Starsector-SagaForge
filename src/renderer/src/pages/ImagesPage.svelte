<script lang="ts">
  /**
   * The mod's images (R5; docs/DESIGN-PHASE1.md §3): by kind, as thumbnails with their size, a badge
   * when the size isn't vanilla's for that kind, and Import… (files or a folder; crop, resize, PNG,
   * the mod's prefix). Images waiting for Save are shown too.
   */
  import { IMAGE_KINDS, imageKind, isOriginal, kindSize, type ImageKindId } from '../../../shared/imagekinds'
  import { imageUses } from '../../../shared/imageuses'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { images } from '../state/app.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import ImportImages from '../ui/ImportImages.svelte'
  import { loadImage } from '../ui/imageops'
  import { addGroup, addToGroup, deleteGroup, groupsOf, groupsWith, inFilter, removeFromGroup, renameGroup, UNGROUPED } from '../../../shared/imagegroups'

  let kindId = $state<ImageKindId>((app.smoke ? (app.smokeArg as ImageKindId) : null) ?? 'portrait')
  const kind = $derived(imageKind(kindId))
  const own = $derived(project.loaded?.sourceId ?? '')
  let files = $state<{ path: string; pending: boolean; size?: { w: number; h: number } }[]>([])
  let loading = $state(false)
  /** #67 U38: the mod's images already written (deleting one of these waits for Save). */
  let onDisk = $state<Set<string>>(new Set())
  // screenshot mode: "images:::import=<path>;<path>" opens the import dialog with these files (| stands for :)
  const smokeFiles = app.smokeModal?.startsWith('import=') ? app.smokeModal.slice(7).split(';').map((p) => p.split('|').join(':')) : []
  let importing = $state(app.smokeModal === 'import' || smokeFiles.length > 0)

  /** Flags and crests share graphics/factions: a file is a crest when its name says so. */
  const belongs = (p: string) => (kindId === 'crest' ? /crest/i.test(p) : kindId === 'flag' ? !/crest/i.test(p) : true)

  async function load() {
    if (!project.loaded) { files = []; return }
    loading = true
    const found = (await window.api.listImages(kind.folder)).filter((f) => f.sourceId === own).map((f) => f.path)
    const pending = project.pendingCopies.filter((c) => !c.remove && c.to.startsWith(`${kind.folder}/`)).map((c) => c.to)
    // #67 U38: deleted images (waiting for Save) are gone from the page
    const gone = new Set(project.pendingCopies.filter((c) => c.remove).map((c) => c.to))
    onDisk = new Set(found)
    files = [...new Set([...pending, ...found])].filter((p) => belongs(p) && !gone.has(p)).sort().map((p) => ({ path: p, pending: pending.includes(p) }))
    loading = false
    // sizes, read from the images themselves
    for (const f of files) {
      const c = project.pendingCopies.find((x) => x.to === f.path && !x.remove)
      const url = c?.bytes ? URL.createObjectURL(new Blob([c.bytes as BlobPart], { type: 'image/png' })) : c?.from ? await images.picked(c.from) : await images.url(f.path, own)
      if (!url) continue
      try { const img = await loadImage(url); f.size = { w: img.naturalWidth, h: img.naturalHeight }; files = [...files] } catch { /* unreadable: no size */ }
    }
  }
  $effect(() => { void kindId; void project.pendingCopies.length; void project.loaded; load() })
  const original = $derived(isOriginal(kind))
  const offSize = (f: { size?: { w: number; h: number } }) => !original && !!f.size && (f.size.w !== kind.w || f.size.h !== kind.h)
  const counts = $derived(files.filter(offSize).length)

  // #67 U21: the user's own groups for this kind (project.json), a filter, and a selection to sort into them
  const groups = $derived(project.m ? groupsOf(project.m.project, kindId) : [])
  let group = $state('')
  /** The "+ a new group…" entry of "Add to group…" (no group name can be it). */
  const NEW_GROUP = '\u0001new'
  let selected = $state<string[]>([])
  $effect(() => { void kindId; group = ''; selected = [] })
  $effect(() => { if (group && group !== UNGROUPED && !groups.some((g) => g.name === group)) group = '' })
  const shownFiles = $derived(project.m ? files.filter((f) => inFilter(project.m!.project, kindId, group, f.path)) : files)
  const count = (name: string) => (project.m ? files.filter((f) => inFilter(project.m!.project, kindId, name, f.path)).length : 0)
  const toggle = (p: string) => (selected = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p])
  const editProject = (fn: (p: NonNullable<typeof project.m>['project']) => void) => project.change((mm) => fn(mm.project))
  async function newGroup(withSelected: boolean) {
    const name = (await app.ask(`A new group for ${kind.label.toLowerCase()} images`, '', 'Add group'))?.trim()
    if (!name) return
    editProject((p) => { if (withSelected) addToGroup(p, kindId, name, selected); else addGroup(p, kindId, name) })
    if (withSelected) selected = []
  }
  async function rename(from: string) {
    const to = (await app.ask('Rename the group', from, 'Rename'))?.trim()
    if (to && to !== from) { editProject((p) => { renameGroup(p, kindId, from, to) }); if (group === from) group = to }
  }
  /** #67 U38 (user, 2026-11-22): delete the selected images on Save; ask first when something still uses one. */
  function del() {
    if (!project.m || !selected.length) return
    const uses = selected.flatMap((p) => imageUses(project.m!, p).map((u) => `  ${p.replace(/^.*\//, '')}: ${u}`))
    const what = selected.length === 1 ? selected[0].replace(/^.*\//, '') : `these ${selected.length} images`
    const msg = uses.length
      ? `${what} ${selected.length === 1 ? 'is' : 'are'} still used:\n${uses.join('\n')}\n\nDelete anyway? Those places will point at a missing image (Problems lists them). The files are deleted on Save and kept in sagaforge/backups.`
      : `Delete ${what}? The file${selected.length === 1 ? ' is' : 's are'} deleted on Save and kept in sagaforge/backups.`
    if (!confirm(msg)) return
    const gone = new Set(selected)
    project.deleteImages(selected, onDisk)
    // its groups and an illustration's key go with it
    editProject((p) => {
      for (const list of Object.values(p.imageGroups ?? {})) for (const g of list) g.images = g.images.filter((x) => !gone.has(x))
      for (const [k, v] of Object.entries(p.illustrations ?? {})) if (gone.has(v)) delete p.illustrations![k]
    })
    app.flash(`${selected.length} image${selected.length === 1 ? '' : 's'} deleted (on Save).`)
    selected = []
  }
  function remove(name: string) {
    if (!confirm(`Delete the group "${name}"? Its images stay in the mod.`)) return
    editProject((p) => deleteGroup(p, kindId, name))
  }
</script>

<div class="page">
  <aside class="left">
    <div class="sect">Kinds</div>
    <ul class="list">
      {#each IMAGE_KINDS as k (k.id)}<li class:on={k.id === kindId}><button class="li" onclick={() => (kindId = k.id)}><span>{k.label}</span><span class="sub">{kindSize(k)}</span></button></li>{/each}
    </ul>
    {#if project.m}
      <!-- #67 U21: the user's groups for this kind -->
      <div class="sect row2">Groups <button class="mini" onclick={() => newGroup(false)} title="A group to sort this kind's images into (only for you: never exported)">+ Group</button></div>
      <ul class="list">
        <li class:on={group === ''}><button class="li" onclick={() => (group = '')}><span>All</span><span class="sub">{files.length}</span></button></li>
        {#each groups as g (g.name)}
          <li class:on={group === g.name} class="grp"><button class="li" onclick={() => (group = g.name)}><span>{g.name}</span><span class="sub">{count(g.name)}</span></button>
            <span class="gtools"><button class="x" title="Rename" onclick={() => rename(g.name)}>✎</button><button class="x" title="Delete the group (not its images)" onclick={() => remove(g.name)}>✕</button></span></li>
        {/each}
        {#if groups.length}<li class:on={group === UNGROUPED}><button class="li" onclick={() => (group = UNGROUPED)}><span class="muted">In no group</span><span class="sub">{count(UNGROUPED)}</span></button></li>{/if}
      </ul>
    {/if}
    <p class="muted small pad">Images live in the mod's <span class="mono">graphics/</span> folders. Import… crops and resizes them to the size vanilla uses for each kind, converts them to PNG and adds the mod's prefix to the name. They are written on Save. Groups are only for you: click images to select them, then add them to a group (or Delete them); the image pickers can show one group. Originals (not in the game) keep your source images as they are, for Import… › From Originals.</p>
  </aside>
  <section class="main">
    <div class="head">
      <h2>{kind.label}</h2><span class="muted small">{kind.help} {original ? 'Kept as they are' : `${kind.w}×${kind.h} PNG`} in <span class="mono">{kind.folder}/</span></span>
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
      {#if selected.length}
        <div class="selbar">
          <span>{selected.length} selected</span>
          <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v === NEW_GROUP) newGroup(true); else if (v) { editProject((p) => addToGroup(p, kindId, v, selected)); selected = [] } }}>
            <option value="">Add to group…</option>{#each groups as g (g.name)}<option value={g.name}>{g.name}</option>{/each}<option value={NEW_GROUP}>+ a new group…</option>
          </select>
          {#if group && group !== UNGROUPED}<button class="mini" onclick={() => { editProject((p) => removeFromGroup(p, kindId, group, selected)); selected = [] }}>Remove from "{group}"</button>{/if}
          <button class="mini" onclick={() => (selected = shownFiles.map((f) => f.path))}>Select all shown</button>
          <button class="mini" onclick={() => (selected = [])}>Clear</button>
          <button class="mini danger" onclick={del} title="Delete the selected images from the mod on Save (kept in sagaforge/backups)">Delete…</button>
        </div>
      {/if}
      <div class="grid">
        {#each shownFiles as f (f.path)}
          {@const gs = project.m ? groupsWith(project.m.project, kindId, f.path) : []}
          <button class="tile" class:bad={offSize(f)} class:sel={selected.includes(f.path)} onclick={() => toggle(f.path)} title={gs.length ? `Groups: ${gs.join(', ')}. Click to select.` : 'In no group. Click to select.'}>
            <ImageView path={f.path} w={original ? 140 : kind.w >= kind.h ? 140 : Math.round(110 * kind.w / kind.h)} h={original ? 110 : kind.w >= kind.h ? Math.round(140 * kind.h / kind.w) : 110} />
            <span class="mono name" title={f.path}>{f.path.replace(/^.*\//, '')}</span>
            <span class="small">{f.size ? `${f.size.w}×${f.size.h}` : ''}{f.pending ? ' · waiting for Save' : ''}</span>
            {#if gs.length}<span class="gchips">{#each gs as g (g)}<span class="gchip">{g}</span>{/each}</span>{/if}
          </button>
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
  button.tile { color: inherit; cursor: pointer; }
  .tile.sel { border-color: var(--accent); background: #1f2a38; box-shadow: 0 0 0 1px var(--accent); }
  .gchips { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; }
  .gchip { font-size: 10px; padding: 0 6px; border-radius: 8px; background: #2a3a4c; }
  .selbar { display: flex; gap: 8px; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--border); background: #121a24; font-size: 12px; }
  .row2 { display: flex; justify-content: space-between; align-items: center; }
  .grp { position: relative; }
  .gtools { position: absolute; right: 34px; top: 3px; display: none; }
  .grp:hover .gtools { display: inline-flex; }
  .x { border: none; background: none; padding: 0 3px; font-size: 11px; color: var(--muted); }
  .mini { padding: 1px 8px; font-size: 11px; }
  .danger { color: var(--bad); border-color: var(--bad); }
  .name { font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .center { display: grid; place-items: center; flex: 1; padding: 20px; text-align: center; }
  .small { font-size: 11px; }
  .pad { padding: 6px 12px; }
  .warn { color: var(--warn); }
</style>
