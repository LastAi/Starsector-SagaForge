<script lang="ts">
  /** Shows an image by game path (read from the game or a mod, never copied), or a picked file waiting to be copied. */
  import { images } from '../state/app.svelte'
  import { project } from '../state/project.svelte'

  interface Props { path: string | null | undefined; sourceId?: string; w?: number; h?: number; fit?: 'contain' | 'cover'; alt?: string; round?: boolean }
  let { path, sourceId, w = 64, h = 64, fit = 'contain', alt = '', round = false }: Props = $props()

  let url = $state<string | null>(null)
  let missing = $state(false)
  $effect(() => {
    const p = path
    const pending = p ? project.pendingCopies.find((c) => c.to === p) : undefined
    url = null
    missing = false
    if (!p) return
    const req = pending ? images.picked(pending.from) : images.url(p, sourceId ?? project.loaded?.sourceId)
    req.then((u) => { if (path === p) { url = u; missing = !u } })
  })
</script>

<span class="img" class:round style="width:{w}px;height:{h}px" title={path ?? ''}>
  {#if url}<img src={url} {alt} style="object-fit:{fit}" />{:else if missing}<span class="miss">missing</span>{/if}
</span>

<style>
  .img { display: inline-grid; place-items: center; background: #0b0e12; border: 1px solid var(--border); overflow: hidden; flex: none; }
  .img.round { border-radius: 50%; }
  img { width: 100%; height: 100%; }
  .miss { font-size: 10px; color: var(--bad); }
</style>
