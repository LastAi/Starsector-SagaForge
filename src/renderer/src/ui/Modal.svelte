<script lang="ts">
  /** A modal dialog with free content (Ship Editor's dialog look). */
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    onClose: () => void
    width?: number
    children: Snippet
    actions?: Snippet
  }
  let { title, onClose, width = 620, children, actions }: Props = $props()
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose() }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} style="width:min({width}px, calc(100% - 40px))">
    <h2>{title}</h2>
    {@render children()}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 60; }
  .dialog { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px 22px; max-height: calc(100vh - 40px); overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
  h2 { margin: 0 0 10px; font-size: 16px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
