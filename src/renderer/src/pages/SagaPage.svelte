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
  import LaneBand from '../graph/LaneBand.svelte'
  import FlowApi from '../graph/FlowApi.svelte'
  import { storylines } from '../../../shared/storylines'
  import PhraseEditor from '../quests/PhraseEditor.svelte'
  import PoolsPanel from '../saga/PoolsPanel.svelte'
  import ScatterPanel from '../saga/ScatterPanel.svelte'
  import EventsPanel from '../saga/EventsPanel.svelte'
  import ProgressPanel from '../saga/ProgressPanel.svelte'
  import ModsPanel from '../saga/ModsPanel.svelte'
  import SettingsPanel from '../saga/SettingsPanel.svelte'
  import AchievementsPanel from '../saga/AchievementsPanel.svelte'
  import ResearchPanel from '../saga/ResearchPanel.svelte'
  import { VOK_ID } from '../../../shared/research'
  import QuestSkipPanel from '../saga/QuestSkipPanel.svelte'
  import { nexListed, useOf } from '../../../shared/modlist'
  import { MAGICLIB_ID } from '../../../shared/achievements'
  import IdInput from '../ui/IdInput.svelte'
  import Field from '../ui/Field.svelte'
  import { conditionTemplates } from '../quests/edit'
  import { personLook } from '../state/testctx.svelte'
  import { inactiveQuests } from '../../../shared/inactive'

  // screenshot mode: "saga::<tab>"
  let tab = $state<'board' | 'timeline' | 'flags' | 'profiles' | 'phrases' | 'pools' | 'scatter' | 'events' | 'progress' | 'mods' | 'settings' | 'achievements' | 'questskip' | 'research'>(((app.smoke ? app.smokeArg : null) ?? app.selected.sagaTab ?? 'board') as 'board')
  $effect(() => { app.selected.sagaTab = tab })
  // #60: the header pill and Problems open Saga › Mods while this page is open
  $effect(() => { const want = app.selected.sagaOpen; if (want) { tab = want as typeof tab; app.selected.sagaOpen = null } })
  // screenshot mode: "saga:<item id>:<tab>" selects that item in the tab (pool, profile, event scheduler, progress event, scatter)
  if (app.smoke && app.selected.saga) {
    const key = ({ pools: 'pool', profiles: 'profile', events: 'eventScheduler', progress: 'progressEvent', scatter: 'scatterItem', settings: 'setting', research: 'researchTech' } as Record<string, string>)[app.smokeArg ?? '']
    if (key) app.selected[key] = app.selected.saga
  }
  const m = $derived(project.m)
  const reg = $derived(m && project.loaded ? buildRegistry(m, handRules(project.loaded.files['data/campaign/rules.csv']?.text, project.loaded.sourceId), app.rules?.filter((r) => r.sourceId !== project.loaded?.sourceId) ?? []) : new Map())
  const flagProbs = $derived(m ? flagProblems(reg, m.project.prefix) : [])

  // ---- board
  const startText = (q: NonNullable<typeof m>['quests'][number]) => {
    const s = q.start
    return s.kind === 'contact' ? (s.person ? `contact: ${personLook(s.person)?.name ?? s.person}` : `any contact tagged ${[s.tagsAll, s.tagsAny].filter(Boolean).join(' / ') || '?'}`) : s.kind === 'bar' ? 'bar event' : s.kind === 'option' ? `option: ${s.optionText}` : s.kind === 'trigger' ? `on ${s.trigger}` : 'started by another quest'
  }
  /**
   * #67 U19 (user, 2026-11-21): storylines. One lane per questline (prerequisites, one quest starting
   * another), left to right by step; the quests with no link in a last lane. Only story links are
   * drawn; a selected card also shows the flags it shares with other quests (and the side panel lists them).
   */
  let nodes = $state.raw<Node[]>([])
  let edges = $state.raw<Edge[]>([])
  // screenshot mode: "saga:<quest id>:board" selects that card
  let boardSel = $state<string | null>(app.smoke && app.smokeArg === 'board' ? app.selected.saga ?? null : null)
  // a flag that gates a quest's start, set by another quest, counts as a story link ("unlocks")
  const setters = (key: string): string[] => [...new Set((reg.get(key)?.setBy ?? []).map((u: { quest?: string }) => u.quest).filter(Boolean) as string[])]
  const lines = $derived(m ? storylines(m.quests, setters) : { lanes: [], links: [] })
  /** A quest's flags shared with other quests: the ones it sets that others read, and the ones it reads that others set. */
  const sharedFlags = $derived.by(() => {
    const out: { key: string; dir: 'sets' | 'reads'; others: string[] }[] = []
    if (!boardSel) return out
    for (const e of reg.values()) {
      const setters = [...new Set(e.setBy.map((u: { quest?: string }) => u.quest).filter(Boolean) as string[])]
      const readers = [...new Set(e.readBy.map((u: { quest?: string }) => u.quest).filter(Boolean) as string[])]
      if (setters.includes(boardSel)) { const o = readers.filter((r) => r !== boardSel); if (o.length) out.push({ key: e.key, dir: 'sets', others: o }) }
      if (readers.includes(boardSel)) { const o = setters.filter((s) => s !== boardSel); if (o.length) out.push({ key: e.key, dir: 'reads', others: o }) }
    }
    return out.sort((a, b) => a.dir.localeCompare(b.dir) || a.key.localeCompare(b.key))
  })
  const COL_W = 260, ROW_H = 140, HEAD = 46, GAP = 24, PAD = 14
  const LINK_STYLE: Record<string, string> = { requires: 'stroke:#4fb3ff;stroke-width:2', starts: 'stroke:#6fd07a;stroke-width:2', unlocks: 'stroke:#e0b050;stroke-width:1.5' }
  /** How a link reads in the side panel, from the quest before it / after it. */
  const linkText = (l: { kind: string; label: string }, after: boolean): string =>
    l.kind === 'requires' ? (after ? `prerequisite: ${l.label}` : 'needs it') : l.kind === 'unlocks' ? (after ? `its start needs ${l.label}` : `sets ${l.label}, which its start needs`) : l.label
  $effect(() => {
    if (!m) { nodes = []; edges = []; return }
    void JSON.stringify(m.quests.map((q) => [q.id, q.title, q.requires, q.start])), void boardSel
    void JSON.stringify(m.people.map((p) => p.inactive)), void JSON.stringify(m.quests.map((q) => q.inactive))
    const off = inactiveQuests(m)
    const ns: Node[] = []
    const cols = Math.max(1, ...lines.lanes.flatMap((l) => l.quests.map((q) => q.col + 1)))
    let y = 0
    for (const lane of lines.lanes) {
      const h = HEAD + lane.rows * ROW_H + PAD
      ns.push({ id: lane.id, type: 'lane', position: { x: -PAD, y }, data: { title: lane.title, count: lane.quests.length, alone: lane.alone, w: cols * COL_W + PAD, h }, draggable: false, selectable: false, zIndex: -1 })
      for (const lq of lane.quests) {
        const q = m.quests.find((x) => x.id === lq.id)!
        const people = [...new Set(q.nodes.flatMap((n) => (n.type === 'dialog' && n.speaker ? [personLook(n.speaker)?.name ?? n.speaker] : [])))]
        ns.push({ id: q.id, type: 'card', position: { x: lq.col * COL_W, y: y + HEAD + lq.row * ROW_H }, draggable: false, selected: q.id === boardSel,
          data: { quest: q, start: startText(q), people, problems: problems.live.filter((x) => x.ref?.id === q.id && x.level === 'error').length, inactive: off.has(q.id) } })
      }
      y += h + GAP
    }
    nodes = ns
    const es: Edge[] = lines.links.map((l) => ({ id: `${l.kind}:${l.from}>${l.to}`, source: l.from, target: l.to, label: l.kind === 'unlocks' ? undefined : l.label, style: LINK_STYLE[l.kind] }))
    // the selected quest's shared flags, dashed
    for (const f of sharedFlags) for (const o of f.others) {
      const [s, r] = f.dir === 'sets' ? [boardSel!, o] : [o, boardSel!]
      es.push({ id: `flag:${f.key}:${s}>${r}`, source: s, target: r, sourceHandle: 'flag-out', targetHandle: 'flag-in', label: f.key.replace(/^\$global\./, ''), style: 'stroke:#c9a0ff;stroke-dasharray:5 4', zIndex: 1000 })
    }
    edges = es
  })
  const titleOf = (id: string) => m?.quests.find((q) => q.id === id)?.title ?? id

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
  const nodeTypes = { card: SagaCard, lane: LaneBand }
</script>

<div class="page">
  <div class="top">
  <div class="toolbar">
    <div class="seg">
      <button class:on={tab === 'board'} onclick={() => (tab = 'board')}>Board</button>
      <button class:on={tab === 'timeline'} onclick={() => (tab = 'timeline')}>Timeline</button>
      <button class:on={tab === 'flags'} onclick={() => (tab = 'flags')}>Flags registry ({reg.size}){#if flagProbs.some((p) => p.level === 'warning')}<span class="cnt">{flagProbs.filter((p) => p.level === 'warning').length}</span>{/if}</button>
      <button class:on={tab === 'profiles'} onclick={() => (tab = 'profiles')}>Test profiles ({m?.testProfiles.length ?? 0})</button>
      <button class:on={tab === 'phrases'} onclick={() => (tab = 'phrases')}>Mod-wide phrases ({m?.phrases.length ?? 0})</button>
      <button class:on={tab === 'pools'} onclick={() => (tab = 'pools')} title="Named random pools">Pools ({m?.pools?.length ?? 0})</button>
      <button class:on={tab === 'scatter'} onclick={() => (tab = 'scatter')} title="Objects placed at new game">Scatter ({m?.scatter?.length ?? 0})</button>
      <button class:on={tab === 'events'} onclick={() => (tab = 'events')} title="World events: things that happen without the player">Events ({m?.events?.length ?? 0})</button>
      <button class:on={tab === 'progress'} onclick={() => (tab = 'progress')} title="Progress events: the mod's own event bars">Progress ({m?.progress?.length ?? 0})</button>
      <button class:on={tab === 'mods'} onclick={() => (tab = 'mods')} title="The other mods this mod has content for: required, optional, incompatible">Mods ({m?.project.mods?.length ?? 0})</button>
      <button class:on={tab === 'settings'} onclick={() => (tab = 'settings')} title="The mod's settings page in LunaLib's menu: options players change, read by quests and conditions">Settings ({m?.project.settings?.length ?? 0})</button>
      <!-- #65: mod-specific tools, shown when the mod lists the mod (Saga › Mods) or already uses them (PLAN.md §10.1) -->
      {#if m && (['required', 'optional'].includes(useOf(m.project, MAGICLIB_ID)) || m.project.achievements?.length || tab === 'achievements')}<button class:on={tab === 'achievements'} onclick={() => (tab = 'achievements')} title="MagicLib achievements: quest endings unlock them (MagicLib's list, shared by every save)">Achievements ({m.project.achievements?.length ?? 0})</button>{/if}
      {#if m && (nexListed(m.project) || m.project.questSkip?.length || tab === 'questskip')}<button class:on={tab === 'questskip'} onclick={() => (tab = 'questskip')} title="Nexerelin's new-game &quot;skip quests&quot; screen: the mod's quest chains and what skipping each quest means">Quest skip ({m.project.questSkip?.length ?? 0})</button>{/if}
      {#if m && (['required', 'optional'].includes(useOf(m.project, VOK_ID)) || m.research?.techs.length || tab === 'research')}<button class:on={tab === 'research'} onclick={() => (tab = 'research')} title="AoTD Vaults of Knowledge: the mod's own techs (its own tree in VoK's research screen); quests unlock or grant them">Research ({m.research?.techs.length ?? 0})</button>{/if}
    </div>
  </div>
  <!-- #67 U20: the explanation below the tabs (in the tab row it squeezed the tabs into two lines) -->
  {#if tab === 'board'}<div class="tabhelp muted small">One lane per questline: <span class="k req">blue</span> a prerequisite, <span class="k st">green</span> one quest starts or goes on in another, <span class="k un">gold</span> a flag one quest sets that another's start needs. Click a card for the flags it shares with other quests; double-click opens it.</div>{/if}
  </div>

  {#if !m}
    <div class="center muted">Pick or create an active mod first.</div>
  {:else if tab === 'board'}
    <div class="boardwrap" class:withside={!!boardSel}>
    <div class="board">
      <SvelteFlow bind:nodes bind:edges {nodeTypes} colorMode="dark" minZoom={0.2} nodesConnectable={false} nodesDraggable={false} zoomOnDoubleClick={false}
        onnodeclick={({ node, event }) => { if (node.type !== 'card') return; if ((event as MouseEvent).detail === 2) app.go('quests', node.id); else boardSel = boardSel === node.id ? null : node.id }}
        onpaneclick={() => (boardSel = null)} proOptions={{ hideAttribution: true }}>
        <Background gap={20} />
        <Controls showLock={false} />
        <!-- #67 U19: fitted when it fits at 70%, else its top-left corner at 70% -->
        <FlowApi onReady={(api) => setTimeout(() => api.opening('top'), 150)} />
      </SvelteFlow>
      {#if !m.quests.length}<div class="overlay muted">No quests yet. Create one on the Quests page.</div>{/if}
    </div>
    {#if boardSel}
      {@const q = m.quests.find((x) => x.id === boardSel)}
      {@const ins = lines.links.filter((l) => l.to === boardSel)}
      {@const outs = lines.links.filter((l) => l.from === boardSel)}
      <!-- #67 U19: the selected quest: its story links and the flags it shares -->
      <aside class="bside">
        <div class="bh"><b>{q?.title ?? boardSel}</b><button class="mini" onclick={() => app.go('quests', boardSel)}>Open</button></div>
        <div class="bsect">Comes after</div>
        {#each ins as l (l.from + l.kind)}<div class="row1"><button class="lnk" onclick={() => (boardSel = l.from)}>{titleOf(l.from)}</button><span class="muted">{linkText(l, true)}</span></div>{:else}<div class="muted">Nothing: available from the start (its own start conditions apply).</div>{/each}
        <div class="bsect">Leads to</div>
        {#each outs as l (l.to + l.kind)}<div class="row1"><button class="lnk" onclick={() => (boardSel = l.to)}>{titleOf(l.to)}</button><span class="muted">{linkText(l, false)}</span></div>{:else}<div class="muted">No other quest.</div>{/each}
        <div class="bsect">Flags shared with other quests (dashed on the board)</div>
        {#each sharedFlags as f (f.dir + f.key)}
          <div class="flag"><span class="mono">{f.key.replace(/^\$global\./, '')}</span> <span class="muted">{f.dir === 'sets' ? 'set here, read by' : 'read here, set by'}</span>
            <span class="others">{#each f.others as o (o)}<button class="lnk chipl" onclick={() => (boardSel = o)}>{titleOf(o)}</button>{/each}</span></div>
        {:else}<div class="muted">None.</div>{/each}
      </aside>
    {/if}
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
              <td class="mono">{e.key}{#if e.generated} <span class="badge">generated</span>{/if}{#if e.setting} <button class="badge setb" title="One of the mod's settings ({e.setting}): SagaLib sets it on every load, the player changes it in LunaLib's menu. Open Saga › Settings." onclick={() => (tab = 'settings')}>setting</button>{/if}</td>
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
        <p class="muted small pad">A saved game situation. It sets up Play mode, and with the game's dev mode on, SagaLib can apply it at a new game or from its dev menu (needs SagaLib).</p>
      </div>
      <div class="scroll pad">
        {#if prof}
          <div class="grid2">
            <Field label="Name" for="tp-n" help="Shown in Play mode's profile list and in SagaLib's dev menu in game.">
              <input id="tp-n" type="text" value={prof.name} onchange={(e) => {
                const v = e.currentTarget.value
                // walk F27: a profile's id follows its name (dev mode only, never in a release)
                const nid = uniqueId(slug(v) || 'profile', (m?.testProfiles ?? []).filter((x) => x.id !== prof.id).map((x) => x.id))
                edProf((p) => { p.name = v; p.id = nid })
                app.selected.profile = nid
              }} />
            </Field>
            <Field label="Id" help="How SagaLib names the profile in its log."><span class="mono">{prof.id}</span></Field>
          </div>
          <div class="sect2">Quests</div>
          <p class="f-help">Where each quest stands when the profile is applied: not started, running at a stage, or already ended.</p>
          <table class="t">
            <tbody>
              {#each m.quests.filter((q) => q.kind === 'quest') as q (q.id)}
                {@const s = prof.quests[q.id]}
                <tr><td>{q.title}</td>
                  <td><select value={s?.state ?? 'not-started'} onchange={(e) => { const v = e.currentTarget.value as 'not-started'; edProf((p) => { if (v === 'not-started') delete p.quests[q.id]; else p.quests[q.id] = { state: v, step: p.quests[q.id]?.step ?? q.stages[0]?.id } }) }}>
                    <option value="not-started">not started</option><option value="active">active</option><option value="success">succeeded</option><option value="fail">failed</option></select></td>
                  <td>{#if s && s.state === 'active'}<select value={s.step ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.quests[q.id].step = v || undefined }) }}><option value="">— stage —</option>{#each q.stages as st (st.id)}<option value={st.id}>{st.title}</option>{/each}{#if s.step && !q.stages.some((st) => st.id === s.step)}<option value={s.step}>{s.step} (missing)</option>{/if}</select>{/if}</td></tr>
              {/each}
            </tbody>
          </table>
          <div class="sect2">Flags</div>
          <p class="f-help">Memory keys and the values they get (e.g. $global.vgc_signal_heard = true).</p>
          {#each Object.entries(prof.flags) as [k, v] (k)}
            <div class="row"><span class="mono">{k}</span><input type="text" value={v} onchange={(e) => { const x = e.currentTarget.value; edProf((p) => { p.flags[k] = x }) }} /><button class="mini" onclick={() => edProf((p) => { delete p.flags[k] })}>✕</button></div>
          {/each}
          <div class="row"><IdInput value={newFlag} options={[...reg.keys()].map((k) => ({ id: k }))} placeholder="$global.key" onCommit={(v) => (newFlag = v)} /><button class="mini" onclick={() => { const k = newFlag.trim(); if (k) { edProf((p) => { p.flags[k] = 'true' }); newFlag = '' } }}>+ flag</button></div>
          <div class="sect2">Player</div>
          <div class="grid2">
            <Field label="Credits" for="tp-c" help="The player's credits. Empty: unchanged.">
              <input id="tp-c" type="number" value={prof.player.credits ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.credits = v === '' ? undefined : Number(v) }) }} />
            </Field>
            <Field label="Story points" for="tp-s" help="The player's story points. Empty: unchanged.">
              <input id="tp-s" type="number" value={prof.player.storyPoints ?? ''} onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.storyPoints = v === '' ? undefined : Number(v) }) }} />
            </Field>
            <Field label="Commission" help="The faction the player holds a commission with. Empty: none.">
              <IdInput value={prof.player.commission ?? ''} options={factions} placeholder="(none)" onCommit={(v) => edProf((p) => { p.player.commission = v || undefined })} />
            </Field>
            <Field label="Start at" for="tp-sa" help="An entity or market id: with dev mode on, the profile puts the player's fleet there, at a new game or (SagaLib 1.2) from the Ctrl+F9 dev menu mid-game.">
              <input id="tp-sa" type="text" class="mono" value={prof.player.startAt ?? ''} placeholder="e.g. vgc_haven" onchange={(e) => { const v = e.currentTarget.value; edProf((p) => { p.player.startAt = v || undefined }) }} />
            </Field>
            <Field label="Reputation" ref="general-rep-levels" help="Faction and relation from -1 to 1 (0.5 = Welcoming…). Others are left as they are.">
              <div>{#each Object.entries(prof.player.rep ?? {}) as [f, r] (f)}<div class="row"><span class="mono">{f}</span><input type="number" step="0.05" min="-1" max="1" value={r} onchange={(e) => { const v = Number(e.currentTarget.value); edProf((p) => { p.player.rep![f] = v }) }} /><button class="mini" onclick={() => edProf((p) => { delete p.player.rep![f] })}>✕</button></div>{/each}
                <IdInput value="" options={factions} placeholder="+ faction" clearOnCommit onCommit={(v) => { if (v) edProf((p) => { (p.player.rep ??= {})[v] = 0.5 }) }} /></div>
            </Field>
            <Field label="Cargo" help="Items put in the player's cargo, with quantities.">
              <div>{#each prof.player.cargo ?? [] as c, i (i)}<div class="row"><span class="mono">{c.item}</span><input type="number" value={c.qty} onchange={(e) => { const v = Number(e.currentTarget.value); edProf((p) => { p.player.cargo![i].qty = v }) }} /><button class="mini" onclick={() => edProf((p) => { p.player.cargo!.splice(i, 1) })}>✕</button></div>{/each}
                <IdInput value="" options={items} placeholder="+ item" clearOnCommit onCommit={(v) => { if (v) edProf((p) => { p.player.cargo ??= []; p.player.cargo.push({ item: v, qty: 1 }) }) }} /></div>
            </Field>
          </div>
          <p><button class="mini danger" onclick={() => { const id = prof.id; project.change((mm) => { mm.testProfiles = mm.testProfiles.filter((p) => p.id !== id) }); app.selected.profile = null }}>Delete profile</button></p>
        {:else}<div class="muted">No test profile selected.</div>{/if}
      </div>
    </div>
  {:else if tab === 'pools'}
    <PoolsPanel {templates} />
  {:else if tab === 'scatter'}
    <ScatterPanel />
  {:else if tab === 'events'}
    <EventsPanel {templates} />
  {:else if tab === 'progress'}
    <ProgressPanel {templates} />
  {:else if tab === 'mods'}
    <ModsPanel />
  {:else if tab === 'settings'}
    <SettingsPanel />
  {:else if tab === 'achievements'}
    <AchievementsPanel />
  {:else if tab === 'questskip'}
    <QuestSkipPanel />
  {:else if tab === 'research'}
    <ResearchPanel />
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
  /* #67 U19: the board and, with a card selected, its side panel */
  .boardwrap { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .boardwrap.withside { grid-template-columns: minmax(0, 1fr) 300px; }
  .bside { border-left: 1px solid var(--border); background: var(--panel); overflow: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  .bh { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-bottom: 4px; }
  .bsect { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding-top: 8px; }
  .lnk { border: none; background: none; color: var(--accent); padding: 0; font-size: inherit; cursor: pointer; text-align: left; }
  .k { font-weight: 600; } .k.req { color: #4fb3ff; } .k.st { color: #6fd07a; } .k.un { color: #e0b050; }
  .row1 { display: flex; flex-direction: column; padding: 2px 0; }
  .flag { padding: 3px 0; border-bottom: 1px solid #1c232d; }
  .others { display: flex; flex-wrap: wrap; gap: 3px 4px; margin-top: 2px; }
  .lnk.chipl { border: 1px solid var(--border); border-radius: 9px; padding: 0 7px; font-size: 11px; }
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
  .setb { border-color: var(--good); color: var(--good); background: none; cursor: pointer; }
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 4px; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 420px); gap: 2px 10px; align-items: center; }
  p.f-help { margin: 0 0 4px; }
  .tabhelp { padding: 3px 12px 4px; border-bottom: 1px solid var(--border); }
  .row { display: flex; gap: 6px; align-items: center; margin-bottom: 3px; font-size: 12px; }
  .row input { padding: 2px 6px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .bad { color: var(--bad); } .good { color: var(--good); }
  :global(.svelte-flow__node-card) { padding: 0; border: none; background: transparent; }
</style>
