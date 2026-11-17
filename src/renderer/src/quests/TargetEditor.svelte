<script lang="ts">
  /**
   * Phase 7c (RC-R1): a random target's search, with vanilla's HubMissionWithSearch criteria
   * (shared/targets.ts). Requires all hold; prefers are tried in order and each is dropped when it
   * would leave nothing. SagaLib runs it when the quest is offered; Play mode uses the mock.
   */
  import Field from '../ui/Field.svelte'
  import { CRITERIA, criteriaFor, criterion, defaultArgs, newTarget, RUINS_SIZES, TARGET_DETAILS, TARGET_FACTS, type TargetPick } from '../../../shared/targets'
  import { app } from '../state/app.svelte'
  import type { Criterion, TargetDef } from '../../../shared/model'

  interface Props { quest: string; name: string; target: TargetDef | undefined; onChange: (t: TargetDef) => void; /** Phase 7e: for a scatter (no facts, mock or person). */ scatter?: boolean }
  let { quest, name, target, onChange, scatter = false }: Props = $props()

  const t = $derived(target ?? newTarget())
  const upd = (fn: (x: TargetDef) => void) => { const c: TargetDef = JSON.parse(JSON.stringify(t)); fn(c); onChange(c) }
  const PICKS: { id: TargetPick; label: string; help: string }[] = [
    { id: 'planet', label: 'a planet', help: 'A planet or moon (vanilla pickPlanet): system criteria pick its system first.' },
    { id: 'entity', label: 'an entity', help: 'A station, derelict, probe, cache… (pickEntity), by custom entity type or tags.' },
    { id: 'system', label: 'a star system', help: 'A whole system (pickSystem): Arrive is true anywhere in it.' },
    { id: 'market', label: 'a market', help: 'A colony (pickMarket). Vanilla\'s market search ignores system criteria; use market ones.' }
  ]
  const GROUPS: Record<string, string> = { system: 'System', planet: 'Planet', entity: 'Entity', market: 'Market' }
  const fits = $derived(criteriaFor(t.pick))
  const add = (list: 'require' | 'prefer', id: string) => {
    const spec = criterion(id)
    if (!spec) return
    upd((x) => { const l = x[list]; l.push({ id, args: defaultArgs(spec) }) })
  }
  const setArg = (list: 'require' | 'prefer', i: number, a: number, v: Criterion['args'][number]) => upd((x) => { x[list][i].args[a] = v })
  const move = (i: number, d: number) => upd((x) => { const l = x.prefer; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]] })
  /** Vanilla's own danger tags: theme_unsafe (powerful fleets; vanilla's mission filter avoids it) and active Remnant systems. */
  const DANGER = ['theme_unsafe', 'theme_remnant_main', 'theme_remnant_secondary']
  const avoidsDanger = $derived(t.require.some((c) => c.id === 'sysTags' && c.args[0] === 'NOT_ANY' && DANGER.every((d) => Array.isArray(c.args[1]) && (c.args[1] as string[]).includes(d))))
  const listText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))
  const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
</script>

{#snippet rows(list: 'require' | 'prefer')}
  {#each t[list] as cr, i (i)}
    {@const spec = criterion(cr.id)}
    <div class="crit">
      <span class="cl" title={spec?.help}>{list === 'prefer' ? `${i + 1}. ` : ''}{spec?.label ?? cr.id}{#if spec && !fits.some((f) => f.id === spec.id)} <span class="bad">(doesn't fit a {t.pick})</span>{/if}{#if list === 'prefer' && spec && !spec.pref} <span class="bad">(require only)</span>{/if}</span>
      {#each spec?.args ?? [] as a, ai (ai)}
        {#if a.kind === 'mode'}
          <select title={a.label} value={String(cr.args[ai] ?? 'ANY')} onchange={(e) => setArg(list, i, ai, e.currentTarget.value)}><option value="ANY">any of</option><option value="ALL">all of</option><option value="NOT_ANY">none of</option><option value="NOT_ALL">not all of</option></select>
        {:else if a.kind === 'list'}
          <input type="text" class="mono" placeholder={a.label.toLowerCase() + ', comma-separated'} value={listText(cr.args[ai])} onchange={(e) => setArg(list, i, ai, toList(e.currentTarget.value))} />
        {:else if a.kind === 'number'}
          <input type="number" class="num" title={a.label} value={Number(cr.args[ai] ?? 0)} onchange={(e) => setArg(list, i, ai, Number(e.currentTarget.value) || 0)} /><span class="muted small">{a.label.toLowerCase()}</span>
        {:else if a.kind === 'from'}
          <select title={a.label} value={String(cr.args[ai] ?? 'giver')} onchange={(e) => setArg(list, i, ai, e.currentTarget.value)}><option value="giver">{scatter ? 'of the place it is measured from' : 'of the quest giver'}</option><option value="player">of the player</option></select>
        {:else}
          <input type="text" class="mono" placeholder={a.label.toLowerCase()} value={String(cr.args[ai] ?? '')} onchange={(e) => setArg(list, i, ai, e.currentTarget.value.trim())} />
        {/if}
      {/each}
      <span class="sp"></span>
      {#if list === 'prefer'}<button class="mini" title="Try earlier" disabled={i === 0} onclick={() => move(i, -1)}>↑</button><button class="mini" title="Try later" disabled={i === t.prefer.length - 1} onclick={() => move(i, 1)}>↓</button>{/if}
      <button class="mini" title="Remove" onclick={() => upd((x) => { x[list].splice(i, 1) })}>✕</button>
    </div>
  {/each}
  <select class="addc" value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) add(list, v) }}>
    <option value="">+ add a criterion…</option>
    {#each Object.keys(GROUPS).filter((g) => fits.some((f) => f.group === g)) as g (g)}
      <optgroup label={GROUPS[g]}>{#each fits.filter((f) => f.group === g && (list === 'require' ? !!f.req : !!f.pref)) as f (f.id)}<option value={f.id} title={f.help}>{f.label}</option>{/each}</optgroup>
    {/each}
  </select>
{/snippet}

<div class="te">
  {#if scatter}<p class="f-help">Each copy is placed at new game in a place picked with vanilla's own mission search, a different star system each time. If fewer places fit, fewer copies are placed.</p>{:else}<p class="f-help">SagaLib picks this when the quest is offered, with vanilla's own mission search. If nothing in the player's sector fits, the quest isn't offered then (a contact offers something else). Use it as a stage's map marker or an Arrive place (<span class="mono">target:{name}</span>); texts can use <span class="mono">$global.{quest}_{name}_name</span> and the other facts below.</p>{/if}
  <div class="grid2">
    <Field label="Pick" for="te-p" help={PICKS.find((p) => p.id === t.pick)?.help ?? ''}>
      <select id="te-p" value={t.pick} onchange={(e) => { const v = e.currentTarget.value as TargetPick; upd((x) => { x.pick = v; const ok = new Set(criteriaFor(v).map((c) => c.id)); x.require = x.require.filter((c) => ok.has(c.id)); x.prefer = x.prefer.filter((c) => ok.has(c.id)) }) }}>
        {#each PICKS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      </select>
    </Field>
    <Field label="Must" help="All of these must hold (vanilla require…).">
      <div class="list">{@render rows('require')}
        {#if t.pick !== 'market' && !avoidsDanger}<button class="mini preset" title="Adds System tags › none of theme_unsafe, theme_remnant_main, theme_remnant_secondary: no system with dangerous fleets or active Remnants (vanilla's own mission filter avoids theme_unsafe)" onclick={() => upd((x) => { x.require.push({ id: 'sysTags', args: ['NOT_ANY', [...DANGER]] }) })}>+ Avoid dangerous systems</button>{/if}
      </div>
    </Field>
    <Field label="Prefer" help="Tried in this order; each is dropped when nothing would be left (vanilla prefer…). The list is the fallback chain.">
      <div class="list">{@render rows('prefer')}</div>
    </Field>
    {#if t.pick === 'planet' || t.pick === 'entity'}
      <Field label="System first" for="te-sf" help="A preferred system counts more than a preferred planet or entity in another system (vanilla searchMakeSystemPreferencesMoreImportant).">
        <label class="chk"><input id="te-sf" type="checkbox" checked={!!t.systemFirst} onchange={(e) => { const v = e.currentTarget.checked; upd((x) => { x.systemFirst = v || undefined }) }} /> system preferences first</label>
      </Field>
    {/if}
  </div>
  {#if !scatter}
  <div class="sect">Facts and mock</div>
  <p class="f-help">SagaLib stores the pick in <span class="mono">$global.{quest}_{name}</span> and these facts, usable in texts and conditions. Play mode can't see the generated sector, so it uses the mock values below.</p>
  <div class="grid2">
    {#each TARGET_FACTS as f (f)}
      <Field label={f} for={`te-m-${f}`} help={`$global.${quest}_${name}_${f}: ${f === 'name' ? 'its name' : f === 'system' ? 'its star system\'s name' : f === 'dist' ? 'light-years from the quest giver (one decimal)' : f === 'faction' ? 'its faction\'s name, for texts (none: empty)' : 'its faction\'s id, for conditions (none: empty)'}.`}>
        <input id={`te-m-${f}`} type={f === 'dist' ? 'number' : 'text'} value={String(t.mock?.[f] ?? '')} onchange={(e) => { const v = e.currentTarget.value; upd((x) => { x.mock = { ...(x.mock ?? {}), [f]: f === 'dist' ? Number(v) || 0 : v } }) }} />
      </Field>
    {/each}
    <!-- Phase 7d (RC-R3): what the pick is like, for Branch conditions and phrases -->
    <Field label="Details" help={`What the pick is like, set by SagaLib with the facts: $global.${quest}_${name}_<detail>. Use them in Branch cases and phrases ("the target is decivilised"). The boxes are the mock's values for Play.`}>
      <div class="details">
        {#each TARGET_DETAILS as d (d.id)}
          {#if d.kind === 'bool'}
            <label class="chk" title={`$global.${quest}_${name}_${d.id}`}><input type="checkbox" checked={t.mock?.details?.[d.id] === true} onchange={(e) => { const v = e.currentTarget.checked; upd((x) => { x.mock = { ...(x.mock ?? {}), details: { ...(x.mock?.details ?? {}), [d.id]: v } } }) }} /> {d.label}</label>
          {:else if d.kind === 'ruins'}
            <label class="chk" title={`$global.${quest}_${name}_${d.id}`}>{d.label} <select value={String(t.mock?.details?.[d.id] ?? '')} onchange={(e) => { const v = e.currentTarget.value; upd((x) => { x.mock = { ...(x.mock ?? {}), details: { ...(x.mock?.details ?? {}), [d.id]: v } } }) }}><option value="">none</option>{#each RUINS_SIZES as r (r)}<option value={r}>{r}</option>{/each}</select></label>
          {:else}
            <label class="chk wide" title={`$global.${quest}_${name}_${d.id}`}>{d.label} <input type="text" class="mono" value={String(t.mock?.details?.[d.id] ?? '')} onchange={(e) => { const v = e.currentTarget.value.trim(); upd((x) => { x.mock = { ...(x.mock ?? {}), details: { ...(x.mock?.details ?? {}), [d.id]: v } } }) }} /></label>
          {/if}
        {/each}
      </div>
    </Field>
  </div>
  {#if t.pick !== 'system'}
    <!-- Phase 7d (RC-R4): a person at the picked colony -->
    <div class="sect">A person there</div>
    <p class="f-help">Someone at the picked colony with one of these posts (vanilla's findOrCreatePerson): an existing person, or a new one of the faction, who leaves again when the quest ends. Talking to them is the place <span class="mono">target:{name}.person</span> for an Arrive node; their name is <span class="mono">$global.{quest}_{name}_personName</span>. A pick without a colony isn't offered.</p>
    <div class="grid2">
      <Field label="Posts" for="te-pp" help="One or more post ids, comma-separated, e.g. portmaster, supplyOfficer, administrator, merchant. Empty: no person.">
        <input id="te-pp" type="text" class="mono" list="te-posts" value={(t.person?.posts ?? []).join(', ')} onchange={(e) => { const l = toList(e.currentTarget.value); upd((x) => { x.person = l.length ? { ...(x.person ?? {}), posts: l } : undefined }) }} />
        <datalist id="te-posts">{#each app.defs.posts as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</datalist>
      </Field>
      {#if t.person?.posts.length}
        <Field label="Rank" for="te-pr" help="The rank a new person gets (vanilla's defaultRank).">
          <select id="te-pr" value={t.person.rank ?? 'citizen'} onchange={(e) => { const v = e.currentTarget.value; upd((x) => { if (x.person) x.person.rank = v }) }}>{#each app.defs.ranks as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
        </Field>
        <Field label="Faction" for="te-pf" help="A new person's faction. Empty: the colony's.">
          <input id="te-pf" type="text" class="mono" value={t.person.faction ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); upd((x) => { if (x.person) x.person.faction = v || undefined }) }} />
        </Field>
        <Field label="Mock name" for="te-pn" help="The person's name in Play mode.">
          <input id="te-pn" type="text" value={t.mock?.personName ?? ''} placeholder="Mock Person" onchange={(e) => { const v = e.currentTarget.value; upd((x) => { x.mock = { ...(x.mock ?? {}), personName: v || undefined } }) }} />
        </Field>
      {/if}
    </div>
  {/if}
  {/if}
  <p class="muted small">{CRITERIA.length} vanilla criteria in all; only those that narrow a {t.pick} are offered.</p>
</div>

<style>
  .te { font-size: 12px; }
  .grid2 { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 4px 8px; align-items: start; }
  .grid2 select, .grid2 input[type=number], .grid2 input[type=text] { padding: 3px 6px; }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .crit { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; padding: 3px 4px; border: 1px solid var(--border); border-radius: 4px; }
  .cl { min-width: 140px; }
  .crit input[type=text] { flex: 1; min-width: 120px; }
  .num { width: 70px; }
  .sp { flex: 1; }
  .addc { align-self: flex-start; }
  .preset { align-self: flex-start; }
  .bad { color: var(--bad); font-size: 11px; }
  .sect { margin: 10px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .chk { display: flex; gap: 6px; align-items: center; }
  .details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; }
  .details .wide { grid-column: 1 / -1; }
  .details .wide input { flex: 1; }
  .small { font-size: 11px; }
</style>
