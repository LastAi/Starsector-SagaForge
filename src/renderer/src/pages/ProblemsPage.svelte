<script lang="ts">
  /** Problems (PLAN.md §6, mock-up problems.html): live problems, Check mod results, fixes, ignore with a reason. */
  import type { Problem, ProblemLevel } from '../../../shared/api'
  import { renameFlag } from '../../../shared/flags'
  import { applySaveFix } from '../../../shared/release'
  import { app, type PageId } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'

  const LEVELS: { id: ProblemLevel; label: string; cls: string }[] = [
    { id: 'error', label: 'Errors', cls: 'e' }, { id: 'warning', label: 'Warnings', cls: 'w' }, { id: 'save', label: 'Save warnings', cls: 's' },
    { id: 'style', label: 'Style', cls: 'st' }, { id: 'info', label: 'Info', cls: 'i' }
  ]
  let show = $state<Record<ProblemLevel, boolean>>({ error: true, warning: true, save: true, style: true, info: false })
  let filter = $state('')
  let sel = $state(-1)
  const list = $derived(problems.all.filter((p) => show[p.level] && (!filter || `${p.area} ${p.message}`.toLowerCase().includes(filter.toLowerCase()))))
  const ignored = $derived(project.m?.project.ignores ?? [])

  function open(p: Problem) {
    const r = p.ref
    if (!r) return
    if (r.page === 'index') return
    app.go(r.page as PageId, r.id ?? null)
    if (r.page === 'quests') app.selected.questNode = r.sub?.split('/')[0] ?? null
    if (r.page === 'saga' && r.id === 'flags') app.selected.sagaTab = 'flags'
  }

  function fix(p: Problem, action: string, arg: unknown) {
    if (action === 'renameFlag') { const a = arg as { from: string; to: string }; project.change((m) => renameFlag(m, a.from, a.to)) }
    else if (action === 'listFaction') project.change((m) => { const f = m.factions.find((x) => x.id === arg); if (f?.kind === 'addition') f.listed = true })
    else if (action === 'aliasStage' || action === 'addToExisting') project.change((m) => { applySaveFix(m, action, arg) })
    else open(p)
  }

  function ignore(p: Problem) {
    if (!p.key) return
    const reason = prompt('Why can this be ignored? (stored in sagaforge/project.json, so it travels with the mod)', '')
    if (reason === null) return
    project.change((m) => { m.project.ignores.push({ key: p.key!, reason: reason || '(no reason given)' }) })
  }
  const level = (l: ProblemLevel) => LEVELS.find((x) => x.id === l)!
</script>

<div class="page">
  <div class="toolbar">
    {#each LEVELS as l (l.id)}
      <label class="lv"><input type="checkbox" bind:checked={show[l.id]} /> <span class="ico {l.cls}">{l.id === 'error' ? '!' : l.id === 'save' ? 'S' : l.id === 'style' ? '¶' : l.id === 'info' ? 'i' : '?'}</span> {l.label} ({problems.counts[l.id]})</label>
    {/each}
    <input type="search" placeholder="Filter…" bind:value={filter} />
    <span class="spacer"></span>
    {#if problems.full}<span class="muted small">Showing Check mod results (game + every installed mod). They refresh when you run it again.</span><button class="mini" onclick={() => (problems.full = null)}>Show live only</button>{/if}
    <button class="primary" onclick={() => problems.checkMod()} disabled={!project.m || problems.checking}>{problems.checking ? 'Checking…' : 'Check mod'}</button>
  </div>
  <div class="scroll">
    {#each list as p, i (i)}
      {@const l = level(p.level)}
      <div class="prow" class:on={sel === i}>
        <span class="ico {l.cls}">{p.level === 'error' ? '!' : p.level === 'save' ? 'S' : p.level === 'style' ? '¶' : p.level === 'info' ? 'i' : '?'}</span>
        <span class="area">{p.area}</span>
        <div>
          <div>{p.message}</div>
          <div class="fix">
            {#each p.fixes ?? [] as f, j (j)}<button class="mini" onclick={() => fix(p, f.action, f.arg)}>{f.label}</button>{/each}
            {#if p.ref && p.ref.page !== 'index'}<button class="mini" onclick={() => { sel = i; open(p) }}>Open</button>{/if}
            {#if p.key && p.level !== 'error'}<button class="mini" onclick={() => ignore(p)}>Ignore…</button>{/if}
          </div>
        </div>
        <span class="place muted mono">{p.file ?? (p.ref ? `${p.ref.page}${p.ref.id ? ` · ${p.ref.id}` : ''}${p.ref.sub ? ` · ${p.ref.sub}` : ''}` : '')}</span>
      </div>
    {:else}
      <div class="empty muted">{project.m ? 'No problems.' : 'No active mod.'} Errors block Export; warnings, save warnings and style notes don't.</div>
    {/each}
    {#if ignored.length}
      <details class="ign"><summary class="muted">{ignored.length} ignored</summary>
        {#each ignored as g, i (g.key)}<div class="row"><span class="mono small">{g.key}</span><span class="muted">— {g.reason}</span><button class="mini" onclick={() => project.change((m) => { m.project.ignores.splice(i, 1) })}>Stop ignoring</button></div>{/each}
      </details>
    {/if}
  </div>
</div>

<style>
  .page { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; flex-wrap: wrap; }
  .lv { display: flex; align-items: center; gap: 4px; }
  .spacer { flex: 1; }
  .scroll { overflow: auto; }
  .prow { display: grid; grid-template-columns: 22px 110px minmax(0, 1fr) 260px; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #1e242c; align-items: start; font-size: 12px; }
  .prow.on { background: #1f2a38; }
  .area { color: var(--muted); }
  .place { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fix { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .ico { width: 16px; height: 16px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 10px; font-weight: 700; color: #000; }
  .ico.e { background: var(--bad); color: #fff; } .ico.w { background: var(--warn); } .ico.s { background: #4fb3ff; } .ico.st { background: #c9a0ff; } .ico.i { background: var(--muted); }
  .mini { padding: 1px 8px; font-size: 11px; }
  .empty { padding: 20px; }
  .ign { padding: 10px; font-size: 12px; }
  .row { display: flex; gap: 8px; align-items: center; margin: 3px 0; }
  .small { font-size: 11px; }
</style>
