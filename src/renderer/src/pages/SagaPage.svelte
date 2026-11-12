<script lang="ts">
  /** Saga overview (PLAN.md §4.8, §4.10; mock-up saga.html): board, timeline, flags registry, test profiles, mod-wide phrases. */
  import { SvelteFlow, Background, Controls, type Node, type Edge } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { problems } from '../state/problems.svelte'
  import { buildRegistry, flagProblems, renameFlag, suggest } from '../../../shared/flags'
  import { handRules } from '../../../shared/export/blocks'
  import { uniqueId, slug } from '../../../shared/quest'
  import type { TestProfile, Phrase } from '../../../shared/model'
  import SagaCard from '../graph/SagaCard.svelte'
  import PhraseEditor from '../quests/PhraseEditor.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import { conditionTemplates } from '../quests/edit'
  import { personLook } from '../state/testctx.svelte'

  let tab = $state<'board' | 'timeline' | 'flags' | 'profiles' | 'phrases'>((app.selected.sagaTab as 'board') ?? 'board')
  $effect(() => { app.selected.sagaTab = tab })
  const m = $derived(project.m)
  const reg = $derived(m && project.loaded ? buildRegistry(m, handRules(project.loaded.files['data/campaign/rules.csv']?.text, project.loaded.sourceId), app.rules?.filter((r) => r.sourceId !== project.loaded?.sourceId) ?? []) : new Map())
  const flagProbs = $derived(m ? flagProblems(reg, m.project.prefix) : [])

  // ---- board
  const startText = (q: NonNullable<typeof m>['quests'][number]) => {
    const s = q.start
    return s.kind === 'contact' ? `contact: ${personLook(s.person)?.name ?? s.person}` : s.kind === 'bar' ? 'bar event' : s.kind === 'option' ? `option: ${s.optionText}` : s.kind === 'trigger' ? `on ${s.trigger}` : 'started by another quest'
  }
  let nodes = $state.raw<Node[]>([])
  let edges = $state.raw<Edge[]>([])
  $effect(() => {
    if (!m) { nodes = []; edges = []; return }
    void JSON.stringify(m.quests.map((q) => [q.id, q.title, q.requires, q.start])), void JSON.stringify(m.project.saga.positions)
    nodes = m.quests.map((q, i) => {
      const p = m.project.saga.positions[q.id] ?? [40 + (i % 4) * 260, 40 + Math.floor(i / 4) * 170]
      const people = [...new Set(q.nodes.flatMap((n) => (n.type === 'dialog' && n.speaker ? [personLook(n.speaker)?.name ?? n.speaker] : [])))]
      return { id: q.id, type: 'card', position: { x: p[0], y: p[1] }, data: { quest: q, start: startText(q), people, problems: problems.live.filter((x) => x.ref?.id === q.id && x.level === 'error').length } }
    })
    const es: Edge[] = []
    for (const q of m.quests) {
      for (const r of q.requires) {
        if ('quest' in r) es.push({ id: `req:${r.quest}>${q.id}`, source: r.quest, target: q.id, label: r.ended === 'any' ? 'ended' : r.ended, style: 'stroke:#4fb3ff;stroke-width:2' })
      }
    }
    // dashed: a quest sets a flag another quest reads
    for (const e of reg.values()) {
      const setters = new Set(e.setBy.map((u: { quest?: string }) => u.quest).filter(Boolean) as string[])
      const readers = new Set(e.readBy.map((u: { quest?: string }) => u.quest).filter(Boolean) as string[])
      for (const s of setters) for (const r of readers) if (s !== r && m.quests.some((q) => q.id === s) && m.quests.some((q) => q.id === r)) {
        es.push({ id: `flag:${e.key}:${s}>${r}`, source: s, target: r, label: e.key.replace(/^\$global\./, ''), style: 'stroke:#c9a0ff;stroke-dasharray:5 4' })
      }
    }
    edges = es
  })
  function onDragStop({ nodes: moved }: { nodes: Node[] }) {
    project.change((mm) => { for (const n of moved) mm.project.saga.positions[n.id] = [Math.round(n.position.x), Math.round(n.position.y)] })
  }

  // ---- timeline: quests in the order a player can reach them
  const timeline = $derived.by(() => {
    if (!m) return { order: [] as string[][], cycle: [] as string[] }
    const deps = new Map(m.quests.map((q) => [q.id, q.requires.filter((r) => 'quest' in r).map((r) => (r as { quest: string }).quest)]))
    const done = new Set<string>()
    const order: string[][] = []
    for (let guard = 0; guard < 50; guard++) {
      const layer = [...deps.keys()].filter((id) => !done.has(id) && (deps.get(id) ?? []).every((d) => done.has(d) || !deps.has(d)))
      if (!layer.length) break
      order.push(layer)
      for (const id of layer) done.add(id)
    }
    return { order, cycle: [...deps.keys()].filter((id) => !done.has(id)) }
  })

  // ---- flags
  let flagFilter = $state('')
  const flagRows = $derived([...reg.values()].filter((e) => !flagFilter || e.key.toLowerCase().includes(flagFilter.toLowerCase())).sort((a, b) => a.key.localeCompare(b.key)))
  const problemFor = (key: string) => flagProbs.filter((p) => p.ref?.sub === key)
  function go(quest?: string, node?: string) { if (quest) { app.go('quests', quest); app.selected.questNode = node ?? null } }

  // ---- test profiles
  const profSel = $derived(app.selected.profile ?? m?.testProfiles[0]?.id ?? null)
  const prof = $derived(m?.testProfiles.find((p) => p.id === profSel) ?? null)
  const edProf = (fn: (p: TestProfile) => void) => { const id = profSel; project.change((mm) => { const p = mm.testProfiles.find((x) => x.id === id); if (p) fn(p) }) }
  function newProfile() {
    const id = uniqueId('profile', m?.testProfiles.map((p) => p.id) ?? [])
    project.change((mm) => { mm.testProfiles.push({ id, name: 'New test profile', quests: {}, flags: {}, player: {} }) })
    app.selected.profile = id
  }
  const factions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id })) ?? []), ...(app.index?.factions ?? [])])
  const items = $derived([...(m?.items.map((i) => ({ id: i.id, name: i.name })) ?? []), ...(app.index?.items ?? [])])
  let newFlag = $state('')

  // ---- phrases
  const templates = $derived(conditionTemplates(null, factions.map((f) => f.id), m?.quests ?? []))
  function newModPhrase() {
    const tok = `$${project.prefix}${uniqueId('phrase', m?.phrases.map((p) => p.token.replace(`$${project.prefix}`, '')) ?? [])}`
    project.change((mm) => { mm.phrases.push({ token: tok, owner: 'mod', mode: 'first-match', cases: [{ when: [], text: '' }], otherwise: '' }) })
  }

  $effect(() => { if (tab === 'flags') app.loadRules() })
  const nodeTypes = { card: SagaCard }
</script>

<div class="page">
  <div class="toolbar">
    <div class="seg">
      <button class:on={tab === 'board'} onclick={() => (tab = 'board')}>Board</button>
      <button class:on={tab === 'timeline'} onclick={() => (tab = 'timeline')}>Timeline</button>
      <button class:on={tab === 'flags'} onclick={() => (tab = 'flags')}>Flags registry ({reg.size}){#if flagProbs.some((p) => p.level === 'warning')}<span class="cnt">{flagProbs.filter((p) => p.level === 'warning').length}</span>{/if}</button>
      <button class:on={tab === 'profiles'} onclick={() => (tab = 'profiles')}>Test profiles ({m?.testProfiles.length ?? 0})</button>
      <button class:on={tab === 'phrases'} onclick={() => (tab = 'phrases')}>Mod-wide phrases ({m?.phrases.length ?? 0})</button>
    </div>
    <span class="muted small">{tab === 'board' ? 'Solid arrows: prerequisites. Dashed: a flag one quest sets and another reads. Drag cards; double-click opens the quest.' : ''}</span>
  </div>

  {#if !m}
    <div class="center muted">Pick or create an active mod first.</div>
  {:else if tab === 'board'}
    <div class="board">
      <SvelteFlow bind:nodes bind:edges {nodeTypes} colorMode="dark" fitView fitViewOptions={{ maxZoom: 1 }} nodesConnectable={false} zoomOnDoubleClick={false}
        onnodedragstop={({ nodes: ns }) => onDragStop({ nodes: ns })} onnodeclick={({ node, event }) => { if ((event as MouseEvent).detail === 2) app.go('quests', node.id) }} proOptions={{ hideAttribution: true }}>
        <Background gap={20} />
        <Controls showLock={false} />
      </SvelteFlow>
      {#if !m.quests.length}<div class="overlay muted">No quests yet. Create one on the Quests page.</div>{/if}
    </div>
  {:else if tab === 'timeline'}
    <div class="scroll pad">
      {#each timeline.order as layer, i (i)}
        <div class="layer"><span class="muted">{i === 0 ? 'Available from the start' : `After ${i} step${i === 1 ? '' : 's'}`}</span>
          {#each layer as id (id)}<button class="chip" onclick={() => app.go('quests', id)}>{m.quests.find((q) => q.id === id)?.title ?? id}</button>{/each}</div>
      {/each}
      {#if timeline.cycle.length}<div class="bad">Can never start (their prerequisites form a cycle): {timeline.cycle.join(', ')}</div>{/if}
    </div>
  {:else if tab === 'flags'}
    <div class="scroll">
      <div class="pad row"><input type="search" placeholder="Filter keys…" bind:value={flagFilter} /><span class="muted small">Every memory key the mod uses, from its plans and its hand-written rules.csv rows. Keys set by vanilla or other mods are marked.</span></div>
      <table class="t">
        <thead><tr><th>Key</th><th>Set by</th><th>Read by</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>
          {#each flagRows as e (e.key)}
            {@const pr = problemFor(e.key)}
            <tr class:warn={pr.some((p) => p.level === 'warning')}>
              <td class="mono">{e.key}{#if e.generated} <span class="badge">generated</span>{/if}</td>
              <td>{#each e.setBy.slice(0, 4) as u, i (i)}<button class="lnk" onclick={() => go(u.quest, u.node)}>{u.where}{u.node ? ` · ${u.node}` : ''}</button>{/each}{#if e.external}<span class="muted">{e.external === 'starsector-core' ? 'vanilla' : e.external}</span>{/if}{#if e.setBy.length > 4}<span class="muted"> +{e.setBy.length - 4}</span>{/if}</td>
              <td>{#each e.readBy.slice(0, 4) as u, i (i)}<button class="lnk" onclick={() => go(u.quest, u.node)}>{u.where}{u.node ? ` · ${u.node}` : ''}</button>{/each}{#if e.readBy.length > 4}<span class="muted"> +{e.readBy.length - 4}</span>{/if}</td>
              <td class="muted">{[...e.types].join(', ')}</td>
              <td>
                {#each pr as p, i (i)}
                  <div class:bad={p.level === 'warning'} class:muted={p.level === 'info'}>{p.level === 'warning' ? (e.setBy.length ? 'mixed types' : 'read, never set') : 'set, never read'}
                    {#if !e.setBy.length}{@const s = suggest(e.key, reg)}{#if s}<button class="mini" onclick={() => project.change((mm) => renameFlag(mm, e.key, s))}>Use {s}</button>{/if}{/if}</div>
                {:else}<span class="good">ok</span>{/each}
              </td>
            </tr>
          {:else}<tr><td colspan="5" class="muted">No memory keys yet.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  {:else if tab === 'profiles'}
    <div class="split">
      <div class="side">
        <div class="sect">Test profiles <button onclick={newProfile}>+ New</button></div>
        <ul class="list">{#each m.testProfiles as p (p.id)}<li class:on={p.id === profSel}><button class="li" onclick={() => (app.selected.profile = p.id)}>{p.name}</button></li>{/each}</ul>
        <p class="muted small pad">A saved game situation. It sets up Play mode, and with the game's dev mode on, SagaLib can apply it at a new game or from its dev menu (needs SagaLib, M5).</p>
      </div>
      <div class="scroll pad">
        {#if prof}
          <div class="grid2">
            <label for="tp-n">Name</label><input id="tp-n" type="text" value={prof.name} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.name = v }) }} />
            <span class="lbl">Id</span><span class="mono">{prof.id}</span>
          </div>
          <div class="sect2">Quests</div>
          <table class="t">
            <tbody>
              {#each m.quests.filter((q) => q.kind === 'quest') as q (q.id)}
                {@const s = prof.quests[q.id]}
                <tr><td>{q.title}</td>
                  <td><select value={s?.state ?? 'not-started'} onchange={(e) => { const v = e.currentTarget.value as 'not-started'; edProf((p) => { if (v === 'not-started') delete p.quests[q.id]; else p.quests[q.id] = { state: v, step: p.quests[q.id]?.step ?? q.stages[0]?.id } }) }}>
                    <option value="not-started">not started</option><option value="active">active</option><option value="success">succeeded</option><option value="fail">failed</option></select></td>
                  <td>{#if s && s.state === 'active'}<select value={s.step ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.quests[q.id].step = v }) }}>{#each q.stages as st (st.id)}<option value={st.id}>{st.title}</option>{/each}</select>{/if}</td></tr>
              {/each}
            </tbody>
          </table>
          <div class="sect2">Flags</div>
          {#each Object.entries(prof.flags) as [k, v] (k)}
            <div class="row"><span class="mono">{k}</span><input type="text" value={v} onchange={(e) => { const x = e.currentTarget.value; edProf((p) => { p.flags[k] = x }) }} /><button class="mini" onclick={() => edProf((p) => { delete p.flags[k] })}>✕</button></div>
          {/each}
          <div class="row"><IdInput value={newFlag} options={[...reg.keys()].map((k) => ({ id: k }))} placeholder="$global.key" onCommit={(v) => (newFlag = v)} /><button class="mini" onclick={() => { const k = newFlag.trim(); if (k) { edProf((p) => { p.flags[k] = 'true' }); newFlag = '' } }}>+ flag</button></div>
          <div class="sect2">Player</div>
          <div class="grid2">
            <label for="tp-c">Credits</label><input id="tp-c" type="number" value={prof.player.credits ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.credits = v === '' ? undefined : Number(v) }) }} />
            <label for="tp-s">Story points</label><input id="tp-s" type="number" value={prof.player.storyPoints ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.storyPoints = v === '' ? undefined : Number(v) }) }} />
            <span class="lbl">Commission</span><IdInput value={prof.player.commission ?? ''} options={factions} placeholder="(none)" onCommit={(v) => edProf((p) => { p.player.commission = v || undefined })} />
            <span class="lbl">Start at</span><input type="text" class="mono" value={prof.player.startAt ?? ''} placeholder="entity id (dev mode, new game)" onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.startAt = v || undefined }) }} />
            <span class="lbl">Reputation</span>
            <div>{#each Object.entries(prof.player.rep ?? {}) as [f, r] (f)}<div class="row"><span class="mono">{f}</span><input type="number" step="0.05" min="-1" max="1" value={r} onchange={(e) => { const v = Number(e.currentTarget.value); edProf((p) => { p.player.rep![f] = v }) }} /><button class="mini" onclick={() => edProf((p) => { delete p.player.rep![f] })}>✕</button></div>{/each}
              <IdInput value="" options={factions} placeholder="+ faction" clearOnCommit onCommit={(v) => { if (v) edProf((p) => { (p.player.rep ??= {})[v] = 0.5 }) }} /></div>
            <span class="lbl">Cargo</span>
            <div>{#each prof.player.cargo ?? [] as c, i (i)}<div class="row"><span class="mono">{c.item}</span><input type="number" value={c.qty} onchange={(e) => { const v = Number(e.currentTarget.value); edProf((p) => { p.player.cargo![i].qty = v }) }} /><button class="mini" onclick={() => edProf((p) => { p.player.cargo!.splice(i, 1) })}>✕</button></div>{/each}
              <IdInput value="" options={items} placeholder="+ item" clearOnCommit onCommit={(v) => { if (v) edProf((p) => { (p.player.cargo ??= []).push({ item: v, qty: 1 }) }) }} /></div>
          </div>
          <p><button class="mini danger" onclick={() => { const id = prof.id; project.change((mm) => { mm.testProfiles = mm.testProfiles.filter((p) => p.id !== id) }); app.selected.profile = null }}>Delete profile</button></p>
        {:else}<div class="muted">No test profile selected.</div>{/if}
      </div>
    </div>
  {:else if tab === 'phrases'}
    <div class="scroll pad">
      <p class="muted small">Phrases used by any text of the mod. A character's own phrases are on the People page; one-off variations are added inside a Dialog node. SagaLib fills them in, in game.</p>
      <button onclick={newModPhrase}>+ Phrase</button>
      {#each m.phrases as p, i (i)}
        <PhraseEditor phrase={p} {templates} tokenEditable onChange={(np: Phrase) => project.change((mm) => { mm.phrases[i] = { ...np, token: np.token.startsWith(`$${project.prefix}`) ? np.token : `$${project.prefix}${slug(np.token.replace(/^\$/, ''))}` } })} onRemove={() => project.change((mm) => { mm.phrases.splice(i, 1) })} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
  .toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; }
  .seg { display: flex; }
  .seg button { border-radius: 0; margin-left: -1px; padding: 3px 10px; font-size: 12px; }
  .seg button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 4px 4px 0; }
  .seg button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
  .cnt { background: var(--warn); color: #000; border-radius: 8px; padding: 0 5px; font-size: 11px; margin-left: 4px; }
  .board { position: relative; min-height: 0; background: #0f1216; }
  .overlay { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .center { display: grid; place-items: center; }
  .layer { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .chip { font-size: 12px; padding: 2px 10px; border-radius: 10px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 8px; position: sticky; top: 0; background: var(--panel); }
  table.t td { border-bottom: 1px solid #1e242c; padding: 4px 8px; vertical-align: top; }
  tr.warn td { background: #2a1f10; }
  .lnk { display: block; border: none; background: none; padding: 0; color: var(--accent); font-size: 12px; text-align: left; }
  .badge { font-size: 10px; padding: 0 5px; border-radius: 8px; border: 1px solid var(--border); color: var(--muted); }
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 4px; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 420px); gap: 5px 10px; align-items: center; }
  .grid2 label, .lbl { color: var(--muted); font-size: 12px; }
  .row { display: flex; gap: 6px; align-items: center; margin-bottom: 3px; font-size: 12px; }
  .row input { padding: 2px 6px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .bad { color: var(--bad); } .good { color: var(--good); }
  :global(.svelte-flow__node-card) { padding: 0; border: none; background: transparent; }
</style>
