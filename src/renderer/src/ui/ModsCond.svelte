<script lang="ts">
  /**
   * #60 (PLAN.md §10.2): "Only with" these mods / "Only without" these mods on one item. Offers
   * only the optional mods (a required mod is always there). Conditions the item gets from
   * elsewhere (it uses an optional mod's content, or only conditional content uses it) show greyed
   * with where they come from.
   */
  import type { ModsCondition } from '../../../shared/model'
  import { condText } from '../../../shared/modlist'
  import { mods } from '../state/mods.svelte'
  import { app } from '../state/app.svelte'

  interface Props {
    value: ModsCondition | undefined
    /** The item's key in the effective conditions ("quest:<id>", "person:<id>", …), for the greyed parts. */
    itemKey?: string
    onChange: (v: ModsCondition | undefined) => void
    /** One line, for options and cases. */
    compact?: boolean
  }
  let { value, itemKey, onChange, compact = false }: Props = $props()

  const opt = $derived(mods.optional())
  const withL = $derived(value?.with ?? [])
  const without = $derived(value?.without ?? [])
  const from = $derived(itemKey ? mods.effective.get(itemKey)?.from ?? [] : [])

  function set(next: ModsCondition) {
    const clean: ModsCondition = { ...(next.with?.length ? { with: next.with } : {}), ...(next.without?.length ? { without: next.without } : {}), ...(next.anyOf && (next.with?.length ?? 0) > 1 ? { anyOf: true } : {}) }
    onChange(clean.with || clean.without ? clean : undefined)
  }
  const add = (list: 'with' | 'without', id: string) => { if (!id) return; const cur = value?.[list] ?? []; if (!cur.includes(id)) set({ ...value, [list]: [...cur, id] }) }
  const remove = (list: 'with' | 'without', id: string) => set({ ...value, [list]: (value?.[list] ?? []).filter((x) => x !== id) })
  const openMods = () => { app.selected.sagaOpen = 'mods'; app.selected.sagaTab = 'mods'; app.go('saga') }
</script>

<div class="mc" class:compact>
  {#if !opt.length}
    {#if !compact}<span class="muted small">Add an optional mod in <button class="lnk" onclick={openMods}>Saga › Mods</button> to make this depend on it.</span>{/if}
  {:else}
    <span class="grp"><span class="lbl">Only with</span>
      {#each withL as id (id)}<span class="chip">{mods.name(id)}<button title="Remove" onclick={() => remove('with', id)}>✕</button></span>{/each}
      <select value="" title="Only when this mod counts (enabled when the game started, and still enabled)" onchange={(e) => { add('with', e.currentTarget.value); e.currentTarget.value = '' }}>
        <option value="">+</option>{#each opt.filter((o) => !withL.includes(o.id) && !without.includes(o.id)) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
      </select>
      {#if withL.length > 1}<label class="small" title="Any one of them is enough (SF_HasAnyMod), instead of all of them"><input type="checkbox" checked={!!value?.anyOf} onchange={(e) => set({ ...value, anyOf: e.currentTarget.checked })} /> any of</label>{/if}
    </span>
    <span class="grp"><span class="lbl">Only without</span>
      {#each without as id (id)}<span class="chip neg">{mods.name(id)}<button title="Remove" onclick={() => remove('without', id)}>✕</button></span>{/each}
      <select value="" title="Only when this mod doesn't count" onchange={(e) => { add('without', e.currentTarget.value); e.currentTarget.value = '' }}>
        <option value="">+</option>{#each opt.filter((o) => !withL.includes(o.id) && !without.includes(o.id)) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
      </select>
    </span>
  {/if}
  {#each from as f, i (i)}<span class="chip auto" title="Set automatically: {f.why}">{condText(f.cond, (id) => mods.name(id))} <i>({f.why})</i></span>{/each}
</div>

<style>
  .mc { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12px; }
  .grp { display: inline-flex; gap: 3px; align-items: center; flex-wrap: wrap; }
  .lbl { color: var(--muted); font-size: 11px; }
  .chip { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--accent-2); color: var(--accent); border-radius: 10px; padding: 0 6px; font-size: 11px; white-space: nowrap; }
  .chip.neg { border-color: #8a5a2b; color: var(--warn); }
  .chip.auto { border-style: dashed; border-color: var(--border); color: var(--muted); }
  .chip button { border: none; background: none; padding: 0 0 0 2px; font-size: 10px; color: inherit; }
  .mc select { padding: 0 4px; font-size: 11px; width: auto !important; min-width: 40px; max-width: 120px; flex: 0 0 auto; }
  .small { font-size: 11px; }
  .lnk { border: none; background: none; padding: 0; color: var(--accent); font-size: inherit; }
  .compact .lbl { font-size: 10px; }
</style>
