<script lang="ts">
  /** Inspector for the selected node (Dialog has its own component). */
  import type { ActionNode, ActionOp, BranchNode, QNode, QuestPlan } from '../../../shared/model'
  import { uniqueId } from '../../../shared/quest'
  import { compileQuest } from '../../../shared/export/questrules'
  import { itemKindLookup } from '../../../shared/export/items'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { editNode, editQuest, conditionTemplates } from './edit'
  import DialogInspector from './DialogInspector.svelte'
  import LinesInput from './LinesInput.svelte'
  import IdInput from '../ui/IdInput.svelte'

  interface Props { quest: QuestPlan; node: QNode }
  let { quest, node }: Props = $props()
  const qid = $derived(quest.id)
  const m = $derived(project.m!)
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions.map((f) => f.id) ?? [])])
  const templates = $derived(conditionTemplates(quest, factions, m.quests))
  const ed = <T extends QNode>(fn: (n: T) => void) => editNode<T>(qid, node.id, fn)
  const rules = $derived.by(() => {
    try {
      const c = compileQuest(quest, { sagalib: true, phrases: [...m.phrases, ...m.people.flatMap((p) => p.phrases)], itemKind: itemKindLookup(m.items, app.index?.items ?? []) })
      return c.rows.filter((r) => c.nodeOf[r.id] === node.id)
    } catch { return [] }
  })
  let nodeId = $state('')
  $effect(() => { nodeId = node.id })
  function renameNode() {
    const to = nodeId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    if (!to || to === node.id || quest.nodes.some((n) => n.id === to)) { nodeId = node.id; return }
    const from = node.id
    editQuest(qid, (q) => {
      for (const n of q.nodes) { if (n.id === from) n.id = to; if (n.type === 'link' && n.mode === 'node' && n.target === from) n.target = to }
      for (const e of q.edges) { if (e.from === from) e.from = to; if (e.to === from) e.to = to }
    })
    app.selected.questNode = to
  }
  const OPS: { op: ActionOp['op']; label: string }[] = [
    { op: 'set', label: 'Set a variable or flag' }, { op: 'credits', label: 'Give / take credits' }, { op: 'rep', label: 'Change reputation' },
    { op: 'item', label: 'Give / take an item' }, { op: 'reward', label: 'Give a reward' }, { op: 'storyPoints', label: 'Story points' }, { op: 'xp', label: 'Experience' },
    { op: 'spawn', label: 'Spawn an encounter' }, { op: 'despawn', label: 'Encounter leaves' }, { op: 'startQuest', label: 'Start another quest' }, { op: 'unset', label: 'Clear a flag' }, { op: 'line', label: 'Script line' }
  ]
  function addOp(op: ActionOp['op']) {
    const v = quest.variables[0]
    const fresh: Record<ActionOp['op'], ActionOp> = {
      set: { op: 'set', key: v ? `$global.${qid}_${v.name}` : `$global.${qid}_flag`, value: 'true' }, unset: { op: 'unset', key: `$global.${qid}_flag` },
      credits: { op: 'credits', amount: 1000 }, rep: { op: 'rep', faction: factions[0] ?? '', amount: 5 }, item: { op: 'item', item: '', qty: 1 },
      reward: { op: 'reward', reward: quest.rewards[0]?.id ?? '' }, storyPoints: { op: 'storyPoints', amount: 1 }, xp: { op: 'xp', amount: 1000 },
      spawn: { op: 'spawn', encounter: m.encounters[0]?.id ?? '' }, despawn: { op: 'despawn', encounter: m.encounters[0]?.id ?? '' },
      startQuest: { op: 'startQuest', quest: m.quests.find((x) => x.id !== qid)?.id ?? '' }, line: { op: 'line', line: '' }
    }
    ed<ActionNode>((n) => { n.ops.push(fresh[op]) })
  }
  const setOp = (i: number, k: string, v: unknown) => ed<ActionNode>((n) => { (n.ops[i] as Record<string, unknown>)[k] = v })
</script>

<div class="grid2">
  <label for="ni-id">Node id</label><input id="ni-id" type="text" class="mono" bind:value={nodeId} onchange={renameNode} title="Used in rule ids: {qid}_{node.id}" />
</div>

{#if node.type === 'dialog'}
  <DialogInspector {quest} {node} />
{:else if node.type === 'start'}
  <p class="muted small">How the quest starts is set in the quest settings (click the empty chart).</p>
{:else if node.type === 'branch'}
  {@const b = node as BranchNode}
  <div class="grid2"><label for="br-t">Title</label><input id="br-t" type="text" value={b.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<BranchNode>((n) => { n.title = v }) }} /></div>
  <div class="sect">Cases <button class="mini" onclick={() => ed<BranchNode>((n) => { n.cases.push({ id: uniqueId('c', n.cases.map((c) => c.id)), label: `Case ${n.cases.length + 1}`, conditions: [] }) })}>+ Case</button></div>
  {#each b.cases as c, i (c.id)}
    <div class="case">
      <div class="row"><input type="text" value={c.label} onchange={(e) => { const v = e.currentTarget.value; ed<BranchNode>((n) => { n.cases[i].label = v }) }} /><button class="mini" onclick={() => editQuest(qid, (q) => { const n = q.nodes.find((x) => x.id === node.id) as BranchNode; n.cases.splice(i, 1); q.edges = q.edges.filter((e) => !(e.from === node.id && e.handle === c.id)) })}>✕</button></div>
      <LinesInput lines={c.conditions} {templates} onChange={(l) => ed<BranchNode>((n) => { n.cases[i].conditions = l })} />
    </div>
  {/each}
  <p class="muted small">"Otherwise" is taken when no case matches. When several cases match, the game picks the one with the most conditions (FireBest).</p>
{:else if node.type === 'action'}
  <div class="sect">Does <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addOp(v as ActionOp['op']) }}><option value="">+ add…</option>{#each OPS as o (o.op)}<option value={o.op}>{o.label}</option>{/each}</select></div>
  {#each node.ops as op, i (i)}
    <div class="op">
      <span class="muted">{OPS.find((o) => o.op === op.op)?.label}</span>
      {#if op.op === 'set'}<input type="text" class="mono" value={op.key} onchange={(e) => setOp(i, 'key', e.currentTarget.value)} /><span>=</span><input type="text" class="mono short" value={op.value} onchange={(e) => setOp(i, 'value', e.currentTarget.value)} />
      {:else if op.op === 'unset'}<input type="text" class="mono" value={op.key} onchange={(e) => setOp(i, 'key', e.currentTarget.value)} />
      {:else if op.op === 'credits' || op.op === 'storyPoints' || op.op === 'xp'}<input type="number" value={op.amount} onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
      {:else if op.op === 'rep'}<IdInput value={op.faction ?? ''} options={factions.map((f) => ({ id: f }))} width="140px" onCommit={(v) => setOp(i, 'faction', v)} /><input type="number" value={op.amount} title="points" onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
      {:else if op.op === 'item'}<IdInput value={op.item} options={[...m.items.map((x) => ({ id: x.id, name: x.name })), ...(app.index?.items ?? [])]} width="140px" onCommit={(v) => setOp(i, 'item', v)} /><input type="number" value={op.qty} onchange={(e) => setOp(i, 'qty', Number(e.currentTarget.value))} />
      {:else if op.op === 'reward'}<select value={op.reward} onchange={(e) => setOp(i, 'reward', e.currentTarget.value)}>{#each quest.rewards as r (r.id)}<option value={r.id}>{r.id}</option>{/each}</select>
      {:else if op.op === 'spawn' || op.op === 'despawn'}<select value={op.encounter} onchange={(e) => setOp(i, 'encounter', e.currentTarget.value)}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
      {:else if op.op === 'startQuest'}<select value={op.quest} onchange={(e) => setOp(i, 'quest', e.currentTarget.value)}>{#each m.quests.filter((x) => x.id !== qid) as x (x.id)}<option value={x.id}>{x.title}</option>{/each}</select>
      {:else if op.op === 'line'}<input type="text" class="mono" value={op.line} onchange={(e) => setOp(i, 'line', e.currentTarget.value)} />{/if}
      <button class="mini" onclick={() => ed<ActionNode>((n) => { n.ops.splice(i, 1) })}>✕</button>
    </div>
  {/each}
{:else if node.type === 'stage'}
  <div class="grid2">
    <label for="st-s">Stage</label>
    <select id="st-s" value={node.stage} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'stage' }>>((n) => { n.stage = v }) }}>
      <option value="">—</option>{#each quest.stages as s (s.id)}<option value={s.id}>{s.title} ({s.id})</option>{/each}
    </select>
  </div>
  <p class="muted small">Moves the quest to this journal stage (SF_Step). Edit the stage's journal text and map marker in the outline on the left.</p>
{:else if node.type === 'encounter'}
  <div class="grid2"><label for="en-e">Encounter</label>
    <select id="en-e" value={node.encounter} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'encounter' }>>((n) => { n.encounter = v }) }}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
  </div>
  <p class="muted small">Spawns the fleet (SF_Spawn). "Defeated" and "Avoided" continue the quest when SagaLib reports the outcome. Create encounters on the Encounters page.</p>
{:else if node.type === 'wait'}
  <div class="grid2">
    <label for="w-m">Continue</label>
    <select id="w-m" value={node.mode} onchange={(e) => { const v = e.currentTarget.value as 'arrive' | 'days'; ed<Extract<QNode, { type: 'wait' }>>((n) => { n.mode = v }) }}><option value="arrive">when the player arrives at…</option><option value="days">after a number of days</option></select>
    {#if node.mode === 'arrive'}
      <label for="w-e">Entity id</label><input id="w-e" type="text" class="mono" value={node.entity ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'wait' }>>((n) => { n.entity = v }) }} />
      <label for="w-t">Text</label><textarea id="w-t" rows="3" value={node.arriveText ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'wait' }>>((n) => { n.arriveText = v }) }}></textarea>
    {:else}
      <label for="w-d">Days</label><input id="w-d" type="number" value={node.days ?? 7} onchange={(e) => { const v = Number(e.currentTarget.value); ed<Extract<QNode, { type: 'wait' }>>((n) => { n.days = v }) }} />
    {/if}
  </div>
{:else if node.type === 'end'}
  <div class="grid2">
    <label for="e-o">Outcome</label>
    <select id="e-o" value={node.outcome} onchange={(e) => { const v = e.currentTarget.value as 'success' | 'fail' | 'abandon'; ed<Extract<QNode, { type: 'end' }>>((n) => { n.outcome = v }) }}><option value="success">success</option><option value="fail">failure</option><option value="abandon">abandoned</option></select>
    <label for="e-r">Reward</label>
    <select id="e-r" value={node.reward ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'end' }>>((n) => { n.reward = v || undefined }) }}><option value="">none</option>{#each quest.rewards as r (r.id)}<option value={r.id}>{r.id}</option>{/each}</select>
  </div>
{:else if node.type === 'link'}
  <div class="grid2">
    <label for="l-m">Goes</label>
    <select id="l-m" value={node.mode} onchange={(e) => { const v = e.currentTarget.value as 'option' | 'trigger' | 'node'; ed<Extract<QNode, { type: 'link' }>>((n) => { n.mode = v }) }}>
      <option value="trigger">back into a menu (fire a trigger)</option><option value="option">into an existing option id</option><option value="node">to another node of this quest</option>
    </select>
    <label for="l-t">Target</label><input id="l-t" type="text" class="mono" value={node.target} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'link' }>>((n) => { n.target = v }) }} />
    {#if node.mode === 'trigger'}<label for="l-f">With</label><select id="l-f" value={node.fire ?? 'FireAll'} onchange={(e) => { const v = e.currentTarget.value as 'FireAll' | 'FireBest'; ed<Extract<QNode, { type: 'link' }>>((n) => { n.fire = v }) }}><option>FireAll</option><option>FireBest</option></select>{/if}
  </div>
  <p class="muted small">Read-only: leads into existing dialog (vanilla or another mod) without changing it. "FireAll PopulateOptions" returns to the contact's or market's menu.</p>
{:else if node.type === 'note'}
  <textarea rows="6" value={node.text} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'note' }>>((n) => { n.text = v }) }}></textarea>
  <p class="muted small">Notes are for you; they are not exported.</p>
{/if}

{#if rules.length}
  <div class="sect">Exported as</div>
  {#each rules as r (r.id)}
    <pre class="rule">{r.id} · {r.trigger}{r.conditions ? `\n? ${r.conditions.split('\n').join('\n? ')}` : ''}{r.script ? `\n! ${r.script.split('\n').join('\n! ')}` : ''}{r.options ? `\n> ${r.options.split('\n').join('\n> ')}` : ''}</pre>
  {/each}
{/if}

<style>
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 4px 8px; align-items: center; margin-bottom: 6px; }
  .grid2 input, .grid2 select, .grid2 textarea { width: 100%; padding: 3px 6px; }
  .grid2 label { color: var(--muted); font-size: 12px; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 10px 0 4px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  .case { border-left: 2px solid #b07a2a; padding-left: 6px; margin: 6px 0; }
  .row { display: flex; gap: 4px; margin-bottom: 3px; }
  .row input { flex: 1; }
  .op { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; font-size: 12px; }
  .op > span:first-child { width: 100%; font-size: 11px; }
  .op input[type='text'] { flex: 1; min-width: 90px; }
  .op input.short { flex: 0 1 80px; }
  .op input[type='number'] { width: 80px; }
  .mini { padding: 0 6px; font-size: 11px; }
  textarea { width: 100%; resize: vertical; }
  .small { font-size: 11px; }
  .rule { font-family: var(--mono); font-size: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; white-space: pre-wrap; margin: 0 0 4px; color: var(--muted); }
</style>
