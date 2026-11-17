<script lang="ts">
  /**
   * New translation (Phase 8c, R31): pick an installed mod made with Saga Forge and a language.
   * Creates "<mod id>_<language>" in the mods folder: a mod_info.json that needs the translated mod
   * and SagaLib, its content.csv, and the CSV of every text (empty translations). The translated
   * mod is only read.
   */
  import { onMount } from 'svelte'
  import Modal from '../ui/Modal.svelte'
  import Field from '../ui/Field.svelte'
  import { cleanError } from '../state/app.svelte'
  import type { GameIndex } from '../../../shared/api'

  interface Props { onCreated: (i: GameIndex) => void; onCancel: () => void }
  let { onCreated, onCancel }: Props = $props()

  let mods = $state<{ id: string; name: string; version: string; texts: number; dialog: boolean }[] | null>(null)
  let target = $state('')
  let language = $state('')
  let languageName = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)

  onMount(async () => {
    try { mods = await window.api.translatableMods(); target = mods[0]?.id ?? '' } catch (e) { error = cleanError(e); mods = [] }
  })
  const code = $derived(language.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
  const chosen = $derived(mods?.find((m) => m.id === target) ?? null)

  async function create() {
    error = null
    busy = true
    try { onCreated(await window.api.createTranslation({ target, language: code, languageName })) } catch (e) { error = cleanError(e) } finally { busy = false }
  }
</script>

<Modal title="New translation" onClose={onCancel} width={620}>
  <p class="muted small">A translation is a small mod of its own, so you can share it without copying the mod you translate. SagaLib puts its texts in game; with it disabled, the mod shows its own language again. Only text the player reads is translated.</p>
  {#if mods === null}
    <p class="muted">Looking for mods made with Saga Forge…</p>
  {:else if !mods.length}
    <p>No installed mod has texts to translate. Translations work for mods made with Saga Forge and exported for SagaLib 1.2 or later.</p>
  {:else}
    <div class="grid">
      <Field label="Mod" for="nt-mod" help="An installed mod made with Saga Forge. It is only read.">
        <select id="nt-mod" bind:value={target}>{#each mods as m (m.id)}<option value={m.id}>{m.name} {m.version} ({m.texts} texts)</option>{/each}</select>
      </Field>
      <Field label="Language code" for="nt-code" help="Short and lowercase, as in the file names: de, fr, es, pt_br, ru, zh. The new mod's id is the mod's id and this code.">
        <input id="nt-code" type="text" class="mono" bind:value={language} style="width:120px" />
      </Field>
      <Field label="Language" for="nt-name" help="The language's name, for the mod's name in the launcher (e.g. Deutsch).">
        <input id="nt-name" type="text" bind:value={languageName} style="width:200px" />
      </Field>
    </div>
    {#if chosen && !chosen.dialog}<p class="warn small">{chosen.name} was exported before translatable dialog: names, journal texts and phrases can be translated, its dialog can't until it is exported again with Saga Forge 1.2 or later.</p>{/if}
    {#if chosen && code}<p class="muted small">Creates <span class="mono">{chosen.id}_{code}</span>, "{chosen.name} ({languageName.trim() || code})", and makes it the active mod.</p>{/if}
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}
  {#snippet actions()}
    <button onclick={onCancel}>Cancel</button>
    <button class="primary" onclick={create} disabled={busy || !chosen || !code}>Create translation</button>
  {/snippet}
</Modal>

<style>
  .grid { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 4px 10px; margin: 8px 0; }
  .small { font-size: 12px; }
  .warn { color: var(--warn); }
  .bad { color: var(--bad); }
</style>
