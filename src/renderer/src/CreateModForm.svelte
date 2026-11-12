<!-- Copied from Ship Editor (src/renderer/src/CreateModForm.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts">
  /** Create a new mod in the user's mods folder; it becomes the active mod. */
  import type { GameIndex } from '../../shared/api'

  interface Props {
    onCreated: (index: GameIndex) => void
  }
  let { onCreated }: Props = $props()

  let id = $state('')
  let name = $state('')
  let error = $state<string | null>(null)
  let working = $state(false)

  const clean = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

  async function create() {
    error = null
    working = true
    try {
      const index = await window.api.createMod({ id: id.trim(), name: name.trim() || id.trim() })
      id = ''
      name = ''
      onCreated(index)
    } catch (e) {
      error = clean(e)
    } finally {
      working = false
    }
  }
</script>

<div class="form">
  <input type="text" class="mono" placeholder="mod id, e.g. my_ships" bind:value={id} aria-label="Mod id" />
  <input type="text" placeholder="name, e.g. My Ships" bind:value={name} aria-label="Mod name" />
  <button onclick={create} disabled={working || !id.trim()}>Create</button>
</div>
{#if error}<div class="bad">{error}</div>{/if}

<style>
  .form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; margin-top: 6px; }
  .bad { color: var(--bad); margin-top: 6px; font-size: 12px; }
</style>
