<!-- Copied from Ship Editor (src/renderer/src/Setup.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { InstallInfo, ValidInstall } from '../../shared/api'

  interface Props {
    savedDir: string | null
    savedProblem: string | null
    canCancel: boolean
    onDone: (install: ValidInstall) => void
    onCancel: () => void
  }
  let { savedDir, savedProblem, canCancel, onDone, onCancel }: Props = $props()

  // Start from the saved folder; after that the text box is the user's to edit.
  let dir = $state(untrack(() => savedDir) ?? '')
  let check = $state<InstallInfo | null>(null)
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function validate(value: string) {
    if (!value.trim()) { check = null; return }
    check = await window.api.checkInstall(value)
  }

  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(() => validate(dir), 250)
  }

  async function browse() {
    const picked = await window.api.pickFolder(dir || null)
    if (picked) { dir = picked; await validate(picked) }
  }

  async function save() {
    busy = true
    try {
      const info = await window.api.setInstall(dir)
      check = info
      if (info.ok) onDone(info)
    } finally {
      busy = false
    }
  }

  $effect(() => { if (savedDir) validate(savedDir) })
</script>

<div class="wrap">
  <div class="card">
    <h1><span style="color:var(--accent)">◆</span> Saga Forge</h1>
    <p class="muted">
      Choose the folder where Starsector is installed. The editor reads game data and mods from it.
      It never writes into this folder.
    </p>

    {#if savedProblem}
      <div class="alert">The saved folder <span class="mono">{savedDir}</span> can't be used: {savedProblem}</div>
    {/if}

    <label for="dir">Starsector folder</label>
    <div class="row">
      <input id="dir" type="text" class="mono" bind:value={dir} oninput={onInput}
        placeholder="e.g. C:\Program Files (x86)\Fractal Softworks\Starsector  or  ~/starsector" />
      <button onclick={browse}>Browse…</button>
    </div>

    <div class="status">
      {#if check?.ok}
        <div class="ok">✓ Found game data in <span class="mono">{check.coreDir}</span></div>
        <div class="muted">{check.modsDir ? `Mods folder: ${check.modsDir}` : 'No mods folder found (that is fine).'}</div>
      {:else if check}
        <div class="bad">{check.error}</div>
      {:else}
        <div class="muted">Windows: the folder with <span class="mono">starsector.exe</span>.
          Linux: the folder with <span class="mono">starsector.sh</span>.</div>
      {/if}
    </div>

    <div class="actions">
      {#if canCancel}<button onclick={onCancel}>Cancel</button>{/if}
      <button class="primary" disabled={!check?.ok || busy} onclick={save}>Continue</button>
    </div>
  </div>
</div>

<style>
  .wrap { display: grid; place-items: center; height: 100%; padding: 24px; }
  .card { width: min(680px, 100%); background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 28px 32px; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
  label { display: block; margin: 20px 0 6px; font-weight: 600; }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; }
  .status { min-height: 44px; margin-top: 10px; }
  .ok { color: var(--good); }
  .bad { color: var(--bad); }
  .alert { margin-top: 16px; padding: 10px 12px; border: 1px solid #6b4a1f; background: #2b2216; border-radius: 4px; color: var(--warn); word-break: break-all; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
