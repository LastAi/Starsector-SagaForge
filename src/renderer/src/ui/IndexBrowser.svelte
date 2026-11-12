<script lang="ts">
  /** A read-only, filterable list of index entries (what the game and installed mods define). */
  import { app } from '../state/app.svelte'

  interface Row { id: string; name: string; definedBy: string; changedBy: string[]; sub?: string }
  interface Props { title: string; rows: Row[]; note?: string }
  let { title, rows, note = '' }: Props = $props()

  let filter = $state('')
  const shown = $derived.by(() => {
    const f = filter.trim().toLowerCase()
    const list = f ? rows.filter((r) => r.id.toLowerCase().includes(f) || r.name.toLowerCase().includes(f)) : rows
    return list.slice(0, 2000)
  })
  const srcName = (id: string): string => {
    if (id === 'starsector-core') return 'vanilla'
    if (id.startsWith('code:')) return `code (${srcName(id.slice(5))})`
    return app.index?.sources.find((s) => s.id === id)?.name ?? id
  }
</script>

<div class="wrap">
  <div class="head">
    <h3>{title} <span class="muted">({rows.length})</span></h3>
    <input type="search" placeholder="Filter…" bind:value={filter} />
  </div>
  {#if note}<p class="muted note">{note}</p>{/if}
  <div class="scroll">
    <table class="t">
      <thead><tr><th>Id</th><th>Name</th><th>Defined by</th><th>Changed by</th><th></th></tr></thead>
      <tbody>
        {#each shown as r (r.id)}
          <tr><td class="mono">{r.id}</td><td>{r.name}</td><td>{srcName(r.definedBy)}</td><td class="muted">{r.changedBy.map(srcName).join(', ')}</td><td class="muted">{r.sub ?? ''}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .head { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
  h3 { margin: 0; font-size: 13px; flex: 1; }
  .note { margin: 6px 12px; font-size: 12px; }
  .scroll { overflow: auto; flex: 1; min-height: 0; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 8px; position: sticky; top: 0; background: var(--panel); }
  table.t td { border-bottom: 1px solid #1e242c; padding: 3px 8px; }
</style>
