<!-- Copied from Ship Editor (src/renderer/src/CreateModForm.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts">
  /**
   * Create a new mod in the user's mods folder; it becomes the active mod. On a first start the mods
   * folder isn't set yet: it is chosen right here (workflow walk W1), not in Settings.
   */
  import type { GameIndex } from '../../shared/api'
  import Field from './ui/Field.svelte'

  interface Props {
    onCreated: (index: GameIndex) => void
    onCancel?: () => void
    /** Where new mods go; null: not chosen yet. */
    modsRoot?: string | null
    /** The game's own mods folder, offered as the other choice. */
    gameMods?: string | null
    /** The mods folder changed (the index is reloaded). */
    onIndex?: (index: GameIndex) => void
  }
  let { onCreated, onCancel, modsRoot = null, gameMods = null, onIndex }: Props = $props()

  let id = $state('')
  let name = $state('')
  let error = $state<string | null>(null)
  let working = $state(false)

  const clean = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

  async function setFolder(fn: () => Promise<{ ok: boolean; error?: string }>) {
    error = null
    working = true
    try {
      const r = await fn()
      if (!r.ok) { error = r.error ?? 'That folder can\'t be used.'; return }
      onIndex?.(await window.api.getIndex(true))
    } catch (e) { error = clean(e) } finally { working = false }
  }
  async function chooseFolder() {
    const dir = await window.api.pickFolder(null, 'Choose the folder for your mods')
    if (dir) await setFolder(() => window.api.setWorkspace(dir))
  }

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
  {#if onIndex}
    <Field label="Mods folder" help={modsRoot ? 'Where the new mod\'s folder is made. Change it in Settings (⚙).' : 'Not chosen yet. A separate folder of your own is safest: link each mod into the game\'s mods folder to play it. Or work in the game\'s mods folder directly.'}>
      {#if modsRoot}<span class="mono path">{modsRoot}</span>
      {:else}<span class="row"><button onclick={chooseFolder} disabled={working}>Choose a folder…</button>{#if gameMods}<button onclick={() => setFolder(() => window.api.setModsMode('game'))} disabled={working} title={gameMods}>Use the game's mods folder</button>{/if}</span>{/if}
    </Field>
  {/if}
  <Field label="Mod id" for="cm-id" help="The id in mod_info.json, also the folder name. Other mods and saves refer to it: never change it after a release.">
    <input id="cm-id" type="text" class="mono" placeholder="e.g. vanguard_compact" bind:value={id} />
  </Field>
  <Field label="Name" for="cm-name" help="The name in the game's launcher mod list. Empty: the id.">
    <input id="cm-name" type="text" placeholder="e.g. Vanguard Compact" bind:value={name} />
  </Field>
  <span></span><div class="row">{#if onCancel}<button onclick={onCancel}>Cancel</button>{/if}<button class="primary" onclick={create} disabled={working || !id.trim() || (!!onIndex && !modsRoot)}>Create</button></div>
</div>
{#if error}<div class="bad">{error}</div>{/if}

<style>
  .form { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 2px 10px; margin-top: 6px; width: 480px; max-width: 100%; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .path { word-break: break-all; }
  .bad { color: var(--bad); margin-top: 6px; font-size: 12px; }
</style>
