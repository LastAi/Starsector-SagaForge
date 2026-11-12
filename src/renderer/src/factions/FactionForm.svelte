<script lang="ts">
  /**
   * The faction form, for additions (whole document) and overrides (effective value; edits go to
   * the patch). Field definitions: shared/factionform.ts.
   */
  import { FACTION_TABS, KNOWN_TOP_KEYS, colorToHex, hexToColor, type FactionEditor, type FactionField, type IdSource } from '../../../shared/factionform'
  import { isObj } from '../../../shared/faction'
  import { parseLoose } from '../../../shared/loosejson'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    /** A fresh editor over the current model (for reading). */
    ed: FactionEditor
    /** Apply an edit through the undo history. */
    edit: (fn: (ed: FactionEditor) => void) => void
    factionId: string
    tab: string
    extraTabs: { id: string; label: string }[]
    showOthers: boolean
    /** Called when the user tries to remove an entry a merge can't remove. */
    onCantRemove: (path: string, value: string) => void
    extra: Snippet<[string]>
  }
  let { ed, edit, factionId, tab = $bindable(), extraTabs, showOthers, onCantRemove, extra }: Props = $props()

  const index = $derived(app.index!)
  const tabs = $derived([...FACTION_TABS.map((t) => ({ id: t.id, label: t.label })), ...extraTabs, { id: 'other', label: 'Other keys' }])
  const current = $derived(FACTION_TABS.find((t) => t.id === tab))

  function options(src: IdSource | undefined): { id: string; name?: string }[] {
    switch (src) {
      case 'hulls': return index.hulls.map((h) => ({ id: h.id, name: `${h.name} (${h.hullSize.toLowerCase().replace('_ship', '')})` }))
      case 'wings': return index.wings
      case 'weapons': return index.weapons
      case 'hullmods': return index.hullmods
      case 'commodities': return index.items.filter((i) => i.kind === 'commodity')
      case 'portraits': return index.portraits.map((p) => ({ id: p.path }))
      case 'music': return index.music.map((m) => ({ id: m }))
      default: return []
    }
  }
  const srcName = (id: string) => (id === 'mine' ? 'this mod' : id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id)
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  async function pickImage(f: FactionField) {
    const abs = await window.api.pickFile({ title: `Choose the ${f.label.toLowerCase()}`, filters: [{ name: 'PNG images', extensions: ['png'] }] })
    if (!abs) return
    const to = `graphics/factions/${factionId}_${f.path === 'logo' ? 'flag' : f.path}.png`
    project.copyIn(abs, to)
    edit((e) => e.set(f.path, to))
  }

  const otherKeys = $derived(Object.keys(ed.effective()).filter((k) => !KNOWN_TOP_KEYS.has(k)))
  let otherError = $state<string | null>(null)
  function setOther(key: string, text: string) {
    otherError = null
    try {
      const v = parseLoose(text).value
      edit((e) => e.set(key, v))
    } catch (err) { otherError = `${key}: ${(err as Error).message}` }
  }
  let newOtherKey = $state('')
</script>

<div class="toolbar">
  <div class="seg">
    {#each tabs as t (t.id)}<button class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}{t.id === 'other' && otherKeys.length ? ` (${otherKeys.length})` : ''}</button>{/each}
  </div>
</div>

<div class="body">
  {#if current}
    {#each current.fields as f (f.path)}
      {@const v = ed.value(f.path)}
      {@const set = ed.isSet(f.path)}
      {#if f.kind === 'idlist'}
        {@const layers = ed.listLayers(f.path)}
        <div class="group">
          <div class="gt"><span>{f.label}</span><span>{#each layers.filter((l) => l.values.length) as l, i (l.sourceId + i)}<span class:mine={l.mine} class:othermod={!l.mine && l.sourceId !== 'starsector-core'}>{i ? ' · ' : ''}{srcName(l.sourceId)} {l.mine && ed.kind === 'override' ? '+' : ''}{l.values.length}</span>{/each}</span></div>
          <div class="chips">
            {#each layers as l, li (l.sourceId + li)}
              {#if l.mine || li === 0 || showOthers}
                {#each l.values as x, xi (String(x) + xi)}
                  <span class="chip" class:add={l.mine && ed.kind === 'override'} class:other={!l.mine && li > 0} title={srcName(l.sourceId)}>
                    {String(x)}{#if !l.mine && li > 0}<span class="muted"> · {srcName(l.sourceId)}</span>{/if}
                    <button class="x" title="Remove" onclick={() => { const val = String(x); if (l.mine) edit((e) => { e.removeFromList(f.path, val) }); else onCantRemove(f.path, val) }}>✕</button>
                  </span>
                {/each}
              {/if}
            {/each}
            <span class="addchip"><IdInput value="" options={options(f.source)} placeholder="+ add…" width="170px" clearOnCommit onCommit={(id) => { if (id) edit((e) => e.addToList(f.path, id)) }} /></span>
          </div>
          {#if f.help}<div class="help">{f.help}</div>{/if}
        </div>
      {:else if f.kind === 'weights' || f.kind === 'names'}
        {@const map = isObj(v) ? (v as Record<string, unknown>) : {}}
        <div class="group">
          <div class="gt"><span>{f.label}</span>{#if set}<button class="mini" onclick={() => edit((e) => e.revert(f.path))}>Revert</button>{/if}</div>
          <table class="t">
            <tbody>
              {#each Object.entries(map) as [k, w] (k)}
                <tr>
                  <td class="mono">{k}</td>
                  <td>
                    {#if f.kind === 'weights'}
                      <input type="number" step="0.05" value={Number(w)} onchange={(e) => { const n = num(e.currentTarget.value); edit((ed2) => ed2.setWeight(f.path, k, n)) }} />
                    {:else}
                      <input type="text" value={String((w as Record<string, unknown>)?.name ?? '')} onchange={(e) => { const name = e.currentTarget.value; edit((ed2) => ed2.set(`${f.path}.${k}`, { name })) }} />
                    {/if}
                  </td>
                  <td>{#if ed.kind === 'addition' || ed.isSet(`${f.path}.${k}`)}<button class="mini" onclick={() => edit((ed2) => (f.kind === 'weights' ? ed2.setWeight(f.path, k, undefined) : ed2.revert(`${f.path}.${k}`)))}>✕</button>{/if}</td>
                </tr>
              {/each}
              <tr><td colspan="3"><IdInput value="" placeholder="+ add id…" width="200px" clearOnCommit
                options={f.kind === 'names' ? (f.path.endsWith('posts') ? app.defs.posts : app.defs.ranks) : options(f.source)}
                onCommit={(id) => { if (id) edit((e) => (f.kind === 'weights' ? e.setWeight(f.path, id, 1) : e.set(`${f.path}.${id}`, { name: (f.path.endsWith('posts') ? app.defs.posts : app.defs.ranks).find((r) => r.id === id)?.name ?? id }))) }} /></td></tr>
            </tbody>
          </table>
          {#if f.help}<div class="help">{f.help}</div>{/if}
        </div>
      {:else}
        <div class="row" class:patched={set}>
          <label for={`f-${f.path}`}>{f.label}</label>
          <div class="ctl">
            {#if f.kind === 'text'}
              <input id={`f-${f.path}`} type="text" value={v == null ? '' : String(v)} onchange={(e) => { const val = e.currentTarget.value; edit((x) => x.set(f.path, val)) }} />
            {:else if f.kind === 'bool'}
              <input id={`f-${f.path}`} type="checkbox" checked={v === undefined || v === null ? (f.default ?? true) : v !== false} onchange={(e) => { const val = e.currentTarget.checked; edit((x) => x.set(f.path, val)) }} />
            {:else if f.kind === 'number'}
              <input id={`f-${f.path}`} type="number" min={f.min} max={f.max} step={f.step ?? 1} value={v == null ? '' : Number(v)} onchange={(e) => { const n = num(e.currentTarget.value); edit((x) => (n === undefined ? x.revert(f.path) : x.set(f.path, n))) }} />
              {#if f.min !== undefined}<span class="muted small">{f.min}–{f.max}</span>{/if}
            {:else if f.kind === 'select'}
              {@const opts = f.options?.length ? f.options : options('music').map((o) => o.id)}
              <select id={`f-${f.path}`} value={v == null ? '' : String(v)} onchange={(e) => { const val = e.currentTarget.value; edit((x) => (val ? x.set(f.path, val) : x.revert(f.path))) }}>
                <option value="">—</option>
                {#each opts as o (o)}<option value={o}>{o}</option>{/each}
                {#if v != null && !opts.includes(String(v))}<option value={String(v)}>{String(v)}</option>{/if}
              </select>
            {:else if f.kind === 'color'}
              {@const arr = Array.isArray(v) ? (v as number[]) : null}
              <input id={`f-${f.path}`} type="color" value={colorToHex(arr)} onchange={(e) => { const hx = e.currentTarget.value; edit((x) => x.set(f.path, hexToColor(hx, arr?.[3] ?? 255))) }} />
              <input type="number" min="0" max="255" title="Alpha" style="width:64px" value={arr?.[3] ?? 255} onchange={(e) => { const a = Number(e.currentTarget.value); edit((x) => x.set(f.path, [...(arr ?? [255, 255, 255]).slice(0, 3), a])) }} />
              <span class="mono small muted">{arr ? `[${arr.join(',')}]` : 'not set'}</span>
            {:else if f.kind === 'image'}
              <ImageView path={v == null ? '' : String(v)} w={f.path === 'logo' ? 120 : 48} h={f.path === 'logo' ? 75 : 48} />
              <input id={`f-${f.path}`} type="text" class="mono" value={v == null ? '' : String(v)} onchange={(e) => { const val = e.currentTarget.value; edit((x) => x.set(f.path, val)) }} />
              <button onclick={() => pickImage(f)} title="Pick a PNG (from the mod, D:\ModTools\assets, ...); it is copied into the mod on save">Pick…</button>
            {/if}
            {#if set}<button class="mini" onclick={() => edit((x) => x.revert(f.path))} title="Remove this mod's change">Revert</button>{/if}
          </div>
          {#if f.help}<div class="help span">{f.help}</div>{/if}
        </div>
      {/if}
    {/each}
  {:else if tab === 'other'}
    <p class="muted small">Keys the tabs don't show, kept exactly as they are. Edit one as loose JSON (comments and unquoted keys are fine).</p>
    {#each otherKeys as k (k)}
      {@const val = ed.value(k)}
      <div class="group">
        <div class="gt"><span class="mono">{k}</span>{#if ed.isSet(k)}<button class="mini" onclick={() => edit((x) => x.revert(k))}>Revert</button>{/if}</div>
        <textarea class="mono" rows={Math.min(12, JSON.stringify(val, null, 2).split('\n').length)} value={JSON.stringify(val, null, 2)} onchange={(e) => setOther(k, e.currentTarget.value)}></textarea>
      </div>
    {/each}
    {#if otherError}<div class="bad">{otherError}</div>{/if}
    <div class="row2"><input type="text" class="mono" placeholder="new key" bind:value={newOtherKey} /><button onclick={() => { const k = newOtherKey.trim(); if (k) { edit((x) => x.set(k, '')); newOtherKey = '' } }}>+ Add key</button></div>
  {:else}
    {@render extra(tab)}
  {/if}
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; }
  .seg { display: flex; flex-wrap: wrap; }
  .seg button { border-radius: 0; margin-left: -1px; padding: 3px 10px; font-size: 12px; }
  .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 4px 4px 0; }
  .seg button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .body { padding: 12px 14px; overflow: auto; flex: 1; min-height: 0; }
  .row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 4px 10px; align-items: center; padding: 3px 0; }
  .row label { color: var(--muted); font-size: 12px; }
  .row.patched label { color: var(--warn); }
  .ctl { display: flex; gap: 6px; align-items: center; }
  .ctl input[type='text'] { flex: 1; min-width: 0; }
  .help { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .help.span { grid-column: 2; margin-top: 0; }
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; background: #161a20; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
  .gt .mine { color: var(--warn); }
  .gt .othermod { color: #c9a0ff; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 2px; }
  .chip.add { border-color: #6b4a1f; color: var(--warn); }
  .chip.other { opacity: .6; color: #c9a0ff; }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; color: var(--muted); }
  .chip .x:hover { color: var(--bad); }
  .addchip :global(input) { font-size: 11px; padding: 1px 6px; border-radius: 10px; }
  .mini { padding: 0 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t td { border-bottom: 1px solid #1e242c; padding: 3px 6px; }
  table.t input { width: 100%; }
  textarea { width: 100%; resize: vertical; font-size: 12px; }
  .small { font-size: 12px; }
  .bad { color: var(--bad); }
  .row2 { display: flex; gap: 6px; margin-top: 6px; }
</style>
