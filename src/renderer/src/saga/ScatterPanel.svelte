<script lang="ts">
  /**
   * Saga › Scatter (Phase 7e, RC-R10): copies of one custom entity (a cache, a probe, a research
   * station…) that SagaLib 1.2 places at new game in places picked with vanilla's mission search,
   * with salvage loot and defenders.
   */
  import type { ScatterPlan } from '../../../shared/model'
  import { newTarget } from '../../../shared/targets'
  import { dropGroupChoices } from '../../../shared/pools'
  import { uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import TargetEditor from '../quests/TargetEditor.svelte'

  const m = $derived(project.m!)
  const list = $derived(m.scatter ?? [])
  let selId = $state<string | null>(app.selected.scatterItem ?? null)
  const sel = $derived(list.find((x) => x.id === (selId ?? list[0]?.id)) ?? null)
  const lootPools = $derived((m.pools ?? []).filter((p) => p.use === 'loot' && !p.addsTo))
  const types = $derived([...(m.types?.entities ?? []).map((t) => ({ id: t.id, name: t.name })), ...(app.index?.customEntityTypes ?? []).map((t) => ({ id: t.id, name: t.name ?? t.id, definedBy: t.definedBy }))])
  const places = $derived([...m.systems.flatMap((sy) => sy.entities.flatMap((e) => [{ id: e.id, name: `${e.name} (${sy.name})` }, ...(e.market && e.market.id !== e.id ? [{ id: e.market.id, name: `${e.market.name} market` }] : [])])), ...(app.index?.markets ?? []).map((x) => ({ id: x.id, name: `${x.name} market`, definedBy: x.definedBy }))])
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })), ...(app.index?.factions ?? [])])

  const ed = (fn: (s: ScatterPlan) => void) => { const id = sel?.id; project.change((mm) => { const s = mm.scatter?.find((x) => x.id === id); if (s) fn(s) }) }
  function add() {
    const id = uniqueId(`${m.project.prefix}scatter`, list.map((x) => x.id))
    const t = newTarget()
    t.require = [{ id: 'plUnpopulated', args: [] }, { id: 'sysUnexplored', args: [] }]
    t.mock = undefined
    project.change((mm) => { mm.scatter ??= []; mm.scatter.push({ id, name: 'Hidden caches', count: 3, target: t, entity: { type: 'supply_cache', name: 'Hidden cache' } }) })
    selId = id
  }
</script>

<div class="split">
  <div class="side">
    <div class="sect">Scatter <button onclick={add}>+ New</button></div>
    <ul class="list">{#each list as s (s.id)}<li class:on={s.id === sel?.id}><button class="li" onclick={() => (selId = s.id)}>{s.name}<span class="sub">{s.count}</span></button></li>{/each}</ul>
    <p class="muted small pad">Copies of one object (a cache, a probe, a research station…) that SagaLib places at new game in places picked like a random target, each in a different system, with salvage loot and defenders, as vanilla scatters its derelicts and caches. Once per game. Needs SagaLib 1.2.</p>
  </div>
  <div class="scroll pad">
    {#if sel}
      <div class="grid2">
        <Field label="Name" for="sc-n" help="For you, and the objects' name when Name below is empty.">
          <input id="sc-n" type="text" value={sel.name} onchange={(e) => { const v = e.currentTarget.value; ed((s) => { s.name = v }) }} />
        </Field>
        <Field label="Mods" help="Only placed with / without optional mods (Saga › Mods; SagaLib 1.3).">
          <ModsCond value={sel?.mods} itemKey={`scatter:${sel?.id}`} onChange={(c) => ed((s) => { if (c) s.mods = c; else delete s.mods })} />
        </Field>
        <Field label="Id" help="SagaLib's name for it (data/sagaforge/scatter/<id>.json); the objects are <id>_1, <id>_2, …"><span class="mono">{sel.id}</span></Field>
        <Field label="How many" for="sc-c" help="Copies to place, each in a different star system (fewer if not enough places fit).">
          <input id="sc-c" type="number" min="1" max="50" value={sel.count} onchange={(e) => { const v = Math.max(1, Math.min(50, Math.round(Number(e.currentTarget.value) || 1))); ed((s) => { s.count = v }) }} />
        </Field>
        <Field label="Object" ref="locations-entity-types" help="A custom entity type (custom_entities.json): supply_cache, weapons_cache, derelict_probe, station_research, … or one of the mod's own types.">
          <IdInput value={sel.entity.type} options={types} width="220px" onCommit={(v) => ed((s) => { s.entity.type = v.trim() })} />
        </Field>
        <Field label="Its name" for="sc-en" help="The name on the map and in its dialog.">
          <input id="sc-en" type="text" value={sel.entity.name} onchange={(e) => { const v = e.currentTarget.value; ed((s) => { s.entity.name = v }) }} />
        </Field>
        <Field label="Measured from" help="Where criteria like &quot;within N light-years&quot; measure from: one of the mod's or the game's places (e.g. a colony the story starts at). Empty: from the player's fleet when the scatter is placed (at new game, the start).">
          <IdInput value={sel.from ?? ''} options={places} width="220px" placeholder="(the player)" onCommit={(v) => ed((s) => { s.from = v.trim() || undefined })} />
        </Field>
        <Field label="Existing saves" for="sc-ex" help="Also place them in a game that was started before the mod was added (on the next load), not only in new games.">
          <label class="chk"><input id="sc-ex" type="checkbox" checked={!!sel.addToExistingSaves} onchange={(e) => { const v = e.currentTarget.checked; ed((s) => { s.addToExistingSaves = v || undefined }) }} /> also in existing saves</label>
        </Field>
        <Field label="Loot" ref="loot-drop-groups" help="Drop groups its salvage rolls: one of the mod's loot pools (Saga › Pools, a loot table) or a vanilla group.">
          <div class="col">
            {#each sel.loot ?? [] as l, i (i)}
              <div class="row">
                <IdInput value={l.group} options={dropGroupChoices(m.pools ?? [], app.index)} width="170px" placeholder="drop group" onCommit={(v) => ed((s) => { if (s.loot) s.loot[i].group = v.trim() })} />
                <label class="small">rolls <input type="number" class="short" min="0" value={l.chances ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); ed((s) => { if (s.loot) s.loot[i].chances = v || undefined }) }} /></label>
                <button class="mini" onclick={() => ed((s) => { s.loot = (s.loot ?? []).filter((_, j) => j !== i); if (!s.loot.length) s.loot = undefined })}>✕</button>
              </div>
            {/each}
            <button class="mini" onclick={() => ed((s) => { s.loot = [...(s.loot ?? []), { group: lootPools[0]?.id ?? '', chances: 1 }] })}>+ Loot</button>
          </div>
        </Field>
        <Field label="Defenders" help="A fleet guarding each copy (vanilla's salvage defenders): faction and strength.">
          {#if sel.defenders}
            {@const d = sel.defenders}
            <div class="row">
              <IdInput value={d.faction} options={factions} width="120px" onCommit={(v) => ed((s) => { if (s.defenders) s.defenders.faction = v })} />
              <label class="small">strength <input type="number" class="short" min="0" value={d.minStr} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed((s) => { if (s.defenders) s.defenders.minStr = v }) }} />–<input type="number" class="short" min="0" value={d.maxStr} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed((s) => { if (s.defenders) s.defenders.maxStr = v }) }} /></label>
              <button class="mini" onclick={() => ed((s) => { s.defenders = undefined })}>✕</button>
            </div>
          {:else}<button class="mini" onclick={() => ed((s) => { s.defenders = { faction: 'pirates', minStr: 10, maxStr: 30 } })}>+ Defenders</button>{/if}
        </Field>
      </div>
      <div class="sect2">Where</div>
      <TargetEditor quest={sel.id} name="place" target={sel.target} scatter onChange={(t) => ed((s) => { s.target = t })} />
      <p><button class="mini danger" onclick={() => { const id = sel!.id; project.change((mm) => { mm.scatter = (mm.scatter ?? []).filter((x) => x.id !== id) }); selId = null }}>Delete scatter</button></p>
    {:else}<div class="muted">No scatter yet. <button class="mini" onclick={add}>+ New scatter</button></div>{/if}
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
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 520px); gap: 4px 10px; align-items: start; }
  .row { display: flex; gap: 6px; align-items: center; }
  .col { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .chk { display: flex; gap: 6px; align-items: center; }
  input.short { width: 56px; }
  .small { font-size: 12px; }
</style>
