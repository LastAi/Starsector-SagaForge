<script lang="ts">
  /** Quest planner (PLAN.md §5, mock-up quest.html): flow chart, inspector, dialog preview, Play mode, Rules view. */
  import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge, type Connection } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import type { NodeType, QNode, QuestPlan, DialogNode } from '../../../shared/model'
  import { newNode, newQuest, uniqueId, handlesOf, reachable, slug, stageGroups } from '../../../shared/quest'
  import StageFrame from '../graph/StageFrame.svelte'
  import { itemKindLookup } from '../../../shared/export/items'
  import { compileQuest, nodeRuleId, phraseCombos } from '../../../shared/export/questrules'
  import { compileRules, Engine, emptyView, type DialogView } from '../../../shared/rules/engine'
  import { newSimState, sagaHooks } from '../../../shared/play'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import { personLook, itemIcon, illustrationPath, makePlayContext, testCtx } from '../state/testctx.svelte'
  import { editQuest } from '../quests/edit'
  import { play, world, allPhrases } from '../quests/play.svelte'
  import QNodeView from '../graph/QNodeView.svelte'
  import FlowApi, { type FlowHandle } from '../graph/FlowApi.svelte'
  import { autoLayout } from '../graph/layout'
  import NodeInspector from '../quests/NodeInspector.svelte'
  import QuestSettings from '../quests/QuestSettings.svelte'
  import DialogPreview from '../dialog/DialogPreview.svelte'
  import TestContextPanel from '../dialog/TestContextPanel.svelte'
  import Modal from '../ui/Modal.svelte'
  import Splitter from '../Splitter.svelte'
  import { layout, saveLayout } from '../layout.svelte'
  import { lastRelease, renameStage } from '../../../shared/release'

  const m = $derived(project.m)
  const qid = $derived(app.selected.quests ?? m?.quests[0]?.id ?? null)
  const quest = $derived(m?.quests.find((q) => q.id === qid) ?? null)
  const selNode = $derived(app.selected.questNode ?? null)
  const node = $derived(quest?.nodes.find((n) => n.id === selNode) ?? null)
  let center = $state<'chart' | 'rules'>('chart')
  let dockTab = $state<'preview' | 'problems' | 'log'>('preview')
  let flow: FlowHandle | null = null
  const phrases = $derived([...(m?.phrases ?? []), ...(m?.people.flatMap((p) => p.phrases) ?? [])])
  const compiled = $derived(quest ? compileQuest(quest, { sagalib: true, phrases, itemKind: itemKindLookup(m?.items ?? [], app.index?.items ?? []) }) : null)
  const qProblems = $derived(problems.live.filter((p) => p.ref?.page === 'quests' && p.ref.id === qid))
  const nodeProblems = (nid: string) => qProblems.filter((p) => p.ref?.sub === nid || p.ref?.sub?.startsWith(`${nid}/`))
  const personName = (id: string) => { const l = personLook(id); return l?.name ?? id }
  const nodeLabel = (n: QNode) => (n.type === 'dialog' || n.type === 'branch' || n.type === 'action' ? n.title ?? '' : n.type === 'stage' ? quest?.stages.find((s) => s.id === n.stage)?.id ?? '' : '')

  // ---- chart nodes/edges, rebuilt from the plan
  let nodes = $state.raw<Node[]>([])
  let edges = $state.raw<Edge[]>([])
  $effect(() => {
    const q = quest
    if (!q) { nodes = []; edges = []; return }
    const path = play.active ? play.path : []
    const reach = play.active ? new Set(path) : null
    void JSON.stringify(q)
    const sel = selNode
    const qnodes: Node[] = q.nodes.map((n) => ({
      id: n.id, type: 'q', position: { x: n.x, y: n.y }, selected: n.id === sel, deletable: n.type !== 'start',
      data: { node: n, quest: q, problems: nodeProblems(n.id), path: !!reach?.has(n.id), faded: !!reach && !reach.has(n.id) && n.type !== 'note', current: play.active && path[path.length - 1] === n.id, label: nodeLabel, personName }
    }) as Node)
    // stage frames behind the nodes (PLAN.md §5)
    const COLORS = ['#a0558f', '#4fb3ff', '#6fd07a', '#f0b44c', '#c9a0ff', '#ff6b6b']
    const frames: Node[] = stageGroups(q).map((g, i) => {
      const members = q.nodes.filter((n) => g.nodes.includes(n.id))
      const x0 = Math.min(...members.map((n) => n.x)) - 18, y0 = Math.min(...members.map((n) => n.y)) - 26
      const x1 = Math.max(...members.map((n) => n.x + 220)) + 18, y1 = Math.max(...members.map((n) => n.y + 70 + handlesOf(n).length * 24)) + 18
      const st = q.stages.find((s) => s.id === g.stage)
      return { id: `frame:${g.stage}`, type: 'frame', position: { x: x0, y: y0 }, zIndex: -1, draggable: false, selectable: false, deletable: false, focusable: false,
        data: { label: `Stage ${g.stage}${st ? ` · ${st.title}` : ''}`, color: st?.color ?? COLORS[i % COLORS.length], w: x1 - x0, h: y1 - y0 } }
    })
    nodes = [...frames, ...qnodes]
    edges = q.edges.map((e) => {
      const taken = play.active && path.includes(e.from) && path.includes(e.to)
      const src = q.nodes.find((n) => n.id === e.from)
      const story = src?.type === 'dialog' && !!src.options.find((o) => o.id === e.handle)?.story
      return { id: e.id, source: e.from, target: e.to, sourceHandle: e.handle, style: taken ? 'stroke:#6fd07a;stroke-width:2.5' : story ? 'stroke:rgb(163,239,128)' : 'stroke:#5a6a80', animated: taken }
    })
  })

  function onDragStop({ nodes: moved }: { nodes: Node[] }) {
    if (!qid || !moved.length) return
    editQuest(qid, (q) => { for (const mv of moved) { const n = q.nodes.find((x) => x.id === mv.id); if (n) { n.x = Math.round(mv.position.x); n.y = Math.round(mv.position.y) } } })
  }
  function onConnect(c: Connection) {
    if (!qid || !c.source || !c.target || c.source === c.target) return
    editQuest(qid, (q) => {
      const handle = c.sourceHandle ?? 'next'
      q.edges = q.edges.filter((e) => !(e.from === c.source && e.handle === handle))
      q.edges.push({ id: uniqueId(`e_${c.source}_${handle}`, q.edges.map((e) => e.id)), from: c.source, handle, to: c.target })
    })
  }
  function onDelete({ nodes: dn, edges: de }: { nodes: Node[]; edges: Edge[] }) {
    if (!qid) return
    const nids = new Set(dn.filter((n) => !n.id.startsWith('frame:')).map((n) => n.id))
    const eids = new Set(de.map((e) => e.id))
    editQuest(qid, (q) => {
      q.nodes = q.nodes.filter((n) => !nids.has(n.id) || n.type === 'start')
      q.edges = q.edges.filter((e) => !eids.has(e.id) && !nids.has(e.from) && !nids.has(e.to))
    })
    if (selNode && nids.has(selNode)) app.selected.questNode = null
  }

  // ---- new node menu (double-click the canvas, or drop a connection on empty space)
  let menu = $state<{ x: number; y: number; fx: number; fy: number; from?: { node: string; handle: string } } | null>(null)
  const TYPES: { type: NodeType; label: string }[] = [
    { type: 'dialog', label: 'Dialog' }, { type: 'branch', label: 'Branch' }, { type: 'action', label: 'Action' }, { type: 'stage', label: 'Stage' },
    { type: 'encounter', label: 'Encounter' }, { type: 'wait', label: 'Wait / Arrive' }, { type: 'end', label: 'End' }, { type: 'link', label: 'Link (into existing dialog)' }, { type: 'note', label: 'Note' }
  ]
  function openMenu(ev: MouseEvent, from?: { node: string; handle: string }) {
    if (!flow || play.active) return
    const p = flow.toFlow(ev.clientX, ev.clientY)
    menu = { x: ev.clientX, y: ev.clientY, fx: p.x, fy: p.y, from }
  }
  function addNode(type: NodeType) {
    const mn = menu
    menu = null
    if (!qid || !mn || !quest) return
    const id = uniqueId(type === 'dialog' ? 'dialog' : type, quest.nodes.map((n) => n.id))
    editQuest(qid, (q) => {
      const n = newNode(type, id, Math.round(mn.fx), Math.round(mn.fy))
      if (type === 'stage' && q.stages[0]) (n as { stage: string }).stage = q.stages[0].id
      q.nodes.push(n)
      if (mn.from) {
        q.edges = q.edges.filter((e) => !(e.from === mn.from!.node && e.handle === mn.from!.handle))
        q.edges.push({ id: uniqueId(`e_${mn.from.node}_${mn.from.handle}`, q.edges.map((e) => e.id)), from: mn.from.node, handle: mn.from.handle, to: id })
      }
    })
    app.selected.questNode = id
  }

  async function doLayout() {
    if (!quest || !qid) return
    const pos = await autoLayout(quest.nodes.filter((n) => n.type !== 'note').map((n) => ({ id: n.id, width: 220, height: 90 + handlesOf(n).length * 24, ports: handlesOf(n).map((h) => h.id) })),
      quest.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, port: e.handle })), { spacing: 36 })
    editQuest(qid, (q) => { for (const n of q.nodes) { const p = pos.get(n.id); if (p) { n.x = Math.round(p.x); n.y = Math.round(p.y) } } })
    setTimeout(() => flow?.fit(), 50)
  }

  function duplicate() {
    if (!quest || !node || node.type === 'start' || !qid) return
    const id = uniqueId(node.id, quest.nodes.map((n) => n.id))
    const copy = JSON.parse(JSON.stringify(node)) as QNode
    copy.id = id; copy.x += 40; copy.y += 40
    editQuest(qid, (q) => { q.nodes.push(copy) })
    app.selected.questNode = id
  }

  // ---- find
  let find = $state('')
  let showFind = $state(false)
  const found = $derived.by(() => {
    const f = find.trim().toLowerCase()
    if (!f || !quest) return []
    return quest.nodes.filter((n) => JSON.stringify(n).toLowerCase().includes(f)).map((n) => n.id)
  })

  function onKey(e: KeyboardEvent) {
    if (app.page !== 'quests') return
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); showFind = true }
  }

  // ---- quests list
  let showNew = $state(false)
  let newTitle = $state('')
  let newKind = $state<'quest' | 'dialog'>('quest')
  const newId = $derived(project.prefix + slug(newTitle).replace(new RegExp(`^${project.prefix}`), ''))
  function createQuest() {
    const id = newId
    if (!id || m?.quests.some((q) => q.id === id)) { app.error = `The id "${id}" is already used.`; return }
    project.change((mm) => { mm.quests.push(newQuest(id, newTitle.trim(), newKind)) })
    app.go('quests', id)
    app.selected.questNode = null
    showNew = false
    newTitle = ''
  }
  function deleteQuest() {
    if (!quest || !confirm(`Delete the quest "${quest.title}"? Undo can bring it back until you save.`)) return
    const id = quest.id
    project.change((mm) => { mm.quests = mm.quests.filter((q) => q.id !== id) })
    app.selected.quests = null
  }
  let showChangeId = $state(false)
  let changeIdTo = $state('')
  function changeId() {
    const to = changeIdTo.trim()
    const from = quest?.id
    if (!from || !to || to === from) { showChangeId = false; return }
    if (m?.quests.some((q) => q.id === to)) { app.error = `The id "${to}" is already used.`; return }
    project.change((mm) => {
      for (const q of mm.quests) {
        if (q.id === from) q.id = to
        for (const r of q.requires) if ('quest' in r && r.quest === from) r.quest = to
        for (const n of q.nodes) if (n.type === 'action') for (const op of n.ops) if (op.op === 'startQuest' && op.quest === from) op.quest = to
      }
      for (const p of mm.testProfiles) if (p.quests[from]) { p.quests[to] = p.quests[from]; delete p.quests[from] }
    })
    app.selected.quests = to
    showChangeId = false
  }

  // ---- stages and variables (outline)
  const edQ = (fn: (q: QuestPlan) => void) => qid && editQuest(qid, fn)

  // ---- preview of the selected Dialog node (plan mode)
  let showVariants = $state(false)
  const preview = $derived.by((): { views: { label: string; view: DialogView }[]; unknown: string[]; keys: string[] } => {
    if (!quest || !compiled || !node || node.type !== 'dialog') return { views: [], unknown: [], keys: [] }
    void JSON.stringify(testCtx)
    const rs = compileRules(compiled.rows)
    const w = world()
    const rid = nodeRuleId(quest, node.id)
    const rule = rs.byId.get(rid)
    if (!rule) return { views: [], unknown: [], keys: [] }
    const run = (force?: Map<string, string>) => {
      const sim = newSimState()
      const hooks = sagaHooks(w, sim)
      const base = hooks.token!
      const e = new Engine(rs, makePlayContext(), { ...hooks, token: (en, tok) => (force?.has(tok) ? force.get(tok) : base(en, tok)) })
      for (const v of quest.variables) if (v.type !== 'target') e.set(`$global.${quest.id}_${v.name}`, v.type === 'number' ? Number(v.initial) || 0 : v.initial)
      if (rule.option) e.set('$option', rule.option)
      e.apply(rule)
      const optTrig = `${quest.id}_${node.id}_options`
      if (rule.script.some((s) => s.kind === 'command' && s.name === 'FireAll' && s.args[0] === optTrig)) { /* fired by apply */ }
      return e.view
    }
    const keys = [...new Set(rule.conds.flatMap((c) => (c.kind === 'memory' && c.key !== '$option' ? [c.key] : [])))]
    const used = [...allPhrases().values()].filter((p) => node.text.includes(p.token))
    if (showVariants && used.length) {
      const combos = phraseCombos(used).slice(0, 6)
      return { views: combos.map((c) => ({ label: c.conds.join(' + ') || 'otherwise', view: run(new Map(c.texts)) })), unknown: [], keys }
    }
    return { views: [{ label: '', view: run() }], unknown: [], keys }
  })

  const nodeTypes = { q: QNodeView, frame: StageFrame }

  // ---- change a stage id (PLAN.md §6: with an alias when the stage is in the last release)
  let stageRename = $state<{ quest: string; from: string } | null>(null)
  let stageTo = $state('')
  let stageHow = $state<'alias' | 'drop' | 'title'>('alias')
  const stageReleased = $derived.by(() => { const r = project.loaded ? lastRelease(project.loaded.releases) : null; return stageRename && r ? (r.quests[stageRename.quest]?.stages.includes(stageRename.from) ? r.version : null) : null })
  function doStageRename() {
    const sr = stageRename
    const to = slug(stageTo)
    if (!sr) return
    if (stageHow === 'title') { stageRename = null; return }
    if (!to || to === sr.from) { stageRename = null; return }
    if (quest?.stages.some((s) => s.id === to)) { app.error = `A stage with the id "${to}" exists already.`; return }
    project.change((mm) => renameStage(mm, sr.quest, sr.from, to, stageReleased ? stageHow as 'alias' | 'drop' : 'drop'))
    stageRename = null
  }

  let smokeDone = false
  // screenshot mode: "quests:<id>:play=1,2" plays and picks options by number; "node=<id>" selects a node
  $effect(() => {
    const arg = app.smokeArg
    if (!arg || !quest || smokeDone) return
    smokeDone = true
    app.smokeArg = null
    if (arg.startsWith('node=')) { app.selected.questNode = arg.slice(5); return }
    if (arg.startsWith('play')) {
      const picks = arg.split('=')[1]?.split(',').filter(Boolean).map(Number) ?? []
      play.start(quest).then(() => { for (const n of picks) { const o = play.view.options[n - 1]; if (o) play.choose(o.id) } })
    }
  })
</script>

<svelte:window onkeydown={onKey} />

<div class="page" style="grid-template-columns:{layout.left}px 1px minmax(0,1fr) 1px {layout.right}px">
  <aside class="left">
    <div class="sect">Quests <button disabled={!m} onclick={() => (showNew = true)}>+ New quest</button></div>
    <ul class="list">
      {#each m?.quests ?? [] as q (q.id)}
        <li class:on={q.id === qid}><button class="li" onclick={() => { app.selected.quests = q.id; app.selected.questNode = null; play.stop() }}><span>{q.title}</span><span class="sub mono">{q.kind === 'dialog' ? 'dialog only' : q.id}</span></button></li>
      {:else}<li class="muted small pad">{m ? 'No quests yet.' : 'Pick an active mod first.'}</li>{/each}
    </ul>
    {#if quest}
      <div class="sect">Stages (journal) <button onclick={() => edQ((q) => { q.stages.push({ id: uniqueId('stage', q.stages.map((s) => s.id)), title: 'New stage', journal: '', kind: 'normal', renamedFrom: [] }) })}>+</button></div>
      <div class="outline">
        {#each quest.stages as s, i (s.id)}
          <details>
            <summary><span class="dot" class:succ={s.kind === 'success'} class:fail={s.kind === 'fail'}></span><span class="mono sid">{s.id}</span> {s.title}</summary>
            <div class="sform">
              <input type="text" value={s.title} placeholder="title" onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].title = v }) }} />
              <textarea rows="2" placeholder="Journal text" value={s.journal} onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].journal = v }) }}></textarea>
              <input type="text" value={s.nextStep ?? ''} placeholder="Next step line (intel)" onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].nextStep = v || undefined }) }} />
              <input type="text" class="mono" value={s.marker ?? ''} placeholder="map marker entity id" onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].marker = v || undefined }) }} />
              <select value={s.kind} onchange={(e) => { const v = e.currentTarget.value as 'normal' | 'success' | 'fail'; edQ((q) => { q.stages[i].kind = v }) }}><option value="normal">normal</option><option value="success">ends the quest: success</option><option value="fail">ends the quest: failure</option></select>
              <div class="muted small">Old ids (players in them move here): <input type="text" class="mono" value={s.renamedFrom.join(' ')} onchange={(e) => { const v = e.currentTarget.value.split(/\s+/).filter(Boolean); edQ((q) => { q.stages[i].renamedFrom = v }) }} /></div>
              <div class="row2"><button class="mini" onclick={() => { stageRename = { quest: quest.id, from: s.id }; stageTo = s.id; stageHow = 'alias' }}>Change id…</button><button class="mini" onclick={() => edQ((q) => { q.stages.splice(i, 1) })}>Delete stage</button></div>
            </div>
          </details>
        {/each}
      </div>
      <div class="sect">Variables <button onclick={() => edQ((q) => { q.variables.push({ name: uniqueId('var', q.variables.map((v) => v.name)), type: 'number', scope: 'quest', initial: '0' }) })}>+</button></div>
      <div class="outline">
        {#each quest.variables as v, i (v.name)}
          <div class="var">
            <input type="text" class="mono" value={v.name} onchange={(e) => { const nv = slug(e.currentTarget.value); if (nv) edQ((q) => { q.variables[i].name = nv }) }} />
            <select value={v.type} onchange={(e) => { const t = e.currentTarget.value as typeof v.type; edQ((q) => { q.variables[i].type = t }) }}><option>number</option><option>string</option><option>bool</option><option>entity</option><option>person</option><option value="target">target (coming later)</option></select>
            <input type="text" class="mono init" value={v.initial} title="initial value" onchange={(e) => { const nv = e.currentTarget.value; edQ((q) => { q.variables[i].initial = nv }) }} />
            <button class="mini" onclick={() => edQ((q) => { q.variables.splice(i, 1) })}>✕</button>
          </div>
        {/each}
        {#if quest.variables.length}<div class="muted small">In rules: <span class="mono">$global.{quest.id}_&lt;name&gt;</span></div>{/if}
      </div>
    {/if}
  </aside>
  <Splitter axis="x" value={layout.left} min={200} max={() => 520} label="Resize list" onChange={(v) => (layout.left = v)} onDone={saveLayout} onReset={() => { layout.left = 280; saveLayout() }} />

  <section class="main" style="grid-template-rows:auto minmax(0,1fr) 1px {layout.dock}px">
    <div class="toolbar">
      <div class="seg"><button class:on={!play.active} onclick={() => play.stop()}>Plan</button><button class:on={play.active} disabled={!quest} onclick={() => quest && play.start(quest)}>Play ▶</button></div>
      {#if play.active}
        <button onclick={() => quest && play.start(quest)}>Restart</button>
        <button onclick={() => play.back()} disabled={!play.canBack}>Step back</button>
        <button onclick={() => quest && node && play.start(quest, node.id)} disabled={!node}>Play from selected</button>
        <select value={play.profileId} onchange={(e) => (play.profileId = e.currentTarget.value)} title="Test profile applied when Play starts"><option value="">no test profile</option>{#each m?.testProfiles ?? [] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
      {:else}
        <select value="" disabled={!quest} onchange={(e) => { const v = e.currentTarget.value as NodeType; e.currentTarget.value = ''; if (v && flow) { const el = document.querySelector('.qcanvas')!.getBoundingClientRect(); menu = { x: 0, y: 0, ...(() => { const p = flow!.toFlow(el.left + el.width / 2, el.top + el.height / 2); return { fx: p.x, fy: p.y } })() }; addNode(v) } }}>
          <option value="">+ Node</option>{#each TYPES as t (t.type)}<option value={t.type}>{t.label}</option>{/each}
        </select>
        <button onclick={doLayout} disabled={!quest}>Auto-layout</button>
        <button onclick={() => (showFind = !showFind)} disabled={!quest}>Find Ctrl+F</button>
        {#if showFind}<input type="search" placeholder="text, option or id…" bind:value={find} />{#each found.slice(0, 8) as f (f)}<button class="mini" onclick={() => { app.selected.questNode = f; flow?.fit([f]) }}>{f}</button>{/each}{/if}
      {/if}
      <span class="spacer"></span>
      <div class="seg"><button class:on={center === 'chart'} onclick={() => (center = 'chart')}>Chart</button><button class:on={center === 'rules'} onclick={() => (center = 'rules')}>Rules ({compiled?.rows.length ?? 0})</button></div>
      {#if quest}<button class="mini danger" onclick={deleteQuest}>Delete quest</button>{/if}
    </div>
    <div class="qcanvas">
      {#if !quest}
        <div class="center muted">{m ? 'Create a quest on the left, or pick one.' : 'Pick or create an active mod first.'}</div>
      {:else if center === 'rules'}
        <div class="rules">
          <table class="t">
            <thead><tr><th>id</th><th>trigger</th><th>conditions</th><th>script</th><th>text</th><th>options</th><th>node</th></tr></thead>
            <tbody>
              {#each compiled?.rows ?? [] as r (r.id)}
                <tr class:on={compiled?.nodeOf[r.id] === selNode} onclick={() => (app.selected.questNode = compiled?.nodeOf[r.id] ?? null)}>
                  <td class="mono">{r.id}</td><td class="mono">{r.trigger}</td><td class="mono pre">{r.conditions}</td><td class="mono pre">{r.script}</td><td class="pre">{r.text}</td><td class="pre">{r.options}</td><td class="mono">{compiled?.nodeOf[r.id]}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="muted small pad">These are the rows Export writes into the mod's rules.csv (in an owned block), and what Play runs.</p>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flowwrap" ondblclick={(e) => { if ((e.target as HTMLElement).classList.contains('svelte-flow__pane')) openMenu(e) }}>
          <SvelteFlow bind:nodes bind:edges {nodeTypes} colorMode="dark" fitView fitViewOptions={{ maxZoom: 1 }} minZoom={0.15} zoomOnDoubleClick={false}
            nodesDraggable={!play.active} nodesConnectable={!play.active} deleteKey={play.active ? null : ['Delete', 'Backspace']}
            onnodeclick={({ node: n }) => { if (!n.id.startsWith('frame:')) app.selected.questNode = n.id }} onpaneclick={() => { app.selected.questNode = null; menu = null }}
            onnodedragstop={({ nodes: ns }) => onDragStop({ nodes: ns })} onconnect={onConnect} ondelete={onDelete}
            onconnectend={(ev, st) => { if (st.isValid === false || (!st.toNode && st.fromNode)) { if (!st.toNode && st.fromNode && st.fromHandle) openMenu(ev as MouseEvent, { node: st.fromNode.id, handle: st.fromHandle.id ?? 'next' }) } }}
            proOptions={{ hideAttribution: true }}>
            <Background gap={20} />
            <Controls showLock={false} />
            <MiniMap pannable zoomable width={170} height={100} />
            <FlowApi onReady={(api) => (flow = api)} />
          </SvelteFlow>
        </div>
        {#if !play.active}<div class="help">Drag from an option's dot into empty space to add the next node · double-click the canvas for a new node · Delete removes · Ctrl+Z/Y undo · Ctrl+D duplicate</div>{/if}
      {/if}
    </div>
    <Splitter axis="y" value={layout.dock} min={150} max={() => window.innerHeight - 240} sign={-1} label="Resize dock" onChange={(v) => (layout.dock = v)} onDone={saveLayout} onReset={() => { layout.dock = 330; saveLayout() }} />
    <div class="dock" style="grid-template-columns:minmax(0,1fr) {layout.ctx}px">
      <div class="dockmain">
        <div class="tabs">
          <button class:on={dockTab === 'preview'} onclick={() => (dockTab = 'preview')}>Dialog preview</button>
          <button class:on={dockTab === 'problems'} onclick={() => (dockTab = 'problems')}>Problems ({qProblems.length})</button>
          <button class:on={dockTab === 'log'} onclick={() => (dockTab = 'log')}>Play log</button>
          <span class="spacer"></span>
          {#if !play.active && node?.type === 'dialog' && [...allPhrases().values()].some((p) => (node as DialogNode).text.includes(p.token))}
            <label class="small"><input type="checkbox" bind:checked={showVariants} /> Show all variants</label>
          {/if}
        </div>
        {#if dockTab === 'preview'}
          {#if play.active}
            <div class="playbar">
              {#each play.pendingEncounters as pe (pe.node)}<span>Fleet <b>{pe.encounter}</b>:</span><button class="mini" onclick={() => play.outcome(pe.node, 'defeated')}>Defeated</button><button class="mini" onclick={() => play.outcome(pe.node, 'avoided')}>Avoided</button>{/each}
              {#each quest?.nodes.filter((n) => n.type === 'wait') ?? [] as w (w.id)}
                {#if w.type === 'wait' && w.mode === 'arrive'}<button class="mini" onclick={() => play.arrive(w.entity ?? '')}>Arrive at {w.entity || '?'}</button>{:else if w.type === 'wait'}<button class="mini" onclick={() => play.waitDays(w.id, w.days ?? 7)}>Wait {w.days ?? 7} days</button>{/if}
              {/each}
              <span class="spacer"></span><span class="muted small">day {play.day} · {play.credits.toLocaleString('en-US')} credits · {play.storyPoints} SP</span>
            </div>
            <DialogPreview view={play.view} person={personLook} icon={itemIcon} illustration={illustrationPath} onSelect={(id) => play.choose(id)} />
          {:else if preview.views.length > 1}
            <div class="variants">{#each preview.views as v, i (i)}<div class="variant"><div class="muted small">{v.label}</div><DialogPreview view={v.view} person={personLook} icon={itemIcon} illustration={illustrationPath} /></div>{/each}</div>
          {:else if preview.views.length}
            <DialogPreview view={preview.views[0].view} person={personLook} icon={itemIcon} illustration={illustrationPath} />
          {:else}
            <div class="center muted small">Select a Dialog node to see it the way the game draws it, or press Play ▶.</div>
          {/if}
        {:else if dockTab === 'problems'}
          <div class="plist">
            {#each qProblems as p, i (i)}<button class="prow" onclick={() => { const s = p.ref?.sub?.split('/')[0]; if (s) app.selected.questNode = s }}><span class="ico {p.level === 'error' ? 'e' : 'w'}">{p.level === 'error' ? '!' : '?'}</span><span>{p.message}</span></button>{:else}<div class="muted small pad">No problems.</div>{/each}
          </div>
        {:else}
          <div class="plist mono small">{#each play.log as l, i (i)}<div>{l}</div>{:else}<div class="muted pad">Press Play ▶ to run the quest; the log explains every step.</div>{/each}</div>
        {/if}
      </div>
      {#if play.active}
        <div class="vars">
          <div class="h">Variables</div>
          {#each play.vars as [k, v] (k)}<div class="mono small"><span class="muted">{k}</span> = {v}</div>{:else}<div class="muted small">(none set yet)</div>{/each}
          <div class="h">Path</div><div class="mono small">{play.path.join(' → ')}</div>
          <button class="mini" onclick={() => {
            const e = play.engineRef
            if (!e || !project.m) return
            const name = prompt('Name of the test profile', 'From Play mode')
            if (!name) return
            import('../../../shared/play').then(({ profileFromPlay }) => {
              const prof = profileFromPlay(e, uniqueId(slug(name), project.m!.testProfiles.map((p) => p.id)), name, project.m!.quests)
              project.change((mm) => { mm.testProfiles.push(prof) })
              app.flash(`Saved test profile "${name}"`)
            })
          }}>Copy to a test profile</button>
        </div>
      {:else}
        <TestContextPanel memoryKeys={preview.keys} />
      {/if}
    </div>
  </section>
  <Splitter axis="x" value={layout.right} min={280} max={() => 720} sign={-1} label="Resize inspector" onChange={(v) => (layout.right = v)} onDone={saveLayout} onReset={() => { layout.right = 340; saveLayout() }} />

  <aside class="right">
    {#if quest && node}
      <NodeInspector {quest} {node} />
    {:else if quest}
      <QuestSettings {quest} onChangeId={() => { changeIdTo = quest.id; showChangeId = true }} />
    {/if}
  </aside>
</div>

{#if menu && menu.x}
  <div class="menu" style="left:{menu.x}px;top:{menu.y}px">
    {#each TYPES as t (t.type)}<button onclick={() => addNode(t.type)}>{t.label}</button>{/each}
    <button class="muted" onclick={() => (menu = null)}>Cancel</button>
  </div>
{/if}

{#if showNew}
  <Modal title="New quest" onClose={() => (showNew = false)}>
    <div class="grid2">
      <label for="nq-t">Title</label><input id="nq-t" type="text" bind:value={newTitle} placeholder="e.g. The Lost Convoy" />
      <span class="muted">Id</span><span class="mono">{newId || '—'}</span>
      <label for="nq-k">Kind</label><select id="nq-k" bind:value={newKind}><option value="quest">Quest (journal stages, SagaLib)</option><option value="dialog">Conversation only</option></select>
    </div>
    <p class="muted small">The quest id is also the mission id and the rule prefix; it must never change after release (PLAN.md §3.2).</p>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newTitle.trim()} onclick={createQuest}>Create</button>{/snippet}
  </Modal>
{/if}

{#if stageRename}
  <Modal title="Change the stage's id" onClose={() => (stageRename = null)}>
    {#if stageReleased}
      <p>Stage <span class="mono">{stageRename.from}</span> is in release <b>{stageReleased}</b>. Players who are at this stage in their saves are tracked by this id.</p>
      <div class="grid2"><label for="sr-to">New id</label><input id="sr-to" type="text" class="mono" bind:value={stageTo} disabled={stageHow === 'title'} /></div>
      <label class="opt"><input type="radio" bind:group={stageHow} value="alias" /> <b>Keep the old id as an alias</b> (recommended): SagaLib moves those players to the new id when they load.</label>
      <label class="opt"><input type="radio" bind:group={stageHow} value="drop" /> Change it without an alias: players at this stage lose their place.</label>
      <label class="opt"><input type="radio" bind:group={stageHow} value="title" /> Only change the display name (edit the title instead).</label>
    {:else}
      <p class="muted">This stage isn't in a release yet, so changing its id affects no saves.</p>
      <div class="grid2"><label for="sr-to2">New id</label><input id="sr-to2" type="text" class="mono" bind:value={stageTo} /></div>
    {/if}
    {#snippet actions()}<button onclick={() => (stageRename = null)}>Cancel</button><button class="primary" onclick={doStageRename}>Change</button>{/snippet}
  </Modal>
{/if}

{#if showChangeId}
  <Modal title="Change the quest's id" onClose={() => (showChangeId = false)}>
    <p>The quest id is its mission id and rules prefix. After a release, players in the middle of the quest lose it: avoid this after release (Problems warns).</p>
    <input type="text" class="mono" bind:value={changeIdTo} />
    {#snippet actions()}<button onclick={() => (showChangeId = false)}>Cancel</button><button class="primary" onclick={changeId}>Change id</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; height: 100%; min-height: 0; }
  .left, .right { background: var(--panel); min-height: 0; overflow: auto; }
  .right { padding: 10px 12px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { display: flex; gap: 8px; width: 100%; border: none; background: none; padding: 4px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
  .outline { padding: 0 10px 6px; font-size: 12px; }
  details { margin-bottom: 2px; }
  summary { cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .sid { color: var(--muted); font-size: 11px; }
  .dot { width: 9px; height: 9px; border-radius: 2px; background: #a0558f; flex: none; }
  .dot.succ { background: var(--good); } .dot.fail { background: var(--bad); }
  .sform { display: flex; flex-direction: column; gap: 3px; padding: 4px 0 6px 15px; }
  .sform input, .sform textarea, .sform select { width: 100%; padding: 2px 6px; font-size: 12px; }
  .var { display: flex; gap: 3px; margin-bottom: 3px; }
  .var input { flex: 1; min-width: 0; padding: 2px 5px; font-size: 11px; }
  .var input.init { flex: 0 0 52px; }
  .var select { font-size: 11px; padding: 1px 2px; width: 72px; }
  .main { display: grid; min-width: 0; min-height: 0; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; }
  .toolbar button, .toolbar select { padding: 3px 10px; font-size: 12px; }
  .toolbar input { padding: 2px 6px; width: 160px; }
  .seg { display: flex; }
  .seg button { border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 4px 4px 0; }
  .seg button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .spacer { flex: 1; }
  .qcanvas { position: relative; min-height: 0; background: #0f1216; display: flex; flex-direction: column; }
  .flowwrap { flex: 1; min-height: 0; }
  .help { font-size: 11px; color: var(--muted); padding: 2px 10px; background: var(--panel); border-top: 1px solid var(--border); }
  .center { display: grid; place-items: center; height: 100%; padding: 20px; text-align: center; }
  .rules { overflow: auto; height: 100%; }
  table.t { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 6px; position: sticky; top: 0; background: var(--panel); }
  table.t td { border-bottom: 1px solid #1e242c; padding: 3px 6px; vertical-align: top; cursor: pointer; }
  table.t tr.on td { background: #1f2a38; }
  .pre { white-space: pre-wrap; max-width: 260px; }
  .dock { display: grid; min-height: 0; border-top: 1px solid var(--border); }
  .dockmain { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .tabs { display: flex; gap: 2px; padding: 3px 8px 0; background: var(--panel); border-bottom: 1px solid var(--border); align-items: center; }
  .tabs button { padding: 2px 10px; font-size: 12px; border-radius: 4px 4px 0 0; border-bottom: none; }
  .tabs button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .playbar { display: flex; gap: 6px; align-items: center; padding: 3px 8px; background: #13261a; border-bottom: 1px solid #2f6b38; font-size: 12px; flex-wrap: wrap; }
  .variants { display: flex; gap: 6px; overflow: auto; height: 100%; }
  .variant { flex: 1; min-width: 320px; display: flex; flex-direction: column; }
  .plist { overflow: auto; padding: 4px 8px; flex: 1; }
  .prow { display: flex; gap: 8px; width: 100%; text-align: left; border: none; background: none; padding: 4px; font-size: 12px; border-bottom: 1px solid #1e242c; }
  .ico { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; flex: none; }
  .ico.e { background: var(--bad); color: #fff; } .ico.w { background: var(--warn); color: #000; }
  .vars { padding: 8px 10px; overflow: auto; background: var(--panel); font-size: 12px; }
  .vars .h { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 6px 0 4px; }
  .menu { position: fixed; z-index: 70; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
  .menu button { border: none; background: none; text-align: left; padding: 4px 12px; font-size: 12px; }
  .menu button:hover { background: var(--accent-2); color: #fff; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 6px 10px; }
  .grid2 { display: grid; grid-template-columns: 70px 1fr; gap: 6px 10px; align-items: center; }
  .opt { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; font-size: 12px; }
  .row2 { display: flex; gap: 6px; }
  :global(.svelte-flow) { --xy-background-color: #0f1216; --xy-node-background-color: transparent; --xy-node-border: none; --xy-minimap-background-color: #161a20; }
  :global(.svelte-flow__node-q) { padding: 0; border: none; background: transparent; }
  :global(.svelte-flow__node-frame) { padding: 0; border: none; background: transparent; pointer-events: none !important; }
  :global(.svelte-flow__handle) { width: 10px; height: 10px; background: var(--accent); border: 2px solid var(--panel); }
</style>
