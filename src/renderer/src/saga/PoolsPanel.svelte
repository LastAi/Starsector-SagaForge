<script lang="ts">
  import VersionStrip from '../ui/VersionStrip.svelte'
  import { itemVer } from '../state/itemver.svelte'
  /**
   * Saga › Pools (Phase 7a, DESIGN-PHASE7.md): the mod's named random pools. A Random branch can
   * roll one (Branch › Pool); loot, random encounters and scatter use them in later steps.
   */
  import type { PoolEntryPlan, PoolPlan } from '../../../shared/model'
  import { chances } from '../../../shared/pools'
  import { slug, uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import LinesInput from '../quests/LinesInput.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import { dropGroupChoices } from '../../../shared/pools'

  interface Props { templates: { label: string; line: string }[] }
  let { templates }: Props = $props()

  const m = $derived(project.m!)
  const pools = $derived(m.pools ?? [])
  const sel = $derived(app.selected.pool ?? pools[0]?.id ?? null)
  // #64: the pool as in the open version (the versions strip; not for loot pools, which the game loads)
  const pool = $derived(((p) => (p?.use === 'loot' ? p : itemVer.view('pool', p?.id, p)))(pools.find((p) => p.id === sel) ?? null))
  const ch = $derived(pool ? Object.fromEntries(chances(pool).map((c) => [c.id, c.chance])) : {})
  /** Random branches that roll this pool. */
  const users = $derived(pool ? m.quests.flatMap((q) => q.nodes.filter((n) => n.type === 'branch' && n.random?.pool === pool.id).map((n) => ({ quest: q, node: n.id }))) : [])
  /** Phase 7e: entities and scatters whose salvage rolls this loot pool (a drop group). */
  const lootUsers = $derived(pool ? [...m.systems.flatMap((sy) => sy.entities.filter((e) => e.loot?.some((l) => l.group === pool.id)).map((e) => e.name)), ...(m.scatter ?? []).filter((sc) => sc.loot?.some((l) => l.group === pool.id)).map((sc) => `scatter ${sc.name}`)] : [])
  const use = $derived(pool?.use ?? 'branch')
  /** Loot entry ids: commodities, special items (item_), weapons (wpn_), wings (ftr_). */
  const lootIds = $derived([...m.items.map((i) => ({ id: i.kind === 'special' ? `item_${i.id}` : i.id, name: i.name })), ...(app.index?.items ?? []).map((i) => ({ id: i.kind === 'special' ? `item_${i.id}` : i.id, name: i.name })), ...(app.index?.weapons ?? []).map((w) => ({ id: `wpn_${w.id}`, name: w.name })), ...(app.index?.wings ?? []).map((w) => ({ id: `ftr_${w.id}`, name: w.name }))])
  const USE_HELP: Record<string, string> = {
    loot: "A loot table: a drop group of the mod's own in drop_groups.csv (vanilla's file, no SagaLib). Salvage entities and scatters roll it (Locations › Loot). Entries are commodities, special items (item_<id>), weapons (wpn_<id>) or fighter wings (ftr_<id>); weights are vanilla's freq.",
    encounters: "Random encounters: SagaLib 1.2 adds the pool to vanilla's own encounter creators, which pick one at vanilla's encounter points (in slipstreams, just outside a star system) by frequency. Entries are the mod's encounters; the picked one's fleet lies in wait there and leaves when the player is gone.",
    branch: "Rolled by quests' Random branches (Branch › Picks: at random › Pool), with conditions and limits. SagaLib 1.2."
  }

  const edPool = (fn: (p: PoolPlan) => void) => { const id = sel; if (!id) return; if (pool?.use === 'loot') { project.change((mm) => { const p = mm.pools?.find((x) => x.id === id); if (p) fn(p) }); return } itemVer.edit<PoolPlan>('pool', id, (p) => fn(p)) }
  const edEntry = (i: number, fn: (e: PoolEntryPlan) => void) => edPool((p) => fn(p.entries[i]))
  function newPool() {
    const id = uniqueId(`${m.project.prefix}pool`, pools.map((p) => p.id))
    project.change((mm) => { mm.pools ??= []; mm.pools.push({ id, name: 'New pool', draw: 'pickOne', nothing: 0, entries: [{ id: 'a', label: 'First', weight: 1, conditions: [] }] }) })
    app.selected.pool = id
  }
  /** Until a branch uses it, a pool's id follows its name. */
  function rename(v: string) {
    const p = pool
    if (!p) return
    const used = m.quests.some((q) => q.nodes.some((n) => n.type === 'branch' && n.random?.pool === p.id)) || lootUsers.length > 0
    const nid = used ? p.id : uniqueId(`${m.project.prefix}${slug(v).replace(new RegExp(`^${m.project.prefix}`), '') || 'pool'}`, pools.filter((x) => x.id !== p.id).map((x) => x.id))
    edPool((x) => { x.name = v; x.id = nid })
    app.selected.pool = nid
  }
  const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 1000) / 10}%`
</script>

<div class="split">
  <div class="side">
    <div class="sect">Pools <button onclick={newPool}>+ New</button></div>
    <ul class="list">{#each pools as p (p.id)}<li class:on={p.id === sel}><button class="li" onclick={() => (app.selected.pool = p.id)}>{p.name || p.id}<span class="sub">{p.entries.length}</span></button></li>{/each}</ul>
    <p class="muted small pad">A named list of things that can happen, each with a weight, like a loot table or a deck of story cards. One entry is picked by weight, or nothing. A pool is for Random branches (SagaLib 1.2), a loot table (a drop group, no SagaLib) or random encounters (SagaLib 1.2).</p>
  </div>
  {#if pool && pool.use !== 'loot'}<VersionStrip kind="pool" id={pool.id} what="this pool" />{/if}
  <div class="scroll pad">
    {#if pool}
      <div class="grid2">
        <Field label="Name" for="pl-n" help="For you and in Branch nodes' pool lists. Until a branch uses the pool, its id follows the name.">
          <input id="pl-n" type="text" value={pool.name} onchange={(e) => rename(e.currentTarget.value)} />
        </Field>
        <Field label="Mods" help="Only rolled with / without optional mods (Saga › Mods; SagaLib 1.3): it picks nothing otherwise. Loot pools are drop groups the game loads, so they can't have conditions.">
          <ModsCond value={pool?.mods} itemKey={`pool:${pool?.id}`} onChange={(c) => edPool((p) => { if (c) p.mods = c; else delete p.mods })} />
        </Field>
        <Field label="Used for" for="pl-u" help={USE_HELP[use]}>
          <select id="pl-u" value={use} disabled={users.length > 0 || lootUsers.length > 0} onchange={(e) => { const v = e.currentTarget.value as 'branch' | 'loot' | 'encounters'; edPool((p) => { p.use = v === 'branch' ? undefined : v; if (v === 'encounters') { p.points ??= ['slipstream', 'outside_system']; p.frequency ??= 10 } }) }}>
            <option value="branch">Random branches (story picks)</option><option value="loot">a loot table (drop group)</option><option value="encounters">random encounters</option>
          </select>
        </Field>
        {#if use === 'loot'}
          <Field label="Adds to" help="Empty: a drop group of the mod's own (its id is the pool's id). Or an existing group (vanilla's rare_tech, blueprints, ai_cores2…, or another mod's): the entries are added to that group, its own items stay (checked in game). Then this pool is not a group itself: entities and rewards roll the group you add to.">
            <IdInput value={pool.addsTo ?? ''} options={dropGroupChoices([], app.index)} width="220px" placeholder="(a group of the mod's own)" onCommit={(v) => { const g = v.trim(); edPool((p) => { p.addsTo = g || undefined }) }} />
          </Field>
        {/if}
        <Field label="Id" help={use === 'loot' ? "The drop group's id in drop_groups.csv: entities name it in their loot." : "SagaLib's name for the pool (data/sagaforge/pools/<id>.json); saves remember its limits by it."}><span class="mono">{pool.id}</span></Field>
        {#if use === 'encounters'}
          <Field label="Where" help="Vanilla's encounter points: in slipstreams (hyperspace), and just outside star systems.">
            <span class="row">{#each [['slipstream', 'in slipstreams'], ['outside_system', 'outside star systems']] as [pt, lbl] (pt)}<label><input type="checkbox" checked={pool.points?.includes(pt) ?? false} onchange={(e) => { const on = e.currentTarget.checked; edPool((p) => { const l = (p.points ?? []).filter((x) => x !== pt); p.points = on ? [...l, pt] : l }) }} /> {lbl}</label>{/each}</span>
          </Field>
          <Field label="Frequency" for="pl-f" help="How often against vanilla's own encounter creators at the same point (pirates, scavengers…; they use about 10). Each point fires once in a while (vanilla: every 30–90 days).">
            <input id="pl-f" type="number" min="0" value={pool.frequency ?? 10} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edPool((p) => { p.frequency = v }) }} />
          </Field>
        {/if}
        <Field label="Nothing" for="pl-no" help={use === 'loot' ? "The weight of a roll that drops nothing (vanilla's nothing row in the group)." : use === 'encounters' ? 'The weight of no encounter when this pool is picked.' : "The weight of 'nothing happens': a Random branch then takes 'Otherwise'. 0 = an entry is always picked (unless none may be)."}>
          <input id="pl-no" type="number" min="0" step="1" value={pool.nothing ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edPool((p) => { p.nothing = v }) }} />
        </Field>
        <Field label="Notes" for="pl-nt" help="For you only: never exported.">
          <textarea id="pl-nt" rows="2" value={pool.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; edPool((p) => { p.notes = v || undefined }) }}></textarea>
        </Field>
      </div>
      <div class="sect2">Entries <button class="mini" onclick={() => edPool((p) => { const id = uniqueId('e', p.entries.map((x) => x.id)); p.entries.push({ id, label: `Entry ${p.entries.length + 1}`, weight: 1, conditions: [] }) })}>+ Entry</button></div>
      <p class="f-help">One is picked by weight (3 against 1 is three times as likely). The chance assumes every entry may be picked; conditions and limits say when one may. {#if pool.nothing}Nothing: {pct(ch.nothing)}.{/if}</p>
      {#each pool.entries as en, i (en.id)}
        <div class="entry">
          {#if use !== 'loot'}<ModsCond compact value={en.mods} onChange={(c) => edEntry(i, (x) => { if (c) x.mods = c; else delete x.mods })} />{/if}
          <div class="row">
            <input type="text" value={en.label ?? ''} placeholder="label" title="Shown in Branch nodes as the case's name" onchange={(e) => { const v = e.currentTarget.value; edEntry(i, (x) => { x.label = v || undefined }) }} />
            {#if use === 'loot'}
              <IdInput value={en.id} options={lootIds} width="200px" placeholder="e.g. metals, item_alpha_core" onCommit={(v) => { if (v.trim()) edEntry(i, (x) => { x.id = v.trim() }) }} />
            {:else if use === 'encounters'}
              <select title="The encounter whose fleet appears" value={en.id} onchange={(e) => { const v = e.currentTarget.value; edEntry(i, (x) => { x.id = v; x.label = m.encounters.find((y) => y.id === v)?.name }) }}>
                {#if !m.encounters.some((y) => y.id === en.id)}<option value={en.id}>encounter…</option>{/if}
                {#each m.encounters as y (y.id)}<option value={y.id}>{y.name}</option>{/each}
              </select>
            {:else}
            <span class="mono small" title="The entry's id: rules test $sagaforge_pick == {en.id}">{en.id}</span>
            {/if}
            <label>weight <input type="number" class="short" min="0" value={en.weight} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edEntry(i, (x) => { x.weight = v }) }} /></label>
            <span class="muted">{pct(ch[en.id])}</span>
            <button class="mini" title="Remove the entry" onclick={() => edPool((p) => { p.entries.splice(i, 1) })}>✕</button>
          </div>
          {#if use !== 'loot'}
          <div class="row small">
            <select title="How often it may be picked" value={en.limit?.once ?? ''} onchange={(e) => { const v = e.currentTarget.value as '' | 'playthrough' | 'object'; edEntry(i, (x) => { const l = { ...(x.limit ?? {}) }; if (v) l.once = v; else delete l.once; x.limit = l }) }}>
              <option value="">any number of times</option><option value="playthrough">once per playthrough</option><option value="object">once per place / person</option>
            </select>
            <label title="At least this many days between two picks">cooldown <input type="number" class="short" min="0" value={en.limit?.cooldownDays ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edEntry(i, (x) => { x.limit = { ...(x.limit ?? {}), cooldownDays: v || undefined } }) }} /> days</label>
            <label title="At most this many picks per playthrough">at most <input type="number" class="short" min="0" value={en.limit?.max ?? 0} onchange={(e) => { const v = Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)); edEntry(i, (x) => { x.limit = { ...(x.limit ?? {}), max: v || undefined } }) }} /> times</label>
          </div>
          <LinesInput lines={en.conditions} {templates} placeholder="may be picked only if… (optional)" onChange={(l) => edEntry(i, (x) => { x.conditions = l })} />
          {/if}
        </div>
      {/each}
      <div class="sect2">Used by</div>
      {#each users as u (u.quest.id + u.node)}<div><button class="link" onclick={() => { app.go('quests', u.quest.id); app.selected.questNode = u.node }}>{u.quest.title} › {u.node}</button></div>{/each}
      {#each lootUsers as u (u)}<div class="small">{u} (salvage loot)</div>{/each}
      {#if !users.length && !lootUsers.length}<p class="muted small">{use === 'loot' ? 'No entity or scatter rolls it yet (Locations › an entity › Loot).' : use === 'encounters' ? "Vanilla's encounter points roll it by themselves." : 'No Random branch rolls it yet.'}</p>{/if}
      <p><button class="mini danger" disabled={users.length > 0 || lootUsers.length > 0} title={users.length || lootUsers.length ? 'Still used' : ''} onclick={() => { const id = pool!.id; project.change((mm) => { mm.pools = (mm.pools ?? []).filter((p) => p.id !== id) }); app.selected.pool = null }}>Delete pool</button></p>
    {:else}<div class="muted">No pool yet. <button class="mini" onclick={newPool}>+ New pool</button></div>{/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; min-height: 0; }
  .side { border-right: 1px solid var(--border); overflow: auto; background: var(--panel); }
  .scroll { overflow: auto; }
  .pad { padding: 10px 14px; }
  .sect, .sect2 { display: flex; justify-content: space-between; align-items: center; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px 4px; }
  .sect2 { padding: 14px 0 4px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 10px; display: flex; justify-content: space-between; }
  .list li.on .li { background: var(--accent-2); color: #fff; }
  .sub { color: var(--muted); font-size: 11px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 420px); gap: 2px 10px; align-items: center; }
  .entry { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin: 6px 0; display: grid; gap: 4px; max-width: 720px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row input[type=text] { flex: 1; }
  .row.small { font-size: 12px; }
  input.short { width: 60px; }
  .link { border: none; background: none; color: var(--accent); padding: 0; cursor: pointer; }
</style>
