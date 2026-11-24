<script lang="ts">
  /**
   * One of the mod's own celestial types (R21; DESIGN-PHASE3.md §6): an entity type (a station or
   * other object with its own sprite) or a planet or star type (its own texture on a vanilla base).
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import TypeThumb from './TypeThumb.svelte'
  import TypeChooser from './TypeChooser.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { behaviourBases, ownTypeInfos } from '../../../shared/celestial'
  import type { CustomEntityTypeDef, CustomPlanetTypeDef } from '../../../shared/model'

  interface Props { id: string; onDeleted: () => void }
  let { id, onDeleted }: Props = $props()

  const index = $derived(app.index!)
  const m = $derived(project.m)
  const et = $derived(m?.types?.entities.find((t) => t.id === id) ?? null)
  const pt = $derived(m?.types?.planets.find((t) => t.id === id) ?? null)
  const own = $derived(ownTypeInfos(m?.types, index.planetTypes, index.customEntityTypes))
  const bases = $derived(behaviourBases(index.customEntityTypes))
  const BASE_GROUPS = [
    { label: 'Station (dockable with a market, as vanilla\'s orbital stations)', test: (t: { tags: string[] }) => t.tags.includes('station') },
    { label: 'Derelict (salvageable)', test: (t: { tags: string[] }) => t.tags.includes('salvageable') },
    { label: 'Relay, buoy or array', test: (t: { tags: string[] }) => t.tags.includes('objective') },
    { label: 'Other', test: (t: { tags: string[] }) => !['station', 'salvageable', 'objective'].some((x) => t.tags.includes(x)) }
  ]
  const users = $derived((m?.systems ?? []).flatMap((s) => s.entities.filter((e) => e.type === id).map((e) => e.name)).concat((m?.systems ?? []).filter((s) => s.star?.type === id).map((s) => `${s.name} (star)`)))
  const clash = $derived(index.planetTypes.some((t) => t.id === id && t.definedBy !== project.loaded?.sourceId) || index.customEntityTypes.some((t) => t.id === id && t.definedBy !== project.loaded?.sourceId))

  const setE = (fn: (t: CustomEntityTypeDef) => void) => project.change((mm) => { const t = mm.types?.entities.find((x) => x.id === id); if (t) fn(t) })
  const setP = (fn: (t: CustomPlanetTypeDef) => void) => project.change((mm) => { const t = mm.types?.planets.find((x) => x.id === id); if (t) fn(t) })
  let choosingBase = $state(false)

  const fileName = (p: string | undefined) => (p ?? '').replace(/^.*\//, '')
  async function pick(kind: 'entitySprite' | 'mapIcon' | 'planetTexture' | 'illustration', current: string, set: (p: string) => void) {
    const [p] = await chooseImages(kind, { current })
    if (!p) return
    // the illustration picker answers with a key; interactionImage wants the file path
    if (kind === 'illustration') set(m?.project.illustrations?.[p] ?? index.illustrations.find((i) => i.category === 'illustrations' && i.key === p)?.path ?? p)
    else set(p)
  }
  function remove() {
    const used = users.length ? ` It is used by ${users.join(', ')} (Problems will report them).` : ''
    if (!confirm(`Delete the type "${id}"?${used} Undo can bring it back until you save.`)) return
    project.change((mm) => { if (!mm.types) return; mm.types.entities = mm.types.entities.filter((t) => t.id !== id); mm.types.planets = mm.types.planets.filter((t) => t.id !== id) })
    onDeleted()
  }
</script>

{#if et}
  {@const info = own.entities.find((t) => t.id === id)}
  <h3>{et.name} <span class="mono muted">{et.id}</span></h3>
  <div class="preview"><TypeThumb entity={info} size={96} /><div class="small muted">Your own entity type, written to the mod's <span class="mono">data/config/custom_entities.json</span> on Export.</div></div>
  <div class="grid2">
    <Field label="Name" for="ty-n" help="Its default name (defaultName): used when an entity of this type has no name of its own.">
      <input id="ty-n" type="text" value={et.name} onchange={(e) => { const v = e.currentTarget.value; setE((t) => { t.name = v }) }} />
    </Field>
    <Field label="Behaves like" ref="locations-entity-types" for="ty-b" help="The vanilla type it inherits everything else from (baseId): tags, layers, how it is drawn, and vanilla's own behaviour for it. A station can be docked at when it has a market; a derelict can be salvaged.">
      <select id="ty-b" value={et.behavesLike} onchange={(e) => { const v = e.currentTarget.value; setE((t) => { t.behavesLike = v }) }}>
        {#each BASE_GROUPS as g (g.label)}<optgroup label={g.label}>{#each bases.filter(g.test) as b (b.id)}<option value={b.id}>{b.name} ({b.id})</option>{/each}</optgroup>{/each}
        {#if et.behavesLike && !bases.some((b) => b.id === et.behavesLike)}<option value={et.behavesLike}>{et.behavesLike} (not offered here: animated or from another mod)</option>{/if}
      </select>
    </Field>
    <Field label="Sprite" help="The picture in the campaign view. Choose… picks one or imports your own (cropped to 160×160, as vanilla's stations).">
      <div class="imgrow"><ImageView path={et.sprite} w={56} h={56} /><span class="mono small" title={et.sprite}>{fileName(et.sprite) || "—"}</span><button class="mini" onclick={() => pick('entitySprite', et.sprite, (p) => setE((t) => { t.sprite = p }))}>Choose…</button></div>
    </Field>
    <Field label="Drawn size" for="ty-s" help="How big the sprite is drawn, in map units (spriteWidth and spriteHeight). Vanilla stations: 80.">
      <input id="ty-s" type="number" min="8" step="2" value={et.size} onchange={(e) => { const v = Number(e.currentTarget.value); setE((t) => { t.size = v }) }} />
    </Field>
    <Field label="Radius" for="ty-r" help="Its size for collisions, selection and orbits (defaultRadius). Vanilla stations: 50.">
      <input id="ty-r" type="number" min="0" step="5" value={et.radius} onchange={(e) => { const v = Number(e.currentTarget.value); setE((t) => { t.radius = v }) }} />
    </Field>
    <Field label="Map icon" help="Optional: its icon on the map (64×64). Empty: the base type's icon.">
      <div class="imgrow"><ImageView path={et.icon} w={32} h={32} /><span class="mono small" title={et.icon}>{fileName(et.icon) || "from the base type"}</span><button class="mini" onclick={() => pick('mapIcon', et.icon ?? '', (p) => setE((t) => { t.icon = p }))}>Choose…</button>{#if et.icon}<button class="mini" onclick={() => setE((t) => { delete t.icon })}>✕</button>{/if}</div>
    </Field>
    <Field label="Picture" help="Optional: the illustration when the player interacts with it (interactionImage). Empty: the base type's.">
      <div class="imgrow"><ImageView path={et.interactionImage} w={64} h={40} /><span class="mono small" title={et.interactionImage}>{fileName(et.interactionImage) || "from the base type"}</span><button class="mini" onclick={() => pick('illustration', et.interactionImage ?? '', (p) => setE((t) => { t.interactionImage = p }))}>Choose…</button>{#if et.interactionImage}<button class="mini" onclick={() => setE((t) => { delete t.interactionImage })}>✕</button>{/if}</div>
    </Field>
    <Field label="Note" for="ty-no" help="For you; not exported.">
      <input id="ty-no" type="text" value={et.note ?? ''} onchange={(e) => { const v = e.currentTarget.value; setE((t) => { if (v.trim()) t.note = v; else delete t.note }) }} />
    </Field>
  </div>
{:else if pt}
  {@const info = own.planets.find((t) => t.id === id)}
  {@const base = index.planetTypes.find((t) => t.id === pt.basedOn)}
  <h3>{pt.name} <span class="mono muted">{pt.id}</span></h3>
  <div class="preview"><TypeThumb planet={info} size={96} /><div class="small muted">Your own {pt.isStar ? 'star' : 'planet'} type, written to the mod's <span class="mono">data/config/planets.json</span> on Export.</div></div>
  <div class="grid2">
    <Field label="Name" for="ty-n" help={pt.isStar ? 'The star type\'s name, shown in the system\'s info.' : 'The planet type\'s name, shown in the planet info ("Terran", "Barren").'}>
      <input id="ty-n" type="text" value={pt.name} onchange={(e) => { const v = e.currentTarget.value; setP((t) => { t.name = v }) }} />
    </Field>
    <Field label="Based on" ref={pt.isStar ? 'locations-star-types' : 'locations-planet-types'} help={pt.isStar ? 'The vanilla star whose settings are copied: corona, light color, glow. Only the name and texture change.' : 'The vanilla planet type whose settings are copied: tilt, atmosphere and its colors, the icon color. Only the name and texture change.'}>
      <div class="imgrow"><TypeThumb planet={base} size={32} /><span class="small">{base?.name ?? pt.basedOn} <span class="mono muted">{pt.basedOn}</span></span><button class="mini" onclick={() => (choosingBase = true)}>Choose…</button></div>
    </Field>
    <Field label="Texture" help="The surface wrapped around the sphere. Choose… picks one or imports your own (cropped to 1024×512, as vanilla's).">
      <div class="imgrow"><ImageView path={pt.texture} w={96} h={48} /><span class="mono small" title={pt.texture}>{fileName(pt.texture) || "—"}</span><button class="mini" onclick={() => pick('planetTexture', pt.texture, (p) => setP((t) => { t.texture = p }))}>Choose…</button></div>
    </Field>
    <Field label="Note" for="ty-no" help="For you; not exported.">
      <input id="ty-no" type="text" value={pt.note ?? ''} onchange={(e) => { const v = e.currentTarget.value; setP((t) => { if (v.trim()) t.note = v; else delete t.note }) }} />
    </Field>
  </div>
{/if}
{#if et || pt}
  {#if clash}<div class="box warnbox">The game or another mod already has a type "{id}": the merge would change it for everyone. Give yours another id (delete and create it again).</div>{/if}
  <div class="small muted">{users.length ? `Used by ${users.join(', ')}.` : 'Not used yet: pick it as the type of an entity (or the star of a system).'}</div>
  <p><button class="mini danger" onclick={remove}>Delete type</button></p>
{/if}
{#if choosingBase && pt}
  <TypeChooser kind={pt.isStar ? 'star' : 'planet'} current={pt.basedOn} onClose={() => (choosingBase = false)} onPick={(v) => { choosingBase = false; setP((t) => { t.basedOn = v }) }} />
{/if}

<style>
  h3 { margin: 2px 0 8px; font-size: 13px; display: flex; gap: 8px; align-items: baseline; }
  .preview { display: flex; gap: 10px; align-items: center; margin: 0 0 8px; }
  .grid2 { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 2px 8px; align-items: center; }
  .grid2 input, .grid2 select { width: 100%; padding: 3px 6px; }
  .imgrow { display: flex; gap: 6px; align-items: center; min-width: 0; }
  .imgrow .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .box { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin: 10px 0; font-size: 12px; }
  .warnbox { border-color: #6b4a1f; background: #2a1f10; color: var(--warn); }
</style>
