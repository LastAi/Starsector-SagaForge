<script lang="ts">
  /**
   * The faction form, for additions (whole document) and overrides (effective value; edits go to
   * the patch). Field definitions: shared/factionform.ts.
   */
  import { FACTION_TABS, KNOWN_TOP_KEYS, visibleFields, colorToHex, hexToColor, type FactionEditor, type FactionField, type IdSource } from '../../../shared/factionform'
  import { isObj } from '../../../shared/faction'
  import { parseLoose } from '../../../shared/loosejson'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { nameCategoryTotals, shipListTotals } from '../../../shared/checks/names'
  import { factionKeyDoc } from '../../../shared/factionkeys'
  import { openReference } from '../ui/reference'
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

  /** Walk F29: lists where the game refuses to start on an unknown id; their known ids, for marking typos. */
  const STRICT: IdSource[] = ['hulls', 'wings', 'weapons', 'hullmods', 'commodities']
  const known = $derived(new Map(STRICT.map((s) => [s, new Set(options(s).map((o) => o.id))])))
  const unknownId = (src: IdSource | undefined, id: string) => !!src && STRICT.includes(src) && !known.get(src)!.has(id)
  function options(src: IdSource | undefined): { id: string; name?: string }[] {
    switch (src) {
      case 'hulls': return index.hulls.map((h) => ({ id: h.id, name: `${h.name} (${h.hullSize.toLowerCase().replace('_ship', '')})` }))
      case 'wings': return index.wings
      case 'weapons': return index.weapons
      case 'hullmods': return index.hullmods
      case 'commodities': return index.items.filter((i) => i.kind === 'commodity')
      case 'portraits': return index.portraits.map((p) => ({ id: p.path }))
      case 'music': return index.music.map((m) => ({ id: m }))
      case 'nameSets': return nameSetOptions
      case 'shipNames': return shipNameOptions
      case 'fleetTypes': {
        const names = index.fleetTypeNames ?? {}
        const ids = [...new Set([...app.defs.fleetTypes.map((t) => t.id), ...Object.keys(names)])]
        return [...ownFleetTypes.filter((t) => !ids.includes(t)).map((id) => ({ id, name: 'used by your encounters' })), ...ids.map((id) => ({ id, name: names[id] ?? '' }))]
      }
      case 'stations': return index.industries.filter((i) => /station|battlestation|starfortress/i.test(i.id))
      default: return []
    }
  }
  // name lists (R3): the game's and other mods' categories (from the index) plus this mod's own
  const byMineFirst = <T extends { id: string; sources: string[] }>(l: T[]) => [...l].sort((a, b) => Number(b.sources.includes('mine')) - Number(a.sources.includes('mine')) || a.id.localeCompare(b.id))
  const nameSetOptions = $derived(byMineFirst([...nameCategoryTotals(index, project.m, project.loaded?.sourceId ?? null).values()])
    .map((c) => ({ id: c.id, name: `${c.male} m · ${c.female} f · ${c.last} last · ${c.sources.map(srcName).join(', ')}` })))
  const shipNameOptions = $derived(byMineFirst([...shipListTotals(index, project.m, project.loaded?.sourceId ?? null).values()])
    .map((c) => ({ id: c.id, name: `${c.count} names · ${c.sources.map(srcName).join(', ')}` })))
  const ownFleetTypes = $derived([...new Set((project.m?.encounters ?? []).map((e) => e.fleet.type).filter(Boolean))])
  function srcName(id: string): string { return id === 'mine' ? 'this mod' : id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id }
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  /** Flag or crest: choose by picture, or import one (cropped and resized to vanilla's size) (R28). */
  async function pickImage(f: FactionField) {
    const [p] = await chooseImages(f.path === 'logo' ? 'flag' : 'crest', { current: String(ed.value(f.path) ?? '') })
    if (p) edit((e) => e.set(f.path, p))
  }
  /** Portrait lists: add several at once, or a whole imported folder (F16). */
  async function addPortraits(f: FactionField) {
    const ps = await chooseImages('portrait', { multi: true, title: `Add to ${f.label.toLowerCase()}: click portraits, then Add` })
    if (ps.length) edit((e) => { for (const p of ps) e.addToList(f.path, p) })
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
  // R7: keys vanilla's factions use that this faction doesn't have yet (custom keys as "custom.<key>")
  const suggestions = $derived((index.factionKeyUsage ?? []).filter((s) => ed.value(s.key) === undefined))
  const vanillaCount = $derived(index.factions.filter((f) => f.definedBy === 'starsector-core').length)
  const short = (v: unknown) => { const t = JSON.stringify(v); return t && t.length > 80 ? t.slice(0, 77) + '…' : t }
</script>

<div class="toolbar">
  <div class="seg">
    {#each tabs as t (t.id)}<button class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}{t.id === 'other' && otherKeys.length ? ` (${otherKeys.length})` : ''}</button>{/each}
  </div>
</div>

<div class="body">
  {#if current}
    {#each visibleFields(current, factionId, app.defs.gameVersion, (p) => ed.value(p)) as f (f.path)}
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
                  {@const bad = l.mine && unknownId(f.source, String(x))}
                  <span class="chip" class:add={l.mine && ed.kind === 'override'} class:other={!l.mine && li > 0} class:bad title={bad ? `Unknown id: no "${String(x)}" in the game or the installed mods. The game refuses to start with it (see Problems).` : srcName(l.sourceId)}>
                    {#if f.source === 'portraits'}<ImageView path={String(x)} sourceId={l.mine ? undefined : l.sourceId} w={20} h={20} />{/if}{f.source === 'portraits' ? String(x).replace(/^.*\//, '') : String(x)}{#if !l.mine && li > 0}<span class="muted"> · {srcName(l.sourceId)}</span>{/if}
                    <button class="x" title="Remove" onclick={() => { const val = String(x); if (l.mine) edit((e) => { e.removeFromList(f.path, val) }); else onCantRemove(f.path, val) }}>✕</button>
                  </span>
                {/each}
              {/if}
            {/each}
            {#if f.source === 'portraits'}<button class="mini" onclick={() => addPortraits(f)} title="Pick portraits by their picture, or import several (or a folder) at once">+ Choose…</button>{/if}
            <span class="addchip"><IdInput value="" options={options(f.source)} placeholder="+ add…" width="170px" clearOnCommit onCommit={(id) => { if (id) edit((e) => e.addToList(f.path, id)) }} /></span>
          </div>
          {#if f.help}<div class="help">{f.help}</div>{/if}
        </div>
      {:else if f.kind === 'weights' || f.kind === 'names' || f.kind === 'labels'}
        {@const map = isObj(v) ? (v as Record<string, unknown>) : {}}
        {@const opts = f.kind === 'names' ? (f.path.endsWith('posts') ? app.defs.posts : app.defs.ranks) : options(f.source)}
        <div class="group">
          <div class="gt"><span>{f.label}</span>{#if set}<button class="mini" onclick={() => edit((e) => e.revert(f.path))}>Revert</button>{/if}</div>
          <table class="t">
            <tbody>
              {#each Object.entries(map) as [k, w] (k)}
                {@const known = opts.find((o) => o.id === k)}
                <tr>
                  <td class="mono">{k}{#if f.kind === 'weights' && known?.name && known.name !== k}<div class="muted small sans">{known.name}</div>{/if}</td>
                  <td>
                    {#if f.kind === 'weights'}
                      <input type="number" step="0.05" value={Number(w)} onchange={(e) => { const n = num(e.currentTarget.value); edit((ed2) => ed2.setWeight(f.path, k, n)) }} />
                    {:else if f.kind === 'labels'}
                      <input type="text" value={String(w ?? '')} placeholder={index.fleetTypeNames?.[k] ?? ''} onchange={(e) => { const t = e.currentTarget.value; edit((ed2) => ed2.set(`${f.path}.${k}`, t)) }} />
                    {:else}
                      <input type="text" value={String((w as Record<string, unknown>)?.name ?? '')} onchange={(e) => { const name = e.currentTarget.value; edit((ed2) => ed2.set(`${f.path}.${k}`, { name })) }} />
                    {/if}
                  </td>
                  <td>{#if ed.kind === 'addition' || ed.isSet(`${f.path}.${k}`)}<button class="mini" onclick={() => edit((ed2) => (f.kind === 'weights' ? ed2.setWeight(f.path, k, undefined) : ed2.revert(`${f.path}.${k}`)))}>✕</button>{/if}</td>
                </tr>
              {/each}
              <tr><td colspan="3"><IdInput value="" placeholder="+ add id…" width="200px" clearOnCommit
                options={opts.filter((o) => !(o.id in map))}
                onCommit={(id) => { if (id) edit((e) => (f.kind === 'weights' ? e.setWeight(f.path, id, 1) : f.kind === 'labels' ? e.set(`${f.path}.${id}`, index.fleetTypeNames?.[id] ?? id) : e.set(`${f.path}.${id}`, { name: opts.find((r) => r.id === id)?.name ?? id }))) }} /></td></tr>
            </tbody>
          </table>
          {#if f.help}<div class="help">{f.help}</div>{/if}
        </div>
      {:else if f.kind === 'presence'}
        {@const base = ed.kind === 'override' && v != null && !set}
        <div class="row" class:patched={set}>
          <label for={`f-${f.path}`}>{f.label}</label>
          <div class="ctl">
            <input id={`f-${f.path}`} type="checkbox" checked={v != null} disabled={base}
              title={base ? 'The original faction has it; a merge file can\'t remove it' : ''}
              onchange={(e) => { const on = e.currentTarget.checked; edit((x) => (on ? x.set(f.path, f.template ?? {}) : x.revert(f.path))) }} />
            {#if base}<span class="muted small">set by the original faction (a merge can't remove it)</span>{/if}
          </div>
          {#if f.help}<div class="help span">{f.help}</div>{/if}
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
              <button onclick={() => pickImage(f)} title="Choose by picture, or import your own (cropped and resized to vanilla's size)">Choose…</button>
            {/if}
            {#if set}<button class="mini" onclick={() => edit((x) => x.revert(f.path))} title="Remove this mod's change">Revert</button>{/if}
          </div>
          {#if f.help}<div class="help span">{f.help}</div>{/if}
        </div>
      {/if}
    {/each}
  {:else if tab === 'other'}
    <p class="muted small">Keys the tabs don't show, kept exactly as they are. Edit one as loose JSON (comments and unquoted keys are fine). <button class="linkish" onclick={() => openReference('factions-other-keys')}>ⓘ What the keys do</button></p>
    {#each otherKeys as k (k)}
      {@const val = ed.value(k)}
      <div class="group">
        <div class="gt"><span class="mono">{k}</span>{#if ed.isSet(k)}<button class="mini" onclick={() => edit((x) => x.revert(k))}>Revert</button>{/if}</div>
        <textarea class="mono" rows={Math.min(12, JSON.stringify(val, null, 2).split('\n').length)} value={JSON.stringify(val, null, 2)} onchange={(e) => setOther(k, e.currentTarget.value)}></textarea>
        <div class="help">{factionKeyDoc(k)}</div>
      </div>
    {/each}
    {#if otherError}<div class="bad">{otherError}</div>{/if}
    <div class="group">
      <div class="gt"><span>Add a key</span><span>used by vanilla's factions</span></div>
      {#if suggestions.length}
        <table class="t sugg">
          <colgroup><col class="c-key" /><col class="c-n" /><col /><col class="c-add" /></colgroup>
          <tbody>
            {#each suggestions as s (s.key)}
              <tr>
                <td class="mono">{s.key}</td>
                <td class="muted small" title="Vanilla factions that set it">{s.count}/{vanillaCount}</td>
                <td class="small">{factionKeyDoc(s.key)}<div class="muted small ex">Starts from {s.example.faction}'s value: <span class="mono">{short(s.example.value)}</span></div></td>
                <td><button class="mini" onclick={() => edit((x) => x.set(s.key, s.example.value))}>+ Add</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}<div class="muted small">Every key vanilla's factions use is already here or has a field.</div>{/if}
      <div class="row2"><input type="text" class="mono" placeholder="another key (custom.<key> for a custom key)" bind:value={newOtherKey} /><button onclick={() => { const k = newOtherKey.trim(); if (k) { edit((x) => x.set(k, '')); newOtherKey = '' } }}>+ Add key</button></div>
    </div>
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
  .chip.bad { border-color: var(--bad); color: var(--bad); text-decoration: wavy underline; }
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
  .row2 input { flex: 1; }
  table.sugg { table-layout: fixed; }
  table.sugg td { vertical-align: top; }
  table.sugg td:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table.sugg .c-key { width: 220px; } table.sugg .c-n { width: 48px; } table.sugg .c-add { width: 64px; }
  table.sugg .ex { overflow-wrap: anywhere; }
  .sans { font-family: inherit; }
  .linkish { border: none; background: none; color: var(--accent); padding: 0 2px; font-size: 12px; }
</style>
