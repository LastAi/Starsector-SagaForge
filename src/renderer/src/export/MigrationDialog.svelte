<script lang="ts">
  /**
   * #47 P5 (TARGET-VERSION-ASSESSMENT.md §7): move the active mod to the game version it targets.
   * Step 0 a snapshot; then what must change, what to check, and what is new; safe fixes in one
   * undo step; an in-game test list.
   */
  import Modal from '../ui/Modal.svelte'
  import { app, cleanError } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { versions, versionInfo } from '../state/versions.svelte'
  import { applyProblemFix } from '../state/problems.svelte'
  import { defsFor } from '../../../shared/defs'
  import { handRules } from '../../../shared/export/blocks'
  import { defsOnlyDiff, migrationReport, migrationTests, movePlayerPortraits, type MigrationItem } from '../../../shared/migration'
  import { versionFamily } from '../../../shared/version'

  interface Props { onClose: () => void; onExport: () => void }
  let { onClose, onExport }: Props = $props()

  const loaded = $derived(project.loaded!)
  const target = $derived(app.index?.install.gameVersion ?? app.defs.gameVersion)
  const from = $derived(loaded.modInfo.gameVersion)
  const fam = $derived(versionFamily(target))
  const twoInstalls = $derived(!!versionInfo(app.versions)?.targetIsNewer && !!versions.diff)
  const diff = $derived(twoInstalls ? versions.diff! : defsOnlyDiff(defsFor(from), app.defs, from, target))
  const items = $derived.by((): MigrationItem[] => {
    const m = project.m
    if (!m || !app.index) return []
    const handIds = handRules(loaded.files['data/campaign/rules.csv']?.text, loaded.sourceId).map((r) => r.id)
    return migrationReport({ model: m, modInfo: loaded.modInfo, handRuleIds: handIds, diff, target, targetDefs: app.defs, targetIndex: app.index })
  })
  const reviewed = $derived(project.m?.project.reviewed ?? {})
  const must = $derived(items.filter((i) => i.group === 'must'))
  const check = $derived(items.filter((i) => i.group === 'check'))
  const fresh = $derived(items.filter((i) => i.group === 'new'))
  const checkLeft = $derived(check.filter((i) => !(i.key in reviewed)).length)
  // the gameVersion line is settled by the Export itself
  const blocking = $derived(must.filter((i) => i.key !== 'must:gameVersion').length)
  const safe = $derived(must.filter((i) => i.fix?.safe))
  let snapshot = $state<string | null>(null)
  let showNew = $state(false)

  async function takeSnapshot() {
    try { snapshot = await window.api.snapshotMod(versionFamily(from) || 'before migration'); app.flash(`Snapshot saved in ${snapshot}.`) } catch (e) { app.error = cleanError(e) }
  }
  function runFix(i: MigrationItem) {
    if (!i.fix) return
    if (i.fix.action === 'migPlayerPortraits') { let n = 0; project.change((m) => { n = movePlayerPortraits(m) }); app.flash(`Moved ${n} portrait${n === 1 ? '' : 's'} to the new player lists.`) }
    else if (i.fix.action === 'migExport') onExport()
  }
  function applySafe() {
    const list = safe
    if (!list.length) return
    const done: string[] = []
    // one undo step for all of them (§7.4)
    project.change((m) => { for (const i of list) if (i.fix?.action === 'migPlayerPortraits') { const n = movePlayerPortraits(m); if (n) done.push(`${n} player portraits moved`) } })
    app.flash(`Applied: ${done.join('; ') || 'nothing to change'}. One undo (Ctrl+Z) takes it all back.`)
  }
  function toggleReviewed(key: string, on: boolean) {
    project.change((m) => { const r = (m.project.reviewed ??= {}); if (on) r[key] = new Date().toISOString().slice(0, 10); else delete r[key]; if (!Object.keys(r).length) delete m.project.reviewed })
  }
  const tests = $derived(migrationTests(items, fam))
</script>

<Modal title="Move {loaded.modInfo.name} to Starsector {fam}" width={860} {onClose}>
  <p class="muted small">This mod was made for {from || 'an unknown version'}; it now targets {target}. {twoInstalls ? 'Both installs are compared (game data, rules and definitions).' : 'Only the built-in definitions of both versions are compared: add the old install as the migration install (Settings) for a full check.'}</p>

  <div class="step">
    <b>0. Snapshot</b>
    <span class="small">{snapshot ? `Saved: ${snapshot}` : `Keeps a copy of the mod as it is now (for a ${versionFamily(from)} hotfix later), in sagaforge/backups. Never deleted automatically.`}</span>
    <button class="mini" onclick={takeSnapshot} disabled={!!snapshot}>Save a {versionFamily(from) || 'pre-migration'} snapshot</button>
  </div>

  <div class="progress">
    <span class:bad={blocking > 0} class:good={blocking === 0}>Must change: {blocking} left{#if must.length > blocking}{' '}(the game version is done by the export){/if}</span> ·
    <span class:warn={checkLeft > 0}>Check: {checkLeft} to review</span>
    <span class="spacer"></span>
    {#if safe.length}<button onclick={applySafe}>Apply all safe fixes ({safe.length})</button>{/if}
    <button class="primary" disabled={blocking > 0} onclick={onExport} title={blocking ? 'Fix everything under "Must change" first' : ''}>Export for {fam}…</button>
  </div>

  <h3>1. Must change</h3>
  {#each must as i (i.key)}
    <div class="item must">
      <div class="t">{i.title}</div>
      <div class="d small">{i.detail}</div>
      <div class="acts">
        {#if i.fix}<button class="mini" onclick={() => runFix(i)}>{i.fix.label}</button>{/if}
        {#each i.problem?.fixes ?? [] as f (f.label)}<button class="mini" onclick={() => applyProblemFix(f.action, f.arg)}>{f.label}</button>{/each}
        {#if i.ref}<button class="mini" onclick={() => { app.go(i.ref!.page as typeof app.page, i.ref!.id ?? null); onClose() }}>Open</button>{/if}
      </div>
    </div>
  {:else}<div class="muted small">Nothing: the mod uses nothing {fam} lacks.</div>{/each}

  <h3>2. Check (behaviour that changed where the mod uses it)</h3>
  {#each check as i (i.key)}
    <div class="item" class:done={i.key in reviewed}>
      <label class="rev"><input type="checkbox" checked={i.key in reviewed} onchange={(e) => toggleReviewed(i.key, e.currentTarget.checked)} /> Reviewed</label>
      <div class="t">{i.title}</div>
      <div class="d small">{i.detail}</div>
    </div>
  {:else}<div class="muted small">Nothing to review.</div>{/each}

  <h3><button class="linkish" onclick={() => (showNew = !showNew)}>{showNew ? '▾' : '▸'} 3. New in {fam} (optional)</button></h3>
  {#if showNew}
    {#each fresh as i (i.key)}<div class="item"><div class="t">{i.title}</div><div class="d small mono">{i.detail}</div></div>{:else}<div class="muted small">Nothing listed.</div>{/each}
  {/if}

  <h3>After the export: test in game</h3>
  <ul class="small">{#each tests as t (t)}<li>{t}</li>{/each}</ul>
  <button class="mini" onclick={() => navigator.clipboard.writeText(tests.map((t) => `- ${t}`).join('\n')).then(() => app.flash('Copied the test list.'))}>Copy the list</button>
  {#if app.versions?.modsMode === 'game' && app.versions.migration}
    <p class="warn small">Your mods are in the game's mods folder: to play it in the other install, copy or link the mod's folder into that install's mods folder yourself (Saga Forge never writes into an install).</p>
  {/if}
  {#snippet actions()}<button onclick={onClose}>Close</button>{/snippet}
</Modal>

<style>
  h3 { font-size: 13px; margin: 14px 0 6px; }
  .step { display: flex; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; }
  .step .small { flex: 1; color: var(--muted); }
  .progress { display: flex; gap: 8px; align-items: center; margin: 10px 0; font-size: 13px; }
  .spacer { flex: 1; }
  .item { border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; background: #161a20; }
  .item.must { border-color: #6b2f2f; }
  .item.done { opacity: .55; }
  .t { font-size: 13px; }
  .d { color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
  .acts { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
  .rev { float: right; font-size: 12px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 12px; }
  .bad { color: var(--bad); } .good { color: var(--good); } .warn { color: var(--warn); }
  .linkish { border: none; background: none; padding: 0; color: var(--text); font-size: 13px; font-weight: 600; }
</style>
