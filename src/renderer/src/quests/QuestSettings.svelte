<script lang="ts">
  /** Quest-level settings: id, kind, how it starts, prerequisites, rewards, variables, time limit (PLAN.md §4.4). */
  import { dropGroupChoices } from '../../../shared/pools'
  import type { QuestPlan, QuestStart, Reward } from '../../../shared/model'
  import { uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { editQuest, conditionTemplates } from './edit'
  import LinesInput from './LinesInput.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ImageView from '../ui/ImageView.svelte'
  import Field from '../ui/Field.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { later } from '../ui/later'
  import { DEFAULT_QUEST_ICON, CONTACT_TIMEOUT, BAR_DURATION, BAR_TIMEOUT, BAR_ACCEPTED_TIMEOUT } from '../../../shared/export/runtime'

  interface Props { quest: QuestPlan; onChangeId: () => void; onSaveTemplate: () => void }
  let { quest, onChangeId, onSaveTemplate }: Props = $props()
  const qid = $derived(quest.id)
  const ed = (fn: (q: QuestPlan) => void) => editQuest(qid, fn)
  const m = $derived(project.m!)
  const people = $derived([...m.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })), ...(app.index?.people ?? [])])
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions.map((f) => f.id) ?? [])])
  const templates = $derived(conditionTemplates(quest, factions, m.quests))
  const items = $derived([...m.items.map((i) => ({ id: i.id, name: i.name })), ...(app.index?.items ?? [])])
  const dropGroupOptions = $derived(dropGroupChoices(m.pools ?? [], app.index))
  // R10: inactive because its named contact is
  const contactOff = $derived(quest.start.kind === 'contact' && !!quest.start.person && !!m.people.find((p) => p.id === (quest.start as { person: string }).person)?.inactive)

  function setStartKind(kind: QuestStart['kind']) {
    ed((q) => {
      switch (kind) {
        case 'contact': q.start = { kind, person: '', freq: 10, minRep: 'FAVORABLE' }; break
        case 'bar': q.start = { kind, freq: 10, prob: 1 }; break
        case 'option': q.start = { kind, trigger: 'PopulateOptions', conditions: ['$isPerson'], optionText: q.title }; break
        case 'trigger': q.start = { kind, trigger: 'OpenCommLink', conditions: [] }; break
        case 'manual': q.start = { kind }; break
        case 'interject': q.start = { kind, option: 'salExplore', conditions: [], probability: 0.25, once: 'entity' }; break
        case 'barScene': q.start = { kind, conditions: [], optionText: q.title, blurb: 'A spacer at the corner table keeps glancing your way.', probability: 0.5, once: 'playthrough' }; break
      }
    })
  }
  /** Choose by picture, from vanilla's mission icons and the mod's, or import one (64×64) (R24, R28). */
  async function pickIcon() {
    const [p] = await chooseImages('missionIcon', { current: quest.icon })
    if (p) ed((q) => { q.icon = p })
  }
  const setStart = (k: string, v: unknown) => ed((q) => { (q.start as unknown as Record<string, unknown>)[k] = v })
  const tagList = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  /** Set one end of a day range (RC-R5); the default range is written as a whole once edited. */
  const setRange = (k: string, cur: [number, number], i: 0 | 1, v: number) => { const r: [number, number] = [cur[0], cur[1]]; r[i] = v; setStart(k, r) }
  const edReward = (i: number, fn: (r: Reward) => void) => ed((q) => fn(q.rewards[i]))
</script>

{#snippet range(k: string, cur: [number, number])}
  <span class="row"><input type="number" min="0" class="short" value={cur[0]} aria-label="minimum days" onchange={(e) => setRange(k, cur, 0, Number(e.currentTarget.value))} /><span class="muted">to</span><input type="number" min="0" class="short" value={cur[1]} aria-label="maximum days" onchange={(e) => setRange(k, cur, 1, Number(e.currentTarget.value))} /><span class="muted">days</span></span>
{/snippet}

<h3>{quest.title}</h3>
<p class="muted small intro">Quest settings. Click a node on the chart to edit it; click the empty chart to come back here.</p>
<div class="grid2">
  <Field label="Id" help="The mission id and the start of every rule id; saves remember it. Don't change it after a release.">
    <span class="mono">{quest.id} <button class="mini" onclick={onChangeId}>Change id…</button></span>
  </Field>
  <Field label="Title" for="qs-t" help="The quest's name in the intel screen, the journal and the contact's mission list.">
    <input id="qs-t" type="text" value={quest.title} onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.title = v }) }} />
  </Field>
  <Field label="Kind" for="qs-k" help="A quest has a journal entry with stages, a map marker and rewards (runs on SagaLib). A conversation only adds dialog, with nothing in the journal.">
    <select id="qs-k" value={quest.kind} onchange={(e) => { const v = e.currentTarget.value as 'quest' | 'dialog'; ed((q) => { q.kind = v }) }}>
      <option value="quest">Quest (journal, stages; runs on SagaLib)</option><option value="dialog">Conversation only (no SagaLib unless it uses SF_ commands)</option>
    </select>
  </Field>
  <Field label="Inactive" for="qs-in" help={contactOff ? `Not exported: its contact is inactive (People page). Planned content stays in the editor; its problems are warnings.` : 'Planned but not ready: not exported, so not in the game. Its problems become warnings, and its to-dos don\'t hold back a release.'}>
    <input id="qs-in" type="checkbox" checked={!!quest.inactive || contactOff} disabled={contactOff && !quest.inactive} onchange={(e) => { const v = e.currentTarget.checked; ed((q) => { if (v) q.inactive = true; else delete q.inactive }) }} />
  </Field>
  <Field label="Template" help="Keep a copy of this quest as a template. New quest › Start from offers it in every mod, with the id replaced. Kept in Saga Forge's own data folder, not in the mod.">
    <span><button class="mini" onclick={onSaveTemplate}>Save as template…</button></span>
  </Field>
  {#if quest.kind === 'quest'}
    <Field label="Repeatable" for="qs-r" help="Ticked: after it ends, the contact or bar can offer it again. Unticked: once per playthrough.">
      <input id="qs-r" type="checkbox" checked={quest.repeatable} onchange={(e) => { const v = e.currentTarget.checked; ed((q) => { q.repeatable = v }) }} />
    </Field>
    <Field label="Icon" for="qs-ic" later={later(quest, 'icon', ed)} help="Shown next to the quest in the intel screen and the contact's mission list. A 64×64 PNG; Choose… picks one of vanilla's or the mod's by picture, or imports your own. Empty: vanilla's data_retrieval icon.">
      <span class="row"><ImageView path={quest.icon || DEFAULT_QUEST_ICON} w={32} h={32} /><input id="qs-ic" type="text" class="mono" value={quest.icon} placeholder={`${DEFAULT_QUEST_ICON} (vanilla)`} onchange={(e) => { const v = e.currentTarget.value.trim(); ed((q) => { q.icon = v }) }} /><button class="mini" onclick={pickIcon} title="Choose from vanilla's mission icons and the mod's, or import your own (64×64)">Choose…</button></span>
    </Field>
    <Field label="Time limit" for="qs-tl" help="Days the player has after accepting; the intel shows the days left, and the quest fails when they run out. Empty: no limit.">
      <span class="row"><input id="qs-tl" type="number" min="0" value={quest.timeLimitDays ?? ''} placeholder="none" onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.timeLimitDays = v ? Number(v) : undefined }) }} /><span class="muted">days</span></span>
    </Field>
  {/if}
</div>

<div class="sect">How it starts</div>
<div class="grid2">
  <Field label="Start" for="qs-sk" help="Where the player first meets this quest. The Start node on the chart leads to the first thing they see.">
    <select id="qs-sk" value={quest.start.kind} onchange={(e) => setStartKind(e.currentTarget.value as QuestStart['kind'])}>
      <option value="contact">offered by a contact (person_missions.csv)</option><option value="bar">a bar event (bar_events.csv)</option>
      <option value="option">an option added to a menu</option><option value="trigger">a dialog that opens on a trigger</option><option value="manual">started by another quest</option><option value="interject">an interjection before an existing option</option><option value="barScene">a bar scene (no mission)</option>
    </select>
  </Field>
  {#if quest.start.kind === 'contact'}
    <Field label="Contact" later={later(quest, 'start.person', ed)} help="The person who offers it: one of this mod's people or an existing character. It shows in their mission list (the comm link's &quot;Do you have any work?&quot;). Leave it empty to let any contact with matching tags offer it (below).">
      <IdInput value={quest.start.person} options={people} strict placeholder="e.g. vgc_reyes, or empty for a tag pool" onCommit={(v) => setStart('person', v)} />
    </Field>
    <Field label="Tags: all" for="qs-ta" help="With no contact above: offered by any contact who has all of these tags (comma-separated). A contact's tags are their contact types (military, trade, …) and their faction id, e.g. &quot;military, hegemony&quot;.">
      <input id="qs-ta" type="text" class="mono" value={quest.start.tagsAll ?? ''} placeholder="e.g. trade" onchange={(e) => setStart('tagsAll', e.currentTarget.value.trim() || undefined)} />
    </Field>
    <Field label="Tags: any" for="qs-tn" help="Offered by a contact who has at least one of these tags.">
      <input id="qs-tn" type="text" class="mono" value={quest.start.tagsAny ?? ''} onchange={(e) => setStart('tagsAny', e.currentTarget.value.trim() || undefined)} />
    </Field>
    <Field label="Tags: none of" for="qs-tx" help="Never offered by a contact who has one of these tags (e.g. a faction id to leave out).">
      <input id="qs-tx" type="text" class="mono" value={quest.start.tagsNotAny ?? ''} onchange={(e) => setStart('tagsNotAny', e.currentTarget.value.trim() || undefined)} />
    </Field>
    <Field label="Mission tags" help="Priority: offered ahead of the contact's ordinary missions. Not repeatable: once done, never offered again by any contact.">
      <span class="row">
        {#each [['priority', 'priority'], ['non_repeatable', 'not repeatable']] as [tag, label] (tag)}
          <label class="chk"><input type="checkbox" checked={tagList(quest.start.tags).includes(tag)} onchange={(e) => { const on = e.currentTarget.checked; const l = tagList(quest.start.kind === 'contact' ? quest.start.tags : '').filter((x) => x !== tag); setStart('tags', (on ? [...l, tag] : l).join(', ') || undefined) }} /> {label}</label>
        {/each}
      </span>
    </Field>
    <Field label="Timeout" help="Days before the contact can offer this mission again after it was offered (vanilla uses 30–60).">
      {@render range('timeout', quest.start.timeout ?? CONTACT_TIMEOUT)}
    </Field>
    <Field label="Min. rep" for="qs-mr" help="How well the contact must think of the player before offering it (their personal relation).">
      <select id="qs-mr" value={quest.start.minRep ?? ''} onchange={(e) => setStart('minRep', e.currentTarget.value || undefined)}><option value="">any</option>{#each app.defs.repLevels as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
    </Field>
    <Field label="Frequency" for="qs-f" help="Weight against the contact's other missions when the game picks which to offer; vanilla uses 10. Higher = offered more often.">
      <input id="qs-f" type="number" value={quest.start.freq} onchange={(e) => setStart('freq', Number(e.currentTarget.value))} />
    </Field>
    <Field label="Blurb" for="qs-ot" help="The line describing the job in the contact's mission list, before the player asks about it.">
      <textarea id="qs-ot" rows="2" value={quest.start.offerText ?? ''} placeholder="e.g. Commodore Reyes is looking for someone to find a missing convoy." onchange={(e) => setStart('offerText', e.currentTarget.value)}></textarea>
    </Field>
    <Field label="Option" for="qs-op" help="The option the player picks in the contact's dialog to hear the offer. Empty: the quest's title.">
      <input id="qs-op" type="text" value={quest.start.optionText ?? ''} placeholder={quest.title} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
    </Field>
  {:else if quest.start.kind === 'bar'}
    <Field label="Frequency" for="qs-bf" help="Weight against other bar events when the game picks one for a bar; vanilla uses 10.">
      <input id="qs-bf" type="number" value={quest.start.freq} onchange={(e) => setStart('freq', Number(e.currentTarget.value))} />
    </Field>
    <Field label="Probability" for="qs-bp" help="Chance from 0 to 1 that it is offered when picked; vanilla uses 1.">
      <input id="qs-bp" type="number" step="0.1" value={quest.start.prob} onchange={(e) => setStart('prob', Number(e.currentTarget.value))} />
    </Field>
    <Field label="Event tags" for="qs-bt" help="The tags column of bar_events.csv. Vanilla leaves it empty; leave it empty unless another mod looks for a tag.">
      <input id="qs-bt" type="text" value={quest.start.tags ?? ''} onchange={(e) => setStart('tags', e.currentTarget.value)} />
    </Field>
    <Field label="Blurb" for="qs-bb" help="The bar's description line about this patron (&quot;A spacer in a worn jacket waves you over.&quot;).">
      <textarea id="qs-bb" rows="2" value={quest.start.blurb ?? ''} onchange={(e) => setStart('blurb', e.currentTarget.value)}></textarea>
    </Field>
    <Field label="Option" for="qs-bo" help="The bar option that starts the conversation. Empty: the quest's title.">
      <input id="qs-bo" type="text" value={quest.start.optionText ?? ''} placeholder={quest.title} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
    </Field>
    <Field label="Duration" help="Days the patron stays at the bar once they appear (vanilla uses 30–40).">
      {@render range('duration', quest.start.duration ?? BAR_DURATION)}
    </Field>
    <Field label="Timeout" help="Days before this bar event can appear again after it was offered (vanilla uses 15–20).">
      {@render range('timeout', quest.start.timeout ?? BAR_TIMEOUT)}
    </Field>
    <Field label="Accepted timeout" help="Days before it can appear again after the player accepted it (vanilla uses 60–90).">
      {@render range('acceptedTimeout', quest.start.acceptedTimeout ?? BAR_ACCEPTED_TIMEOUT)}
    </Field>
  {:else if quest.start.kind === 'option'}
    <Field label="Option text" for="qs-ox" help="The option added to the menu, for example at a market or in a person's dialog. It never replaces the menu's own options.">
      <input id="qs-ox" type="text" value={quest.start.optionText} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
    </Field>
    <Field label="Menu trigger" for="qs-otr" help="The rules trigger that fills the menu. PopulateOptions is the usual one (markets, people, fleets).">
      <input id="qs-otr" type="text" class="mono" value={quest.start.trigger} onchange={(e) => setStart('trigger', e.currentTarget.value)} />
    </Field>
    <Field label="Shown when" help="Condition lines (rules.csv syntax), all true for the option to appear; e.g. $isPerson for any person, $id == vgc_haven for one place.">
      <LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
    </Field>
  {:else if quest.start.kind === 'trigger'}
    <Field label="Trigger" for="qs-tt" help="The rules trigger that opens this dialog: OpenCommLink (hailing a fleet or a person), OpenInteractionDialog (docking or visiting a place), …">
      <input id="qs-tt" type="text" class="mono" value={quest.start.trigger} onchange={(e) => setStart('trigger', e.currentTarget.value)} />
    </Field>
    <Field label="Conditions" help="Condition lines (rules.csv syntax) that limit where it opens, e.g. $id == vgc_convoy_wreck. Add score:N to the first line to beat vanilla's own rule for that place.">
      <LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
    </Field>
  {:else if quest.start.kind === 'interject'}
    <!-- RC-F2: cuts in before an existing option, the way vanilla's salvage "explore stories" do -->
    <Field label="Option" for="qs-io" help="The existing option it cuts into, by id: salExplore (Explore at a derelict or ruins), … When the player picks it, your scene plays first; every path must then hand back to it (a Link › Hand back).">
      <input id="qs-io" type="text" class="mono" list="qs-io-list" value={quest.start.option} onchange={(e) => setStart('option', e.currentTarget.value.trim())} />
      <datalist id="qs-io-list"><option value="salExplore">Explore (derelicts, ruins)</option></datalist>
    </Field>
    <Field label="Only when" help="Condition lines (rules.csv syntax) that limit where it cuts in, e.g. $customType == wreck, or $id == one of your objects.">
      <LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
    </Field>
    <Field label="Chance" for="qs-ip" help="How likely it is to cut in (vanilla's RollProbability, as its salvage stories use). It is rolled per object and per month: the same object gives the same answer all month, and may change next month. 1 = always.">
      <input id="qs-ip" type="number" min="0" max="1" step="0.05" value={quest.start.probability ?? 1} onchange={(e) => { const v = Number(e.currentTarget.value); setStart('probability', v >= 1 ? undefined : Math.max(0, v)) }} />
    </Field>
    <Field label="Once" for="qs-ion" help="Once per object (each wreck at most once), once per playthrough, or every time.">
      <select id="qs-ion" value={quest.start.once ?? 'none'} onchange={(e) => setStart('once', e.currentTarget.value === 'none' ? undefined : e.currentTarget.value)}><option value="entity">once per object</option><option value="playthrough">once per playthrough</option><option value="none">every time</option></select>
    </Field>
  {:else if quest.start.kind === 'barScene'}
    <!-- RC-R6: vanilla's AddBarEvents + AddBarEvent, as its own story bar scenes -->
    <Field label="Option" for="qs-so" help="The bar option that opens the scene, e.g. &quot;Talk to the nervous spacer&quot;. No colon (the game cuts the label there).">
      <input id="qs-so" type="text" value={quest.start.optionText} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
    </Field>
    <Field label="Blurb" for="qs-sb" help="The line in the bar's description that hints at the scene (&quot;A spacer at the corner table keeps glancing your way.&quot;).">
      <textarea id="qs-sb" rows="2" value={quest.start.blurb} onchange={(e) => setStart('blurb', e.currentTarget.value)}></textarea>
    </Field>
    <Field label="Only when" help="Condition lines (rules.csv syntax) for where and when, e.g. $market.id == vgc_haven, $market.factionId == hegemony, or a quest's flag. Empty: every colony's bar.">
      <LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
    </Field>
    <Field label="Chance" for="qs-sp" help="How likely it is to be in this bar this month (vanilla's RollProbability, as its own bar scenes): it is rolled per colony and per month, so within a month every visit gives the same answer, and next month it may change. A bar shows at most 3 such scenes per visit (vanilla's maxBarEvents). 1 = always.">
      <input id="qs-sp" type="number" min="0" max="1" step="0.05" value={quest.start.probability ?? 1} onchange={(e) => { const v = Number(e.currentTarget.value); setStart('probability', v >= 1 ? undefined : Math.max(0, v)) }} />
    </Field>
    <Field label="Once" for="qs-son" help="Counted when the player picks the option: once per playthrough, once per colony, or every visit.">
      <select id="qs-son" value={quest.start.once ?? 'none'} onchange={(e) => setStart('once', e.currentTarget.value === 'none' ? undefined : e.currentTarget.value)}><option value="playthrough">once per playthrough</option><option value="market">once per colony</option><option value="none">every visit</option></select>
    </Field>
    <span></span><p class="f-help">End the scene with a Link › <b>Back to the bar</b>. For a scene that offers a job, use "a bar event" instead (bar_events.csv, a mission).</p>
  {:else}
    <span></span><p class="muted small">Another quest's Action node starts this one ("Start another quest").</p>
  {/if}
</div>

<div class="sect">Prerequisites <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v === 'flag') ed((q) => { q.requires.push({ flag: '$global.' }) }); else if (v) ed((q) => { q.requires.push({ quest: v, ended: 'success' }) }) }}>
  <option value="">+ add…</option><option value="flag">a flag is set</option>{#each m.quests.filter((x) => x.id !== qid) as o (o.id)}<option value={o.id}>"{o.title}" ended</option>{/each}
</select></div>
<p class="f-help">All must be true before the quest is offered or starts. A flag line is a memory key (and optionally the value it must have).</p>
{#each quest.requires as r, i (i)}
  <div class="row">
    {#if 'quest' in r}
      <span>{m.quests.find((x) => x.id === r.quest)?.title ?? r.quest}</span>
      <select value={r.ended} onchange={(e) => { const v = e.currentTarget.value as 'success' | 'fail' | 'any'; ed((q) => { (q.requires[i] as { ended: string }).ended = v }) }}><option value="success">succeeded</option><option value="fail">failed</option><option value="any">ended</option></select>
    {:else}
      <input type="text" class="mono" value={r.flag} title="Memory key, e.g. $global.vgc_signal_heard" onchange={(e) => { const v = e.currentTarget.value; ed((q) => { (q.requires[i] as { flag: string }).flag = v }) }} />
      <span class="muted">is</span>
      <input type="text" class="mono short" value={r.is ?? ''} placeholder="(set)" title="The value it must have; empty = any value (just set)" onchange={(e) => { const v = e.currentTarget.value; ed((q) => { (q.requires[i] as { is?: string }).is = v || undefined }) }} />
    {/if}
    <button class="mini" onclick={() => ed((q) => { q.requires.splice(i, 1) })}>✕</button>
  </div>
{/each}

<div class="sect">Rewards <button class="mini" onclick={() => ed((q) => { q.rewards.push({ id: uniqueId('reward', q.rewards.map((r) => r.id)), credits: 10000 }) })}>+ Reward</button></div>
<p class="f-help">A reward is paid by an End node or a "Give a reward" action. The dialog shows each part as a "Gained …" line, as vanilla does.</p>
{#each quest.rewards as r, i (r.id)}
  <div class="reward">
    <div class="grid2">
      <Field label="Reward id" for={`rw-id-${i}`} help="Only for picking it in End nodes and actions; never shown in game.">
        <span class="row"><input id={`rw-id-${i}`} type="text" class="mono" value={r.id} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) ed((q) => { q.rewards[i].id = v }) }} /><button class="mini" title="Delete this reward" onclick={() => ed((q) => { q.rewards.splice(i, 1) })}>✕</button></span>
      </Field>
      <Field label="Credits" for={`rw-c-${i}`} help="Added to the player's credits.">
        <input id={`rw-c-${i}`} type="number" value={r.credits ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.credits = v || undefined }) }} />
      </Field>
      <Field label="XP" for={`rw-x-${i}`} help="Experience points for the player.">
        <input id={`rw-x-${i}`} type="number" value={r.xp ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.xp = v || undefined }) }} />
      </Field>
      <Field label="Story points" for={`rw-s-${i}`} help="Story points given to the player.">
        <input id={`rw-s-${i}`} type="number" value={r.storyPoints ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.storyPoints = v || undefined }) }} />
      </Field>
      <Field label="Reputation" help="Faction and points: 5 = +5 on the faction's relations bar (as vanilla's AdjustRep). Negative lowers it.">
        <div>{#each r.rep ?? [] as rp, j (j)}<div class="row"><IdInput value={rp.faction} options={factions.map((f) => ({ id: f }))} onCommit={(v) => edReward(i, (x) => { x.rep![j].faction = v })} /><input type="number" class="short" value={rp.amount} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.rep![j].amount = v }) }} /><button class="mini" onclick={() => edReward(i, (x) => { x.rep!.splice(j, 1) })}>✕</button></div>{/each}
          <button class="mini" onclick={() => edReward(i, (x) => { x.rep ??= []; x.rep.push({ faction: factions[0] ?? '', amount: 5 }) })}>+ faction</button></div>
      </Field>
      <Field label="Items" help="Items and quantities put in the player's cargo. A negative quantity takes them.">
        <div>{#each r.items ?? [] as it, j (j)}<div class="row"><IdInput value={it.item} options={items} strict onCommit={(v) => edReward(i, (x) => { x.items![j].item = v })} /><input type="number" class="short" value={it.qty} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.items![j].qty = v }) }} /><button class="mini" onclick={() => edReward(i, (x) => { x.items!.splice(j, 1) })}>✕</button></div>{/each}
          <button class="mini" onclick={() => edReward(i, (x) => { x.items ??= []; x.items.push({ item: '', qty: 1 }) })}>+ item</button></div>
      </Field>
      <!-- Phase 8a (F7-b) -->
      <Field label="Random items" help="Rolled from a drop group when the reward is paid, as salvage does: the mod's loot tables (Saga › Pools) or vanilla's groups (rare_tech, ai_cores2, blueprints…). Rolls = random picks from the group; a value instead gives about that many credits' worth. Play mode can't know what comes out. Needs SagaLib 1.2.">
        <div>{#each r.loot ?? [] as l, j (j)}<div class="row"><IdInput value={l.group} options={dropGroupOptions} width="170px" placeholder="drop group" onCommit={(v) => edReward(i, (x) => { x.loot![j].group = v.trim() })} /><label class="small">rolls <input type="number" class="short" min="0" value={l.chances ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edReward(i, (x) => { x.loot![j].chances = v || undefined }) }} /></label><label class="small">value <input type="number" class="short" min="0" value={l.value ?? 0} onchange={(e) => { const v = Math.max(0, Math.round(Number(e.currentTarget.value) || 0)); edReward(i, (x) => { x.loot![j].value = v || undefined }) }} /></label><button class="mini" onclick={() => edReward(i, (x) => { x.loot!.splice(j, 1); if (!x.loot!.length) x.loot = undefined })}>✕</button></div>{/each}
          <button class="mini" onclick={() => edReward(i, (x) => { x.loot ??= []; x.loot.push({ group: '', chances: 1 }) })}>+ random items</button></div>
      </Field>
    </div>
  </div>
{/each}

<div class="sect">Notes</div>
<p class="f-help">For you only: never exported.</p>
<textarea rows="3" value={quest.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.notes = v || undefined }) }}></textarea>

<style>
  h3 { margin: 2px 0 2px; font-size: 14px; }
  .intro { margin: 0 0 8px; }
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 2px 8px; align-items: center; margin-bottom: 6px; }
  .grid2 input:not([type='checkbox']), .grid2 select, .grid2 textarea { width: 100%; padding: 3px 6px; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 12px 0 2px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  p.f-help { margin: 0 0 4px; }
  .row { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; font-size: 12px; }
  .row input { flex: 1; min-width: 0; padding: 2px 6px; }
  .row .short, input.short { flex: 0 0 70px; }
  .reward { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; background: #161a20; }
  .mini { padding: 0 6px; font-size: 11px; }
  .chk { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); margin-right: 8px; }
  .small { font-size: 11px; }
  textarea { width: 100%; resize: vertical; }
</style>
