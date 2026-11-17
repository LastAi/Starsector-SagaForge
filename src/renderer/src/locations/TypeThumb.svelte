<script lang="ts">
  /**
   * A picture of a planet, star or custom entity type (R19): a planet's texture as a lit sphere, a
   * station's sprite (or its sheet, or its map icon). Paths are read from the source that defines
   * the type; the mod's own types from the mod.
   */
  import ImageView from '../ui/ImageView.svelte'
  import type { EntityTypeInfo, PlanetTypeInfo } from '../../../shared/api'

  interface Props { planet?: PlanetTypeInfo | null; entity?: EntityTypeInfo | null; size?: number }
  let { planet = null, entity = null, size = 48 }: Props = $props()
  const src = (t: { definedBy: string; changedBy: string[] }) => (t.changedBy.length ? t.changedBy[t.changedBy.length - 1] : t.definedBy)
  const rim = $derived(planet?.iconColor ? `rgba(${planet.iconColor[0]},${planet.iconColor[1]},${planet.iconColor[2]},0.9)` : '#4a5a6a')
</script>

{#if planet}
  <span class="planet" class:star={planet.isStar} style="width:{size}px;height:{size}px;--rim:{rim}">
    <ImageView path={planet.texture} sourceId={src(planet)} w={size} h={size} fit="cover" round />
    <span class="shade"></span>
  </span>
{:else if entity}
  <ImageView path={entity.sprite || entity.sheet || entity.icon} sourceId={src(entity)} w={size} h={size} />
{:else}
  <span class="none" style="width:{size}px;height:{size}px">?</span>
{/if}

<style>
  .planet { position: relative; display: inline-block; flex: none; border-radius: 50%; box-shadow: 0 0 0 1px var(--rim); }
  .planet :global(.img) { border: none; }
  .shade { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 35% 30%, transparent 35%, rgba(0, 0, 0, .65) 85%); pointer-events: none; }
  .planet.star .shade { background: radial-gradient(circle at 50% 50%, transparent 55%, rgba(255, 240, 200, .25) 100%); }
  .none { display: inline-grid; place-items: center; border: 1px dashed var(--border); color: var(--muted); border-radius: 4px; flex: none; }
</style>
