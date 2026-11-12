<script lang="ts">
  /** The app window: header with pages and the active mod, the page, footer, dialogs. */
  import { onMount } from 'svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import CreateModForm from './CreateModForm.svelte'
  import Modal from './ui/Modal.svelte'
  import { app, PAGES, cleanError, type PageId } from './state/app.svelte'
  import { project } from './state/project.svelte'
  import { problems } from './state/problems.svelte'
  import SagaPage from './pages/SagaPage.svelte'
  import FactionsPage from './pages/FactionsPage.svelte'
  import PeoplePage from './pages/PeoplePage.svelte'
  import ItemsPage from './pages/ItemsPage.svelte'
  import QuestsPage from './pages/QuestsPage.svelte'
  import LocationsPage from './pages/LocationsPage.svelte'
  import EncountersPage from './pages/EncountersPage.svelte'
  import DialogPage from './pages/DialogPage.svelte'
  import ProblemsPage from './pages/ProblemsPage.svelte'
  import ExportDialog from './export/ExportDialog.svelte'

  interface Props { onChangeFolder: () => void }
  let { onChangeFolder }: Props = $props()

  let showSettings = $state(false)
  let showNewMod = $state(false)
  let showExport = $state(false)
  let prefixInput = $state('')
  let loadingIndex = $state(true)

  const index = $derived(app.index)
  const mine = $derived(index?.sources.filter((s) => s.writable) ?? [])
  const active = $derived(index?.sources.find((s) => s.id === index.activeSourceId) ?? null)
  const counts = $derived(problems.counts)

  async function refreshIndex(reload = false) {
    loadingIndex = true
    try {
      app.index = await window.api.getIndex(reload)
      if (reload) app.resetGameData()
      await project.load()
    } catch (e) {
      app.error = cleanError(e)
    } finally {
      loadingIndex = false
    }
  }

  async function pickActive(dir: string) {
    if (project.dirty && !confirm('You have unsaved changes in this mod. Switch anyway and lose them?')) return
    try {
      app.index = await window.api.setActiveMod(dir || null)
      await project.load()
    } catch (e) { app.error = cleanError(e) }
  }

  function suggestPrefix(id: string): string {
    const parts = id.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    const p = parts.length > 1 ? parts.map((x) => x[0]).join('') : (parts[0] ?? 'my').slice(0, 3)
    return p + '_'
  }

  async function setPrefix() {
    const p = prefixInput.trim()
    if (!/^[a-z][a-z0-9]{1,7}_$/.test(p)) { app.error = 'Use 2–8 lowercase letters or digits, starting with a letter, then "_" (for example vgc_).'; return }
    project.change((m) => { m.project.prefix = p })
    await project.save()
  }

  $effect(() => {
    if (project.loaded?.isNew && project.m && !project.prefix && !prefixInput) prefixInput = suggestPrefix(project.loaded.modInfo.id)
  })

  $effect(() => { window.api.setDirty(project.dirty) })

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); project.save(); return }
    if (typing) return
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); project.undo() }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); project.redo() }
  }

  const PAGE_COMPONENTS: Record<PageId, typeof SagaPage> = {
    saga: SagaPage, factions: FactionsPage, people: PeoplePage, items: ItemsPage, quests: QuestsPage,
    locations: LocationsPage, encounters: EncountersPage, dialog: DialogPage, problems: ProblemsPage
  }
  const Page = $derived(PAGE_COMPONENTS[app.page] ?? FactionsPage)

  onMount(async () => {
    await refreshIndex(false)
    if (app.smoke) {
      const [want, arg, arg2] = app.smoke.split(':') as [PageId, string?, string?]
      if (arg2) app.smokeArg = arg2
      if (PAGES.some((p) => p.id === want)) app.go(want, arg ?? null)
      setTimeout(() => window.api.smokeReady({ page: app.page, sources: app.index?.sources.length, factions: app.index?.factions.length, mod: project.loaded?.modInfo.id ?? null }), 4500)
    }
  })
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header>
    <span class="title"><span class="logo">◆</span> Saga Forge</span>
    <div class="pages">
      {#each PAGES as p (p.id)}
        <button class:on={app.page === p.id} onclick={() => app.go(p.id)}>
          {p.label}
          {#if p.id === 'problems' && counts.error}<span class="count">{counts.error}</span>{:else if p.id === 'problems' && counts.warning}<span class="count w">{counts.warning}</span>{/if}
        </button>
      {/each}
    </div>
    <span class="spacer"></span>
    <span class="activemod">
      Active mod
      <select value={active?.writeDir ?? ''} onchange={(e) => pickActive(e.currentTarget.value)} disabled={loadingIndex}>
        <option value="">(none: read only)</option>
        {#each mine as s (s.writeDir)}
          <option value={s.writeDir}>{s.name}{s.id === active?.id && project.prefix ? ` (${project.prefix})` : ''} — {s.folder}</option>
        {/each}
      </select>
      <button title="Create a new mod in your mods folder" onclick={() => (showNewMod = true)}>+ New mod</button>
    </span>
    <span class="sep"></span>
    <button onclick={() => project.save()} disabled={!project.dirty || project.saving} title="Save plans and faction files (Ctrl+S)">{project.dirty ? '● ' : ''}Save</button>
    <button onclick={() => problems.checkMod()} disabled={!project.m} title="Compare the whole mod with the game and every installed mod">Check mod</button>
    <button class="primary" onclick={() => (showExport = true)} disabled={!project.m}>Export…</button>
    <button title="Settings" onclick={() => (showSettings = true)}>⚙</button>
  </header>

  <main>
    {#if loadingIndex && !index}
      <div class="center muted">Reading the game and every installed mod…</div>
    {:else if index}
      <Page />
    {/if}
  </main>

  <footer>
    {#if project.loaded}
      <span>{project.loaded.modInfo.name} · {project.m?.factions.length ?? 0} factions · {project.m?.quests.length ?? 0} quests · {project.m?.people.length ?? 0} people</span>
    {:else}
      <span class="muted">No active mod: everything is read-only. Pick or create a mod in the header.</span>
    {/if}
    {#if app.notice}<span class="good">{app.notice}</span>{/if}
    <span class="spacer"></span>
    {#if index}<span class="muted">Starsector {index.install.gameVersion ?? '?'} · {index.sources.length - 1} mods indexed · {index.stats.ms} ms</span>{/if}
  </footer>
</div>

{#if app.error}
  <div class="toast bad" role="alert">
    <pre>{app.error}</pre>
    <button onclick={() => (app.error = null)}>Close</button>
  </div>
{/if}

{#if showSettings && index && app.definitions}
  <SettingsDialog {index} definitions={app.definitions} onIndex={(i) => { app.index = i; app.resetGameData(); project.load() }}
    onChangeGameFolder={() => { showSettings = false; onChangeFolder() }} onClose={() => (showSettings = false)} />
{/if}

{#if showNewMod}
  <Modal title="New mod" onClose={() => (showNewMod = false)}>
    <p class="muted">Creates a folder with a <span class="mono">mod_info.json</span> in your mods folder ({index?.modsRoot ?? 'not set: choose one in Settings'}) and makes it the active mod. Link it into the game's mods folder yourself to play it.</p>
    <CreateModForm onCreated={async (i) => { app.index = i; showNewMod = false; await project.load() }} />
  </Modal>
{/if}

{#if project.loaded?.isNew && project.m && !project.prefix}
  <Modal title="Id prefix for {project.loaded.modInfo.name}" onClose={() => {}}>
    <p>Every id Saga Forge creates in this mod starts with a prefix, as the Starsector community expects (faction <span class="mono">{prefixInput}faction</span>, quest <span class="mono">{prefixInput}lost_convoy</span>, …). It is set once and should never change after the mod is released.</p>
    <div class="row"><input type="text" class="mono" bind:value={prefixInput} aria-label="Prefix" /><button class="primary" onclick={setPrefix}>Use this prefix</button></div>
    <p class="muted small">This creates <span class="mono">sagaforge/project.json</span> in the mod. The game ignores that folder.</p>
  </Modal>
{/if}

{#if showExport && project.m}
  <ExportDialog onClose={() => (showExport = false)} />
{/if}

<style>
  .app { height: 100%; display: grid; grid-template-rows: 44px 1fr 26px; }
  header { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--panel); border-bottom: 1px solid var(--border); min-width: 0; }
  header button { padding: 4px 10px; }
  .title { font-weight: 600; white-space: nowrap; margin-right: 6px; }
  .logo { color: var(--accent); }
  .pages { display: flex; }
  .pages button { border-radius: 0; margin-left: -1px; padding: 4px 11px; }
  .pages button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .pages button:last-child { border-radius: 0 4px 4px 0; }
  .pages button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .count { background: var(--bad); color: #fff; border-radius: 8px; padding: 0 5px; font-size: 11px; margin-left: 4px; }
  .count.w { background: var(--warn); color: #000; }
  .spacer { flex: 1; }
  .activemod { display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
  .activemod select { max-width: 280px; padding: 3px 6px; }
  .sep { width: 1px; height: 20px; background: var(--border); margin: 0 4px; }
  main { min-height: 0; min-width: 0; overflow: hidden; }
  footer { display: flex; align-items: center; gap: 14px; padding: 0 12px; background: var(--panel); border-top: 1px solid var(--border); font-size: 12px; white-space: nowrap; overflow: hidden; }
  .center { display: grid; place-items: center; height: 100%; }
  .good { color: var(--good); }
  .toast { position: fixed; right: 16px; bottom: 36px; max-width: 560px; background: #2a1414; border: 1px solid #6b2f2f; border-radius: 6px; padding: 10px 12px; z-index: 100; display: flex; gap: 10px; align-items: flex-start; }
  .toast pre { margin: 0; white-space: pre-wrap; font: inherit; color: var(--bad); flex: 1; }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; }
  .small { font-size: 12px; }
</style>
