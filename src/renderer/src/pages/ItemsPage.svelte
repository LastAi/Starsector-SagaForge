<script lang="ts">
  /** Items (PLAN.md §4.7, mock-up items.html): the mod's new commodities and special items; existing items read-only. */
  import type { ItemDef } from '../../../shared/model'
  import { newItem, itemRow } from '../../../shared/export/items'
  import { slug } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import Modal from '../ui/Modal.svelte'

  const m = $derived(project.m)
  const index = $derived(app.index!)
  let filter = $state('')
  const sel = $derived(app.selected.items ?? null)
  const item = $derived(m?.items.find((i) => i.id === sel) ?? null)
  const existing = $derived(index.items.find((i) => i.id === sel && !m?.items.some((x) => x.id === i.id)) ?? null)
  const match = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase())
  const srcName = (id: string) => (id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id)
  const ed = (fn: (it: ItemDef) => void) => { const id = sel; project.change((mm) => { const it = mm.items.find((x) => x.id === id); if (it) fn(it) }) }

  // ---- new item
  let showNew = $state(false)
  let newName = $state('')
  let newPreset = $state('quest_item')
  const newId = $derived(project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), ''))
  function create() {
    const id = newId
    if (!id || m?.items.some((i) => i.id === id) || index.items.some((i) => i.id === id)) { app.error = `The id "${id}" is already used.`; return }
    project.change((mm) => { mm.items.push(newItem(id, newName.trim(), newPreset, app.defs)) })
    app.selected.items = id
    showNew = false
    newName = ''
  }
  async function pickIcon() {
    const abs = await window.api.pickFile({ title: 'Choose the icon (PNG, 80×80 like vanilla)', filters: [{ name: 'PNG images', extensions: ['png'] }] })
    if (!abs || !item) return
    const to = `graphics/icons/cargo/${item.id}.png`
    project.copyIn(abs, to)
    ed((it) => { it.icon = to })
  }
  function applyPreset(id: string) {
    if (!item) return
    const fresh = newItem(item.id, item.name, id, app.defs)
    ed((it) => { it.kind = fresh.kind; it.tags = fresh.tags; it.otherColumns = fresh.otherColumns; it.basePrice = fresh.basePrice; it.stackSize = fresh.stackSize; it.cargoSpace = fresh.cargoSpace; it.special = fresh.special; it.preset = id })
  }
  function remove() {
    if (!item || !confirm(`Delete "${item.name}"? Quests that use it will show an error.`)) return
    const id = item.id
    project.change((mm) => { mm.items = mm.items.filter((i) => i.id !== id) })
    app.selected.items = null
  }

  // ---- used by
  const usedBy = $derived.by(() => {
    const id = sel
    if (!id || !m) return []
    const out: { quest: string; node?: string; what: string }[] = []
    for (const q of m.quests) {
      for (const r of q.rewards) if (r.items?.some((x) => x.item === id)) out.push({ quest: q.id, what: `reward ${r.id}` })
      for (const n of q.nodes) {
        if (n.type === 'dialog') {
          if (n.displays.some((d) => 'item' in d && d.item === id)) out.push({ quest: q.id, node: n.id, what: 'gives or takes it' })
          if ([...n.conditions, ...n.options.flatMap((o) => o.showIf ?? [])].some((c) => c.includes(id))) out.push({ quest: q.id, node: n.id, what: 'tests it' })
        } else if (n.type === 'action' && n.ops.some((o) => o.op === 'item' && o.item === id)) out.push({ quest: q.id, node: n.id, what: 'gives or takes it' })
      }
    }
    return out
  })
  const TAGS = $derived(app.defs.itemTags)
  const csvPreview = $derived(item ? Object.entries(itemRow($state.snapshot(item) as ItemDef)).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') : '')
</script>

<div class="page">
  <aside class="left">
    <input class="search" type="search" placeholder="Filter items…" bind:value={filter} />
    <div class="scroll">
      <div class="sect">This mod's items <button disabled={!m} onclick={() => (showNew = true)}>+ New</button></div>
      <ul class="list">
        {#each (m?.items ?? []).filter((i) => match(`${i.id} ${i.name}`)) as i (i.id)}
          <li class:on={sel === i.id}><button class="li" onclick={() => (app.selected.items = i.id)}><ImageView path={i.icon} w={20} h={20} /> {i.name} <span class="badge b-new">{i.kind === 'special' ? 'special' : 'commodity'}</span></button></li>
        {:else}<li class="muted small pad">{m ? 'None yet.' : 'Pick an active mod first.'}</li>{/each}
      </ul>
      <div class="sect">Existing items (read-only)</div>
      <ul class="list ro">
        {#each index.items.filter((i) => match(`${i.id} ${i.name}`)).slice(0, 300) as i (i.id)}
          <li class:on={sel === i.id}><button class="li" onclick={() => (app.selected.items = i.id)}><ImageView path={i.icon} w={20} h={20} sourceId={i.definedBy} /> {i.name}<span class="sub">{srcName(i.definedBy)}</span></button></li>
        {/each}
      </ul>
    </div>
  </aside>
  <section class="main">
    {#if item}
      <div class="head"><ImageView path={item.icon} w={40} h={40} /><h2>{item.name}</h2><span class="badge b-new">new</span><span class="mono muted">{item.id}</span>
        <span class="spacer"></span><span class="muted small">writes a row in <span class="mono">{item.kind === 'special' ? 'special_items.csv' : 'commodities.csv'}</span>{item.kind === 'commodity' ? ' + descriptions.csv' : ''}</span><button class="mini danger" onclick={remove}>Delete</button></div>
      <div class="body">
        <div class="grid2">
          <label for="it-p">Preset</label>
          <select id="it-p" value={item.preset ?? ''} onchange={(e) => applyPreset(e.currentTarget.value)}><option value="">(custom)</option>{#each app.defs.itemPresets as p (p.id)}<option value={p.id}>{p.name} ({p.kind})</option>{/each}</select>
          <label for="it-n">Name</label><input id="it-n" type="text" value={item.name} onchange={(e) => { const v = e.currentTarget.value; ed((it) => { it.name = v }) }} />
          <span class="lbl">Icon</span><div class="row"><ImageView path={item.icon} w={48} h={48} /><input type="text" class="mono" value={item.icon} onchange={(e) => { const v = e.currentTarget.value; ed((it) => { it.icon = v }) }} /><button onclick={pickIcon}>Pick…</button></div>
          <label for="it-bp">Base price</label><input id="it-bp" type="number" value={item.basePrice} onchange={(e) => { const v = Number(e.currentTarget.value); ed((it) => { it.basePrice = v }) }} />
          <label for="it-ss">Stack size</label><input id="it-ss" type="number" value={item.stackSize} onchange={(e) => { const v = Number(e.currentTarget.value); ed((it) => { it.stackSize = v }) }} />
          <label for="it-cs">Cargo space</label><input id="it-cs" type="number" step="0.1" value={item.cargoSpace} onchange={(e) => { const v = Number(e.currentTarget.value); ed((it) => { it.cargoSpace = v }) }} />
          <span class="lbl">Tags</span>
          <div class="chips">
            {#each item.tags as t (t)}<span class="chip">{t}<button class="x" onclick={() => ed((it) => { it.tags = it.tags.filter((x) => x !== t) })}>✕</button></span>{/each}
            <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) ed((it) => { if (!it.tags.includes(v)) it.tags.push(v) }) }}><option value="">+ tag…</option>{#each TAGS as t (t.tag)}<option value={t.tag} title={t.summary}>{t.tag}</option>{/each}</select>
          </div>
          {#if item.kind === 'special'}
            <label for="it-r">Rarity</label><input id="it-r" type="number" step="0.1" value={item.special?.rarity ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); ed((it) => { it.special = { ...(it.special ?? { plugin: '' }), rarity: v } }) }} />
            <label for="it-pl">Plugin</label><input id="it-pl" type="text" class="mono" value={item.special?.plugin ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((it) => { it.special = { ...(it.special ?? { rarity: 0 }), plugin: v } }) }} />
            <label for="it-pp">Plugin params</label><input id="it-pp" type="text" class="mono" value={item.special?.pluginParams ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((it) => { it.special = { ...(it.special ?? { rarity: 0, plugin: '' }), pluginParams: v } }) }} />
          {/if}
        </div>
        <div class="sect2">Description <span class="muted">{item.kind === 'commodity' ? 'descriptions.csv · RESOURCE' : 'special_items.csv · desc'}</span></div>
        <textarea rows="5" value={item.description} spellcheck="true" onchange={(e) => { const v = e.currentTarget.value; ed((it) => { it.description = v }) }}></textarea>
        <details><summary class="muted small">Other columns ({Object.keys(item.otherColumns).length}) and the row as written</summary>
          {#each Object.entries(item.otherColumns) as [k, v] (k)}
            <div class="row"><span class="mono col">{k}</span><input type="text" class="mono" value={v} onchange={(e) => { const x = e.currentTarget.value; ed((it) => { it.otherColumns[k] = x }) }} /></div>
          {/each}
          <pre class="files">{csvPreview}</pre>
        </details>
        <div class="sect2">Used by</div>
        {#each usedBy as u, i (i)}<button class="lnk" onclick={() => { app.go('quests', u.quest); app.selected.questNode = u.node ?? null }}>{m?.quests.find((q) => q.id === u.quest)?.title}{u.node ? ` · ${u.node}` : ''} — {u.what}</button>{:else}<div class="muted small">No quest uses it yet.</div>{/each}
      </div>
    {:else if existing}
      <div class="center"><div class="card">
        <ImageView path={existing.icon} w={80} h={80} sourceId={existing.definedBy} />
        <h2>{existing.name}</h2><div class="mono muted">{existing.id} · {existing.kind}</div>
        <div class="muted">Defined by {srcName(existing.definedBy)}{existing.changedBy.length ? `, replaced by ${existing.changedBy.map(srcName).join(', ')}` : ''}. Read-only: a row with this id in your mod would replace the whole row. Use it in rewards, costs and conditions.</div>
        <p class="desc">{existing.desc}</p>
      </div></div>
    {:else}
      <div class="center muted">Pick an item, or create one (a quest item is a commodity with the "Quest item" preset).</div>
    {/if}
  </section>
</div>

{#if showNew}
  <Modal title="New item" onClose={() => (showNew = false)}>
    <div class="grid2">
      <label for="ni-n">Name</label><input id="ni-n" type="text" bind:value={newName} placeholder="e.g. Convoy black box" />
      <span class="lbl">Id</span><span class="mono">{newId || '—'}</span>
      <label for="ni-p">Preset</label><select id="ni-p" bind:value={newPreset}>{#each app.defs.itemPresets as p (p.id)}<option value={p.id}>{p.name} ({p.kind})</option>{/each}</select>
    </div>
    <p class="muted small">Quest item: not traded, not lost in combat, hidden in the Codex. Special items use vanilla's generic item plugin, so no code is needed.</p>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newName.trim()} onclick={create}>Create</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; grid-template-columns: 300px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
  .scroll { overflow: auto; flex: 1; }
  .search { margin: 8px 10px 4px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list.ro { opacity: .75; }
  .li { display: flex; gap: 7px; align-items: center; width: 100%; border: none; background: none; padding: 3px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .body { padding: 12px 14px; overflow: auto; max-width: 820px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 5px 10px; align-items: center; }
  .grid2 label, .lbl { color: var(--muted); font-size: 12px; }
  .grid2 input, .grid2 select { width: 100%; }
  .row { display: flex; gap: 6px; align-items: center; margin-bottom: 3px; }
  .row input { flex: 1; }
  .col { width: 160px; font-size: 11px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; }
  .chips select { font-size: 11px; padding: 1px 4px; width: auto; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 4px; display: flex; gap: 8px; }
  textarea { width: 100%; resize: vertical; }
  .files { font-family: var(--mono); font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; white-space: pre-wrap; }
  .lnk { display: block; border: none; background: none; padding: 1px 0; color: var(--accent); text-align: left; font-size: 12px; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; line-height: 16px; }
  .b-new { color: var(--good); border-color: #2f6b38; background: #15261a; }
  .center { display: grid; place-items: center; height: 100%; text-align: center; padding: 20px; }
  .card { max-width: 480px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .desc { color: var(--muted); font-size: 12px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 4px 10px; }
</style>
