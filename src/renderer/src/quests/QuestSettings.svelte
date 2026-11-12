<script lang="ts">
  /** Quest-level settings: id, kind, how it starts, prerequisites, rewards, variables, time limit (PLAN.md §4.4). */
  import type { QuestPlan, QuestStart, Reward } from '../../../shared/model'
  import { uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { editQuest, conditionTemplates } from './edit'
  import LinesInput from './LinesInput.svelte'
  import IdInput from '../ui/IdInput.svelte'

  interface Props { quest: QuestPlan; onChangeId: () => void }
  let { quest, onChangeId }: Props = $props()
  const qid = $derived(quest.id)
  const ed = (fn: (q: QuestPlan) => void) => editQuest(qid, fn)
  const m = $derived(project.m!)
  const people = $derived([...m.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })), ...(app.index?.people ?? [])])
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions.map((f) => f.id) ?? [])])
  const templates = $derived(conditionTemplates(quest, factions, m.quests))
  const items = $derived([...m.items.map((i) => ({ id: i.id, name: i.name })), ...(app.index?.items ?? [])])

  function setStartKind(kind: QuestStart['kind']) {
    ed((q) => {
      switch (kind) {
        case 'contact': q.start = { kind, person: '', freq: 10, minRep: 'FAVORABLE' }; break
        case 'bar': q.start = { kind, freq: 10, prob: 1 }; break
        case 'option': q.start = { kind, trigger: 'PopulateOptions', conditions: ['$isPerson'], optionText: q.title }; break
        case 'trigger': q.start = { kind, trigger: 'OpenCommLink', conditions: [] }; break
        case 'manual': q.start = { kind }; break
      }
    })
  }
  const setStart = (k: string, v: unknown) => ed((q) => { (q.start as unknown as Record<string, unknown>)[k] = v })
  const edReward = (i: number, fn: (r: Reward) => void) => ed((q) => fn(q.rewards[i]))
</script>

<h3>{quest.title}</h3>
<div class="grid2">
  <span class="lbl">Id</span><span class="mono">{quest.id} <button class="mini" onclick={onChangeId}>Change id…</button></span>
  <label for="qs-t">Title</label><input id="qs-t" type="text" value={quest.title} onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.title = v }) }} />
  <label for="qs-k">Kind</label>
  <select id="qs-k" value={quest.kind} onchange={(e) => { const v = e.currentTarget.value as 'quest' | 'dialog'; ed((q) => { q.kind = v }) }}>
    <option value="quest">Quest (journal, stages; runs on SagaLib)</option><option value="dialog">Conversation only (no SagaLib unless it uses SF_ commands)</option>
  </select>
  {#if quest.kind === 'quest'}
    <label for="qs-r">Repeatable</label><input id="qs-r" type="checkbox" checked={quest.repeatable} onchange={(e) => { const v = e.currentTarget.checked; ed((q) => { q.repeatable = v }) }} />
    <label for="qs-tl">Time limit</label><span class="row"><input id="qs-tl" type="number" min="0" value={quest.timeLimitDays ?? ''} placeholder="none" onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.timeLimitDays = v ? Number(v) : undefined }) }} /><span class="muted">days</span></span>
  {/if}
</div>

<div class="sect">How it starts</div>
<div class="grid2">
  <label for="qs-sk">Start</label>
  <select id="qs-sk" value={quest.start.kind} onchange={(e) => setStartKind(e.currentTarget.value as QuestStart['kind'])}>
    <option value="contact">offered by a contact (person_missions.csv)</option><option value="bar">a bar event (bar_events.csv)</option>
    <option value="option">an option added to a menu</option><option value="trigger">a dialog that opens on a trigger</option><option value="manual">started by another quest</option>
  </select>
  {#if quest.start.kind === 'contact'}
    <span class="lbl">Contact</span><IdInput value={quest.start.person} options={people} strict onCommit={(v) => setStart('person', v)} />
    <label for="qs-mr">Min. rep</label><select id="qs-mr" value={quest.start.minRep ?? ''} onchange={(e) => setStart('minRep', e.currentTarget.value || undefined)}><option value="">any</option>{#each app.defs.repLevels as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
    <label for="qs-f">Frequency</label><input id="qs-f" type="number" value={quest.start.freq} onchange={(e) => setStart('freq', Number(e.currentTarget.value))} />
    <label for="qs-ot">Blurb</label><textarea id="qs-ot" rows="2" value={quest.start.offerText ?? ''} placeholder="Text in the contact's mission list" onchange={(e) => setStart('offerText', e.currentTarget.value)}></textarea>
    <label for="qs-op">Option</label><input id="qs-op" type="text" value={quest.start.optionText ?? ''} placeholder={quest.title} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
  {:else if quest.start.kind === 'bar'}
    <label for="qs-bf">Frequency</label><input id="qs-bf" type="number" value={quest.start.freq} onchange={(e) => setStart('freq', Number(e.currentTarget.value))} />
    <label for="qs-bp">Probability</label><input id="qs-bp" type="number" step="0.1" value={quest.start.prob} onchange={(e) => setStart('prob', Number(e.currentTarget.value))} />
    <label for="qs-bt">Market tags</label><input id="qs-bt" type="text" value={quest.start.tags ?? ''} onchange={(e) => setStart('tags', e.currentTarget.value)} />
    <label for="qs-bb">Blurb</label><textarea id="qs-bb" rows="2" value={quest.start.blurb ?? ''} onchange={(e) => setStart('blurb', e.currentTarget.value)}></textarea>
    <label for="qs-bo">Option</label><input id="qs-bo" type="text" value={quest.start.optionText ?? ''} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
  {:else if quest.start.kind === 'option'}
    <label for="qs-ox">Option text</label><input id="qs-ox" type="text" value={quest.start.optionText} onchange={(e) => setStart('optionText', e.currentTarget.value)} />
    <label for="qs-otr">Menu trigger</label><input id="qs-otr" type="text" class="mono" value={quest.start.trigger} onchange={(e) => setStart('trigger', e.currentTarget.value)} />
    <span class="lbl">Shown when</span><LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
  {:else if quest.start.kind === 'trigger'}
    <label for="qs-tt">Trigger</label><input id="qs-tt" type="text" class="mono" value={quest.start.trigger} onchange={(e) => setStart('trigger', e.currentTarget.value)} />
    <span class="lbl">Conditions</span><LinesInput lines={quest.start.conditions} {templates} onChange={(l) => setStart('conditions', l)} />
  {/if}
</div>

<div class="sect">Prerequisites <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v === 'flag') ed((q) => { q.requires.push({ flag: '$global.' }) }); else if (v) ed((q) => { q.requires.push({ quest: v, ended: 'success' }) }) }}>
  <option value="">+ add…</option><option value="flag">a flag is set</option>{#each m.quests.filter((x) => x.id !== qid) as o (o.id)}<option value={o.id}>"{o.title}" ended</option>{/each}
</select></div>
{#each quest.requires as r, i (i)}
  <div class="row">
    {#if 'quest' in r}
      <span>{m.quests.find((x) => x.id === r.quest)?.title ?? r.quest}</span>
      <select value={r.ended} onchange={(e) => { const v = e.currentTarget.value as 'success' | 'fail' | 'any'; ed((q) => { (q.requires[i] as { ended: string }).ended = v }) }}><option value="success">succeeded</option><option value="fail">failed</option><option value="any">ended</option></select>
    {:else}
      <input type="text" class="mono" value={r.flag} onchange={(e) => { const v = e.currentTarget.value; ed((q) => { (q.requires[i] as { flag: string }).flag = v }) }} />
      <input type="text" class="mono short" value={r.is ?? ''} placeholder="(set)" onchange={(e) => { const v = e.currentTarget.value; ed((q) => { (q.requires[i] as { is?: string }).is = v || undefined }) }} />
    {/if}
    <button class="mini" onclick={() => ed((q) => { q.requires.splice(i, 1) })}>✕</button>
  </div>
{/each}

<div class="sect">Rewards <button class="mini" onclick={() => ed((q) => { q.rewards.push({ id: uniqueId('reward', q.rewards.map((r) => r.id)), credits: 10000 }) })}>+ Reward</button></div>
{#each quest.rewards as r, i (r.id)}
  <div class="reward">
    <div class="row"><input type="text" class="mono short" value={r.id} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) ed((q) => { q.rewards[i].id = v }) }} /><span class="spacer"></span><button class="mini" onclick={() => ed((q) => { q.rewards.splice(i, 1) })}>✕</button></div>
    <div class="grid2">
      <label for={`rw-c-${i}`}>Credits</label><input id={`rw-c-${i}`} type="number" value={r.credits ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.credits = v || undefined }) }} />
      <label for={`rw-x-${i}`}>XP</label><input id={`rw-x-${i}`} type="number" value={r.xp ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.xp = v || undefined }) }} />
      <label for={`rw-s-${i}`}>Story points</label><input id={`rw-s-${i}`} type="number" value={r.storyPoints ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.storyPoints = v || undefined }) }} />
      <span class="lbl">Reputation</span>
      <div>{#each r.rep ?? [] as rp, j (j)}<div class="row"><IdInput value={rp.faction} options={factions.map((f) => ({ id: f }))} onCommit={(v) => edReward(i, (x) => { x.rep![j].faction = v })} /><input type="number" class="short" value={rp.amount} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.rep![j].amount = v }) }} /><button class="mini" onclick={() => edReward(i, (x) => { x.rep!.splice(j, 1) })}>✕</button></div>{/each}
        <button class="mini" onclick={() => edReward(i, (x) => { (x.rep ??= []).push({ faction: factions[0] ?? '', amount: 5 }) })}>+ faction</button></div>
      <span class="lbl">Items</span>
      <div>{#each r.items ?? [] as it, j (j)}<div class="row"><IdInput value={it.item} options={items} strict onCommit={(v) => edReward(i, (x) => { x.items![j].item = v })} /><input type="number" class="short" value={it.qty} onchange={(e) => { const v = Number(e.currentTarget.value); edReward(i, (x) => { x.items![j].qty = v }) }} /><button class="mini" onclick={() => edReward(i, (x) => { x.items!.splice(j, 1) })}>✕</button></div>{/each}
        <button class="mini" onclick={() => edReward(i, (x) => { (x.items ??= []).push({ item: '', qty: 1 }) })}>+ item</button></div>
    </div>
  </div>
{/each}

{#if quest.notes !== undefined || true}
  <div class="sect">Notes</div>
  <textarea rows="3" value={quest.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((q) => { q.notes = v || undefined }) }}></textarea>
{/if}

<style>
  h3 { margin: 2px 0 8px; font-size: 14px; }
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 4px 8px; align-items: center; margin-bottom: 6px; }
  .grid2 input:not([type='checkbox']), .grid2 select, .grid2 textarea { width: 100%; padding: 3px 6px; }
  .lbl, .grid2 label { color: var(--muted); font-size: 12px; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 12px 0 4px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  .row { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; font-size: 12px; }
  .row input { flex: 1; min-width: 0; padding: 2px 6px; }
  .row .short, input.short { flex: 0 0 70px; }
  .spacer { flex: 1; }
  .reward { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; background: #161a20; }
  .mini { padding: 0 6px; font-size: 11px; }
  textarea { width: 100%; resize: vertical; }
</style>
