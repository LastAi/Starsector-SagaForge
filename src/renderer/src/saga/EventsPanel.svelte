<script lang="ts">
  import ConditionsEditor from '../quests/ConditionsEditor.svelte'
  // #67 U45: the condition pickers (only those that work outside a dialog are offered)
  let { templates = [] }: { templates?: { label: string; line: string }[] } = $props()
  import VersionStrip from '../ui/VersionStrip.svelte'
  import { itemVer } from '../state/itemver.svelte'
  /**
   * Saga › Events (Phase 8d, RC-R12; DESIGN-PHASE8.md "8d"): event schedulers. A scheduler keeps
   * between min and max of its events running and checks every few days; an event is picked like
   * a pool entry (weight, conditions, once, cooldown), runs for some days, can post a news item and
   * runs actions when it starts and ends. SagaLib 1.2 runs them without the player starting them.
   */
  import type { ActionOp, EventSchedulerPlan, WorldEventPlan } from '../../../shared/model'
  import { EVENT_OPS, eventActiveKey, eventForceKey } from '../../../shared/export/events'
  import { uniqueId, firstStageOf } from '../../../shared/quest'
  import StartQuestOp from '../quests/StartQuestOp.svelte'
  import RepTargetFields from '../quests/RepTargetFields.svelte'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import PluginFields from '../quests/PluginFields.svelte'
  import { pluginClassChoices } from '../../../shared/plugins'

  const m = $derived(project.m!)
  const list = $derived(m.events ?? [])
  let selId = $state<string | null>(app.selected.eventScheduler ?? null)
  // #64: the scheduler as in the open version (the versions strip)
  const sel = $derived(((s) => itemVer.view('events', s?.id, s))(list.find((x) => x.id === (selId ?? list[0]?.id)) ?? null))
  let evId = $state<string | null>(null)
  const ev = $derived(sel?.events.find((e) => e.id === (evId ?? sel.events[0]?.id)) ?? null)

  const TAGS = ['Major events', 'Colony threats', 'Hostilities', 'Military', 'Exploration', 'Story']
  const places = $derived([...m.systems.flatMap((sy) => sy.entities.flatMap((e) => [{ id: e.id, name: `${e.name} (${sy.name})` }, ...(e.market && e.market.id !== e.id ? [{ id: e.market.id, name: `${e.market.name} market` }] : [])])), ...(app.index?.markets ?? []).map((x) => ({ id: x.id, name: `${x.name} market`, definedBy: x.definedBy }))])
  // #60: index factions keep their source (the mod's own have none: always shown)
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })), ...(app.index?.factions ?? []).map((f) => ({ id: f.id, definedBy: f.definedBy }))])
  const deferred = $derived(m.systems.flatMap((s) => s.entities.filter((e) => !!e.appears)))

  const edS = (fn: (s: EventSchedulerPlan) => void) => { const id = sel?.id; if (id) itemVer.edit<EventSchedulerPlan>('events', id, (s) => fn(s)) }
  const edE = (fn: (e: WorldEventPlan) => void) => { const id = ev?.id; edS((s) => { const e = s.events.find((x) => x.id === id); if (e) fn(e) }) }

  function addScheduler() {
    const id = uniqueId(`${m.project.prefix}events`, [...list.map((x) => x.id), ...(m.pools ?? []).map((p) => p.id)])
    project.change((mm) => { mm.events ??= []; mm.events.push({ id, name: 'Sector news', min: 0, max: 1, intervalDays: 30, events: [] }) })
    selId = id
    evId = null
  }
  function addEvent() {
    if (!sel) return
    const id = uniqueId(`${m.project.prefix}event`, list.flatMap((s) => s.events.map((e) => e.id)))
    edS((s) => { s.events.push({ id, name: 'New event', weight: 1, conditions: [], durationDays: 30, news: { title: 'Something happened', text: '', days: 30 }, start: [], end: [] }) })
    evId = id
  }

  const OPS: Record<string, string> = { set: 'Set a flag', unset: 'Clear a flag', rep: 'Reputation', credits: 'Credits', item: 'Give items', spawn: 'Spawn an encounter', despawn: 'Despawn an encounter', placeEntity: 'Place an object', removeEntity: 'Remove an object', startQuest: 'Start a quest', storyPoints: 'Story points', xp: 'Experience', progress: 'Add progress', plugin: "Run a plugin (the mod's Java)", line: 'Script line' }
  function fresh(op: ActionOp['op']): ActionOp {
    switch (op) {
      // #79 (SagaLib 1.4): the mod's own plugin class; no quest here, so its context has no quest or node
      case 'plugin': return { op, className: pluginClassChoices(project.loaded?.jars).find((c) => c.name.startsWith('plugin'))?.id ?? '', args: [] }
      case 'set': return { op, key: `$global.${ev?.id ?? 'event'}_happened`, value: 'true' }
      case 'unset': return { op, key: '' }
      case 'rep': return { op, faction: factions[0]?.id ?? '', amount: 5 }
      case 'credits': return { op, amount: 1000 }
      case 'item': return { op, item: '', qty: 1 }
      case 'spawn': case 'despawn': return { op, encounter: m.encounters[0]?.id ?? '' }
      case 'placeEntity': return { op, entity: deferred[0]?.id ?? '' }
      case 'removeEntity': return { op, entity: '' }
      case 'startQuest': return { op, quest: m.quests[0]?.id ?? '', stage: m.quests[0] ? firstStageOf(m.quests[0]) : undefined }
      case 'storyPoints': return { op, amount: 1 }
      case 'xp': return { op, amount: 1000 }
      case 'progress': return { op, event: m.progress?.[0]?.id ?? '', points: 100, text: '' }
      default: return { op: 'line', line: '' }
    }
  }
  const setOp = (part: 'start' | 'end', i: number, k: string, v: unknown) => edE((e) => { (e[part][i] as Record<string, unknown>)[k] = v })
</script>

<div class="split">
  <div class="side">
    <div class="sect">Event schedulers <button onclick={addScheduler}>+ New</button></div>
    <ul class="list">{#each list as s (s.id)}<li class:on={s.id === sel?.id}><button class="li" onclick={() => { selId = s.id; evId = null; app.selected.eventScheduler = s.id }}>{s.name}<span class="sub">{s.events.length}</span></button></li>{/each}</ul>
    {#if sel}
      <div class="sect">Events <button onclick={addEvent}>+ New</button></div>
      <ul class="list">{#each sel.events as e (e.id)}<li class:on={e.id === ev?.id}><button class="li" onclick={() => (evId = e.id)}>{e.name}<span class="sub">{e.weight}</span></button></li>{/each}</ul>
    {/if}
    <p class="muted small pad">Things that happen in the sector without the player starting them, like vanilla's bounties and hostilities: a scheduler keeps some of its events running and starts new ones every few days. Each event can post a news item and run actions when it starts and ends. Needs SagaLib 1.2.</p>
  </div>
  <!-- #67 U16: the strip and the form share the right column -->
  <div class="main">
  {#if sel}<VersionStrip kind="events" id={sel.id} what="this scheduler and its events" />{/if}
  <div class="scroll pad">
    {#if sel}
      <div class="grid2">
        <Field label="Name" for="ev-n" help="For you (the scheduler isn't shown in game).">
          <input id="ev-n" type="text" value={sel.name} onchange={(e) => { const v = e.currentTarget.value; edS((s) => { s.name = v }) }} />
        </Field>
        <Field label="Mods" help="Only runs with / without optional mods (Saga › Mods; SagaLib 1.3).">
          <ModsCond value={sel?.mods} itemKey={`events:${sel?.id}`} onChange={(c) => edS((s) => { if (c) s.mods = c; else delete s.mods })} />
        </Field>
        <Field label="Id" help="SagaLib's name for it (data/sagaforge/events/<id>.json)."><span class="mono">{sel.id}</span></Field>
        <Field label="Running" help="How many of its events run at the same time: it starts new ones until the most are running, a day apart while fewer than the least run.">
          <span class="row">at least <input type="number" class="short" min="0" value={sel.min} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edS((s) => { s.min = v }) }} />
            at most <input type="number" class="short" min="0" value={sel.max} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edS((s) => { s.max = v }) }} /></span>
        </Field>
        <Field label="Check every" for="ev-i" help="Days between checks (each one varies by a quarter either way). Vanilla's bounties check daily, its hostilities every 10 days.">
          <span class="row"><input id="ev-i" type="number" class="short" min="1" value={sel.intervalDays} onchange={(e) => { const v = Math.max(1, Number(e.currentTarget.value) || 30); edS((s) => { s.intervalDays = v }) }} /> days</span>
        </Field>
        <Field label="First check" for="ev-f" help="Days after the mod is in a game before the first check (0: one interval). Lets a new game settle first.">
          <span class="row"><input id="ev-f" type="number" class="short" min="0" value={sel.firstAfterDays ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edS((s) => { s.firstAfterDays = v || undefined }) }} /> days</span>
        </Field>
        <Field label="Test" help="In dev mode, a test profile (Saga › Test profiles) can start one event at once: give it the flag below with the event's id as value.">
          <span class="mono small">{eventForceKey(sel.id)} = &lt;event id&gt;</span>
        </Field>
      </div>
      <p><button class="mini danger" onclick={() => { if (!confirm(`Delete the scheduler "${sel.name}" and its ${sel.events.length} events?`)) return; const id = sel.id; project.change((mm) => { mm.events = (mm.events ?? []).filter((x) => x.id !== id) }); selId = null }}>Delete scheduler</button></p>

      {#if ev}
        <h3>{ev.name}</h3>
        <div class="grid2">
          <Field label="Name" for="we-n" help="For you; the player sees the news item's title.">
            <input id="we-n" type="text" value={ev.name} onchange={(e) => { const v = e.currentTarget.value; edE((x) => { x.name = v }) }} />
          </Field>
          <Field label="Id" help="Its flag while it runs is shown below; its actions are the rules SF_event_<id>_start and _end."><span class="mono">{ev.id}</span></Field>
          <Field label="Mods" help="Only picked with / without optional mods (Saga › Mods): exported as SF_HasMod conditions of the event.">
            <ModsCond value={ev.mods} itemKey={`event:${sel.id}/${ev.id}`} onChange={(c) => edE((x) => { if (c) x.mods = c; else delete x.mods })} />
          </Field>
          <Field label="Weight" for="we-w" help="How likely it is picked, against the scheduler's other events that can run now.">
            <span class="row"><input id="we-w" type="number" class="short" min="0" step="0.5" value={ev.weight} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edE((x) => { x.weight = v }) }} /></span>
          </Field>
          <Field label="Runs for" for="we-d" help={`Days it counts as running: ${eventActiveKey(ev.id)} is true meanwhile, and its end actions run after. 0: it starts and ends at once.`}>
            <span class="row"><input id="we-d" type="number" class="short" min="0" value={ev.durationDays} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edE((x) => { x.durationDays = v }) }} /> days</span>
          </Field>
          <Field label="How often" help="Once per playthrough, a cooldown after it started, or at most a number of times.">
            <span class="row">
              <label class="chk"><input type="checkbox" checked={!!ev.once} onchange={(e) => { const v = e.currentTarget.checked; edE((x) => { x.once = v || undefined }) }} /> once</label>
              cooldown <input type="number" class="short" min="0" value={ev.cooldownDays ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); edE((x) => { x.cooldownDays = v || undefined }) }} /> days
              at most <input type="number" class="short" min="0" value={ev.max ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edE((x) => { x.max = v || undefined }) }} /> times
            </span>
          </Field>
          <Field label="At once" help="Normally an event runs once at a time, and when it comes back its new news item replaces the old one. Tick to let it start again while it still runs: each run gets its own news item and end (e.g. several raids at once).">
            <label class="chk"><input type="checkbox" checked={!!ev.stack} onchange={(e) => { const v = e.currentTarget.checked; edE((x) => { x.stack = v || undefined }) }} /> can run several at once</label>
          </Field>
          <Field label="Conditions" ref="rules-conditions" help="All must hold for it to be picked. It runs outside any dialog: only $global and $player keys exist.">
            <ConditionsEditor lines={ev.conditions} {templates} scope="global" placeholder="No conditions: it can always be picked." onChange={(l) => edE((x) => { x.conditions = l })} />
          </Field>
          <Field label="News item" help="Shown in the intel screen when the event starts, like vanilla's notifications.">
            <label class="chk"><input type="checkbox" checked={!!ev.news} onchange={(e) => { const v = e.currentTarget.checked; edE((x) => { x.news = v ? { title: x.name, text: '', days: 30 } : undefined }) }} /> post a news item</label>
          </Field>
          {#if ev.news}
            {@const n = ev.news}
            <Field label="Title" for="we-t" help="The intel entry's title and the notification line.">
              <input id="we-t" type="text" value={n.title} onchange={(e) => { const v = e.currentTarget.value; edE((x) => { if (x.news) x.news.title = v }) }} />
            </Field>
            <Field label="Text" for="we-x" help="The entry's text when the player opens it.">
              <textarea id="we-x" rows="3" value={n.text} onchange={(e) => { const v = e.currentTarget.value; edE((x) => { if (x.news) x.news.text = v }) }}></textarea>
            </Field>
            <Field label="Intel tab" ref="saga-intel-tabs" help="Where it is listed in the intel screen (vanilla's tags; another word makes a tab of its own).">
              <IdInput value={n.tag ?? 'Major events'} options={TAGS.map((t) => ({ id: t }))} width="180px" onCommit={(v) => edE((x) => { if (x.news) x.news.tag = v.trim() || undefined })} />
            </Field>
            <Field label="On the map" help="An object or market the entry points at on the map (empty: none).">
              <IdInput value={n.at ?? ''} options={places} width="220px" placeholder="(no place)" onCommit={(v) => edE((x) => { if (x.news) x.news.at = v.trim() || undefined })} />
            </Field>
            <Field label="Icon" for="we-ic" help="An image path for the entry (e.g. graphics/icons/intel/…); empty: vanilla's log icon.">
              <input id="we-ic" type="text" class="mono" value={n.icon ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); edE((x) => { if (x.news) x.news.icon = v || undefined }) }} />
            </Field>
            <Field label="Shown for" for="we-nd" help="Days the entry stays in the intel screen (unless the player marks it important).">
              <span class="row"><input id="we-nd" type="number" class="short" min="1" value={n.days} onchange={(e) => { const v = Math.max(1, Number(e.currentTarget.value) || 30); edE((x) => { if (x.news) x.news.days = v }) }} /> days</span>
            </Field>
          {/if}
        </div>
        {#each (['start', 'end'] as const) as part (part)}
          <div class="sect2">When it {part === 'start' ? 'starts' : 'ends'}
            <select value="" onchange={(e) => { const v = e.currentTarget.value as ActionOp['op']; e.currentTarget.value = ''; if (v) edE((x) => { x[part].push(fresh(v)) }) }}><option value="">+ add…</option>{#each EVENT_OPS as o (o)}<option value={o}>{OPS[o]}</option>{/each}</select>
          </div>
          {#each ev[part] as op, i (i)}
            <div class="row op">
              <span class="opl">{OPS[op.op] ?? op.op}</span>
              {#if op.op === 'set'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(part, i, 'key', e.currentTarget.value)} /><span>=</span><input type="text" class="mono short" value={op.value} title="Value" onchange={(e) => setOp(part, i, 'value', e.currentTarget.value)} />
              {:else if op.op === 'unset'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(part, i, 'key', e.currentTarget.value)} />
              {:else if op.op === 'credits' || op.op === 'storyPoints' || op.op === 'xp'}<input type="number" value={op.amount} title="Amount" onchange={(e) => setOp(part, i, 'amount', Number(e.currentTarget.value))} />
              {:else if op.op === 'rep'}<RepTargetFields faction={op.faction} person={op.person} {factions} onChange={(f, p) => { setOp(part, i, 'faction', f); setOp(part, i, 'person', p) }} /><input type="number" class="short" value={op.amount} title="points" onchange={(e) => setOp(part, i, 'amount', Number(e.currentTarget.value))} />
              {:else if op.op === 'item'}<IdInput value={op.item} options={[...m.items.map((x) => ({ id: x.id, name: x.name })), ...(app.index?.items ?? [])]} width="140px" placeholder="item id" onCommit={(v) => setOp(part, i, 'item', v)} /><input type="number" class="short" value={op.qty} title="Quantity" onchange={(e) => setOp(part, i, 'qty', Number(e.currentTarget.value))} />
              {:else if op.op === 'spawn' || op.op === 'despawn'}<select value={op.encounter} onchange={(e) => setOp(part, i, 'encounter', e.currentTarget.value)}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
              {:else if op.op === 'startQuest'}<StartQuestOp quest={op.quest} stage={op.stage} quests={m.quests} onChange={(qq, st) => { setOp(part, i, 'quest', qq); setOp(part, i, 'stage', st) }} />
              {:else if op.op === 'placeEntity'}<select value={op.entity} onchange={(e) => setOp(part, i, 'entity', e.currentTarget.value)}><option value="">—</option>{#each deferred as d (d.id)}<option value={d.id}>{d.name} ({d.id})</option>{/each}</select>
              {:else if op.op === 'removeEntity'}<IdInput value={op.entity} options={places} width="170px" placeholder="object id" onCommit={(v) => setOp(part, i, 'entity', v)} />
              {:else if op.op === 'progress'}<select value={op.event} onchange={(e) => setOp(part, i, 'event', e.currentTarget.value)}><option value="">—</option>{#each m.progress ?? [] as pe (pe.id)}<option value={pe.id}>{pe.name}</option>{/each}</select><input type="number" class="short" value={op.points} title="Points (negative lowers it)" onchange={(e) => setOp(part, i, 'points', Number(e.currentTarget.value))} /><input type="text" value={op.text ?? ''} placeholder="text in the event's list" title="Shown in the event's one-time factors" onchange={(e) => setOp(part, i, 'text', e.currentTarget.value)} />
              {:else if op.op === 'plugin'}<PluginFields compact className={op.className} args={op.args} onClass={(v) => setOp(part, i, 'className', v)} onArgs={(a) => setOp(part, i, 'args', a)} />
              {:else if op.op === 'line'}<input type="text" class="mono" value={op.line} onchange={(e) => setOp(part, i, 'line', e.currentTarget.value)} />{/if}
              <button class="mini" onclick={() => edE((x) => { x[part].splice(i, 1) })}>✕</button>
            </div>
          {/each}
        {/each}
        <p class="muted small">SagaLib 1.4 runs the actions itself, without a dialog (what they give shows as campaign messages); an action that needs a dialog (a raw rules line) stays a rule on the triggers SF_event_{ev.id}_start and _end. A spawned encounter appears at its own place (Encounters › At); remove it in the end actions.</p>
        <p><button class="mini danger" onclick={() => { const id = ev.id; edS((s) => { s.events = s.events.filter((x) => x.id !== id) }); evId = null }}>Delete event</button></p>
      {:else}<p class="muted">No events yet: + New.</p>{/if}
    {:else}<p class="muted">No event scheduler yet: + New.</p>{/if}
  </div>
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; min-height: 0; }
  .side { border-right: 1px solid var(--border); overflow: auto; background: var(--panel); }
  .main { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .scroll { overflow: auto; flex: 1; min-height: 0; }
  .pad { padding: 10px 14px; }
  .sect, .sect2 { display: flex; justify-content: space-between; align-items: center; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px 4px; }
  .sect2 { padding: 14px 0 4px; justify-content: flex-start; gap: 10px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 10px; display: flex; justify-content: space-between; }
  .list li.on .li { background: var(--accent-2); color: #fff; }
  .sub { color: var(--muted); font-size: 11px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 520px); gap: 4px 10px; align-items: start; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .op { margin: 3px 0; }
  .opl { min-width: 140px; font-size: 12px; }
  .chk { display: flex; gap: 6px; align-items: center; }
  input.short { width: 64px; }
  textarea { width: 100%; box-sizing: border-box; }
  .small { font-size: 12px; }
  h3 { margin: 16px 0 6px; font-size: 13px; }
</style>
