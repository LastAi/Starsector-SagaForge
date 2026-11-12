<script lang="ts">
  /** Encounters (PLAN.md §4.6, mock-up encounters.html): fleets, spawn, behavior, comm dialog, outcomes. */
  import type { EncounterDef } from '../../../shared/model'
  import { newEncounter, newCommDialog, encounterUses } from '../../../shared/encounters'
  import { slug } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Modal from '../ui/Modal.svelte'

  const m = $derived(project.m)
  const index = $derived(app.index!)
  const sel = $derived(app.selected.encounters ?? null)
  const enc = $derived(m?.encounters.find((e) => e.id === sel) ?? null)
  const ed = (fn: (e: EncounterDef) => void) => { const id = sel; project.change((mm) => { const e = mm.encounters.find((x) => x.id === id); if (e) fn(e) }) }
  const factions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })) ?? []), ...index.factions])
  const entities = $derived([...(m?.systems.flatMap((s) => s.entities.map((e) => ({ id: e.id, name: `${e.name} (${s.name})` }))) ?? []), ...index.markets.flatMap((x) => x.entities.map((id) => ({ id, name: x.name })))])
  const uses = $derived(enc && m ? encounterUses(m.quests, enc.id) : [])
  const probs = $derived(problems.live.filter((p) => p.ref?.page === 'encounters' && p.ref.id === sel || (p.area === 'Encounter' && p.message.includes(enc?.name ?? '\u0000'))))

  let showNew = $state(false)
  let newName = $state('')
  function create() {
    const id = project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), '')
    if (!newName.trim() || m?.encounters.some((e) => e.id === id)) { app.error = `The id "${id}" is already used.`; return }
    project.change((mm) => { mm.encounters.push(newEncounter(id, newName.trim(), 'pirates')) })
    app.selected.encounters = id
    showNew = false; newName = ''
  }
  function makeComm() {
    if (!enc) return
    const q = newCommDialog($state.snapshot(enc) as EncounterDef)
    if (m?.quests.some((x) => x.id === q.id)) { app.go('quests', q.id); return }
    const id = enc.id
    project.change((mm) => { mm.quests.push(q); const e = mm.encounters.find((x) => x.id === id); if (e) e.commDialog = q.id })
    app.go('quests', q.id)
  }
  function remove() {
    if (!enc || !confirm(`Delete "${enc.name}"?`)) return
    const id = enc.id
    project.change((mm) => { mm.encounters = mm.encounters.filter((e) => e.id !== id) })
    app.selected.encounters = null
  }
  const fleetTypes = $derived(app.defs.fleetTypes)
</script>

<div class="page">
  <aside class="left">
    <div class="sect">Encounters <button disabled={!m} onclick={() => (showNew = true)}>+ New</button></div>
    <ul class="list">
      {#each m?.encounters ?? [] as e (e.id)}<li class:on={sel === e.id}><button class="li" onclick={() => (app.selected.encounters = e.id)}>{e.name}<span class="sub">{e.fleet.faction} · {e.fleet.size === 'fp' ? `${e.fleet.points} FP` : `${e.fleet.variants?.length ?? 0} ships`}</span></button></li>{:else}<li class="muted small pad">{m ? 'None yet.' : 'Pick an active mod first.'}</li>{/each}
    </ul>
  </aside>
  <section class="main">
    {#if enc}
      <div class="head"><h2>{enc.name}</h2><span class="mono muted">{enc.id}</span><span class="spacer"></span><span class="badge b-lib">SagaLib</span><button class="mini danger" onclick={remove}>Delete</button></div>
      <div class="body">
        <div class="cols">
          <div class="group">
            <div class="gt">Fleet</div>
            <div class="grid2">
              <label for="en-n">Name</label><input id="en-n" type="text" value={enc.name} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.name = v }) }} />
              <span class="lbl">Faction</span><IdInput value={enc.fleet.faction} options={factions} strict onCommit={(v) => ed((x) => { x.fleet.faction = v })} />
              <label for="en-t">Fleet type</label><select id="en-t" value={enc.fleet.type} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.fleet.type = v }) }}>{#each fleetTypes as t (t.id)}<option value={t.id}>{t.name} ({t.id})</option>{/each}</select>
              <label for="en-s">Ships</label><select id="en-s" value={enc.fleet.size} onchange={(e) => { const v = e.currentTarget.value as 'fp' | 'explicit'; ed((x) => { x.fleet.size = v }) }}><option value="fp">from the faction's doctrine (fleet points)</option><option value="explicit">exact variants</option></select>
              {#if enc.fleet.size === 'fp'}
                <label for="en-p">Fleet points</label><input id="en-p" type="number" value={enc.fleet.points ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.fleet.points = v }) }} />
              {:else}
                <span class="lbl">Variants</span>
                <div class="chips">{#each enc.fleet.variants ?? [] as v, i (i)}<span class="chip">{v}<button class="x" onclick={() => ed((x) => { x.fleet.variants!.splice(i, 1) })}>✕</button></span>{/each}
                  <IdInput value="" options={index.variants} width="190px" placeholder="+ variant" clearOnCommit onCommit={(v) => { if (v) ed((x) => { (x.fleet.variants ??= []).push(v) }) }} /></div>
              {/if}
              <label for="en-q">Quality</label><input id="en-q" type="number" step="0.1" min="0" max="1" value={enc.fleet.quality ?? 0.5} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.fleet.quality = v }) }} />
              <span class="lbl">Flagship by</span><IdInput value={enc.fleet.flagshipCommander ?? ''} options={m?.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })) ?? []} placeholder="(a generated officer)" onCommit={(v) => ed((x) => { x.fleet.flagshipCommander = v || undefined })} />
              <label for="en-fn">Fleet name</label><input id="en-fn" type="text" value={enc.fleet.name ?? ''} placeholder="(the faction's default)" onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.fleet.name = v || undefined }) }} />
            </div>
          </div>
          <div class="group">
            <div class="gt">Spawn and behavior</div>
            <div class="grid2">
              <span class="lbl">At</span><IdInput value={enc.spawn.at} options={entities} onCommit={(v) => ed((x) => { x.spawn.at = v })} placeholder="entity id" />
              <label for="en-w">When</label><select id="en-w" value={enc.spawn.when} onchange={(e) => { const v = e.currentTarget.value as EncounterDef['spawn']['when']; ed((x) => { x.spawn.when = v }) }}><option value="quest-stage">when a quest spawns it</option><option value="new-game">once, on a new game</option><option value="periodic">kept alive, respawning</option></select>
              {#if enc.spawn.when === 'quest-stage'}
                <label for="en-qs">Quest</label><select id="en-qs" value={enc.spawn.quest ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.quest = v || undefined }) }}><option value="">(by an Encounter node)</option>{#each m?.quests.filter((q) => q.kind === 'quest') ?? [] as q (q.id)}<option value={q.id}>{q.title}</option>{/each}</select>
                {#if enc.spawn.quest}<label for="en-st">At stage</label><select id="en-st" value={enc.spawn.stage ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.stage = v || undefined }) }}><option value="">—</option>{#each m?.quests.find((q) => q.id === enc.spawn.quest)?.stages ?? [] as s (s.id)}<option value={s.id}>{s.title}</option>{/each}</select>{/if}
                <span></span><label class="chk"><input type="checkbox" checked={!!enc.spawn.despawnOnStageEnd} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.spawn.despawnOnStageEnd = v }) }} /> leaves when the stage ends</label>
              {:else if enc.spawn.when === 'periodic'}
                <label for="en-d">Respawn after</label><input id="en-d" type="number" value={enc.spawn.days ?? 30} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.spawn.days = v }) }} />
              {/if}
              <label for="en-b">Behavior</label><select id="en-b" value={enc.behavior} onchange={(e) => { const v = e.currentTarget.value as EncounterDef['behavior']; ed((x) => { x.behavior = v }) }}><option value="ambush">ambush (wait aggressively)</option><option value="guard">guard the place</option><option value="patrol">patrol the system</option><option value="intercept-player">intercept the player</option><option value="travel">travel somewhere</option></select>
              {#if enc.behavior === 'travel'}<span class="lbl">To</span><IdInput value={enc.travelTo ?? ''} options={entities} onCommit={(v) => ed((x) => { x.travelTo = v })} />{/if}
              <span class="lbl">Flags</span>
              <div class="flags">
                {#each [['hostile', 'hostile to the player'], ['noRepImpact', 'no reputation loss for fighting it'], ['important', 'important (marked on the map)'], ['allowDisengage', 'player may disengage']] as [k, label] (k)}
                  <label class="chk"><input type="checkbox" checked={!!enc.flags[k as 'hostile']} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.flags[k as 'hostile'] = v }) }} /> {label}</label>
                {/each}
              </div>
            </div>
          </div>
        </div>
        <div class="group">
          <div class="gt">Comm-link dialog</div>
          {#if enc.commDialog}
            <p>Greeting and options: <button class="lnk" onclick={() => app.go('quests', enc.commDialog!)}>{m?.quests.find((q) => q.id === enc.commDialog)?.title ?? enc.commDialog}</button> (edited in the quest editor). It applies only to this fleet (<span class="mono">$entity.sagaforge_encounter == {enc.id}</span>), so other {enc.fleet.faction} fleets keep vanilla's greetings.</p>
          {:else}
            <p class="muted">Without one, the fleet uses its faction's vanilla greeting.</p><button onclick={makeComm}>+ Create a comm-link dialog</button>
          {/if}
        </div>
        <div class="group">
          <div class="gt">Outcomes (in the quests that spawn it)</div>
          {#each uses as u (u.quest.id + u.node)}
            <div class="row"><button class="lnk" onclick={() => { app.go('quests', u.quest.id); app.selected.questNode = u.node }}>{u.quest.title} · {u.node}</button>
              <span class:good={u.defeated} class:bad={!u.defeated}>Defeated {u.defeated ? '→ continues' : '(not set)'}</span>
              <span class:good={u.avoided} class:bad={!u.avoided}>Avoided {u.avoided ? '→ continues' : '(not set)'}</span></div>
          {:else}<p class="muted small">No quest has an Encounter node for it yet.</p>{/each}
        </div>
        {#if probs.length}<ul class="probs">{#each probs as p, i (i)}<li class:bad={p.level === 'error'} class:warn={p.level !== 'error'}>{p.message}</li>{/each}</ul>{/if}
      </div>
    {:else}
      <div class="center muted">Pick an encounter, or create one. An Encounter node in a quest spawns it; its outcomes lead back into the quest.</div>
    {/if}
  </section>
</div>

{#if showNew}
  <Modal title="New encounter" onClose={() => (showNew = false)}>
    <div class="grid2"><label for="ne-n">Name</label><input id="ne-n" type="text" bind:value={newName} placeholder="Belt ambush" /><span class="lbl">Id</span><span class="mono">{project.prefix}{slug(newName)}</span></div>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newName.trim()} onclick={create}>Create</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; grid-template-columns: 280px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { display: flex; gap: 6px; width: 100%; border: none; background: none; padding: 4px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .body { padding: 12px 14px; overflow: auto; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; background: #161a20; font-size: 12px; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .grid2 { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 5px 8px; align-items: center; }
  .grid2 label, .lbl { color: var(--muted); font-size: 12px; }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; padding: 3px 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--text); }
  .flags { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; gap: 14px; align-items: center; }
  .lnk { border: none; background: none; padding: 0; color: var(--accent); font-size: 12px; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; line-height: 16px; }
  .b-lib { color: var(--accent); border-color: var(--accent-2); background: #102233; }
  .probs { font-size: 12px; padding-left: 18px; }
  .good { color: var(--good); } .bad { color: var(--bad); } .warn { color: var(--warn); }
  .center { display: grid; place-items: center; height: 100%; text-align: center; padding: 20px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 4px 10px; }
</style>
