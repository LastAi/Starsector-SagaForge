<!-- Copied from Ship Editor (src/renderer/src/SettingsDialog.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts">
  import type { GameIndex, ModsMode, UserDefinitions } from '../../shared/api'
  import { defsFor, knownDefs } from '../../shared/defs'
  import { app } from './state/app.svelte'

  interface Props {
    index: GameIndex
    definitions: UserDefinitions
    onIndex: (index: GameIndex) => void
    onChangeGameFolder: () => void
    onClose: () => void
  }
  let { index, definitions, onIndex, onChangeGameFolder, onClose }: Props = $props()

  let error = $state<string | null>(null)
  let working = $state(false)

  const clean = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const gameMods = $derived(index.install.modsDir)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    error = null
    working = true
    try {
      const r = await fn()
      if (!r.ok) { error = r.error ?? 'That didn\'t work.'; return }
      onIndex(await window.api.getIndex(true))
    } catch (e) {
      error = clean(e)
    } finally {
      working = false
    }
  }

  function setMode(mode: ModsMode) {
    if (mode === index.modsMode) return
    if (mode === 'game' && !confirm(
      `Work directly in ${gameMods}?\n\nThe active mod's files will be changed in place. ` +
      'Other mods are never changed, but you can make any mod in that folder the active mod, including third-party mods.'
    )) return
    run(() => window.api.setModsMode(mode))
  }

  async function chooseWorkspace() {
    const dir = await window.api.pickFolder(index.workspaceDir, 'Choose your mod workspace folder')
    if (dir) run(() => window.api.setWorkspace(dir))
  }

  const mine = $derived(index.sources.filter((s) => s.writable))

  async function setExtension(id: string, on: boolean) {
    error = null
    working = true
    try { app.settings = await window.api.setSetting('extensions', { ...app.settings.extensions, [id]: on }); onIndex(await window.api.getIndex(true)) } catch (e) { error = clean(e) } finally { working = false }
  }
  const ws = $derived(index.modsMode === 'workspace')
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose() }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <h2 id="settings-title">Settings</h2>

    <h3>Starsector folder</h3>
    <div class="row"><span class="mono path">{index.install.root}</span><button onclick={onChangeGameFolder}>Change…</button></div>
    <div class="muted small">Game version {index.install.gameVersion ?? 'unknown'}. The base game (starsector-core) is never changed.</div>

    <h3>Where your mods are</h3>
    <div class="modes" role="radiogroup" aria-label="Where your mods are">
      <label class="mode" class:on={ws}>
        <input type="radio" name="mode" checked={ws} disabled={working} onchange={() => setMode('workspace')} />
        <span>
          <strong>Separate workspace folder</strong>
          <span class="muted small block">Your mods live in their own folder (link them into the game's mods folder to play them). Nothing in the Starsector folder is ever changed.</span>
        </span>
      </label>
      <div class="row indent" class:disabled={!ws}>
        <span class="mono path">{index.workspaceDir ?? 'Not set'}</span>
        <button onclick={chooseWorkspace} disabled={!ws || working}>{index.workspaceDir ? 'Change…' : 'Choose…'}</button>
      </div>

      <label class="mode" class:on={!ws}>
        <input type="radio" name="mode" checked={!ws} disabled={working || !gameMods} onchange={() => setMode('game')} />
        <span>
          <strong>Work directly in the game's mods folder</strong>
          <span class="muted small block"><span class="mono">{gameMods ?? '(no mods folder found)'}</span>. The active mod's files are changed there directly.</span>
        </span>
      </label>
    </div>

    {#if index.modsRoot}
      <div class="muted small">{mine.length} mod{mine.length === 1 ? '' : 's'} available as the active mod.</div>
    {/if}
    {#if error}<div class="bad">{error}</div>{/if}

    <h3>Checks</h3>
    <label class="ext">
      <input type="checkbox" checked={app.settings.styleChecks} onchange={async (e) => (app.settings = await window.api.setSetting('styleChecks', e.currentTarget.checked))} />
      <span><strong>Style checks</strong><span class="muted small block">Vanilla writing conventions (speech in quotes, second-person narration, highlighted numbers and names). Shown as level Style in Problems; they never block Export.</span></span>
    </label>

    <h3>Format definitions</h3>
    <div class="muted small">
      In use: <span class="mono">{defsFor(index.install.gameVersion).gameVersion}</span> for game version
      <span class="mono">{index.install.gameVersion ?? 'unknown'}</span>. Known: <span class="mono">{knownDefs().join(', ')}</span>.
    </div>
    <div class="muted small">
      To adjust them for a new game version or a mod, put .json files in
      <span class="mono">{definitions.dir}</span> and restart the editor (see the README).
    </div>
    {#each definitions.files as f (f.name)}
      <div class="small"><span class="mono">{f.name}</span> {#if f.error}<span class="bad">— {f.error}</span>{:else}<span class="muted">— {f.gameVersion}</span>{/if}</div>
    {/each}

    <h3>Extensions</h3>
    <div class="muted small">Support for other mods' formats (PLAN.md §10). None are built into 1.0 yet.</div>
    {#each index.extensions as x (x.id)}
      <label class="ext">
        <input type="checkbox" checked={x.on} disabled={working || !x.available} onchange={(e) => setExtension(x.id, e.currentTarget.checked)} />
        <span><strong>{x.name}</strong><span class="muted small block">{x.description}{#if !x.available} ({x.reason}){/if}</span></span>
      </label>
    {/each}

    <h3>App data</h3>
    <div class="muted small">
      Settings and definition files are kept in
      <span class="mono">{definitions.dir.replace(/[\\/]definitions$/, '')}</span>.
    </div>

    <div class="actions"><button class="primary" onclick={onClose}>Done</button></div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(600px, calc(100% - 40px)); background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px 24px; }
  h2 { margin: 0 0 6px; font-size: 16px; }
  h3 { margin: 18px 0 8px; font-size: 13px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .indent { margin: 6px 0 12px 26px; }
  .disabled { opacity: 0.45; }
  .path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 5px 8px; }
  .modes { display: flex; flex-direction: column; }
  .mode { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
  .mode.on { border-color: var(--accent-2); background: #172636; }
  .mode input { margin-top: 3px; }
  .block { display: block; margin-top: 2px; }
  .small { font-size: 12px; margin-top: 4px; }
  .bad { color: var(--bad); margin-top: 8px; }
  .actions { display: flex; justify-content: flex-end; margin-top: 20px; }
  .dialog { max-height: calc(100vh - 40px); overflow-y: auto; }
  .ext { display: flex; gap: 10px; align-items: flex-start; margin-top: 6px; cursor: pointer; }
  .ext input { margin-top: 3px; }
</style>
