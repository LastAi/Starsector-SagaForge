<script lang="ts">
  import TokenOverlay from './tokens/TokenOverlay.svelte'
  /** The app window: header with pages and the active mod, the page, footer, dialogs. */
  import { onMount } from 'svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import CreateModForm from './CreateModForm.svelte'
  import Modal from './ui/Modal.svelte'
  import Field from './ui/Field.svelte'
  import ImagePicker from './ui/ImagePicker.svelte'
  import { picker, chooseImages } from './state/imagepicker.svelte'
  import type { ImageKindId } from '../../shared/imagekinds'
  import { app, images, PAGES, cleanError, type PageId } from './state/app.svelte'
  import { project } from './state/project.svelte'
  import { problems } from './state/problems.svelte'
  import { savedByNewer } from '../../shared/checks/appversions'
  import SagaPage from './pages/SagaPage.svelte'
  import FactionsPage from './pages/FactionsPage.svelte'
  import PeoplePage from './pages/PeoplePage.svelte'
  import ItemsPage from './pages/ItemsPage.svelte'
  import QuestsPage from './pages/QuestsPage.svelte'
  import LocationsPage from './pages/LocationsPage.svelte'
  import EncountersPage from './pages/EncountersPage.svelte'
  import FleetsPage from './pages/FleetsPage.svelte'
  import ImagesPage from './pages/ImagesPage.svelte'
  import DialogPage from './pages/DialogPage.svelte'
  import ProblemsPage from './pages/ProblemsPage.svelte'
  import TranslationPage from './pages/TranslationPage.svelte'
  import NewTranslation from './export/NewTranslation.svelte'
  import { translationOf } from '../../shared/translate'
  import ExportDialog from './export/ExportDialog.svelte'
  import { chooseTarget, syncTarget, versionInfo, replacing, type Slot } from './state/versions.svelte'
  import VersionReplace from './ui/VersionReplace.svelte'
  import MigrationDialog from './export/MigrationDialog.svelte'
  import { needsMigration } from '../../shared/migration'
  import { mods, openModsTab } from './state/mods.svelte'

  interface Props { onChangeFolder: () => void }
  let { onChangeFolder }: Props = $props()

  let showSettings = $state(false)
  let showNewMod = $state(false)
  // #67 U1: the active-mod list's entries that open the New mod / New translation dialogs
  const NEW_MOD = '__sf_new_mod'
  const NEW_TR = '__sf_new_translation'
  let showNewTranslation = $state(false)
  let showExport = $state(false)
  let prefixInput = $state('')
  let loadingIndex = $state(true)

  const index = $derived(app.index)
  const mine = $derived(index?.sources.filter((s) => s.writable) ?? [])
  const active = $derived(index?.sources.find((s) => s.id === index.activeSourceId) ?? null)
  const counts = $derived(problems.counts)
  // #47: the target pill, only with two installs (D7)
  const vinfo = $derived(versionInfo(app.versions))
  let showMigration = $state(app.smokeModal === 'migration')
  // made with a newer Saga Forge: say so above every page (Problems has it too)
  const newerApp = $derived(project.m ? savedByNewer(project.m) : null)
  const migrate = $derived(!!project.loaded && needsMigration(project.loaded.modInfo.gameVersion, index?.install.gameVersion))
  // R29: the mod's word list goes to the spellchecker; "Add to the mod's word list" adds to it
  $effect(() => { const w = project.m?.project.words; if (w?.length) window.api.addSpellWords([...w]) })
  onMount(() => window.api.onSpellAdd((word) => {
    if (!project.m || project.m.project.words?.includes(word)) return
    project.change((mm) => { mm.project.words = [...(mm.project.words ?? []), word].sort() })
    app.flash(`"${word}" is in the mod's word list (sagaforge/project.json).`)
  }))
  // with two installs, read the other one's index and both rule sets for the comparison (P2)
  $effect(() => {
    if (!vinfo || !app.index || app.otherIndex) return
    app.loadOther().catch((e) => (app.error = cleanError(e)))
    app.loadRules().catch(() => {})
  })

  async function refreshIndex(reload = false) {
    loadingIndex = true
    try {
      app.index = await window.api.getIndex(reload)
      if (reload) app.resetGameData()
      await project.load()
      await syncTarget()
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
      await syncTarget()
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
    if (project.loaded?.isNew && project.m && !project.prefix && !prefixInput && !trMod) prefixInput = suggestPrefix(project.loaded.modInfo.id)
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
    locations: LocationsPage, encounters: EncountersPage, fleets: FleetsPage, images: ImagesPage, dialog: DialogPage, problems: ProblemsPage,
    translation: TranslationPage
  }
  // R31: a translation mod has one page, its translation
  const trMod = $derived(project.loaded ? translationOf(project.loaded.files['data/config/sagaforge/content.csv']?.text, project.loaded.modInfo.id) : null)
  const pages = $derived(trMod ? [{ id: 'translation' as PageId, label: 'Translation' }] : PAGES.filter((p) => p.id !== 'translation'))
  const Page = $derived(trMod ? TranslationPage : app.page === 'translation' ? SagaPage : PAGE_COMPONENTS[app.page] ?? FactionsPage)

  // #67 U33: image and font lookups prefer the sources this mod counts; pictures already loaded may change
  let visKey = ''
  $effect(() => {
    const ids = [...mods.visible].sort()
    const k = ids.join(","), first = !visKey
    if (k === visKey) return
    visKey = k
    window.api.setVisibleSources(ids).then(() => { if (!first) images.refresh() })
  })
  onMount(async () => {
    await refreshIndex(false)
    if (app.smoke) {
      const [want, arg, arg2] = app.smoke.split(':') as [PageId, string?, string?]
      if (arg2) app.smokeArg = arg2
      // an id with ":" in it (a name list, "@people:sfw_cats") is written with "~"
      if (PAGES.some((p) => p.id === want)) app.go(want, arg ? arg.replace(/~/g, ':') : null)
      // dialogs of the shell itself
      if (app.smokeModal === 'newmod') showNewMod = true
      if (app.smokeModal === 'export' && project.m) showExport = true
      if (app.smokeModal === 'settings') showSettings = true
      if (app.smokeModal?.startsWith('pick=')) setTimeout(() => chooseImages(app.smokeModal!.slice(5) as ImageKindId, { multi: true }), 300)
      setTimeout(() => window.api.smokeReady({ page: app.page, sources: app.index?.sources.length, factions: app.index?.factions.length, mod: project.loaded?.modInfo.id ?? null }), 4500)
    }
  })
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header>
    <span class="title"><span class="logo">◆</span> Saga Forge</span>
    <div class="pages">
      {#each pages as p (p.id)}
        <button class:on={app.page === p.id} onclick={() => app.go(p.id)}>
          {p.label}
          {#if p.id === 'problems' && counts.error}<span class="count">{counts.error}</span>{/if}{#if p.id === 'problems' && counts.todo}<span class="count t" title="To do (Set later)">✎{counts.todo}</span>{/if}{#if p.id === 'problems' && !counts.error && counts.warning}<span class="count w">{counts.warning}</span>{/if}
        </button>
      {/each}
    </div>
    <span class="spacer"></span>
    <span class="activemod">
      <span class="am-label">Active mod</span>
      <!-- #67 U1: "+ New mod" and "+ Translation" are the list's last entries (the header had no room) -->
      <!-- #67 U48 (user, 2026-11-24): locked while there are unsaved changes, until Save or Discard -->
      <select value={active?.writeDir ?? ''} disabled={loadingIndex || project.dirty}
        title={project.dirty ? 'Save or Discard your changes first: the active mod cannot change while this one has unsaved changes.' : 'The mod you edit. Its last entries create a new mod or a translation of an installed Saga Forge mod.'}
        onchange={(e) => {
          const v = e.currentTarget.value
          if (v === NEW_MOD || v === NEW_TR) { e.currentTarget.value = active?.writeDir ?? ''; if (v === NEW_MOD) showNewMod = true; else showNewTranslation = true; return }
          // a switch that doesn't happen (cancelled) leaves the list showing the mod that is really active
          e.currentTarget.value = active?.writeDir ?? ''
          pickActive(v)
        }}>
        <option value="">(none: read only)</option>
        {#each mine as s (s.writeDir)}
          <option value={s.writeDir}>{s.name}{s.id === active?.id && project.prefix ? ` (${project.prefix})` : ''} — {s.folder}</option>
        {/each}
        <option disabled>──────────</option>
        <option value={NEW_MOD}>+ New mod…</option>
        <option value={NEW_TR}>+ New translation of an installed mod…</option>
      </select>
    </span>
    {#if vinfo && app.versions}
      <!-- #47: which game version the active mod targets -->
      <span class="am-label">Target</span>
      <select class="target" class:older={!vinfo.targetIsNewer} value={app.versions.target} disabled={loadingIndex || !project.loaded}
        title="The game version this mod targets ({vinfo.targetIsNewer ? 'the newer install' : 'the older install'}): its game data, other mods and Export follow it. Remembered per mod."
        onchange={(e) => { const s = e.currentTarget.value as Slot; e.currentTarget.value = app.versions!.target; chooseTarget(s) }}>
        <option value={vinfo.newerSlot}>{app.versions[vinfo.newerSlot]?.version}</option>
        <option value={vinfo.olderSlot}>{app.versions[vinfo.olderSlot]?.version}</option>
      </select>
    {/if}
    {#if project.m && !trMod}
      <!-- #60 (PLAN.md §10.1, §10.7 q2): the mod's list of other mods; opens Saga › Mods -->
      {@const listed = (project.m.project.mods ?? []).filter((x) => x.use !== 'incompatible')}
      {@const bad = (project.m.project.mods ?? []).filter((x) => x.use === 'incompatible')}
      <button class="pill" onclick={openModsTab} title={['The other mods this mod has content for (Saga › Mods). Lists and pickers show vanilla, this mod and these.', ...((project.m.project.mods ?? []).map((x) => `${x.name}: ${x.use}`)), ...(project.m.project.mods?.length ? [] : ['None yet.'])].join('\n')}>Cross Mod Support{#if listed.length}<span class="pill-n">{listed.length}</span>{/if}{#if bad.length}<span class="pill-bad"> · {bad.length} conflict{bad.length === 1 ? '' : 's'}</span>{/if}</button>
    {/if}
    <span class="sep"></span>
    <button onclick={() => project.save()} disabled={!project.dirty || project.saving} title="Save plans and faction files (Ctrl+S)">{project.dirty ? '● ' : ''}Save</button>
    {#if project.dirty}<button onclick={() => project.discard()} disabled={project.saving} title="Throw away the unsaved changes and reload the mod from disk">Discard</button>{/if}
    <button onclick={() => problems.checkMod()} disabled={!project.m} title="Compare the whole mod with the game and every installed mod">Check mod</button>
    <button class="primary" onclick={() => (showExport = true)} disabled={!project.m}>Export…</button>
    <button title="Settings" onclick={() => (showSettings = true)}>⚙</button>
  </header>

  <!-- #47 §7.1: a mod made for an older game version than the target -->
  <div class="bannerslot">
    {#if newerApp}
      <div class="banner">This mod was made with a newer Saga Forge ({newerApp}). Update Saga Forge before you change it: saving with this version could drop what the newer one added.</div>
    {/if}
    {#if migrate}
      <div class="banner">This mod was made for Starsector {project.loaded?.modInfo.gameVersion}; it now targets {index?.install.gameVersion}. <button class="mini" onclick={() => (showMigration = true)}>Open migration</button></div>
    {/if}
  </div>
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

<!-- #67 U44: the "$" autocomplete, the token lookup in screenshot mode -->
<TokenOverlay />

{#if app.asking}
  {@const a = app.asking}
  <Modal title={a.question} onClose={() => a.done(null)}>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" class="askin" autofocus bind:value={a.value} onkeydown={(e) => { if (e.key === 'Enter') a.done(a.value) }} />
    {#snippet actions()}<button onclick={() => a.done(null)}>Cancel</button><button class="primary" onclick={() => a.done(a.value)}>{a.label}</button>{/snippet}
  </Modal>
{/if}

{#if showSettings && index && app.definitions}
  <SettingsDialog {index} definitions={app.definitions} onIndex={async (i) => { app.index = i; app.resetGameData(); await project.load(); await syncTarget() }}
    onChangeGameFolder={() => { showSettings = false; onChangeFolder() }} onClose={() => (showSettings = false)} />
{/if}

{#if showNewMod}
  <Modal title="New mod" onClose={() => (showNewMod = false)}>
    <p class="muted">Creates a folder with a <span class="mono">mod_info.json</span> in your mods folder and makes it the active mod.{#if index?.modsMode !== 'game'}{' '}Link it into the game's mods folder yourself to play it.{/if}</p>
    <CreateModForm onCreated={async (i) => { app.index = i; showNewMod = false; await project.load() }} onCancel={() => (showNewMod = false)}
      modsRoot={index?.modsRoot ?? null} gameMods={index?.install.modsDir ?? null} onIndex={async (i) => { app.index = i; app.resetGameData(); await project.load() }} />
  </Modal>
{/if}

{#if showNewTranslation}
  <NewTranslation onCreated={async (i) => { app.index = i; showNewTranslation = false; await project.load(); app.go('translation') }} onCancel={() => (showNewTranslation = false)} />
{/if}

{#if project.loaded?.isNew && project.m && !project.prefix && !trMod}
  <Modal title="Id prefix for {project.loaded.modInfo.name}" onClose={() => {}}>
    <p>Every id Saga Forge creates in this mod starts with a prefix, as the Starsector community expects (faction <span class="mono">{prefixInput}faction</span>, quest <span class="mono">{prefixInput}lost_convoy</span>, …). It is set once and should never change after the mod is released.</p>
    <div class="pfx">
      <Field label="Prefix" for="pfx-in" help="A few lowercase letters and an underscore, usually from the mod's name (vgc_ for Vanguard Compact). It keeps your ids apart from other mods'.">
        <input id="pfx-in" type="text" class="mono" bind:value={prefixInput} />
      </Field>
      <span></span><div><button class="primary" onclick={setPrefix}>Use this prefix</button></div>
    </div>
    <p class="muted small">This creates <span class="mono">sagaforge/project.json</span> in the mod. The game ignores that folder.</p>
  </Modal>
{/if}

{#if picker.req}
  <ImagePicker />
{/if}
{#if replacing.req}
  <VersionReplace />
{/if}

{#if mods.asking}
  {@const a = mods.asking}
  <!-- #60: picked from a mod that isn't in the list (PLAN.md §10.1: the filter is never a dead end) -->
  <Modal title="{a.name} isn't in this mod's list" onClose={() => a.done(null)}>
    <p>{a.what} comes from <b>{a.name}</b> (<span class="mono">{a.id}</span>). Content that uses another mod needs that mod in Saga › Mods:</p>
    <ul class="small"><li><b>Optional</b>: this mod still loads and plays without it; what uses it gets "Only with {a.name}".</li><li><b>Required</b>: added to <span class="mono">mod_info.json</span> dependencies on export; players must have it.</li></ul>
    {#snippet actions()}<button onclick={() => a.done(null)}>Not now</button><button onclick={() => a.done('required')}>Add as required</button><button class="primary" onclick={() => a.done('optional')}>Add as optional</button>{/snippet}
  </Modal>
{/if}

{#if showExport && project.m}
  <ExportDialog onClose={() => (showExport = false)} />
{/if}
{#if showMigration && project.m && project.loaded}
  <MigrationDialog onClose={() => (showMigration = false)} onExport={() => { showMigration = false; showExport = true }} />
{/if}

<style>
  .app { height: 100%; display: grid; grid-template-rows: 44px auto 1fr 26px; }
  .banner { background: #2a1f10; color: var(--warn); border-bottom: 1px solid #6b4a1f; padding: 4px 12px; font-size: 12px; display: flex; gap: 10px; align-items: center; }
  .banner .mini { padding: 0 8px; font-size: 11px; }
  header { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--panel); border-bottom: 1px solid var(--border); min-width: 0; }
  header button { padding: 4px 10px; white-space: nowrap; }
  .title { font-weight: 600; white-space: nowrap; margin-right: 6px; }
  .logo { color: var(--accent); }
  .pages { display: flex; }
  .pages button { border-radius: 0; margin-left: -1px; padding: 4px 9px; display: inline-flex; align-items: center; }
  .pages button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .pages button:last-child { border-radius: 0 4px 4px 0; }
  .pages button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .count { background: var(--bad); color: #fff; border-radius: 8px; padding: 0 5px; font-size: 11px; margin-left: 4px; }
  .count.w { background: var(--warn); color: #000; }
  .count.t { background: #e8a83c; color: #000; }
  .spacer { flex: 1; }
  /* only the mod list and the target pill shrink (ellipsis); the span never gets narrower than its
     buttons plus a short mod list, so nothing overlaps what follows (seen at 1486 px with two installs) */
  .activemod { display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; min-width: 160px; flex-shrink: 1; }
  .activemod select { max-width: 280px; min-width: 120px; flex: 1 1 auto; text-overflow: ellipsis; padding: 3px 6px; }
  .am-label { font-size: 12px; white-space: nowrap; }
  @media (max-width: 1600px) { .am-label { display: none; } }
  .target { padding: 3px 8px; border-radius: 12px; border-color: var(--accent-2); color: var(--accent); font-size: 12px; max-width: 200px; flex: 0 0 auto; }
  .target.older { border-color: #6b4a1f; color: var(--warn); }
  .pill { padding: 3px 10px; border-radius: 12px; border-color: var(--accent-2); color: var(--accent); font-size: 12px; overflow: hidden; white-space: nowrap; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; }
  .pill-n { font-size: 10px; border-radius: 8px; background: #2a3a4c; padding: 0 5px; color: var(--text, #ddd); }
  .pill-bad { color: var(--bad); }
  .sep { width: 1px; height: 20px; background: var(--border); margin: 0 4px; }
  main { min-height: 0; min-width: 0; overflow: hidden; }
  footer { display: flex; align-items: center; gap: 14px; padding: 0 12px; background: var(--panel); border-top: 1px solid var(--border); font-size: 12px; white-space: nowrap; overflow: hidden; }
  .center { display: grid; place-items: center; height: 100%; }
  .good { color: var(--good); }
  .toast { position: fixed; right: 16px; bottom: 36px; max-width: 560px; background: #2a1414; border: 1px solid #6b2f2f; border-radius: 6px; padding: 10px 12px; z-index: 100; display: flex; gap: 10px; align-items: flex-start; }
  .toast pre { margin: 0; white-space: pre-wrap; font: inherit; color: var(--bad); flex: 1; }
  .askin { width: 420px; max-width: 100%; }
  .pfx { display: grid; grid-template-columns: 60px minmax(0, 1fr); gap: 2px 10px; width: 420px; max-width: 100%; }
  .small { font-size: 12px; }
</style>
