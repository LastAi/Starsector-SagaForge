<script lang="ts">
  import { tokenField } from '../state/tokens.svelte'
  import TokenButton from '../tokens/TokenButton.svelte'
  import { effectiveFleet } from '../../../shared/encounters'
  import { fullName } from '../../../shared/personname'
  import VersionStrip from '../ui/VersionStrip.svelte'
  import { itemVer } from '../state/itemver.svelte'
  /** Encounters (PLAN.md §4.6, mock-up encounters.html): fleets, spawn, behavior, comm dialog, outcomes. */
  import type { EncounterDef } from '../../../shared/model'
  import { newEncounter, newCommDialog, encounterUses, encounterSpawners } from '../../../shared/encounters'
  import { slug } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import FleetExtrasEditor from '../ui/FleetExtrasEditor.svelte'
  import OpsEditor from '../saga/OpsEditor.svelte'
  import Modal from '../ui/Modal.svelte'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import ModsChip from '../ui/ModsChip.svelte'
  import ScaleInput from '../ui/ScaleInput.svelte'
  import { later } from '../ui/later'
  import { spawnSuggestions } from '../../../shared/patterns'
  import { targetKey, targetVars } from '../../../shared/targets'
  import { applyProblemFix } from '../state/problems.svelte'
  import { newBounty, bountyEncounter } from '../../../shared/bounties'

  const m = $derived(project.m)
  const index = $derived(app.index!)
  // #67 U40: the extra groups' ships, labelled by hull and variant name
  const extraOptions = $derived((index?.variants ?? []).map((v) => { const h = v.hull ? index.hulls.find((x) => x.id === v.hull) : undefined; return { id: v.id, name: `${h?.name ?? v.hull ?? ''}${v.displayName ? ` (${v.displayName})` : ''}`, definedBy: v.definedBy } }))
  const sel = $derived(app.selected.encounters ?? null)
  // #64: the encounter as in the open version (the versions strip)
  const enc = $derived(itemVer.view('encounter', sel, m?.encounters.find((e) => e.id === sel) ?? null))
  // #67 U41: Inactive is the encounter's own (not per version), like a person's
  const edBase = (fn: (e: EncounterDef) => void) => { const id = sel; if (id) project.change((mm) => { const e = mm.encounters.find((x) => x.id === id); if (e) fn(e) }) }
  let showInactive = $state(true)
  const fleetOff = (e: EncounterDef) => e.fleet.size === 'template' && !!m?.fleets?.templates.find((t) => t.id === e.fleet.template)?.inactive
  const ed = (fn: (e: EncounterDef) => void) => { const id = sel; if (id) itemVer.edit<EncounterDef>('encounter', id, (e) => fn(e)) }
  const factions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })) ?? []), ...index.factions])
  // Phase 7d (RC-R2): the quests' random targets (SagaLib 1.2 resolves the pick)
  const entities = $derived([...(m?.quests.flatMap((q) => targetVars(q).map((v) => ({ id: targetKey(q.id, v.name), name: `random target ${v.name} of ${q.title}` }))) ?? []), ...(m?.systems.flatMap((s) => s.entities.map((e) => ({ id: e.id, name: `${e.name} (${s.name})` }))) ?? []), ...index.markets.flatMap((x) => x.entities.map((id) => ({ id, name: x.name, definedBy: x.definedBy })))])
  const uses = $derived(enc && m ? encounterUses(m.quests, enc.id) : [])
  // #67 U46: everything that spawns it
  const spawners = $derived(enc && m ? encounterSpawners(m, enc.id) : [])
  function openRef(r: { page: 'quests' | 'saga' | 'encounters'; id: string; sub?: string }) {
    if (r.page === 'saga') { app.go('saga'); if (r.id === 'progress') { app.selected.sagaTab = 'progress'; app.selected.progressEvent = r.sub ?? null } else if (r.id === 'events') { app.selected.sagaTab = 'events'; app.selected.eventScheduler = r.sub ?? null }; return }
    app.go(r.page, r.id)
    if (r.page === 'quests') app.selected.questNode = r.sub ?? null
  }
  const probs = $derived(problems.live.filter((p) => p.ref?.page === 'encounters' && p.ref.id === sel || (p.area === 'Encounter' && p.message.includes(enc?.name ?? '\u0000'))))

  let showNew = $state(app.smokeModal === 'new') // screenshot mode can open it
  let newName = $state('')
  function create() {
    const id = project.prefix + slug(newName).replace(new RegExp(`^${project.prefix}`), '')
    if (!newName.trim() || m?.encounters.some((e) => e.id === id)) { app.error = `The id "${id}" is already used.`; return }
    project.change((mm) => { mm.encounters.push(newEncounter(id, newName.trim(), 'pirates')) })
    app.selected.encounters = id
    showNew = false; newName = ''
  }
  const commQuest = $derived(enc?.commDialog ? m?.quests.find((q) => q.id === enc.commDialog) ?? null : null)
  function makeComm() {
    if (!enc) return
    const q = newCommDialog($state.snapshot(enc) as EncounterDef)
    if (m?.quests.some((x) => x.id === q.id)) { app.go('quests', q.id); return }
    const id = enc.id
    project.change((mm) => { mm.quests.push(q); const e = mm.encounters.find((x) => x.id === id); if (e) e.commDialog = q.id })
    app.go('quests', q.id)
  }
  // #27: MagicLib bounties with this fleet as the target (edited on the Quests page)
  const bountiesHere = $derived(enc && m ? (m.bounties ?? []).filter((b) => bountyEncounter(m, b)?.id === enc.id) : [])
  function openBounty(id: string) { app.go('quests'); app.selected.bounty = id }
  function makeBounty() {
    if (!enc || !m) return
    const nb = newBounty(m, { encounter: enc.id })
    project.change((mm) => { ((mm.bounties ??= []), mm.bounties).push(nb) })
    openBounty(nb.id)
  }
  function remove() {
    if (!enc || !confirm(`Delete "${enc.name}"?`)) return
    const id = enc.id
    project.change((mm) => { mm.encounters = mm.encounters.filter((e) => e.id !== id) })
    app.selected.encounters = null
  }
  const fleetTypes = $derived(app.defs.fleetTypes)
  const suggestions = $derived(enc && m ? spawnSuggestions(m, enc.id) : [])
  const entityName = (id: string) => entities.find((x) => x.id === id)?.name ?? id
</script>

<div class="page">
  <aside class="left">
    <div class="sect">Encounters <span class="sectr"><label class="chk" title="Show encounters marked Inactive (planned, not exported)"><input type="checkbox" bind:checked={showInactive} /> inactive</label><button disabled={!m} onclick={() => (showNew = true)}>+ New</button></span></div>
    <ul class="list">
      {#each (m?.encounters ?? []).filter((e) => showInactive || (!e.inactive && !fleetOff(e))) as e (e.id)}<li class:on={sel === e.id} class:inactive={e.inactive || fleetOff(e)}><button class="li" onclick={() => (app.selected.encounters = e.id)}>{e.name}{#if e.inactive || fleetOff(e)} <span class="muted">[Inactive]</span>{/if}<ModsChip itemKey={`encounter:${e.id}`} /><span class="sub">{effectiveFleet(e, m!).faction || '?'} · {e.fleet.size === 'fp' ? `${e.fleet.points} FP` : e.fleet.size === 'template' ? 'named fleet' : `${e.fleet.variants?.length ?? 0} ships`}</span></button></li>{:else}<li class="muted small pad">{m ? 'None yet.' : 'Pick an active mod first.'}</li>{/each}
    </ul>
  </aside>
  <section class="main">
    {#if enc}
      <div class="head"><h2>{enc.name}</h2><span class="mono muted">{enc.id}</span><span class="spacer"></span><span class="badge b-lib">SagaLib</span><button class="mini" title="Make a MagicLib bounty with this fleet as the target (edited on the Quests page)" onclick={makeBounty}>MagicLib bounty…</button><label class="chk" title={fleetOff(enc) ? 'Its named fleet is inactive, so it isn\'t exported either.' : 'Planned but not ready: not exported, so not in the game. Its problems become warnings; what uses it is flagged in Problems.'}><input type="checkbox" checked={!!m?.encounters.find((x) => x.id === enc.id)?.inactive} onchange={(e) => { const v = e.currentTarget.checked; edBase((x) => { if (v) x.inactive = true; else delete x.inactive }) }} /> Inactive{fleetOff(enc) ? ' (its fleet is)' : ''}</label><button class="mini danger" onclick={remove}>Delete</button></div>
      {#if bountiesHere.length}<p class="muted small">MagicLib bount{bountiesHere.length === 1 ? 'y' : 'ies'} with this fleet: {#each bountiesHere as bt, i (bt.id)}{i ? ', ' : ''}<button class="lnk" onclick={() => openBounty(bt.id)}>{bt.id}</button>{/each}{#if bountiesHere.some((bt) => bt.only !== false)} (exported only as a bounty: SagaLib doesn't spawn it){/if}</p>{/if}
      <VersionStrip kind="encounter" id={enc.id} what="this encounter" />
      <div class="body">
        <div class="cols">
          <div class="group">
            <div class="gt">Fleet</div>
            <div class="grid2">
              <Field label="Name" for="en-n" help="For this editor (lists, Encounter nodes). In game the fleet shows its Fleet name.">
                <input id="en-n" type="text" value={enc.name} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.name = v }) }} />
              </Field>
        <Field label="Mods" help="Only spawned with / without optional mods (Saga › Mods; SagaLib 1.3). Set automatically (greyed) for an optional mod's fleet, ships or place, or when only conditional quests use it.">
          <ModsCond value={enc?.mods} itemKey={`encounter:${enc?.id}`} onChange={(c) => ed((e) => { if (c) e.mods = c; else delete e.mods })} />
        </Field>
              {#if enc.fleet.size !== 'template'}
              <Field label="Faction" help="Who the fleet belongs to: its ships, colors, officers and comm greeting.">
                <IdInput value={enc.fleet.faction} options={factions} strict onCommit={(v) => ed((x) => { x.fleet.faction = v })} />
              </Field>
              <Field label="Fleet type" ref="factions-fleet-types" help="An id on the fleet: it gives the fleet its default name (the faction's name for that type), and some vanilla code checks it (patrols, traders). Pick one of vanilla's, or type your own id and give it a name in the faction's fleetTypeNames.">
                <IdInput value={enc.fleet.type} options={fleetTypes.map((t) => ({ id: t.id, name: t.name }))} onCommit={(v) => { if (v) ed((x) => { x.fleet.type = v }) }} />
              </Field>
              {/if}
              <Field label="Ships" for="en-s" help="Let the faction build it the way its own fleets are built, list the exact ships, or use a named fleet from the Fleets page (its ships, names and captain, the same every time).">
                <select id="en-s" value={enc.fleet.size} onchange={(e) => { const v = e.currentTarget.value as 'fp' | 'explicit' | 'template'; ed((x) => { x.fleet.size = v; if (v === 'template' && !x.fleet.template) x.fleet.template = m?.fleets?.templates[0]?.id }) }}><option value="fp">from the faction's doctrine (fleet points)</option><option value="explicit">exact variants</option><option value="template">a named fleet</option></select>
              </Field>
              {#if enc.fleet.size === 'template'}
                <Field label="Named fleet" for="en-t" help="One of the mod's named fleets (Fleets page): its faction, type, ships, ship names, flagship and captain are used. Needs SagaLib 1.1.">
                  <div class="row2">
                    <select id="en-t" value={enc.fleet.template ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.fleet.template = v || undefined }) }}><option value="">—</option>{#each m?.fleets?.templates ?? [] as t (t.id)}<option value={t.id}>{t.name || t.id}</option>{/each}</select>
                    <button class="mini" onclick={() => app.go('fleets', enc.fleet.template ?? null)}>Open</button>
                  </div>
                </Field>
              {:else if enc.fleet.size === 'fp'}
                <Field label="Fleet points" for="en-p" help="How big the fleet is, in fleet points: a frigate costs a few, a capital ship 20 or more. The faction picks the ships.">
                  <input id="en-p" type="number" value={enc.fleet.points ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.fleet.points = v }) }} />
                </Field>
                <!-- #62 (SagaLib 1.3): a difficulty-style setting scales the fleet when it spawns -->
                <Field label="Size scaled by" for="en-ps" help="One of the mod's settings (Saga › Settings) multiplies the fleet points when the fleet spawns, e.g. a difficulty choice (Easy × 0.5, Hard × 2) or a percent. Only for fleets from the faction's doctrine. Needs SagaLib 1.3.">
                  <ScaleInput id="en-ps" value={enc.fleet.sizeScale} onChange={(v) => ed((x) => { if (v) x.fleet.sizeScale = v; else delete x.fleet.sizeScale })} />
                </Field>
              {:else}
                <Field label="Variants" help="The ships, one variant id each (the first is the flagship).">
                  <div class="chips">{#each enc.fleet.variants ?? [] as v, i (i)}<span class="chip">{v}<button class="x" onclick={() => ed((x) => { x.fleet.variants!.splice(i, 1) })}>✕</button></span>{/each}
                    <IdInput value="" options={index.variants} width="190px" placeholder="+ variant" clearOnCommit onCommit={(v) => { if (v) ed((x) => { x.fleet.variants ??= []; x.fleet.variants.push(v) }) }} /></div>
                </Field>
              {/if}
              {#if enc.fleet.size !== 'fp'}
                <!-- #67 U40 (user, 2026-11-22): always-there ships plus a random part (SagaLib 1.4) -->
                <Field label="Plus random ships" for="en-rp" help="Fleet points drawn like the faction's own fleets (its doctrine and known ships), different every spawn; the ships above always come too. Empty: none. Needs SagaLib 1.4.">
                  <input id="en-rp" type="number" min="0" step="5" value={enc.fleet.randomPoints ?? ''} placeholder="none" onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); ed((x) => { x.fleet.randomPoints = v || undefined }) }} />
                </Field>
              {/if}
              <Field label="Extra groups" help="Ships that may join when the fleet spawns: each group with its chance, adding all its ships or some of them drawn by weight. E.g. a 30% chance of a pair of heavy escorts, 50% of one carrier. Needs SagaLib 1.4.">
                <FleetExtrasEditor groups={enc.fleet.extras ?? []} variantOptions={extraOptions} fleets={m?.fleets?.templates ?? []} onChange={(g) => ed((x) => { x.fleet.extras = g.length ? g : undefined })} />
              </Field>
              {#if enc.fleet.size !== 'template'}
              <Field label="Quality" for="en-q" help="0 to 1: the ships' condition; lower means more D-mods (0 = battered, 1 = pristine).">
                <input id="en-q" type="number" step="0.1" min="0" max="1" value={enc.fleet.quality ?? ''} placeholder="faction default" onchange={(e) => { const s = e.currentTarget.value.trim(), v = Number(s); ed((x) => { x.fleet.quality = s === '' || !Number.isFinite(v) ? undefined : v }) }} />
              </Field>
              <Field label="Flagship by" later={later(enc, 'fleet.flagshipCommander', ed)} help="One of this mod's people commands the flagship; hailing the fleet talks to them. Empty: a generated officer.">
                <IdInput value={enc.fleet.flagshipCommander ?? ''} options={m?.people.map((p) => ({ id: p.id, name: fullName(p.name) })) ?? []} placeholder="(a generated officer)" onCommit={(v) => ed((x) => { x.fleet.flagshipCommander = v || undefined })} />
              </Field>
              <Field label="Fleet name" for="en-fn" help="Shown on the map and when the player meets it. Empty: the faction's name for the fleet type.">
                <input id="en-fn" type="text" value={enc.fleet.name ?? ''} placeholder="e.g. Belt Raiders" onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.fleet.name = v || undefined }) }} />
              </Field>
              {/if}
            </div>
          </div>
          <div class="group">
            <div class="gt">Spawn and behavior</div>
            <div class="grid2">
              <Field label="At" later={later(enc, 'spawn.at', ed)} help="The entity it appears next to. For a quest's fleet, use the place the quest marks for that stage: SagaLib puts it beside the stage's marker when they share a system, and on the band of an asteroid belt.">
                <IdInput value={enc.spawn.at} options={entities} onCommit={(v) => ed((x) => { x.spawn.at = v })} placeholder="e.g. vgc_kestrel_belt" />
                {#if suggestions.length}<div class="sugg"><span class="muted small">Where the quest sends the player:</span>{#each suggestions as s (s)}<button class="mini" class:on={enc.spawn.at === s} onclick={() => ed((x) => { x.spawn.at = s })}>{entityName(s)}</button>{/each}</div>{/if}
              </Field>
              <Field label="When" ref="encounters-spawn" for="en-w" help="Something spawns it: a quest's Encounter node or Spawn action, a world event, a progress stage, another encounter's outcome (the usual case). Or SagaLib keeps it in the sector by itself.">
                <select id="en-w" value={enc.spawn.when} onchange={(e) => { const v = e.currentTarget.value as EncounterDef['spawn']['when']; ed((x) => { x.spawn.when = v; if (v === 'periodic' || v === 'roaming') x.spawn.days ??= 30; if (v === 'player-near') x.spawn.range ??= 2000 }) }}><option value="quest-stage">when something spawns it (quest, event, etc.)</option><option value="new-game">once, on a new game</option><option value="periodic">kept alive, respawning</option><option value="player-near">when the player comes near</option><option value="roaming">roaming between two places</option></select>
              </Field>
              {#if enc.spawn.when === 'quest-stage'}
                <!-- #67 U46: what spawns it -->
                <Field label="Spawned by" help="Everything in the mod that spawns this encounter.">
                  <div class="spawners">{#each spawners as s (s.label)}<button class="lnk" onclick={() => openRef(s.ref)}>{s.label}</button>{:else}<span class="bad small">nothing yet: add an Encounter node or a Spawn action to a quest, a world event or a progress stage{enc.spawn.quest ? '' : ', or pick a quest below'}</span>{/each}</div>
                </Field>
              {/if}
              {#if enc.spawn.when === 'player-near'}
                <!-- RC-F5 (SagaLib 1.1) -->
                <Field label="Range" for="en-rg" help="How close the player's fleet must come to the place, in map units (a planet's orbit is about 2000–10000). 0 = anywhere in its system. Checked four times a day, so a fast fleet may get a little closer first. Needs SagaLib 1.1.">
                  <input id="en-rg" type="number" min="0" step="250" value={enc.spawn.range ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.spawn.range = v }) }} />
                </Field>
                <Field label="Only during" for="en-pq" help="Optional: only while a quest is at a stage (and again on a later visit to it). Otherwise it spawns once per game.">
                  <div class="row2">
                    <select id="en-pq" value={enc.spawn.quest ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.quest = v || undefined; x.spawn.stage = undefined }) }}><option value="">(any time, once)</option>{#each m?.quests.filter((q) => q.kind === 'quest') ?? [] as q (q.id)}<option value={q.id}>{q.title}</option>{/each}</select>
                    {#if enc.spawn.quest}<select value={enc.spawn.stage ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.stage = v || undefined }) }}><option value="">—</option>{#each m?.quests.find((q) => q.id === enc.spawn.quest)?.stages ?? [] as s (s.id)}<option value={s.id}>{s.title}</option>{/each}</select>{/if}
                  </div>
                </Field>
              {/if}
              {#if enc.spawn.when === 'quest-stage'}
                <Field label="Quest" for="en-qs" help="Leave on &quot;(only by what spawns it)&quot;; or pick a quest and stage to spawn it whenever that stage starts.">
                  <select id="en-qs" value={enc.spawn.quest ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.quest = v || undefined }) }}><option value="">(only by what spawns it)</option>{#each m?.quests.filter((q) => q.kind === 'quest') ?? [] as q (q.id)}<option value={q.id}>{q.title}</option>{/each}</select>
                </Field>
                {#if enc.spawn.quest}
                  <Field label="At stage" for="en-st" help="The stage that spawns it.">
                    <select id="en-st" value={enc.spawn.stage ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.spawn.stage = v || undefined }) }}><option value="">—</option>{#each m?.quests.find((q) => q.id === enc.spawn.quest)?.stages ?? [] as s (s.id)}<option value={s.id}>{s.title}</option>{/each}</select>
                  </Field>
                {/if}
                <Field label="Leaves" for="en-ds" help="Ticked: when the quest moves to another stage, the fleet flies off and disappears.">
                  <label class="chk"><input id="en-ds" type="checkbox" checked={!!enc.spawn.despawnOnStageEnd} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.spawn.despawnOnStageEnd = v }) }} /> when the stage ends</label>
                </Field>
              {:else if enc.spawn.when === 'roaming'}
                <!-- Phase 8d (RC-R14), SagaLib 1.2 -->
                <Field label="Travels to" help="Where it goes from &quot;At&quot;, on vanilla's routes like traders and patrols. It moves along by itself and is a real fleet only while the player is near (within about 1.6 light-years).">
                  <IdInput value={enc.spawn.to ?? ''} options={entities} onCommit={(v) => ed((x) => { x.spawn.to = v.trim() || undefined })} placeholder="e.g. a market's station" />
                </Field>
                <Field label="Leaves every" for="en-rd" help="Days between departures on average (each varies by a quarter either way).">
                  <span class="row2"><input id="en-rd" type="number" min="1" value={enc.spawn.days ?? 30} onchange={(e) => { const v = Math.max(1, Number(e.currentTarget.value) || 30); ed((x) => { x.spawn.days = v }) }} /> days</span>
                </Field>
                <Field label="At most" for="en-rm" help="How many are on the way at once; no new one leaves while that many travel.">
                  <input id="en-rm" type="number" min="1" value={enc.spawn.max ?? 1} onchange={(e) => { const v = Math.max(1, Math.round(Number(e.currentTarget.value) || 1)); ed((x) => { x.spawn.max = v }) }} />
                </Field>
                <Field label="Stays" for="en-rs" help="Days it stays at the place it travels to, then it leaves the sector (or goes back).">
                  <input id="en-rs" type="number" min="0" value={enc.spawn.stayDays ?? 3} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed((x) => { x.spawn.stayDays = v }) }} />
                </Field>
                <Field label="Round trip" for="en-rt" help="Ticked: after its stay it travels back to &quot;At&quot; (like vanilla's traders). Otherwise it leaves the sector at the place it went to.">
                  <label class="chk"><input id="en-rt" type="checkbox" checked={!!enc.spawn.roundTrip} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.spawn.roundTrip = v || undefined }) }} /> goes back after its stay</label>
                </Field>
              {:else if enc.spawn.when === 'periodic'}
                <Field label="Respawn after" for="en-d" help="Days after it is destroyed before a new one appears.">
                  <input id="en-d" type="number" value={enc.spawn.days ?? 30} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.spawn.days = v }) }} />
                </Field>
              {/if}
              {#if enc.spawn.when !== 'roaming'}
              <Field label="Behavior" ref="encounters-behaviour" for="en-b" help="What it does once spawned. An ambush waits at its spot and attacks the player who comes close.">
                <select id="en-b" value={enc.behavior} onchange={(e) => { const v = e.currentTarget.value as EncounterDef['behavior']; ed((x) => { x.behavior = v }) }}><option value="ambush">ambush (wait aggressively)</option><option value="guard">guard the place</option><option value="patrol">patrol the system</option><option value="intercept-player">intercept the player</option><option value="travel">travel somewhere</option></select>
              </Field>
              {#if enc.behavior === 'travel'}
                <Field label="To" help="The entity it travels to.">
                  <IdInput value={enc.travelTo ?? ''} options={entities} onCommit={(v) => ed((x) => { x.travelTo = v })} />
                </Field>
              {/if}
              {/if}
              <Field label="Flags" help="Hostile: attacks the player regardless of reputation. No reputation loss: fighting it doesn't anger its faction. Important: a marker on the map. May disengage: the player can break off the battle.">
                <div class="flags">
                  {#each [['hostile', 'hostile to the player'], ['noRepImpact', 'no reputation loss for fighting it'], ['important', 'important (marked on the map)'], ['allowDisengage', 'player may disengage']] as [k, label] (k)}
                    <label class="chk"><input type="checkbox" checked={!!enc.flags[k as 'hostile']} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.flags[k as 'hostile'] = v }) }} /> {label}</label>
                  {/each}
                </div>
              </Field>
            </div>
          </div>
        </div>
        <div class="group">
          <div class="gt">Comm-link dialog</div>
          <!-- #67 U43 (user, 2026-11-23): a comm dialog deleted on the Quests page could not be removed here -->
          {#if enc.commDialog && commQuest}
            <p>Greeting and options: <button class="lnk" onclick={() => app.go('quests', enc.commDialog!)}>{m?.quests.find((q) => q.id === enc.commDialog)?.title ?? enc.commDialog}</button> (edited in the quest editor). It applies only to this fleet (<span class="mono">$entity.sagaforge_encounter == {enc.id}</span>), so other {enc.fleet.faction} fleets keep vanilla's greetings. <button class="mini" onclick={() => edBase((x) => { delete x.commDialog; delete x.hail })} title="This fleet stops using it; the conversation stays on the Quests page">Unlink</button></p>
          {:else if enc.commDialog}
            <p class="bad">Its comm-link dialog <span class="mono">{enc.commDialog}</span> doesn't exist any more (deleted on the Quests page). <button class="mini" onclick={() => edBase((x) => { delete x.commDialog; delete x.hail })}>Unlink</button> <button class="mini" onclick={() => { edBase((x) => { delete x.commDialog }); makeComm() }}>Create a new one</button></p>
          {:else}
            <p class="muted">Without one, the fleet uses its faction's vanilla greeting.</p><button onclick={makeComm}>+ Create a comm-link dialog</button>
          {/if}
        </div>
        <div class="group">
          <div class="gt">Hail</div>
          <!-- #67 U43 (user, 2026-11-23): the fleet hails the player when it reaches them, opening its comm dialog before the fleet screen (vanilla's BeginFleetEncounter + HailPlayer, as the Knights of Ludd's stop) -->
          {#if !enc.commDialog || !commQuest}
            <p class="muted">A fleet can hail the player when it reaches them: its comm-link dialog opens before the fleet screen (Engage, Leave). Create the comm-link dialog first.</p>
          {:else}
            <label class="chk"><input type="checkbox" checked={!!enc.hail} onchange={(e) => { const v = e.currentTarget.checked; edBase((x) => { if (v) x.hail = { describe: true }; else delete x.hail }) }} /> Hails the player when it reaches them</label>
            {#if enc.hail}
              <div class="grid2">
                <Field label="First lines" for="en-hl" help="Shown on the fleet screen before the comm link opens, e.g. &quot;You're being hailed by the Hegemony patrol.&quot; Optional.">
                  <textarea id="en-hl" use:tokenField={{ label: "the hail's first lines", quest: enc.commDialog }} rows="2" value={enc.hail.text ?? ''} onchange={(e) => { const v = e.currentTarget.value; edBase((x) => { if (x.hail) x.hail.text = v.trim() || undefined }) }}></textarea><TokenButton />
                </Field>
                <Field label="Fleet description" help="Vanilla's description of the fleet first (its size and strength), as vanilla's own hails do.">
                  <label class="chk"><input type="checkbox" checked={!!enc.hail.describe} onchange={(e) => { const v = e.currentTarget.checked; edBase((x) => { if (x.hail) x.hail.describe = v || undefined }) }} /> show it</label>
                </Field>
                <Field label="Leaving" help="Blocked: the player can't leave until the dialog lets them (a Fleet response: let them go, or the player flees); otherwise the fight is all that's left. Vanilla's interceptions block it. Turn &quot;player may disengage&quot; off (Flags), or vanilla lets them leave anyway. (A player much stronger than the fleet can leave anyway, as in vanilla.)">
                  <label class="chk"><input type="checkbox" checked={enc.hail.block !== false} onchange={(e) => { const v = e.currentTarget.checked; edBase((x) => { if (x.hail) { if (v) delete x.hail.block; else x.hail.block = false } }) }} /> blocked until the dialog lets them go</label>
                </Field>
              </div>
              <p class="muted small">End the comm-link dialog's branches with the <b>Fleet response</b> node group (+ Node › Node groups › Fleet response): let them go, fight, or the player flees. A fleet that catches the player again hails again; the dialog can test "The player fled from this fleet".</p>
            {/if}
          {/if}
        </div>
        <div class="group">
          <div class="gt">Outcomes</div>
          <p class="muted small">What happens when its fleet is beaten, or leaves without being beaten (let go, talked away, despawned). These run whoever spawned it: a quest, a progress stage, a world event or new game. Conditions can also test it: "Encounter … its fleet was beaten".</p>
          <div class="ops"><OpsEditor label="When defeated" ops={enc.onDefeated ?? []} edit={(fn) => ed((x) => { x.onDefeated ??= []; fn(x.onDefeated); if (!x.onDefeated.length) delete x.onDefeated })} /></div>
          <div class="ops"><OpsEditor label="When avoided" ops={enc.onAvoided ?? []} edit={(fn) => ed((x) => { x.onAvoided ??= []; fn(x.onAvoided); if (!x.onAvoided.length) delete x.onAvoided })} /></div>
          <div class="gt sub">In the quests that spawn it (their Encounter node's exits; they run after the actions above)</div>
          {#each uses as u (u.quest.id + u.node)}
            <div class="row"><button class="lnk" onclick={() => { app.go('quests', u.quest.id); app.selected.questNode = u.node }}>{u.quest.title} · {u.node}</button>
              <span class:good={u.defeated} class:bad={!u.defeated}>Defeated {u.defeated ? '→ continues' : '(not set)'}</span>
              <span class:good={u.avoided} class:bad={!u.avoided}>Avoided {u.avoided ? '→ continues' : '(not set)'}</span></div>
          {:else}<p class="muted small">No quest has an Encounter node for it.</p>{/each}
        </div>
        {#if probs.length}<ul class="probs">{#each probs as p, i (i)}<li class:bad={p.level === 'error'} class:warn={p.level !== 'error'}>{p.message}{#each p.fixes ?? [] as f, j (j)}{#if f.action !== 'open'} <button class="mini" onclick={() => applyProblemFix(f.action, f.arg)}>{f.label}</button>{/if}{/each}</li>{/each}</ul>{/if}
      </div>
    {:else}
      <div class="center muted">Pick an encounter, or create one. An Encounter node in a quest spawns it; its outcomes lead back into the quest.</div>
    {/if}
  </section>
</div>

{#if showNew}
  <Modal title="New encounter" onClose={() => (showNew = false)}>
    <div class="grid2 modal">
      <Field label="Name" for="ne-n" help="For this editor; the fleet's name in game is set on its page."><input id="ne-n" type="text" bind:value={newName} placeholder="e.g. Belt ambush" /></Field>
      <Field label="Id" help="How quests and saves refer to it. Don't change it after a release."><span class="mono">{project.prefix}{slug(newName)}</span></Field>
    </div>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newName.trim()} onclick={create}>Create</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; grid-template-columns: 280px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px; justify-content: space-between; align-items: center; }
  .sect button { white-space: nowrap; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list li.inactive { opacity: .5; }
  .sectr { display: inline-flex; gap: 8px; align-items: center; } .chk { display: inline-flex; gap: 4px; align-items: center; font-size: 11px; text-transform: none; letter-spacing: 0; }
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
  .grid2 { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 2px 8px; align-items: center; }
  .grid2.modal { width: 420px; }
  .sugg { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 3px; }
  .sugg .on { border-color: var(--accent); color: var(--accent); }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; padding: 3px 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--text); }
  .row2 { display: flex; gap: 6px; }
  .row2 select { flex: 1; min-width: 0; }
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
  .gt.sub { margin-top: 10px; }
  .spawners { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding-top: 4px; }
  .ops { margin-bottom: 6px; }
</style>
