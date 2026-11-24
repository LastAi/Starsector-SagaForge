<script lang="ts">
  /** #67 U44: the token window (a child window of the editor): the lookup, fed by the editor. */
  import TokenLookup from './TokenLookup.svelte'
  import type { TokenPayload } from '../state/tokens.svelte'

  let payload = $state<TokenPayload | null>(null)
  $effect(() => {
    void window.api.tokensGet().then((p) => { if (p) payload = p as TokenPayload })
    window.api.onTokens((p) => { payload = p as TokenPayload })
  })
  const cache = new Map<string, Promise<string | null>>()
  function imageUrl(path: string): Promise<string | null> {
    const key = `${payload?.sourceId ?? ''}|${path}`
    let p = cache.get(key)
    if (!p) {
      p = window.api.loadImage(path, payload?.sourceId).then((d) => (d ? URL.createObjectURL(new Blob([d.bytes as BlobPart], { type: d.mime })) : null)).catch(() => null)
      cache.set(key, p)
    }
    return p
  }
</script>

<div class="win"><TokenLookup {payload} onInsert={(t) => window.api.tokensInsert(t)} {imageUrl} /></div>

<style>
  .win { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--bg); }
</style>
