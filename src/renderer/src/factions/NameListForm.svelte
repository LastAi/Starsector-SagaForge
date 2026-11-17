<script lang="ts">
  /**
   * One of the mod's name lists (R3; DESIGN-PHASE2.md §1): a person name category (rows of the
   * mod's person_names.csv) or a ship name list (a key of its ship_names.json). One name per line.
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import { cleanNames, poolCounts } from '../../../shared/export/names'
  import { nameCategoryTotals, shipListTotals, usedByFactions } from '../../../shared/checks/names'
  import type { NamePool, ShipNameList } from '../../../shared/model'

  interface Props { kind: 'people' | 'ships'; id: string; onDeleted: () => void }
  let { kind, id, onDeleted }: Props = $props()

  const index = $derived(app.index!)
  const m = $derived(project.m)
  const pool = $derived(kind === 'people' ? m?.names.people.find((p) => p.id === id) ?? null : null)
  const list = $derived(kind === 'ships' ? m?.names.ships.find((p) => p.id === id) ?? null : null)
  const srcName = (s: string) => (s === 'mine' ? 'this mod' : s === 'starsector-core' ? 'vanilla' : index.sources.find((x) => x.id === s)?.name ?? s)
  const others = $derived.by(() => {
    const own = project.loaded?.sourceId ?? null
    const t = kind === 'people' ? nameCategoryTotals(index, null, own).get(id) : shipListTotals(index, null, own).get(id)
    return t ? t.sources.map(srcName) : []
  })
  const usedBy = $derived(m ? usedByFactions(m, kind, id) : [])
  const additions = $derived((m?.factions ?? []).filter((f) => f.kind === 'addition' && !usedBy.includes(f.id)))

  const lines = (t: string) => t.split(/\r?\n/)
  const text = (l: string[]) => l.join('\n')

  function setPool(fn: (p: NamePool) => void) { project.change((mm) => { const p = mm.names.people.find((x) => x.id === id); if (p) fn(p) }) }
  function setList(fn: (p: ShipNameList) => void) { project.change((mm) => { const p = mm.names.ships.find((x) => x.id === id); if (p) fn(p) }) }

  /** Add this list to one of the mod's factions with weight 1. */
  function useIn(factionId: string) {
    project.change((mm) => {
      const f = mm.factions.find((x) => x.id === factionId)
      if (f?.kind !== 'addition') return
      const key = kind === 'people' ? 'names' : 'shipNameSources'
      const cur = (f.raw[key] && typeof f.raw[key] === 'object' ? { ...(f.raw[key] as Record<string, unknown>) } : {}) as Record<string, unknown>
      cur[id] = 1
      f.raw[key] = cur
    })
  }

  function remove() {
    const used = usedBy.length ? ` ${usedBy.join(', ')} still use${usedBy.length === 1 ? 's' : ''} it (Problems will warn).` : ''
    if (!confirm(`Delete the name list "${id}"?${used} Undo can bring it back until you save.`)) return
    project.change((mm) => {
      if (kind === 'people') mm.names.people = mm.names.people.filter((p) => p.id !== id)
      else mm.names.ships = mm.names.ships.filter((p) => p.id !== id)
    })
    onDeleted()
  }
  let useTarget = $state('')
</script>

<div class="head">
  <h2 class="mono">{id}</h2>
  <span class="badge">{kind === 'people' ? "people's names" : 'ship names'}</span>
  <span class="spacer"></span>
  <span class="muted small">writes</span><span class="mono small">{kind === 'people' ? 'data/characters/person_names.csv' : 'data/strings/ship_names.json'}</span>
  <button class="mini danger" onclick={remove}>Delete</button>
</div>

<div class="body">
  {#if pool}
    {@const c = poolCounts(pool)}
    <p class="muted small">A name category for generated people (officers, administrators, contacts). Factions use it from <b>Names &amp; ranks › Person name sets</b>. One name per line; empty lines and repeats are dropped. Counts with the "anyone" names: <b>{c.male}</b> for men, <b>{c.female}</b> for women, <b>{c.last}</b> last names.</p>
    <div class="grid">
      <Field label="First names · men" for="nl-m" help="First names only men get (written with gender m).">
        <textarea id="nl-m" rows="8" spellcheck="false" value={text(pool.male)} onchange={(e) => { const v = lines(e.currentTarget.value); setPool((p) => (p.male = v)) }}></textarea>
      </Field>
      <Field label="First names · women" for="nl-f" help="First names only women get (gender f).">
        <textarea id="nl-f" rows="8" spellcheck="false" value={text(pool.female)} onchange={(e) => { const v = lines(e.currentTarget.value); setPool((p) => (p.female = v)) }}></textarea>
      </Field>
      <Field label="First names · anyone" for="nl-a" help="First names for both men and women (no gender, as vanilla's AI names).">
        <textarea id="nl-a" rows="5" spellcheck="false" value={text(pool.first)} onchange={(e) => { const v = lines(e.currentTarget.value); setPool((p) => (p.first = v)) }}></textarea>
      </Field>
      <Field label="Last names" for="nl-l" help="Last names for everyone. Without any, the game takes last names from a random category (e.g. a human surname).">
        <textarea id="nl-l" rows="8" spellcheck="false" value={text(pool.last)} onchange={(e) => { const v = lines(e.currentTarget.value); setPool((p) => (p.last = v)) }}></textarea>
      </Field>
      <Field label="Note" for="nl-n" help="For you; not exported.">
        <input id="nl-n" type="text" value={pool.note ?? ''} onchange={(e) => { const v = e.currentTarget.value; setPool((p) => { if (v.trim()) p.note = v; else delete p.note }) }} />
      </Field>
    </div>
  {:else if list}
    <p class="muted small">A list of ship names. Factions use it from <b>Names &amp; ranks › Ship name sources</b>. One name per line; empty lines and repeats are dropped. <b>{cleanNames(list.names).length}</b> names.</p>
    <div class="grid">
      <Field label="Names" for="nl-s" help="Ship names, without the faction's prefix (the game adds it: &quot;ISS Courage&quot;).">
        <textarea id="nl-s" rows="16" spellcheck="false" value={text(list.names)} onchange={(e) => { const v = lines(e.currentTarget.value); setList((p) => (p.names = v)) }}></textarea>
      </Field>
      <Field label="Note" for="nl-n" help="For you; not exported.">
        <input id="nl-n" type="text" value={list.note ?? ''} onchange={(e) => { const v = e.currentTarget.value; setList((p) => { if (v.trim()) p.note = v; else delete p.note }) }} />
      </Field>
    </div>
  {:else}
    <div class="muted">No name list "{id}".</div>
  {/if}

  {#if pool || list}
    <div class="group">
      <div class="gt"><span>Used by</span></div>
      {#if usedBy.length}<div>{#each usedBy as f, i (f)}{i ? ', ' : ''}<button class="linkish" onclick={() => (app.selected.factions = f)}>{f}</button>{/each}</div>
      {:else}<div class="muted small">None of this mod's factions use it yet.</div>{/if}
      {#if additions.length}
        <div class="row2">
          <select bind:value={useTarget}><option value="">Use in a faction…</option>{#each additions as f (f.id)}<option value={f.id}>{f.kind === 'addition' ? String(f.raw.displayName ?? f.id) : f.id}</option>{/each}</select>
          <button disabled={!useTarget} onclick={() => { useIn(useTarget); useTarget = '' }}>Add with weight 1</button>
        </div>
      {/if}
      {#if others.length}<div class="warn small">{others.join(', ')} already {others.length === 1 ? 'has' : 'have'} a {kind === 'people' ? 'category' : 'list'} with this id: these names are added to it, for every faction using it.</div>{/if}
    </div>
  {/if}
</div>

<style>
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); flex-wrap: wrap; }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--accent-2); color: var(--accent); line-height: 16px; }
  .body { padding: 12px 14px; overflow: auto; flex: 1; min-height: 0; }
  .grid { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 4px 10px; max-width: 760px; }
  textarea { width: 100%; resize: vertical; font-size: 12px; }
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 12px 0; background: #161a20; max-width: 760px; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .row2 { display: flex; gap: 6px; margin-top: 8px; }
  .linkish { border: none; background: none; color: var(--accent); padding: 0; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 12px; }
  .warn { color: var(--warn); margin-top: 6px; }
</style>
