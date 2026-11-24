<script lang="ts">
  /**
   * #77 (PLAN.md §10.8, "Vaults of Knowledge: research"): Saga › Research, the mod's own techs.
   * Exported as rows of data/campaign/aotd_tech_options.csv (an owned block; VoK merges every mod's
   * file and shows each mod's techs as a tree of their own); icons go into settings.json
   * graphics.ui_icons_tech_tree. Quests unlock a tech ("unlocked by a quest": a global flag, no
   * SagaLib) or grant one (SagaLib 1.4's VoK bridge).
   */
  import ImageView from '../ui/ImageView.svelte'
  import RefButton from '../ui/RefButton.svelte'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { useOf } from '../../../shared/modlist'
  import { slug, uniqueId } from '../../../shared/quest'
  import {
    VOK_ID, VOK_NAME, VOK_TIERS, VOK_REWARD_TYPES, REWARD_LABEL, VOK_TECHS_CSV, emptyResearch, handRows, isIconPath, noColon, researchOf, techChoices, techFromRow, unlockFlag,
    type ResearchTech, type ResearchRewardType
  } from '../../../shared/research'
  import Field from '../ui/Field.svelte'
  import IdInput from '../ui/IdInput.svelte'

  const m = $derived(project.m!)
  const list = $derived(m.research?.techs ?? [])
  const sel = $derived(app.selected.researchTech ?? list[0]?.id ?? null)
  const cur = $derived(list.find((t) => t.id === sel) ?? null)
  const vok = $derived(useOf(m.project, VOK_ID))
  const installed = $derived(!!app.index?.sources.some((s) => s.id === VOK_ID))
  const choices = $derived(techChoices(m, app.index))
  /** Hand-written rows of the mod's aotd_tech_options.csv not yet taken into the editor. */
  const hand = $derived(handRows(project.loaded?.files[VOK_TECHS_CSV]?.text, 'id').filter((r) => !list.some((t) => t.id === r.key)))
  /** What quests do with each tech. */
  const usedBy = $derived.by(() => {
    const out = new Map<string, { quest: string; title: string; what: string }[]>()
    for (const q of m.quests) {
      const r = researchOf(q)
      const add = (id: string, what: string) => out.set(id, [...(out.get(id) ?? []), { quest: q.id, title: q.title || q.id, what }])
      for (const id of r.unlocks) add(id, 'unlocks')
      for (const id of r.grants) add(id, 'grants')
      for (const id of r.tests) add(id, 'tests')
    }
    return out
  })
  const rewardOptions = (t: ResearchRewardType) => {
    const ix = app.index
    if (!ix) return []
    if (t === 'industry') return ix.industries
    if (t === 'ship') return ix.hulls.map((h) => ({ id: h.id, name: h.name, definedBy: h.definedBy }))
    if (t === 'weapon') return ix.weapons
    if (t === 'hullmod') return ix.hullmods
    return []
  }
  const items = $derived([...m.items.map((x) => ({ id: x.id, name: x.name })), ...(app.index?.items ?? [])])

  const ed = (fn: (t: ResearchTech) => void) => { const id = sel; project.change((mm) => { const t = mm.research?.techs.find((x) => x.id === id); if (t) fn(t) }) }

  /** The next free place in a tier (VoK's trees: 4 columns of up to 9 rows). */
  function freeSpot(tier: number, techs: ResearchTech[]): { column: number; row: number } {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 9; r++) if (!techs.some((t) => t.tier === tier && t.column === c && t.row === r)) return { column: c, row: r }
    return { column: 0, row: 0 }
  }
  function add() {
    const id = uniqueId(`${m.project.prefix}tech`, list.map((t) => t.id))
    const tier = cur?.tier ?? 1
    project.change((mm) => {
      const r = (mm.research ??= emptyResearch())
      r.techs.push({ id, name: 'New tech', tier, days: 30, requires: [], items: [{ id: 'research_databank', qty: 1 }], rewards: [], ...freeSpot(tier, r.techs) })
    })
    app.selected.researchTech = id
  }
  /** Until a quest names it, the id follows the name. */
  function rename(v: string) {
    const t = cur
    if (!t) return
    const p = m.project.prefix
    const nid = usedBy.has(t.id) ? t.id : uniqueId(`${p}tech_${slug(v).replace(new RegExp(`^${p}`), '') || 'tech'}`.slice(0, 48), list.filter((x) => x.id !== t.id).map((x) => x.id))
    if (nid !== t.id) renameRefs(t.id, nid, (x) => { x.name = v })
    else ed((x) => { x.name = v })
  }
  function setId(v: string) {
    const t = cur
    if (!t) return
    const p = m.project.prefix
    const nid = v.trim().startsWith(p) ? slug(v.trim()) : `${p}${slug(v.trim())}`
    if (!nid || nid === t.id) return
    if (list.some((x) => x.id === nid)) { app.error = `Another tech already has the id ${nid}.`; return }
    const users = usedBy.get(t.id) ?? []
    if (!confirm(`${users.length ? `${[...new Set(users.map((u) => u.title))].join(', ')} name${users.length === 1 ? 's' : ''} it by its id; those are changed too. ` : ''}Vaults of Knowledge keeps research by id: in a save that already researched it, the tech is lost under the new id. Change the id?`)) return
    renameRefs(t.id, nid)
  }
  /** A new id everywhere the mod names the tech: other techs, faction stances, quests. */
  function renameRefs(from: string, to: string, also?: (t: ResearchTech) => void) {
    project.change((mm) => {
      const r = mm.research
      if (!r) return
      for (const t of r.techs) { if (t.id === from) { t.id = to; also?.(t) } t.requires = t.requires.map((x) => (x === from ? to : x)) }
      for (const f of Object.values(r.factions)) f.forbidden = f.forbidden.map((x) => (x === from ? to : x))
      for (const q of mm.quests) for (const n of q.nodes) {
        if (n.type === 'end' && n.research) n.research = n.research.map((x) => (x === from ? to : x))
        if (n.type === 'action') for (const o of n.ops) if ((o.op === 'unlockResearch' || o.op === 'grantResearch') && o.tech === from) o.tech = to
      }
    })
    app.selected.researchTech = to
  }
  function remove() {
    const t = cur
    if (!t) return
    const users = usedBy.get(t.id) ?? []
    const needs = list.filter((x) => x.requires.includes(t.id))
    if ((users.length || needs.length) && !confirm(`${[...users.map((u) => u.title), ...needs.map((x) => x.name)].join(', ')} name${users.length + needs.length === 1 ? 's' : ''} it. Delete it anyway? (Problems lists what still names it.)`)) return
    project.change((mm) => { if (mm.research) mm.research.techs = mm.research.techs.filter((x) => x.id !== t.id) })
    app.selected.researchTech = null
  }
  /** "Edit in Saga Forge": a hand-written row becomes the editor's; the next export moves it into the block. */
  function takeOver(row: Record<string, string>) {
    const t = techFromRow(row)
    project.change((mm) => { (mm.research ??= emptyResearch()).techs.push(t) })
    app.selected.researchTech = t.id
    app.flash(`${t.name || t.id} is now edited here. The next export removes its hand-written row and writes it in Saga Forge's block (a backup is kept).`)
  }
  async function pickIcon() {
    const [p] = await chooseImages('techIcon', { current: isIconPath(cur?.icon) ? cur?.icon : undefined, title: 'The tech\'s icon in the research tree' })
    if (p) ed((x) => { x.icon = p })
  }
  function openQuest(id: string) { app.go('quests', id) }
  const num = (v: string, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }

  /** The tree of the selected tech's tier: columns × rows, for placing it. */
  const tierTechs = $derived(cur ? list.filter((t) => t.tier === cur.tier) : [])
  const rows = $derived(Math.max(4, ...tierTechs.map((t) => t.row + 2)))
  const cols = $derived(Math.max(4, ...tierTechs.map((t) => t.column + 1)))
</script>

<div class="split">
  <div class="side">
    <div class="sect">Techs <button class="mini" onclick={add} title="A new tech in the mod's own tree">+ Add</button></div>
    <ul class="list">
      {#each VOK_TIERS as tier (tier.n)}
        {@const inTier = list.filter((t) => t.tier === tier.n)}
        {#if inTier.length}
          <li class="tier">Tier {tier.label}</li>
          {#each inTier as t (t.id)}
            <li class:on={t.id === sel}><button class="li" onclick={() => (app.selected.researchTech = t.id)}>
              <span class="nm">{t.name || t.id}</span>
              <span class="sub">{t.days} days{t.fromStart ? ' · from the start' : ''}{t.quest ? ' · unlocked by a quest' : ''}{t.requires.length ? ` · needs ${t.requires.length}` : ''}</span>
            </button></li>
          {/each}
        {/if}
      {/each}
      {#each list.filter((t) => !(t.tier >= 0 && t.tier <= 5)) as t (t.id)}
        <li class:on={t.id === sel}><button class="li" onclick={() => (app.selected.researchTech = t.id)}><span class="nm">{t.name || t.id}</span><span class="sub bad">tier {t.tier}?</span></button></li>
      {/each}
      {#if !list.length}<li class="muted small pad">No techs yet.</li>{/if}
    </ul>
    {#if hand.length}
      <div class="sect">Written by hand</div>
      <p class="muted small pad0">Rows in the mod's aotd_tech_options.csv outside Saga Forge's block. Export leaves them alone.</p>
      <ul class="list">
        {#each hand as h (h.key)}
          <li class="hand"><span class="nm" title={h.key}>{h.row.name || h.key}</span><button class="mini" title="Edit it here: the next export moves the row into Saga Forge's block" onclick={() => takeOver(h.row)}>Edit in Saga Forge</button></li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="scroll pad">
    <p class="muted small intro">The mod's own techs for <b>AoTD Vaults of Knowledge</b>. VoK shows them as a tree of their own in its research screen, named after the mod. Export writes <span class="mono">data/campaign/aotd_tech_options.csv</span> (only VoK reads it, so without VoK nothing changes). A quest makes a tech researchable with <b>Unlock research</b> (a flag, no SagaLib), or gives it at once with <b>Grant research</b> or an End node's Research (SagaLib's VoK bridge).</p>
    <div class="row status">
      <span>Vaults of Knowledge: <b class:good={vok === 'required' || vok === 'optional'}>{vok === 'required' ? 'required' : vok === 'incompatible' ? 'marked incompatible' : vok === 'optional' ? 'optional' : 'not listed'}</b></span>
      <span class="muted small">{vok === 'required' ? 'In mod_info.json dependencies (Saga › Mods).' : 'Not in mod_info.json: without VoK the techs are never read and quests grant nothing.'}{vok === 'none' ? ' It isn\'t in the mod\'s list yet (Problems asks for it).' : ''}{installed ? '' : ' VoK is not installed in your game, so its own techs can\'t be picked as prerequisites.'}</span>
      {#if vok === 'none' && list.length}<button class="mini" title="List Vaults of Knowledge in Saga › Mods as optional (nothing goes into mod_info.json)" onclick={() => project.change((mm) => { ((mm.project.mods ??= []), mm.project.mods).push({ id: VOK_ID, name: VOK_NAME, use: 'optional' }) })}>Add as optional</button>{/if}
      <button class="mini" onclick={() => (app.selected.sagaOpen = 'mods')}>Saga › Mods</button>
    </div>

    {#if cur}
      {@const users = usedBy.get(cur.id) ?? []}
      <div class="grid2">
        <Field label="Name" for="rt-n" help="Shown in VoK's research tree and its messages.">
          <input id="rt-n" type="text" value={cur.name} onchange={(e) => rename(e.currentTarget.value)} />
        </Field>
        <Field label="Id" for="rt-id" help="VoK merges every mod's techs by id and keeps a save's research by it. It follows the name until a quest names it; after a release never change it.">
          <input id="rt-id" type="text" class="mono" value={cur.id} onchange={(e) => setId(e.currentTarget.value)} />
        </Field>
        <Field label="Tier" for="rt-t" help="VoK's tiers 0 to 5 (5 is experimental). With VoK's default settings every tier-0 tech is researched when the game loads; its settings can lock higher tiers until the player unlocks them.">
          <select id="rt-t" value={String(cur.tier)} onchange={(e) => { const v = Number(e.currentTarget.value); ed((x) => { x.tier = v; Object.assign(x, freeSpot(v, list.filter((y) => y.id !== x.id))) }) }}>
            {#each VOK_TIERS as t (t.n)}<option value={String(t.n)}>{t.label}</option>{/each}
            {#if !VOK_TIERS.some((t) => t.n === cur.tier)}<option value={String(cur.tier)}>tier {cur.tier} (not one of VoK's)</option>{/if}
          </select>
        </Field>
        <Field label="Days" for="rt-d" help="Days to research it (VoK's research speed setting changes it).">
          <input id="rt-d" type="number" min="1" step="1" value={cur.days} onchange={(e) => { const v = Math.max(1, Math.round(num(e.currentTarget.value, 30))); ed((x) => { x.days = v }) }} />
        </Field>
        <Field label="Place" help="Column and row in the tier, in the mod's own tree (click a free cell below).">
          <span class="row">column <input type="number" class="short" min="0" step="1" value={cur.column} onchange={(e) => { const v = Math.max(0, Math.round(num(e.currentTarget.value))); ed((x) => { x.column = v }) }} /> row <input type="number" class="short" min="0" step="1" value={cur.row} onchange={(e) => { const v = Math.max(0, Math.round(num(e.currentTarget.value))); ed((x) => { x.row = v }) }} /></span>
        </Field>
        <Field label="Tree" help="The selected tech's tier in the mod's tree: click a free cell to move it there, a tech to open it.">
          <div class="tree" style:grid-template-columns={`repeat(${cols}, 1fr)`}>
            {#each Array.from({ length: rows }, (_, r) => r) as r (r)}
              {#each Array.from({ length: cols }, (_, c) => c) as c (c)}
                {@const here = tierTechs.filter((t) => t.column === c && t.row === r)}
                {#if here.length}
                  <button class="cell full" class:on={here.some((t) => t.id === cur.id)} class:clash={here.length > 1} title={here.map((t) => t.name).join(', ')} onclick={() => (app.selected.researchTech = here[0].id)}>{here.map((t) => t.name || t.id).join(' / ')}</button>
                {:else}
                  <button class="cell" title={`Move it to column ${c}, row ${r}`} aria-label={`column ${c}, row ${r}`} onclick={() => ed((x) => { x.column = c; x.row = r })}></button>
                {/if}
              {/each}
            {/each}
          </div>
        </Field>
        <Field label="Icon" ref="saga-research-icons" help="An image in the mod (listed in its settings.json under ui_icons_tech_tree as the tech's id), or the id of an icon there already, such as VoK's own (farming1, basic…).">
          <span class="row">
            <button class="mini" onclick={pickIcon}>Choose image…</button>
            <datalist id="rt-icons">{#each app.index?.researchIcons ?? [] as k (k)}<option value={k}></option>{/each}</datalist>
            <input type="text" class="mono grow" list="rt-icons" value={cur.icon ?? ''} placeholder="or an icon id, e.g. basic" onchange={(e) => { const v = e.currentTarget.value.trim(); ed((x) => { if (v) x.icon = v; else delete x.icon }) }} />
            <!-- #67 U34: the icon an id stands for -->
            {#if cur.icon && !isIconPath(cur.icon)}{@const gi = app.index?.graphicsIcons?.find((g) => g.category === 'ui_icons_tech_tree' && g.key === cur.icon)}{#if gi}<ImageView path={gi.path} sourceId={gi.definedBy} w={32} h={32} />{/if}{/if}
          </span>
        </Field>
        <Field label="Needs first" help="Techs researched before this one: VoK's own, another mod's or this mod's. All must be researched.">
          <div class="col">
            {#each cur.requires as r, i (i)}
              <span class="row"><IdInput value={r} options={choices.filter((c) => c.id !== cur.id)} width="260px" placeholder="tech id" onCommit={(v) => ed((x) => { x.requires[i] = v.trim(); x.requires = x.requires.filter(Boolean) })} /><button class="mini" onclick={() => ed((x) => { x.requires.splice(i, 1) })}>✕</button></span>
            {/each}
            <span><button class="mini" onclick={() => ed((x) => { x.requires.push('') })}>+ tech</button>{#if !cur.requires.length}<span class="muted small"> none: it can be researched at once</span>{/if}</span>
          </div>
        </Field>
        <Field label="Costs" help="Paid when research starts: research databanks (VoK's research_databank), other commodities or special items.">
          <div class="col">
            {#each cur.items as it, i (i)}
              <span class="row"><IdInput value={it.id} options={items} width="200px" placeholder="item id" onCommit={(v) => ed((x) => { x.items[i].id = v.trim() })} /> × <input type="number" class="short" min="1" step="1" value={it.qty} onchange={(e) => { const v = Math.max(1, Math.round(num(e.currentTarget.value, 1))); ed((x) => { x.items[i].qty = v }) }} /><button class="mini" onclick={() => ed((x) => { x.items.splice(i, 1) })}>✕</button></span>
            {/each}
            <span><button class="mini" onclick={() => ed((x) => { x.items.push({ id: 'research_databank', qty: 1 }) })}>+ cost</button></span>
          </div>
        </Field>
        <Field label="Unlocks" help="What the tech gives once researched: industries, ships, weapons, hullmods. An ability line is written as VoK reads it, but VoK 5.0.7 neither shows nor grants it (checked in its jar): use a modifier line to tell the player. A modifier is only a line of text in VoK's tree: its effect needs Java. VoK needs at least one line (without one, Export writes the tech's name as a modifier).">
          <div class="col">
            {#each cur.rewards as rw, i (i)}
              <span class="row">
                <select value={rw.type} onchange={(e) => { const v = e.currentTarget.value as ResearchRewardType; ed((x) => { x.rewards[i].type = v }) }}>{#each VOK_REWARD_TYPES as t (t)}<option value={t}>{REWARD_LABEL[t]}</option>{/each}</select>
                {#if rw.type === 'modifier'}<input type="text" class="grow" value={rw.value} placeholder="the text shown" title="No colon: VoK splits the line there" onchange={(e) => { const v = noColon(e.currentTarget.value); ed((x) => { x.rewards[i].value = v }) }} />
                {:else}<IdInput value={rw.value} options={rewardOptions(rw.type)} width="220px" placeholder={`${REWARD_LABEL[rw.type]} id`} onCommit={(v) => ed((x) => { x.rewards[i].value = v.trim() })} />{#if rw.type === 'industry'}<RefButton ref="locations-industries" />{/if}{/if}
                <button class="mini" onclick={() => ed((x) => { x.rewards.splice(i, 1) })}>✕</button>
              </span>
            {/each}
            <span><button class="mini" onclick={() => ed((x) => { x.rewards.push({ type: 'industry', value: '' }) })}>+ unlock</button></span>
          </div>
        </Field>
        <Field label="From the start" help="Already researched in a new game.">
          <label class="small"><input type="checkbox" checked={!!cur.fromStart} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { if (v) x.fromStart = true; else delete x.fromStart }) }} /> researched from the start</label>
        </Field>
        <Field label="By a quest" help={`Can only be researched once a quest's "Unlock research" names it. Export writes VoK's otherReq: the flag ${unlockFlag(cur.id)} and the text VoK shows until then.`}>
          <div class="col">
            <label class="small"><input type="checkbox" checked={!!cur.quest} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { if (v) x.quest = { text: 'Unlocked by a quest.' }; else delete x.quest }) }} /> unlocked by a quest</label>
            {#if cur.quest}<input type="text" value={cur.quest.text} placeholder="Shown in VoK's tree until then" title="No colon: VoK cuts the text there" onchange={(e) => { const v = noColon(e.currentTarget.value); ed((x) => { x.quest = { text: v } }) }} />{/if}
          </div>
        </Field>
        <Field label="Tags" for="rt-tg" help="VoK's tags column, written as is (5.0.7 doesn't read it).">
          <input id="rt-tg" type="text" class="mono" value={cur.tags ?? ''} onchange={(e) => { const v = e.currentTarget.value.trim(); ed((x) => { if (v) x.tags = v; else delete x.tags }) }} />
        </Field>
        <Field label="Notes" for="rt-no" help="For you only; not exported.">
          <input id="rt-no" type="text" value={cur.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { if (v) x.notes = v; else delete x.notes }) }} />
        </Field>
        <Field label="Quests" help="Quests that unlock it (Unlock research), grant it (Grant research, an End node's Research) or test it (Has researched).">
          <div class="small">{#each users as u, i (i)}<div><button class="link" onclick={() => openQuest(u.quest)}>{u.title}</button> {u.what} it</div>{:else}<span class="muted">No quest names it.</span>{/each}</div>
        </Field>
      </div>
      <p><button class="mini danger" onclick={remove}>Delete tech</button></p>
    {/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; height: 100%; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list li.tier { font-size: 10px; color: var(--muted); padding: 6px 8px 2px; }
  .list li.hand { display: flex; gap: 6px; align-items: center; justify-content: space-between; padding: 2px 8px; font-size: 12px; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; display: flex; flex-direction: column; }
  .sub { font-size: 10px; color: var(--muted); }
  .bad { color: var(--bad); }
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .pad0 { padding: 0 10px; margin: 0 0 4px; }
  .intro { max-width: 980px; margin: 0 0 8px; }
  .row { display: flex; gap: 6px; align-items: center; font-size: 12px; }
  .col { display: flex; flex-direction: column; gap: 3px; }
  .status { margin-bottom: 6px; flex-wrap: wrap; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 560px); gap: 4px 10px; align-items: center; margin-top: 10px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .short { width: 60px; }
  .grow { flex: 1; min-width: 0; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .good { color: var(--good); }
  .link { border: none; background: none; padding: 0; color: var(--accent); cursor: pointer; font-size: 11px; }
  .tree { display: grid; gap: 2px; max-width: 560px; }
  .cell { height: 22px; min-width: 0; padding: 0 4px; font-size: 10px; border: 1px dashed var(--border); background: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cell.full { border-style: solid; background: #1b2430; text-align: left; }
  .cell.on { outline: 1px solid var(--accent-2); }
  .cell.clash { border-color: var(--warn); }
</style>
