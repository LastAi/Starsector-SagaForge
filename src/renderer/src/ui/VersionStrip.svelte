<script lang="ts">
  /**
   * Task #64 (PLAN.md §10.6): the versions strip at the top of an editor. One cell per combination
   * of the optional mods (2 mods: Base, Mod1, Mod2, Mod1 + Mod2). Picking a cell shows the item as
   * it will be in that version; a field changed there becomes that version's value. The open cell
   * lists its own fields (Revert per field) and asks for the value where two versions it combines
   * set a field differently.
   */
  import { cellInfo, comboKey, getAt, inherited, resolveItem, revertPath, setInVersion, type Versioned } from '../../../shared/itemversions'
  import { findVersionable, VKIND_LABEL, type VKind } from '../../../shared/modelversions'
  import { itemVer } from '../state/itemver.svelte'
  import { mods } from '../state/mods.svelte'
  import { project } from '../state/project.svelte'
  import { openModsTab } from '../state/mods.svelte'

  interface Props {
    kind: VKind
    id: string
    /** Only these paths belong to this editor (e.g. one faction's part of the factions file). */
    paths?: (path: string) => boolean
    /** What the versions are about, shown in the help line. */
    what?: string
  }
  let { kind, id, paths, what }: Props = $props()

  const item = $derived(project.m ? (findVersionable(project.m, kind, id) as Versioned | null) : null)
  const cells = $derived(itemVer.cells())
  const open = $derived(itemVer.combo(kind, id))
  const openKey = $derived(comboKey(open))
  const label = (c: string[]) => (c.length ? c.map((x) => mods.name(x)).join(' + ') : 'Base')
  const mine = (p: string) => !paths || paths(p)
  const info = (c: string[]) => (item ? cellInfo(item, c) : null)
  const ownCount = (c: string[]) => info(c)?.own.filter(mine).length ?? 0
  const conflictCount = (c: string[]) => info(c)?.conflicts.filter((x) => mine(x.path)).length ?? 0
  const cur = $derived(item && open.length ? info(open) : null)
  const show = (v: unknown): string => {
    if (v === null || v === undefined) return '(removed)'
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  }
  const pathLabel = (p: string) => p.replace(/\[([^\]]+)\]/g, ' › $1').replace(/\./g, ' › ')
  const edit = (fn: (x: Versioned) => void) => project.change((m) => { const x = findVersionable(m, kind, id); if (x) fn(x) })
  const resolvedHere = $derived(item && open.length ? resolveItem(item, open).value : null)
</script>

{#if cells.length > 1}
  <div class="vs">
    <span class="lbl" title="Versions by installed mods (PLAN.md §10.6): one item, with the fields that differ per combination of the optional mods">Versions</span>
    {#each cells as c (comboKey(c))}
      {@const n = ownCount(c)}
      {@const k = conflictCount(c)}
      <button class="cell" class:on={comboKey(c) === openKey} class:has={n > 0} class:bad={k > 0} onclick={() => itemVer.select(kind, id, c)}
        title={c.length ? `As it is when ${label(c)} ${c.length > 1 ? 'are' : 'is'} installed at the start of a game${n ? ` (${n} field${n === 1 ? '' : 's'} set here)` : ' (all inherited)'}${k ? `; ${k} conflict${k === 1 ? '' : 's'} to decide` : ''}` : 'Without any optional mod (and the fields no version changes)'}>
        {label(c)}{#if n}<span class="n">{n}</span>{/if}{#if k}<span class="n bad">!</span>{/if}
      </button>
    {/each}
    <span class="spacer"></span>
    {#if open.length}<span class="muted small">Editing the <b>{label(open)}</b> version{what ? ` of ${what}` : ''}: changes are stored for it only.</span>{/if}
  </div>
  {#if cur}
    {@const own = cur.own.filter(mine)}
    {@const conflicts = cur.conflicts.filter((x) => mine(x.path))}
    {#if own.length || conflicts.length}
      <div class="vd">
        {#each conflicts as cf (cf.path)}
          <div class="row bad"><span class="p">{pathLabel(cf.path)}</span><span class="muted small">set differently by</span>
            {#each cf.values as v (v.from)}<button class="mini" title="Use this value in {label(open)}" onclick={() => edit((x) => setInVersion(x, open, cf.path, v.value))}>{label(v.from === 'base' ? [] : v.from.split('+'))}: {show(v.value)}</button>{/each}
            <span class="muted small">pick one for {label(open)} (or edit the field)</span></div>
        {/each}
        {#each own as p (p)}
          {@const inh = item ? inherited(item, open, p) : undefined}
          <div class="row"><span class="p">{pathLabel(p)}</span><span class="v">{show(resolvedHere ? getAt(resolvedHere, p) : undefined)}</span><span class="muted small">instead of {show(inh)}</span>
            <button class="mini" title="Inherit this field again" onclick={() => edit((x) => revertPath(x, open, p))}>Revert</button></div>
        {/each}
      </div>
    {/if}
  {/if}
{:else if mods.optional().length === 0 && item?.versions?.length}
  <div class="vs"><span class="muted small">This {VKIND_LABEL[kind].toLowerCase()} has versions for mods that are no longer optional. <button class="lnk" onclick={openModsTab}>Saga › Mods</button></span></div>
{/if}

<style>
  .vs { display: flex; align-items: center; gap: 4px; padding: 4px 12px; border-bottom: 1px solid var(--border); background: #121a24; flex-wrap: wrap; }
  .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-right: 4px; }
  .cell { padding: 1px 9px; font-size: 12px; border-radius: 10px; border: 1px solid var(--border); background: none; display: inline-flex; gap: 4px; align-items: center; }
  .cell.on { border-color: var(--accent); color: var(--accent); background: #1f2a38; }
  .cell.has { font-weight: 600; }
  .cell.bad { border-color: var(--bad); }
  .n { font-size: 10px; border-radius: 8px; background: #2a3a4c; padding: 0 5px; }
  .n.bad { background: var(--bad); color: #fff; }
  .spacer { flex: 1; }
  .vd { padding: 4px 12px 6px; border-bottom: 1px solid var(--border); background: #10161e; display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; gap: 8px; align-items: center; font-size: 12px; flex-wrap: wrap; }
  .row.bad .p { color: var(--bad); }
  .p { font-family: var(--mono, monospace); font-size: 11px; color: var(--accent); }
  .v { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .lnk { border: none; background: none; padding: 0; color: var(--accent); font-size: inherit; }
</style>
