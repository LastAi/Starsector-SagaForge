<script lang="ts">
  /**
   * Task #64 (PLAN.md §10.6): the versions strip at the top of an editor. One cell per combination
   * of the optional mods (2 mods: Base, Mod1, Mod2, Mod1 + Mod2). Picking a cell shows the item as
   * it will be in that version; a field changed there becomes that version's value. The open cell
   * lists its own fields (Revert per field) and asks for the value where two versions it combines
   * set a field differently. #67 U18: settings marked for versions add cells "With a setting"
   * (one per value) and a setting value with each mod (under Combinations).
   */
  import { cellInfo, comboKey, comboOf, getAt, inherited, isSettingToken, resolveItem, revertPath, setInVersion, type Versioned } from '../../../shared/itemversions'
  import { findVersionable, settingKinds, VKIND_LABEL, type VKind } from '../../../shared/modelversions'
  import { itemVer } from '../state/itemver.svelte'
  import { app } from '../state/app.svelte'
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
  const cells = $derived(itemVer.cells(kind))
  const open = $derived(itemVer.combo(kind, id))
  const openKey = $derived(comboKey(open))
  const label = (c: string[]) => (c.length ? c.map((x) => mods.versionName(x)).join(' + ') : 'Base')
  // #67 U2 (#68): cells use a short name ("AoTD- Vaults of Knowledge" → "AoTD"); tooltips keep the full one
  const short = (x: string): string => {
    if (isSettingToken(x)) { const t = mods.versionName(x); return t.length > 24 ? `${t.slice(0, 23)}…` : t }
    const n = mods.name(x).trim()
    const head = n.split(/\s*[-–—:|]\s+|\s+[-–—:|]\s*/)[0]
    const s = head.length >= 2 ? head : n
    return s.length > 16 ? `${s.slice(0, 15)}…` : s
  }
  const shortLabel = (c: string[]) => (c.length ? c.map(short).join(' + ') : 'Base')
  // #67 U17 (user, 2026-11-21): Base, and one button whose menu lists every mod and combination
  const singles = $derived(cells.filter((c) => c.length === 1 && !isSettingToken(c[0])))
  // #67 U18: a setting's values alone; a value with a mod goes under Combinations
  const bySetting = $derived(cells.filter((c) => c.length > 0 && c.every(isSettingToken)))
  const combos = $derived(cells.filter((c) => c.length > 1 && !c.every(isSettingToken)))
  const withSettings = $derived(settingKinds(kind) && mods.versionSettings().length > 0)
  // screenshot mode: the 4th part "versions" opens the menu
  let menuOpen = $state(!!app.smoke && app.smokeModal === 'versions')
  const pick = (c: string[]) => { itemVer.select(kind, id, c); menuOpen = false }
  /**
   * #67 (user, 2026-11-21): the versions that set something (or need a decision) get a button of
   * their own after Base, with the number of fields they set; so does the open one. The menu has the rest.
   */
  const shownCells = $derived(cells.filter((c) => c.length && (ownCount(c) > 0 || conflictCount(c) > 0 || comboKey(c) === openKey)))
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
    <span class="lbl" title="Versions by installed mods (PLAN.md §10.6): one item, with the fields that differ per combination of the optional mods{withSettings ? ' and the values of the settings marked for versions and the player’s gender (fixed when a game starts)' : ''}">Versions</span>
    <button class="cell" class:on={!open.length} onclick={() => pick([])} title="Without any optional mod (and the fields no version changes)">Base</button>
    {#each shownCells as c (comboKey(c))}
      {@const n = ownCount(c)}
      {@const k = conflictCount(c)}
      <button class="cell" class:on={comboKey(c) === openKey} class:bad={k > 0} onclick={() => pick(c)}
        title={`${label(c)}: ${n ? `${n} field${n === 1 ? '' : 's'} set here` : 'nothing set here yet (all inherited)'}${k ? `; ${k} conflict${k === 1 ? '' : 's'} to decide` : ''}`}>
        {shortLabel(c)}{#if n}<span class="n">{n}</span>{/if}{#if k}<span class="n bad">!</span>{/if}
      </button>
    {/each}
    <span class="menuwrap">
      <button class="cell pickbtn" onclick={() => (menuOpen = !menuOpen)} title="Pick the version for a mod or a combination of mods{withSettings ? ', or a value of a setting' : ''}: the item as it will be when those mods are installed{withSettings ? ' (and the setting has that value)' : ''} at the start of a game. Versions that set something also have a button of their own.">
        {withSettings ? 'Versions' : 'Mod versions'} ▾
      </button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="backdrop" onclick={() => (menuOpen = false)}></div>
        <div class="menu" role="menu">
          {#each [['With one mod', singles], ['With a setting or the player', bySetting], ['Combinations', combos]] as [head, list] (head)}
            {#if (list as string[][]).length}
              <div class="mhead">{head}</div>
              {#each list as string[][] as c (comboKey(c))}
                {@const n = ownCount(c)}
                {@const k = conflictCount(c)}
                <button class="mitem" class:on={comboKey(c) === openKey} class:has={n > 0} role="menuitem" onclick={() => pick(c)}>
                  <span>{label(c)}</span><span class="muted small">{n ? `${n} field${n === 1 ? '' : 's'} set` : 'inherits'}</span>{#if k}<span class="n bad" title="{k} conflict{k === 1 ? '' : 's'} to decide">!</span>{/if}
                </button>
              {/each}
            {/if}
          {/each}
        </div>
      {/if}
    </span>
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
            {#each cf.values as v (v.from)}<button class="mini" title="Use this value in {label(open)}" onclick={() => edit((x) => setInVersion(x, open, cf.path, v.value))}>{label(comboOf(v.from))}: {show(v.value)}</button>{/each}
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
  <div class="vs"><span class="muted small">This {VKIND_LABEL[kind].toLowerCase()} has versions for mods that are no longer optional (or settings no longer marked for versions: Saga › Settings). <button class="lnk" onclick={openModsTab}>Saga › Mods</button></span></div>
{/if}

<style>
  .vs { display: flex; align-items: center; gap: 4px; padding: 4px 12px; border-bottom: 1px solid var(--border); background: #121a24; flex-wrap: wrap; }
  .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-right: 4px; }
  .cell { padding: 1px 9px; font-size: 12px; border-radius: 10px; border: 1px solid var(--border); background: none; display: inline-flex; gap: 4px; align-items: center; }
  .cell.on { border-color: var(--accent); color: var(--accent); background: #1f2a38; }
  .cell.bad { border-color: var(--bad); }
  .menuwrap { position: relative; }
  .backdrop { position: fixed; inset: 0; z-index: 40; }
  .menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 41; min-width: 380px; max-height: 360px; overflow: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.5); padding: 4px 0; }
  .mhead { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 6px 10px 2px; }
  .mitem { display: flex; width: 100%; gap: 8px; align-items: center; justify-content: space-between; border: none; background: none; padding: 3px 10px; text-align: left; font-size: 12px; }
  .mitem:hover { background: #1f2a38; }
  .mitem.on { color: var(--accent); }
  .mitem.has span:first-child { font-weight: 600; }
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
