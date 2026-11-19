<script lang="ts">
  /** Inspector for the selected node (Dialog has its own component). */
  import type { ActionNode, ActionOp, BranchNode, QNode, QuestPlan } from '../../../shared/model'
  import { uniqueId, setWaitMode } from '../../../shared/quest'
  import { newEncounter } from '../../../shared/encounters'
  import { branchPool, chances } from '../../../shared/pools'
  import { play, playModel } from './play.svelte'
  import { lockedEntityIds } from '../../../shared/patterns'
  import { compileQuest } from '../../../shared/export/questrules'
  import { itemKindLookup } from '../../../shared/export/items'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { editNode, editQuest, conditionTemplates, bountyChoices } from './edit'
  import { renameTodoElement } from '../../../shared/todo'
  import DialogInspector from './DialogInspector.svelte'
  import LinesInput from './LinesInput.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import { arriveTakesOver, defaultTakeover, targetPlaces } from '../../../shared/targets'
  import Field from '../ui/Field.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import { later } from '../ui/later'

  interface Props { quest: QuestPlan; node: QNode }
  let { quest, node }: Props = $props()
  const qid = $derived(quest.id)
  const m = $derived(project.m!)
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions.map((f) => f.id) ?? [])])
  /** #59: the MagicLib bounties this quest can start or test. */
  const bounties = $derived(bountyChoices(quest))
  const templates = $derived(conditionTemplates(quest, factions, m.quests, bounties))
  /** Places for Arrive nodes: this mod's entities and the game's market entities. */
  const places = $derived([...targetPlaces(quest), ...m.systems.flatMap((s) => s.entities.map((e) => ({ id: e.id, name: `${e.name} (${s.name})` }))), ...(app.index?.markets.flatMap((x) => x.entities.map((id) => ({ id, name: x.name }))) ?? []),
    // #64: other Saga Forge mods' places and what a sector snapshot saw
    ...(app.index?.places ?? []).filter((x) => !app.index?.markets.some((mk) => mk.entities.includes(x.id))).map((x) => ({ id: x.id, name: x.name }))])
  const ed = <T extends QNode>(fn: (n: T) => void) => editNode<T>(qid, node.id, fn)
  const rules = $derived.by(() => {
    try {
      // #60: as exported (mod conditions folded into rule conditions)
      const lq = playModel()?.quests.find((x) => x.id === quest.id) ?? quest
      const c = compileQuest(lq, { sagalib: true, phrases: [...m.phrases, ...m.people.flatMap((p) => p.phrases)], itemKind: itemKindLookup(m.items, app.index?.items ?? []), lockedEntities: lockedEntityIds(m.quests) })
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
      renameTodoElement(q, 'nodes', from, to)
    })
    app.selected.questNode = to
  }
  /** Phase 7a: the pool a Random branch rolls (its own cases, or a named pool). */
  const randomPool = $derived(node.type === 'branch' && node.random ? branchPool(quest, node, m.pools ?? []) : null)
  /** Roll a named pool (its entries become the cases; links of removed cases go), or the branch's own cases (''). */
  function usePool(id: string) {
    const nid = node.id
    editQuest(qid, (q) => {
      const n = q.nodes.find((x) => x.id === nid)
      if (n?.type !== 'branch' || !n.random) return
      if (!id) { delete n.random.pool; return }
      const p = (m.pools ?? []).find((x) => x.id === id)
      if (!p) return
      n.random.pool = id
      n.cases = p.entries.map((e) => ({ id: e.id, label: e.label || e.id, conditions: [] }))
      const keep = new Set([...n.cases.map((c) => c.id), 'else'])
      q.edges = q.edges.filter((e) => !(e.from === nid && !keep.has(e.handle)))
    })
  }
  /**
   * Walk W6: an Encounter node can create its encounter instead of sending the modder to the
   * Encounters page first. It spawns at the map marker of the stage just before this node.
   */
  async function newEncounterHere() {
    const name = (await app.ask('Name of the new encounter (the fleet this node puts in the sector)', 'Ambush', 'Create'))?.trim()
    if (!name) return
    const prefix = m.project.prefix
    const base = prefix + name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const id = uniqueId(base, m.encounters.map((e) => e.id))
    const into = quest.edges.find((e) => e.to === node.id)
    const prev = into && quest.nodes.find((n) => n.id === into.from)
    const marker = prev?.type === 'stage' ? quest.stages.find((s) => s.id === prev.stage)?.marker : undefined
    const enc = newEncounter(id, name, 'pirates')
    enc.spawn.at = marker ?? ''
    const nid = node.id
    project.change((mm) => {
      mm.encounters.push(enc)
      const n = mm.quests.find((q) => q.id === qid)?.nodes.find((x) => x.id === nid)
      if (n?.type === 'encounter') n.encounter = id
    })
    app.flash(`Created the encounter "${name}"${marker ? ` at ${marker}` : ''}. Set its fleet on the Encounters page.`)
  }
  const OPS: { op: ActionOp['op']; label: string; help: string }[] = [
    { op: 'set', label: 'Set a variable or flag', help: 'Remembers a value in the save (memory key = value). Conditions elsewhere test it. Not shown to the player.' },
    { op: 'credits', label: 'Give / take credits', help: 'Adds credits to the player (negative takes them). The dialog shows a "Gained/Lost … credits" line.' },
    { op: 'rep', label: 'Change reputation', help: 'Faction and points (5 = +5 on the relations bar). The dialog shows the change.' },
    { op: 'item', label: 'Give / take an item', help: 'Puts items in the player\'s cargo (negative quantity takes them). The dialog shows a "Gained" line.' },
    { op: 'reward', label: 'Give a reward', help: 'Pays one of the quest\'s rewards (Quest settings › Rewards) without ending the quest.' },
    { op: 'storyPoints', label: 'Story points', help: 'Gives (or takes, negative) story points.' },
    { op: 'xp', label: 'Experience', help: 'Gives the player experience points.' },
    { op: 'spawn', label: 'Spawn an encounter', help: 'Puts the encounter\'s fleet in the sector (Encounters page). An Encounter node does the same and also waits for the outcome.' },
    { op: 'despawn', label: 'Encounter leaves', help: 'The fleet flies off to a jump point and disappears. Its outcome counts as Avoided.' },
    { op: 'placeEntity', label: 'Place an object', help: 'Puts an object that "appears later" (Locations › Appears) into its system now. Each object is placed once. Needs SagaLib 1.1.' },
    { op: 'removeEntity', label: 'Remove an object', help: 'The object fades out of the sector, once, for good. One with a market is only removed with "decivilize" (the colony is destroyed, as vanilla\'s decivilization). Removing vanilla\'s or another mod\'s objects can break their content: Problems lists what depends on it. Needs SagaLib 1.1.' },
    { op: 'removePerson', label: 'Remove a person', help: 'Writes one of the mod\'s people out of the story (dead, or gone for good): they leave their market and comm directory, aren\'t recreated, and no fleet uses them as captain again. Quests can test $global.sagaforge_gone_<person>. Needs SagaLib 1.1.' },
    { op: 'spawnAtTarget', label: 'Spawn at the random target', help: "Places something near one of the quest's random targets with vanilla's mission spawning: a custom entity (a supply cache, a derelict probe, a research station…) or a faction's derelict ship. It is marked on the map and removed when the quest ends; an Arrive at the target's \"spawned\" place is the player reaching it. Once per quest. Needs SagaLib 1.2." },
    { op: 'startQuest', label: 'Start another quest', help: 'Starts a quest of this mod whose start is "started by another quest", without an offer.' },
    { op: 'unset', label: 'Clear a flag', help: 'Removes a memory key from the save.' },
    { op: 'progress', label: 'Add progress', help: 'One-time points for one of the mod\'s progress events (Saga › Progress), listed with the text in its one-time factors; starts the event if it isn\'t running. Negative points lower it. Needs SagaLib 1.2.' },
    { op: 'startBounty', label: 'Start a MagicLib bounty', help: 'The player takes a MagicLib bounty, as if accepted on MagicLib\'s bounty board: MagicLib picks its place, spawns the fleet, adds its intel and pays its reward when it ends. Once: a bounty already taken or ended stays as it is. Without MagicLib it does nothing, so test "MagicLib bounty … unavailable" in a Branch before and tell the player. Later dialog tests how it went (Branch conditions "MagicLib bounty …"). Needs SagaLib 1.3.' },
    { op: 'achievement', label: 'Unlock a MagicLib achievement', help: "Unlocks one of the mod's MagicLib achievements (Saga › Achievements), with MagicLib's notice in the dialog. MagicLib keeps achievements outside the save, so it stays unlocked in every playthrough; unlocking it again does nothing. Without MagicLib nothing happens and the dialog goes on. Needs SagaLib 1.3." },
    { op: 'line', label: 'Script line', help: 'Any rules.csv script command, written as is (e.g. AdjustRep hegemony 5).' }
  ]
  const achievements = $derived((m.project.achievements ?? []).map((a) => ({ id: a.id, name: a.name || a.id })))
  // SagaLib 1.1: objects that appear later, and every object (the mod's, vanilla's, other mods') for removal
  const deferred = $derived(m.systems.flatMap((s) => s.entities.filter((e) => !!e.appears)))
  const allEntities = $derived([...m.systems.flatMap((s) => s.entities.map((e) => ({ id: e.id, name: e.name }))), ...(app.index?.codeSystems ?? []).flatMap((c) => c.bodies.filter((b) => b.id).map((b) => ({ id: b.id, name: `${b.name} · ${c.name}` }))), ...(app.index?.markets ?? []).flatMap((mk) => mk.entities.map((id) => ({ id, name: mk.name }))), ...(app.index?.places ?? []).map((x) => ({ id: x.id, name: x.name }))])
  function addOp(op: ActionOp['op']) {
    const v = quest.variables[0]
    const fresh: Record<ActionOp['op'], ActionOp> = {
      // walk F31: a value that fits the variable's type (a number variable got "true")
      set: { op: 'set', key: v ? `$global.${qid}_${v.name}` : `$global.${qid}_flag`, value: !v || v.type === 'bool' ? 'true' : v.type === 'number' ? String((Number(v.initial) || 0) + 1) : v.initial || '' }, unset: { op: 'unset', key: `$global.${qid}_flag` },
      credits: { op: 'credits', amount: 1000 }, rep: { op: 'rep', faction: factions[0] ?? '', amount: 5 }, item: { op: 'item', item: '', qty: 1 },
      reward: { op: 'reward', reward: quest.rewards[0]?.id ?? '' }, storyPoints: { op: 'storyPoints', amount: 1 }, xp: { op: 'xp', amount: 1000 },
      spawn: { op: 'spawn', encounter: m.encounters[0]?.id ?? '' }, despawn: { op: 'despawn', encounter: m.encounters[0]?.id ?? '' },
      startQuest: { op: 'startQuest', quest: m.quests.find((x) => x.id !== qid)?.id ?? '' }, line: { op: 'line', line: '' },
      placeEntity: { op: 'placeEntity', entity: deferred[0]?.id ?? '' }, removeEntity: { op: 'removeEntity', entity: '' }, removePerson: { op: 'removePerson', person: '' },
      progress: { op: 'progress', event: m.progress?.[0]?.id ?? '', points: 100, text: '' },
      spawnAtTarget: { op: 'spawnAtTarget', target: quest.variables.find((x) => x.type === 'target')?.name ?? '', kind: 'entity', type: 'supply_cache', where: 'ORBITING_PARAM' },
      startBounty: { op: 'startBounty', bounty: bounties[0] ?? '' },
      achievement: { op: 'achievement', achievement: achievements[0]?.id ?? '' }
    }
    ed<ActionNode>((n) => { n.ops.push(fresh[op]) })
  }
  const setOp = (i: number, k: string, v: unknown) => ed<ActionNode>((n) => { (n.ops[i] as Record<string, unknown>)[k] = v })
  type Link = Extract<QNode, { type: 'link' }>
  const LINK_TARGET_HELP: Record<string, string> = {
    trigger: 'The rules trigger to fire, e.g. OpenInteractionDialog to reopen the place\'s own dialog.',
    option: 'An existing option id (vanilla or another mod), e.g. defaultLeave or cutCommLink. Its own rule answers it.',
    node: 'The id of a node of this quest to continue at.'
  }
</script>

<div class="grid2">
  <Field label="Node id" for="ni-id" help={`Names this node in the rule ids (${qid}_${node.id}). Never shown in game.`}>
    <input id="ni-id" type="text" class="mono" bind:value={nodeId} onchange={renameNode} />
  </Field>
</div>

{#if node.type === 'dialog'}
  <DialogInspector {quest} {node} />
{:else if node.type === 'start'}
  <p class="muted small">Where the quest begins. How the player reaches it (a contact, a bar, a menu option…) is set in the quest settings: click the empty chart.</p>
{:else if node.type === 'branch'}
  {@const b = node as BranchNode}
  <div class="grid2">
    <Field label="Title" for="br-t" help="Shown on the chart only.">
      <input id="br-t" type="text" value={b.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<BranchNode>((n) => { n.title = v }) }} />
    </Field>
  </div>
  <div class="grid2">
    <Field label="Picks" for="br-m" help="By conditions: a case whose condition lines are all true; when several are, the one with the most condition lines (FireBest). At random: one case by weight, like a dice roll; conditions then only say which cases may be picked. Random needs SagaLib 1.2.">
      <select id="br-m" value={b.random ? 'random' : 'conditions'} onchange={(e) => { const r = e.currentTarget.value === 'random'; ed<BranchNode>((n) => { if (r) { n.random = { nothing: 0 }; for (const c of n.cases) c.weight ??= 1 } else delete n.random }) }}>
        <option value="conditions">by conditions</option><option value="random">at random (by weight)</option>
      </select>
    </Field>
    {#if b.random}
      <Field label="Pool" for="br-p" help="This branch's own cases, or a named pool from Saga › Pools (shared by several branches; its entries become the cases here).">
        <span class="row"><select id="br-p" value={b.random.pool ?? ''} onchange={(e) => usePool(e.currentTarget.value)}>
          <option value="">this branch's cases</option>{#each (m.pools ?? []).filter((x) => !x.use || x.use === 'branch' || x.id === node.random?.pool) as p (p.id)}<option value={p.id}>{p.name || p.id}</option>{/each}
        </select>{#if b.random.pool}<button class="mini" onclick={() => usePool(b.random!.pool!)} title="Make the cases match the pool's entries again">Update cases</button>{/if}</span>
      </Field>
      <Field label="Rolled for" for="br-s" help="The place or person in the dialog: the same object gives the same result after a reload, and 'once per object' counts per object. The world: one stored seed for the whole playthrough.">
        <select id="br-s" value={b.random.scope ?? 'object'} onchange={(e) => { const v = e.currentTarget.value as 'object' | 'global'; ed<BranchNode>((n) => { n.random!.scope = v === 'object' ? undefined : v }) }}>
          <option value="object">the place or person in the dialog</option><option value="global">the world</option>
        </select>
      </Field>
      {#if !b.random.pool}
        <Field label="Nothing" for="br-n" help="The weight of 'nothing happens': then 'Otherwise' is taken. 0 = a case is always picked (unless none may be).">
          <input id="br-n" type="number" min="0" step="1" value={b.random.nothing ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed<BranchNode>((n) => { n.random!.nothing = v }) }} />
        </Field>
      {/if}
      {#if play.active && randomPool}
        <Field label="Next pick" for="br-f" help="Play mode only: force what the next roll of this branch picks, to try each way.">
          <select id="br-f" value="" onchange={(e) => { const v = e.currentTarget.value; if (v) play.forcePool(randomPool!.id, v); e.currentTarget.value = '' }}>
            <option value="">roll</option>{#each randomPool.entries as en (en.id)}<option value={en.id}>{en.label || en.id}</option>{/each}<option value="nothing">nothing</option>
          </select>
        </Field>
      {/if}
    {/if}
  </div>
  {#if b.random && b.random.pool && randomPool}
    <div class="sect">Cases (from pool "{randomPool.name || randomPool.id}")</div>
    <p class="f-help">The pool's entries, with their chance when all may be picked. Edit them on Saga › Pools.</p>
    {#each chances(randomPool) as ch (ch.id)}<div class="row small"><span class="mono">{ch.id}</span><span class="spacer"></span><span>{Math.round(ch.chance * 1000) / 10}%</span></div>{/each}
  {:else}
  <div class="sect">Cases <button class="mini" onclick={() => ed<BranchNode>((n) => { n.cases.push({ id: uniqueId('c', n.cases.map((c) => c.id)), label: `Case ${n.cases.length + 1}`, conditions: [], ...(n.random ? { weight: 1 } : {}) }) })}>+ Case</button></div>
  <p class="f-help">{b.random ? 'Picks one case at random by its weight; the chance shown assumes every case may be picked. Conditions and limits say when a case may be picked at all. "Otherwise" is the nothing share, and is also taken when no case may be picked.' : 'Picks a way on without showing anything to the player. Each case is a label (chart only) and condition lines that must all be true. "Otherwise" is taken when no case matches; when several match, the game takes the one with the most conditions (FireBest).'}</p>
  {#each b.cases as c, i (c.id)}
    <div class="case">
      <div class="row"><input type="text" value={c.label} title="Label on the chart" onchange={(e) => { const v = e.currentTarget.value; ed<BranchNode>((n) => { n.cases[i].label = v }) }} /><button class="mini" onclick={() => editQuest(qid, (q) => { const n = q.nodes.find((x) => x.id === node.id) as BranchNode; n.cases.splice(i, 1); q.edges = q.edges.filter((e) => !(e.from === node.id && e.handle === c.id)) })}>✕</button></div>
      {#if b.random}
        <div class="row small">
          <label title="Relative weight: 3 against 1 is three times as likely">weight <input type="number" class="short" min="0" step="1" value={c.weight ?? 1} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed<BranchNode>((n) => { n.cases[i].weight = v }) }} /></label>
          <span class="muted">{Math.round((randomPool ? (chances(randomPool).find((x) => x.id === c.id)?.chance ?? 0) : 0) * 1000) / 10}%</span>
          <select title="How often this case may be picked" value={c.limit?.once ?? ''} onchange={(e) => { const v = e.currentTarget.value as '' | 'playthrough' | 'object'; ed<BranchNode>((n) => { const l = { ...(n.cases[i].limit ?? {}) }; if (v) l.once = v; else delete l.once; n.cases[i].limit = l }) }}>
            <option value="">any number of times</option><option value="playthrough">once per playthrough</option><option value="object">once per place / person</option>
          </select>
        </div>
        <div class="row small">
          <label title="At least this many days between two picks; 0 = none">cooldown <input type="number" class="short" min="0" value={c.limit?.cooldownDays ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); ed<BranchNode>((n) => { n.cases[i].limit = { ...(n.cases[i].limit ?? {}), cooldownDays: v || undefined } }) }} /> days</label>
          <label title="At most this many picks per playthrough; 0 = no limit">at most <input type="number" class="short" min="0" value={c.limit?.max ?? 0} onchange={(e) => { const v = Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)); ed<BranchNode>((n) => { n.cases[i].limit = { ...(n.cases[i].limit ?? {}), max: v || undefined } }) }} /> times</label>
        </div>
      {/if}
      <ModsCond compact value={c.mods} onChange={(v) => ed<BranchNode>((n) => { if (v) n.cases[i].mods = v; else delete n.cases[i].mods })} />
      <LinesInput lines={c.conditions} {templates} placeholder={b.random ? 'may be picked only if… (optional)' : `condition lines, e.g. ${quest.variables[0] ? `$global.${qid}_${quest.variables[0].name} == 2` : `$global.${qid}_flag`}`} onChange={(l) => ed<BranchNode>((n) => { n.cases[i].conditions = l })} />
    </div>
  {/each}
  {/if}
{:else if node.type === 'action'}
  <div class="grid2">
    <Field label="Title" for="ac-t" help="Shown on the chart only.">
      <input id="ac-t" type="text" value={node.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<ActionNode>((n) => { n.title = v }) }} />
    </Field>
  </div>
  <div class="sect">Does <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addOp(v as ActionOp['op']) }}><option value="">+ add…</option>{#each OPS as o (o.op)}<option value={o.op}>{o.label}</option>{/each}</select></div>
  <p class="f-help">Things that happen in order, then the quest goes on to the next node. Nothing is shown unless a step says so.</p>
  {#each node.ops as op, i (i)}
    {@const info = OPS.find((o) => o.op === op.op)}
    <div class="op">
      <span class="opl">{info?.label}</span>
      {#if op.op === 'set'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(i, 'key', e.currentTarget.value)} /><span>=</span><input type="text" class="mono short" value={op.value} title="Value" onchange={(e) => setOp(i, 'value', e.currentTarget.value)} />
      {:else if op.op === 'unset'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(i, 'key', e.currentTarget.value)} />
      {:else if op.op === 'credits' || op.op === 'storyPoints' || op.op === 'xp'}<input type="number" value={op.amount} title="Amount" onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
      {:else if op.op === 'rep'}<IdInput value={op.faction ?? ''} options={factions.map((f) => ({ id: f }))} width="140px" placeholder="faction" onCommit={(v) => setOp(i, 'faction', v)} /><input type="number" value={op.amount} title="points" onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
      {:else if op.op === 'item'}<IdInput value={op.item} options={[...m.items.map((x) => ({ id: x.id, name: x.name })), ...(app.index?.items ?? [])]} width="140px" placeholder="item id" onCommit={(v) => setOp(i, 'item', v)} /><input type="number" value={op.qty} title="Quantity" onchange={(e) => setOp(i, 'qty', Number(e.currentTarget.value))} />
      {:else if op.op === 'reward'}<select value={op.reward} onchange={(e) => setOp(i, 'reward', e.currentTarget.value)}>{#each quest.rewards as r (r.id)}<option value={r.id}>{r.id}</option>{/each}</select>
      {:else if op.op === 'spawn' || op.op === 'despawn'}<select value={op.encounter} onchange={(e) => setOp(i, 'encounter', e.currentTarget.value)}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
      {:else if op.op === 'startQuest'}<select value={op.quest} onchange={(e) => setOp(i, 'quest', e.currentTarget.value)}>{#each m.quests.filter((x) => x.id !== qid) as x (x.id)}<option value={x.id}>{x.title}</option>{/each}</select>
      {:else if op.op === 'placeEntity'}<select value={op.entity} onchange={(e) => setOp(i, 'entity', e.currentTarget.value)}><option value="">—</option>{#each deferred as d (d.id)}<option value={d.id}>{d.name} ({d.id})</option>{/each}</select>
      {:else if op.op === 'spawnAtTarget'}
        <select title="The random target" value={op.target} onchange={(e) => setOp(i, 'target', e.currentTarget.value)}><option value="">target…</option>{#each quest.variables.filter((x) => x.type === 'target') as tv (tv.name)}<option value={tv.name}>{tv.name}</option>{/each}</select>
        <select title="What to place" value={op.kind} onchange={(e) => setOp(i, 'kind', e.currentTarget.value)}><option value="entity">entity type</option><option value="derelict">derelict ship of faction</option></select>
        <IdInput value={op.type} options={op.kind === 'derelict' ? factions.map((f) => ({ id: f, name: f })) : (app.index?.customEntityTypes ?? []).map((t) => ({ id: t.id, name: t.name ?? t.id }))} width="150px" placeholder={op.kind === 'derelict' ? 'faction id' : 'e.g. supply_cache'} onCommit={(v) => setOp(i, 'type', v)} />
        <select title="Where, as vanilla's EntityLocationType" value={op.where ?? 'ORBITING_PARAM'} onchange={(e) => setOp(i, 'where', e.currentTarget.value)}><option value="ORBITING_PARAM">around the target</option><option value="ORBITING_PLANET_OR_STAR">orbiting a planet or star there</option><option value="HIDDEN">hidden in its system</option><option value="UNCOMMON">somewhere unusual there</option><option value="ANY">anywhere in its system</option></select>
      {:else if op.op === 'removeEntity'}<IdInput value={op.entity} options={allEntities} width="170px" placeholder="object id" onCommit={(v) => setOp(i, 'entity', v)} /><label class="small" title="Needed for an object with a market: the colony is destroyed (vanilla's decivilization)"><input type="checkbox" checked={!!op.decivilize} onchange={(e) => { const v = e.currentTarget.checked; if (v && !confirm('Decivilize: the colony on this object is destroyed for good (as vanilla\'s decivilization), with everything that depends on it. Continue?')) { e.currentTarget.checked = false; return } setOp(i, 'decivilize', v) }} /> decivilize</label>
      {:else if op.op === 'removePerson'}<select value={op.person} onchange={(e) => { const v = e.currentTarget.value; if (v && !confirm('Remove this person for good? In game they are gone from every market and never come back (a save can\'t undo it).')) { e.currentTarget.value = op.person; return } setOp(i, 'person', v) }}><option value="">—</option>{#each m.people as p (p.id)}<option value={p.id}>{p.name.first} {p.name.last}</option>{/each}</select>
      {:else if op.op === 'progress'}<select value={op.event} onchange={(e) => setOp(i, 'event', e.currentTarget.value)}><option value="">—</option>{#each m.progress ?? [] as pe (pe.id)}<option value={pe.id}>{pe.name}</option>{/each}</select><input type="number" class="short" value={op.points} title="Points (negative lowers it)" onchange={(e) => setOp(i, 'points', Number(e.currentTarget.value))} /><input type="text" value={op.text ?? ''} placeholder="text in the event's list" title="Shown in the event's one-time factors" onchange={(e) => setOp(i, 'text', e.currentTarget.value)} />
      {:else if op.op === 'startBounty'}<IdInput value={op.bounty} options={bounties.map((id) => ({ id, name: m.bounties?.find((b) => b.id === id)?.name || id }))} width="200px" placeholder="bounty id" onCommit={(v) => setOp(i, 'bounty', v)} />
      {:else if op.op === 'achievement'}<IdInput value={op.achievement} options={achievements} width="200px" placeholder="achievement id" onCommit={(v) => setOp(i, 'achievement', v)} /><button class="mini" title="Saga › Achievements" onclick={() => { app.selected.sagaOpen = 'achievements'; app.selected.sagaTab = 'achievements'; app.go('saga') }}>Achievements…</button>
      {:else if op.op === 'line'}<input type="text" class="mono" value={op.line} onchange={(e) => setOp(i, 'line', e.currentTarget.value)} />{/if}
      <button class="mini" onclick={() => ed<ActionNode>((n) => { n.ops.splice(i, 1) })}>✕</button>
      {#if info}<div class="f-help oph">{info.help}</div>{/if}
    </div>
  {/each}
{:else if node.type === 'stage'}
  <div class="grid2">
    <Field label="Stage" for="st-s" help="Moves the quest to this journal stage (SF_Step): the intel shows its journal text and next-step line, the map marker moves, and a success or failure stage ends the quest. Edit the stages in the outline on the left; + New stage… adds one and opens its form there.">
      <select id="st-s" value={node.stage} onchange={(e) => {
        let v = e.currentTarget.value
        // walk W4: a new stage from here, instead of the outline first; its form opens on the left
        const fresh = v === '+new'
        if (fresh) v = uniqueId('stage', quest.stages.map((s) => s.id))
        editQuest(qid, (q) => {
          if (fresh) q.stages.push({ id: v, title: 'New stage', journal: '', kind: 'normal', renamedFrom: [] })
          const n = q.nodes.find((x) => x.id === node.id)
          if (n?.type === 'stage') n.stage = v
        })
        if (fresh) app.selected.questStage = v
      }}>
        <option value="">—</option>{#each quest.stages as s (s.id)}<option value={s.id}>{s.title} ({s.id})</option>{/each}
        <option value="+new">+ New stage…</option>
      </select>
    </Field>
  </div>
{:else if node.type === 'encounter'}
  <div class="grid2">
    <Field label="Encounter" for="en-e" help="The fleet to put in the sector (SF_Spawn). + New… creates one at the stage's map marker; its fleet is set on the Encounters page.&quot;after spawning&quot; continues at once; &quot;Defeated&quot; and &quot;Avoided&quot; continue later, when SagaLib reports how the fleet was dealt with.">
      <span class="row"><select id="en-e" value={node.encounter} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'encounter' }>>((n) => { n.encounter = v }) }}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
        <button class="mini" onclick={newEncounterHere} title="Create an encounter for this node, placed at the stage's map marker; edit its fleet on the Encounters page">+ New…</button></span>
    </Field>
  </div>
{:else if node.type === 'wait'}
  {#if node.mode === 'bounty'}<p class="f-help">SagaLib watches the bounty while the quest is at the stage set before this node, and continues by the way it ended: <b>Succeeded</b> (the target was beaten), <b>Failed</b> (its flagship was salvaged), <b>Expired</b> (time ran out, only when the player turned on MagicLib's &quot;Enable Bounty Deadlines&quot; in LunaLib, off by default; or it ended without the player), <b>Dismissed</b> (only from MagicLib's old bar board, switched off in 1.5.6: rare). If it ended before the quest got here, the quest continues at once. The next node opens in its own dialog once no other is open, after MagicLib's own messages. An output not connected leaves the quest waiting here. Without MagicLib the bounty is unavailable and the quest waits for good, so test "MagicLib bounty … unavailable" before. Needs SagaLib 1.3.</p>{/if}
  <div class="grid2">
    <Field label="Continue" for="w-m" help="An arrival waits until the player docks at or visits the place; a timer waits a number of in-game days; a MagicLib bounty waits until the bounty ends, with one output per way it can end.">
      <select id="w-m" value={node.mode} onchange={(e) => { const v = e.currentTarget.value as 'arrive' | 'days' | 'bounty'; editQuest(qid, (q) => { setWaitMode(q, node.id, v) }) }}><option value="arrive">when the player arrives at…</option><option value="days">after a number of days</option><option value="bounty">when a MagicLib bounty ends</option></select>
    </Field>
    {#if node.mode === 'bounty'}
      <Field label="Bounty" help="The MagicLib bounty to wait for: one of this mod's (Quests › MagicLib bounties), a hand-written one in its magicBounty_data.json, or another mod's id. It may be started by this quest (Start a MagicLib bounty) or taken on MagicLib's board.">
        <IdInput value={node.bounty ?? ''} options={bounties.map((id) => ({ id, name: m.bounties?.find((b) => b.id === id)?.name || id }))} width="220px" placeholder="bounty id" onCommit={(v) => ed<Extract<QNode, { type: 'wait' }>>((n) => { n.bounty = v.trim() || undefined })} />
      </Field>
    {:else if node.mode === 'arrive'}
      <Field label="Place" later={later(quest, `nodes#${node.id}.entity`, (fn) => editQuest(qid, fn))} help="The entity the player must reach: a planet, station, wreck… of this mod or the game. Usually the current stage's map marker.">
        <IdInput value={node.entity ?? ''} options={places} placeholder="e.g. vgc_convoy_wreck" onCommit={(v) => ed<Extract<QNode, { type: 'wait' }>>((n) => { n.entity = v })} />
      </Field>
      <!-- RC-F2: an option in the place's menu (vanilla's menu stays), or a takeover of the arrival -->
      {@const locked = !!node.entity && lockedEntityIds(m.quests).has(node.entity)}
      <Field label="Shows as" for="w-tk" help={locked ? 'This place is protected by a lock conversation (only Leave), which owns its arrival: the scene takes the arrival over at this step, as the lock needs.' : 'An option in the place\'s own menu: the player sees the normal dialog (trade, salvage, planet info) and picks your option to start the scene. Or the scene takes the arrival over, for something that must interrupt (a hail as the player docks).'}>
        <select id="w-tk" value={locked || arriveTakesOver(quest, node) ? 'takeover' : 'option'} disabled={locked} onchange={(e) => { const v = e.currentTarget.value === 'takeover'; const def = defaultTakeover(quest, node.entity); ed<Extract<QNode, { type: 'wait' }>>((n) => { n.takeover = v === def ? undefined : v }) }}>
          <option value="option">an option in the place's menu</option><option value="takeover">takes over the arrival</option>
        </select>
      </Field>
      {#if !locked && !arriveTakesOver(quest, node)}
        <Field label="Option" for="w-o" help="The option's text in the place's menu, e.g. &quot;Search the debris for the black box&quot;. It is there while the quest waits here.">
          <input id="w-o" type="text" value={node.optionText ?? ''} placeholder="Look around" onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'wait' }>>((n) => { n.optionText = v || undefined }) }} />
        </Field>
      {/if}
      <Field label="Text" for="w-t" help={locked || arriveTakesOver(quest, node) ? 'The paragraph in the dialog that opens when the player arrives there, before the next node.' : 'The paragraph shown when the player picks the option, before the next node.'}>
        <textarea id="w-t" rows="3" value={node.arriveText ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'wait' }>>((n) => { n.arriveText = v }) }}></textarea>
      </Field>
    {:else}
      <Field label="Days" for="w-d" help="In-game days to wait (SagaLib's timer). Nothing is shown; the next node runs when they are up.">
        <input id="w-d" type="number" value={node.days ?? 7} onchange={(e) => { const v = Number(e.currentTarget.value); ed<Extract<QNode, { type: 'wait' }>>((n) => { n.days = v }) }} />
      </Field>
    {/if}
  </div>
{:else if node.type === 'raid'}
  {@const R = (fn: (n: Extract<QNode, { type: 'raid' }>) => void) => ed<Extract<QNode, { type: 'raid' }>>(fn)}
  <p class="f-help">A ground raid on the place in this dialog, like vanilla's story raids (no SagaLib): the briefing below, then "Continue" opens vanilla's raid menu with this one objective, where the player commits marines. <b>Raid done</b> continues after vanilla's result screens; <b>Backed out</b> is the raid menu's Go back (not connected: the place's menu). Raids can't fail in vanilla, they only cost marines. Use it where the dialog is at a planet, station or colony.</p>
  <div class="grid2">
    <Field label="Title" for="r-ti" help="Only for the chart.">
      <input id="r-ti" type="text" value={node.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; R((n) => { n.title = v }) }} />
    </Field>
    <Field label="Briefing" for="r-tx" help="The paragraph before the raid menu (the dialog's text; its only option is &quot;Continue&quot;).">
      <textarea id="r-tx" rows="3" value={node.text} onchange={(e) => { const v = e.currentTarget.value; R((n) => { n.text = v }) }}></textarea>
    </Field>
    <Field label="Objective" for="r-ob" help="The objective's name in the raid menu, e.g. &quot;Take the relic from the compound&quot;.">
      <input id="r-ob" type="text" value={node.objective} onchange={(e) => { const v = e.currentTarget.value; R((n) => { n.objective = v }) }} />
    </Field>
    <Field label="Danger" for="r-dg" help="How dangerous the menu says the objective is; more danger needs more marines (vanilla's RaidDangerLevel).">
      <select id="r-dg" value={node.danger} onchange={(e) => { const v = e.currentTarget.value as Extract<QNode, { type: 'raid' }>['danger']; R((n) => { n.danger = v }) }}>
        {#each ['NONE', 'MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as d (d)}<option value={d}>{d.toLowerCase()}</option>{/each}
      </select>
    </Field>
    <Field label="Defenders" for="r-df" help="The defenders' strength ($raidDifficulty): vanilla's story raids use 100–250. 0 uses the colony's own ground defences.">
      <input id="r-df" type="number" min="0" value={node.difficulty} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); R((n) => { n.difficulty = v }) }} />
    </Field>
    <Field label="Experience" for="r-xp" help="Experience the player gets for the raid (vanilla: 3000–5000).">
      <input id="r-xp" type="number" min="0" value={node.xp} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); R((n) => { n.xp = v }) }} />
    </Field>
    <Field label="Icon" for="r-ic" help="The objective's icon: an id from settings.json's raidObjectives (vanilla's story raids use genericIcon).">
      <input id="r-ic" type="text" class="mono" value={node.icon ?? ''} placeholder="genericIcon" onchange={(e) => { const v = e.currentTarget.value.trim(); R((n) => { n.icon = v || undefined }) }} />
    </Field>
    <Field label="Tooltip" for="r-tt" help="Shown when the player hovers over the objective (optional).">
      <input id="r-tt" type="text" value={node.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; R((n) => { n.tooltip = v || undefined }) }} />
    </Field>
    <Field label="During the raid" for="r-rt" help="The paragraph shown while the raid happens, before vanilla's result screens (losses, experience).">
      <textarea id="r-rt" rows="3" value={node.raidText ?? ''} onchange={(e) => { const v = e.currentTarget.value; R((n) => { n.raidText = v || undefined }) }}></textarea>
    </Field>
  </div>
{:else if node.type === 'end'}
  <div class="grid2">
    <Field label="Outcome" for="e-o" help="How the quest ends: the journal moves it to Completed (success) or Failed; abandoned is like the player's Abandon button.">
      <select id="e-o" value={node.outcome} onchange={(e) => { const v = e.currentTarget.value as 'success' | 'fail' | 'abandon'; ed<Extract<QNode, { type: 'end' }>>((n) => { n.outcome = v }) }}><option value="success">success</option><option value="fail">failure</option><option value="abandon">abandoned</option></select>
    </Field>
    <Field label="Reward" for="e-r" help="Paid when the quest ends here; the dialog shows its &quot;Gained …&quot; lines. Rewards are set in the quest settings.">
      <select id="e-r" value={node.reward ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'end' }>>((n) => { n.reward = v || undefined }) }}><option value="">none</option>{#each quest.rewards as r (r.id)}<option value={r.id}>{r.id}</option>{/each}</select>
    </Field>
    {#if achievements.length || node.achievement}
      <Field label="Achievement" for="e-a" help="A MagicLib achievement (Saga › Achievements) unlocked when the quest ends here, with MagicLib's notice after the reward lines. It stays unlocked in every save. Without MagicLib nothing happens. Needs SagaLib 1.3.">
        <select id="e-a" value={node.achievement ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'end' }>>((n) => { n.achievement = v || undefined }) }}><option value="">none</option>{#each achievements as a (a.id)}<option value={a.id}>{a.name}</option>{/each}{#if node.achievement && !achievements.some((a) => a.id === node.achievement)}<option value={node.achievement}>{node.achievement} (not the mod's)</option>{/if}</select>
      </Field>
    {/if}
  </div>
  <p class="f-help">After an End node the conversation can go on (a last line from the contact, or a Link back to the menu).</p>
{:else if node.type === 'link'}
  <div class="grid2">
    <Field label="Goes" for="l-m" help="Where the conversation goes after this branch. Back to the menu is the safe ending: it returns to the market's, contact's or fleet's options, and closes the dialog at a wreck or other place without a menu.">
      <select id="l-m" value={node.mode} onchange={(e) => { const v = e.currentTarget.value as Link['mode']; ed<Link>((n) => { n.mode = v; if (v === 'menu' || v === 'bar') { n.target = ''; delete n.fire } else if (v === 'trigger' && !n.target) { n.target = 'OpenInteractionDialog'; n.fire = 'FireBest' } }) }}>
        <option value="menu">back to the menu (or close where there is none)</option><option value="bar">back to the bar (a bar scene)</option><option value="trigger">fire a trigger</option><option value="option">into an existing option id</option><option value="node">to another node of this quest</option>
      </select>
    </Field>
    {#if quest.start.kind === 'interject' && quest.start.option}
      {@const back = quest.start.option}
      <!-- RC-F2: the hand-back preset for an interjection -->
      <Field label="Preset" help={`An interjection must give the player vanilla's answer back: "Hand back" continues into "${back}", the option it interrupted (for salExplore: vanilla's salvage goes on).`}>
        <button class="mini" disabled={node.mode === 'option' && node.target === back} onclick={() => ed<Link>((n) => { n.mode = 'option'; n.target = back; delete n.fire })}>Hand back to {back}</button>
      </Field>
    {/if}
    {#if node.mode !== 'menu' && node.mode !== 'bar'}
      <Field label="Target" for="l-t" help={LINK_TARGET_HELP[node.mode]}>
        <input id="l-t" type="text" class="mono" value={node.target} onchange={(e) => { const v = e.currentTarget.value; ed<Link>((n) => { n.target = v }) }} />
      </Field>
    {/if}
    {#if node.mode === 'trigger'}
      <Field label="With" for="l-f" help="FireBest runs the one best-matching rule (to open a dialog); FireAll runs every matching rule (to fill a menu).">
        <select id="l-f" value={node.fire ?? 'FireAll'} onchange={(e) => { const v = e.currentTarget.value as 'FireAll' | 'FireBest'; ed<Link>((n) => { n.fire = v }) }}><option>FireAll</option><option>FireBest</option></select>
      </Field>
    {/if}
  </div>
  <p class="f-help">Read-only: leads into existing dialog (vanilla or another mod) without changing it.</p>
{:else if node.type === 'note'}
  <div class="grid2">
    <Field wide label="Note" for="nt-t" help="For you only: notes are never exported.">
      <textarea id="nt-t" rows="6" value={node.text} onchange={(e) => { const v = e.currentTarget.value; ed<Extract<QNode, { type: 'note' }>>((n) => { n.text = v }) }}></textarea>
    </Field>
  </div>
{/if}

{#if rules.length}
  <div class="sect">Exported as</div>
  {#each rules as r (r.id)}
    <pre class="rule">{r.id} · {r.trigger}{r.conditions ? `\n? ${r.conditions.split('\n').join('\n? ')}` : ''}{r.script ? `\n! ${r.script.split('\n').join('\n! ')}` : ''}{r.options ? `\n> ${r.options.split('\n').join('\n> ')}` : ''}</pre>
  {/each}
{/if}

<style>
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 2px 8px; align-items: center; margin-bottom: 6px; }
  .grid2 input, .grid2 select, .grid2 textarea { width: 100%; padding: 3px 6px; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 10px 0 2px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  p.f-help { margin: 0 0 4px; }
  .case { border-left: 2px solid #b07a2a; padding-left: 6px; margin: 6px 0; }
  .row { display: flex; gap: 4px; margin-bottom: 3px; }
  .row input { flex: 1; }
  .row select { flex: 1; min-width: 0; }
  .row .mini { white-space: nowrap; }
  .op { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; font-size: 12px; }
  .op .opl { width: 100%; font-size: 12px; color: var(--text); }
  .op .oph { width: 100%; }
  .op input[type='text'] { flex: 1; min-width: 90px; }
  .op input.short { flex: 0 1 80px; }
  .case input.short { width: 60px; }
  .case .row.small { align-items: center; gap: 8px; font-size: 12px; }
  .row .spacer { flex: 1; }
  .op input[type='number'] { width: 80px; }
  .mini { padding: 0 6px; font-size: 11px; }
  textarea { width: 100%; resize: vertical; }
  .small { font-size: 11px; }
  .rule { font-family: var(--mono); font-size: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; white-space: pre-wrap; margin: 0 0 4px; color: var(--muted); }
</style>
