<script lang="ts">
  /** Export (PLAN.md §6 rule 9, mock-up export.html): every file and its state before anything is written. */
  import { onMount } from 'svelte'
  import Modal from '../ui/Modal.svelte'
  import { planExport, type ExportPlan, type ExportOptions } from '../../../shared/export'
  import { app, cleanError } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import { makeSnapshot, lastRelease, releaseFile } from '../../../shared/release'

  interface Props { onClose: () => void }
  let { onClose }: Props = $props()

  let plan = $state.raw<ExportPlan | null>(null)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let addDependency = $state(true)
  let overwrite = $state<string[]>([])
  let detach = $state<string[]>([])
  let diffFor = $state<string | null>(null)
  let done = $state<string[] | null>(null)

  async function compute(dialogOnly = false) {
    error = null
    try {
      const rules = await app.loadRules()
      const m = project.m!
      const opts: ExportOptions = { dialogOnly, addDependency, overwrite, detach }
      plan = planExport($state.snapshot(m) as typeof m, project.loaded!, app.index!, rules, opts)
    } catch (e) { error = cleanError(e) }
  }

  onMount(async () => {
    if (project.dirty) {
      // Export works from the saved plans, so the files and the plans never disagree
      if (!(await project.save())) { error = 'Save failed, so nothing was exported.'; return }
    }
    await compute()
  })

  const blocking = $derived([...problems.live.filter((p) => p.level === 'error'), ...(plan?.problems.filter((p) => p.level === 'error') ?? [])])
  const warnings = $derived(plan?.problems.filter((p) => p.level !== 'error') ?? [])

  async function run(dialogOnly: boolean) {
    if (!project.loaded) return
    busy = true
    error = null
    try {
      await compute(dialogOnly)
      if (!plan) return
      if (plan.handEdited.some((h) => !overwrite.includes(`${h.path}|${h.key}`) && !detach.includes(`${h.path}|${h.key}`))) { error = 'Some owned blocks were edited by hand: choose Overwrite or Detach for each first.'; return }
      const r = await window.api.writeFiles({ writes: $state.snapshot(plan.writes), backup: true })
      if (r.conflicts.length) { error = `Changed outside Saga Forge since they were read (nothing was written): ${r.conflicts.join(', ')}. Reload the mod and export again.`; return }
      done = r.written
      await project.load()
      app.index = await window.api.getIndex()
      app.resetGameData()
    } catch (e) { error = cleanError(e) } finally { busy = false }
  }
  const STATE: Record<string, string> = { new: 'new', changed: 'changed', same: 'same', removed: 'removed' }

  // ---- releases (PLAN.md §6)
  let releaseVersion = $state(project.loaded?.modInfo.version ?? '1.0.0')
  let released = $state<string | null>(null)
  const lastRel = $derived(project.loaded ? lastRelease(project.loaded.releases) : null)
  async function markReleased() {
    const m = project.m
    const v = releaseVersion.trim()
    if (!m || !v) return
    if (project.loaded?.releases.some((r) => r.version === v) && !confirm(`Version ${v} is already marked as released. Replace its snapshot?`)) return
    const snap = makeSnapshot($state.snapshot(m) as typeof m, v)
    const path = releaseFile(v)
    try {
      const r = await window.api.writeFiles({ writes: [{ path, text: JSON.stringify(snap, null, 2) + '\n', expectedHash: project.loaded?.files[path]?.hash ?? null }], backup: true })
      if (r.conflicts.length) { error = `${path} changed on disk; reload first.`; return }
      released = v
      await project.load()
    } catch (e) { error = cleanError(e) }
  }
</script>

<Modal title="Export" {onClose} width={760}>
  {#if done}
    <p class="good">Exported: {done.length} file{done.length === 1 ? '' : 's'} written{done.length ? '' : ' (everything was up to date)'}. The previous versions are in <span class="mono">sagaforge/backups/</span>.</p>
    <div class="files">{#each done as f (f)}<div>{f}</div>{/each}</div>
    <p class="muted small">Start the game with the mod linked into <span class="mono">Starsector\mods</span> (your own step) to try it.</p>
    <div class="release">
      <b>Mark as released</b> <span class="muted small">— stores every id saves can depend on, so later changes that would break players' saves show as save warnings.</span>
      <div class="row">
        Version <input type="text" class="mono" bind:value={releaseVersion} style="width:110px" />
        <button onclick={markReleased} disabled={!releaseVersion.trim() || released === releaseVersion}>{released === releaseVersion ? 'Marked' : 'Mark as released'}</button>
        {#if lastRel}<span class="muted small">last release: {lastRel.version} ({lastRel.date})</span>{/if}
      </div>
    </div>
  {:else if !plan}
    <p class="muted">{error ?? 'Working out what Export would write…'}</p>
  {:else}
    <p class="muted small">Only the active mod is written. Hand-written rows outside the owned blocks are never touched. Nothing is written until you press Export.</p>
    <div class="files">
      {#each plan.files as f (f.path)}
        <div class="f">
          <span class="tag {f.state}">{f.blocks.length && f.state !== 'same' ? 'block' : STATE[f.state]}</span>
          <span class="path">{f.path}</span>
          <span class="muted">{f.summary}{f.handRows ? ` · ${f.handRows} hand-written row${f.handRows === 1 ? '' : 's'} left as they are` : ''}</span>
        </div>
      {:else}<div class="muted">Nothing to export yet.</div>{/each}
    </div>
    {#each plan.handEdited as h (h.path + h.key)}
      {@const k = `${h.path}|${h.key}`}
      <div class="hand">
        <div><b>{h.key}</b> in <span class="mono">{h.path}</span> was edited by hand since the last export.</div>
        <div class="row">
          <button class="mini" onclick={() => (diffFor = diffFor === k ? null : k)}>Show diff</button>
          <label><input type="radio" name={k} checked={overwrite.includes(k)} onchange={() => { overwrite = [...overwrite.filter((x) => x !== k), k]; detach = detach.filter((x) => x !== k); compute() }} /> Overwrite</label>
          <label><input type="radio" name={k} checked={detach.includes(k)} onchange={() => { detach = [...detach.filter((x) => x !== k), k]; overwrite = overwrite.filter((x) => x !== k); compute() }} /> Detach (it becomes hand-written; Saga Forge stops exporting it)</label>
        </div>
        {#if diffFor === k}<div class="diff"><pre class="old">{h.current}</pre><pre class="new">{h.wanted}</pre></div>{/if}
      </div>
    {/each}
    {#if plan.dependencyMissing}
      <label class="dep"><input type="checkbox" bind:checked={addDependency} onchange={() => compute()} /> Add <b>SagaLib</b> to <span class="mono">mod_info.json</span> dependencies (the export uses its JSON and rule commands)</label>
    {/if}
    {#if blocking.length}
      <div class="bad">Export is blocked by {blocking.length} error{blocking.length === 1 ? '' : 's'}:</div>
      <ul class="probs">{#each blocking.slice(0, 8) as p, i (i)}<li>{p.message}</li>{/each}</ul>
    {/if}
    {#if warnings.length}<ul class="probs warn">{#each warnings.slice(0, 6) as p, i (i)}<li>{p.message}</li>{/each}</ul>{/if}
    {#if error}<div class="bad">{error}</div>{/if}
  {/if}
  {#snippet actions()}
    {#if done}<button class="primary" onclick={onClose}>Close</button>
    {:else}
      <button onclick={onClose}>Cancel</button>
      <button onclick={() => run(true)} disabled={busy || !plan || blocking.length > 0} title="Only the rules.csv blocks (useful while testing conversations)">Export dialog only</button>
      <button class="primary" onclick={() => run(false)} disabled={busy || !plan || blocking.length > 0}>{busy ? 'Exporting…' : 'Export'}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .files { font-family: var(--mono); font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; max-height: 300px; overflow: auto; }
  .f { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 2px 8px; padding: 2px 0; }
  .f .muted { grid-column: 2; font-family: system-ui, sans-serif; font-size: 11px; }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font-size: 10px; text-align: center; border-radius: 8px; border: 1px solid var(--border); align-self: start; }
  .tag.new { color: var(--good); border-color: #2f6b38; } .tag.changed { color: var(--warn); border-color: #6b4a1f; } .tag.same { color: var(--muted); } .tag.removed { color: var(--bad); }
  .hand { border: 1px solid #6b4a1f; background: #2a1f10; border-radius: 6px; padding: 6px 8px; margin-top: 8px; font-size: 12px; }
  .row { display: flex; gap: 12px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
  .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
  .diff pre { margin: 0; font-size: 10px; max-height: 180px; overflow: auto; padding: 4px; border-radius: 4px; white-space: pre-wrap; }
  .diff .old { background: #2a1414; } .diff .new { background: #142a18; }
  .dep { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 12px; }
  .probs { margin: 4px 0; padding-left: 18px; font-size: 12px; color: var(--bad); }
  .probs.warn { color: var(--warn); }
  .good { color: var(--good); } .bad { color: var(--bad); margin-top: 8px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 12px; }
  .release { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-top: 12px; background: #161a20; }
</style>
