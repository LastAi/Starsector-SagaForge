<script lang="ts">
  /** #67 U44: opens the token window, next to a text field that takes tokens. */
  import { tokenHub } from '../state/tokens.svelte'
  interface Props { title?: string }
  let { title = 'Look up text tokens: names, ranks, factions, your people… (typing $ in the text suggests them too)' }: Props = $props()
</script>

<button class="tokbtn mono" {title} onclick={() => void tokenHub.open()}>$ Tokens</button>

<style>
  .tokbtn { padding: 0 8px; font-size: 11px; }
</style>
