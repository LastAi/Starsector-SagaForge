<script lang="ts">
  /**
   * #67 U40 (user, 2026-11-22): a fleet's extra groups (SagaLib 1.4): each may join the fleet when it
   * spawns, with a chance, and adds all its ships or some of them drawn by weight (no repeats).
   * "Always" ships stay in the fleet's own list; these are the random additions.
   */
  import IdInput from './IdInput.svelte'
  import type { FleetExtraGroup, FleetTemplateDef } from '../../../shared/model'

  /** `fleets`: the mod's named fleets, whose ships a group can pull in (#67 U41). */
  interface Props { groups: FleetExtraGroup[]; variantOptions: { id: string; name?: string; definedBy?: string }[]; fleets?: FleetTemplateDef[]; onChange: (g: FleetExtraGroup[]) => void }
  let { groups, variantOptions, fleets = [], onChange }: Props = $props()

  const edit = (fn: (gs: FleetExtraGroup[]) => void) => { const c: FleetExtraGroup[] = JSON.parse(JSON.stringify(groups)); fn(c); onChange(c) }
  const pct = (x: number) => Math.round(x * 100)
  const nameOf = (id: string) => variantOptions.find((o) => o.id === id)?.name || id
  /** "about 1 in 3 spawns" style hint for a group. */
  const odds = (g: FleetExtraGroup) => (g.chance >= 1 ? 'every time' : g.chance <= 0 ? 'never' : `${pct(g.chance)}% of spawns`)
</script>

<div class="extras">
  {#each groups as g, gi (gi)}
    <div class="grp">
      <div class="gh">
        <span class="muted small">Group {gi + 1}</span>
        <label class="small" title="How likely the group joins when the fleet spawns">chance <input type="number" class="short" min="0" max="100" step="5" value={pct(g.chance)} onchange={(e) => { const v = Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0)); edit((x) => { x[gi].chance = v / 100 }) }} />%</label>
        <label class="small" title="All its ships, or this many drawn by weight (no repeats)">adds <select value={String(g.pick)} onchange={(e) => { const v = e.currentTarget.value; edit((x) => { x[gi].pick = v === 'all' ? 'all' : Number(v) }) }}>
          <option value="all">all of these</option>{#each Array.from({ length: Math.max(1, g.ships.length - 1) }, (_, i) => i + 1) as n (n)}<option value={String(n)}>{n} of these</option>{/each}
          {#if g.pick !== 'all' && g.pick >= g.ships.length && g.ships.length > 1}<option value={String(g.pick)}>{g.pick} of these (all)</option>{/if}
        </select></label>
        <span class="muted small">{odds(g)}</span>
        <span class="sp"></span>
        <button class="mini" title="Remove this group" onclick={() => edit((x) => { x.splice(gi, 1) })}>✕ group</button>
      </div>
      <div class="ships">
        {#each g.ships as s, si (si)}
          <span class="chip" title={s.variant}>{nameOf(s.variant)}
            {#if g.pick !== 'all'}<input type="number" class="w" min="0" step="1" title="Weight: how often this one is drawn, against the others in the group" value={s.weight ?? 1} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edit((x) => { x[gi].ships[si].weight = v === 1 ? undefined : v }) }} />{/if}
            <button class="x" onclick={() => edit((x) => { x[gi].ships.splice(si, 1) })}>✕</button></span>
        {/each}
        <IdInput value="" options={variantOptions} width="200px" placeholder="+ ship (variant)" clearOnCommit onCommit={(v) => { if (v) edit((x) => { x[gi].ships.push({ variant: v }) }) }} />
        {#if fleets.length}<select value="" title="Add the ships of one of the mod's named fleets (Fleets page) to this group" onchange={(e) => { const t = fleets.find((f) => f.id === e.currentTarget.value); e.currentTarget.value = ''; if (t) edit((x) => { x[gi].ships.push(...t.ships.filter((s) => s.variant).map((s) => ({ variant: s.variant }))) }) }}><option value="">+ ships of a named fleet…</option>{#each fleets as f (f.id)}<option value={f.id}>{f.name || f.id} ({f.ships.length})</option>{/each}</select>{/if}
      </div>
    </div>
  {/each}
  <button class="mini" onclick={() => edit((x) => { x.push({ chance: 0.5, pick: 'all', ships: [] }) })}>+ Extra group</button>
</div>

<style>
  .extras { display: flex; flex-direction: column; gap: 6px; }
  .grp { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; background: #161a20; }
  .gh { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
  .sp { flex: 1; }
  .ships { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { display: inline-flex; gap: 4px; align-items: center; padding: 1px 6px; border-radius: 10px; background: #2a3a4c; font-size: 11px; }
  .x { border: none; background: none; padding: 0 2px; color: var(--muted); }
  .short { width: 56px; }
  .w { width: 42px; font-size: 11px; padding: 0 2px; }
  .mini { padding: 0 8px; font-size: 11px; align-self: flex-start; }
  .small { font-size: 11px; }
</style>
