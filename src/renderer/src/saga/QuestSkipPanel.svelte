<script lang="ts">
  /**
   * #65 (PLAN.md §10, "Nexerelin: quest skip"): Saga › Quest skip. The mod's quest chains on
   * Nexerelin's new-game "skip quests" screen, exported into data/config/exerelin/questSkip.json. Per
   * quest the designer picks the ending a skip means; the panel shows what that ending sets (computed
   * along the path from the Start node) and gives, and what a skip doesn't do.
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { NEXERELIN_ID, useOf } from '../../../shared/modlist'
  import { slug, uniqueId } from '../../../shared/quest'
  import type { QuestSkipChain, QuestSkipPlan, Reward } from '../../../shared/model'
  import { defaultEnding, needsInChain, questSkipJson, SKIP_NAME_MAX, skipEndings, skipFlags } from '../../../shared/questskip'
  import Field from '../ui/Field.svelte'

  const m = $derived(project.m!)
  const chains = $derived(m.project.questSkip ?? [])
  const sel = $derived(app.selected.skipChain ?? chains[0]?.id ?? null)
  const cur = $derived(chains.find((c) => c.id === sel) ?? null)
  const selQuest = $derived(app.selected.skipQuest ?? cur?.quests[0]?.quest ?? null)
  const entry = $derived(cur?.quests.find((x) => x.quest === selQuest) ?? null)
  const entryQuest = $derived(entry ? m.quests.find((q) => q.id === entry.quest) ?? null : null)
  const nex = $derived(useOf(m.project, NEXERELIN_ID))
  const installed = $derived(!!app.index?.sources.some((s) => s.id === NEXERELIN_ID))
  const inChains = $derived(new Set(chains.flatMap((c) => c.quests.map((x) => x.quest))))
  const addable = $derived(m.quests.filter((q) => q.kind === 'quest' && !inChains.has(q.id)))
  const preview = $derived(questSkipJson(m))

  const edChain = (fn: (c: QuestSkipChain) => void) => { const id = sel; project.change((mm) => { const c = mm.project.questSkip?.find((x) => x.id === id); if (c) fn(c) }) }
  const edEntry = (fn: (x: QuestSkipPlan) => void) => { const id = sel, q = selQuest; project.change((mm) => { const x = mm.project.questSkip?.find((c) => c.id === id)?.quests.find((y) => y.quest === q); if (x) fn(x) }) }

  function addChain() {
    const id = uniqueId(`${m.project.prefix}quests`, chains.map((c) => c.id))
    const icon = m.quests.find((q) => q.kind === 'quest' && q.icon)?.icon ?? 'graphics/icons/missions/data_retrieval.png'
    project.change((mm) => { (mm.project.questSkip ??= []).push({ id, name: project.loaded?.modInfo.name ?? 'Quests', image: icon, quests: [] }) })
    app.selected.skipChain = id
    app.selected.skipQuest = null
  }
  function removeChain() {
    const c = cur
    if (!c || (c.quests.length && !confirm(`Delete the chain "${c.name}" with its ${c.quests.length} quest${c.quests.length === 1 ? '' : 's'}? The quests themselves stay.`))) return
    project.change((mm) => { mm.project.questSkip = (mm.project.questSkip ?? []).filter((x) => x.id !== c.id) })
    app.selected.skipChain = null
  }
  function setChainId(v: string) {
    const c = cur
    if (!c) return
    const p = m.project.prefix
    const nid = v.trim().startsWith(p) ? slug(v.trim()) : `${p}${slug(v.trim())}`
    if (!nid || nid === c.id) return
    if (chains.some((x) => x.id === nid)) { app.error = `Another chain already has the id ${nid}.`; return }
    edChain((x) => { x.id = nid })
    app.selected.skipChain = nid
  }
  /** Adds a quest and, before it, the quests it needs that aren't in a chain yet (in the order they are needed). */
  function addQuest(id: string) {
    if (!id || !cur) return
    const order: string[] = []
    const visit = (qid: string) => {
      if (order.includes(qid) || inChains.has(qid)) return
      const q = m.quests.find((x) => x.id === qid)
      if (!q || q.kind !== 'quest') return
      for (const r of q.requires) if ('quest' in r) visit(r.quest)
      order.push(qid)
    }
    visit(id)
    edChain((c) => { for (const qid of order) { const q = m.quests.find((x) => x.id === qid)!; c.quests.push({ quest: qid, ending: defaultEnding(q) }) } })
    app.selected.skipQuest = id
    if (order.length > 1) app.flash(`Added ${order.length} quests: the ones "${m.quests.find((x) => x.id === id)?.title}" needs come first.`)
  }
  function moveQuest(d: -1 | 1) {
    const i = cur?.quests.findIndex((x) => x.quest === selQuest) ?? -1
    if (!cur || i < 0 || i + d < 0 || i + d >= cur.quests.length) return
    edChain((c) => { [c.quests[i], c.quests[i + d]] = [c.quests[i + d], c.quests[i]] })
  }
  function removeQuest() {
    const q = selQuest
    edChain((c) => { c.quests = c.quests.filter((x) => x.quest !== q) })
    app.selected.skipQuest = null
  }
  async function pickImage() {
    const [p] = await chooseImages('missionIcon', { current: cur?.image, title: 'The chain\'s image on Nexerelin\'s skip screen' })
    if (p) edChain((c) => { c.image = p })
  }
  const shown = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
  function rewardText(r: Reward): string {
    const parts: string[] = []
    if (r.credits) parts.push(`${r.credits.toLocaleString('en-US')} credits${r.creditsScale ? ' (scaled by a setting)' : ''}`)
    for (const x of r.rep ?? []) parts.push(`${x.amount > 0 ? '+' : ''}${x.amount} with ${x.faction}`)
    for (const x of r.personRep ?? []) parts.push(`${x.amount > 0 ? '+' : ''}${x.amount} with ${x.person}`)
    for (const x of r.items ?? []) parts.push(`${x.qty} × ${x.item}`)
    for (const s of r.ships ?? []) parts.push(`ship ${s}`)
    for (const l of r.loot ?? []) parts.push(`random items (${l.group})`)
    if (r.xp) parts.push(`${r.xp} XP`)
    if (r.storyPoints) parts.push(`${r.storyPoints} story point${r.storyPoints === 1 ? '' : 's'}`)
    return `${r.id.startsWith('skip_') ? 'on the way' : `reward ${r.id}`}: ${parts.join(', ') || 'nothing'}`
  }
  function openQuest(id: string) { app.go('quests', id) }
</script>

<div class="split">
  <div class="side">
    <div class="sect">Quest chains <button class="mini" onclick={addChain} title="A new chain on Nexerelin's skip screen">+ Add</button></div>
    <ul class="list">
      {#each chains as c (c.id)}
        <li class:on={c.id === sel}><button class="li" onclick={() => { app.selected.skipChain = c.id; app.selected.skipQuest = null }}>
          <span class="nm">{c.name || c.id}</span><span class="sub">{c.quests.length} quest{c.quests.length === 1 ? '' : 's'}</span>
        </button></li>
      {:else}<li class="muted small pad">No chains yet. A chain is a questline: one button per quest.</li>{/each}
    </ul>
  </div>

  <div class="scroll pad">
    <p class="muted small intro">Nexerelin's new game has a <b>skip quests</b> screen: one row per questline, one button per quest. A player who already played the story can skip it and start where it ends. Export writes <span class="mono">data/config/exerelin/questSkip.json</span>. For each quest pick the ending a skip means; Saga Forge works out what that ending leaves in memory (the path from the Start node to it), so later quests are offered as if it was played. SagaLib's plugin makes Nexerelin set those flags and gives the ending's rewards at the start.</p>
    <div class="row status">
      <span>Nexerelin: <b class:good={nex === 'required' || nex === 'optional'}>{nex === 'required' ? 'required' : nex === 'incompatible' ? 'marked incompatible' : 'optional'}</b></span>
      <span class="muted small">{nex === 'required' ? 'In mod_info.json dependencies (Saga › Mods).' : 'Not in mod_info.json: without Nexerelin there is no skip screen and the file is never read.'}{nex === 'none' ? ' It isn\'t in the mod\'s list yet (Problems asks for it).' : ''}{installed ? '' : ' Nexerelin is not installed in your game.'}</span>
      {#if nex === 'none' && chains.length}<button class="mini" title="List Nexerelin in Saga › Mods as optional (nothing goes into mod_info.json)" onclick={() => project.change((mm) => { (mm.project.mods ??= []).push({ id: NEXERELIN_ID, name: 'Nexerelin', use: 'optional' }) })}>Add as optional</button>{/if}
      <button class="mini" onclick={() => (app.selected.sagaOpen = 'mods')}>Saga › Mods</button>
    </div>

    {#if cur}
      <div class="grid2">
        <Field label="Name" for="qs-n" help="The row's title on the skip screen.">
          <input id="qs-n" type="text" value={cur.name} onchange={(e) => { const v = e.currentTarget.value; edChain((c) => { c.name = v }) }} />
        </Field>
        <Field label="Id" for="qs-id" help="The chain's key in questSkip.json, shared by every mod (merged JSON): keep the prefix.">
          <input id="qs-id" type="text" class="mono" value={cur.id} onchange={(e) => setChainId(e.currentTarget.value)} />
        </Field>
        <Field label="Image" help="Next to the row's title. Nexerelin needs one (without it the chains after it don't load). A mission icon or a crest fits; the export lists it in the mod's settings.json so the game loads it.">
          <span class="row">{#if cur.image}<span class="mono">{cur.image}</span>{:else}<span class="bad">none</span>{/if}<button class="mini" onclick={pickImage}>Choose…</button></span>
        </Field>
        <Field label="Sort key" for="qs-s" help="Nexerelin sorts the rows by it (default: the name). Vanilla's rows use AAAA_…, so a key from B on comes after them.">
          <input id="qs-s" type="text" value={cur.sortKey ?? ''} placeholder={cur.name} onchange={(e) => { const v = e.currentTarget.value.trim(); edChain((c) => { if (v) c.sortKey = v; else delete c.sortKey }) }} />
        </Field>
        <Field label="Tooltip" for="qs-t" help="On hover over the row's title.">
          <textarea id="qs-t" rows="2" value={cur.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; edChain((c) => { if (v.trim()) c.tooltip = v; else delete c.tooltip }) }}></textarea>
        </Field>
      </div>

      <div class="sect2">Quests, in the order they are played</div>
      <div class="row">
        <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; addQuest(v) }} title="Adds the quest, and before it the quests it needs that aren't in a chain yet">
          <option value="">+ Add a quest…</option>{#each addable as q (q.id)}<option value={q.id}>{q.title}</option>{/each}
        </select>
        {#if entry}<button class="mini" onclick={() => moveQuest(-1)}>▲</button><button class="mini" onclick={() => moveQuest(1)}>▼</button><button class="mini danger" onclick={removeQuest}>Remove from chain</button>{/if}
      </div>
      <div class="buttons">
        {#each cur.quests as x (x.quest)}
          {@const q = m.quests.find((y) => y.id === x.quest)}
          {@const name = x.name?.trim() || q?.title || x.quest}
          <button class="qbtn" class:on={x.quest === selQuest} class:long={name.length > SKIP_NAME_MAX} title={x.tooltip || q?.title} onclick={() => (app.selected.skipQuest = x.quest)}>{name}</button>
        {:else}<span class="muted small">No quests yet.</span>{/each}
      </div>

      {#if entry && entryQuest}
        {@const fx = skipFlags(entryQuest, entry)}
        {@const endings = skipEndings(entryQuest)}
        {@const json = preview.quests[entry.quest] as { idsToForceOnWhenEnabled?: string[]; idsToForceOffWhenDisabled?: string[] } | undefined}
        <div class="grid2">
          <Field label="Quest" help="Open it on the Quests page."><button class="link" onclick={() => openQuest(entryQuest.id)}>{entryQuest.title}</button></Field>
          <Field label="On the button" for="qe-n" help={`Nexerelin's buttons fit about ${SKIP_NAME_MAX} characters ("Extract Researcher"). Empty: the quest's title.`}>
            <input id="qe-n" type="text" value={entry.name ?? ''} placeholder={entryQuest.title} onchange={(e) => { const v = e.currentTarget.value; edEntry((x) => { if (v.trim()) x.name = v; else delete x.name }) }} />
          </Field>
          <Field label="Tooltip" for="qe-t" help="On hover: what the player is taken to have done (Nexerelin's own say &quot;The player …&quot;).">
            <textarea id="qe-t" rows="2" value={entry.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; edEntry((x) => { if (v.trim()) x.tooltip = v; else delete x.tooltip }) }}></textarea>
          </Field>
          <Field label="A skip means" for="qe-e" help="The ending the player is taken to have reached. Its flags are worked out along the shortest path from the Start node to it.">
            <select id="qe-e" value={entry.ending} onchange={(e) => { const v = e.currentTarget.value; edEntry((x) => { x.ending = v; delete x.omit }) }}>
              {#if !endings.some((en) => en.node === entry.ending)}<option value={entry.ending}>(pick an ending)</option>{/if}
              {#each endings as en (en.node)}<option value={en.node}>{en.label}</option>{/each}
            </select>
          </Field>
          <Field label="Rewards" help="Give the rewards on the way to that ending when the game starts (SagaLib's plugin, after Nexerelin's time pass). Off: the flags only.">
            <label class="small"><input type="checkbox" checked={entry.rewards !== false} onchange={(e) => { const v = e.currentTarget.checked; edEntry((x) => { if (v) delete x.rewards; else x.rewards = false }) }} /> give them</label>
          </Field>
          <Field label="Nexerelin" help="Skipping a quest also skips the quests of this chain it needs; un-skipping it un-skips the ones that need it (worked out from the prerequisites).">
            <div class="small">
              <div>Also skips: {json?.idsToForceOnWhenEnabled?.length ? json.idsToForceOnWhenEnabled.map((id) => m.quests.find((q) => q.id === id)?.title ?? id).join(', ') : 'none'}</div>
              <div>Un-skipped with it: {json?.idsToForceOffWhenDisabled?.length ? json.idsToForceOffWhenDisabled.map((id) => m.quests.find((q) => q.id === id)?.title ?? id).join(', ') : 'none'}</div>
            </div>
          </Field>
        </div>

        {#if !fx.path}
          <p class="bad small">This ending can't be reached from the Start node: nothing can be worked out.</p>
        {:else}
          <div class="sect2">What a skip sets</div>
          <table class="flags">
            <thead><tr><th></th><th>Key</th><th>Value</th><th>From</th></tr></thead>
            <tbody>
              {#each fx.flags as f (f.key)}
                <tr class:off={f.omitted}>
                  <td>{#if !f.extra}<input type="checkbox" title="Set it (untick to leave it out)" checked={!f.omitted} onchange={(e) => { const on = e.currentTarget.checked; edEntry((x) => { const o = new Set(x.omit ?? []); if (on) o.delete(f.key); else o.add(f.key); if (o.size) x.omit = [...o]; else delete x.omit }) }} />{/if}</td>
                  <td class="mono">{f.key}</td><td class="mono">{shown(f.value)}</td><td class="muted">{f.from}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="sect2">More keys <button class="mini" onclick={() => edEntry((x) => { (x.extra ??= []).push({ key: '$global.', value: 'true' }) })}>+ Key</button></div>
          {#each entry.extra ?? [] as k, i (i)}
            <div class="row">
              <input type="text" class="mono" value={k.key} placeholder="$global.key" onchange={(e) => { const v = e.currentTarget.value; edEntry((x) => { x.extra![i].key = v }) }} />
              <span>=</span>
              <input type="text" class="mono short2" value={k.value} onchange={(e) => { const v = e.currentTarget.value; edEntry((x) => { x.extra![i].value = v }) }} />
              <button class="mini" onclick={() => edEntry((x) => { x.extra!.splice(i, 1); if (!x.extra!.length) delete x.extra })}>✕</button>
            </div>
          {:else}<p class="muted small">Keys the path doesn't set but a later quest (or another mod) reads: $global. or $player. keys.</p>{/each}

          <div class="sect2">What a skip gives</div>
          {#if entry.rewards === false}<p class="muted small">Nothing: rewards are off.</p>
          {:else}{#each fx.rewards as r (r.id)}<div class="small">{rewardText(r)}</div>{:else}<p class="muted small">No rewards on the way.</p>{/each}{/if}

          <div class="sect2">People to show <span class="muted small">(in their market's comm directory; for people the story hid)</span></div>
          <div class="row">
            <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) edEntry((x) => { x.unhide = [...new Set([...(x.unhide ?? []), v])] }) }}>
              <option value="">+ Person…</option>{#each m.people as p (p.id)}<option value={p.id}>{p.name.first} {p.name.last}</option>{/each}
            </select>
            {#each entry.unhide ?? [] as id (id)}<span class="chip">{id}<button class="mini" onclick={() => edEntry((x) => { x.unhide = (x.unhide ?? []).filter((y) => y !== id); if (!x.unhide.length) delete x.unhide })}>✕</button></span>{/each}
          </div>

          {#if fx.notes.length}
            <div class="sect2">What a skip doesn't do</div>
            <ul class="notes">{#each fx.notes as n (n)}<li>{n}</li>{/each}</ul>
          {/if}
        {/if}
      {/if}
      <p><button class="mini danger" onclick={removeChain}>Delete chain</button></p>
    {/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; height: 100%; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 4px; display: flex; gap: 8px; align-items: center; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; display: flex; flex-direction: column; }
  .sub { font-size: 10px; color: var(--muted); }
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .intro { max-width: 980px; margin: 0 0 8px; }
  .row { display: flex; gap: 8px; align-items: center; font-size: 12px; flex-wrap: wrap; margin: 2px 0; }
  .status { margin-bottom: 6px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 520px); gap: 2px 10px; align-items: center; margin-top: 10px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .link { border: none; background: none; padding: 0; color: var(--accent); cursor: pointer; text-align: left; justify-self: start; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; max-width: 980px; }
  .qbtn { width: 170px; padding: 4px 6px; font-size: 12px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qbtn.on { outline: 1px solid var(--accent-2); background: #1f2a38; }
  .qbtn.long { border-color: var(--warn); }
  table.flags { border-collapse: collapse; font-size: 12px; max-width: 980px; }
  table.flags th { text-align: left; font-weight: normal; color: var(--muted); font-size: 11px; padding: 2px 8px 2px 0; }
  table.flags td { padding: 1px 8px 1px 0; vertical-align: top; }
  tr.off td { opacity: .45; text-decoration: line-through; }
  input.short2 { width: 120px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 10px; padding: 0 2px 0 8px; font-size: 11px; }
  .notes { margin: 0; padding-left: 18px; font-size: 11px; color: var(--muted); max-width: 980px; }
</style>
