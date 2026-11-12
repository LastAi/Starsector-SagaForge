<script lang="ts">
  /** People (PLAN.md §4.2, mock-up people.html): the mod's characters, their phrases; existing characters read-only. */
  import type { PersonDef, Phrase, Placement } from '../../../shared/model'
  import { slug, uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { personLook, makePlayContext, factionLook } from '../state/testctx.svelte'
  import { Engine, compileRules } from '../../../shared/rules/engine'
  import { phraseText } from '../../../shared/play'
  import ImageView from '../ui/ImageView.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Modal from '../ui/Modal.svelte'
  import PhraseEditor from '../quests/PhraseEditor.svelte'
  import { conditionTemplates } from '../quests/edit'

  const m = $derived(project.m)
  const index = $derived(app.index!)
  let filter = $state('')
  const sel = $derived(app.selected.people ?? null)
  const person = $derived(m?.people.find((p) => p.id === sel) ?? null)
  const existing = $derived(!person && sel ? index.people.find((p) => p.id === sel) ?? null : null)
  const match = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase())
  const srcName = (id: string): string => (id.startsWith('code:') ? `code (${srcName(id.slice(5))})` : id === 'starsector-core' ? 'vanilla' : index.sources.find((s) => s.id === id)?.name ?? id)
  const ed = (fn: (p: PersonDef) => void) => { const id = sel; project.change((mm) => { const p = mm.people.find((x) => x.id === id); if (p) fn(p) }) }
  const factions = $derived([...(m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id, name: String((f as { raw: Record<string, unknown> }).raw.displayName ?? f.id) })) ?? []), ...index.factions])
  const markets = $derived([...(m?.systems.flatMap((s) => s.entities.flatMap((e) => (e.market ? [{ id: e.market.id, name: `${e.market.name} (this mod)` }] : []))) ?? []), ...index.markets])
  const templates = $derived(conditionTemplates(null, factions.map((f) => f.id), m?.quests ?? []))

  // ---- new person
  let showNew = $state(false)
  let first = $state('')
  let last = $state('')
  const newId = $derived(project.prefix + slug(last || first))
  function create() {
    let id = newId
    if (!id || id === project.prefix) return
    id = uniqueId(id, [...(m?.people.map((p) => p.id) ?? []), ...index.people.map((p) => p.id)])
    const faction = m?.factions.find((f) => f.kind === 'addition')?.id ?? 'independent'
    project.change((mm) => {
      mm.people.push({ id, name: { first: first.trim(), last: last.trim() }, gender: 'FEMALE', faction, rank: 'spaceCommander', post: 'stationCommander', portrait: '', placement: { at: 'none' }, tags: [], phrases: [] })
    })
    app.selected.people = id
    showNew = false; first = ''; last = ''
  }
  async function pickPortrait() {
    const abs = await window.api.pickFile({ title: 'Choose a portrait (PNG, 128×128 like vanilla)', filters: [{ name: 'PNG images', extensions: ['png'] }] })
    if (!abs || !person) return
    const to = project.copyIn(abs, `graphics/portraits/${person.id}.png`)
    ed((p) => { p.portrait = to })
  }
  function remove() {
    if (!person || !confirm(`Delete ${person.name.first} ${person.name.last}? Quests that use them will show errors.`)) return
    const id = person.id
    project.change((mm) => { mm.people = mm.people.filter((p) => p.id !== id) })
    app.selected.people = null
  }
  function setPlacement(at: Placement['at']) {
    ed((p) => { p.placement = at === 'market' ? { at, market: '', inCommDirectory: true } : at === 'fleet' ? { at, encounter: '' } : { at: 'none' } })
  }
  function addPhrase() {
    const id = sel
    if (!id) return
    ed((p) => { p.phrases.push({ token: `$${id}_${uniqueId('phrase', p.phrases.map((x) => x.token.replace(`$${id}_`, '')))}`, owner: id, mode: 'first-match', cases: [{ when: [], text: '' }], otherwise: '' }) })
  }

  // ---- used by (feeds the save warnings when an id changes)
  const usedBy = $derived.by(() => {
    const id = sel
    if (!id || !m) return []
    const out: { where: string; quest?: string; node?: string }[] = []
    for (const q of m.quests) {
      if (q.start.kind === 'contact' && q.start.person === id) out.push({ where: `${q.title}: offers it`, quest: q.id })
      for (const n of q.nodes) if (n.type === 'dialog' && (n.speaker === id || (n.visual.kind === 'person' && (n.visual.person === id || n.visual.second === id || n.visual.third === id)))) out.push({ where: `${q.title}: ${n.title || n.id}`, quest: q.id, node: n.id })
    }
    for (const e of m.encounters) if (e.fleet.flagshipCommander === id) out.push({ where: `encounter ${e.name}: commands the flagship` })
    for (const s of m.systems) for (const en of s.entities) if (en.market?.people.includes(id)) out.push({ where: `market ${en.market.name}` })
    return out
  })

  // ---- phrase preview in three situations (PITCH 2b step 3)
  const situations = [
    { label: 'No commission, neutral', setup: () => ({}) },
    { label: 'Friendly with the faction', setup: (f: string) => ({ rep: { [f]: 0.6 } }) },
    { label: 'Commissioned with the faction', setup: (f: string) => ({ commission: f, rep: { [f]: 0.6 } }) }
  ]
  const phrasePreview = $derived.by(() => {
    if (!person) return []
    return situations.map((s) => {
      const ctx = makePlayContext()
      const extra = s.setup(person.faction) as { rep?: Record<string, number>; commission?: string }
      Object.assign(ctx.player.rep, extra.rep ?? {})
      if (extra.commission) { ctx.player.commission = extra.commission; ctx.memory.set('$player.commissionFactionId', extra.commission) }
      const e = new Engine(compileRules([]), ctx)
      return { label: s.label, texts: person.phrases.map((p) => `${p.token} → "${e.subst(phraseText(e, p as Phrase).text)}"`) }
    })
  })
  const rankName = (id: string) => app.defs.ranks.find((r) => r.id === id)?.name ?? id
</script>

<div class="page">
  <aside class="left">
    <input class="search" type="search" placeholder="Filter people…" bind:value={filter} />
    <div class="scroll">
      <div class="sect">This mod's people <button disabled={!m} onclick={() => (showNew = true)}>+ New person</button></div>
      <ul class="list">
        {#each (m?.people ?? []).filter((p) => match(`${p.id} ${p.name.first} ${p.name.last}`)) as p (p.id)}
          <li class:on={sel === p.id}><button class="li" onclick={() => (app.selected.people = p.id)}><ImageView path={p.portrait} w={22} h={22} /> {p.name.first} {p.name.last} <span class="badge b-new">new</span><span class="sub">{rankName(p.rank)}</span></button></li>
        {:else}<li class="muted small pad">{m ? 'None yet.' : 'Pick an active mod first.'}</li>{/each}
      </ul>
      <div class="sect">Existing characters (read-only)</div>
      <ul class="list ro">
        {#each index.people.filter((p) => match(`${p.id} ${p.name}`)) as p (p.id)}
          <li class:on={sel === p.id}><button class="li" onclick={() => (app.selected.people = p.id)}>{p.name}<span class="sub">{srcName(p.definedBy)}</span></button></li>
        {/each}
      </ul>
    </div>
  </aside>
  <section class="main">
    {#if person}
      <div class="head"><ImageView path={person.portrait} w={40} h={40} /><h2>{person.name.first} {person.name.last}</h2><span class="badge b-new">new</span><span class="mono muted">{person.id}</span>
        <span class="spacer"></span><span class="muted small">exported to <span class="mono">data/sagaforge/people/</span> (SagaLib creates and places them)</span><button class="mini danger" onclick={remove}>Delete</button></div>
      <div class="cols">
        <div class="body">
          <div class="grid2">
            <label for="pp-f">First name</label><input id="pp-f" type="text" value={person.name.first} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.name.first = v }) }} />
            <label for="pp-l">Last name</label><input id="pp-l" type="text" value={person.name.last} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.name.last = v }) }} />
            <label for="pp-g">Gender</label><select id="pp-g" value={person.gender} onchange={(e) => { const v = e.currentTarget.value as PersonDef['gender']; ed((p) => { p.gender = v }) }}><option value="FEMALE">female</option><option value="MALE">male</option><option value="ANY">any</option></select>
            <span class="lbl">Faction</span><IdInput value={person.faction} options={factions} strict onCommit={(v) => ed((p) => { p.faction = v })} />
            <span class="lbl">Rank</span><IdInput value={person.rank} options={app.defs.ranks} onCommit={(v) => ed((p) => { p.rank = v })} />
            <span class="lbl" title="At a market, a staff post (station commander, base commander, portmaster, supply officer, administrator) replaces vanilla's generated person in that post. Station, base and outpost commanders and administrators can offer commissions if the faction does.">Post</span><IdInput value={person.post} options={app.defs.posts} onCommit={(v) => ed((p) => { p.post = v })} />
            <span class="lbl">Portrait</span>
            <div class="row"><ImageView path={person.portrait} w={64} h={64} /><div class="col">
              <IdInput value={person.portrait} options={index.portraits.map((x) => ({ id: x.path }))} placeholder="game portrait path (referenced, not copied)" onCommit={(v) => ed((p) => { p.portrait = v })} />
              <button onclick={pickPortrait}>Use my own image…</button></div></div>
            <label for="pp-v">Voice</label><select id="pp-v" value={person.voice ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.voice = v || undefined }) }}><option value="">—</option>{#each app.defs.voices as v (v)}<option value={v}>{v}</option>{/each}</select>
            <label for="pp-pe">Personality</label><select id="pp-pe" value={person.personality ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.personality = v || undefined }) }}><option value="">—</option>{#each app.defs.personalities as v (v)}<option value={v}>{v}</option>{/each}</select>
          </div>
          <div class="sect2">Placement</div>
          <div class="grid2">
            <label for="pp-pl">Where</label>
            <select id="pp-pl" value={person.placement.at} onchange={(e) => setPlacement(e.currentTarget.value as Placement['at'])}><option value="market">at a market</option><option value="fleet">commanding a fleet (encounter)</option><option value="none">nowhere until a quest needs them</option></select>
            {#if person.placement.at === 'market'}
              {@const pl = person.placement}
              <span class="lbl">Market</span><IdInput value={pl.market} options={markets} strict onCommit={(v) => ed((p) => { if (p.placement.at === 'market') p.placement.market = v })} />
              <span></span><label class="chk"><input type="checkbox" checked={pl.inCommDirectory} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { if (p.placement.at === 'market') p.placement.inCommDirectory = v }) }} /> in the comm directory</label>
            {:else if person.placement.at === 'fleet'}
              {@const pl = person.placement}
              <span class="lbl">Encounter</span><select value={pl.encounter} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { if (p.placement.at === 'fleet') p.placement.encounter = v }) }}><option value="">—</option>{#each m?.encounters ?? [] as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
            {/if}
          </div>
          <div class="sect2">Contact</div>
          <div class="grid2">
            <label for="pp-c">Contact</label><input id="pp-c" type="checkbox" checked={!!person.contact} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { p.contact = v ? { types: ['military'], importance: 'MEDIUM' } : undefined }) }} />
            {#if person.contact}
              <span class="lbl">Types</span>
              <div class="chips">{#each app.defs.contactTypes as t (t)}<label class="chk"><input type="checkbox" checked={person.contact.types.includes(t)} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { if (!p.contact) return; p.contact.types = v ? [...p.contact.types, t] : p.contact.types.filter((x) => x !== t) }) }} /> {t}</label>{/each}</div>
              <label for="pp-i">Importance</label><select id="pp-i" value={person.contact.importance} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { if (p.contact) p.contact.importance = v }) }}>{#each app.defs.importance as i (i)}<option value={i}>{i}</option>{/each}</select>
            {/if}
          </div>
          <div class="sect2">Phrases <button class="mini" onclick={addPhrase}>+ Phrase</button></div>
          <p class="muted small">How this character words things: their title for you, farewells, moods. Use the token in any text; SagaLib fills it in game.</p>
          {#each person.phrases as ph, i (i)}
            <PhraseEditor phrase={ph} {templates} tokenEditable onChange={(np) => ed((p) => { p.phrases[i] = { ...np, token: np.token.startsWith(`$${person.id}_`) ? np.token : `$${person.id}_${slug(np.token.replace(/^\$/, ''))}` } })} onRemove={() => ed((p) => { p.phrases.splice(i, 1) })} />
          {/each}
          <div class="sect2">Description</div>
          <textarea rows="3" value={person.description ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.description = v || undefined }) }}></textarea>
        </div>
        <div class="side">
          <div class="sect2">Preview</div>
          <div class="pcard"><ImageView path={person.portrait} w={128} h={128} /><div><b>{personLook(person.id)?.name}</b><div class="muted">{personLook(person.id)?.rank}</div><div style="color:{(() => { const c = factionLook(person.faction)?.color; return c ? `rgb(${c[0]},${c[1]},${c[2]})` : 'inherit' })()}">{personLook(person.id)?.faction}</div></div></div>
          {#if person.phrases.length}
            {#each phrasePreview as s (s.label)}<div class="sit"><div class="muted small">{s.label}</div>{#each s.texts as t (t)}<div class="mono small">{t}</div>{/each}</div>{/each}
          {/if}
          <div class="sect2">Used by</div>
          {#each usedBy as u, i (i)}<button class="lnk" onclick={() => { if (u.quest) { app.go('quests', u.quest); app.selected.questNode = u.node ?? null } }}>{u.where}</button>{:else}<div class="muted small">Not used yet.</div>{/each}
        </div>
      </div>
    {:else if existing}
      <div class="center"><div class="card">
        <h2>{existing.name}</h2><div class="mono muted">{existing.id}</div>
        <div class="muted">{existing.kind === 'code' ? `Defined in code by ${srcName(existing.definedBy)}` : `Defined by ${srcName(existing.definedBy)}`}{existing.faction ? ` · ${existing.faction}` : ''}{existing.market ? ` · at ${existing.market}` : ''}. Read-only: the mod can add dialog with them (use the id in a quest), but never changes them.</div>
      </div></div>
    {:else}
      <div class="center muted">Pick a person, or create one.</div>
    {/if}
  </section>
</div>

{#if showNew}
  <Modal title="New person" onClose={() => (showNew = false)}>
    <div class="grid2">
      <label for="np-f">First name</label><input id="np-f" type="text" bind:value={first} placeholder="Ilse" />
      <label for="np-l">Last name</label><input id="np-l" type="text" bind:value={last} placeholder="Reyes" />
      <span class="lbl">Id</span><span class="mono">{newId}</span>
    </div>
    {#snippet actions()}<button onclick={() => (showNew = false)}>Cancel</button><button class="primary" disabled={!first.trim() && !last.trim()} onclick={create}>Create</button>{/snippet}
  </Modal>
{/if}

<style>
  .page { display: grid; grid-template-columns: 300px minmax(0, 1fr); height: 100%; min-height: 0; }
  .left { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
  .scroll { overflow: auto; flex: 1; }
  .search { margin: 8px 10px 4px; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list.ro { opacity: .75; }
  .li { display: flex; gap: 7px; align-items: center; width: 100%; border: none; background: none; padding: 3px 8px; text-align: left; white-space: nowrap; overflow: hidden; }
  .li .sub { color: var(--muted); font-size: 11px; margin-left: auto; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .head h2 { margin: 0; font-size: 15px; }
  .spacer { flex: 1; }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: 0; flex: 1; }
  .body { padding: 12px 14px; overflow: auto; }
  .side { padding: 10px 12px; overflow: auto; border-left: 1px solid var(--border); background: var(--panel); }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 5px 10px; align-items: center; max-width: 620px; }
  .grid2 label, .lbl { color: var(--muted); font-size: 12px; }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; }
  .row { display: flex; gap: 8px; align-items: center; }
  .col { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chk { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: center; }
  .sect2 button { text-transform: none; }
  textarea { width: 100%; resize: vertical; }
  .pcard { display: flex; gap: 10px; align-items: flex-end; background: #000; padding: 8px; border-radius: 4px; }
  .sit { margin-top: 8px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; }
  .lnk { display: block; border: none; background: none; padding: 1px 0; color: var(--accent); text-align: left; font-size: 12px; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid; line-height: 16px; }
  .b-new { color: var(--good); border-color: #2f6b38; background: #15261a; }
  .center { display: grid; place-items: center; height: 100%; text-align: center; padding: 20px; }
  .card { max-width: 480px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .pad { padding: 4px 10px; }
</style>
