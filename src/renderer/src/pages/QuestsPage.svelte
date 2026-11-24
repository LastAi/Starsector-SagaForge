<script lang="ts">
  /** Quest planner (PLAN.md §5, mock-up quest.html): flow chart, inspector, dialog preview, Play mode, Rules view. */
  import RefButton from '../ui/RefButton.svelte'
  import { openReference } from '../ui/reference'
  import { fullName } from '../../../shared/personname'
  import ModsChip from '../ui/ModsChip.svelte'
  import { mods } from '../state/mods.svelte'
  import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge, type Connection } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import type { NodeType, QNode, QuestPlan, DialogNode } from '../../../shared/model'
  import { newNode, newQuest, uniqueId, handlesOf, reachable, slug, stageGroups } from '../../../shared/quest'
  import { QUEST_TEMPLATES, fromSavedTemplate, markTemplateBlanks } from '../../../shared/templates'
  import { questScript, scriptMarkdown } from '../../../shared/script'
  import StageFrame from '../graph/StageFrame.svelte'
  import { itemKindLookup } from '../../../shared/export/items'
  import { compileQuest, nodeRuleId, phraseCombos } from '../../../shared/export/questrules'
  import { lockedEntityIds } from '../../../shared/patterns'
  import { compileRules, Engine, emptyView, type DialogView } from '../../../shared/rules/engine'
  import { newSimState, sagaHooks, applyMockTargets, createdUpFront } from '../../../shared/play'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems, applyProblemFix } from '../state/problems.svelte'
  import { personLook, itemIcon, illustrationPath, makePlayContext, testCtx } from '../state/testctx.svelte'
  import { editQuest } from '../quests/edit'
  import { itemVer } from '../state/itemver.svelte'
  import VersionStrip from '../ui/VersionStrip.svelte'
  import { play, world, allPhrases, playModel } from '../quests/play.svelte'
  import QNodeView from '../graph/QNodeView.svelte'
  import { tokenHub } from '../state/tokens.svelte'
  import NodeGroupsPanel from '../quests/NodeGroupsPanel.svelte'
  import { ensureInMod, groupLib, groupMenu } from '../state/nodegroups.svelte'
  import FlowApi, { type FlowHandle } from '../graph/FlowApi.svelte'
  import { autoLayout } from '../graph/layout'
  import NodeInspector from '../quests/NodeInspector.svelte'
  import QuestSettings from '../quests/QuestSettings.svelte'
  import DialogPreview from '../dialog/DialogPreview.svelte'
  import TestContextPanel from '../dialog/TestContextPanel.svelte'
  import Modal from '../ui/Modal.svelte'
  import TargetEditor from '../quests/TargetEditor.svelte'
  import { newTarget, targetPlaces } from '../../../shared/targets'
  import Field from '../ui/Field.svelte'
  import { later } from '../ui/later'
  import IdInput from '../ui/IdInput.svelte'
  import Splitter from '../Splitter.svelte'
  import { layout, saveLayout } from '../layout.svelte'
  import { lastRelease, renameStage } from '../../../shared/release'
  import { dropTodoElement } from '../../../shared/todo'
  import { inactiveQuests } from '../../../shared/inactive'
  import BountyEditor from '../quests/BountyEditor.svelte'
  import { newBounty, existingBounties, bountyOnlySources, bountyIdsOf } from '../../../shared/bounties'

  // #27: MagicLib bounties: the open one, and the mod's hand-written ones (in its files, not made here)
  let bountyOpen = $state<string | null>(app.selected.bounty ?? (app.smokeModal?.startsWith('bounty=') ? app.smokeModal.slice(7) : null))
  $effect(() => { if (app.selected.bounty) { bountyOpen = app.selected.bounty; app.selected.bounty = null } })
  const bountyOnlyQ = $derived(project.m ? bountyOnlySources(project.m).quests : new Set<string>())
  const handBounties = $derived(project.loaded ? existingBounties(project.loaded.files, (project.m?.project.exported.bounties ?? '').split(',').filter(Boolean)).filter((x) => !x.own && !(project.m?.bounties ?? []).some((b) => b.id === x.id)) : [])

  const m = $derived(project.m)
  const qid = $derived(app.selected.quests ?? m?.quests[0]?.id ?? null)
  // #64: the quest as in the open version (the versions strip)
  const quest = $derived(itemVer.view('quest', qid, m?.quests.find((q) => q.id === qid) ?? null))
  const selNode = $derived(app.selected.questNode ?? null)
  const node = $derived(quest?.nodes.find((n) => n.id === selNode) ?? null)
  let center = $state<'chart' | 'script' | 'rules'>(app.smokeModal === 'script' || app.smokeModal === 'rules' ? app.smokeModal : 'chart')
  let dockTab = $state<'preview' | 'problems' | 'log'>('preview')
  let flow: FlowHandle | null = null
  // #67 U10: each quest's chart opens with a readable view (FlowApi.opening), also when the quest changes
  let openedFor: string | null = null
  const openChart = (api: FlowHandle) => setTimeout(() => { openedFor = qid; api.opening() }, 150)
  $effect(() => {
    const id = qid
    if (!id || id === openedFor) return
    const t = setTimeout(() => { if (flow && openedFor !== id) { openedFor = id; flow.opening() } }, 150)
    return () => clearTimeout(t)
  })
  // walk F30: the inspector starts at the top for each node (it kept the last panel's scroll)
  let rightEl = $state<HTMLElement>()
  $effect(() => { void app.selected.questNode; void app.selected.quests; if (rightEl) rightEl.scrollTop = 0 })
  const phrases = $derived([...(m?.phrases ?? []), ...(m?.people.flatMap((p) => p.phrases) ?? [])])
  // #60: the Rules view shows the rules as exported (mod conditions folded in)
  const compiled = $derived(quest ? compileQuest(playModel()?.quests.find((x) => x.id === quest.id) ?? quest, { sagalib: true, phrases, itemKind: itemKindLookup(m?.items ?? [], app.index?.items ?? []), lockedEntities: lockedEntityIds(m?.quests ?? []), groups: m?.nodeGroups, prefix: m?.project.prefix }) : null)
  const SEVERITY = ['error', 'todo', 'warning', 'save', 'style', 'info']
  const qProblems = $derived(problems.live.filter((p) => p.ref?.page === 'quests' && p.ref.id === qid).map((p, i) => ({ p, i }))
    .sort((a, b) => SEVERITY.indexOf(a.p.level) - SEVERITY.indexOf(b.p.level) || a.i - b.i).map((x) => x.p))
  const nodeProblems = (nid: string) => qProblems.filter((p) => p.ref?.sub === nid || p.ref?.sub?.startsWith(`${nid}/`))
  const personName = (id: string) => { const l = personLook(id); return l?.name ?? id }
  /** Map marker suggestions: this mod's entities and markets, the game's markets and their entities, people. */
  const markerOptions = $derived([
    // Phase 7c: the quest's random targets ("target:<var>": the place SagaLib picked)
    ...(quest ? targetPlaces(quest) : []),
    ...(m?.systems.flatMap((s) => s.entities.flatMap((e) => [{ id: e.id, name: `${e.name} (${s.name})` }, ...(e.market && e.market.id !== e.id ? [{ id: e.market.id, name: `${e.market.name} market` }] : [])])) ?? []),
    ...(m?.people.map((p) => ({ id: p.id, name: fullName(p.name) })) ?? []),
    ...(app.index?.markets.flatMap((x) => [{ id: x.id, name: `${x.name} market`, definedBy: x.definedBy }, ...x.entities.map((id) => ({ id, name: x.name, definedBy: x.definedBy }))]) ?? []),
    // #64: other Saga Forge mods' places and what a sector snapshot saw
    ...(app.index?.places ?? []).map((x) => ({ id: x.id, name: x.name, definedBy: x.definedBy }))
  ])
  const nodeLabel = (n: QNode) => n.type === 'group' ? (n.title || m?.nodeGroups?.find((d) => d.id === n.group)?.label || n.group) : (n.type === 'dialog' || n.type === 'branch' || n.type === 'action' || n.type === 'raid' || n.type === 'plugin' || n.type === 'fight' ? n.title ?? '' : n.type === 'stage' ? quest?.stages.find((s) => s.id === n.stage)?.id ?? '' : '')

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
      data: { node: n, quest: q, problems: nodeProblems(n.id), path: !!reach?.has(n.id), faded: !!reach && !reach.has(n.id) && n.type !== 'note', current: play.active && path[path.length - 1] === n.id, label: nodeLabel, personName, groups: m?.nodeGroups ?? [] }
    }) as Node)
    // stage frames behind the nodes (PLAN.md §5)
    const COLORS = ['#a0558f', '#4fb3ff', '#6fd07a', '#f0b44c', '#c9a0ff', '#ff6b6b']
    const frames: Node[] = stageGroups(q).map((g, i) => {
      const members = q.nodes.filter((n) => g.nodes.includes(n.id))
      const x0 = Math.min(...members.map((n) => n.x)) - 18, y0 = Math.min(...members.map((n) => n.y)) - 26
      const x1 = Math.max(...members.map((n) => n.x + 220)) + 18, y1 = Math.max(...members.map((n) => n.y + 70 + handlesOf(n, m?.nodeGroups).length * 24)) + 18
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
      for (const id of nids) dropTodoElement(q, 'nodes', id)
      q.edges = q.edges.filter((e) => !eids.has(e.id) && !nids.has(e.from) && !nids.has(e.to))
    })
    if (selNode && nids.has(selNode)) app.selected.questNode = null
  }

  // ---- new node menu (double-click the canvas, or drop a connection on empty space)
  let menu = $state<{ x: number; y: number; fx: number; fy: number; from?: { node: string; handle: string } } | null>(null)
  // key: the type, or "wait:bounty" for a Wait node made for a MagicLib bounty (SagaLib 1.3)
  const NODE_MENU: { type: NodeType; label: string; key?: string }[] = [
    { type: 'dialog', label: 'Dialog' }, { type: 'branch', label: 'Branch' }, { type: 'action', label: 'Action' }, { type: 'stage', label: 'Stage' },
    { type: 'encounter', label: 'Encounter' }, { type: 'wait', label: 'Wait / Arrive' }, { type: 'wait', key: 'wait:bounty', label: 'Wait for a MagicLib bounty' }, { type: 'raid', label: 'Raid (ground raid)' }, { type: 'fight', label: 'Fight (defenders, on the spot)' }, { type: 'plugin', label: "Plugin (the mod's own Java)" }, { type: 'end', label: 'End' }, { type: 'link', label: 'Link (into existing dialog)' }, { type: 'note', label: 'Note' }
  ]
  const TYPES = NODE_MENU.map((t) => ({ ...t, key: t.key ?? t.type }))
  // #67 U43: node groups (built-in, the library's and the mod's copies), placed as one node
  $effect(() => { if (!groupLib.loaded) void groupLib.load() })
  const GROUP_TYPES = $derived(groupMenu().map((e) => ({ key: `group:${e.def.id}`, label: e.def.label, title: `${e.def.description ?? ''}${e.source === 'library' ? ' (from your library)' : e.source === 'builtin' ? ' (comes with Saga Forge)' : ''}`.trim() })))
  function openMenu(ev: MouseEvent, from?: { node: string; handle: string }) {
    if (!flow || play.active) return
    const p = flow.toFlow(ev.clientX, ev.clientY)
    menu = { x: ev.clientX, y: ev.clientY, fx: p.x, fy: p.y, from }
  }
  /** The map marker of the nearest Stage node upstream of `from` (following links backwards). */
  function upstreamMarker(q: QuestPlan, from: string): string | undefined {
    const seen = new Set<string>()
    const queue = [from]
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const n = q.nodes.find((x) => x.id === id)
      if (n?.type === 'stage') return q.stages.find((s) => s.id === n.stage)?.marker
      for (const e of q.edges) if (e.to === id) queue.push(e.from)
    }
    return undefined
  }
  function addNode(key: string) {
    const mn = menu
    menu = null
    const type = (key.split(':')[0]) as NodeType
    if (!qid || !mn || !quest) return
    // #67 U43: a node group: the mod gets a copy of its definition, the node links to it
    const gdef = type === 'group' ? groupMenu().find((e) => e.def.id === key.slice(6))?.def : undefined
    if (type === 'group' && !gdef) return
    if (gdef) ensureInMod(gdef)
    const id = uniqueId(gdef ? gdef.id.split('.').pop()! : type === 'dialog' ? 'dialog' : type, quest.nodes.map((n) => n.id))
    editQuest(qid, (q) => {
      const n = newNode(type, id, Math.round(mn.fx), Math.round(mn.fy))
      if (n.type === 'group' && gdef) n.group = gdef.id
      // SagaLib 1.3: a Wait for a MagicLib bounty, on the bounty the quest already starts or tests
      if (n.type === 'wait' && key === 'wait:bounty') { n.mode = 'bounty'; n.bounty = bountyIdsOf(q)[0] }
      // walk W4: a new Stage node takes the first stage no Stage node uses yet (not always the first one)
      if (n.type === 'stage') n.stage = q.stages.find((s) => !q.nodes.some((x) => x.type === 'stage' && x.stage === s.id))?.id ?? ''
      // …and a new Arrive waits at the map marker of the stage before it
      if (n.type === 'wait' && n.mode === 'arrive' && mn.from) n.entity = upstreamMarker(q, mn.from.node) ?? n.entity
      q.nodes.push(n)
      // a note is a comment on the chart: it never takes over the link it was dragged from
      if (mn.from && type !== 'note') {
        q.edges = q.edges.filter((e) => !(e.from === mn.from!.node && e.handle === mn.from!.handle))
        q.edges.push({ id: uniqueId(`e_${mn.from.node}_${mn.from.handle}`, q.edges.map((e) => e.id)), from: mn.from.node, handle: mn.from.handle, to: id })
      }
    })
    app.selected.questNode = id
    // walk F30: a node dropped near the edge or under the minimap comes into view
    setTimeout(() => flow?.reveal(id), 80)
  }

  async function doLayout() {
    if (!quest || !qid) return
    const pos = await autoLayout(quest.nodes.filter((n) => n.type !== 'note').map((n) => ({ id: n.id, width: 220, height: 90 + handlesOf(n, m?.nodeGroups).length * 24, ports: handlesOf(n, m?.nodeGroups).map((h) => h.id) })),
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
  let showNew = $state(app.smokeModal === 'new') // screenshot mode can open it
  let showInactive = $state(true)
  const offQuests = $derived(m ? inactiveQuests(m) : new Map<string, 'flag' | 'contact'>())
  let newTitle = $state('')
  let newKind = $state<'quest' | 'dialog'>('quest')
  const newId = $derived(project.prefix + slug(newTitle).replace(new RegExp(`^${project.prefix}`), ''))
  // R30: start from a template (built-in or saved); its blanks become to-dos
  let newTemplate = $state('')
  let savedTemplates = $state<{ file: string; quest: QuestPlan }[]>([])
  $effect(() => { if (showNew) window.api.listQuestTemplates().then((l) => (savedTemplates = l)).catch(() => {}) })
  function createQuest() {
    const id = newId
    if (!id || m?.quests.some((q) => q.id === id)) { app.error = `The id "${id}" is already used.`; return }
    const title = newTitle.trim()
    const builtIn = QUEST_TEMPLATES.find((t) => `builtin:${t.id}` === newTemplate)
    const saved = savedTemplates.find((t) => `saved:${t.file}` === newTemplate)
    const q = builtIn ? markTemplateBlanks(builtIn.build(id, title)) : saved ? markTemplateBlanks(fromSavedTemplate(saved.quest, id, title)) : newQuest(id, title, newKind)
    project.change((mm) => { mm.quests.push(q) })
    newTemplate = ''
    app.go('quests', id)
    app.selected.questNode = null
    showNew = false
    newTitle = ''
  }
  /** R30: keep this quest as a template for new quests (in Saga Forge's own data folder, for every mod). */
  // (a dialog, not prompt(): Electron has no prompt())
  let showSaveTemplate = $state(false)
  let templateName = $state('')
  async function saveAsTemplate() {
    const name = templateName.trim()
    if (!quest || !name) return
    try {
      const q = $state.snapshot(quest) as QuestPlan
      await window.api.saveQuestTemplate(name, { ...q, inactive: undefined, todo: undefined })
      showSaveTemplate = false
      app.flash(`Saved the template "${name}". New quest › Start from offers it.`)
    } catch (e) { app.error = String((e as Error)?.message ?? e) }
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
      // #71: a text before the quest starts shows its variables' and targets' tokens raw (as in game),
      // unless a contact or bar event creates the mission with the offer
      if (createdUpFront(e, quest, node.id)) {
        for (const v of quest.variables) if (v.type !== 'target') e.set(`$global.${quest.id}_${v.name}`, v.type === 'number' ? Number(v.initial) || 0 : v.initial)
        applyMockTargets(e, quest, w, () => e.ctx.random())
      }
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
    if (openStage === sr.from) openStage = to
    stageRename = null
  }

  let smokeDone = false
  // screenshot mode: "quests:<id>:play=1,2" plays and picks options by number; "node=<id>" selects a node
  $effect(() => {
    const arg = app.smokeArg
    if (!arg || !quest || smokeDone) return
    smokeDone = true
    app.smokeArg = null
    if (arg.startsWith('node=')) {
      // and zoomed to it (after the chart's own first fit), so big quests' nodes are readable
      const id = arg.slice(5)
      app.selected.questNode = id
      setTimeout(() => flow?.fit([id]), 1500)
      return
    }
    if (arg.startsWith('play')) {
      const picks = arg.split('=')[1]?.split(',').filter(Boolean).map(Number) ?? []
      play.start(quest).then(() => { for (const n of picks) { const o = play.view.options[n - 1]; if (o) play.choose(o.id) } })
    }
  })
  // screenshot mode: the 4th part opens a dialog or panel ("stages", "stagerename", "nodemenu", "changeid")
  /** The stage whose form is open in the outline (walk W4: edits used to fold it shut). */
  /** Phase 7c: the target variable whose search is being edited. */
  let targetOpen = $state<string | null>(app.smokeModal?.startsWith('target=') ? app.smokeModal.slice('target='.length) : null)
  let openStage = $state<string | null>(null)
  // a Stage node's "+ New stage…" asks for its form to open here
  $effect(() => { const want = app.selected.questStage; if (want) { openStage = want; app.selected.questStage = null } })
  let smokeModalDone = false
  $effect(() => {
    const mo = app.smokeModal
    if (!mo || !quest || smokeModalDone) return
    smokeModalDone = true
    // "stages[=<id>]": that stage's form open (the first stage's by default); the quest is only
    // loaded after the page starts, so this can't be done where openStage is declared
    if (mo === 'stages' || mo.startsWith('stages=')) openStage = (mo.slice(7) || quest.stages[0]?.id) ?? null
    if (mo === 'stagerename' && quest.stages[0]) { stageRename = { quest: quest.id, from: quest.stages[0].id }; stageTo = quest.stages[0].id; stageHow = 'alias' }
    if (mo === 'changeid') { changeIdTo = quest.id; showChangeId = true }
    if (mo === 'savetemplate') { templateName = quest.title; showSaveTemplate = true }
    // #67 U44: the token lookup (inside the editor in screenshot mode), and the "$" autocomplete in the dialog text
    if (mo === 'tokens') setTimeout(() => void tokenHub.open(), 800)
    if (mo === 'tokenac') setTimeout(() => { const el = document.querySelector('textarea[data-tokens]') as HTMLTextAreaElement | null; if (!el) return; el.focus(); el.value += ' $per'; el.setSelectionRange(el.value.length, el.value.length); tokenHub.update(el) }, 1500)
    if (mo === 'nodemenu') setTimeout(() => {
      const el = document.querySelector('.qcanvas')?.getBoundingClientRect()
      if (el && flow) { const p = flow.toFlow(el.left + el.width / 2, el.top + 60); menu = { x: el.left + el.width / 2, y: el.top + 60, fx: p.x, fy: p.y } }
    }, 1500)
  })
</script>

<svelte:window onkeydown={onKey} />

<div class="page" style="grid-template-columns:{layout.left}px 1px minmax(0,1fr) 1px {layout.right}px">
  <aside class="left">
    <div class="sect">Quests <span class="sectr"><label class="chk" title="Show quests that are inactive (planned, not exported)"><input type="checkbox" bind:checked={showInactive} /> inactive</label><button disabled={!m} onclick={() => (showNew = true)}>+ New quest</button></span></div>
    <ul class="list">
      {#each (m?.quests ?? []).filter((q) => showInactive || !offQuests.has(q.id)) as q (q.id)}
        <li class:on={q.id === qid} class:inactive={offQuests.has(q.id)}><button class="li" onclick={() => { app.selected.quests = q.id; app.selected.questNode = null; play.stop() }}><span>{q.title}{#if offQuests.has(q.id)} <span class="muted" title={offQuests.get(q.id) === 'contact' ? 'Its contact is inactive' : 'Marked inactive'}>[Inactive]</span>{/if}{#if bountyOnlyQ.has(q.id)} <span class="muted" title="Exported only as a MagicLib bounty (not for SagaLib)">[Bounty]</span>{/if}<ModsChip itemKey={`quest:${q.id}`} /></span><span class="sub mono">{q.kind === 'dialog' ? 'dialog only' : q.id}</span></button></li>
      {:else}<li class="muted small pad">{m ? 'No quests yet.' : 'Pick an active mod first.'}</li>{/each}
    </ul>
    {#if m}
      <!-- #27: the mod's MagicLib bounties (made here) and the ones already in its files (read only) -->
      <div class="sect">MagicLib bounties <span class="sectr">{#if quest && quest.kind === 'quest'}<button title="Make a MagicLib bounty from this quest (its encounter is the target)" onclick={() => { const nb = newBounty(m, { quest: quest.id }); project.change((mm) => { ((mm.bounties ??= []), mm.bounties).push(nb) }); bountyOpen = nb.id }}>+ From this quest</button>{/if}</span></div>
      <ul class="list">
        {#each m.bounties ?? [] as bt (bt.id)}
          <li><button class="li" onclick={() => (bountyOpen = bt.id)}><span>{bt.name || m.quests.find((x) => x.id === bt.quest)?.title || m.encounters.find((x) => x.id === bt.encounter)?.name || bt.id}</span><span class="sub mono">{bt.id}{bt.quest ? ` · from ${bt.quest}` : bt.encounter ? ` · from ${bt.encounter}` : ''}</span></button></li>
        {/each}
        {#each handBounties as hb (hb.file + hb.id)}
          <li class="inactive" title={`Hand-written in ${hb.file}: Saga Forge keeps it as it is.`}><span class="li"><span>{hb.name}</span><span class="sub mono">{hb.id} · hand-written{hb.file.endsWith('.csv') ? ' (vayraBounties)' : ''}</span></span></li>
        {/each}
        {#if !(m.bounties?.length) && !handBounties.length}<li class="muted small pad">None. A bounty is made from a quest (here) or an encounter (Encounters); only MagicLib reads it.</li>{/if}
      </ul>
    {/if}
    {#if m}<NodeGroupsPanel />{/if}
    {#if quest}
      <div class="sect">Stages (journal) <button title="Add a stage (its form opens below)" onclick={() => { const id = uniqueId('stage', quest.stages.map((s) => s.id)); edQ((q) => { q.stages.push({ id, title: 'New stage', journal: '', kind: 'normal', renamedFrom: [] }) }); openStage = id }}>+</button></div>
      <div class="outline">
        {#each quest.stages as s, i (s.id)}
          <details open={openStage === s.id} ontoggle={(e) => { if (e.currentTarget.open) openStage = s.id; else if (openStage === s.id) openStage = null }}>
            <summary><span class="dot" class:succ={s.kind === 'success'} class:fail={s.kind === 'fail'}></span><span class="mono sid">{s.id}</span> {s.title}</summary>
            <div class="sform">
              <Field wide label="Id" help="Saves remember the player's stage by this id. Never shown in game. Change it only with Change id…, which can keep the old id as an alias.">
                <div class="row2"><span class="mono">{s.id}</span><button class="mini" onclick={() => { stageRename = { quest: quest.id, from: s.id }; stageTo = s.id; stageHow = 'alias' }}>Change id…</button></div>
              </Field>
              <Field wide label="Title" for={`st-t-${i}`} help="The stage's name: the intel list shows it under the quest's name when the next-step line is empty, and the chart shows it on the stage's frame.">
                <input id={`st-t-${i}`} type="text" value={s.title} placeholder="e.g. Find the convoy" onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].title = v }) }} />
              </Field>
              <Field wide label="Journal text" for={`st-j-${i}`} help="The paragraph in the intel screen's panel for this quest while the player is at this stage. Empty: the title is shown.">
                <textarea id={`st-j-${i}`} rows="3" placeholder="e.g. A Compact convoy went dark in the Kestrel belt. Find it." value={s.journal} onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].journal = v }) }}></textarea>
              </Field>
              <Field wide label="Next-step line" for={`st-n-${i}`} help="The short line under the quest's name in the intel list and the stage-change notification. Empty: the title is used.">
                <input id={`st-n-${i}`} type="text" value={s.nextStep ?? ''} placeholder="e.g. Search the Kestrel belt" onchange={(e) => { const v = e.currentTarget.value; edQ((q) => { q.stages[i].nextStep = v || undefined }) }} />
              </Field>
              <Field wide label="Map marker" later={later(quest, `stages#${s.id}.marker`, edQ)} help="Where the map's quest marker points during this stage: an entity id (planet, station, wreck), a market id, or a person id (their market). Empty: no marker.">
                <IdInput value={s.marker ?? ''} options={markerOptions} placeholder="e.g. vgc_convoy_wreck" onCommit={(v) => edQ((q) => { q.stages[i].marker = v || undefined })} />
              </Field>
              <Field wide label="Kind" for={`st-k-${i}`} help="Normal stages keep the quest running. A success or failure stage ends the quest that way as soon as it is reached (the journal moves it to Completed or Failed).">
                <select id={`st-k-${i}`} value={s.kind} onchange={(e) => { const v = e.currentTarget.value as 'normal' | 'success' | 'fail'; edQ((q) => { q.stages[i].kind = v }) }}><option value="normal">normal: the quest goes on</option><option value="success">ends the quest: success</option><option value="fail">ends the quest: failure</option></select>
              </Field>
              <Field wide label="Old ids" for={`st-o-${i}`} help="Ids this stage had in earlier releases, separated by spaces. Players whose saves are at an old id move to this stage when they load. Change id… fills this in for you.">
                <input id={`st-o-${i}`} type="text" class="mono" value={s.renamedFrom.join(' ')} placeholder="none" onchange={(e) => { const v = e.currentTarget.value.split(/\s+/).filter(Boolean); edQ((q) => { q.stages[i].renamedFrom = v }) }} />
              </Field>
              <div class="row2"><button class="mini" onclick={() => edQ((q) => { dropTodoElement(q, 'stages', q.stages[i].id); q.stages.splice(i, 1) })}>Delete stage</button></div>
            </div>
          </details>
        {/each}
      </div>
      <div class="sect">Variables<RefButton ref="quests-variables" title="Variable types: opens the reference" /> <button onclick={() => edQ((q) => { q.variables.push({ name: uniqueId('var', q.variables.map((v) => v.name)), type: 'number', scope: 'quest', initial: '0' }) })}>+</button></div>
      <div class="outline">
        {#if quest.variables.length}<div class="var vhead muted small"><span>Name</span><span>Type</span><span>Starts at</span><span></span></div>{/if}
        {#each quest.variables as v, i (v.name)}
          <div class="var">
            <input type="text" class="mono" value={v.name} onchange={(e) => { const nv = slug(e.currentTarget.value); if (nv) edQ((q) => { q.variables[i].name = nv }); else e.currentTarget.value = v.name }} />
            <select value={v.type} onchange={(e) => { const t = e.currentTarget.value as typeof v.type; edQ((q) => { q.variables[i].type = t; if (t === 'target' && !q.variables[i].target) q.variables[i].target = newTarget() }); if (t === 'target') targetOpen = v.name }}><option>number</option><option>string</option><option>bool</option><option>entity</option><option>person</option><option value="target">random target</option></select>
            {#if v.type === 'target'}
              <button class="mini init" title="What SagaLib picks when the quest is offered" onclick={() => (targetOpen = v.name)}>{v.target ? `${v.target.pick} · ${v.target.require.length + v.target.prefer.length} criteria` : 'set up…'}</button>
            {:else}
            <input type="text" class="mono init" value={v.initial} title="initial value" onchange={(e) => { const nv = e.currentTarget.value; edQ((q) => { q.variables[i].initial = nv }) }} />
            {/if}
            <button class="mini" onclick={() => edQ((q) => { q.variables.splice(i, 1) })}>✕</button>
          </div>
        {/each}
        <div class="f-help">Values the quest remembers in the save, such as the agreed pay. Conditions and Set actions use them; in rules they are <span class="mono">$global.{quest.id}_&lt;name&gt;</span>. The player never sees them unless a text uses the token.</div>
      </div>
    {/if}
  </aside>
  <Splitter axis="x" value={layout.left} min={200} max={() => 520} label="Resize list" onChange={(v) => (layout.left = v)} onDone={saveLayout} onReset={() => { layout.left = 280; saveLayout() }} />

  <section class="main" style="grid-template-rows:auto minmax(0,1fr) 1px {layout.dock}px">
    <div class="tophead">
    <div class="toolbar">
      <div class="seg"><button class:on={!play.active} onclick={() => play.stop()}>Plan</button><button class:on={play.active} disabled={!quest} onclick={() => quest && play.start(quest)}>Play ▶</button></div>
      {#if play.active}
        <button onclick={() => quest && play.start(quest)}>Restart</button>
        <button onclick={() => play.back()} disabled={!play.canBack}>Step back</button>
        <button onclick={() => quest && node && play.start(quest, node.id)} disabled={!node}>Play from selected</button>
        <select value={play.profileId} onchange={(e) => (play.profileId = e.currentTarget.value)} title="Test profile applied when Play starts"><option value="">no test profile</option>{#each m?.testProfiles ?? [] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
        <!-- #60: a switch per optional mod (Saga › Mods): the combination this playthrough started with; switching restarts -->
        {#each mods.optional() as x (x.id)}
          {@const nw = mods.neverWith(x.id)}
          <label class="modsw" title="Play as if {x.name} was enabled when the game started (switching restarts Play){nw.length ? `. Never played with ${nw.join(', ')}: turning it on turns those off` : ''}"><input type="checkbox" checked={mods.playMods().has(x.id)} onchange={(e) => { mods.setPlay(x.id, e.currentTarget.checked); if (quest) play.start(quest) }} /> {x.name}</label>
        {/each}
      {:else}
        <select value="" disabled={!quest} onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v && flow) { const el = document.querySelector('.qcanvas')!.getBoundingClientRect(); menu = { x: 0, y: 0, ...(() => { const p = flow!.toFlow(el.left + el.width / 2, el.top + el.height / 2); return { fx: p.x, fy: p.y } })() }; addNode(v) } }}>
          <option value="">+ Node</option>{#each TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}{#if GROUP_TYPES.length}<optgroup label="Node groups">{#each GROUP_TYPES as t (t.key)}<option value={t.key} title={t.title}>{t.label}</option>{/each}</optgroup>{/if}
        </select><RefButton ref="quests-node-types" title="What each node does: opens the reference" />
        <button onclick={doLayout} disabled={!quest}>Auto-layout</button>
        <button onclick={() => (showFind = !showFind)} disabled={!quest}>Find Ctrl+F</button>
        {#if showFind}<input type="search" placeholder="text, option or id…" bind:value={find} />{#each found.slice(0, 8) as f (f)}<button class="mini" onclick={() => { app.selected.questNode = f; flow?.fit([f]) }}>{f}</button>{/each}{/if}
      {/if}
      <span class="spacer"></span>
      <div class="seg"><button class:on={center === 'chart'} onclick={() => (center = 'chart')}>Chart</button><button class:on={center === 'script'} onclick={() => (center = 'script')} title="The whole quest as a screenplay">Script</button><button class:on={center === 'rules'} onclick={() => (center = 'rules')}>Rules ({compiled?.rows.length ?? 0})</button></div>
      {#if quest}<button class="mini danger" onclick={deleteQuest}>Delete quest</button>{/if}
    </div>
    <!-- #64: the versions strip (Play mode uses the optional mods' switches instead) -->
    {#if quest && !play.active}<VersionStrip kind="quest" id={quest.id} what={quest.kind === 'dialog' ? 'this conversation' : 'this quest'} />{/if}
    </div>
    <div class="qcanvas">
      {#if !quest}
        <div class="center muted">{m ? 'Create a quest on the left, or pick one.' : 'Pick or create an active mod first.'}</div>
      {:else if center === 'script' && m}
        {@const blocks = questScript(quest, m)}
        <div class="script">
          <div class="srow"><span class="muted small">The quest in the order the player meets it. Click a line to select its node.</span><span class="spacer"></span><button class="mini" onclick={() => navigator.clipboard.writeText(scriptMarkdown(quest, blocks)).then(() => app.flash('Copied the script as Markdown.'))}>Copy as Markdown</button></div>
          <h1>{quest.title}</h1>
          {#each blocks as b, i (i)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="sb {b.kind}" class:on={b.node === selNode} onclick={() => (app.selected.questNode = b.node)}>
              {#if b.kind === 'scene'}{b.text}{:else if b.kind === 'choice'}<b>▸ {b.text}</b> <span class="muted">→ {b.to}</span>{:else if b.kind === 'note'}[{b.text}]{:else}{b.text}{/if}
            </div>
          {/each}
        </div>
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
          <SvelteFlow bind:nodes bind:edges {nodeTypes} colorMode="dark" minZoom={0.15} zoomOnDoubleClick={false}
            nodesDraggable={!play.active} nodesConnectable={!play.active} deleteKey={play.active ? null : ['Delete', 'Backspace']}
            onnodeclick={({ node: n }) => { if (!n.id.startsWith('frame:')) app.selected.questNode = n.id }} onpaneclick={() => { app.selected.questNode = null; menu = null }}
            onnodedragstop={({ nodes: ns }) => onDragStop({ nodes: ns })} onconnect={onConnect} ondelete={onDelete}
            onconnectend={(ev, st) => { if (st.isValid === false || (!st.toNode && st.fromNode)) { if (!st.toNode && st.fromNode && st.fromHandle) openMenu(ev as MouseEvent, { node: st.fromNode.id, handle: st.fromHandle.id ?? 'next' }) } }}
            proOptions={{ hideAttribution: true }}>
            <Background gap={20} />
            <Controls showLock={false} />
            <MiniMap pannable zoomable width={170} height={100} />
            <FlowApi onReady={(api) => { flow = api; openChart(api) }} />
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
              <!-- #59: MagicLib bounties the quest starts or tests: the buttons stand in for MagicLib -->
              {#each play.bounties as pb (pb.id)}
                {#if pb.state === 'active'}<span title="MagicLib runs it: pick how it ends">Bounty <b>{pb.id}</b>:</span><button class="mini" onclick={() => play.bountyOutcome(pb.id, 'succeeded')}>Succeeded</button><button class="mini" onclick={() => play.bountyOutcome(pb.id, 'failed')} title="The flagship was salvaged">Failed</button><button class="mini" onclick={() => play.bountyOutcome(pb.id, 'expired')} title="Its time ran out, or someone else got the target">Expired</button><button class="mini" onclick={() => play.bountyOutcome(pb.id, 'dismissed')} title="Dismissed on MagicLib's old bar board (switched off in MagicLib 1.5.6, so rare)">Dismissed</button>
                {:else if pb.state === 'offered' && pb.board}<span>Bounty <b>{pb.id}</b>:</span><button class="mini" onclick={() => play.bountyOutcome(pb.id, 'taken')} title="The player accepts it on MagicLib's bounty board">Taken on the board</button>
                {:else}<span class="muted small" title={pb.state === 'unavailable' ? 'MagicLib is off (Play mode switches), or MagicLib skips this bounty' : ''}>Bounty {pb.id}: {pb.state}</span>{/if}
              {/each}
              <!-- #61: a watched market changes owner (an invasion, a rebellion, SagaLib's dev menu) -->
              {#each play.watched as wm (wm.id)}<span class="small" title="SagaLib checks the owners of the quest's markets once a day">{wm.id} ({wm.owner}):</span><select class="mini" value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; play.changeOwner(wm.id, v) }}><option value="">changes owner to…</option>{#each mods.filter('play:owners', app.index?.factions ?? [], (f) => f.definedBy).filter((f) => f.id !== wm.owner) as f (f.id)}<option value={f.id}>{f.name || f.id}</option>{/each}</select>{/each}
              <!-- #70: a person with a presence rule leaves or comes back (their market's owner, a war, peace) -->
              {#each play.presence as pp (pp.id)}<label class="small chk" title="SagaLib's $global.sagaforge_away_{pp.id}: while away they're hidden from the comm directory and their quests aren't offered"><input type="checkbox" checked={pp.away} onchange={(e) => play.setAway(pp.id, e.currentTarget.checked)} /> {pp.name} is away</label>{/each}
              <!-- #62: the mod's settings as in LunaLib's menu: a change applies at once (quests read it at the next offer or Branch) -->
              {#each play.settings as ps (ps.id)}<label class="small chk" title="Setting $global.{ps.id}: as if the player changed it in LunaLib's menu (shared by every save)">⚙ {ps.label}
                {#if ps.type === 'Boolean'}<input type="checkbox" checked={ps.value === 'true'} onchange={(e) => play.setSetting(ps.id, String(e.currentTarget.checked))} />
                {:else if ps.type === 'Radio'}<select class="mini" value={ps.value} onchange={(e) => play.setSetting(ps.id, e.currentTarget.value)}>{#each ps.choices as c (c)}<option value={c}>{c}</option>{/each}</select>
                {:else}<input type={ps.type === 'String' ? 'text' : 'number'} class="setv" value={ps.value} onchange={(e) => play.setSetting(ps.id, e.currentTarget.value)} />{/if}</label>{/each}
              {#each quest?.nodes.filter((n) => n.type === 'wait') ?? [] as w (w.id)}
                {#if w.type === 'wait' && w.mode === 'arrive'}<button class="mini" onclick={() => play.arrive(w.entity ?? '')}>Arrive at {w.entity || '?'}</button>{:else if w.type === 'wait' && w.mode !== 'bounty'}<button class="mini" onclick={() => play.waitDays(w.id, w.days ?? 7)}>Wait {w.days ?? 7} days</button>{/if}
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
            {#each qProblems as p, i (i)}<div class="prow"><button class="pmsg" onclick={() => { const s = p.ref?.sub?.split('/')[0]; if (s) app.selected.questNode = s }}><span class="ico {p.level === 'error' ? 'e' : p.level === 'info' ? 'i' : 'w'}">{p.level === 'error' ? '!' : p.level === 'info' ? 'i' : '?'}</span><span>{p.message}</span></button>{#each p.fixes ?? [] as f, j (j)}{#if f.action !== 'open'}<button class="mini fixb" onclick={() => applyProblemFix(f.action, f.arg)}>{f.label}</button>{/if}{/each}</div>{:else}<div class="muted small pad">No problems.</div>{/each}
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
          <button class="mini" onclick={async () => {
            const e = play.engineRef
            if (!e || !project.m) return
            const name = (await app.ask('Name of the test profile', 'From Play mode', 'Save profile'))?.trim()
            if (!name || !project.m) return
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

  <aside class="right" bind:this={rightEl}>
    {#if quest && node}
      <NodeInspector {quest} {node} />
    {:else if quest}
      <QuestSettings {quest} onChangeId={() => { changeIdTo = quest.id; showChangeId = true }} onSaveTemplate={() => { templateName = quest.title; showSaveTemplate = true }} />
    {/if}
  </aside>
</div>

{#if menu && menu.x}
  <div class="menu" style="left:{menu.x}px;top:{menu.y}px">
    {#each TYPES as t (t.key)}<button onclick={() => addNode(t.key)}>{t.label}</button>{/each}
    {#if GROUP_TYPES.length}<div class="msect">Node groups</div>{#each GROUP_TYPES as t (t.key)}<button title={t.title} onclick={() => addNode(t.key)}>{t.label}</button>{/each}{/if}
    <button class="muted" onclick={() => (menu = null)}>Cancel</button>
    <button class="muted" onclick={() => { menu = null; openReference('quests-node-types') }}>ⓘ What each node does</button>
  </div>
{/if}

{#if showNew}
  <Modal title="New quest" onClose={() => (showNew = false)}>
    <div class="grid2 wide">
      <Field label="Title" for="nq-t" help="The quest's name in the intel screen and the contact's mission list. You can change it any time."><input id="nq-t" type="text" bind:value={newTitle} placeholder="e.g. The Lost Convoy" /></Field>
      <Field label="Id" help="Made from the title with the mod's prefix. It is the mission id, the start of every rule id, and what saves remember: don't change it after a release."><span class="mono">{newId || '—'}</span></Field>
      <Field label="Start from" for="nq-tp" help="An empty quest, or a template: a ready chart with stages, placeholder text, a reward and a note. Its blanks (the contact, the places, the fleet) are listed under To do in Problems. Your own templates: Save as template on a quest's page.">
        <select id="nq-tp" bind:value={newTemplate}>
          <option value="">an empty quest</option>
          <optgroup label="Templates">{#each QUEST_TEMPLATES as t (t.id)}<option value={`builtin:${t.id}`}>{t.label}: {t.summary}</option>{/each}</optgroup>
          {#if savedTemplates.length}<optgroup label="Your templates">{#each savedTemplates as t (t.file)}<option value={`saved:${t.file}`}>{t.quest.title} ({t.file.replace(/\.quest\.json$/, '')})</option>{/each}</optgroup>{/if}
        </select>
      </Field>
      {#if !newTemplate}
        <Field label="Kind" for="nq-k" help="A quest has journal stages, a map marker and rewards, and needs SagaLib. A conversation only adds dialog (an option at a market, a greeting) with no journal entry."><select id="nq-k" bind:value={newKind}><option value="quest">Quest (journal stages, SagaLib)</option><option value="dialog">Conversation only</option></select></Field>
      {/if}
    </div>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!newTitle.trim()} onclick={createQuest}>Create</button>{/snippet}
  </Modal>
{/if}

{#if stageRename}
  <Modal title="Change the stage's id" onClose={() => (stageRename = null)}>
    {#if stageReleased}
      <p>Stage <span class="mono">{stageRename.from}</span> is in release <b>{stageReleased}</b>. Players who are at this stage in their saves are tracked by this id.</p>
      <div class="grid2 wide"><Field label="New id" for="sr-to" help="Lowercase letters, digits and _. Never shown in game."><input id="sr-to" type="text" class="mono" bind:value={stageTo} disabled={stageHow === 'title'} /></Field></div>
      <label class="opt"><input type="radio" bind:group={stageHow} value="alias" /> <b>Keep the old id as an alias</b> (recommended): SagaLib moves those players to the new id when they load.</label>
      <label class="opt"><input type="radio" bind:group={stageHow} value="drop" /> Change it without an alias: players at this stage lose their place.</label>
      <label class="opt"><input type="radio" bind:group={stageHow} value="title" /> Only change the display name (edit the title instead).</label>
    {:else}
      <p class="muted">This stage isn't in a release yet, so changing its id affects no saves.</p>
      <div class="grid2 wide"><Field label="New id" for="sr-to2" help="Lowercase letters, digits and _. Never shown in game."><input id="sr-to2" type="text" class="mono" bind:value={stageTo} /></Field></div>
    {/if}
    {#snippet actions()}<button onclick={() => (stageRename = null)}>Cancel</button><button class="primary" onclick={doStageRename}>Change</button>{/snippet}
  </Modal>
{/if}

{#if targetOpen && quest}
  {@const tv = quest.variables.find((v) => v.name === targetOpen)}
  <Modal title={`Random target: ${targetOpen}`} width={760} onClose={() => (targetOpen = null)}>
    {#if tv}<TargetEditor quest={quest.id} name={tv.name} target={tv.target} onChange={(t) => { const n = targetOpen; edQ((q) => { const x = q.variables.find((v) => v.name === n); if (x) x.target = t }) }} />{/if}
    {#snippet actions()}<button class="primary" onclick={() => (targetOpen = null)}>Done</button>{/snippet}
  </Modal>
{/if}

{#if bountyOpen}
  <Modal title={`MagicLib bounty: ${bountyOpen}`} width={820} onClose={() => (bountyOpen = null)}>
    <BountyEditor id={bountyOpen} onDelete={() => { const id = bountyOpen; project.change((mm) => { mm.bounties = (mm.bounties ?? []).filter((x) => x.id !== id) }); bountyOpen = null }} />
    {#snippet actions()}<button class="primary" onclick={() => (bountyOpen = null)}>Done</button>{/snippet}
  </Modal>
{/if}

{#if showSaveTemplate}
  <Modal title="Save as template" onClose={() => (showSaveTemplate = false)}>
    <p>A copy of this quest is kept in Saga Forge's own data folder. New quest › Start from offers it in every mod; the quest id is replaced, and the to-dos and the inactive mark are dropped.</p>
    <div class="grid2 wide"><Field label="Template name" for="st-name" help="Shown in New quest › Start from. A template with the same name is replaced."><input id="st-name" type="text" bind:value={templateName} /></Field></div>
    {#snippet actions()}<button onclick={() => (showSaveTemplate = false)}>Cancel</button><button class="primary" disabled={!templateName.trim()} onclick={saveAsTemplate}>Save template</button>{/snippet}
  </Modal>
{/if}

{#if showChangeId}
  <Modal title="Change the quest's id" onClose={() => (showChangeId = false)}>
    <p>The quest id is its mission id and rules prefix. After a release, players in the middle of the quest lose it: avoid this after release (Problems warns).</p>
    <div class="grid2 wide"><Field label="New id" for="cq-to" help="Lowercase letters, digits and _, starting with the mod's prefix. Conditions and test profiles that use the old id follow."><input id="cq-to" type="text" class="mono" bind:value={changeIdTo} /></Field></div>
    {#snippet actions()}<button onclick={() => (showChangeId = false)}>Cancel</button><button class="primary" onclick={changeId}>Change id</button>{/snippet}
  </Modal>
{/if}

<style>
  .modsw { font-size: 11px; display: inline-flex; gap: 3px; align-items: center; white-space: nowrap; color: var(--muted); }
  .page { display: grid; height: 100%; min-height: 0; }
  .left, .right { background: var(--panel); min-height: 0; overflow: auto; }
  .right { padding: 10px 12px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .sectr { display: flex; gap: 8px; align-items: center; }
  .sectr .chk { display: flex; gap: 4px; align-items: center; text-transform: none; letter-spacing: 0; }
  .list li.inactive { opacity: .5; }
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
  .sform { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 6px; padding: 4px 0 8px 15px; }
  .sform input, .sform textarea, .sform select { width: 100%; padding: 2px 6px; font-size: 12px; }
  .sform .row2 { align-items: center; }
  .var { display: flex; gap: 3px; margin-bottom: 3px; }
  .var input { flex: 1; min-width: 0; padding: 2px 5px; font-size: 11px; }
  .var input.init { flex: 0 0 52px; }
  .vhead { margin-bottom: 1px; }
  .vhead span:nth-child(1) { flex: 1; } .vhead span:nth-child(2) { width: 72px; } .vhead span:nth-child(3) { width: 52px; } .vhead span:nth-child(4) { width: 22px; }
  .var select { font-size: 11px; padding: 1px 2px; width: 72px; }
  .main { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-height: 0; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; }
  .toolbar button, .toolbar select { padding: 3px 10px; font-size: 12px; }
  .toolbar input { padding: 2px 6px; width: 160px; }
  .seg { display: flex; }
  .seg button { border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 4px 4px 0; }
  .seg button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .spacer { flex: 1; }
  .qcanvas { position: relative; min-height: 0; min-width: 0; overflow: hidden; background: #0f1216; display: flex; flex-direction: column; }
  .flowwrap { flex: 1; min-height: 0; }
  .help { font-size: 11px; color: var(--muted); padding: 2px 10px; background: var(--panel); border-top: 1px solid var(--border); }
  .center { display: grid; place-items: center; height: 100%; padding: 20px; text-align: center; }
  .rules { overflow: auto; height: 100%; }
  .script { overflow: auto; height: 100%; padding: 12px 28px 40px; max-width: 820px; font-size: 13px; line-height: 1.55; }
  .script h1 { font-size: 18px; margin: 4px 0 12px; }
  .script .srow { display: flex; gap: 8px; align-items: center; }
  .sb { padding: 1px 6px; border-radius: 4px; cursor: pointer; }
  .sb:hover { background: #1a2230; }
  .sb.on { background: #1f2a38; outline: 1px solid var(--accent-2); }
  .sb.scene { margin-top: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--accent); font-size: 12px; }
  .sb.speaker { text-align: center; font-weight: 600; margin-top: 4px; }
  .sb.line { margin: 2px 0 6px; }
  .sb.choice { padding-left: 24px; }
  .sb.note { color: var(--muted); font-style: italic; font-size: 12px; }
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
  .playbar .chk { display: flex; gap: 4px; align-items: center; }
  .variants { display: flex; gap: 6px; overflow: auto; height: 100%; }
  .variant { flex: 1; min-width: 320px; display: flex; flex-direction: column; }
  .plist { overflow: auto; padding: 4px 8px; flex: 1; }
  .prow { display: flex; gap: 8px; width: 100%; align-items: center; border-bottom: 1px solid #1e242c; }
  .pmsg { display: flex; gap: 8px; flex: 1; text-align: left; border: none; background: none; padding: 4px; font-size: 12px; }
  .fixb { flex: none; }
  .ico.i { background: var(--accent-2); color: #fff; }
  .ico { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; flex: none; }
  .ico.e { background: var(--bad); color: #fff; } .ico.w { background: var(--warn); color: #000; }
  .vars { padding: 8px 10px; overflow: auto; background: var(--panel); font-size: 12px; }
  .vars .h { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 6px 0 4px; }
  .menu { position: fixed; z-index: 70; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
  .menu button { border: none; background: none; text-align: left; padding: 4px 12px; font-size: 12px; }
  .menu button:hover { background: var(--accent-2); color: #fff; }
  .menu .msect { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 6px 12px 2px; border-top: 1px solid var(--border); margin-top: 2px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 6px 10px; }
  .grid2 { display: grid; grid-template-columns: 70px 1fr; gap: 6px 10px; align-items: center; }
  .grid2.wide { width: 440px; gap: 2px 10px; }
  .opt { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; font-size: 12px; }
  .row2 { display: flex; gap: 6px; }
  :global(.svelte-flow) { --xy-background-color: #0f1216; --xy-node-background-color: transparent; --xy-node-border: none; --xy-minimap-background-color: #161a20; }
  :global(.svelte-flow__node-q) { padding: 0; border: none; background: transparent; }
  :global(.svelte-flow__node-frame) { padding: 0; border: none; background: transparent; pointer-events: none !important; }
  :global(.svelte-flow__handle) { width: 10px; height: 10px; background: var(--accent); border: 2px solid var(--panel); }
  .setv { width: 64px; padding: 0 4px; }
</style>
