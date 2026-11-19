<script lang="ts">
  import VersionStrip from '../ui/VersionStrip.svelte'
  import ScriptedChanges from '../factions/ScriptedChanges.svelte'
  import type { FactionsRuntime } from '../../../shared/model'
  import { itemVer, setDescription, descriptionText } from '../state/itemver.svelte'
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
  import NameListForm from '../factions/NameListForm.svelte'
  import { cleanNames, personNameRows, shipNameLists } from '../../../shared/export/names'
  import Modal from '../ui/Modal.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Field from '../ui/Field.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import Splitter from '../Splitter.svelte'
  import { layout, saveLayout } from '../layout.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import ShowAllMods from '../ui/ShowAllMods.svelte'
  import { mods } from '../state/mods.svelte'
  import type { ModsCondition } from '../../../shared/model'
  import NexerelinTab from '../factions/NexerelinTab.svelte'
  import { newNexConfig, nexRelationPairs, type NexConfig } from '../../../shared/nexconfig'
  import { nexListed } from '../../../shared/modlist'
  import { effectiveConds } from '../../../shared/moduses'

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
  /** Walk F31: names more than one faction shares ("ArmaA" ×3): those show their id too. */
  const sameName = $derived.by(() => { const n = new Map<string, number>(); for (const f of index.factions) n.set(f.name, (n.get(f.name) ?? 0) + 1); return new Set([...n].filter(([, c]) => c > 1).map(([k]) => k)) })
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
    try { return factionText($state.snapshot(entry) as FactionEdit, old) } catch (e) { return `(can't show: ${(e as Error).message})` }
  })
  const fileState = $derived(entry ? (project.loaded?.files[entry.file] ? (project.loaded.files[entry.file].text === preview ? 'unchanged' : 'changed') : 'new file') : '')

  // ---- new faction / change a faction / delete / change id
  let newName = $state('')
  let showNew = $state(app.smokeModal === 'new') // screenshot mode can open it
  let showChange = $state(app.smokeModal === 'change')
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
      if (e.kind === 'addition') delete mm.nexerelin?.[e.id]
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
      // #63: its Nexerelin config follows (Export removes the old file and writes the new one)
      if (mm.nexerelin?.[e.id]) { mm.nexerelin[to] = mm.nexerelin[e.id]; delete mm.nexerelin[e.id] }
      for (const p of mm.people) if (p.faction === e.id) p.faction = to
    })
    if (project.loaded?.files[oldFile]) project.deletedFactionFiles = [...project.deletedFactionFiles, oldFile]
    app.selected.factions = to
    showChangeId = false
  }

  // ---- a list entry a merge can't remove
  let cantRemove = $state<{ path: string; value: string } | null>(app.smokeModal === 'cantremove' ? { path: 'knownShips.hulls', value: 'onslaught' } : null)
  function scripted() {
    const c = cantRemove
    const id = sel
    if (!c || !id) return
    edRt((rt) => {
      // re-read after creating: the state proxy wraps a new array, so pushing to the plain one would be lost
      rt.scripted[id] ??= []
      const list = rt.scripted[id]
      if (!list.some((s) => s.path === c.path && s.value === c.value)) list.push({ op: 'remove', path: c.path, value: c.value })
    })
    cantRemove = null
  }
  // #64: starting relations and scripted changes as in the open version (one versioned item for the mod: factions.json)
  const rtView = $derived(m ? itemVer.view('factions', 'factions', m.factionsRuntime) : null)
  const edRt = (fn: (rt: FactionsRuntime) => void) => itemVer.edit<FactionsRuntime>('factions', 'factions', (rt) => fn(rt))
  const rtPaths = (id: string) => (p: string) => p === `relations.${id}` || p.startsWith(`relations.${id}.`) || p === `scripted.${id}` || p.startsWith(`scripted.${id}[`) || p.startsWith(`scripted.${id}.`) || p.startsWith(`relationMods.${id}`)
  const editScripted = (id: string, fn: (l: import('../../../shared/faction').ScriptedFactionChange[]) => void) => edRt((rt) => { rt.scripted[id] ??= []; fn(rt.scripted[id]); if (!rt.scripted[id].length) delete rt.scripted[id] })
  const scriptedList = $derived(sel ? rtView?.scripted[sel] ?? [] : [])

  // ---- relations (additions only; SagaLib sets them on new game)
  const relations = $derived(sel ? rtView?.relations[sel] ?? {} : {})
  function setRel(other: string, v: number | undefined) {
    const id = sel
    if (!id) return
    edRt((rt) => {
      const r = (rt.relations[id] ??= {})
      if (v === undefined) { delete r[other]; if (rt.relationMods?.[id]) delete rt.relationMods[id][other] }
      else r[other] = Math.max(-1, Math.min(1, v))
      if (!Object.keys(r).length) delete rt.relations[id]
    })
  }
  /** #60: a starting relation only with / without optional mods (SagaLib 1.3). */
  function setRelMods(other: string, c: ModsCondition | undefined) {
    const id = sel
    if (!id) return
    edRt((rt) => {
      const rm = (rt.relationMods ??= {})
      const x = (rm[id] ??= {})
      if (c) x[other] = c
      else delete x[other]
      if (!Object.keys(x).length) delete rm[id]
      if (!Object.keys(rm).length) delete rt.relationMods
    })
  }
  /** #60: a faction that only matters with a mod: hidden from the intel tab under these conditions (scripted change, SagaLib 1.3). */
  const hideCond = $derived(sel ? rtView?.scripted[sel]?.find((c) => c.op === 'hideFromIntelTab')?.mods : undefined)
  function setHide(c: ModsCondition | undefined) {
    const id = sel
    if (!id) return
    edRt((rt) => {
      const l = (rt.scripted[id] ??= []).filter((x) => x.op !== 'hideFromIntelTab')
      if (c) l.push({ op: 'hideFromIntelTab', path: '', value: '', mods: c })
      if (l.length) rt.scripted[id] = l
      else delete rt.scripted[id]
    })
  }
  // ---- #63: the Nexerelin tab (own factions; shown when the mod lists Nexerelin, or the faction already has a config)
  const nexConfig = $derived(sel ? ((m?.nexerelin?.[sel] as NexConfig | undefined) ?? null) : null)
  const showNex = $derived(!!m && (nexListed(m.project) || !!nexConfig))
  const nexPairs = $derived(tab === 'nexerelin' && sel && m && app.index ? nexRelationPairs(m, sel, effectiveConds(m, app.index, project.loaded?.sourceId ?? '')) : { inConfig: {}, stayWithSagaLib: [] })
  function editNex(fn: (c: NexConfig) => void) {
    const id = sel
    if (!id) return
    project.change((mm) => { const c = mm.nexerelin?.[id]; if (c) fn(c) })
  }
  function createNex() {
    const id = sel
    if (!id) return
    project.change((mm) => { (mm.nexerelin ??= {})[id] = newNexConfig() })
  }
  function removeNex() {
    const id = sel
    if (!id || !confirm(`Remove ${id}'s Nexerelin config? Export then removes the file it wrote. Undo can bring it back until you save.`)) return
    project.change((mm) => { delete mm.nexerelin?.[id] })
  }
  const allFactionOptions = $derived([...index.factions.map((f) => ({ id: f.id, name: f.name })), ...additions.filter((a) => !index.factions.some((f) => f.id === a.id)).map((a) => ({ id: a.id, name: String(a.raw.displayName ?? a.id) })), { id: 'player', name: 'Player' }])
  const desc = $derived(sel && m ? descriptionText(`FACTION:${sel}`) : '')

  // ---- name lists (R3): selected as "@people:<id>" / "@ships:<id>"
  const nameSel = $derived.by((): { kind: 'people' | 'ships'; id: string } | null => {
    const r = /^@(people|ships):(.+)$/.exec(sel ?? '')
    return r ? { kind: r[1] as 'people' | 'ships', id: r[2] } : null
  })
  const namePreview = $derived.by(() => {
    const ns = nameSel
    if (!ns || !m) return ''
    if (ns.kind === 'people') {
      const p = m.names.people.find((x) => x.id === ns.id)
      const rows = p ? personNameRows([p]) : []
      const shown = rows.slice(0, 200).map((r) => [r.name, r.gender, r.usage, r.category].map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      return ['name,gender,usage,category', ...shown, ...(rows.length > 200 ? [`… ${rows.length - 200} more`] : [])].join('\n')
    }
    const l = m.names.ships.find((x) => x.id === ns.id)
    return l ? JSON.stringify(shipNameLists([l]), null, 2) : ''
  })
  let showNewList = $state(app.smokeModal === 'newlist')
  let newListKind = $state<'people' | 'ships'>('people')
  let newListName = $state('')
  const newListId = $derived.by(() => {
    const s = slug(newListName).replace(new RegExp(`^${project.prefix}`), '')
    if (!s) return ''
    return newListKind === 'people' ? project.prefix + s : (project.prefix + s).toUpperCase()
  })
  function createList() {
    const id = newListId
    if (!id || !m) return
    const taken = newListKind === 'people' ? m.names.people.some((p) => p.id === id) : m.names.ships.some((p) => p.id === id)
    if (taken) { app.error = `This mod already has a name list "${id}".`; return }
    project.change((mm) => {
      if (newListKind === 'people') mm.names.people.push({ id, male: [], female: [], first: [], last: [] })
      else mm.names.ships.push({ id, names: [] })
    })
    showNewList = false
    newListName = ''
    app.selected.factions = `@${newListKind}:${id}`
  }
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
      <div class="sect">Name lists <button disabled={!m} onclick={() => (showNewList = true)} title="Names for this mod's generated people or ships">+ New list</button></div>
      <ul class="list">
        {#each (m?.names.people ?? []).filter((p) => match(p.id, 'names')) as p (p.id)}
          <li class:on={sel === `@people:${p.id}`}><button class="li" onclick={() => (app.selected.factions = `@people:${p.id}`)}><span class="ico">👤</span><span class="mono">{p.id}</span><span class="sub">people · {cleanNames([...p.male, ...p.female, ...p.first, ...p.last]).length}</span></button></li>
        {/each}
        {#each (m?.names.ships ?? []).filter((p) => match(p.id, 'ships')) as l (l.id)}
          <li class:on={sel === `@ships:${l.id}`}><button class="li" onclick={() => (app.selected.factions = `@ships:${l.id}`)}><span class="ico">🚀</span><span class="mono">{l.id}</span><span class="sub">ships · {cleanNames(l.names).length}</span></button></li>
        {/each}
        {#if !(m?.names.people.length || m?.names.ships.length)}<li class="muted small">None: factions use the game's names.</li>{/if}
      </ul>
      <div class="sect">Everyone else (read-only)</div>
      <ShowAllMods list="factions" hidden={mods.hidden('factions', others, (f) => f.definedBy)} />
      <ul class="list ro">
        {#each mods.filter('factions', others, (f) => f.definedBy) as f (f.id)}
          <li class:on={sel === f.id}><button class="li" title={f.id} onclick={() => (app.selected.factions = f.id)}><span class="swatch" style="background:{swatch(f.color)}"></span>{f.name}{#if sameName.has(f.name)}<span class="mono idtag">{f.id}</span>{/if}<span class="sub">{srcName(f.definedBy)}</span></button></li>
        {/each}
      </ul>
    </div>
  </aside>
  <Splitter axis="x" value={layout.left} min={180} max={() => 520} label="Resize list" onChange={(v) => (layout.left = v)} onDone={saveLayout} onReset={() => { layout.left = 280; saveLayout() }} />

  <section class="main">
    {#if nameSel}
      {#key sel}<NameListForm kind={nameSel.kind} id={nameSel.id} onDeleted={() => (app.selected.factions = null)} />{/key}
    {:else if entry && ed}
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
        extraTabs={entry.kind === 'addition' ? [{ id: 'relations', label: 'Relations & changes' }, { id: 'description', label: 'Description' }, ...(showNex ? [{ id: 'nexerelin', label: 'Nexerelin' }] : [])] : [{ id: 'scripted', label: 'Scripted changes' }]}
        onCantRemove={(path, value) => (cantRemove = { path, value })}>
        {#snippet extra(t)}
          {#if t === 'scripted'}
            <div class="group">
              <VersionStrip kind="factions" id="factions" paths={rtPaths(entry.id)} what={`${entry.id}'s scripted changes`} />
              <div class="gt"><span>Scripted changes</span><span class="badge b-lib">SagaLib, every load</span></div>
              <ScriptedChanges factionId={entry.id} list={scriptedList} onEdit={(fn) => editScripted(entry.id, fn)} />
            </div>
          {:else if t === 'relations' && entry.kind === 'addition'}
            <div class="group">
              <VersionStrip kind="factions" id="factions" paths={rtPaths(entry.id)} what={`${entry.id}'s starting relations and scripted changes`} />
              <div class="gt"><span>Starting relations</span><span class="badge b-lib">set by SagaLib on new game</span></div>
              <table class="t rel">
                <colgroup><col /><col class="c-start" /><col class="c-level" /><col class="c-x" /></colgroup>
                <thead><tr><th>Faction</th><th>Start</th><th>Level</th><th></th></tr></thead>
                <tbody>
                  {#each Object.entries(relations) as [other, v] (other)}
                    <tr><td>{allFactionOptions.find((o) => o.id === other)?.name ?? other} <span class="mono muted">{other}</span>
                      <ModsCond compact value={rtView?.relationMods?.[entry.id]?.[other]} itemKey={`relation:${entry.id}/${other}`} onChange={(c) => setRelMods(other, c)} /></td>
                      <td><input type="range" min="-1" max="1" step="0.05" value={v} oninput={(e) => setRel(other, Number(e.currentTarget.value))} /> <input type="number" class="mono relv" min="-1" max="1" step="0.05" value={v} title="Type an exact value, -1 to 1" onchange={(e) => { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) setRel(other, Math.max(-1, Math.min(1, n))) }} /></td>
                      <td class:good={v >= 0.24} class:bad={v <= -0.49}>{repLevelName(v, app.defs.repLevels)}</td>
                      <td><button class="mini" onclick={() => setRel(other, undefined)}>✕</button></td></tr>
                  {/each}
                  <tr><td colspan="4"><IdInput value="" placeholder="+ faction…" width="220px" clearOnCommit options={allFactionOptions.filter((o) => o.id !== entry.id && !(o.id in relations))} onCommit={(id) => { if (id) setRel(id, 0) }} /></td></tr>
                </tbody>
              </table>
              <div class="help">Everyone else starts neutral (vanilla default). Starting relations aren't a .faction key, so they go into <span class="mono">data/sagaforge/factions.json</span> and the mod needs SagaLib. A relation with an optional mod's faction gets "Only with" that mod by itself.{#if nexConfig} The faction has a Nexerelin config: these relations are written there too, and with Nexerelin it sets them (randomized only when the player asks) and SagaLib leaves them alone; those that depend on mods stay SagaLib's.{/if}</div>
              <div class="gt"><span>Hidden from the intel tab</span><span class="badge b-lib">SagaLib 1.3</span></div>
              <ModsCond value={hideCond} onChange={setHide} />
              <div class="help">For a faction that only matters with an optional mod: the game always loads it, so hide it from the intel tab when it isn't needed, e.g. <b>Only without</b> that mod. SagaLib calls the game's setShowInIntelTab(false) on every load. The file's own showInIntelTab can't depend on mods.</div>
              <div class="gt"><span>Scripted changes</span><span class="badge b-lib">SagaLib, every load</span></div>
              <ScriptedChanges factionId={entry.id} list={scriptedList.filter((c) => c.op !== 'hideFromIntelTab')} onEdit={(fn) => editScripted(entry.id, (l) => { const hide = l.filter((c) => c.op === 'hideFromIntelTab'); const rest = l.filter((c) => c.op !== 'hideFromIntelTab'); fn(rest); l.splice(0, l.length, ...rest, ...hide) })} />
            </div>
          {:else if t === 'nexerelin' && entry.kind === 'addition'}
            <NexerelinTab factionId={entry.id} config={nexConfig} relations={nexPairs.inConfig} stay={nexPairs.stayWithSagaLib}
              factionOptions={allFactionOptions} onFleets={() => app.go('fleets', `nex=${entry.id}`)}
              onEdit={editNex} onCreate={createNex} onRemove={removeNex} onRelations={() => (tab = 'relations')} />
          {:else if t === 'description'}
            <div class="group">
              <div class="gt"><span>Description</span><span class="mono">descriptions.csv · {entry.id} · FACTION</span></div>
              {#if m?.descriptions[`FACTION:${entry.id}`]}<VersionStrip kind="description" id={`FACTION:${entry.id}`} what="this description (set at startup from the installed mods)" />{/if}
              <textarea rows="10" value={desc} spellcheck="true" onchange={(e) => setDescription(`FACTION:${entry.id}`, e.currentTarget.value)}></textarea>
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
    {#if nameSel && namePreview}
      <h3>Exported as <span class="badge b-new">{nameSel.kind === 'people' ? 'rows in an owned block' : 'merged by key'}</span></h3>
      <pre class="files">{namePreview}</pre>
      <div class="muted small">{nameSel.kind === 'people' ? 'name, gender (m / f / empty = both), usage (f = first, l = last), category. The game adds these rows to its own names.' : 'The game appends this list to any list with the same id.'}</div>
    {:else if entry}
      <h3>{entry.kind === 'addition' ? 'File preview' : 'Patch file'} <span class="badge" class:b-new={entry.kind === 'addition'} class:b-ovr={entry.kind === 'override'}>{entry.kind === 'override' ? 'only this mod\'s changes' : fileState}</span></h3>
      <pre class="files">{preview}</pre>
      {#if entry.kind === 'addition'}
        <div class="muted small">{entry.listed ? '+ a row in' : 'Not listed in'} <span class="mono">data/world/factions/factions.csv</span>. Unknown keys and comments in the file are kept.</div>
        {#if !entry.listed}<button class="mini" onclick={() => { const id = entry.id; project.change((mm) => { const f = mm.factions.find((x) => x.id === id); if (f?.kind === 'addition') f.listed = true }) }}>List it in factions.csv</button>{/if}
      {:else}
        <div class="muted small">The writer for overrides can't produce a full copy of the original; it only writes the patch.</div>
        {#if scriptedList.length}<div class="muted small">+ {scriptedList.length} scripted change{scriptedList.length === 1 ? '' : 's'} (tab Scripted changes) → <span class="mono">data/sagaforge/factions.json</span>, applied by SagaLib on load.</div>{/if}
      {/if}
    {/if}
  </aside>
</div>

{#if showNew}
  <Modal title="New faction" onClose={() => (showNew = false)}>
    <div class="grid2">
      <Field label="Name" for="nf" help="Its display name; the other names on the Identity tab start from it."><input id="nf" type="text" bind:value={newName} placeholder="e.g. Vanguard Compact" /></Field>
      <Field label="Id" help="The faction id in files, conditions and saves."><span class="mono">{newId || '—'}</span></Field>
    </div>
    <p class="muted small">Creates <span class="mono">data/world/factions/{newId}.faction</span> with the keys vanilla factions have, and lists it in the mod's <span class="mono">factions.csv</span>. The id can be changed later until the mod is released.</p>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newName.trim()} onclick={createFaction}>Create</button>{/snippet}
  </Modal>
{/if}

{#if showNewList}
  <Modal title="New name list" onClose={() => (showNewList = false)}>
    <div class="grid2 wide">
      <Field label="For" help="People's names: a name category (first and last names) for generated officers, administrators and contacts. Ship names: a list ships are named from.">
        <select bind:value={newListKind}><option value="people">people's names</option><option value="ships">ship names</option></select>
      </Field>
      <Field label="Name" for="nl-name" help="Becomes the list's id, with the mod's prefix (ship lists in capitals, as vanilla's GREEK or SPACE).">
        <input id="nl-name" type="text" bind:value={newListName} placeholder={newListKind === 'people' ? 'e.g. cats' : 'e.g. cat ships'} />
      </Field>
      <Field label="Id" help="The id factions use in Person name sets / Ship name sources."><span class="mono">{newListId || '—'}</span></Field>
    </div>
    <p class="muted small">Written on Export to the mod's <span class="mono">{newListKind === 'people' ? 'data/characters/person_names.csv' : 'data/strings/ship_names.json'}</span>; the game adds it to its own names. Then pick it in a faction's Names &amp; ranks.</p>
    {#snippet actions()}<button onclick={() => (showNewList = false)}>Cancel</button><button class="primary" disabled={!newListId} onclick={createList}>Create</button>{/snippet}
  </Modal>
{/if}

{#if showChange}
  <Modal title="Change a faction" onClose={() => (showChange = false)}>
    <p class="muted">Pick a faction defined by vanilla or another mod. Saga Forge writes only your changes, at the same path as the original, and the game merges them.</p>
    <div class="grid2">
      <Field label="Faction" help="Its id; the list shows each faction with its name.">
        <IdInput value={changeTarget} options={index.factions.filter((f) => !ownIds.has(f.id) && f.definedBy !== project.loaded?.sourceId)} strict onCommit={(v) => (changeTarget = v)} placeholder="e.g. hegemony" />
      </Field>
    </div>
    {#snippet actions()}<button onclick={() => (showChange = false)}>Cancel</button><button class="primary" disabled={!changeTarget} onclick={() => changeFaction()}>Change it</button>{/snippet}
  </Modal>
{/if}

{#if showChangeId}
  <Modal title="Change the faction's id" onClose={() => (showChangeId = false)}>
    <p>The file is renamed, and relations, descriptions and people that use the id follow. If the mod is already released, saves keep the old faction: avoid this after release (Problems will warn).</p>
    <div class="grid2"><Field label="New id" for="cf-to" help="Lowercase letters, digits and _, starting with the mod's prefix."><input id="cf-to" type="text" class="mono" bind:value={changeIdTo} /></Field></div>
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
  /* relations: fixed columns, so the level word ("Neutral" → "Inhospitable") never moves the slider */
  table.rel { table-layout: fixed; }
  table.rel .c-start { width: 260px; } table.rel .c-level { width: 110px; } table.rel .c-x { width: 44px; }
  table.rel td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table.rel input[type='range'] { width: 180px; vertical-align: middle; }
  .idtag { font-size: 10px; color: var(--muted); margin-left: 6px; }
  .relv { display: inline-block; width: 64px; text-align: right; }
  .good { color: var(--good); } .bad { color: var(--bad); }
  .help { font-size: 11px; color: var(--muted); margin-top: 6px; }
  textarea { width: 100%; resize: vertical; }
  .grid2 { display: grid; grid-template-columns: 80px 1fr; gap: 2px 10px; align-items: center; width: 440px; max-width: 100%; }
  .grid2.wide { width: 520px; }
  .ico { width: 14px; text-align: center; font-size: 11px; flex: none; }
</style>
