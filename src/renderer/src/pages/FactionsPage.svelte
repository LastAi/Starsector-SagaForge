<script lang="ts">
  /**
   * Factions (PLAN.md §4.1, mock-up factions.html): this mod's factions and its changes to other
   * factions are separate lists; everyone else is read-only.
   */
  import { additionEditor, overrideEditor, newFactionDoc, repLevelName, type FactionEditor } from '../../../shared/factionform'
  import { factionText, type FactionAdditionEdit, type FactionEdit, type FactionOverrideEdit } from '../../../shared/serialize'
  import { emptyPatch } from '../../../shared/faction'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import FactionForm from '../factions/FactionForm.svelte'
  import Modal from '../ui/Modal.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import Splitter from '../Splitter.svelte'
  import { layout, saveLayout } from '../layout.svelte'

  const index = $derived(app.index!)
  const m = $derived(project.m)
  const sel = $derived(app.selected.factions ?? null)
  let filter = $state('')
  let tab = $state(app.smokeArg ?? 'identity')
  let showOthers = $state(true)

  const own = $derived(m?.factions ?? [])
  const additions = $derived(own.filter((f): f is FactionAdditionEdit => f.kind === 'addition'))
  const overrides = $derived(own.filter((f): f is FactionOverrideEdit => f.kind === 'override'))
  const ownIds = $derived(new Set(own.map((f) => f.id)))
  const match = (id: string, name: string) => !filter || `${id} ${name}`.toLowerCase().includes(filter.toLowerCase())
  const others = $derived(index.factions.filter((f) => !ownIds.has(f.id) && f.definedBy !== project.loaded?.sourceId && match(f.id, f.name)))
  const entry = $derived(own.find((f) => f.id === sel) ?? null)
  const info = (id: string) => index.factions.find((f) => f.id === id)
  const srcName = (id: string) => (id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id)
  const swatch = (c: unknown) => (Array.isArray(c) ? `rgb(${c[0]},${c[1]},${c[2]})` : '#555')

  // Layers of an overridden faction (every source except this mod), loaded on demand.
  let layers = $state<Record<string, { sourceId: string; raw: Record<string, unknown> }[]>>({})
  $effect(() => {
    const e = entry
    if (e?.kind !== 'override' || layers[e.id]) return
    window.api.loadFaction(e.id).then((l) => { layers[e.id] = l.layers.filter((x) => x.sourceId !== project.loaded?.sourceId) })
  })

  function editorFor(f: FactionEdit): FactionEditor | null {
    if (f.kind === 'addition') return additionEditor(f)
    const l = layers[f.id]
    return l ? overrideEditor(f, l) : null
  }
  const ed = $derived(entry ? editorFor(entry) : null)

  function edit(fn: (e: FactionEditor) => void) {
    const id = sel
    project.change((mm) => {
      const f = mm.factions.find((x) => x.id === id)
      const e = f && editorFor(f)
      if (e) fn(e)
    })
  }

  // ---- preview of the file as it will be written
  const preview = $derived.by(() => {
    if (!entry) return ''
    const old = project.loaded?.files[entry.file]?.text
    try { return factionText($state.snapshot(entry) as FactionEdit, old, srcName(info(entry.id)?.definedBy ?? '')) } catch (e) { return `(can't show: ${(e as Error).message})` }
  })
  const fileState = $derived(entry ? (project.loaded?.files[entry.file] ? (project.loaded.files[entry.file].text === preview ? 'unchanged' : 'changed') : 'new file') : '')

  // ---- new faction / change a faction / delete / change id
  let newName = $state('')
  let showNew = $state(false)
  let showChange = $state(false)
  let changeTarget = $state('')
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const newId = $derived(project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), ''))

  function createFaction() {
    const id = newId
    if (!id || ownIds.has(id) || index.factions.some((f) => f.id === id)) { app.error = `The id "${id}" is already used.`; return }
    project.change((mm) => {
      mm.factions.push({ kind: 'addition', id, file: `data/world/factions/${id}.faction`, raw: newFactionDoc(id, newName.trim()), listed: true })
    })
    showNew = false
    newName = ''
    app.selected.factions = id
    tab = 'identity'
  }

  function changeFaction(id = changeTarget) {
    const f = info(id)
    if (!f) { app.error = `No faction "${id}" in the game or any installed mod.`; return }
    if (ownIds.has(id)) { app.selected.factions = id; showChange = false; return }
    project.change((mm) => { mm.factions.push({ kind: 'override', id, file: f.file, patch: emptyPatch() }) })
    showChange = false
    changeTarget = ''
    app.selected.factions = id
    tab = 'ships'
  }

  function remove() {
    if (!entry) return
    const what = entry.kind === 'addition' ? `the faction "${entry.id}" and its file` : `this mod's changes to "${entry.id}" (the patch file)`
    if (!confirm(`Delete ${what}? Undo can bring it back until you save.`)) return
    const e = entry
    project.change((mm) => {
      mm.factions = mm.factions.filter((f) => f.id !== e.id)
      delete mm.factionsRuntime.relations[e.id]
      delete mm.factionsRuntime.scripted[e.id]
      delete mm.descriptions[`FACTION:${e.id}`]
    })
    if (project.loaded?.files[e.file]) project.deletedFactionFiles = [...project.deletedFactionFiles, e.file]
    app.selected.factions = null
  }

  let changeIdTo = $state('')
  let showChangeId = $state(false)
  function changeId() {
    const e = entry
    const to = changeIdTo.trim()
    if (!e || e.kind !== 'addition' || !to || to === e.id) { showChangeId = false; return }
    if (ownIds.has(to) || index.factions.some((f) => f.id === to && f.definedBy !== project.loaded?.sourceId)) { app.error = `The id "${to}" is already used.`; return }
    const oldFile = e.file
    project.change((mm) => {
      const f = mm.factions.find((x) => x.id === e.id) as FactionAdditionEdit
      f.id = to
      f.raw.id = to
      f.file = `data/world/factions/${to}.faction`
      const rt = mm.factionsRuntime
      if (rt.relations[e.id]) { rt.relations[to] = rt.relations[e.id]; delete rt.relations[e.id] }
      for (const r of Object.values(rt.relations)) if (e.id in r) { r[to] = r[e.id]; delete r[e.id] }
      const d = mm.descriptions[`FACTION:${e.id}`]
      if (d) { mm.descriptions[`FACTION:${to}`] = d; delete mm.descriptions[`FACTION:${e.id}`] }
      for (const p of mm.people) if (p.faction === e.id) p.faction = to
    })
    if (project.loaded?.files[oldFile]) project.deletedFactionFiles = [...project.deletedFactionFiles, oldFile]
    app.selected.factions = to
    showChangeId = false
  }

  // ---- a list entry a merge can't remove
  let cantRemove = $state<{ path: string; value: string } | null>(null)
  function scripted() {
    const c = cantRemove
    const id = sel
    if (!c || !id) return
    project.change((mm) => {
      const list = (mm.factionsRuntime.scripted[id] ??= [])
      if (!list.some((s) => s.path === c.path && s.value === c.value)) list.push({ op: 'remove', path: c.path, value: c.value })
    })
    cantRemove = null
  }
  const scriptedList = $derived(sel ? m?.factionsRuntime.scripted[sel] ?? [] : [])

  // ---- relations (additions only; SagaLib sets them on new game)
  const relations = $derived(sel ? m?.factionsRuntime.relations[sel] ?? {} : {})
  function setRel(other: string, v: number | undefined) {
    const id = sel
    if (!id) return
    project.change((mm) => {
      const r = (mm.factionsRuntime.relations[id] ??= {})
      if (v === undefined) delete r[other]
      else r[other] = Math.max(-1, Math.min(1, v))
      if (!Object.keys(r).length) delete mm.factionsRuntime.relations[id]
    })
  }
  const allFactionOptions = $derived([...index.factions.map((f) => ({ id: f.id, name: f.name })), ...additions.filter((a) => !index.factions.some((f) => f.id === a.id)).map((a) => ({ id: a.id, name: String(a.raw.displayName ?? a.id) })), { id: 'player', name: 'Player' }])
  const desc = $derived(sel ? m?.descriptions[`FACTION:${sel}`]?.text1 ?? '' : '')
</script>

<div class="page" style="grid-template-columns:{layout.left}px 1px minmax(0,1fr) 1px {layout.right}px">
  <aside class="left">
    <input class="search" type="search" placeholder="Filter factions…" bind:value={filter} />
    <div class="scroll">
      <div class="sect">This mod's factions <button disabled={!m} onclick={() => (showNew = true)}>+ New faction</button></div>
      <ul class="list">
        {#each additions.filter((f) => match(f.id, String(f.raw.displayName ?? ''))) as f (f.id)}
          <li class:on={sel === f.id}><button class="li" onclick={() => (app.selected.factions = f.id)}><span class="swatch" style="background:{swatch(f.raw.color)}"></span>{String(f.raw.displayName ?? f.id)} <span class="badge b-new">new</span><span class="sub mono">{f.id}</span></button></li>
        {:else}<li class="muted small">{m ? 'None yet.' : 'Pick an active mod to add factions.'}</li>{/each}
      </ul>
      <div class="sect">Changes to other factions <button disabled={!m} onclick={() => (showChange = true)}>+ Change a faction…</button></div>
      <ul class="list">
        {#each overrides.filter((f) => match(f.id, info(f.id)?.name ?? '')) as f (f.id)}
          {@const fi = info(f.id)}
          <li class:on={sel === f.id}><button class="li" onclick={() => (app.selected.factions = f.id)}><span class="swatch" style="background:{swatch(fi?.color)}"></span>{fi?.name ?? f.id} <span class="badge b-ovr">override</span><span class="sub">{srcName(fi?.definedBy ?? '')}</span></button></li>
        {:else}<li class="muted small">None.</li>{/each}
      </ul>
      <div class="sect">Everyone else (read-only)</div>
      <ul class="list ro">
        {#each others as f (f.id)}
          <li class:on={sel === f.id}><button class="li" onclick={() => (app.selected.factions = f.id)}><span class="swatch" style="background:{swatch(f.color)}"></span>{f.name}<span class="sub">{srcName(f.definedBy)}</span></button></li>
        {/each}
      </ul>
    </div>
  </aside>
  <Splitter axis="x" value={layout.left} min={180} max={() => 520} label="Resize list" onChange={(v) => (layout.left = v)} onDone={saveLayout} onReset={() => { layout.left = 280; saveLayout() }} />

  <section class="main">
    {#if entry && ed}
      <div class="head">
        {#if entry.kind === 'addition'}
          <ImageView path={String(entry.raw.crest ?? '')} w={28} h={28} round />
          <h2>{String(entry.raw.displayName ?? entry.id)}</h2><span class="badge b-new">new</span>
          <span class="mono muted">{entry.id}</span><button class="mini" onclick={() => { changeIdTo = entry.id; showChangeId = true }}>Change id…</button>
        {:else}
          {@const fi = info(entry.id)}
          <ImageView path={fi?.crest} w={28} h={28} round sourceId={fi?.definedBy} />
          <h2>{fi?.name ?? entry.id}</h2><span class="badge b-ovr">override</span>
          <span class="muted small">defined by {srcName(fi?.definedBy ?? '')}{#if fi?.changedBy.filter((s) => s !== project.loaded?.sourceId).length}, also changed by {fi.changedBy.filter((s) => s !== project.loaded?.sourceId).map(srcName).join(', ')}{/if}</span>
          <label class="small"><input type="checkbox" bind:checked={showOthers} /> Show other mods' changes</label>
        {/if}
        <span class="spacer"></span>
        <span class="muted small">writes</span><span class="mono small">{entry.file}</span>
        <button class="mini danger" onclick={remove}>Delete</button>
      </div>
      <FactionForm {ed} {edit} factionId={entry.id} bind:tab {showOthers}
        extraTabs={entry.kind === 'addition' ? [{ id: 'relations', label: 'Relations' }, { id: 'description', label: 'Description' }] : []}
        onCantRemove={(path, value) => (cantRemove = { path, value })}>
        {#snippet extra(t)}
          {#if t === 'relations' && entry.kind === 'addition'}
            <div class="group">
              <div class="gt"><span>Starting relations</span><span class="badge b-lib">set by SagaLib on new game</span></div>
              <table class="t">
                <thead><tr><th>Faction</th><th>Start</th><th></th><th></th></tr></thead>
                <tbody>
                  {#each Object.entries(relations) as [other, v] (other)}
                    <tr><td>{allFactionOptions.find((o) => o.id === other)?.name ?? other} <span class="mono muted">{other}</span></td>
                      <td><input type="range" min="-1" max="1" step="0.05" value={v} oninput={(e) => setRel(other, Number(e.currentTarget.value))} /> <span class="mono">{v >= 0 ? '+' : ''}{v.toFixed(2)}</span></td>
                      <td class:good={v >= 0.24} class:bad={v <= -0.49}>{repLevelName(v, app.defs.repLevels)}</td>
                      <td><button class="mini" onclick={() => setRel(other, undefined)}>✕</button></td></tr>
                  {/each}
                  <tr><td colspan="4"><IdInput value="" placeholder="+ faction…" width="220px" clearOnCommit options={allFactionOptions.filter((o) => o.id !== entry.id && !(o.id in relations))} onCommit={(id) => { if (id) setRel(id, 0) }} /></td></tr>
                </tbody>
              </table>
              <div class="help">Everyone else starts neutral (vanilla default). Starting relations aren't a .faction key, so they go into <span class="mono">data/sagaforge/factions.json</span> and the mod needs SagaLib.</div>
            </div>
          {:else if t === 'description'}
            <div class="group">
              <div class="gt"><span>Description</span><span class="mono">descriptions.csv · {entry.id} · FACTION</span></div>
              <textarea rows="10" value={desc} spellcheck="true" onchange={(e) => { const v = e.currentTarget.value; const id = entry.id; project.change((mm) => { if (v.trim()) mm.descriptions[`FACTION:${id}`] = { text1: v }; else delete mm.descriptions[`FACTION:${id}`] }) }}></textarea>
              <div class="help">Shown in the intel tab. Written to the mod's <span class="mono">data/strings/descriptions.csv</span> on Export.</div>
            </div>
          {/if}
        {/snippet}
      </FactionForm>
    {:else if entry}
      <div class="center muted">Reading the faction's files…</div>
    {:else if sel && info(sel)}
      {@const fi = info(sel)!}
      <div class="center">
        <div class="card">
          <ImageView path={fi.logo} w={164} h={102} sourceId={fi.definedBy} />
          <h2>{fi.name}</h2>
          <div class="muted">Defined by {srcName(fi.definedBy)}{fi.changedBy.length ? `, changed by ${fi.changedBy.map(srcName).join(', ')}` : ''}. Read-only.</div>
          <div class="mono small muted">{fi.file}</div>
          <p><button class="primary" disabled={!m} onclick={() => changeFaction(fi.id)}>Change this faction…</button></p>
          <div class="muted small">Creates a patch in this mod at the same path; the game merges it into the original. Only your changes are written.</div>
        </div>
      </div>
    {:else}
      <div class="center muted">Pick a faction on the left, or create one.</div>
    {/if}
  </section>
  <Splitter axis="x" value={layout.right} min={260} max={() => 700} sign={-1} label="Resize preview" onChange={(v) => (layout.right = v)} onDone={saveLayout} onReset={() => { layout.right = 340; saveLayout() }} />

  <aside class="right">
    {#if entry}
      <h3>{entry.kind === 'addition' ? 'File preview' : 'Patch file'} <span class="badge" class:b-new={entry.kind === 'addition'} class:b-ovr={entry.kind === 'override'}>{entry.kind === 'override' ? 'only this mod\'s changes' : fileState}</span></h3>
      <pre class="files">{preview}</pre>
      {#if entry.kind === 'addition'}
        <div class="muted small">{entry.listed ? '+ a row in' : 'Not listed in'} <span class="mono">data/world/factions/factions.csv</span>. Unknown keys and comments in the file are kept.</div>
        {#if !entry.listed}<button class="mini" onclick={() => { const id = entry.id; project.change((mm) => { const f = mm.factions.find((x) => x.id === id); if (f?.kind === 'addition') f.listed = true }) }}>List it in factions.csv</button>{/if}
      {:else}
        <div class="muted small">The writer for overrides can't produce a full copy of the original; it only writes the patch.</div>
        {#if scriptedList.length}
          <div class="group">
            <div class="gt"><span>Scripted changes</span><span class="badge b-lib">SagaLib</span></div>
            {#each scriptedList as s, i (s.path + s.value)}
              <div class="scr"><span class="chip scripted">− {s.value} · {s.path}</span>
                <button class="mini" onclick={() => { const id = entry.id; project.change((mm) => { mm.factionsRuntime.scripted[id].splice(i, 1); if (!mm.factionsRuntime.scripted[id].length) delete mm.factionsRuntime.scripted[id] }) }}>✕</button></div>
            {/each}
            <div class="muted small">→ <span class="mono">data/sagaforge/factions.json</span>, applied by SagaLib on load. Other mods that add these back would be undone.</div>
          </div>
        {/if}
      {/if}
    {/if}
  </aside>
</div>

{#if showNew}
  <Modal title="New faction" onClose={() => (showNew = false)}>
    <div class="grid2">
      <label for="nf">Name</label><input id="nf" type="text" bind:value={newName} placeholder="e.g. Vanguard Compact" />
      <span class="muted">Id</span><span class="mono">{newId || '—'}</span>
    </div>
    <p class="muted small">Creates <span class="mono">data/world/factions/{newId}.faction</span> with the keys vanilla factions have, and lists it in the mod's <span class="mono">factions.csv</span>. The id can be changed later until the mod is released.</p>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newName.trim()} onclick={createFaction}>Create</button>{/snippet}
  </Modal>
{/if}

{#if showChange}
  <Modal title="Change a faction" onClose={() => (showChange = false)}>
    <p class="muted">Pick a faction defined by vanilla or another mod. Saga Forge writes only your changes, at the same path as the original, and the game merges them.</p>
    <IdInput value={changeTarget} options={index.factions.filter((f) => !ownIds.has(f.id) && f.definedBy !== project.loaded?.sourceId)} strict onCommit={(v) => (changeTarget = v)} placeholder="faction id, e.g. hegemony" />
    {#snippet actions()}<button onclick={() => (showChange = false)}>Cancel</button><button class="primary" disabled={!changeTarget} onclick={() => changeFaction()}>Change it</button>{/snippet}
  </Modal>
{/if}

{#if showChangeId}
  <Modal title="Change the faction's id" onClose={() => (showChangeId = false)}>
    <p>The file is renamed, and relations, descriptions and people that use the id follow. If the mod is already released, saves keep the old faction: avoid this after release (Problems will warn).</p>
    <input type="text" class="mono" bind:value={changeIdTo} />
    {#snippet actions()}<button onclick={() => (showChangeId = false)}>Cancel</button><button class="primary" onclick={changeId}>Change id</button>{/snippet}
  </Modal>
{/if}

{#if cantRemove}
  <Modal title="Can't be done with a merge file" onClose={() => (cantRemove = null)}>
    <p>You tried to remove <span class="mono">{cantRemove.value}</span> from <span class="mono">{cantRemove.path}</span>. The game's merge only <b>adds</b> to lists, so a <span class="mono">.faction</span> patch can't remove it.</p>
    <p class="muted small">(Replacing the whole list with <span class="mono">core_clearArray</span> would also drop what other mods add, so Saga Forge doesn't do that.)</p>
    {#snippet actions()}<button onclick={() => (cantRemove = null)}>Keep it (cancel)</button><button class="primary" onclick={scripted}>Remove it at game start with SagaLib (scripted change)</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; height: 100%; min-height: 0; }
  .left, .right { background: var(--panel); min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .right { padding: 10px 12px; overflow: auto; }
  .scroll { overflow: auto; flex: 1; min-height: 0; padding-bottom: 10px; }
  .search { margin: 8px 10px 4px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li { border-radius: 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); }
  .list.ro { opacity: .7; }
  .li { display: flex; gap: 7px; align-items: center; width: 100%; border: none; background: none; padding: 4px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .swatch { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #0006; flex: none; }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); flex-wrap: wrap; }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; line-height: 16px; white-space: nowrap; }
  .b-new { color: var(--good); border-color: #2f6b38; background: #15261a; }
  .b-ovr { color: var(--warn); border-color: #6b4a1f; background: #2a1f10; }
  .b-lib { color: var(--accent); border-color: var(--accent-2); background: #102233; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .center { display: grid; place-items: center; height: 100%; text-align: center; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 420px; }
  .card h2 { margin: 6px 0 0; }
  h3 { margin: 4px 0 8px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
  .files { font-family: var(--mono); font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; white-space: pre; overflow: auto; max-height: 60vh; tab-size: 2; margin: 0 0 8px; }
  .small { font-size: 12px; }
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 10px 0; background: #161a20; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; display: flex; justify-content: space-between; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 6px; }
  table.t td { border-bottom: 1px solid #1e242c; padding: 3px 6px; }
  .good { color: var(--good); } .bad { color: var(--bad); }
  .help { font-size: 11px; color: var(--muted); margin-top: 6px; }
  textarea { width: 100%; resize: vertical; }
  .grid2 { display: grid; grid-template-columns: 80px 1fr; gap: 6px 10px; align-items: center; }
  .chip.scripted { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px dashed var(--bad); color: var(--bad); }
  .scr { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
</style>
