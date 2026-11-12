<script lang="ts">
  /** Locations (PLAN.md §4.5, mock-up locations.html): new systems on the hyperspace map, entities, markets. */
  import type { StarSystemDef, SystemEntity } from '../../../shared/model'
  import { ENTITY_KINDS, newSystem, addition, newEntity, newMarket, entityPos, nearest } from '../../../shared/locations'
  import { slug, uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Modal from '../ui/Modal.svelte'

  const m = $derived(project.m)
  const index = $derived(app.index!)
  const sel = $derived(app.selected.locations ?? null)
  const sys = $derived(m?.systems.find((s) => s.id === sel) ?? null)
  let entSel = $state<string | null>(null)
  const ent = $derived(sys?.entities.find((e) => e.id === entSel) ?? null)
  let view = $state<'map' | 'system'>('map')
  const edSys = (fn: (s: StarSystemDef) => void) => { const id = sel; project.change((mm) => { const s = mm.systems.find((x) => x.id === id); if (s) fn(s) }) }
  const edEnt = (fn: (e: SystemEntity, s: StarSystemDef) => void) => { const id = entSel; edSys((s) => { const e = s.entities.find((x) => x.id === id); if (e) fn(e, s) }) }

  // ---- hyperspace map (game units; starmap.json)
  const vanillaSys = $derived(index.systems.filter((s) => s.x != null))
  let mapEl = $state<SVGSVGElement | null>(null)
  let vb = $state({ x: -24000, y: -18000, w: 48000, h: 30000 })
  // start with every known system in view (y is flipped: the game's y grows upwards)
  let fitted = false
  $effect(() => {
    if (fitted || !vanillaSys.length) return
    fitted = true
    const xs = vanillaSys.map((s) => s.x ?? 0), ys = vanillaSys.map((s) => -(s.y ?? 0))
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const w = (x1 - x0) * 1.25, h = Math.max((y1 - y0) * 1.25, w * 0.6)
    vb = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }
  })
  let dragSys: string | null = null
  let panFrom: { x: number; y: number; vx: number; vy: number } | null = null
  function toMap(ev: MouseEvent): { x: number; y: number } {
    const r = mapEl!.getBoundingClientRect()
    return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.w, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.h }
  }
  function mapDown(ev: MouseEvent, sid?: string) {
    if (sid) { dragSys = sid; app.selected.locations = sid; ev.stopPropagation(); return }
    panFrom = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y }
  }
  function mapMove(ev: MouseEvent) {
    if (dragSys) {
      const p = toMap(ev)
      const id = dragSys
      project.change((mm) => { const s = mm.systems.find((x) => x.id === id); if (s) s.hyperspace = [Math.round(p.x / 50) * 50, Math.round(-p.y / 50) * 50] })
    } else if (panFrom && mapEl) {
      const r = mapEl.getBoundingClientRect()
      vb = { ...vb, x: panFrom.vx - ((ev.clientX - panFrom.x) / r.width) * vb.w, y: panFrom.vy - ((ev.clientY - panFrom.y) / r.height) * vb.h }
    }
  }
  function mapUp() { dragSys = null; panFrom = null }
  function wheel(ev: WheelEvent, which: 'map' | 'sys') {
    ev.preventDefault()
    const k = ev.deltaY > 0 ? 1.15 : 1 / 1.15
    if (which === 'map') { const p = toMap(ev); vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: vb.w * k, h: vb.h * k } }
    else svb = { ...svb, x: svb.x * k, y: svb.y * k, w: svb.w * k, h: svb.h * k }
  }
  const near = $derived(sys?.kind === 'new' && sys.hyperspace ? nearest(vanillaSys, sys.hyperspace[0], sys.hyperspace[1]) : null)

  // ---- system view (system units, star at 0,0)
  let svb = $state({ x: -9000, y: -6000, w: 18000, h: 12000 })
  let sysEl = $state<SVGSVGElement | null>(null)
  let dragEnt: string | null = null
  function sysMove(ev: MouseEvent) {
    if (!dragEnt || !sys || !sysEl) return
    const r = sysEl.getBoundingClientRect()
    const x = svb.x + ((ev.clientX - r.left) / r.width) * svb.w
    const y = svb.y + ((ev.clientY - r.top) / r.height) * svb.h
    const e = sys.entities.find((q) => q.id === dragEnt)
    if (!e) return
    const f = entityPos(sys, e.orbit.focus)
    const ang = Math.round((Math.atan2(-(y - f.y), x - f.x) * 180) / Math.PI)
    const id = dragEnt
    edSys((s) => { const en = s.entities.find((q) => q.id === id); if (en) en.orbit.angle = (ang + 360) % 360 })
  }

  // ---- create
  let showNew = $state(false)
  let newName = $state('')
  let newKind = $state<'new' | 'existing'>('new')
  let existingId = $state('')
  function createSystem() {
    if (newKind === 'existing') {
      const id = existingId.trim()
      if (!id || m?.systems.some((s) => s.id === id)) { app.error = `There are already additions to "${id}".`; return }
      project.change((mm) => { mm.systems.push(addition(id, index.systems.find((s) => s.id === id)?.name ?? id)) })
      app.selected.locations = id
    } else {
      const id = project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), '')
      if (!newName.trim() || m?.systems.some((s) => s.id === id) || index.systems.some((s) => s.id === id)) { app.error = `The id "${id}" is already used.`; return }
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2
      project.change((mm) => { mm.systems.push(newSystem(id, newName.trim(), Math.round(cx), Math.round(-cy))) })
      app.selected.locations = id
    }
    showNew = false; newName = ''; existingId = ''
  }
  let addKind = $state('')
  function addEntity(kind: string) {
    if (!sys) return
    const label = ENTITY_KINDS.find((k) => k.kind === kind)?.label ?? kind
    const base = `${sys.id}_${slug(label)}`
    const id = uniqueId(base, [...(m?.systems.flatMap((s) => s.entities.map((e) => e.id)) ?? [])])
    const radius = 1500 + sys.entities.filter((e) => e.orbit.focus === 'star').length * 1200
    const focus = kind === 'moon' && ent ? ent.id : 'star'
    edSys((s) => { s.entities.push(newEntity(kind, id, `${sys.name} ${label}`, focus, kind === 'moon' ? 400 : radius, 30 * s.entities.length)) })
    entSel = id
  }
  function removeEntity() {
    if (!ent || !confirm(`Delete "${ent.name}"?`)) return
    const id = ent.id
    edSys((s) => { s.entities = s.entities.filter((e) => e.id !== id && e.orbit.focus !== id) })
    entSel = null
  }
  function removeSystem() {
    if (!sys || !confirm(`Delete "${sys.name}" and everything in it?`)) return
    const id = sys.id
    project.change((mm) => { mm.systems = mm.systems.filter((s) => s.id !== id) })
    app.selected.locations = null
  }
  const factions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })) ?? []), ...index.factions])
  const fcolor = (id: string) => { const f = index.factions.find((x) => x.id === id); return f?.color ? `rgb(${f.color[0]},${f.color[1]},${f.color[2]})` : '#8a94a6' }
  const listEdit = (key: 'conditions' | 'industries' | 'submarkets' | 'people', fn: (l: string[]) => string[]) => edEnt((e) => { if (e.market) e.market[key] = fn(e.market[key]) })
  const descKey = (e: SystemEntity) => `${e.kind === 'planet' || e.kind === 'moon' ? 'PLANET' : 'CUSTOM'}:${e.id}`
</script>

<div class="page">
  <aside class="left">
    <div class="sect">This mod's systems <button disabled={!m} onclick={() => (showNew = true)}>+ New…</button></div>
    <ul class="list">
      {#each m?.systems.filter((s) => s.kind === 'new') ?? [] as s (s.id)}<li class:on={sel === s.id}><button class="li" onclick={() => { app.selected.locations = s.id; entSel = null }}>✦ {s.name}<span class="sub">{s.entities.length} entities</span></button></li>{/each}
    </ul>
    <div class="sect">Additions to existing systems</div>
    <ul class="list">
      {#each m?.systems.filter((s) => s.kind === 'existing') ?? [] as s (s.id)}<li class:on={sel === s.id}><button class="li" onclick={() => { app.selected.locations = s.id; entSel = null; view = 'system' }}>{s.name} +{s.entities.length}</button></li>{:else}<li class="muted small pad">None.</li>{/each}
    </ul>
    {#if sys}
      <div class="sect">{sys.name}: entities <select value={addKind} onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addEntity(v) }}><option value="">+ add…</option>{#each ENTITY_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}</select></div>
      <ul class="list">
        {#each sys.entities as e (e.id)}<li class:on={entSel === e.id}><button class="li" onclick={() => { entSel = e.id; view = 'system' }}>{e.orbit.focus === 'star' ? '' : '· '}{e.name}<span class="sub">{e.kind}{e.market ? ' · market' : ''}</span></button></li>{/each}
      </ul>
    {/if}
  </aside>
  <section class="main">
    <div class="toolbar">
      <div class="seg"><button class:on={view === 'map'} onclick={() => (view = 'map')}>Hyperspace map</button><button class:on={view === 'system'} onclick={() => (view = 'system')} disabled={!sys}>System view</button></div>
      {#if near && view === 'map'}<span class="muted">nearest: <b>{near.sys.name}</b> {near.ly.toFixed(1)} ly</span>{/if}
      <span class="spacer"></span><span class="muted small">{view === 'map' ? 'Drag your systems; vanilla systems are at their real positions (starmap.json). Wheel zooms, drag pans.' : 'Drag bodies along their orbits. Wheel zooms.'}</span>
    </div>
    {#if view === 'map'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg bind:this={mapEl} class="map" viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" onmousedown={(e) => mapDown(e)} onmousemove={mapMove} onmouseup={mapUp} onmouseleave={mapUp} onwheel={(e) => wheel(e, 'map')}>
        {#each vanillaSys as s (s.id)}
          <circle cx={s.x} cy={-(s.y ?? 0)} r={vb.w / 300} fill="#4a6a8a" />
          <text x={(s.x ?? 0) + vb.w / 220} y={-(s.y ?? 0) + vb.w / 400} font-size={vb.w / 110} fill="#7f93a8">{s.name}</text>
        {/each}
        {#each m?.systems.filter((s) => s.kind === 'new' && s.hyperspace) ?? [] as s (s.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g onmousedown={(e) => mapDown(e, s.id)} class="mine" class:on={s.id === sel}>
            <circle cx={s.hyperspace![0]} cy={-s.hyperspace![1]} r={vb.w / 160} fill="#3fa7a0" stroke={s.id === sel ? '#fff' : 'none'} stroke-width={vb.w / 1200} />
            <text x={s.hyperspace![0] + vb.w / 120} y={-s.hyperspace![1] + vb.w / 350} font-size={vb.w / 85} fill="#bff">{s.name}</text>
          </g>
        {/each}
      </svg>
    {:else if sys}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg bind:this={sysEl} class="map sys" viewBox="{svb.x} {svb.y} {svb.w} {svb.h}" onmousemove={sysMove} onmouseup={() => (dragEnt = null)} onmouseleave={() => (dragEnt = null)} onwheel={(e) => wheel(e, 'sys')}>
        {#if sys.kind === 'new' && sys.star}<circle cx="0" cy="0" r={sys.star.radius} fill="#f5d27a" opacity="0.9" /><circle cx="0" cy="0" r={sys.star.radius + sys.star.corona} fill="#f5d27a" opacity="0.15" />{:else}<text x="0" y="0" font-size={svb.w / 60} fill="#8a94a6" text-anchor="middle">({sys.name}'s own bodies are made by the game)</text>{/if}
        {#each sys.entities as e (e.id)}
          {@const f = entityPos(sys, e.orbit.focus)}
          {@const p = entityPos(sys, e.id)}
          {#if e.kind === 'asteroidBelt' || e.kind === 'ring'}
            <circle cx={f.x} cy={f.y} r={e.orbit.radius} fill="none" stroke={e.kind === 'ring' ? '#8a7a5a' : '#6a6a6a'} stroke-width={e.width ?? 200} opacity="0.35" />
          {:else}
            <circle cx={f.x} cy={f.y} r={e.orbit.radius} fill="none" stroke="#2e3642" stroke-width={svb.w / 900} stroke-dasharray="{svb.w / 200} {svb.w / 300}" />
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g onmousedown={(ev) => { ev.stopPropagation(); dragEnt = e.id; entSel = e.id }} class="ent" class:on={e.id === entSel}>
            <circle cx={p.x} cy={p.y} r={e.radius ? Math.max(e.radius, svb.w / 250) : svb.w / 200} fill={e.market ? fcolor(e.market.faction) : e.kind === 'planet' || e.kind === 'moon' ? '#6a8aa0' : '#c0c8d0'} stroke={e.id === entSel ? '#fff' : 'none'} stroke-width={svb.w / 700} />
            <text x={p.x + svb.w / 120} y={p.y} font-size={svb.w / 80} fill="#cdd">{e.name}</text>
          </g>
        {/each}
      </svg>
    {:else}
      <div class="center muted">Pick a system.</div>
    {/if}
  </section>
  <aside class="right">
    {#if sys && ent}
      <h3>{ent.name} <span class="mono muted">{ent.id}</span></h3>
      <div class="grid2">
        <label for="le-n">Name</label><input id="le-n" type="text" value={ent.name} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.name = v }) }} />
        <span class="lbl">Kind</span><span>{ENTITY_KINDS.find((k) => k.kind === ent.kind)?.label ?? ent.kind}</span>
        <span class="lbl">Type</span>
        {#if ent.kind === 'planet' || ent.kind === 'moon'}<IdInput value={ent.type} options={index.planetTypes.filter((t) => !app.defs.starTypes.includes(t.id))} strict onCommit={(v) => edEnt((x) => { x.type = v })} />
        {:else if ent.kind === 'asteroidBelt' || ent.kind === 'ring'}<span class="muted">{ent.kind === 'ring' ? 'ring band' : 'asteroid belt'}</span>
        {:else}<IdInput value={ent.type} options={index.customEntityTypes} strict onCommit={(v) => edEnt((x) => { x.type = v })} />{/if}
        <label for="le-f">Orbits</label><select id="le-f" value={ent.orbit.focus} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.orbit.focus = v }) }}><option value="star">the star</option>{#each sys.entities.filter((x) => x.id !== ent.id) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}</select>
        <label for="le-r">Orbit radius</label><input id="le-r" type="number" step="50" value={ent.orbit.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.radius = v }) }} />
        <label for="le-a">Angle</label><input id="le-a" type="number" value={ent.orbit.angle} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.angle = v }) }} />
        <label for="le-d">Orbit days</label><input id="le-d" type="number" value={ent.orbit.days} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.days = v }) }} />
        {#if ent.radius !== undefined}<label for="le-rr">Size</label><input id="le-rr" type="number" value={ent.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.radius = v }) }} />{/if}
        {#if ent.width !== undefined}<label for="le-w">Width</label><input id="le-w" type="number" value={ent.width} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.width = v }) }} />{/if}
      </div>
      {#if ent.kind === 'planet' || ent.kind === 'moon' || ent.kind === 'station'}
        <div class="sect2">Market {#if !ent.market}<button class="mini" onclick={() => { const id = ent.id; edEnt((x) => { x.market = newMarket(`${id}_market`.replace(/_market$/, ''), ent.name, m?.factions.find((f) => f.kind === 'addition')?.id ?? 'independent') }) }}>+ Add a market</button>{:else}<button class="mini" onclick={() => edEnt((x) => { x.market = undefined })}>Remove</button>{/if}</div>
        {#if ent.market}
          {@const mk = ent.market}
          <div class="grid2">
            <label for="lm-n">Name</label><input id="lm-n" type="text" value={mk.name} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { if (x.market) x.market.name = v }) }} />
            <label for="lm-id">Market id</label><input id="lm-id" type="text" class="mono" value={mk.id} onchange={(e) => { const v = e.currentTarget.value.trim(); edEnt((x) => { if (x.market && v) x.market.id = v }) }} />
            <span class="lbl">Faction</span><IdInput value={mk.faction} options={factions} strict onCommit={(v) => edEnt((x) => { if (x.market) x.market.faction = v })} />
            <label for="lm-s">Size</label><input id="lm-s" type="number" min="1" max="10" value={mk.size} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { if (x.market) { x.market.size = v; x.market.conditions = [...x.market.conditions.filter((c) => !/^population_\d+$/.test(c)), `population_${v}`] } }) }} />
            <label for="lm-fp">Free port</label><input id="lm-fp" type="checkbox" checked={mk.freePort} onchange={(e) => { const v = e.currentTarget.checked; edEnt((x) => { if (x.market) x.market.freePort = v }) }} />
          </div>
          {#each [['conditions', index.conditions], ['industries', index.industries], ['submarkets', index.submarkets]] as [key, opts] (key)}
            <div class="sect3">{key}</div>
            <div class="chips">{#each mk[key as 'conditions'] as c (c)}<span class="chip">{c}<button class="x" onclick={() => listEdit(key as 'conditions', (l) => l.filter((x) => x !== c))}>✕</button></span>{/each}
              <IdInput value="" options={opts as { id: string; name: string }[]} width="150px" placeholder="+ add" clearOnCommit onCommit={(v) => { if (v) listEdit(key as 'conditions', (l) => (l.includes(v) ? l : [...l, v])) }} /></div>
          {/each}
          <div class="sect3">people at this market</div>
          <div class="chips">{#each mk.people as p (p)}<span class="chip">{p}<button class="x" onclick={() => listEdit('people', (l) => l.filter((x) => x !== p))}>✕</button></span>{/each}
            <IdInput value="" options={m?.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })) ?? []} width="150px" placeholder="+ person" clearOnCommit onCommit={(v) => { if (v) listEdit('people', (l) => (l.includes(v) ? l : [...l, v])) }} /></div>
          {#each mk.people as pid (pid)}
            {@const qs = m?.quests.filter((q) => q.start.kind === 'contact' && q.start.person === pid) ?? []}
            {#if qs.length}<div class="muted small">{pid} gives: {qs.map((q) => q.title).join(', ')}</div>{/if}
          {/each}
        {/if}
      {/if}
      <div class="sect2">Description <span class="mono muted">{descKey(ent)}</span></div>
      <textarea rows="4" value={m?.descriptions[descKey(ent)]?.text1 ?? ''} onchange={(e) => { const v = e.currentTarget.value; const k = descKey(ent); project.change((mm) => { if (v.trim()) mm.descriptions[k] = { text1: v }; else delete mm.descriptions[k] }) }}></textarea>
      <p><button class="mini danger" onclick={removeEntity}>Delete entity</button></p>
    {:else if sys}
      <h3>{sys.name} <span class="mono muted">{sys.id}</span></h3>
      <div class="grid2">
        <label for="ls-n">Name</label><input id="ls-n" type="text" value={sys.name} onchange={(e) => { const v = e.currentTarget.value; edSys((s) => { s.name = v }) }} />
        {#if sys.kind === 'new'}
          <span class="lbl">Hyperspace</span><span class="mono">{sys.hyperspace?.join(', ')}</span>
          <span class="lbl">Star</span><select value={sys.star?.type} onchange={(e) => { const v = e.currentTarget.value; edSys((s) => { if (s.star) s.star.type = v }) }}>{#each app.defs.starTypes as t (t)}<option value={t}>{t}</option>{/each}</select>
          <label for="ls-sr">Star radius</label><input id="ls-sr" type="number" value={sys.star?.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edSys((s) => { if (s.star) s.star.radius = v }) }} />
          <label for="ls-c">Corona</label><input id="ls-c" type="number" value={sys.star?.corona} onchange={(e) => { const v = Number(e.currentTarget.value); edSys((s) => { if (s.star) s.star.corona = v }) }} />
          <label for="ls-m">Music</label><IdInput value={sys.music ?? ''} options={index.music.map((x) => ({ id: x }))} onCommit={(v) => edSys((s) => { s.music = v || undefined })} />
        {/if}
      </div>
      <div class="box" class:warnbox={!sys.addToExistingSaves}>
        <label class="chk"><input type="checkbox" checked={sys.addToExistingSaves} onchange={(e) => { const v = e.currentTarget.checked; edSys((s) => { s.addToExistingSaves = v }) }} /> <span><b>Existing saves</b>: also build it in saves that don't have it yet (on load)</span></label>
        {#if !sys.addToExistingSaves}<div class="small">"{sys.name}" will only appear in new games.</div>{/if}
        {#if sys.kind === 'existing'}<div class="small muted">SagaLib checks each entity isn't already there before adding it, and never touches what the system already has.</div>{/if}
      </div>
      <p><button class="mini danger" onclick={removeSystem}>Delete {sys.kind === 'new' ? 'system' : 'these additions'}</button></p>
    {:else}
      <p class="muted">Create a new star system, or add entities to an existing one (Corvus +1 station, say).</p>
    {/if}
  </aside>
</div>

{#if showNew}
  <Modal title="New location" onClose={() => (showNew = false)}>
    <div class="seg2"><label><input type="radio" bind:group={newKind} value="new" /> A new star system</label><label><input type="radio" bind:group={newKind} value="existing" /> Additions to an existing system</label></div>
    {#if newKind === 'new'}
      <div class="grid2"><label for="nl-n">Name</label><input id="nl-n" type="text" bind:value={newName} placeholder="Kestrel" /><span class="lbl">Id</span><span class="mono">{project.prefix}{slug(newName)}</span></div>
      <p class="muted small">It appears at the centre of the map; drag it where you want it.</p>
    {:else}
      <IdInput value={existingId} options={index.systems} strict placeholder="system id, e.g. corvus" onCommit={(v) => (existingId = v)} />
    {/if}
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" onclick={createSystem}>Create</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; grid-template-columns: 260px minmax(0, 1fr) 340px; height: 100%; min-height: 0; }
  .left, .right { background: var(--panel); overflow: auto; min-height: 0; }
  .left { border-right: 1px solid var(--border); }
  .right { border-left: 1px solid var(--border); padding: 10px 12px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .sect button, .sect select { padding: 1px 6px; font-size: 11px; text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { display: flex; gap: 6px; width: 100%; border: none; background: none; padding: 3px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; }
  .seg { display: flex; }
  .seg button { border-radius: 0; margin-left: -1px; padding: 3px 10px; font-size: 12px; }
  .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 4px 4px 0; }
  .seg button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .spacer { flex: 1; }
  .map { flex: 1; width: 100%; min-height: 0; background: radial-gradient(ellipse at 60% 40%, #10202e 0%, #0a0f15 70%); cursor: grab; user-select: none; }
  .map .mine, .map .ent { cursor: move; }
  .center { display: grid; place-items: center; flex: 1; }
  h3 { margin: 2px 0 8px; font-size: 13px; display: flex; gap: 8px; align-items: baseline; }
  .grid2 { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 4px 8px; align-items: center; }
  .grid2 label, .lbl { color: var(--muted); font-size: 12px; }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; padding: 3px 6px; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 4px; display: flex; justify-content: space-between; align-items: center; }
  .sect2 button { text-transform: none; }
  .sect3 { font-size: 11px; color: var(--muted); margin: 6px 0 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; }
  textarea { width: 100%; resize: vertical; }
  .box { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin: 10px 0; font-size: 12px; }
  .warnbox { border-color: #6b4a1f; background: #2a1f10; color: var(--warn); }
  .chk { display: flex; gap: 6px; align-items: flex-start; }
  .seg2 { display: flex; gap: 16px; margin-bottom: 10px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 4px 10px; }
</style>
