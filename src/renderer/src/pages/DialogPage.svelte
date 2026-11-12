<script lang="ts">
  /**
   * Dialog browser (PLAN.md §5, M2): every rules.csv row of the game and every installed mod, as a
   * read-only graph per conversation chain, with the in-game dialog preview and a live Play from
   * any rule.
   */
  import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { app } from '../state/app.svelte'
  import { buildChain, searchRules } from '../../../shared/rules/graph'
  import { Engine, emptyView, assumeKey, builtinCondition, type EngineRule, type DialogView } from '../../../shared/rules/engine'
  import RuleNode from '../graph/RuleNode.svelte'
  import { autoLayout } from '../graph/layout'
  import DialogPreview from '../dialog/DialogPreview.svelte'
  import TestContextPanel from '../dialog/TestContextPanel.svelte'
  import { personLook, itemIcon, illustrationPath, itemName, makePlayContext, factionLook, testCtx } from '../state/testctx.svelte'
  import Splitter from '../Splitter.svelte'
  import { layout, saveLayout } from '../layout.svelte'

  let query = $state(app.selected.dialogQuery ?? 'gaData')
  let loading = $state(true)
  let nodes = $state.raw<Node[]>([])
  let edges = $state.raw<Edge[]>([])
  let stubs = $state<string[]>([])
  const sel = $derived(app.selected.dialog ?? null)
  const rs = $derived(app.ruleSet)
  const results = $derived(rs ? searchRules(rs, query) : [])
  const rule = $derived(sel && rs ? rs.byId.get(sel) ?? null : null)
  const srcName = (id: string) => (id === 'starsector-core' ? 'vanilla' : app.index?.sources.find((s) => s.id === id)?.name ?? id)

  $effect(() => { app.loadRuleSet().then(() => (loading = false)) })

  // ---- the chain graph of the selected rule
  let chainFor = ''
  $effect(() => {
    const r = rule
    if (!r || !rs || chainFor === r.row.id) return
    chainFor = r.row.id
    const c = buildChain(rs, [r.row.id], { maxNodes: 60 })
    stubs = c.stubs
    const sizes = new Map(c.nodes.map((n) => [n.id, { w: 250, h: 70 + Math.min(4, n.rule.conds.length) * 13 + (n.rule.variants[0] ? 44 : 0) + (n.rule.options.length + (n.rule.script.some((s) => s.kind === 'command' && /^Fire/.test(s.name)) ? 1 : 0)) * 22 }]))
    autoLayout(c.nodes.map((n) => ({ id: n.id, width: 250, height: sizes.get(n.id)!.h, ports: [...n.rule.options.map((o) => `o:${o.id}`), 'fire'] })),
      c.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, port: e.handle }))).then((pos) => {
      nodes = c.nodes.map((n) => ({
        id: n.id, type: 'rule', position: pos.get(n.id) ?? { x: n.depth * 300, y: 0 }, draggable: true,
        data: { rule: n.rule, source: srcName(n.rule.row.sourceId), truncated: n.truncated, focus: n.id === r.row.id }
      }))
      edges = c.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, sourceHandle: e.handle, animated: e.kind === 'fire', style: e.kind === 'fire' ? 'stroke:#8fd' : 'stroke:#4fb3ff' }))
    })
  })

  // ---- preview: the selected rule applied in a fresh dialog; options can be clicked to play on
  let engine = $state.raw<Engine | null>(null)
  let view = $state<DialogView>(emptyView())
  let log = $state<string[]>([])
  let unmet = $state<string[]>([])
  function hooks() {
    return { itemName, factionName: (id: string) => factionLook(id)?.name ?? id }
  }
  function previewRule(r: EngineRule) {
    if (!rs) return
    const e = new Engine(rs, makePlayContext(), hooks())
    if (r.option) e.set('$option', r.option)
    // a rule about one person or entity ("$id == rao"): preview it as that one, unless the Test context names someone
    const idCond = r.conds.find((c) => c.kind === 'memory' && c.key === '$id' && c.op === '==' && !c.negate)
    if (idCond && idCond.kind === 'memory' && !testCtx.person) { e.set('$id', idCond.value ?? ''); e.set('$isPerson', true) }
    unmet = r.conds.filter((c) => !e.evalCondition(c)).map((c) => c.raw)
    if (r.row.trigger === 'PopulateOptions') e.fireAll('PopulateOptions')
    else e.apply(r)
    engine = e
    view = e.view
    log = e.log.map((l) => l.text)
  }
  $effect(() => { const r = rule; void JSON.stringify(testCtx); if (r && rs) previewRule(r) })

  function choose(id: string) {
    const e = engine
    if (!e) return
    e.select(id)
    view = { ...e.view }
    log = e.log.map((l) => l.text)
    const fired = e.fired[0]
    if (fired) nodes = nodes.map((n) => ({ ...n, data: { ...n.data, path: n.id === fired || (n.data as { path?: boolean }).path } }))
  }

  const unknownConds = $derived.by(() => {
    if (!rule || !rs) return []
    const out = new Set<string>()
    const probe = new Engine(rs, makePlayContext())
    for (const c of rule.conds) if (c.kind === 'command' && builtinCondition(probe, c.name, c.args) === undefined) out.add(assumeKey(c))
    return [...out]
  })
  const memKeys = $derived(rule ? [...new Set(rule.conds.flatMap((c) => (c.kind === 'memory' && c.key !== '$option' ? [c.key] : [])))] : [])
  let dockTab = $state<'preview' | 'log'>('preview')
  const nodeTypes = { rule: RuleNode }
</script>

<div class="page" style="grid-template-columns:{layout.left}px 1px minmax(0,1fr) 1px {layout.right}px">
  <aside class="left">
    <input class="search" type="search" placeholder="Rule id, trigger, option id or text…" bind:value={query} oninput={() => (app.selected.dialogQuery = query)} />
    <div class="muted small pad">{loading ? 'Reading every rules.csv…' : `${rs?.all.length ?? 0} rules from ${Object.keys(app.index?.ruleCounts ?? {}).length} sources. ${results.length >= 300 ? 'First 300 matches.' : `${results.length} matches.`}`}</div>
    <ul class="list">
      {#each results as r (r.row.id + r.row.sourceId)}
        <li class:on={sel === r.row.id}><button class="li" onclick={() => (app.selected.dialog = r.row.id)}>
          <span class="mono id">{r.row.id}</span><span class="sub">{r.row.trigger} · {srcName(r.row.sourceId)}</span>
        </button></li>
      {/each}
    </ul>
  </aside>
  <Splitter axis="x" value={layout.left} min={180} max={() => 600} label="Resize list" onChange={(v) => (layout.left = v)} onDone={saveLayout} onReset={() => { layout.left = 280; saveLayout() }} />

  <section class="main" style="grid-template-rows:minmax(0,1fr) 1px {layout.dock}px">
    <div class="canvas">
      {#if rule}
        <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView fitViewOptions={{ maxZoom: 1, minZoom: 0.5, nodes: [{ id: sel ?? '' }] }} colorMode="dark" nodesConnectable={false} minZoom={0.1}
          onnodeclick={({ node }) => (app.selected.dialog = node.id)} proOptions={{ hideAttribution: true }}>
          <Background gap={20} />
          <Controls showLock={false} />
          <MiniMap pannable zoomable width={170} height={100} />
        </SvelteFlow>
        {#if stubs.length}<div class="stubs muted small">Also fires (not drawn, too broad): {stubs.join(', ')}</div>{/if}
      {:else}
        <div class="center muted">Search the game's dialog on the left (e.g. <span class="mono">gaData</span>, <span class="mono">rao</span>, a trigger like <span class="mono">OpenCommLink</span>) and pick a rule to see its conversation as a chart.</div>
      {/if}
    </div>
    <Splitter axis="y" value={layout.dock} min={140} max={() => window.innerHeight - 260} sign={-1} label="Resize preview" onChange={(v) => (layout.dock = v)} onDone={saveLayout} onReset={() => { layout.dock = 330; saveLayout() }} />
    <div class="dock" style="grid-template-columns:minmax(0,1fr) {layout.ctx}px">
      <div class="dockmain">
        <div class="tabs">
          <button class:on={dockTab === 'preview'} onclick={() => (dockTab = 'preview')}>Dialog preview</button>
          <button class:on={dockTab === 'log'} onclick={() => (dockTab = 'log')}>Log ({log.length})</button>
          <span class="spacer"></span>
          {#if rule}<button class="mini" onclick={() => rule && previewRule(rule)}>Restart</button>{/if}
          {#if unmet.length}<span class="warn small">conditions not met with this Test context: {unmet.join(', ')}</span>{/if}
        </div>
        {#if dockTab === 'preview'}
          <DialogPreview {view} person={personLook} icon={itemIcon} illustration={illustrationPath} onSelect={choose} />
        {:else}
          <div class="log mono">{#each log as l, i (i)}<div>{l}</div>{/each}</div>
        {/if}
      </div>
      <TestContextPanel unknownConditions={unknownConds} memoryKeys={memKeys} />
    </div>
  </section>
  <Splitter axis="x" value={layout.right} min={240} max={() => 700} sign={-1} label="Resize details" onChange={(v) => (layout.right = v)} onDone={saveLayout} onReset={() => { layout.right = 340; saveLayout() }} />

  <aside class="right">
    {#if rule}
      <h3 class="mono">{rule.row.id}</h3>
      <div class="muted small">{srcName(rule.row.sourceId)} · {rule.row.file}:{rule.row.line} · read-only</div>
      <dl>
        <dt>Trigger</dt><dd class="mono">{rule.row.trigger}</dd>
        <dt>Conditions</dt><dd><pre>{rule.row.conditions || '—'}</pre></dd>
        <dt>Script</dt><dd><pre>{rule.row.script || '—'}</pre></dd>
        <dt>Text</dt><dd><pre class="txt">{rule.row.text || '—'}</pre></dd>
        <dt>Options</dt><dd><pre>{rule.row.options || '—'}</pre></dd>
        {#if rule.row.notes}<dt>Notes</dt><dd><pre>{rule.row.notes}</pre></dd>{/if}
        <dt>Score</dt><dd>{rule.score} (FireBest picks the matching rule with the highest score)</dd>
      </dl>
    {/if}
  </aside>
</div>

<style>
  .page { display: grid; height: 100%; min-height: 0; }
  .left, .right { background: var(--panel); min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .right { padding: 10px 12px; overflow: auto; }
  .search { margin: 8px 10px 4px; }
  .pad { padding: 0 10px 6px; }
  .list { list-style: none; margin: 0; padding: 0 4px 10px; overflow: auto; flex: 1; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { display: flex; flex-direction: column; width: 100%; border: none; background: none; padding: 3px 8px; text-align: left; }
  .li .id { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .li .sub { color: var(--muted); font-size: 10px; }
  .main { display: grid; min-width: 0; min-height: 0; }
  .canvas { position: relative; min-height: 0; background: #0f1216; }
  .center { display: grid; place-items: center; height: 100%; padding: 30px; text-align: center; }
  .stubs { position: absolute; left: 50px; bottom: 8px; background: #161a20cc; padding: 2px 8px; border-radius: 4px; }
  .dock { display: grid; min-height: 0; border-top: 1px solid var(--border); }
  .dockmain { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .tabs { display: flex; gap: 2px; padding: 3px 8px 0; background: var(--panel); border-bottom: 1px solid var(--border); align-items: center; }
  .tabs button { padding: 2px 10px; font-size: 12px; border-radius: 4px 4px 0 0; border-bottom: none; }
  .tabs button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .tabs .mini { border-radius: 4px; border-bottom: 1px solid var(--border); padding: 0 8px; font-size: 11px; }
  .spacer { flex: 1; }
  .log { overflow: auto; padding: 6px 10px; font-size: 11px; flex: 1; }
  h3 { margin: 2px 0; font-size: 13px; word-break: break-all; }
  dl { margin: 8px 0; font-size: 12px; }
  dt { color: var(--muted); margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  dd { margin: 2px 0 0; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; }
  pre.txt { font-family: inherit; font-size: 12px; }
  .small { font-size: 11px; }
  .warn { color: var(--warn); }
  :global(.svelte-flow) { --xy-background-color: #0f1216; --xy-node-background-color: transparent; --xy-node-border: none; --xy-minimap-background-color: #161a20; }
  :global(.svelte-flow__node-rule) { padding: 0; border: none; background: transparent; }
</style>
