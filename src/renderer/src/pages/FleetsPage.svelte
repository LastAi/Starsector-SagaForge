<script lang="ts">
  /**
   * Fleets (Phase 5; DESIGN-PHASE5.md): the mod's named fleets (R27: ships, ship names, flagship,
   * captain; reused by encounters), fleet type names for every faction (R22), and a preview of what
   * a faction's doctrine makes (R4); #63: Nexerelin's new-game ready-made fleets.
   */
  import RefButton from '../ui/RefButton.svelte'
  import { fullName } from '../../../shared/personname'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Modal from '../ui/Modal.svelte'
  import { doctrinePreview, newTemplate, templateUsers } from '../../../shared/fleets'
  import { slug } from '../../../shared/quest'
  import { getPath } from '../../../shared/faction'
  import type { FleetTemplateDef } from '../../../shared/model'
  import NexFleets from '../factions/NexFleets.svelte'
  import { NEX_PLAYER, NEX_PLAYER_CONFIG, nexConfigPath, nexConfigured, startFleets, type NexConfig } from '../../../shared/nexconfig'
  import { nexListed } from '../../../shared/modlist'
  import { mods } from '../state/mods.svelte'
  import { factionKnows, knownVariants, ownKnownShips } from '../../../shared/shipsets'
  import ShipSetDialog from '../ui/ShipSetDialog.svelte'

  const index = $derived(app.index!)
  const m = $derived(project.m)
  const sel = $derived(app.selected.fleets ?? null)
  const tpl = $derived(m?.fleets?.templates.find((t) => t.id === sel) ?? null)
  const factionOptions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id, name: String(f.raw.displayName ?? f.id) })) ?? []), ...index.factions])
  const typeNames = (id: string) => index.fleetTypeNames?.[id] ?? ''
  /** What the game calls a type without this mod (the mod's own exported names left out). */
  const gameName = (id: string) => (index.fleetTypeNamesBase ?? index.fleetTypeNames)?.[id] ?? ''
  const fleetTypeOptions = $derived([...new Set([...app.defs.fleetTypes.map((t) => t.id), ...Object.keys(index.fleetTypeNames ?? {}), ...Object.keys(m?.fleets?.typeNames ?? {})])].map((id) => ({ id, name: m?.fleets?.typeNames[id] || typeNames(id) })))
  // #67 U39 (user, 2026-11-22): the variants of the fleet's faction's ships (what its fleets can use),
  // the mod's list, or every installed mod (the picker's own switch); labelled by hull and variant name
  let onlyFaction = $state(true)
  let shipSet = $state(false)
  const variantLabel = (v: { id: string; hull?: string; displayName?: string }) => { const h = v.hull ? index.hulls.find((x) => x.id === v.hull) : undefined; return `${h?.name ?? v.hull ?? ''}${v.displayName ? ` (${v.displayName})` : ''}` }
  const factionShips = $derived(tpl && index ? knownVariants(index, factionKnows(index, tpl.faction, mods.visible, ownKnownShips(m?.factions ?? [], tpl.faction)), mods.visible) : [])
  const variantOptions = $derived((onlyFaction && factionShips.length ? factionShips : index.variants).map((v) => ({ id: v.id, name: variantLabel(v), definedBy: v.definedBy })))
  const edT = (fn: (t: FleetTemplateDef) => void) => { const id = sel; project.change((mm) => { const t = mm.fleets?.templates.find((x) => x.id === id); if (t) fn(t) }) }

  // ---- new named fleet
  let showNew = $state(app.smokeModal === 'new')
  let newName = $state('')
  const newId = $derived(newName.trim() ? project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), '') : '')
  // #67 U41 (user, 2026-11-22): copy the selected named fleet under a new name and id
  let copying = $state(false)
  function startCopy() { if (!tpl) return; newName = `${tpl.name || tpl.id} copy`; copying = true; showNew = true }
  let showInactive = $state(true)
  function create() {
    const id = newId
    if (!id || !m) return
    if (m.fleets?.templates.some((t) => t.id === id)) { app.error = `A named fleet "${id}" exists already.`; return }
    const faction = m.factions.find((f) => f.kind === 'addition')?.id ?? 'pirates'
    const from = copying ? tpl : null
    project.change((mm) => { mm.fleets ??= { templates: [], typeNames: {} }; mm.fleets.templates.push(from ? { ...JSON.parse(JSON.stringify($state.snapshot(from))), id, name: newName.trim(), inactive: undefined } : newTemplate(id, newName.trim(), faction)) })
    showNew = false
    copying = false
    newName = ''
    app.selected.fleets = id
  }
  function remove() {
    if (!tpl) return
    const users = templateUsers(m?.encounters ?? [], tpl.id)
    if (!confirm(`Delete the named fleet "${tpl.name || tpl.id}"?${users.length ? ` ${users.map((u) => u.name).join(', ')} use${users.length === 1 ? 's' : ''} it (Problems will report them).` : ''}`)) return
    const id = tpl.id
    project.change((mm) => { if (mm.fleets) mm.fleets.templates = mm.fleets.templates.filter((t) => t.id !== id) })
    app.selected.fleets = null
  }

  // ---- doctrine preview (R4): the mod's factions and its changes to others
  // screenshot mode: "fleets::doctrine=<faction>"
  let previewFaction = $state<string | null>(app.smokeArg?.startsWith('doctrine=') ? app.smokeArg.slice(9) : null)
  const previewList = $derived(m?.factions ?? [])
  let layers = $state<Record<string, Record<string, unknown>>>({})
  $effect(() => {
    const id = previewFaction
    if (!id || layers[id]) return
    window.api.loadFaction(id).then((l) => { const eff = l.layers.reduce<Record<string, unknown>>((a, x) => ({ ...a, ...x.raw, factionDoctrine: { ...((a.factionDoctrine as object) ?? {}), ...((x.raw.factionDoctrine as object) ?? {}) } }), {}); layers[id] = eff })
  })
  const doctrineOf = $derived.by(() => {
    const id = previewFaction
    if (!id) return null
    const f = m?.factions.find((x) => x.id === id)
    if (f?.kind === 'addition') return (f.raw.factionDoctrine as Record<string, unknown>) ?? {}
    const base = (layers[id]?.factionDoctrine as Record<string, unknown>) ?? {}
    const patch = f?.kind === 'override' ? ((getPath(f.patch.set, 'factionDoctrine') as Record<string, unknown>) ?? {}) : {}
    return { ...base, ...patch }
  })
  const preview = $derived(doctrineOf ? doctrinePreview(doctrineOf) : null)
  const pct = (x: number) => `${Math.round(x * 100)}%`
  let showTypes = $state(app.smokeArg === 'types')

  // ---- #63: Nexerelin's new-game ready-made fleets ("nex=<faction>" / "nex=player"): the mod's own
  // factions with a Nexerelin config, and fleets added to the player faction (free start, own faction)
  const nexSel = $derived(sel?.startsWith('nex=') ? sel.slice(4) : null)
  const nexOwn = $derived(m ? nexConfigured(m) : [])
  const showNex = $derived(!!m && (nexListed(m.project) || nexOwn.length > 0 || !!m.nexerelinPlayer))
  const nexCount = (c: NexConfig | undefined) => (c ? Object.values(startFleets(c)).reduce((a, l) => a + l.length, 0) : 0)
  const nexName = (id: string) => { const f = m?.factions.find((x) => x.id === id); return f?.kind === 'addition' ? String(f.raw.displayName ?? id) : id }
  const nexConfigOf = $derived(nexSel === NEX_PLAYER ? (m?.nexerelinPlayer ?? {}) : nexSel ? (m?.nexerelin?.[nexSel] ?? null) : null)
  function editNexFleets(fn: (c: NexConfig) => void) {
    const id = nexSel
    if (!id) return
    project.change((mm) => {
      if (id === NEX_PLAYER) {
        const c = (mm.nexerelinPlayer ??= {})
        fn(c)
        if (!Object.keys(c).length) delete mm.nexerelinPlayer
      } else { const c = mm.nexerelin?.[id]; if (c) fn(c) }
    })
  }
  const pick = (id: string) => { app.selected.fleets = id; previewFaction = null; showTypes = false }
</script>

<div class="page">
  <aside class="left">
    <div class="sect">Named fleets <span class="sectr"><label class="chk" title="Show named fleets marked Inactive (planned, not exported)"><input type="checkbox" bind:checked={showInactive} /> inactive</label><button disabled={!m || !tpl} onclick={startCopy} title={tpl ? `A copy of ${tpl.name || tpl.id} (everything: ships, captain, faction…) under a new name` : 'Select a named fleet to copy'}>+ Copy…</button><button disabled={!m} onclick={() => { copying = false; showNew = true }}>+ New…</button></span></div>
    <ul class="list">
      {#each (m?.fleets?.templates ?? []).filter((t) => showInactive || !t.inactive) as t (t.id)}
        <li class:on={sel === t.id && !previewFaction && !showTypes} class:inactive={t.inactive}><button class="li" onclick={() => { app.selected.fleets = t.id; previewFaction = null; showTypes = false }}>{t.name || t.id}{#if t.inactive} <span class="muted">[Inactive]</span>{/if}<span class="sub">{t.ships.length} ships</span></button></li>
      {:else}<li class="muted small pad">None yet.</li>{/each}
    </ul>
    <div class="sect">Fleet type names</div>
    <ul class="list"><li class:on={showTypes}><button class="li" onclick={() => { showTypes = true; previewFaction = null }}>For every faction<span class="sub">{Object.keys(m?.fleets?.typeNames ?? {}).length}</span></button></li></ul>
    <div class="sect">Doctrine preview</div>
    <ul class="list">
      {#each previewList as f (f.id)}
        <li class:on={previewFaction === f.id}><button class="li" onclick={() => { previewFaction = f.id; showTypes = false }}>{f.kind === 'addition' ? String(f.raw.displayName ?? f.id) : index.factions.find((x) => x.id === f.id)?.name ?? f.id}<span class="sub">{f.kind === 'addition' ? 'new' : 'override'}</span></button></li>
      {:else}<li class="muted small pad">No factions in this mod.</li>{/each}
    </ul>
    {#if showNex}
      <div class="sect" title="Nexerelin's new-game fleet choice: the ready-made fleets a player can start with">New-game fleets (Nexerelin)</div>
      <ul class="list">
        <li class:on={nexSel === NEX_PLAYER && !previewFaction && !showTypes}><button class="li" onclick={() => pick(`nex=${NEX_PLAYER}`)}>Player (free start, own faction)<span class="sub">{nexCount(m?.nexerelinPlayer) ? `+${nexCount(m?.nexerelinPlayer)}` : 'none'}</span></button></li>
        {#each nexOwn as id (id)}
          <li class:on={nexSel === id && !previewFaction && !showTypes}><button class="li" onclick={() => pick(`nex=${id}`)}>{nexName(id)}<span class="sub">{nexCount(m?.nexerelin?.[id]) || 'none'}</span></button></li>
        {/each}
        {#if !nexOwn.length}<li class="muted small pad">Your factions get fleets here once they have a Nexerelin config (Factions › Nexerelin).</li>{/if}
      </ul>
    {/if}
  </aside>

  <section class="main">
    {#if previewFaction && preview}
      {@const pf = m?.factions.find((x) => x.id === previewFaction)}
      <h2>What {pf?.kind === 'addition' ? String(pf.raw.displayName ?? previewFaction) : index.factions.find((x) => x.id === previewFaction)?.name ?? previewFaction}'s doctrine makes</h2>
      <p class="muted small">From the faction's Doctrine tab. The ship-size counts are vanilla's own (FleetFactoryV3, per round of building a fleet, base plus the average random extra). The game then adds randomness, quality and autofit, so a real fleet varies.</p>
      <div class="box">
        <div class="t">Composition</div>
        <div class="bar"><span class="w" style="width:{pct(preview.mix.warships)}">warships {pct(preview.mix.warships)}</span><span class="c" style="width:{pct(preview.mix.carriers)}">carriers {pct(preview.mix.carriers)}</span><span class="p" style="width:{pct(preview.mix.phase)}">phase {pct(preview.mix.phase)}</span></div>
        <div class="muted small">Combat freighters: {pct(preview.combatFreighters)} chance.</div>
      </div>
      <div class="box">
        <div class="t">Ship sizes per round</div>
        <div class="sizes">
          {#each [['frigates', preview.sizes.frigates], ['destroyers', preview.sizes.destroyers], ['cruisers', preview.sizes.cruisers], ['capitals', preview.sizes.capitals]] as [k, v] (k)}
            <div class="sz"><div class="col" style="height:{Math.round((Number(v) / Math.max(1, preview.sizes.frigates, preview.sizes.destroyers, preview.sizes.cruisers, preview.sizes.capitals)) * 70)}px"></div><span class="small">{k}<br />{Number(v).toFixed(1)}</span></div>
          {/each}
        </div>
      </div>
      <div class="box">
        <div class="t">Quality trade-off (vanilla factions keep it at 7)</div>
        {#each [['Officer quality', preview.quality.officers], ['Ship quality', preview.quality.ships], ['Number of ships', preview.quality.numbers]] as [k, v] (k)}
          <div class="qrow"><span class="small">{k}</span><span class="dots">{#each [1, 2, 3, 4, 5] as i (i)}<span class="dot" class:on={i <= Number(v)}></span>{/each}</span></div>
        {/each}
        <div class="muted small">Total {preview.quality.officers + preview.quality.ships + preview.quality.numbers}.</div>
      </div>
      <p><button class="mini" onclick={() => { app.go('factions', previewFaction); app.selected.factions = previewFaction }}>Edit the doctrine (Factions › Doctrine)</button></p>
    {:else if showTypes}
      <h2>Fleet type names for every faction</h2>
      <p class="muted small">The name a fleet of a type gets when its faction doesn't name the type itself (Factions › Names &amp; ranks › Fleet type names). Written to the mod's <span class="mono">data/world/factions/default_fleet_type_names.json</span>, merged with vanilla's. Name your own fleet types here so every faction's fleets of that type have a name.</p>
      <table class="t">
        <thead><tr><th>Fleet type</th><th>Name</th><th>Game's name</th><th></th></tr></thead>
        <tbody>
          {#each Object.entries(m?.fleets?.typeNames ?? {}) as [k, v] (k)}
            <tr><td class="mono">{k}</td><td><input type="text" value={v} onchange={(e) => { const val = e.currentTarget.value; project.change((mm) => { mm.fleets!.typeNames[k] = val }) }} /></td><td class="muted">{gameName(k) || '—'}</td>
              <td><button class="mini" onclick={() => project.change((mm) => { delete mm.fleets!.typeNames[k] })}>✕</button></td></tr>
          {/each}
          <tr><td colspan="4"><IdInput value="" options={fleetTypeOptions} placeholder="+ fleet type (vanilla's or your own id)" width="260px" clearOnCommit onCommit={(id) => { if (id) project.change((mm) => { mm.fleets ??= { templates: [], typeNames: {} }; mm.fleets.typeNames[id] = gameName(id) || id }) }} /><RefButton ref="factions-fleet-types" title="Fleet types and their default names: opens the reference" /></td></tr>
        </tbody>
      </table>
    {:else if nexSel && nexConfigOf}
      {#if nexSel === NEX_PLAYER}
        <h2>Player faction: ready-made fleets (Nexerelin)</h2>
        <p class="muted small">The fleets offered on Nexerelin's new-game fleet choice for <b>free start</b> and <b>own faction</b>, which use Nexerelin's player faction. Yours are <b>added after Nexerelin's own</b> (e.g. Frigate 1/5 becomes 1/6): Export writes them to <span class="mono">{NEX_PLAYER_CONFIG}</span> in your mod, which the game merges into Nexerelin's, appending the lists. Nexerelin's fleets can't be removed. They show for every player of your mod, with or without your factions; without Nexerelin nothing reads the file.</p>
      {:else}
        <h2>{nexName(nexSel)}: ready-made fleets (Nexerelin)</h2>
        <p class="muted small">The fleets offered on Nexerelin's new-game fleet choice when the player joins {nexName(nexSel)} at the start, next to Nexerelin's <b>Custom</b> button (a fleet built from the faction's known ships). Part of its Nexerelin config, <span class="mono">{nexConfigPath(nexSel)}</span>. <button class="linkish" onclick={() => { app.go('factions', nexSel) }}>Its other Nexerelin settings (Factions › Nexerelin)</button></p>
      {/if}
      <div class="box"><RefButton ref="factions-nex-start-fleets" title="What each new-game fleet kind is: opens the reference" /><NexFleets config={nexConfigOf} variantOptions={index.variants ?? []} onEdit={editNexFleets} /></div>
      <p class="muted small">Each fleet is a list of variant ids, by type (Frigate (classic), Combat (small), …, as Nexerelin's screen names them). A type with several fleets gets &lt; &gt; buttons in game; types without fleets aren't offered.</p>
    {:else if nexSel}
      <div class="center muted">{nexSel} has no Nexerelin config. Add one on Factions › Nexerelin.</div>
    {:else if tpl}
      {@const users = templateUsers(m?.encounters ?? [], tpl.id)}
      <!-- #67 U41 (user, 2026-11-22): as the other pages: name and id on the left, Inactive and Delete on the right -->
      <div class="head"><h2>{tpl.name || tpl.id}</h2><span class="mono muted">{tpl.id}</span>{#if tpl.inactive}<span class="muted small">[Inactive]</span>{/if}<span class="spacer"></span><label class="chk" title="Planned but not ready: not exported, so not in the game; an encounter or Fight node that uses it isn't either. Its problems become warnings; what uses it is flagged in Problems."><input type="checkbox" checked={!!tpl.inactive} onchange={(e) => { const v = e.currentTarget.checked; edT((t) => { if (v) t.inactive = true; else delete t.inactive }) }} /> Inactive</label><button class="mini danger" onclick={remove}>Delete</button></div>
      <p class="muted small">A named fleet: the same ships, names and captain every time an encounter spawns it, at full strength (SagaLib 1.1). Its defeats are counted in <span class="mono">$global.sagaforge_fleet_{tpl.id}_defeats</span>, for quest conditions.</p>
      <div class="grid2">
        <Field label="Fleet name" for="ft-n" help="Its name on the map (&quot;Butters's Pride&quot;). Empty: the faction's name for its fleet type.">
          <input id="ft-n" type="text" value={tpl.name} onchange={(e) => { const v = e.currentTarget.value; edT((t) => { t.name = v }) }} />
        </Field>
        <Field label="Faction" help="Whose fleet it is: its flag, its relations and the player's reputation when fighting it.">
          <IdInput value={tpl.faction} options={factionOptions} strict onCommit={(v) => edT((t) => { t.faction = v })} />
        </Field>
        <Field label="Fleet type" ref="factions-fleet-types" help="Vanilla's or your own fleet type id; it names the fleet when the name is empty, and some vanilla code checks it.">
          <IdInput value={tpl.fleetType} options={fleetTypeOptions} onCommit={(v) => edT((t) => { t.fleetType = v })} />
        </Field>
        <Field label="Captain" for="ft-c" help="One of the mod's people commands the flagship (their portrait and name show when the player hails or fights it).">
          <select id="ft-c" value={tpl.captain ?? ''} onchange={(e) => { const v = e.currentTarget.value; edT((t) => { t.captain = v || undefined }) }}><option value="">(the fleet's own officer)</option>{#each m?.people ?? [] as p (p.id)}<option value={p.id}>{fullName(p.name)}</option>{/each}</select>
        </Field>
        {#if tpl.captain}
          <Field label="When defeated" for="ft-d" help="By default the captain survives a defeat (as the player does) and commands the fleet again next time. Ticked: the captain dies with the fleet and is gone for good (never recreated, never a captain again). A quest can also remove a person (Action › Remove a person).">
            <label class="chk"><input id="ft-d" type="checkbox" checked={!!tpl.captainDiesOnDefeat} onchange={(e) => { const v = e.currentTarget.checked; edT((t) => { t.captainDiesOnDefeat = v || undefined }) }} /> the captain dies</label>
          </Field>
        {/if}
      </div>
      <div class="sect2">Ships <button class="mini" onclick={() => edT((t) => { t.ships.push({ variant: '' }) })}>+ Ship</button><button class="mini" onclick={() => (shipSet = true)} title="A starting list as the faction's fleets would have it (vanilla's ship roles), to edit after">+ From a faction's fleet…</button>
        <label class="chk only" title="The variant list: only ships the fleet's faction knows (its known ships and blueprint tags), or every variant of vanilla and the mods this mod lists (the list's +N shows the other installed mods too)"><input type="checkbox" bind:checked={onlyFaction} /> only {tpl.faction || 'the faction'}'s ships ({factionShips.length})</label></div>
      <table class="t">
        <thead><tr><th title="The flagship: the captain commands it">Flag</th><th>Variant</th><th>Ship name</th><th></th></tr></thead>
        <tbody>
          {#each tpl.ships as s, i (i)}
            <tr>
              <td><input type="radio" name="flag" checked={(tpl.flagship ?? 0) === i} onchange={() => edT((t) => { t.flagship = i })} /></td>
              <td><IdInput value={s.variant} options={variantOptions} strict width="260px" placeholder="variant id" onCommit={(v) => edT((t) => { t.ships[i].variant = v })} />{#if s.variant}<span class="muted small vl">{variantLabel(index.variants.find((v) => v.id === s.variant) ?? { id: s.variant })}</span>{/if}</td>
              <td><input type="text" value={s.name ?? ''} placeholder="the game picks one" onchange={(e) => { const v = e.currentTarget.value; edT((t) => { t.ships[i].name = v || undefined }) }} /></td>
              <td><button class="mini" onclick={() => edT((t) => { t.ships.splice(i, 1); if ((t.flagship ?? 0) >= t.ships.length) t.flagship = 0 })}>✕</button></td>
            </tr>
          {:else}<tr><td colspan="4" class="muted small">No ships yet.</td></tr>{/each}
        </tbody>
      </table>
      <p class="f-help">Ship names are written without the faction's prefix (the game adds it: "CAT Thirty Days"). Variants come from the game, the installed mods and Ship Editor.</p>
      <div class="sect2">Used by</div>
      {#if users.length}<div>{#each users as u, i (u.id)}{i ? ', ' : ''}<button class="linkish" onclick={() => app.go('encounters', u.id)}>{u.name}</button>{/each}</div>
      {:else}<p class="muted small">No encounter uses it yet: on the Encounters page, set Fleet › Size to "a named fleet".</p>{/if}
    {:else}
      <div class="center muted">Pick a named fleet, the fleet type names, a faction's doctrine preview{#if showNex} or its new-game fleets{/if}.</div>
    {/if}
  </section>
</div>

{#if showNew}
  <Modal title={copying && tpl ? `Copy of ${tpl.name || tpl.id}` : "New named fleet"} onClose={() => { showNew = false; copying = false }}>
    <div class="grid2 modal">
      <Field label="Name" for="nf-n" help="Its name on the map; the id is made from it with the mod's prefix."><input id="nf-n" type="text" bind:value={newName} placeholder="e.g. Butters's Pride" /></Field>
      <Field label="Id" help="Encounters refer to it by id."><span class="mono">{newId || '—'}</span></Field>
    </div>
    {#snippet actions()}<button onclick={() => { showNew = false; copying = false }}>Cancel</button><button class="primary" disabled={!newId} onclick={create}>{copying ? "Copy" : "Create"}</button>{/snippet}
  </Modal>
{/if}

{#if shipSet && tpl}
  <ShipSetDialog faction={tpl.faction} onClose={() => (shipSet = false)} onAdd={(vs, replace) => { shipSet = false; edT((t) => { const add = vs.map((variant) => ({ variant })); if (replace) { t.ships = add; t.flagship = 0 } else t.ships.push(...add) }) }} />
{/if}

<style>
  .only { display: inline-flex; gap: 4px; align-items: center; margin-left: 10px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .vl { margin-left: 6px; font-size: 11px; }
  .page { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); overflow: auto; border-right: 1px solid var(--border); }
  .main { overflow: auto; padding: 12px 16px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px; justify-content: space-between; align-items: center; }
  .sect button { white-space: nowrap; }
  .sect button { padding: 1px 6px; font-size: 11px; text-transform: none; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 4px; display: flex; gap: 10px; align-items: center; }
  .sect2 button { text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list li.inactive { opacity: .5; }
  /* the selected item's bar, as on Encounters and People */
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: -12px -16px 10px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .head h2 { margin: 0; font-size: 15px; }
  .head .chk { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; }
  .spacer { flex: 1; }
  .sectr { display: inline-flex; gap: 6px; align-items: center; }
  .sectr .chk { display: inline-flex; gap: 4px; align-items: center; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .li { display: flex; gap: 6px; width: 100%; border: none; background: none; padding: 3px 8px; text-align: left; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .pad { padding: 4px 10px; }
  h2 { font-size: 15px; margin: 0 0 6px; }
  .grid2 { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 2px 10px; align-items: center; max-width: 720px; }
  .grid2.modal { width: 440px; }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; }
  table.t { border-collapse: collapse; font-size: 12px; max-width: 760px; width: 100%; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 6px; }
  table.t td { border-bottom: 1px solid #1e242c; padding: 3px 6px; }
  table.t input[type='text'] { width: 100%; }
  .box { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 10px 0; max-width: 760px; background: #161a20; }
  .box .t { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: .05em; margin-bottom: 6px; }
  .bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; font-size: 11px; }
  .bar span { display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; color: #000; }
  .bar .w { background: #6fa8dc; } .bar .c { background: #93c47d; } .bar .p { background: #b4a7d6; }
  .sizes { display: flex; gap: 22px; align-items: flex-end; height: 120px; }
  .sz { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
  .col { width: 32px; background: var(--accent-2); border-radius: 3px 3px 0 0; }
  .qrow { display: flex; gap: 10px; align-items: center; }
  .qrow .small { width: 130px; }
  .dots { display: flex; gap: 4px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--border); }
  .dot.on { background: var(--accent); border-color: var(--accent); }
  .center { display: grid; place-items: center; height: 100%; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .linkish { border: none; background: none; color: var(--accent); padding: 0; }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 12px; }
  .small { font-size: 12px; }
</style>
