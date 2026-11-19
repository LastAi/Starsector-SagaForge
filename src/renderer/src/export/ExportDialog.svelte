<script lang="ts">
  /** Export (PLAN.md §6 rule 9, mock-up export.html): every file and its state before anything is written. */
  import { modListNotes } from '../../../shared/releasepack'
  import { onMount } from 'svelte'
  import Modal from '../ui/Modal.svelte'
  import Field from '../ui/Field.svelte'
  import { planExport, type ExportPlan, type ExportOptions } from '../../../shared/export'
  import { app, cleanError } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import { makeSnapshot, lastRelease, releaseFile } from '../../../shared/release'
  import { releaseBlockers, inactivePeople, inactiveQuests } from '../../../shared/inactive'
  import { todoLabel } from '../../../shared/todo'
  import { releaseDetailProblems, releaseName, versionFileName } from '../../../shared/releasepack'
  import type { ReleaseDetails } from '../../../shared/model'
  import type { PackResult } from '../../../shared/api'
  import { bountyIdsOf } from '../../../shared/bounties'

  interface Props { onClose: () => void }
  let { onClose }: Props = $props()

  let plan = $state.raw<ExportPlan | null>(null)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let addDependency = $state(true)
  // #60: the mod's required mods (Saga › Mods) into mod_info.json dependencies (asked, one click)
  let addRequired = $state(true)
  let overwrite = $state<string[]>([])
  let detach = $state<string[]>([])
  let diffFor = $state<string | null>(null)
  let done = $state<string[] | null>(null)
  /** The version written to mod_info.json (Export changes it when edited here). */
  let modVersion = $state(project.loaded?.modInfo.version ?? '')
  // R9, R10: to-dos that hold back a release, and what Export leaves out
  const blockers = $derived(project.m ? releaseBlockers(project.m) : [])
  const offPeople = $derived(project.m ? inactivePeople(project.m) : new Set<string>())
  const offQuests = $derived(project.m ? inactiveQuests(project.m) : new Map<string, 'flag' | 'contact'>())
  const versionReleased = $derived(!!project.loaded?.releases.some((r) => r.version === modVersion.trim()))

  async function compute(dialogOnly = false) {
    error = null
    try {
      const rules = await app.loadRules()
      const m = project.m!
      // #47 §6: mod_info.json's gameVersion follows the target install
      const opts: ExportOptions = { dialogOnly, addDependency, addRequired, overwrite, detach, version: modVersion, gameVersion: app.index?.install.gameVersion ?? undefined }
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

  // #27: bounties need MagicLib in the mod's list (optional by default, PLAN.md §10)
  // #27, #59: bounties of the mod, or quests that start or test bounties, use MagicLib
  const magicUnlisted = $derived(!!project.m && (!!project.m.bounties?.length || project.m.quests.some((q) => bountyIdsOf(q).length > 0)) && !(project.m.project.mods ?? []).some((x) => x.id === 'MagicLib'))
  function addMagic(use: 'optional' | 'required') {
    project.change((mm) => { (mm.project.mods ??= []).push({ id: 'MagicLib', name: 'MagicLib', use }) })
    void compute()
  }
  const blocking = $derived([...problems.live.filter((p) => p.level === 'error'), ...(plan?.problems.filter((p) => p.level === 'error') ?? [])])
  const warnings = $derived(plan?.problems.filter((p) => p.level !== 'error') ?? [])

  async function run(dialogOnly: boolean) {
    if (!project.loaded) return
    busy = true
    error = null
    try {
      // Release details edited here are saved first (Export writes the .version file from them)
      if (project.dirty && !(await project.save())) { error = 'Save failed, so nothing was exported.'; return }
      await compute(dialogOnly)
      if (!plan) return
      if (plan.handEdited.some((h) => !overwrite.includes(`${h.path}|${h.key}`) && !detach.includes(`${h.path}|${h.key}`))) { error = 'Some owned blocks were edited by hand: choose Overwrite or Detach for each first.'; return }
      const r = await window.api.writeFiles({ writes: $state.snapshot(plan.writes), backup: true })
      if (r.conflicts.length) { error = `Changed outside Saga Forge since they were read (nothing was written): ${r.conflicts.join(', ')}. Reload the mod and export again.`; return }
      done = r.written
      if (modVersion.trim()) releaseVersion = modVersion.trim()
      await project.load()
      app.index = await window.api.getIndex()
      app.resetGameData()
    } catch (e) { error = cleanError(e) } finally { busy = false }
  }
  const STATE: Record<string, string> = { new: 'new', changed: 'changed', same: 'same', removed: 'removed' }

  // ---- releases (PLAN.md §6)
  let releaseVersion = $state(project.loaded?.modInfo.version || '1.0.0')
  let released = $state<string | null>(null)
  const lastRel = $derived(project.loaded ? lastRelease(project.loaded.releases) : null)
  async function markReleased() {
    const m = project.m
    const v = releaseVersion.trim()
    if (!m || !v) return
    error = null
    packed = null
    // R9: fields marked "Set later" in active content must be filled first
    if (blockers.length) { error = `Not marked as released: ${blockers.length} field${blockers.length === 1 ? '' : 's'} marked "Set later" still to do (${blockers.slice(0, 4).map((t) => `${t.owner} › ${todoLabel(t.path)}`).join('; ')}${blockers.length > 4 ? '; …' : ''}). Fill them in, or remove the mark, or make that content inactive.`; return }
    // R32: the zip holds what was exported, so the exported version must be the one released
    if (pack && project.loaded?.modInfo.version !== v) { error = `The mod was exported as version ${project.loaded?.modInfo.version || '(none)'}, not ${v}. Export again with version ${v} (Mod version, before Export), then mark it as released.`; return }
    if (project.loaded?.releases.some((r) => r.version === v) && !confirm(`Version ${v} is already marked as released. Replace its snapshot${pack ? ' and its zip' : ''}?`)) return
    const snap = makeSnapshot($state.snapshot(m) as typeof m, v)
    const path = releaseFile(v)
    try {
      const r = await window.api.writeFiles({ writes: [{ path, text: JSON.stringify(snap, null, 2) + '\n', expectedHash: project.loaded?.files[path]?.hash ?? null }], backup: true })
      if (r.conflicts.length) { error = `${path} changed on disk; reload first.`; return }
      released = v
      await project.load()
      if (pack) await packZip(v, false)
    } catch (e) { error = cleanError(e) }
  }

  // ---- R32: release zip, Version Checker and forum post draft
  let pack = $state(true)
  let packed = $state.raw<PackResult | null>(null)
  const details = $derived(project.m?.project.release ?? {})
  const detailProblems = $derived(releaseDetailProblems(project.m?.project.release))
  function setDetail<K extends keyof ReleaseDetails>(k: K, v: ReleaseDetails[K]) {
    project.change((mm) => { mm.project.release = { ...(mm.project.release ?? {}), [k]: v } })
  }
  function contents(): string[] {
    const m = project.m
    if (!m) return []
    const n = (x: number, one: string, many: string) => (x ? [`${x} ${x === 1 ? one : many}`] : [])
    return [
      ...n(m.factions.filter((f) => f.kind === 'addition').length, 'faction', 'factions'),
      ...n(m.factions.filter((f) => f.kind === 'override').length, 'change to an existing faction', 'changes to existing factions'),
      ...n(m.quests.filter((q) => q.kind === 'quest' && !offQuests.has(q.id)).length, 'quest', 'quests'),
      ...n(m.people.filter((p) => !offPeople.has(p.id)).length, 'character', 'characters'),
      ...n(m.systems.length, 'star system', 'star systems'),
      ...n(m.items.length, 'item', 'items'),
      ...n(m.encounters.length, 'encounter', 'encounters')
    ]
  }
  async function packZip(v: string, overwrite: boolean) {
    if (!project.loaded) return
    // forum post drafts are off until post templates exist (user, 2026-11-17): shared/releasepack.ts forumPost() stays for then
    // #60: release notes with Requires / Works with / Known conflicts (Saga › Mods)
    const notes = modListNotes(project.m?.project ?? {}, project.loaded.modInfo.dependencies)
    const r = await window.api.packRelease({ version: v, forumPost: '', overwrite, notes: notes ? `${project.loaded.modInfo.name} ${v}\n\n${notes}` : '' })
    if ('exists' in r) {
      if (confirm(`${r.exists} already exists. Replace it?`)) return packZip(v, true)
      error = 'The release is marked; the existing zip was kept.'
      return
    }
    packed = r
  }
</script>

<Modal title="Export" {onClose} width={760}>
  {#if done}
    <p class="good">Exported: {done.length} file{done.length === 1 ? '' : 's'} written{done.length ? '' : ' (everything was up to date)'}. The previous versions are in <span class="mono">sagaforge/backups/</span>.</p>
    {#if done.length}<div class="files">{#each done as f (f)}<div>{f}</div>{/each}</div>{/if}
    <p class="muted small">Start the game with the mod linked into <span class="mono">{app.index?.install.modsDir ?? 'Starsector\\mods'}</span> (your own step) to try it.</p>
    <div class="release">
      <b>Mark as released</b> <span class="muted small">— stores every id saves can depend on, so later changes that would break players' saves show as save warnings.</span>
      <div class="ver">
        <Field label="Version" for="ex-rel" help="The version you are publishing, as in mod_info.json. Mark each version you hand out to players.">
          <span class="row"><input id="ex-rel" type="text" class="mono" bind:value={releaseVersion} style="width:110px" />
            <button onclick={markReleased} disabled={!releaseVersion.trim() || released === releaseVersion}>{released === releaseVersion ? 'Marked' : 'Mark as released'}</button>
            {#if lastRel}<span class="muted small">last release: {lastRel.version} ({lastRel.date})</span>{/if}</span>
        </Field>
      </div>
      <label class="dep"><input type="checkbox" bind:checked={pack} /> Also pack <b class="mono">{releaseName(project.loaded!.modInfo, releaseVersion.trim() || '?')}.zip</b> into the releases folder</label>
      <div class="muted small">The zip holds one folder, ready to unzip into <span class="mono">Starsector/mods</span>, without <span class="mono">sagaforge/</span> (your plans) and the test profiles. Releases folder: <span class="mono">{app.settings.releasesDir}</span> (Settings).</div>
      {#if packed && !('exists' in packed)}
        <div class="good small packed">Packed {packed.files} file{packed.files === 1 ? '' : 's'} into <span class="mono">{packed.zip}</span>{packed.leftOut.length ? ` (left out: ${packed.leftOut.length}, ${[...new Set(packed.leftOut.map((x) => x.why))].join(', ')})` : ''}.
          <button class="mini" onclick={() => window.api.showInFolder(packed && !('exists' in packed) ? packed.zip : '')}>Show in folder</button></div>
      {/if}
      <!-- 8b-3 (user): a refused Mark as released must say why here, not only in the export view -->
      {#if error}<div class="bad" role="alert">{error}</div>{/if}
    </div>
  {:else if !plan}
    <p class="muted">{error ?? 'Working out what Export would write…'}</p>
  {:else}
    <p class="muted small">Only the active mod is written. Hand-written rows outside the owned blocks are never touched. Nothing is written until you press Export.</p>
    {#if blockers.length || offPeople.size || offQuests.size}
      <div class="notes small">
        {#if blockers.length}<div class="todo">✎ {blockers.length} field{blockers.length === 1 ? '' : 's'} marked "Set later" (Problems › To do). Export works for testing; Mark as released waits for them.</div>{/if}
        {#if offPeople.size || offQuests.size}<div class="muted">Not exported, inactive: {[offPeople.size ? `${offPeople.size} ${offPeople.size === 1 ? 'person' : 'people'}` : '', offQuests.size ? `${offQuests.size} quest${offQuests.size === 1 ? '' : 's'} or conversation${offQuests.size === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}. Their files from an earlier export are removed.</div>{/if}
      </div>
    {/if}
    <div class="ver">
      <Field label="Mod version" for="ex-ver" help="The version in mod_info.json, shown in the game's launcher. Raise it for each update you publish (1.0.0 → 1.1.0).">
        <span class="row"><input id="ex-ver" type="text" class="mono" bind:value={modVersion} onchange={() => compute()} style="width:120px" />
          {#if versionReleased && lastRel}<span class="warn small">{modVersion} is already marked as released: raise it if this export is an update.</span>{/if}</span>
      </Field>
    </div>
    <details class="reldet" open={app.smokeArg === 'reldet'}>
      <summary>Release details <span class="muted small">— Version Checker (optional; saved with the mod)</span></summary>
      <div class="ver">
        <Field label="Version file" for="rd-master" help={`Version Checker tells players about updates. Put ${versionFileName(project.loaded!.modInfo.id)} (Export writes it into the mod) online and enter its raw address, e.g. https://raw.githubusercontent.com/you/repo/main/${versionFileName(project.loaded!.modInfo.id)}. Upload it again after each release. Empty: no Version Checker file.`}>
          <input id="rd-master" type="text" class="mono" value={details.masterVersionUrl ?? ''} onchange={(e) => { setDetail('masterVersionUrl', e.currentTarget.value.trim()); compute() }} />
        </Field>
        <Field label="Download" for="rd-dl" help="Direct link to the release zip (e.g. the GitHub release). Version Checker's update button uses it. Host the zip outside the forum: it deletes attachments.">
          <input id="rd-dl" type="text" class="mono" value={details.downloadUrl ?? ''} onchange={(e) => { setDetail('downloadUrl', e.currentTarget.value.trim()); compute() }} />
        </Field>
        <Field label="Forum thread" for="rd-thread" help="The number after topic= in your mod's forum thread (or the thread's address). Version Checker links to it.">
          <input id="rd-thread" type="text" class="mono" value={details.threadId ?? ''} onchange={(e) => { setDetail('threadId', e.currentTarget.value.trim()); compute() }} style="width:260px" />
        </Field>
        <div class="later small">Forum post: coming later. Saga Forge will fill in a post template you make (your own layout and sections). The fields below are kept for it and do nothing yet.</div>
        <Field label="Project page" for="rd-proj" help="Where the mod's source is (e.g. its GitHub page); the forum post links it.">
          <input id="rd-proj" disabled type="text" class="mono" value={details.projectUrl ?? ''} onchange={(e) => setDetail('projectUrl', e.currentTarget.value.trim())} />
        </Field>
        <Field label="Status" for="rd-status" help="Shown after the title in the forum post while the mod isn't final, e.g. [0.98a] My Mod 0.3.0 [Beta].">
          <select id="rd-status" disabled value={details.status ?? ''} onchange={(e) => setDetail('status', e.currentTarget.value as ReleaseDetails['status'])}><option value="">Final</option><option value="Alpha">Alpha</option><option value="Beta">Beta</option></select>
        </Field>
        <Field label="Catch line" for="rd-catch" help="One short sentence under the forum post's title: what the mod is.">
          <input id="rd-catch" disabled type="text" value={details.catchLine ?? ''} onchange={(e) => setDetail('catchLine', e.currentTarget.value)} />
        </Field>
        <Field label="Author note" for="rd-note" help="Your own words for the forum post.">
          <textarea id="rd-note" disabled rows="3" value={details.authorNote ?? ''} onchange={(e) => setDetail('authorNote', e.currentTarget.value)}></textarea>
        </Field>
        <Field label="AI use" for="rd-ai" help="The forum requires it: how and where AI tools were used (one line per kind: Code, Text, Art…, or none). Empty: the draft has the forum's template to fill in.">
          <textarea id="rd-ai" disabled rows="3" value={details.aiUse ?? ''} onchange={(e) => setDetail('aiUse', e.currentTarget.value)}></textarea>
        </Field>
        <Field label="License" for="rd-lic" help="The mod's license, for the forum post (e.g. MIT, or All rights reserved).">
          <input id="rd-lic" disabled type="text" value={details.license ?? ''} onchange={(e) => setDetail('license', e.currentTarget.value)} style="width:260px" />
        </Field>
      </div>
      {#each detailProblems as p (p)}<div class="warn small">{p}</div>{/each}
    </details>
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
    {#if plan.usesSagaLib}
      <!-- R31: dialog as tokens SagaLib fills, so anyone can make a translation mod -->
      <label class="dep" title="With this on, rules.csv holds tokens ($sft-…) and the texts are in data/sagaforge/text.json, where SagaLib reads them (from a translation mod when one is enabled). Off: plain text in rules.csv, and nobody can translate the dialog without copying the mod.">
        <input type="checkbox" checked={project.m?.project.options.translatable !== false}
          onchange={(e) => { const on = e.currentTarget.checked; project.change((mm) => { mm.project.options = { ...mm.project.options, translatable: on ? undefined : false } }); compute() }} />
        Translatable texts: others can translate the mod with a translation mod (SagaLib 1.2)
      </label>
    {/if}
    {#if plan.requiredMissing.length}
      <label class="dep"><input type="checkbox" bind:checked={addRequired} onchange={() => compute()} /> Add the required mods <b>{plan.requiredMissing.map((r) => r.name + (r.minVersion ? ' ' + r.minVersion : '')).join(', ')}</b> to <span class="mono">mod_info.json</span> dependencies (Saga › Mods; the launcher won't enable this mod without them)</label>
    {/if}
    {#if magicUnlisted}
      <!-- #27: a mod with MagicLib bounties uses MagicLib; one click puts it into Saga › Mods (required also writes the dependency) -->
      <div class="dep">The mod has MagicLib bounties or quests that start them, but MagicLib isn't in Saga › Mods. <button class="mini" onclick={() => addMagic('optional')}>Add as optional</button> (suggested: only MagicLib reads the bounty file, and without it a quest sees its bounties as unavailable) <button class="mini" onclick={() => addMagic('required')}>Add as required</button> (adds it to <span class="mono">mod_info.json</span> dependencies)</div>
    {/if}
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
  .ver { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 2px 10px; margin: 6px 0 8px; }
  .ver .row { margin-top: 0; }
  .warn { color: var(--warn); }
  .notes { display: flex; flex-direction: column; gap: 3px; margin: 0 0 8px; }
  .todo { color: #e8a83c; }
  .reldet { margin: 0 0 8px; font-size: 12px; }
  .reldet summary { cursor: pointer; }
  .reldet input[type='text'], .reldet textarea { width: 100%; box-sizing: border-box; }
  .packed { margin-top: 6px; }
  .later { grid-column: 1 / -1; color: var(--muted); margin: 8px 0 2px; font-style: italic; }
  .reldet :disabled { opacity: 0.4; cursor: not-allowed; }
</style>
