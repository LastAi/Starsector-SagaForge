<script lang="ts">
  import VersionStrip from '../ui/VersionStrip.svelte'
  import { itemVer, setDescription, descriptionText } from '../state/itemver.svelte'
  import { dropGroupChoices } from '../../../shared/pools'
  /** Locations (PLAN.md §4.5, mock-up locations.html): new systems on the hyperspace map, entities, markets. */
  import type { StarSystemDef, SystemEntity } from '../../../shared/model'
  import { ENTITY_KINDS, ENTITY_PRESETS, newSystem, addition, newEntity, newMarket, entityPos, bodyPos, codePos, fitContext, nearest, setPersonMarket, renameEntity } from '../../../shared/locations'
  import { orbitIndex, ownTypeInfos, planetFits } from '../../../shared/celestial'
  import TypeThumb from '../locations/TypeThumb.svelte'
  import TypeChooser from '../locations/TypeChooser.svelte'
  import TypeForm from '../locations/TypeForm.svelte'
  import { slug, uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Modal from '../ui/Modal.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import ModsChip from '../ui/ModsChip.svelte'
  import ShowAllMods from '../ui/ShowAllMods.svelte'
  import { mods } from '../state/mods.svelte'
  import { defaultLockUntil, guardsOf, protectWreck, questsSendingTo } from '../../../shared/patterns'
  import { lastRelease } from '../../../shared/release'

  const m = $derived(project.m)
  /** Phase 7e: the mod's loot pools (its own drop groups). */
  const lootPools = $derived((m?.pools ?? []).filter((p) => p.use === 'loot' && !p.addsTo))
  /** Phase 8a: the mod's loot tables and every drop group of the game and installed mods. */
  const dropGroupOptions = $derived(dropGroupChoices(m?.pools ?? [], app.index))
  const index = $derived(app.index!)
  const sel = $derived(app.selected.locations ?? null)
  // #64: the system as in the open version (the versions strip)
  const sys = $derived(itemVer.view('system', sel, m?.systems.find((s) => s.id === sel) ?? null))
  // screenshot mode: "locations:<system>:entity=<id>" opens that entity in the system view
  const smokeEnt = app.smokeArg?.startsWith('entity=') ? app.smokeArg.slice(7) : null
  let entSel = $state<string | null>(smokeEnt)
  const ent = $derived(sys?.entities.find((e) => e.id === entSel) ?? null)
  // ("locations:<system>:system" opens the system view with nothing selected)
  let view = $state<'map' | 'system'>(smokeEnt || app.smokeArg === 'system' ? 'system' : 'map')
  const edSys = (fn: (s: StarSystemDef) => void) => { const id = sel; if (id) itemVer.edit<StarSystemDef>('system', id, (s) => fn(s)) }
  const edEnt = (fn: (e: SystemEntity, s: StarSystemDef) => void) => { const id = entSel; edSys((s) => { const e = s.entities.find((x) => x.id === id); if (e) fn(e, s) }) }

  // ---- hyperspace map (game units; starmap.json)
  // #60: the map shows vanilla, this mod and its listed mods' systems (Show all installed mods for every one)
  const vanillaSys = $derived(mods.filter('systems', index.systems.filter((s) => s.x != null), (s) => s.definedBy))
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

  // ---- vanilla systems read from their Java source (R14): additions draw on top of them; any
  // other vanilla system can be looked at ("peek") from the hyperspace map
  let peek = $state<string | null>(null)
  const code = $derived(index.codeSystems?.find((c) => c.id === (sys ? (sys.kind === 'existing' ? sys.id : '') : peek ?? '')) ?? null)
  const peekInfo = $derived(peek && !sys ? index.systems.find((s) => s.id === peek) ?? null : null)
  const codeTypes = $derived(new Map(index.planetTypes.map((t) => [t.id, t])))
  const tcolor = (type: string, fallback: string) => { const c = codeTypes.get(type)?.iconColor; return c ? `rgb(${c[0]},${c[1]},${c[2]})` : fallback }
  const ownTypes = $derived(ownTypeInfos(m?.types, index.planetTypes, index.customEntityTypes))
  const planetInfo = (id: string) => ownTypes.planets.find((t) => t.id === id) ?? index.planetTypes.find((t) => t.id === id) ?? null
  const entityInfo = (id: string) => ownTypes.entities.find((t) => t.id === id) ?? index.customEntityTypes.find((t) => t.id === id) ?? null
  const pos = (s: StarSystemDef, id: string) => entityPos(s, id, code)
  const codePosOf = (id: string) => (code ? codePos(code, id) : { x: 0, y: 0 })
  function openVanilla(id: string) {
    const own = m?.systems.find((s) => s.kind === 'existing' && s.id === id)
    if (own) { app.selected.locations = own.id; peek = null } else { app.selected.locations = null; peek = id }
    entSel = null
    view = 'system'
  }

  // ---- SagaLib 1.1: removal targets (this system's objects first, then the game's) and quest stages
  const removalOptions = $derived([...(sys?.entities ?? []).map((e) => ({ id: e.id, name: e.name })), ...(code?.bodies ?? []).filter((b) => b.id).map((b) => ({ id: b.id, name: `${b.name} (vanilla)` })), ...index.markets.flatMap((mk) => mk.entities.map((id) => ({ id, name: mk.name })))])
  const questsWithStages = $derived(m?.quests.filter((q) => q.kind === 'quest' && q.stages.length) ?? [])

  // ---- the mod's own types (R21)
  let typeSel = $state<string | null>(app.smokeArg?.startsWith('type=') ? app.smokeArg.slice(5) : null)
  let showNewType = $state(app.smokeModal === 'newtype')
  let newTypeKind = $state<'entity' | 'planet' | 'star'>('entity')
  let newTypeName = $state('')
  const newTypeId = $derived(newTypeName.trim() ? project.prefix + slug(newTypeName).replace(new RegExp(`^${project.prefix}`), '') : '')
  function createType() {
    const id = newTypeId
    if (!id || !m) return
    if (m.types?.entities.some((t) => t.id === id) || m.types?.planets.some((t) => t.id === id) || index.customEntityTypes.some((t) => t.id === id) || index.planetTypes.some((t) => t.id === id)) { app.error = `The type id "${id}" is already used.`; return }
    const name = newTypeName.trim()
    const kind = newTypeKind
    project.change((mm) => {
      mm.types ??= { entities: [], planets: [] }
      if (kind === 'entity') {
        const base = index.customEntityTypes.find((t) => t.id === 'station_side02')
        mm.types.entities.push({ id, name, sprite: base?.sprite ?? '', size: 80, radius: base?.radius ?? 50, behavesLike: 'station_side02' })
      } else {
        const based = kind === 'star' ? 'star_yellow' : 'barren'
        mm.types.planets.push({ id, name, texture: index.planetTypes.find((t) => t.id === based)?.texture ?? '', basedOn: based, isStar: kind === 'star' })
      }
    })
    showNewType = false
    newTypeName = ''
    typeSel = id
  }

  // fit the system view to the system when another one is shown (its farthest orbit plus a margin)
  let fittedFor = ''
  $effect(() => {
    // walk F28: also when bodies are added or removed (a new system started zoomed onto its star)
    const key = `${sys?.id ?? ''}|${peek ?? ''}|${sys?.entities.length ?? 0}`
    if (key === fittedFor) return
    fittedFor = key
    let r = 0
    if (sys) for (const e of sys.entities) { const p = entityPos(sys, e.id, code); r = Math.max(r, Math.hypot(p.x, p.y) + (e.width ?? 0) / 2) }
    if (sys?.star) r = Math.max(r, sys.star.radius + sys.star.corona)
    if (code) for (const b of code.bodies) { const p = bodyPos(code, b); r = Math.max(r, Math.hypot(p.x, p.y) + b.width / 2) }
    if (r <= 0) return
    r = Math.max(r, 3500) // at least out to vanilla's inner planets
    const h = r * 2.3, w = h * 1.5
    svb = { x: -w / 2, y: -h / 2, w, h }
  })

  // screenshot mode: "locations::peek=<system>" looks at a vanilla system
  if (app.smokeArg?.startsWith('peek=')) setTimeout(() => openVanilla(app.smokeArg!.slice(5)), 0)

  // ---- choosing a type by its picture (R18–R20); screenshot mode: modal "choose=planet|star|entity"
  let chooser = $state<null | { kind: 'planet' | 'star' | 'entity' }>(app.smokeModal?.startsWith('choose=') ? { kind: app.smokeModal.slice(7) as 'planet' } : null)
  const fitCtx = $derived(sys && ent && (ent.kind === 'planet' || ent.kind === 'moon') ? fitContext(sys, ent, code) : null)
  const fit = $derived(fitCtx ? { starType: fitCtx.starType, orbitIdx: orbitIndex(fitCtx.orbitRadius, fitCtx.starRadius) } : null)

  // ---- system view (system units, star at 0,0)
  let svb = $state({ x: -9000, y: -6000, w: 18000, h: 12000 })
  let sysEl = $state<SVGSVGElement | null>(null)
  let dragEnt: string | null = null
  /** A resize handle being dragged (R17). */
  let dragHandle = $state<null | 'size' | 'width' | 'starR' | 'corona'>(null)
  const snap = (v: number) => Math.max(10, Math.round(v / 10) * 10)
  function toSys(ev: MouseEvent): { x: number; y: number } {
    const r = sysEl!.getBoundingClientRect()
    return { x: svb.x + ((ev.clientX - r.left) / r.width) * svb.w, y: svb.y + ((ev.clientY - r.top) / r.height) * svb.h }
  }
  function sysMove(ev: MouseEvent) {
    if (!sys || !sysEl) return
    const pt = toSys(ev)
    if (dragHandle) {
      const h = dragHandle
      if (h === 'starR' || h === 'corona') {
        const d = Math.hypot(pt.x, pt.y)
        edSys((s) => { if (!s.star) return; if (h === 'starR') s.star.radius = snap(d); else s.star.corona = snap(d - s.star.radius) })
        return
      }
      const e = sys.entities.find((q) => q.id === entSel)
      if (!e) return
      if (h === 'size') { const p = pos(sys, e.id); const d = Math.hypot(pt.x - p.x, pt.y - p.y); edEnt((x) => { x.radius = snap(d) }) }
      else { const f = pos(sys, e.orbit.focus); const d = Math.hypot(pt.x - f.x, pt.y - f.y); edEnt((x) => { x.width = snap(Math.abs(d - x.orbit.radius) * 2) }) }
      return
    }
    if (!dragEnt) return
    const e = sys.entities.find((q) => q.id === dragEnt)
    if (!e) return
    const f = pos(sys, e.orbit.focus)
    const ang = Math.round((Math.atan2(-(pt.y - f.y), pt.x - f.x) * 180) / Math.PI)
    // Shift: the orbit radius follows the mouse too (R17)
    const rad = ev.shiftKey ? snap(Math.hypot(pt.x - f.x, pt.y - f.y)) : null
    const id = dragEnt
    edSys((s) => { const en = s.entities.find((q) => q.id === id); if (en) { en.orbit.angle = (ang + 360) % 360; if (rad != null) en.orbit.radius = rad } })
  }
  const endDrag = () => { dragEnt = null; dragHandle = null }

  // ---- create
  let showNew = $state(app.smokeModal === 'new') // screenshot mode can open it
  let newName = $state('')
  let newKind = $state<'new' | 'existing'>(app.smokeArg === 'existing' ? 'existing' : 'new')
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
  const presets = $derived(ENTITY_PRESETS.filter((p) => index?.customEntityTypes.some((t) => t.id === p.type)))
  function addEntity(choice: string) {
    if (!sys) return
    const preset = choice.startsWith('preset:') ? ENTITY_PRESETS.find((p) => `preset:${p.key}` === choice) : undefined
    const kind = preset?.kind ?? choice
    const label = preset?.label ?? ENTITY_KINDS.find((k) => k.kind === kind)?.label ?? kind
    const base = `${sys.id}_${slug(label)}`
    const id = uniqueId(base, [...(m?.systems.flatMap((s) => s.entities.map((e) => e.id)) ?? [])])
    // walk F28: vanilla-like orbits (planets 2000–10000 from the star; stations and moons around a
    // planet: the selected one, else the first)
    const radius = 2500 + sys.entities.filter((e) => e.orbit.focus === 'star').length * 1200
    const planet = ent && (ent.kind === 'planet' || ent.kind === 'moon') ? ent : sys.entities.find((e) => e.kind === 'planet')
    const aroundPlanet = (kind === 'moon' || kind === 'station') && planet
    const focus = aroundPlanet ? planet!.id : 'star'
    edSys((s) => {
      const e = newEntity(kind, id, `${sys.name} ${label}`, focus, kind === 'moon' ? 600 : aroundPlanet ? 450 : radius, 30 * s.entities.length)
      if (preset) e.type = preset.type
      s.entities.push(e)
    })
    entSel = id
    view = 'system'
  }
  /** Walk F27: is this entity in a release (then saves remember its id)? */
  const entReleased = $derived.by(() => {
    const r = project.loaded ? lastRelease(project.loaded.releases) : null
    return !!(r && ent && sys && r.systems?.[sys.id]?.entities.includes(ent.id))
  })
  function setEntityId(to: string) {
    const from = ent?.id
    if (!from || !to || to === from) return
    project.change((mm) => renameEntity(mm, from, to))
    entSel = to
  }
  /** Until a release, a new name gives the entity a matching id (the mod's references follow). */
  function idFollowsName(name: string) {
    if (!ent || entReleased || !name.trim()) return
    const others = (m?.systems.flatMap((s) => s.entities.map((e) => e.id)) ?? []).filter((x) => x !== ent!.id)
    setEntityId(uniqueId(project.prefix + slug(name).replace(new RegExp(`^${project.prefix}`), ''), others))
  }
  async function changeEntityId() {
    if (!ent) return
    const ask = entReleased ? `"${ent.id}" is in a release: saves that already have this object lose track of it under a new id. New id anyway:` : 'New id (lowercase letters, digits and _; everything in this mod that uses it follows):'
    const v = (await app.ask(ask, ent.id, 'Change id'))?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    if (!v || v === ent.id) return
    const all = m?.systems.flatMap((s) => s.entities.map((e) => e.id)) ?? []
    if (all.includes(v)) { app.error = `The id "${v}" is already used.`; return }
    setEntityId(v)
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
  const listEdit = (key: 'conditions' | 'industries' | 'submarkets' | 'people', fn: (l: string[]) => string[]): void => edEnt((e) => { if (e.market) e.market[key] = fn(e.market[key]) })
  const MARKET_LISTS: { key: 'conditions' | 'industries' | 'submarkets'; label: string; help: string; options: () => { id: string; name?: string }[] }[] = [
    { key: 'conditions', label: 'Conditions', help: 'Planet and colony conditions (resources, hazards, population_N) shown in the colony\'s info; they set what it produces.', options: () => index.conditions },
    { key: 'industries', label: 'Industries', help: 'Buildings: population, spaceport, military base, orbital station (its battle station)… They make the goods and the patrols.', options: () => index.industries },
    { key: 'submarkets', label: 'Submarkets', help: 'The tabs when trading: open market, black market, military market, storage.', options: () => index.submarkets }
  ]
  // ---- wreck protection (patterns.ts)
  let lockUntil = $state('')
  $effect(() => { if (ent?.kind === 'derelict') lockUntil = defaultLockUntil(m?.quests ?? [], ent.id) ?? '' })
  function protect() {
    if (!ent) return
    const eid = ent.id
    const until = lockUntil || null
    let qid: string | null = null
    project.change((mm) => { qid = protectWreck(mm, eid, until) })
    if (qid) { app.go('quests', qid); app.selected.questNode = null; app.flash('Added a conversation that protects the wreck. Edit its text here.') }
  }
  /**
   * Where an entity's name goes in the system view (F12): a satellite (moon, station) labels on the
   * side away from what it orbits; a body with satellites labels on the side away from its first
   * one; everything else to the right of its dot.
   */
  function labelPos(s: StarSystemDef, e: SystemEntity): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
    const p = pos(s, e.id)
    const gap = svb.w / 70
    const away = (from: { x: number; y: number }) => {
      const dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      return { x: p.x + ux * gap, y: p.y + uy * gap, anchor: (Math.abs(ux) < 0.35 ? 'middle' : ux > 0 ? 'start' : 'end') as 'start' | 'middle' | 'end' }
    }
    if (e.orbit.focus !== 'star') return away(pos(s, e.orbit.focus))
    const sat = s.entities.find((x) => x.orbit.focus === e.id && x.kind !== 'ring' && x.kind !== 'asteroidBelt')
    if (sat) return flip(p, pos(s, sat.id), gap)
    return { x: p.x + svb.w / 120, y: p.y, anchor: 'start' }
  }
  /** The side of p opposite q. */
  function flip(p: { x: number; y: number }, q: { x: number; y: number }, gap: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
    const dx = p.x - q.x, dy = p.y - q.y, len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    return { x: p.x + ux * gap, y: p.y + uy * gap, anchor: Math.abs(ux) < 0.35 ? 'middle' : ux > 0 ? 'start' : 'end' }
  }
  const descKey = (e: SystemEntity) => `${e.kind === 'planet' || e.kind === 'moon' ? 'PLANET' : 'CUSTOM'}:${e.id}`
</script>

<div class="page">
  <aside class="left">
    <div class="sect">This mod's systems <button disabled={!m} onclick={() => (showNew = true)}>+ New…</button></div>
    <ul class="list">
      {#each m?.systems.filter((s) => s.kind === 'new') ?? [] as s (s.id)}<li class:on={sel === s.id}><button class="li" onclick={() => { app.selected.locations = s.id; entSel = null }}>✦ {s.name}<ModsChip itemKey={`system:${s.id}`} /><span class="sub">{s.entities.length} entities</span></button></li>{/each}
    </ul>
    <div class="sect">Additions to existing systems</div>
    <ul class="list">
      {#each m?.systems.filter((s) => s.kind === 'existing') ?? [] as s (s.id)}<li class:on={sel === s.id}><button class="li" onclick={() => { app.selected.locations = s.id; entSel = null; view = 'system' }}>{s.name} +{s.entities.length}</button></li>{:else}<li class="muted small pad">None.</li>{/each}
    </ul>
    <div class="sect">This mod's types <button disabled={!m} onclick={() => (showNewType = true)} title="Your own station, planet or star types, with your own pictures">+ New type…</button></div>
    <ul class="list">
      {#each [...(m?.types?.entities ?? []).map((t) => ({ id: t.id, name: t.name, k: 'entity' })), ...(m?.types?.planets ?? []).map((t) => ({ id: t.id, name: t.name, k: t.isStar ? 'star' : 'planet' }))] as t (t.id)}
        <li class:on={typeSel === t.id}><button class="li" onclick={() => { typeSel = t.id; entSel = null }}>{t.name}<span class="sub">{t.k}</span></button></li>
      {:else}<li class="muted small pad">None: vanilla's and mods' types only.</li>{/each}
    </ul>
    {#if sys}
      <div class="sect">{sys.name}: entities <select value={addKind} onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addEntity(v) }}><option value="">+ add…</option>{#each ENTITY_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}{#each presets as p (p.key)}<option value={`preset:${p.key}`}>{p.label}</option>{/each}</select></div>
      <ul class="list">
        {#each sys.entities as e (e.id)}<li class:on={entSel === e.id}><button class="li" onclick={() => { entSel = e.id; view = 'system' }}>{e.orbit.focus === 'star' ? '' : '· '}{e.name}<ModsChip itemKey={`entity:${e.id}`} /><span class="sub">{e.kind}{e.market ? ' · market' : ''}</span></button></li>{/each}
      </ul>
    {/if}
  </aside>
  <section class="main">
    {#if sys && m?.systems.some((s) => s.id === sys.id)}<VersionStrip kind="system" id={sys.id} what="this system and its markets" />{/if}
    <div class="toolbar">
      <ShowAllMods list="systems" />
      <div class="seg"><button class:on={view === 'map'} onclick={() => (view = 'map')}>Hyperspace map</button><button class:on={view === 'system'} onclick={() => (view = 'system')} disabled={!sys && !peekInfo}>System view</button></div>
      {#if near && view === 'map'}<span class="muted">nearest: <b>{near.sys.name}</b> {near.ly.toFixed(1)} ly</span>{/if}
      <span class="spacer"></span><span class="muted small">{view === 'map' ? 'Drag your systems; click a vanilla system to look at it. Wheel zooms, drag pans.' : sys ? 'Drag bodies along their orbits (Shift: also their distance); drag the round handles to resize. Wheel zooms.' : 'Read-only. Wheel zooms.'}</span>
    </div>
    {#if view === 'map'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg bind:this={mapEl} class="map" viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" onmousedown={(e) => mapDown(e)} onmousemove={mapMove} onmouseup={mapUp} onmouseleave={mapUp} onwheel={(e) => wheel(e, 'map')}>
        {#each vanillaSys as s (s.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <g class="van" onmousedown={(e) => e.stopPropagation()} onclick={() => openVanilla(s.id)}>
            <title>{s.name}: click to look at it (read-only), or add to it</title>
            <circle cx={s.x} cy={-(s.y ?? 0)} r={vb.w / 300} fill={peek === s.id ? '#9fc4e8' : '#4a6a8a'} />
            <text x={(s.x ?? 0) + vb.w / 220} y={-(s.y ?? 0) + vb.w / 400} font-size={vb.w / 110} fill="#7f93a8">{s.name}</text>
          </g>
        {/each}
        {#each m?.systems.filter((s) => s.kind === 'new' && s.hyperspace) ?? [] as s (s.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g onmousedown={(e) => mapDown(e, s.id)} class="mine" class:on={s.id === sel}>
            <circle cx={s.hyperspace![0]} cy={-s.hyperspace![1]} r={vb.w / 160} fill="#3fa7a0" stroke={s.id === sel ? '#fff' : 'none'} stroke-width={vb.w / 1200} />
            <text x={s.hyperspace![0] + vb.w / 120} y={-s.hyperspace![1] + vb.w / 350} font-size={vb.w / 85} fill="#bff">{s.name}</text>
          </g>
        {/each}
      </svg>
    {:else if sys || peekInfo}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg bind:this={sysEl} class="map sys" viewBox="{svb.x} {svb.y} {svb.w} {svb.h}" onmousemove={sysMove} onmouseup={endDrag} onmouseleave={endDrag} onwheel={(e) => wheel(e, 'sys')}>
        {#if sys?.kind === 'new' && sys.star}
          {@const sc = tcolor(sys.star.type, '#f5d27a')}
          <circle cx="0" cy="0" r={sys.star.radius + sys.star.corona} fill={sc} opacity="0.15" />
          <circle cx="0" cy="0" r={sys.star.radius} fill={sc} opacity="0.9" />
          {#if !entSel}
            <!-- R17: the star's size and corona -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle class="handle" cx={sys.star.radius} cy="0" r={svb.w / 160} onmousedown={(ev) => { ev.stopPropagation(); dragHandle = 'starR' }}><title>Drag: the star's size</title></circle>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle class="handle h2" cx={sys.star.radius + sys.star.corona} cy="0" r={svb.w / 160} onmousedown={(ev) => { ev.stopPropagation(); dragHandle = 'corona' }}><title>Drag: the corona</title></circle>
          {/if}
        {:else if code}
          <!-- R14: the system as its Java source builds it, read-only -->
          {#if code.star}{@const sc = tcolor(code.star.type, '#f5d27a')}<circle cx="0" cy="0" r={code.star.radius + code.star.corona} fill={sc} opacity="0.1" /><circle cx="0" cy="0" r={code.star.radius} fill={sc} opacity="0.6" />{/if}
          {#each code.bodies as b, i (i)}
            {@const f = codePosOf(b.focus)}
            {@const p = bodyPos(code, b)}
            {#if b.kind === 'asteroidBelt' || b.kind === 'ring'}
              <circle cx={f.x} cy={f.y} r={b.orbitRadius} fill="none" stroke={b.kind === 'ring' ? '#6a5f48' : '#555'} stroke-width={b.width || 150} opacity="0.25" />
            {:else}
              <circle cx={f.x} cy={f.y} r={b.orbitRadius} fill="none" stroke="#252c36" stroke-width={svb.w / 1100} />
              <circle cx={p.x} cy={p.y} r={b.kind === 'planet' ? Math.max(b.radius, svb.w / 300) : svb.w / 300} fill={b.kind === 'planet' ? tcolor(b.type, '#56677a') : '#7a8590'} opacity="0.55"><title>{b.name || b.type} ({b.id || 'no id'}) · {b.type} · vanilla, read-only</title></circle>
              {#if b.kind === 'planet' || b.kind === 'jumpPoint' || (b.kind === 'custom' && b.name)}<text x={p.x + svb.w / 150} y={p.y} font-size={b.focus === code.star?.id ? svb.w / 90 : svb.w / 105} fill="#93a0ae" dominant-baseline="middle">{b.name}</text>{/if}
            {/if}
          {/each}
          {#if !code.bodies.length}<text x="0" y={-svb.h / 4} font-size={svb.w / 70} fill="#8a94a6" text-anchor="middle">{code.star ? '' : `${code.name}'s bodies are made by the game's code and can't be read`}</text>{/if}
        {:else}
          <text x="0" y="0" font-size={svb.w / 60} fill="#8a94a6" text-anchor="middle">({sys?.name ?? peekInfo?.name}'s own bodies are made by the game's code and can't be shown)</text>
        {/if}
        {#each sys?.entities ?? [] as e (e.id)}
          {@const f = pos(sys!, e.orbit.focus)}
          {@const p = pos(sys!, e.id)}
          {@const lp = labelPos(sys!, e)}
          {#if e.kind === 'asteroidBelt' || e.kind === 'ring'}
            <circle cx={f.x} cy={f.y} r={e.orbit.radius} fill="none" stroke={e.kind === 'ring' ? '#8a7a5a' : '#6a6a6a'} stroke-width={e.width ?? 200} opacity="0.35" />
          {:else}
            <circle cx={f.x} cy={f.y} r={e.orbit.radius} fill="none" stroke="#2e3642" stroke-width={svb.w / 900} stroke-dasharray="{svb.w / 200} {svb.w / 300}" />
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g onmousedown={(ev) => { ev.stopPropagation(); dragEnt = e.id; entSel = e.id }} class="ent" class:on={e.id === entSel} opacity={e.appears ? 0.45 : 1}>
            <circle cx={p.x} cy={p.y} r={e.radius ? Math.max(e.radius, svb.w / 250) : svb.w / 200} fill={e.market ? fcolor(e.market.faction) : e.kind === 'planet' || e.kind === 'moon' ? tcolor(e.type, '#6a8aa0') : '#c0c8d0'} stroke={e.id === entSel ? '#fff' : 'none'} stroke-width={svb.w / 700} />
            <text x={lp.x} y={lp.y} font-size={e.orbit.focus === 'star' ? svb.w / 80 : svb.w / 95} fill="#cdd" text-anchor={lp.anchor} dominant-baseline="middle">{e.name}</text>
          </g>
        {/each}
        {#if sys && ent}
          <!-- R17: resize handles of the selected entity -->
          {@const p = pos(sys, ent.id)}
          {@const f = pos(sys, ent.orbit.focus)}
          {#if ent.kind === 'asteroidBelt' || ent.kind === 'ring'}
            {@const w = ent.width ?? 200}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle class="handle" cx={f.x + ent.orbit.radius + w / 2} cy={f.y} r={svb.w / 160} onmousedown={(ev) => { ev.stopPropagation(); dragHandle = 'width' }}><title>Drag: the band's width</title></circle>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle class="handle" cx={f.x + ent.orbit.radius - w / 2} cy={f.y} r={svb.w / 160} onmousedown={(ev) => { ev.stopPropagation(); dragHandle = 'width' }}><title>Drag: the band's width</title></circle>
          {:else if ent.radius !== undefined}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle class="handle" cx={p.x + Math.max(ent.radius, svb.w / 250)} cy={p.y} r={svb.w / 170} onmousedown={(ev) => { ev.stopPropagation(); dragHandle = 'size' }}><title>Drag: its size</title></circle>
          {/if}
        {/if}
      </svg>
    {:else}
      <div class="center muted">Pick a system.</div>
    {/if}
  </section>
  <aside class="right">
    {#if typeSel && (m?.types?.entities.some((t) => t.id === typeSel) || m?.types?.planets.some((t) => t.id === typeSel))}
      <TypeForm id={typeSel} onDeleted={() => (typeSel = null)} />
      <p><button class="mini" onclick={() => (typeSel = null)}>Close</button></p>
    {:else if sys && ent}
      <h3>{ent.name} <span class="mono muted">{ent.id}</span></h3>
      {#if ent.kind !== 'asteroidBelt' && ent.kind !== 'ring' && ent.kind !== 'jumpPoint'}
        <!-- R19: a picture of its type -->
        <div class="preview">
          {#if ent.kind === 'planet' || ent.kind === 'moon'}<TypeThumb planet={planetInfo(ent.type)} size={96} />{:else}<TypeThumb entity={entityInfo(ent.type)} size={96} />{/if}
          <div class="small muted">{(ent.kind === 'planet' || ent.kind === 'moon' ? planetInfo(ent.type)?.name : entityInfo(ent.type)?.name) ?? ent.type}<br /><span class="mono">{ent.type}</span><br />An example of the type; the game may tint or light it differently.</div>
        </div>
      {/if}
      <div class="grid2">
        <Field label="Name" for="le-n" help="Shown on the system map, on hover and in the dialog when the player visits.">
          <input id="le-n" type="text" value={ent.name} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.name = v }); idFollowsName(v) }} />
        </Field>
        <Field label="Id" help={entReleased ? 'Stage markers, Arrive nodes and spawns use it; it is in a release, so saves remember it: change it only if you must (Change id… updates everything in this mod that uses it).' : 'Stage markers, Arrive nodes and spawns use it. Until the mod is released it follows the name; Change id… sets your own. Everything in this mod that uses it follows.'}>
          <span style="display:flex;gap:8px;align-items:center"><span class="mono">{ent.id}</span><button class="mini" style="white-space:nowrap" onclick={changeEntityId}>Change id…</button></span>
        </Field>
        <Field label="Mods" help="Only built with / without optional mods (Saga › Mods; SagaLib 1.3). Set automatically (greyed) when it orbits an optional mod's object, or when only conditional content uses it.">
          <ModsCond value={ent.mods} itemKey={`entity:${ent.id}`} onChange={(v) => edEnt((x) => { if (v) x.mods = v; else delete x.mods })} />
        </Field>
        <Field label="Kind" help="What it is; fixed when it is added.">
          <span>{ENTITY_KINDS.find((k) => k.kind === ent.kind)?.label ?? ent.kind}</span>
        </Field>
        <Field label="Type" help={ent.kind === 'planet' || ent.kind === 'moon' ? 'The planet type: its look and its surface in the planet info (barren, jungle, gas giant…).' : ent.kind === 'asteroidBelt' || ent.kind === 'ring' ? 'Belts and rings have no type.' : 'The custom entity type from custom_entities.json: its look and vanilla\'s own dialog for it (a wreck can be salvaged, a relay hacked).'}>
          {#if ent.kind === 'asteroidBelt' || ent.kind === 'ring'}<span class="muted">{ent.kind === 'ring' ? 'ring band' : 'asteroid belt'}</span>
          {:else}
            {@const isPlanet = ent.kind === 'planet' || ent.kind === 'moon'}
            <div class="typerow">
              <span class="mono">{ent.type || '—'}</span>
              <button class="mini" onclick={() => (chooser = { kind: isPlanet ? 'planet' : 'entity' })}>Choose…</button>
            </div>
            {#if isPlanet && fit && index.procgen}
              {@const fits = planetFits(index.procgen, fit.starType, fit.orbitIdx)}
              {@const f = fits.find((x) => x.id === ent.type)}
              <span class="small" class:good={f?.fits} class:muted={!f?.fits}>{f?.fits ? 'Fits here: vanilla\'s random generation puts this type at this orbit.' : `Vanilla's random generation rarely puts it at this orbit of a ${planetInfo(fit.starType)?.name ?? fit.starType} (likely: ${fits.filter((x) => x.fits).slice(0, 3).map((x) => x.id).join(', ')}). Hand-made systems often do anyway.`}</span>
            {/if}
          {/if}
        </Field>
        <Field label="Orbits" for="le-f" help={sys.kind === 'existing' ? 'What it circles: the star, one of your additions, or one of the system\'s own bodies (read from its source).' : 'What it circles: the star, or a planet for a moon or station.'}>
          <select id="le-f" value={ent.orbit.focus} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.orbit.focus = v }) }}><option value="star">the star</option>{#each sys.entities.filter((x) => x.id !== ent.id) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            {#if code?.bodies.length}<optgroup label="{sys.name}'s own bodies (vanilla)">{#each code.bodies.filter((b) => b.id && (b.kind === 'planet' || b.kind === 'custom')) as b (b.id)}<option value={b.id}>{b.name || b.id} ({b.id})</option>{/each}</optgroup>{/if}
            {#if ent.orbit.focus !== 'star' && !sys.entities.some((x) => x.id === ent.orbit.focus) && !code?.bodies.some((b) => b.id === ent.orbit.focus)}<option value={ent.orbit.focus}>{ent.orbit.focus}</option>{/if}</select>
        </Field>
        <Field label="Orbit radius" for="le-r" help="Distance from what it orbits, in map units (vanilla planets 2000–10000, stations 300–600 from their planet).">
          <input id="le-r" type="number" step="50" value={ent.orbit.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.radius = v }) }} />
        </Field>
        <Field label="Angle" for="le-a" help="Where on the orbit it starts in a new game, in degrees (0 = right of the star). Drag it in the system view.">
          <input id="le-a" type="number" value={ent.orbit.angle} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.angle = v }) }} />
        </Field>
        <Field label="Orbit days" for="le-d" help="In-game days for one full orbit; higher is slower.">
          <input id="le-d" type="number" value={ent.orbit.days} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.orbit.days = v }) }} />
        </Field>
        {#if ent.radius !== undefined}
          <Field label="Size" for="le-rr" help="The body's radius in map units (vanilla planets about 100–250, moons 40–80).">
            <input id="le-rr" type="number" value={ent.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.radius = v }) }} />
          </Field>
        {/if}
        {#if ent.width !== undefined}
          <Field label="Width" for="le-w" help="How wide the band is, in map units.">
            <input id="le-w" type="number" value={ent.width} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { x.width = v }) }} />
          </Field>
        {/if}
      </div>
      <!-- SagaLib 1.1 (R25): an object that appears during a quest, optionally in another's place -->
      {@const apMode = !ent.appears ? 'start' : ent.appears.quest ? 'stage' : 'action'}
      {@const apQuest = m?.quests.find((q) => q.id === ent.appears?.quest)}
      <div class="grid2">
        <Field label="Appears" for="le-ap" help="From the start (built with the system), when a quest reaches a stage, or only when an Action node places it. Before that it isn't in the game at all, so the player can't find it early. Needs SagaLib 1.1 unless From the start.">
          <select id="le-ap" value={apMode} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { if (v === 'start') { x.appears = undefined; x.replaces = undefined } else if (v === 'action') x.appears = {}; else x.appears = { quest: questsWithStages[0]?.id ?? '', stage: '' } }) }}>
            <option value="start">from the start</option><option value="stage">when a quest reaches a stage</option><option value="action">when an Action places it</option>
          </select>
        </Field>
        {#if apMode === 'stage'}
          <Field label="At" help="The quest and stage at which it is placed (once; it stays after).">
            <div class="typerow">
              <select value={ent.appears?.quest ?? ''} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.appears = { quest: v, stage: '' } }) }}>{#each questsWithStages as q (q.id)}<option value={q.id}>{q.title}</option>{/each}</select>
              <select value={ent.appears?.stage ?? ''} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.appears = { quest: x.appears?.quest, stage: v } }) }}><option value="">—</option>{#each apQuest?.stages ?? [] as st (st.id)}<option value={st.id}>{st.title}</option>{/each}</select>
            </div>
          </Field>
        {/if}
        {#if apMode !== 'start'}
          <Field label="Replaces" help="Optional: another object it takes the place of (its orbit), which is removed at the same moment: a station that becomes a wreck. An object with a colony is only removed when a removal line below says decivilize.">
            <IdInput value={ent.replaces ?? ''} options={removalOptions.filter((o) => o.id !== ent.id)} placeholder="nothing" onCommit={(v) => edEnt((x) => { x.replaces = v || undefined })} />
          </Field>
        {/if}
        {#if (ent.kind === 'planet' || ent.kind === 'moon') && !ent.market}
          <!-- RC-F1: an uncolonised planet's conditions -->
          <Field label="Conditions" help="What the planet info shows for an uncolonised planet: resources, hazards, ruins (ruins_scattered …). Needs SagaLib 1.1.">
            <div class="chips">{#each ent.conditions ?? [] as c (c)}<span class="chip">{c}<button class="x" onclick={() => edEnt((x) => { x.conditions = (x.conditions ?? []).filter((y) => y !== c); if (!x.conditions.length) x.conditions = undefined })}>✕</button></span>{/each}
              <IdInput value="" options={index.conditions.filter((c) => !/^population_/.test(c.id))} width="150px" placeholder="+ add" clearOnCommit onCommit={(v) => { if (v) edEnt((x) => { x.conditions = [...new Set([...(x.conditions ?? []), v])] }) }} /></div>
          </Field>
          {#if ent.conditions?.some((c) => /^ruins_/.test(c))}
            <Field label="Ruins" for="le-ru" help="At new game vanilla marks the ruins of every planet in a system with a colony as already explored (and the planet surveyed), so &quot;Explore the ruins&quot; never shows there. Ticked: SagaLib puts them back to unexplored right after (and this planet's own Surveyed level). Needs SagaLib 1.2.">
              <label class="chk"><input id="le-ru" type="checkbox" checked={!!ent.ruinsUnexplored} onchange={(e) => { const v = e.currentTarget.checked; edEnt((x) => { x.ruinsUnexplored = v || undefined }) }} /> ruins stay unexplored</label>
            </Field>
          {/if}
          <Field label="Surveyed" for="le-sv" help="How much the player knows at the start: none (survey it to see the conditions), preliminary, or full.">
            <select id="le-sv" value={ent.surveyed ?? ''} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { x.surveyed = (v || undefined) as typeof x.surveyed }) }}><option value="">game default</option><option value="none">none</option><option value="preliminary">preliminary</option><option value="full">full</option></select>
          </Field>
        {/if}
      </div>
      {#if !ent.market && ent.kind !== 'asteroidBelt' && ent.kind !== 'ring' && ent.kind !== 'jumpPoint' && ent.kind !== 'nebula'}
        <!-- Phase 7e (RC-F7): salvage loot and defenders -->
        <div class="sect2">Salvage <button class="mini" onclick={() => edEnt((x) => { x.loot = [...(x.loot ?? []), { group: lootPools[0]?.id ?? '', chances: 1 }] })}>+ Loot</button>{#if !ent.defenders}<button class="mini" onclick={() => edEnt((x) => { x.defenders = { faction: 'pirates', minStr: 10, maxStr: 30 } })}>+ Defenders</button>{/if}</div>
        {#if !ent.loot?.length && !ent.defenders}<p class="f-help">What the player finds when salvaging it (a drop group: one of the mod's loot pools or a vanilla group such as rare_tech), and who guards it. Needs SagaLib 1.2.</p>{/if}
        {#each ent.loot ?? [] as l, i (i)}
          <div class="row3">
            <IdInput value={l.group} options={dropGroupOptions} width="170px" placeholder="drop group" onCommit={(v) => edEnt((x) => { if (x.loot) x.loot[i].group = v.trim() })} />
            <label class="small" title="Random rolls from the group (vanilla addDropRandom)">rolls <input type="number" class="short" min="0" value={l.chances ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edEnt((x) => { if (x.loot) x.loot[i].chances = v || undefined }) }} /></label>
            <label class="small" title="Credits' worth of the group's items (vanilla addDropValue)">value <input type="number" class="short" min="0" value={l.value ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edEnt((x) => { if (x.loot) x.loot[i].value = v || undefined }) }} /></label>
            <button class="mini" title="Remove" onclick={() => edEnt((x) => { x.loot = (x.loot ?? []).filter((_, j) => j !== i); if (!x.loot.length) x.loot = undefined })}>✕</button>
          </div>
        {/each}
        {#if ent.defenders}
          {@const d = ent.defenders}
          <div class="row3">
            <span class="small">defended by</span>
            <IdInput value={d.faction} options={factions} width="120px" onCommit={(v) => edEnt((x) => { if (x.defenders) x.defenders.faction = v })} />
            <label class="small" title="Fleet strength range (vanilla DefenderDataOverride; a derelict usually 10–30)">strength <input type="number" class="short" min="0" value={d.minStr} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edEnt((x) => { if (x.defenders) x.defenders.minStr = v }) }} />–<input type="number" class="short" min="0" value={d.maxStr} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edEnt((x) => { if (x.defenders) x.defenders.maxStr = v }) }} /></label>
            <label class="small" title="Chance there are defenders at all">chance <input type="number" class="short" min="0" max="1" step="0.1" value={d.prob ?? 1} onchange={(e) => { const v = Math.min(1, Math.max(0, Number(e.currentTarget.value) || 0)); edEnt((x) => { if (x.defenders) x.defenders.prob = v === 1 ? undefined : v }) }} /></label>
            <button class="mini" title="Remove" onclick={() => edEnt((x) => { x.defenders = undefined })}>✕</button>
          </div>
        {/if}
      {/if}
      {#if ent.kind === 'derelict'}
        {@const users = questsSendingTo(m?.quests ?? [], ent.id)}
        {@const guards = guardsOf(m?.quests ?? [], ent.id)}
        <div class="sect2">Protection</div>
        <div class="box" class:warnbox={users.length > 0 && !guards.length}>
          {#if guards.length}
            Protected by {#each guards as g, i (g.id)}{i ? ', ' : ''}<button class="lnk" onclick={() => app.go('quests', g.id)}>{g.title}</button>{/each}: it answers at the wreck, so vanilla's salvage and ship recovery can't remove it.
          {:else if users.length}
            {users.map((q) => `"${q.title}"`).join(', ')} {users.length > 1 ? 'send' : 'sends'} the player here, but salvaging or recovering it removes it and the quest can't go on.
          {:else}
            An ordinary wreck: the player can salvage it. Protect it if a quest needs it to stay.
          {/if}
          {#if !guards.length}
            <div class="row3">
              <label for="lp-u" class="small">until</label>
              <select id="lp-u" bind:value={lockUntil}><option value="">it is never released</option>{#each (users.length ? users : (m?.quests.filter((q) => q.kind === 'quest') ?? [])) as q (q.id)}<option value={q.id}>"{q.title}" succeeds</option>{/each}</select>
              <button class="mini" onclick={protect}>Protect this wreck</button>
            </div>
            <div class="f-help">Adds a short conversation at the wreck ("Leave" only). The quests' own arrival steps still win; once the quest above succeeds, vanilla's wreck dialog (salvage, recovery) is back.</div>
          {/if}
        </div>
      {/if}
      {#if ent.kind === 'planet' || ent.kind === 'moon' || ent.kind === 'station'}
        <div class="sect2">Market {#if !ent.market}<button class="mini" onclick={() => { const id = ent.id; edEnt((x) => { x.market = newMarket(`${id}_market`.replace(/_market$/, ''), ent.name, m?.factions.find((f) => f.kind === 'addition')?.id ?? 'independent') }) }}>+ Add a market</button>{:else}<button class="mini" onclick={() => edEnt((x) => { x.market = undefined })}>Remove</button>{/if}</div>
        {#if !ent.market}<p class="f-help">A market makes it a colony the player can dock at and trade with, with people and a comm directory.</p>{/if}
        {#if ent.market}
          {@const mk = ent.market}
          <div class="grid2">
            <Field label="Name" for="lm-n" help="The colony's name when docking, in the intel screen and on the map.">
              <input id="lm-n" type="text" value={mk.name} onchange={(e) => { const v = e.currentTarget.value; edEnt((x) => { if (x.market) x.market.name = v }) }} />
            </Field>
            <Field label="Market id" for="lm-id" help="People's placement and stage markers use it. Don't change it after a release.">
              <input id="lm-id" type="text" class="mono" value={mk.id} onchange={(e) => { const v = e.currentTarget.value.trim(); edEnt((x) => { if (x.market && v) x.market.id = v }) }} />
            </Field>
            <Field label="Faction" help="Who owns the colony: its flag, patrols, prices and who may dock.">
              <IdInput value={mk.faction} options={factions} strict onCommit={(v) => edEnt((x) => { if (x.market) x.market.faction = v })} />
            </Field>
            <Field label="Size" for="lm-s" help="Population size 1–10 (vanilla colonies 3–8). Sets the population_N condition.">
              <input id="lm-s" type="number" min="1" max="10" value={mk.size} onchange={(e) => { const v = Number(e.currentTarget.value); edEnt((x) => { if (x.market) { x.market.size = v; x.market.conditions = [...x.market.conditions.filter((c) => !/^population_\d+$/.test(c)), `population_${v}`] } }) }} />
            </Field>
            <Field label="Free port" for="lm-fp" help="No illegal goods and no customs scans, as at vanilla's free ports.">
              <input id="lm-fp" type="checkbox" checked={mk.freePort} onchange={(e) => { const v = e.currentTarget.checked; edEnt((x) => { if (x.market) x.market.freePort = v }) }} />
            </Field>
            <!-- Phase 7e (RC-R11) -->
            <Field label="Never decivilises" for="lm-nd" help="A colony at zero stability for months decivilises in vanilla (it becomes ruins). Ticked: vanilla's $core_noDeciv, as its pirate and Pather bases; a colony a quest needs should have it. Needs SagaLib 1.2.">
              <input id="lm-nd" type="checkbox" checked={!!mk.protectFromDeciv} onchange={(e) => { const v = e.currentTarget.checked; edEnt((x) => { if (x.market) x.market.protectFromDeciv = v || undefined }) }} />
            </Field>
            <!-- #61 (PLAN.md §10.3) -->
            <Field label="Protect from invasion" for="lm-pi" help="For a place the story can't lose. Nexerelin never invades it: SagaLib sets $nex_uninvadable in the market's memory, which Nexerelin checks before any invasion (the player's too). Without Nexerelin it does nothing. Needs SagaLib 1.3.">
              <input id="lm-pi" type="checkbox" checked={!!mk.protectFromInvasion} onchange={(e) => { const v = e.currentTarget.checked; edEnt((x) => { if (x.market) x.market.protectFromInvasion = v || undefined }) }} />
            </Field>
          </div>
          {#each MARKET_LISTS as l (l.key)}
            <div class="sect3">{l.label}</div>
            <div class="chips">{#each mk[l.key] as c (c)}<span class="chip">{c}<button class="x" onclick={() => listEdit(l.key, (x) => x.filter((y) => y !== c))}>✕</button></span>{/each}
              <IdInput value="" options={l.options()} width="150px" placeholder="+ add" clearOnCommit onCommit={(v) => { if (v) listEdit(l.key, (x) => (x.includes(v) ? x : [...x, v])) }} /></div>
            <div class="f-help">{l.help}</div>
          {/each}
          <div class="sect3">People at this market</div>
          <div class="chips">{#each mk.people as p (p)}<span class="chip">{p}<button class="x" onclick={() => { const mid = mk.id; project.change((mm) => { if (mm.people.some((x) => x.id === p && x.placement.at === 'market' && x.placement.market === mid)) setPersonMarket(mm, p, null); else for (const s of mm.systems) for (const en of s.entities) if (en.market?.id === mid) en.market.people = en.market.people.filter((x) => x !== p) }) }}>✕</button></span>{/each}
            <IdInput value="" options={m?.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })) ?? []} width="150px" placeholder="+ person" clearOnCommit onCommit={(v) => { if (v) { const mid = mk.id; project.change((mm) => setPersonMarket(mm, v, mid)) } }} /></div>
          <div class="f-help">This mod's people who live here. Adding someone here also sets their placement on the People page (and the other way round).</div>
          {#each mk.people as pid (pid)}
            {@const qs = m?.quests.filter((q) => q.start.kind === 'contact' && q.start.person === pid) ?? []}
            {#if qs.length}<div class="muted small">{pid} gives: {qs.map((q) => q.title).join(', ')}</div>{/if}
          {/each}
        {/if}
      {/if}
      <div class="sect2">Description <span class="mono muted">{descKey(ent)}</span></div>
      <p class="f-help">Shown when the player visits it and in its info panel (descriptions.csv).</p>
      {#if m?.descriptions[descKey(ent)]}<VersionStrip kind="description" id={descKey(ent)} what="this description (set at startup from the installed mods)" />{/if}
      <textarea rows="4" value={descriptionText(descKey(ent))} onchange={(e) => setDescription(descKey(ent), e.currentTarget.value)}></textarea>
      <p><button class="mini danger" onclick={removeEntity}>Delete entity</button></p>
    {:else if sys}
      <h3>{sys.name} <span class="mono muted">{sys.id}</span></h3>
      <div class="grid2">
        <Field label="Name" for="ls-n" help={sys.kind === 'new' ? 'The system\'s name on the hyperspace map and in the intel screen.' : 'The existing system\'s name, for this editor only.'}>
          <input id="ls-n" type="text" value={sys.name} onchange={(e) => { const v = e.currentTarget.value; edSys((s) => { s.name = v }) }} />
        </Field>
        <Field label="Mods" help={sys.kind === 'new' ? 'Only built with / without optional mods (Saga › Mods; SagaLib 1.3).' : 'These additions are only built with / without optional mods (Saga › Mods; SagaLib 1.3). An existing system of an optional mod gets "Only with" it by itself.'}>
          <ModsCond value={sys.mods} itemKey={`system:${sys.id}`} onChange={(v) => edSys((s) => { if (v) s.mods = v; else delete s.mods })} />
        </Field>
        {#if sys.kind === 'new'}
          <Field label="Hyperspace" help="Its position on the sector map (drag it on the Hyperspace map). Near the core it is easy to find; at the edge it feels remote.">
            <span class="mono">{sys.hyperspace?.join(', ')}</span>
          </Field>
          <Field label="No star" for="ls-ns" help="An empty centre instead of a star, lit by a colour of your choice, as vanilla's Tri-Tachyon black site. Bodies orbit the centre. Needs SagaLib 1.1.">
            <input id="ls-ns" type="checkbox" checked={!!sys.starless} onchange={(e) => { const v = e.currentTarget.checked; edSys((s) => { s.starless = v || undefined; if (v && !s.light) s.light = [200, 210, 255] }) }} />
          </Field>
          {#if sys.starless}
            <Field label="Light" for="ls-l" help="The light colour on everything in the system (there is no star to light it).">
              <input id="ls-l" type="color" value={'#' + (sys.light ?? [255, 255, 255]).map((c) => c.toString(16).padStart(2, '0')).join('')} onchange={(e) => { const h = e.currentTarget.value.slice(1); edSys((s) => { s.light = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] }) }} />
            </Field>
          {/if}
          {#if !sys.starless}
          <Field label="Star" help="The star's type: its color and the light on the planets. Stars are the planets.json entries marked isStar, from the game, the installed mods and this mod's own types.">
            <div class="typerow">
              <TypeThumb planet={planetInfo(sys.star?.type ?? '')} size={36} />
              <span>{planetInfo(sys.star?.type ?? '')?.name ?? sys.star?.type}<br /><span class="mono small muted">{sys.star?.type}</span></span>
              <button class="mini" onclick={() => (chooser = { kind: 'star' })}>Choose…</button>
            </div>
          </Field>
          <Field label="Star radius" for="ls-sr" help="The star's size in map units (vanilla 500–1100).">
            <input id="ls-sr" type="number" value={sys.star?.radius} onchange={(e) => { const v = Number(e.currentTarget.value); edSys((s) => { if (s.star) s.star.radius = v }) }} />
          </Field>
          <Field label="Corona" for="ls-c" help="The glow around the star, in map units; flying through it costs CR, as near vanilla stars.">
            <input id="ls-c" type="number" value={sys.star?.corona} onchange={(e) => { const v = Number(e.currentTarget.value); edSys((s) => { if (s.star) s.star.corona = v }) }} />
          </Field>
          {/if}
          <Field label="Music" help="A music id played while the player is in the system. Empty: the game's default.">
            <IdInput value={sys.music ?? ''} options={index.music.map((x) => ({ id: x }))} onCommit={(v) => edSys((s) => { s.music = v || undefined })} />
          </Field>
        {/if}
      </div>
      <div class="box" class:warnbox={!sys.addToExistingSaves}>
        <label class="chk"><input type="checkbox" checked={sys.addToExistingSaves} onchange={(e) => { const v = e.currentTarget.checked; edSys((s) => { s.addToExistingSaves = v }) }} /> <span><b>Existing saves</b>: also build it in saves that don't have it yet (on load)</span></label>
        {#if !sys.addToExistingSaves}<div class="small">"{sys.name}" will only appear in new games.</div>{/if}
        {#if sys.kind === 'existing'}<div class="small muted">SagaLib checks each entity isn't already there before adding it, and never touches what the system already has.</div>{/if}
      </div>
      <!-- SagaLib 1.1 (R26): objects removed during quests, any object (vanilla's too, with warnings) -->
      <div class="sect2">Removed during quests <button class="mini" onclick={() => edSys((s) => { s.removals ??= []; s.removals.push({ target: '', quest: m?.quests.find((q) => q.kind === 'quest')?.id ?? '', stage: '' }) })}>+ Add</button></div>
      <p class="f-help">An object (yours, vanilla's or another mod's) that disappears for good when a quest reaches a stage: "the station is blown up". Problems lists what still points at it. Needs SagaLib 1.1.</p>
      {#each sys.removals ?? [] as r, i (i)}
        {@const rq = m?.quests.find((q) => q.id === r.quest)}
        <div class="box">
          <div class="grid2">
            <Field label="Object" help="Its id: one of this system's objects, or any object in the game.">
              <IdInput value={r.target} options={removalOptions} strict onCommit={(v) => edSys((s) => { s.removals![i].target = v })} />
            </Field>
            <Field label="When" help="The quest and the stage at which it disappears.">
              <div class="typerow">
                <select value={r.quest} onchange={(e) => { const v = e.currentTarget.value; edSys((s) => { s.removals![i].quest = v; s.removals![i].stage = '' }) }}>{#each m?.quests.filter((q) => q.kind === 'quest') ?? [] as q (q.id)}<option value={q.id}>{q.title}</option>{/each}</select>
                <select value={r.stage} onchange={(e) => { const v = e.currentTarget.value; edSys((s) => { s.removals![i].stage = v }) }}><option value="">—</option>{#each rq?.stages ?? [] as st (st.id)}<option value={st.id}>{st.title}</option>{/each}</select>
              </div>
            </Field>
            <Field label="Its market" help="An object with a colony is only removed when its colony is destroyed (vanilla's decivilization); otherwise it stays and SagaLib logs an error.">
              <select value={r.market ?? 'keep'} onchange={(e) => { const v = e.currentTarget.value as 'keep' | 'decivilize'; if (v === 'decivilize' && !confirm('Decivilize: the colony is destroyed for good, with its people, industries and economy. Continue?')) { e.currentTarget.value = r.market ?? 'keep'; return } edSys((s) => { s.removals![i].market = v === 'keep' ? undefined : v }) }}>
                <option value="keep">keep (don't remove an object with a colony)</option><option value="decivilize">decivilize (destroy the colony)</option>
              </select>
            </Field>
          </div>
          <button class="mini danger" onclick={() => edSys((s) => { s.removals!.splice(i, 1); if (!s.removals!.length) s.removals = undefined })}>Remove this line</button>
        </div>
      {/each}
      <p><button class="mini danger" onclick={removeSystem}>Delete {sys.kind === 'new' ? 'system' : 'these additions'}</button></p>
    {:else if peekInfo}
      <h3>{peekInfo.name} <span class="mono muted">{peekInfo.id}</span></h3>
      <p class="small">Defined by {peekInfo.definedBy === 'starsector-core' ? 'vanilla' : index.sources.find((x) => x.id === peekInfo.definedBy)?.name ?? peekInfo.definedBy}. Read-only.</p>
      {#if code}
        <p class="small muted">Read from <span class="mono">{code.file}</span>: {code.star ? `a ${planetInfo(code.star.type)?.name ?? code.star.type}, ` : ''}{code.bodies.filter((b) => b.kind === 'planet').length} planets and moons, {code.bodies.filter((b) => b.kind === 'custom').length} stations and other entities, {code.bodies.filter((b) => b.kind === 'jumpPoint').length} jump points.{#if code.skipped} {code.skipped} parts are made by code the editor can't read (random generation, helpers), so they aren't shown.{/if}</p>
      {:else}
        <p class="small muted">Its bodies are made by the game's code, which the editor can't read: only its place on the map is known.</p>
      {/if}
      <p><button class="primary" disabled={!m} onclick={() => { const id = peekInfo.id; project.change((mm) => { mm.systems.push(addition(id, peekInfo.name)) }); app.selected.locations = id; peek = null }}>Add to this system…</button></p>
      <p class="f-help">Adds stations, wrecks, planets or other entities to {peekInfo.name}. Its own bodies are never changed; your additions can orbit them.</p>
    {:else}
      <p class="muted">Create a new star system, or add entities to an existing one (Corvus +1 station, say). Click a system on the hyperspace map to look at it.</p>
    {/if}
  </aside>
</div>

{#if showNewType}
  <Modal title="New type" onClose={() => (showNewType = false)}>
    <div class="seg2">
      <label><input type="radio" bind:group={newTypeKind} value="entity" /> A station or other object</label>
      <label><input type="radio" bind:group={newTypeKind} value="planet" /> A planet type</label>
      <label><input type="radio" bind:group={newTypeKind} value="star" /> A star type</label>
    </div>
    <div class="grid2 modal">
      <Field label="Name" for="nt-n" help="Its name in game; the id is made from it with the mod's prefix."><input id="nt-n" type="text" bind:value={newTypeName} placeholder={newTypeKind === 'entity' ? 'e.g. Cat Tree Station' : newTypeKind === 'star' ? 'e.g. Amber Star' : 'e.g. Catnip World'} /></Field>
      <Field label="Id" help="The type id entities use. Don't change it after a release."><span class="mono">{newTypeId || '—'}</span></Field>
    </div>
    <p class="muted small">{newTypeKind === 'entity' ? 'It starts as a copy of vanilla\'s side station: choose its sprite and what it behaves like next.' : `It starts as a copy of vanilla's ${newTypeKind === 'star' ? 'yellow star' : 'barren planet'}: choose its texture and what it is based on next.`} Pictures go through the Images page (cropped and resized to vanilla's sizes).</p>
    {#snippet actions()}<button onclick={() => (showNewType = false)}>Cancel</button><button class="primary" disabled={!newTypeId} onclick={createType}>Create</button>{/snippet}
  </Modal>
{/if}

{#if chooser && (sys || peekInfo)}
  <TypeChooser kind={chooser.kind} current={chooser.kind === 'star' ? sys?.star?.type ?? '' : ent?.type ?? ''} fit={chooser.kind === 'planet' ? fit : null} entityKind={ent?.kind ?? ''}
    ownPlanets={ownTypes.planets} ownEntities={ownTypes.entities}
    onClose={() => (chooser = null)}
    onPick={(id) => { const k = chooser!.kind; chooser = null; if (k === 'star') edSys((s) => { if (s.star) s.star.type = id }); else edEnt((x) => { x.type = id }) }} />
{/if}

{#if showNew}
  <Modal title="New location" onClose={() => (showNew = false)}>
    <div class="seg2"><label><input type="radio" bind:group={newKind} value="new" /> A new star system</label><label><input type="radio" bind:group={newKind} value="existing" /> Additions to an existing system</label></div>
    {#if newKind === 'new'}
      <div class="grid2 modal">
        <Field label="Name" for="nl-n" help="The system's name on the map."><input id="nl-n" type="text" bind:value={newName} placeholder="e.g. Kestrel" /></Field>
        <Field label="Id" help="Made from the name with the mod's prefix. Don't change it after a release."><span class="mono">{project.prefix}{slug(newName)}</span></Field>
      </div>
      <p class="muted small">It appears at the centre of the map; drag it where you want it.</p>
    {:else}
      <div class="grid2 modal">
        <Field label="System" help="An existing system (vanilla or another mod) to add stations, wrecks or other entities to. Its own bodies are never changed.">
          <IdInput value={existingId} options={index.systems} strict placeholder="e.g. corvus" onCommit={(v) => (existingId = v)} />
        </Field>
      </div>
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
  .map .van { cursor: pointer; }
  .map .handle { fill: #fff; stroke: var(--accent); stroke-width: 0.5%; cursor: ew-resize; opacity: .9; }
  .map .handle.h2 { fill: var(--warn); }
  .preview { display: flex; gap: 10px; align-items: center; margin: 0 0 8px; }
  .typerow { display: flex; gap: 8px; align-items: center; }
  .typerow .mini { margin-left: auto; }
  .good { color: var(--good); }
  .center { display: grid; place-items: center; flex: 1; }
  h3 { margin: 2px 0 8px; font-size: 13px; display: flex; gap: 8px; align-items: baseline; }
  .grid2 { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 2px 8px; align-items: center; }
  .grid2.modal { width: 420px; margin-bottom: 6px; }
  p.f-help { margin: 0 0 4px; }
  .row3 { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .row3 select { flex: 1; min-width: 0; font-size: 12px; padding: 2px 4px; }
  .row3 input.short { width: 56px; padding: 2px 4px; }
  .lnk { border: none; background: none; padding: 0; color: var(--accent); font-size: 12px; }
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
