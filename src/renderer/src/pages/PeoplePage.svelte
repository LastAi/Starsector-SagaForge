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
  import Field from '../ui/Field.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { later } from '../ui/later'
  import { setPersonMarket } from '../../../shared/locations'
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
  let showNew = $state(app.smokeModal === 'new') // screenshot mode can open it
  let showInactive = $state(true)
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
  /** Choose by picture, or import one (cropped and resized to 128×128) (R28). */
  async function pickPortrait() {
    const [p] = await chooseImages('portrait', { current: person?.portrait })
    if (p) ed((x) => { x.portrait = p })
  }
  function remove() {
    if (!person || !confirm(`Delete ${person.name.first} ${person.name.last}? Quests that use them will show errors.`)) return
    const id = person.id
    project.change((mm) => { mm.people = mm.people.filter((p) => p.id !== id) })
    app.selected.people = null
  }
  function setPlacement(at: Placement['at']) {
    const id = sel
    if (!id) return
    // leaving a market also takes them off that market's people list (Locations page)
    project.change((mm) => {
      setPersonMarket(mm, id, null)
      const p = mm.people.find((x) => x.id === id)
      if (p) p.placement = at === 'market' ? { at, market: '', inCommDirectory: true } : at === 'fleet' ? { at, encounter: '' } : { at: 'none' }
    })
  }
  const setMarket = (market: string) => { const id = sel; if (id) project.change((mm) => setPersonMarket(mm, id, market || null)) }
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
  /** Vanilla's staff posts: a person of this mod in one takes it over from vanilla's generated person (SagaLib People.replaceGeneratedStaff). */
  const STAFF_POSTS = ['baseCommander', 'stationCommander', 'outpostCommander', 'portmaster', 'supplyOfficer', 'administrator']
  /** Posts whose holder offers a commission when the faction does (vanilla's Commission rules). */
  const COMMISSION_POSTS = ['baseCommander', 'stationCommander', 'outpostCommander', 'administrator']
  const postHelp = $derived.by(() => {
    const p = person?.post ?? ''
    const base = 'Their job at the market, shown as their title in the comm directory.'
    if (!STAFF_POSTS.includes(p)) return `${base} A staff post (station commander, portmaster, administrator, …) takes over that post from the person vanilla generates there.`
    // only this mod's new factions are known here; for others the help stays general
    const fac = m?.factions.find((f) => f.id === person?.faction && f.kind === 'addition') as { raw: { custom?: { offersCommissions?: boolean } } } | undefined
    const offers = fac ? fac.raw.custom?.offersCommissions === true : null
    const comm = COMMISSION_POSTS.includes(p)
      ? offers === false ? ` Can offer a commission, but ${person?.faction} has "Offers commissions" off (Factions › Behavior).` : ' Offers the player a commission when the faction does (Factions › Behavior › Offers commissions) and the player is Favorable or better.'
      : ''
    return `${base} A staff post: at their market they take it over, and vanilla's generated ${app.defs.posts.find((x) => x.id === p)?.name?.toLowerCase() ?? p} there leaves.${comm}`
  })
  const rankName = (id: string) => app.defs.ranks.find((r) => r.id === id)?.name ?? id
</script>

<div class="page">
  <aside class="left">
    <input class="search" type="search" placeholder="Filter people…" bind:value={filter} />
    <div class="scroll">
      <div class="sect">This mod's people <span class="sectr"><label class="chk" title="Show people marked Inactive (planned, not exported)"><input type="checkbox" bind:checked={showInactive} /> inactive</label><button disabled={!m} onclick={() => (showNew = true)}>+ New person</button></span></div>
      <ul class="list">
        {#each (m?.people ?? []).filter((p) => match(`${p.id} ${p.name.first} ${p.name.last}`) && (showInactive || !p.inactive)) as p (p.id)}
          <li class:on={sel === p.id} class:inactive={p.inactive}><button class="li" onclick={() => (app.selected.people = p.id)}><ImageView path={p.portrait} w={22} h={22} /> {p.name.first} {p.name.last}{#if p.inactive} <span class="muted">[Inactive]</span>{/if} <span class="badge b-new">new</span><span class="sub">{rankName(p.rank)}</span></button></li>
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
        <span class="spacer"></span><span class="muted small">exported to <span class="mono">data/sagaforge/people/</span> (SagaLib creates and places them)</span><label class="chk" title="Planned but not ready: not exported, so not in the game. Its problems become warnings."><input type="checkbox" checked={!!person.inactive} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { if (v) p.inactive = true; else delete p.inactive }) }} /> Inactive</label><button class="mini danger" onclick={remove}>Delete</button></div>
      <div class="cols">
        <div class="body">
          <div class="grid2">
            <Field label="First name" for="pp-f" help="Shown in the dialog's person panel, the comm directory and the intel screen.">
              <input id="pp-f" type="text" value={person.name.first} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.name.first = v }) }} />
            </Field>
            <Field label="Last name" for="pp-l" help="Tokens such as $personLastName use it in dialog.">
              <input id="pp-l" type="text" value={person.name.last} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.name.last = v }) }} />
            </Field>
            <Field label="Gender" for="pp-g" help="Picks he/she in vanilla's tokens ($personHeOrShe, …).">
              <select id="pp-g" value={person.gender} onchange={(e) => { const v = e.currentTarget.value as PersonDef['gender']; ed((p) => { p.gender = v }) }}><option value="FEMALE">female</option><option value="MALE">male</option><option value="ANY">any</option></select>
            </Field>
            <Field label="Faction" help="The faction they belong to: its name and color under their portrait, and reputation tests in dialog.">
              <IdInput value={person.faction} options={factions} strict onCommit={(v) => ed((p) => { p.faction = v })} />
            </Field>
            <Field label="Rank" ref="people-rank" help="Shown with their name (&quot;Commander Ilse Reyes&quot;); the faction's Rank titles can rename it.">
              <IdInput value={person.rank} options={app.defs.ranks} onCommit={(v) => ed((p) => { p.rank = v })} />
            </Field>
            <Field label="Post" ref="people-post" help={postHelp}>
              <IdInput value={person.post} options={app.defs.posts} onCommit={(v) => ed((p) => { p.post = v })} />
            </Field>
            <Field label="Portrait" later={later(person, 'portrait', ed)} help="The picture in dialog and the comm directory: a game portrait (referenced, not copied) or your own 128×128 PNG (copied into the mod).">
              <div class="row"><ImageView path={person.portrait} w={64} h={64} /><div class="col">
                <IdInput value={person.portrait} options={index.portraits.map((x) => ({ id: x.path }))} placeholder="e.g. graphics/portraits/portrait_mercenary02.png" onCommit={(v) => ed((p) => { p.portrait = v })} />
                <button onclick={pickPortrait} title="Choose by picture, or import your own (cropped and resized to 128×128)">Choose…</button></div></div>
            </Field>
            <Field label="Voice" for="pp-v" ref="people-voice" help="Vanilla's voice tag (soldier, spacer, …): some vanilla dialog picks its wording by it. Not a sound.">
              <select id="pp-v" value={person.voice ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.voice = v || undefined }) }}><option value="">—</option>{#each app.defs.voices as v (v)}<option value={v}>{v}</option>{/each}</select>
            </Field>
            <Field label="Personality" for="pp-pe" ref="people-personality" help="How they fight when they command a ship (cautious … reckless). Matters only in battle.">
              <select id="pp-pe" value={person.personality ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { p.personality = v || undefined }) }}><option value="">—</option>{#each app.defs.personalities as v (v)}<option value={v}>{v}</option>{/each}</select>
            </Field>
          </div>
          <div class="sect2">Placement</div>
          <div class="grid2">
            <Field label="Where" for="pp-pl" help="Where SagaLib puts them in the sector when a game starts (and in older saves).">
              <select id="pp-pl" value={person.placement.at} onchange={(e) => setPlacement(e.currentTarget.value as Placement['at'])}><option value="market">at a market</option><option value="fleet">commanding a fleet (encounter)</option><option value="none">nowhere until a quest needs them</option></select>
            </Field>
            {#if person.placement.at === 'market'}
              {@const pl = person.placement}
              <Field label="Market" later={later(person, 'placement.market', ed)} help="A market of this mod or an existing one (e.g. jangala). With a staff post, they take over that post there.">
                <IdInput value={pl.market} options={markets} strict onCommit={(v) => { if (v) setMarket(v); else ed((p) => { if (p.placement.at === 'market') p.placement.market = '' }) }} />
              </Field>
              <Field label="Comm directory" for="pp-cd" help="Listed in the market's comm directory, so the player can call them when docked.">
                <input id="pp-cd" type="checkbox" checked={pl.inCommDirectory} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { if (p.placement.at === 'market') p.placement.inCommDirectory = v }) }} />
              </Field>
            {:else if person.placement.at === 'fleet'}
              {@const pl = person.placement}
              <Field label="Encounter" for="pp-en" later={later(person, 'placement.encounter', ed)} help="They command the flagship of this encounter's fleet, so hailing it talks to them.">
                <select id="pp-en" value={pl.encounter} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { if (p.placement.at === 'fleet') p.placement.encounter = v }) }}><option value="">—</option>{#each m?.encounters ?? [] as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
              </Field>
            {/if}
          </div>
          <div class="sect2">Contact</div>
          <div class="grid2">
            <Field label="Contact" for="pp-c" help="Can become one of the player's contacts (the intel screen's Contacts), as vanilla's mission givers do after a completed job.">
              <input id="pp-c" type="checkbox" checked={!!person.contact} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { p.contact = v ? { types: ['military'], importance: 'MEDIUM' } : undefined }) }} />
            </Field>
            {#if person.contact}
              <Field label="Types" ref="people-contact-type" help="The contact's tags in the Contacts list; vanilla's missions use them to pick who offers what.">
                <div class="chips">{#each app.defs.contactTypes as t (t)}<label class="chk"><input type="checkbox" checked={person.contact.types.includes(t)} onchange={(e) => { const v = e.currentTarget.checked; ed((p) => { if (!p.contact) return; p.contact.types = v ? [...p.contact.types, t] : p.contact.types.filter((x) => x !== t) }) }} /> {t}</label>{/each}</div>
              </Field>
              <Field label="Importance" for="pp-i" ref="people-importance" help="Shown in the Contacts list; more important contacts offer bigger jobs and cost more to keep.">
                <select id="pp-i" value={person.contact.importance} onchange={(e) => { const v = e.currentTarget.value; ed((p) => { if (p.contact) p.contact.importance = v }) }}>{#each app.defs.importance as i (i)}<option value={i}>{i}</option>{/each}</select>
              </Field>
            {/if}
          </div>
          <div class="sect2">Phrases <button class="mini" onclick={addPhrase}>+ Phrase</button></div>
          <p class="f-help">How this character words things: their title for you, farewells, moods. Each phrase is a token ($id_name) you can put in any text; SagaLib picks the first case whose conditions match when the game shows it.</p>
          {#each person.phrases as ph, i (i)}
            <PhraseEditor phrase={ph} {templates} tokenEditable onChange={(np) => ed((p) => { p.phrases[i] = { ...np, token: np.token.startsWith(`$${person.id}_`) ? np.token : `$${person.id}_${slug(np.token.replace(/^\$/, ''))}` } })} onRemove={() => ed((p) => { p.phrases.splice(i, 1) })} />
          {/each}
          <div class="sect2">Description</div>
          <p class="f-help">A short biography for you and other modders. Not shown in game.</p>
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
    <div class="grid2 modal">
      <Field label="First name" for="np-f" help="As the game shows it."><input id="np-f" type="text" bind:value={first} placeholder="e.g. Ilse" /></Field>
      <Field label="Last name" for="np-l" help="Also makes the id."><input id="np-l" type="text" bind:value={last} placeholder="e.g. Reyes" /></Field>
      <Field label="Id" help="How quests and saves refer to them. Don't change it after a release."><span class="mono">{newId}</span></Field>
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
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 3px 10px; align-items: center; max-width: 620px; }
  .grid2.modal { width: 420px; }
  .grid2 input:not([type='checkbox']), .grid2 select { width: 100%; }
  .row { display: flex; gap: 8px; align-items: center; }
  .col { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chk { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); }
  .sectr { display: flex; gap: 8px; align-items: center; text-transform: none; letter-spacing: 0; }
  .list li.inactive { opacity: .5; }
  .head .chk { margin-right: 6px; }
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
