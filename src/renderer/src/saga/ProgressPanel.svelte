<script lang="ts">
  import ConditionsEditor from '../quests/ConditionsEditor.svelte'
  // #67 U45: the condition pickers (only those that work outside a dialog are offered)
  let { templates = [] }: { templates?: { label: string; line: string }[] } = $props()
  /**
   * Saga › Progress (Phase 8d-3, RC-R12 b; DESIGN-PHASE8.md "8d"): the mod's own progress events,
   * a bar in the intel screen like vanilla's colony crises: stages at progress values (each runs
   * actions, or one outcome picked at random), monthly factors (points while conditions hold) and
   * one-time points from "Add progress" actions. SagaLib 1.2 runs them.
   */
  import type { ProgressEventPlan, ProgressStagePlan } from '../../../shared/model'
  import { MAX_PROGRESS_STAGES, progressStageKey } from '../../../shared/export/progress'
  import { uniqueId } from '../../../shared/quest'
  import { slug } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import OpsEditor from './OpsEditor.svelte'

  const m = $derived(project.m!)
  const list = $derived(m.progress ?? [])
  let selId = $state<string | null>(app.selected.progressEvent ?? null)
  const sel = $derived(list.find((x) => x.id === (selId ?? list[0]?.id)) ?? null)
  let stId = $state<string | null>(null)
  const st = $derived(sel?.stages.find((s) => s.id === (stId ?? sel.stages[0]?.id)) ?? null)

  const edP = (fn: (p: ProgressEventPlan) => void) => { const id = sel?.id; project.change((mm) => { const p = mm.progress?.find((x) => x.id === id); if (p) fn(p) }) }
  const edS = (fn: (s: ProgressStagePlan) => void) => { const sid = st?.id; edP((p) => { const s = p.stages.find((x) => x.id === sid); if (s) fn(s) }) }
  const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean)

  function add() {
    const id = uniqueId(`${m.project.prefix}progress`, list.map((x) => x.id))
    project.change((mm) => { mm.progress ??= []; mm.progress.push({ id, name: 'New event', max: 1000, startConditions: [], stages: [], factors: [] }) })
    selId = id
    stId = null
  }
  function addStage() {
    if (!sel) return
    const last = sel.stages[sel.stages.length - 1]?.progress ?? 0
    const id = uniqueId('stage', sel.stages.map((s) => s.id))
    edP((p) => { p.stages.push({ id, progress: Math.min(p.max, last + 250), title: 'New stage', text: '', actions: [] }) })
    stId = id
  }
</script>

<div class="split">
  <div class="side">
    <div class="sect">Progress events <button onclick={add}>+ New</button></div>
    <ul class="list">{#each list as p (p.id)}<li class:on={p.id === sel?.id}><button class="li" onclick={() => { selId = p.id; stId = null; app.selected.progressEvent = p.id }}>{p.name}<span class="sub">{p.stages.length}</span></button></li>{/each}</ul>
    {#if sel}
      <div class="sect">Stages <button onclick={addStage} disabled={sel.stages.length >= MAX_PROGRESS_STAGES}>+ New</button></div>
      <ul class="list">{#each sel.stages as s (s.id)}<li class:on={s.id === st?.id}><button class="li" onclick={() => (stId = s.id)}>{s.title}<span class="sub">{s.progress}</span></button></li>{/each}</ul>
    {/if}
    <p class="muted small pad">A bar in the intel screen (Major events) like vanilla's colony crises and Hyperspace Topography: it fills with monthly factors and one-time points ("Add progress" in quests, world events and dialog); each stage runs actions when the bar reaches it. Needs SagaLib 1.2.</p>
  </div>
  <div class="scroll pad">
    {#if sel}
      <div class="grid2">
        <Field label="Name" for="pe-n" help="The event's title in the intel screen.">
          <input id="pe-n" type="text" value={sel.name} onchange={(e) => { const v = e.currentTarget.value; edP((p) => { p.name = v }) }} />
        </Field>
        <Field label="Mods" help="Only starts with / without optional mods (Saga › Mods; SagaLib 1.3). Set automatically (greyed) when only conditional quests use it.">
          <ModsCond value={sel?.mods} itemKey={`progress:${sel?.id}`} onChange={(c) => edP((p) => { if (c) p.mods = c; else delete p.mods })} />
        </Field>
        <Field label="Id" help={`SagaLib's name for it (data/sagaforge/progress/<id>.json). ${progressStageKey(sel.id)} holds the last stage reached.`}><span class="mono">{sel.id}</span></Field>
        <Field label="Bar" help="The bar's maximum (vanilla's events use 1000) and its color: red when progress is bad for the player (a crisis), otherwise vanilla's normal color.">
          <span class="row">max <input type="number" class="short" min="1" value={sel.max} onchange={(e) => { const v = Math.max(1, Math.round(Number(e.currentTarget.value) || 1000)); edP((p) => { p.max = v }) }} />
            <label class="chk"><input type="checkbox" checked={!!sel.negative} onchange={(e) => { const v = e.currentTarget.checked; edP((p) => { p.negative = v || undefined }) }} /> bad for the player</label></span>
        </Field>
        <Field label="Starts when" ref="rules-conditions" help="Conditions for the event to appear (checked a few times a day). Empty: as soon as a game has the mod. An &quot;Add progress&quot; action also starts it. Outside any dialog: only $global and $player keys exist.">
          <ConditionsEditor lines={sel.startConditions} {templates} scope="global" placeholder="No conditions: it starts as soon as a game has the mod." onChange={(l) => edP((p) => { p.startConditions = l })} />
        </Field>
        <Field label="After the last" help="When the bar reaches the last stage: the event ends (it isn't started again), or it starts over from a lower value (the stages repeat).">
          <span class="row"><label class="chk"><input type="checkbox" checked={sel.restartAt !== undefined && sel.restartAt >= 0} onchange={(e) => { const v = e.currentTarget.checked; edP((p) => { p.restartAt = v ? 0 : undefined }) }} /> starts over at</label>
            {#if sel.restartAt !== undefined && sel.restartAt >= 0}<input type="number" class="short" min="0" value={sel.restartAt} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edP((p) => { p.restartAt = v }) }} />{:else}<span class="muted small">(the event ends)</span>{/if}</span>
        </Field>
        <Field label="Intel tab" ref="saga-intel-tabs" for="pe-t" help="An extra tab it is listed under (it is always under Major events), e.g. Colony threats or the mod's faction id.">
          <input id="pe-t" type="text" value={sel.tag ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); edP((p) => { p.tag = v || undefined }) }} />
        </Field>
        <Field label="Icon" for="pe-i" help="An image path for the event (e.g. graphics/icons/intel/…); empty: vanilla's unknown-event icon.">
          <input id="pe-i" type="text" class="mono" value={sel.icon ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); edP((p) => { p.icon = v || undefined }) }} />
        </Field>
      </div>

      <div class="sect2">Monthly factors <button class="mini" onclick={() => edP((p) => { p.factors.push({ id: uniqueId('factor', p.factors.map((f) => f.id)), desc: 'Something', points: 50, conditions: [] }) })}>+ add</button></div>
      <p class="f-help">Points each month while their conditions hold (one per line; empty: always), listed in the event like vanilla's factors. Negative points lower the bar.</p>
      {#each sel.factors as f, i (f.id)}
        <div class="row fac">
          <input type="text" value={f.desc} title="Shown in the event's list" placeholder="what it is" onchange={(e) => { const v = e.currentTarget.value; edP((p) => { p.factors[i].desc = v }) }} />
          <input type="number" class="short" value={f.points} title="Points per month" onchange={(e) => { const v = Math.round(Number(e.currentTarget.value) || 0); edP((p) => { p.factors[i].points = v }) }} />
          <button class="mini" onclick={() => edP((p) => { p.factors.splice(i, 1) })}>✕</button>
        </div>
        <div class="faccond"><ConditionsEditor lines={f.conditions} {templates} scope="global" placeholder="No conditions: every month." onChange={(l) => edP((p) => { p.factors[i].conditions = l })} /></div>
      {/each}

      {#if st}
        <h3>Stage: {st.title}</h3>
        <div class="grid2">
          <Field label="Title" for="ps-t" help="The stage's name on its marker and in the update when it is reached.">
            <input id="ps-t" type="text" value={st.title} onchange={(e) => { const v = e.currentTarget.value; edS((s) => { s.title = v; if (s.id.startsWith('stage')) { const n = slug(v); if (n && !(sel?.stages ?? []).some((x) => x.id === n)) s.id = n } }); }} />
          </Field>
          <Field label="Id" help="Its trigger is SF_progress_<event>_<id> (the rule with the actions below)."><span class="mono">{st.id}</span></Field>
          <Field label="At" for="ps-p" help={`Progress at which it is reached (above the stage before, at most ${sel.max}).`}>
            <span class="row"><input id="ps-p" type="number" class="short" min="1" max={sel.max} value={st.progress} onchange={(e) => { const v = Math.round(Number(e.currentTarget.value) || 0); edS((s) => { s.progress = v }) }} /></span>
          </Field>
          <Field label="Text" for="ps-x" help="Its tooltip, and shown under the bar while it is the last stage reached.">
            <textarea id="ps-x" rows="3" value={st.text} onchange={(e) => { const v = e.currentTarget.value; edS((s) => { s.text = v }) }}></textarea>
          </Field>
          <Field label="Icon" for="ps-i" help="An image for its marker on the bar (48 px like vanilla's); empty: vanilla's unknown-stage icon.">
            <input id="ps-i" type="text" class="mono" value={st.icon ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); edS((s) => { s.icon = v || undefined }) }} />
          </Field>
          <Field label="Outcomes" help="Optional: when the stage is reached one outcome is picked by weight and only its actions run (like vanilla's randomized crisis stages). $global.<event>_<stage>_outcome holds the pick.">
            <label class="chk"><input type="checkbox" checked={!!st.outcomes?.length} onchange={(e) => { const v = e.currentTarget.checked; edS((s) => { s.outcomes = v ? [{ id: 'good', label: 'Good', weight: 1, actions: [] }, { id: 'bad', label: 'Bad', weight: 1, actions: [] }] : undefined }) }} /> picks one outcome at random</label>
          </Field>
        </div>
        {#if st.outcomes?.length}
          {#each st.outcomes as o, oi (o.id)}
            <div class="outcome">
              <div class="row"><b>Outcome</b> <input type="text" class="mono short2" value={o.id} title="Id (its trigger ends in _<id>)" onchange={(e) => { const v = slug(e.currentTarget.value) || o.id; edS((s) => { if (s.outcomes) s.outcomes[oi].id = v }) }} />
                weight <input type="number" class="short" min="0" value={o.weight} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edS((s) => { if (s.outcomes) s.outcomes[oi].weight = v }) }} />
                <button class="mini" onclick={() => edS((s) => { s.outcomes = s.outcomes?.filter((_, j) => j !== oi) })}>✕</button></div>
              <OpsEditor label="It does" ops={o.actions} edit={(fn) => edS((s) => { if (s.outcomes) fn(s.outcomes[oi].actions) })} />
            </div>
          {/each}
          <button class="mini" onclick={() => edS((s) => { s.outcomes?.push({ id: uniqueId('outcome', (s.outcomes ?? []).map((x) => x.id)), label: '', weight: 1, actions: [] }) })}>+ Outcome</button>
        {:else}
          <OpsEditor label="When reached" ops={st.actions} edit={(fn) => edS((s) => fn(s.actions))} />
        {/if}
        <p class="muted small">SagaLib 1.4 runs the actions itself, without a dialog (what they give shows as campaign messages); an action that needs a dialog (a raw rules line) stays a rule. The game also shows an update with the stage's title.</p>
        <p><button class="mini danger" onclick={() => { const id = st.id; edP((p) => { p.stages = p.stages.filter((x) => x.id !== id) }); stId = null }}>Delete stage</button></p>
      {/if}
      <p><button class="mini danger" onclick={() => { if (!confirm(`Delete the progress event "${sel.name}"?`)) return; const id = sel.id; project.change((mm) => { mm.progress = (mm.progress ?? []).filter((x) => x.id !== id) }); selId = null }}>Delete progress event</button></p>
    {:else}<p class="muted">No progress event yet: + New.</p>{/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; min-height: 0; }
  .side { border-right: 1px solid var(--border); overflow: auto; background: var(--panel); }
  .scroll { overflow: auto; }
  .pad { padding: 10px 14px; }
  .sect, .sect2 { display: flex; justify-content: space-between; align-items: center; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px 4px; }
  .sect2 { padding: 14px 0 4px; justify-content: flex-start; gap: 10px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 10px; display: flex; justify-content: space-between; }
  .list li.on .li { background: var(--accent-2); color: #fff; }
  .sub { color: var(--muted); font-size: 11px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 520px); gap: 4px 10px; align-items: start; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .fac { margin: 3px 0; }
  .chk { display: flex; gap: 6px; align-items: center; }
  input.short { width: 64px; }
  input.short2 { width: 110px; }
  textarea { width: 100%; box-sizing: border-box; }
  .outcome { border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; margin: 6px 0; max-width: 640px; }
  .small { font-size: 12px; }
  h3 { margin: 16px 0 6px; font-size: 13px; }
  .faccond { margin: 0 0 8px 18px; }
</style>
