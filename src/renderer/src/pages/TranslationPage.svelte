<script lang="ts">
  /**
   * Translation (Phase 8c, R31): shown instead of the other pages when the active mod is a
   * translation mod. Every text of the translated mod (read from its installed files, never
   * changed) next to the translation; saved as the translation mod's CSV, which SagaLib applies in
   * game. Stale lines (the original changed since) keep their text until the translator checks them.
   */
  import { onMount } from 'svelte'
  import { app, cleanError } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { mergeTranslation, parseTranslationCsv, translationEntries, translationOf, translationCsv, linesToSave, confirmLine, lineProblems, crossProblems, type MergedLine, type LineState } from '../../../shared/translate'

  const CONTENT = 'data/config/sagaforge/content.csv'
  const tr = $derived(project.loaded ? translationOf(project.loaded.files[CONTENT]?.text, project.loaded.modInfo.id) : null)
  const target = $derived(tr ? app.index?.sources.find((s) => s.id === tr.target) ?? null : null)

  let lines = $state<MergedLine[]>([])
  let loaded = $state(false)
  let error = $state<string | null>(null)
  let dirty = $state(false)
  let saving = $state(false)
  let filter = $state('')
  let show = $state<Record<LineState, boolean>>({ todo: true, stale: true, done: true, gone: true })

  async function load() {
    error = null
    loaded = false
    if (!tr) return
    try {
      const files = await window.api.modTexts(tr.target)
      if (!files) { error = `${tr.target} isn't installed: install the mod you translate (the translation is kept as it is).`; lines = mergeTranslation([], parseTranslationCsv(project.loaded?.files[tr.path]?.text ?? '')); return }
      lines = mergeTranslation(translationEntries(files), parseTranslationCsv(project.loaded?.files[tr.path]?.text ?? ''))
      dirty = false
    } catch (e) { error = cleanError(e) } finally { loaded = true }
  }
  onMount(load)

  const counts = $derived(lines.reduce((c, l) => { c[l.state]++; return c }, { todo: 0, stale: 0, done: 0, gone: 0 } as Record<LineState, number>))
  const cross = $derived(crossProblems(lines))
  const total = $derived(lines.filter((l) => l.state !== 'gone').length)
  const visible = $derived(lines.map((l, i) => ({ l, i })).filter(({ l }) => show[l.state] && (!filter || `${l.context} ${l.original} ${l.translation}`.toLowerCase().includes(filter.toLowerCase()))))

  function edit(i: number, text: string) {
    const l = lines[i]
    lines[i] = { ...l, translation: text, state: l.state === 'stale' ? 'stale' : text.trim() ? 'done' : 'todo' }
    dirty = true
  }
  function confirm(i: number) { lines[i] = confirmLine(lines[i]); dirty = true }
  function copyOriginal(i: number) { edit(i, lines[i].original) }

  async function save() {
    if (!tr || !project.loaded) return
    saving = true
    error = null
    try {
      const r = await window.api.writeFiles({ writes: [{ path: tr.path, text: translationCsv(linesToSave(lines)), expectedHash: project.loaded.files[tr.path]?.hash ?? null }], backup: true })
      if (r.conflicts.length) { error = `${tr.path} changed outside Saga Forge; reload the mod first.`; return }
      await project.load()
      dirty = false
      app.flash(`Saved ${counts.done + counts.stale} of ${total} lines to ${tr.path}.`)
    } catch (e) { error = cleanError(e) } finally { saving = false }
  }
  const STATE_LABEL: Record<LineState, string> = { todo: 'To do', stale: 'Original changed', done: 'Done', gone: 'Gone from the mod' }
</script>

<svelte:window onbeforeunload={(e) => { if (dirty) e.preventDefault() }} />

<div class="page">
  <div class="toolbar">
    {#if tr}
      <b>{project.loaded?.modInfo.name}</b>
      <span class="muted">translates <b>{target?.name ?? tr.target}</b> {target?.version ?? ''} into <b class="mono">{tr.language}</b></span>
      <span class="spacer"></span>
      {#each (['todo', 'stale', 'done', 'gone'] as LineState[]) as s (s)}
        {#if s !== 'gone' || counts.gone}<label class="lv"><input type="checkbox" bind:checked={show[s]} /> {STATE_LABEL[s]} ({counts[s]})</label>{/if}
      {/each}
      <input type="search" placeholder="Search" bind:value={filter} style="width:180px" />
      <button onclick={load} disabled={saving} title="Read the translated mod's texts again (after it was updated)">Reload texts</button>
      <button class="primary" onclick={save} disabled={!dirty || saving}>{dirty ? '● ' : ''}Save translation</button>
    {:else}
      <span class="muted">This mod isn't a translation.</span>
    {/if}
  </div>
  <div class="scroll">
    {#if error}<div class="bad pad">{error}</div>{/if}
    {#if tr && loaded}
      <p class="muted small pad">{counts.done} of {total} texts translated{counts.stale ? `, ${counts.stale} to check (their original changed)` : ''}. Empty lines show the original in game. The file is <span class="mono">{tr.path}</span>; you can also edit it in a spreadsheet (column <i>translation</i>). The game's fonts have no Chinese, Japanese, Korean or Cyrillic letters: those need a font mod as well.</p>
      {#each visible as { l, i } (l.key)}
        {@const probs = [...lineProblems(l), ...(cross.get(l.key) ?? [])]}
        <div class="line {l.state}">
          <div class="ctx"><span class="state">{STATE_LABEL[l.state]}</span> {l.context}</div>
          <div class="orig">{l.original}{#if l.wasOriginal && l.wasOriginal !== l.original}<div class="was"><span class="muted">Was:</span> {l.wasOriginal}</div>{/if}</div>
          <div class="tr">
            <textarea rows={Math.min(8, Math.max(1, Math.ceil(l.original.length / 70) + (l.original.match(/\n/g)?.length ?? 0)))} value={l.translation} disabled={l.state === 'gone'}
              aria-label="Translation of {l.context}" spellcheck="false" oninput={(e) => edit(i, e.currentTarget.value)}></textarea>
            <div class="acts">
              {#if l.state === 'stale'}<button class="mini" onclick={() => confirm(i)} title="The translation fits the new original">Checked</button>{/if}
              {#if !l.translation && l.state !== 'gone'}<button class="mini" onclick={() => copyOriginal(i)} title="Start from the original (names that stay the same)">Copy original</button>{/if}
            </div>
            {#each probs as p (p)}<div class="warn small">{p}</div>{/each}
          </div>
        </div>
      {:else}
        <div class="muted pad">Nothing to show.</div>
      {/each}
    {:else if tr}
      <div class="muted pad">Reading {tr.target}'s texts…</div>
    {/if}
  </div>
</div>

<style>
  .page { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; flex-wrap: wrap; }
  .lv { display: flex; align-items: center; gap: 4px; }
  .spacer { flex: 1; }
  .scroll { overflow: auto; }
  .pad { padding: 8px 12px; margin: 0; }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 12px; padding: 6px 12px; border-bottom: 1px solid #1e242c; font-size: 12px; }
  .ctx { grid-column: 1 / -1; color: var(--muted); font-size: 11px; }
  .state { display: inline-block; min-width: 92px; font-weight: 600; }
  .line.todo .state { color: #e8a83c; } .line.stale .state { color: var(--warn); } .line.done .state { color: var(--good); } .line.gone .state { color: var(--muted); }
  .orig { white-space: pre-wrap; }
  .was { margin-top: 4px; white-space: pre-wrap; opacity: 0.8; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; resize: vertical; }
  .acts { display: flex; gap: 6px; margin-top: 2px; }
  .mini { padding: 1px 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .warn { color: var(--warn); }
  .bad { color: var(--bad); }
</style>
