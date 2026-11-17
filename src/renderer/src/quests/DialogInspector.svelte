<script lang="ts">
  /** Inspector for a Dialog node: speaker, visual, text, displays and its options (PLAN.md §4.3, §4.9). */
  import type { DialogNode, Display, OptionDef, QuestPlan, Visual } from '../../../shared/model'
  import { nextVariationToken, newPhrase, uniqueId } from '../../../shared/quest'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { editNode, conditionTemplates } from './edit'
  import LinesInput from './LinesInput.svelte'
  import PhraseEditor from './PhraseEditor.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Field from '../ui/Field.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'

  interface Props { quest: QuestPlan; node: DialogNode }
  let { quest, node }: Props = $props()
  const qid = $derived(quest.id)
  const nid = $derived(node.id)
  const ed = (fn: (n: DialogNode) => void) => editNode<DialogNode>(qid, nid, fn)
  const m = $derived(project.m!)
  const people = $derived([...m.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })), ...(app.index?.people ?? [])])
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions.map((f) => f.id) ?? [])])
  const templates = $derived(conditionTemplates(quest, factions, m.quests))
  const items = $derived([...m.items.map((i) => ({ id: i.id, name: i.name })), ...(app.index?.items ?? [])])
  const illus = $derived([...Object.keys(m.project.illustrations ?? {}).map((k) => ({ id: k, name: 'this mod' })), ...(app.index?.illustrations.filter((i) => i.category === 'illustrations').map((i) => ({ id: i.key, name: i.path })) ?? [])])
  const tokens = $derived([
    ...[...m.phrases, ...m.people.flatMap((p) => p.phrases), ...node.phrases].map((p) => ({ token: p.token, label: `${p.token} (phrase)` })),
    ...quest.variables.map((v) => ({ token: `$global.${qid}_${v.name}`, label: `${v.name} (variable)` })),
    ...app.defs.tokens.map((t) => ({ token: t.token, label: `${t.token} — ${t.sample}` }))
  ])

  let textArea = $state<HTMLTextAreaElement | null>(null)
  let text = $state('')
  $effect(() => { text = node.text })
  const commitText = () => { if (text !== node.text) { const t = text; ed((n) => { n.text = t }) } }
  function insertToken(tok: string) {
    const ta = textArea
    const at = ta ? ta.selectionStart : text.length
    text = text.slice(0, at) + tok + text.slice(ta ? ta.selectionEnd : at)
    commitText()
  }
  function addVariation() {
    const tok = nextVariationToken(quest, node)
    insertToken(tok)
    ed((n) => { n.phrases.push(newPhrase(tok, `node:${qid}/${nid}`)) })
  }

  const VISUALS: { kind: Visual['kind']; label: string }[] = [
    { kind: 'keep', label: 'Keep the current visual' }, { kind: 'person', label: 'Person (speaker)' }, { kind: 'illustration', label: 'Illustration' },
    { kind: 'planet', label: 'Large planet / planet info' }, { kind: 'mapMarker', label: 'Map marker' }, { kind: 'fleets', label: 'Both fleets (SagaLib)' },
    { kind: 'ship', label: 'One ship (SagaLib)' }, { kind: 'save', label: 'Save the visual' }, { kind: 'restore', label: 'Restore the saved visual' }, { kind: 'hide', label: 'Hide the visual' }
  ]
  function setVisual(kind: Visual['kind']) {
    ed((n) => {
      switch (kind) {
        case 'person': n.visual = { kind, person: n.speaker || (quest.start.kind === 'contact' ? quest.start.person : '') }; break
        case 'illustration': n.visual = { kind, category: 'illustrations', key: '' }; break
        case 'planet': n.visual = { kind, entity: '' }; break
        case 'mapMarker': n.visual = { kind, entity: '' }; break
        case 'fleets': n.visual = { kind, encounter: '' }; break
        case 'ship': n.visual = { kind, variant: '' }; break
        default: n.visual = { kind } as Visual
      }
    })
  }

  /** Choose an illustration by picture (by its key), or import one (cropped and resized to 480×300) (R28). */
  async function addIllustration() {
    const [key] = await chooseImages('illustration', { current: node.visual.kind === 'illustration' ? node.visual.key : undefined })
    if (key) ed((n) => { if (n.visual.kind === 'illustration') n.visual.key = key })
  }

  const DISPLAYS: { kind: Display['kind']; label: string; lib?: boolean }[] = [
    { kind: 'credits', label: 'Credits gained / lost' }, { kind: 'commodity', label: 'Commodity gained / lost' }, { kind: 'specialItem', label: 'Special item' },
    { kind: 'weapon', label: 'Weapon' }, { kind: 'fighter', label: 'Fighter LPC' }, { kind: 'ship', label: 'Ship gained / lost', lib: true },
    { kind: 'storyPoints', label: 'Story points' }, { kind: 'xp', label: 'Experience' }, { kind: 'rep', label: 'Reputation change' },
    { kind: 'text', label: 'Extra paragraph (color, small)' }, { kind: 'cost', label: 'Cost panel' }, { kind: 'capacity', label: 'Remaining capacity' },
    { kind: 'image', label: 'Inline image', lib: true }, { kind: 'faction', label: 'Faction callout', lib: true }, { kind: 'shipList', label: 'Ship list', lib: true },
    { kind: 'cargo', label: 'Cargo grid', lib: true }, { kind: 'heading', label: 'Section heading', lib: true }, { kind: 'skills', label: 'Skill panel', lib: true },
    { kind: 'sound', label: 'Sound' }, { kind: 'music', label: 'Music' }
  ]
  const DISPLAY_HELP: Record<Display['kind'], string> = {
    credits: 'Amount: positive gives credits, negative takes them. Shows "Gained/Lost … credits".',
    commodity: 'Item and quantity (negative = lost). Changes the cargo and shows a "Gained" line.',
    specialItem: 'Special item and quantity (negative = lost). Changes the cargo and shows a "Gained" line.',
    weapon: 'Weapon id and quantity put in the cargo, with a "Gained" line.',
    fighter: 'Fighter wing (LPC) id and quantity put in the cargo, with a "Gained" line.',
    ship: 'A ship variant added to (or, with lost, removed from) the player\'s fleet.',
    storyPoints: 'Story points given (negative: spent), with the "Gained" line.',
    xp: 'Experience points given, with the "Gained" line.',
    rep: 'Faction and points (5 = +5). Changes the relation and shows the change.',
    text: 'An extra paragraph in gray (small: in the smaller font), for notes under the main text.',
    cost: 'A panel listing what something costs, as vanilla shows before a purchase. Shows only; nothing is taken.',
    capacity: 'Shows the fleet\'s free cargo, fuel and crew room.',
    image: 'A registered picture drawn inside the text column.',
    faction: 'The faction\'s flag and name in a box, as vanilla introduces a faction.',
    shipList: 'A row of ship pictures (variants), e.g. a fleet on offer.',
    cargo: 'A grid of item icons with quantities.',
    heading: 'A section heading line across the text column.',
    skills: 'A person\'s skills panel.',
    sound: 'Plays a sound once (a UI or ambience sound id).',
    music: 'Switches the music to this track while the dialog is open.'
  }
  function addDisplay(kind: Display['kind']) {
    const d: Record<Display['kind'], Display> = {
      credits: { kind: 'credits', amount: 1000 }, commodity: { kind: 'commodity', item: '', qty: 1 }, specialItem: { kind: 'specialItem', item: '', qty: 1 },
      weapon: { kind: 'weapon', id: '', qty: 1 }, fighter: { kind: 'fighter', id: '', qty: 1 }, ship: { kind: 'ship', variant: '' }, storyPoints: { kind: 'storyPoints', amount: 1 },
      xp: { kind: 'xp', amount: 1000 }, rep: { kind: 'rep', faction: factions[0] ?? '', amount: 5 }, text: { kind: 'text', text: '', small: true, color: 'textGrayColor' },
      cost: { kind: 'cost', items: [{ item: 'supplies', qty: 10 }] }, capacity: { kind: 'capacity' }, image: { kind: 'image', category: 'illustrations', key: '' },
      faction: { kind: 'faction', faction: factions[0] ?? '' }, shipList: { kind: 'shipList', variants: [] }, cargo: { kind: 'cargo', items: [] }, heading: { kind: 'heading', text: '' },
      skills: { kind: 'skills', person: '' }, sound: { kind: 'sound', id: '' }, music: { kind: 'music', id: '' }
    }
    ed((n) => { n.displays.push(d[kind]) })
  }
  const paraCount = $derived(Math.max(1, node.text.split(/\n\s*\n/).filter((p) => p.trim()).length))

  /** Every option id in the quest: the export names options per quest (<quest>_<option>), so they must differ across dialogs. */
  const questOptionIds = () => quest.nodes.flatMap((n) => (n.type === 'dialog' ? n.options.map((o) => o.id) : []))
  function addOption() {
    ed((n) => { n.options.push({ id: uniqueId('option', questOptionIds()), text: 'New option' }) })
  }
  const edOpt = (oid: string, fn: (o: OptionDef) => void) => ed((n) => { const o = n.options.find((x) => x.id === oid); if (o) fn(o) })
  function renameOption(oid: string, to: string) {
    const t = to.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    if (!t || t === oid) return
    if (questOptionIds().includes(t)) { app.error = `The option id "${t}" is already used in this quest: option ids are the quest's, so the game can tell the options apart.`; return }
    editNode<DialogNode>(qid, nid, (n, q) => {
      const o = n.options.find((x) => x.id === oid)
      if (o) o.id = t
      for (const e of q.edges) if (e.from === nid && e.handle === oid) e.handle = t
    })
    // keep its settings open under the new id (walk W4)
    if (openOpt === oid) openOpt = t
  }
  /**
   * A new option keeps its automatic id ("option", "option_2") until its text is first typed; then,
   * while nothing links from it yet, the id follows the text ("What's the catch?" → whats_the_catch).
   */
  function autoOptionId(oid: string, text: string) {
    if (!/^option(_\d+)?$/.test(oid) || quest.edges.some((e) => e.from === nid && e.handle === oid)) return
    const words = text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 3)
    if (words.length) renameOption(oid, uniqueId(words.join('_'), questOptionIds().filter((x) => x !== oid)))
  }
  function moveOption(oid: string, d: number) {
    ed((n) => { const i = n.options.findIndex((o) => o.id === oid); const j = i + d; if (i < 0 || j < 0 || j >= n.options.length) return; const [o] = n.options.splice(i, 1); n.options.splice(j, 0, o) })
  }
  function removeOption(oid: string) {
    editNode<DialogNode>(qid, nid, (n, q) => { n.options = n.options.filter((o) => o.id !== oid); q.edges = q.edges.filter((e) => !(e.from === nid && e.handle === oid)) })
  }
  const target = (oid: string) => { const e = quest.edges.find((x) => x.from === nid && x.handle === oid); return e ? quest.nodes.find((x) => x.id === e.to) : undefined }
  let openOpt = $state<string | null>(app.smokeModal?.startsWith('opt=') ? app.smokeModal.slice(4) : null)
  // screenshot mode: scroll the inspector to the options ("opt=<id>") or the displays ("displays")
  if (app.smokeModal?.startsWith('opt=') || app.smokeModal === 'displays') {
    const sel = app.smokeModal === 'displays' ? '.disp' : '.opts'
    setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), 1200)
  }
</script>

<div class="grid2">
  <Field label="Title" for="dn-title" help="Names the node on the chart. Not shown in game.">
    <input id="dn-title" type="text" value={node.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((n) => { n.title = v }) }} placeholder="e.g. Offer" />
  </Field>
  <Field label="Speaker" help="Who is talking, for the Person visual and the People page's Used by list. Empty: the narrator, or whoever the dialog already shows.">
    <IdInput value={node.speaker ?? ''} options={people} strict placeholder="(none)" onCommit={(v) => ed((n) => { n.speaker = v || undefined; if (n.visual.kind === 'person' && v) n.visual.person = v })} />
  </Field>
  <Field label="Visual" for="dn-vis" help="What the right half of the dialog shows while this text is on screen. Keep leaves the previous picture.">
    <select id="dn-vis" value={node.visual.kind === 'none' ? 'keep' : node.visual.kind} onchange={(e) => setVisual(e.currentTarget.value as Visual['kind'])}>
      {#each VISUALS as v (v.kind)}<option value={v.kind}>{v.label}</option>{/each}
    </select>
  </Field>
  {#if node.visual.kind === 'person'}
    {@const v = node.visual}
    <Field label="Person" help="Their portrait, name, rank and faction appear on the right.">
      <IdInput value={v.person} options={people} strict onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.person = x })} />
    </Field>
    <Field label="2nd / 3rd" help="Optional smaller portraits beside the first person, for a conversation with several people.">
      <span class="row"><IdInput value={v.second ?? ''} options={people} placeholder="second person" onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.second = x || undefined })} /><IdInput value={v.third ?? ''} options={people} placeholder="third" onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.third = x || undefined })} /></span>
    </Field>
  {:else if node.visual.kind === 'illustration'}
    <Field label="Illustration" help="A picture registered in settings.json (vanilla's, another mod's, or your own: about 480×300). Choose… picks one by its picture, or imports your own (cropped and resized; registered on Export).">
      <IdInput value={node.visual.key} options={illus} strict onCommit={(x) => ed((n) => { if (n.visual.kind === 'illustration') n.visual.key = x })} />
      <button class="mini self" onclick={addIllustration} title="Choose by picture, or import your own (cropped and resized to 480×300)">Choose…</button>
    </Field>
  {:else if node.visual.kind === 'planet' || node.visual.kind === 'mapMarker'}
    <Field label="Entity" help={node.visual.kind === 'planet' ? 'The planet to show large (the place the dialog is at, if empty).' : 'The entity the small map centres on, with a marker.'}>
      <input type="text" class="mono" value={node.visual.entity} onchange={(e) => { const x = e.currentTarget.value; ed((n) => { if (n.visual.kind === 'planet' || n.visual.kind === 'mapMarker') n.visual.entity = x }) }} />
      {#if node.visual.kind === 'planet'}<label class="chk"><input type="checkbox" checked={!!node.visual.info} onchange={(e) => { const x = e.currentTarget.checked; ed((n) => { if (n.visual.kind === 'planet') n.visual.info = x }) }} /> planet info panel (SagaLib)</label>{/if}
    </Field>
  {:else if node.visual.kind === 'fleets'}
    <Field label="Encounter" help="Shows the player's fleet and this encounter's fleet, as at the start of a battle.">
      <IdInput value={node.visual.encounter} options={m.encounters.map((e) => ({ id: e.id, name: e.name }))} onCommit={(x) => ed((n) => { if (n.visual.kind === 'fleets') n.visual.encounter = x })} />
    </Field>
  {:else if node.visual.kind === 'ship'}
    <Field label="Variant" help="A ship variant id (e.g. hammerhead_Balanced) to show on its own.">
      <IdInput value={node.visual.variant} options={app.index?.variants ?? []} onCommit={(x) => ed((n) => { if (n.visual.kind === 'ship') n.visual.variant = x })} />
    </Field>
  {/if}
</div>

<div class="sect">Text <span class="row">
  <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) insertToken(v) }}><option value="">+ token…</option>{#each tokens as t (t.token)}<option value={t.token}>{t.label}</option>{/each}</select>
  <button class="mini" onclick={addVariation} title="Wording that changes with the situation (an inline phrase)">+ variation</button>
</span></div>
<p class="f-help">The text the player reads on the left of the dialog. "Speech in quotes," narration in second person. A blank line starts a new paragraph; a line with only OR starts a random variant. Tokens such as $playerName are filled in by the game.</p>
<textarea bind:this={textArea} rows="7" bind:value={text} onblur={commitText} spellcheck="true" placeholder={'e.g. "Find them, and the Compact pays 60,000 credits."'}></textarea>
{#if node.phrases.length}
  {#each node.phrases as p, i (p.token)}
    <PhraseEditor phrase={p} {templates} onChange={(np) => ed((n) => { n.phrases[i] = np })} onRemove={() => ed((n) => { n.phrases.splice(i, 1); n.text = n.text.split(p.token).join('') })} />
  {/each}
{/if}
<div class="grid2">
  <Field label="Highlights" for="dn-hl" help="Words or numbers in the text drawn in the highlight color (yellow), as vanilla marks names and sums. Separate them with |.">
    <input id="dn-hl" type="text" value={node.highlights.join(' | ')} placeholder="e.g. Kestrel belt | 60,000" onchange={(e) => { const v = e.currentTarget.value.split('|').map((s) => s.trim()).filter(Boolean); ed((n) => { n.highlights = v }) }} />
  </Field>
</div>

<div class="sect">Displays <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addDisplay(v as Display['kind']) }}><option value="">+ display…</option>{#each DISPLAYS as d (d.kind)}<option value={d.kind}>{d.label}{d.lib ? ' (SagaLib)' : ''}</option>{/each}</select></div>
<p class="f-help">Panels drawn in the text column after the text, or after a paragraph: "Gained" lines, costs, a faction callout… Gains and losses also change the player's cargo, credits or reputation.</p>
{#each node.displays as d, i (i)}
  <div class="disp">
    <span class="dk">{DISPLAYS.find((x) => x.kind === d.kind)?.label}</span>
    {#if d.kind === 'credits' || d.kind === 'storyPoints' || d.kind === 'xp'}
      <input type="number" value={d.amount} onchange={(e) => { const v = Number(e.currentTarget.value); ed((n) => { (n.displays[i] as { amount: number }).amount = v }) }} />
    {:else if d.kind === 'commodity' || d.kind === 'specialItem'}
      <IdInput value={d.item} options={items} strict width="140px" onCommit={(v) => ed((n) => { (n.displays[i] as { item: string }).item = v })} />
      <input type="number" value={d.qty} title="negative = lost" onchange={(e) => { const v = Number(e.currentTarget.value); ed((n) => { (n.displays[i] as { qty: number }).qty = v }) }} />
    {:else if d.kind === 'weapon' || d.kind === 'fighter'}
      <IdInput value={d.id} options={d.kind === 'weapon' ? app.index?.weapons ?? [] : app.index?.wings ?? []} width="140px" onCommit={(v) => ed((n) => { (n.displays[i] as { id: string }).id = v })} />
      <input type="number" value={d.qty} onchange={(e) => { const v = Number(e.currentTarget.value); ed((n) => { (n.displays[i] as { qty: number }).qty = v }) }} />
    {:else if d.kind === 'ship'}
      <input type="text" class="mono" value={d.variant} placeholder="variant id" onchange={(e) => { const v = e.currentTarget.value; ed((n) => { (n.displays[i] as { variant: string }).variant = v }) }} />
      <label class="chk"><input type="checkbox" checked={!!d.remove} onchange={(e) => { const v = e.currentTarget.checked; ed((n) => { (n.displays[i] as { remove?: boolean }).remove = v }) }} /> lost</label>
    {:else if d.kind === 'rep'}
      <IdInput value={d.faction ?? ''} options={factions.map((f) => ({ id: f }))} width="130px" placeholder="faction" onCommit={(v) => ed((n) => { (n.displays[i] as { faction?: string }).faction = v })} />
      <input type="number" value={d.amount} title="points (5 = +5)" onchange={(e) => { const v = Number(e.currentTarget.value); ed((n) => { (n.displays[i] as { amount: number }).amount = v }) }} />
    {:else if d.kind === 'text' || d.kind === 'heading'}
      <input type="text" value={d.text} onchange={(e) => { const v = e.currentTarget.value; ed((n) => { (n.displays[i] as { text: string }).text = v }) }} />
      {#if d.kind === 'text'}<label class="chk"><input type="checkbox" checked={!!d.small} onchange={(e) => { const v = e.currentTarget.checked; ed((n) => { (n.displays[i] as { small?: boolean }).small = v }) }} /> small</label>{/if}
    {:else if d.kind === 'faction'}
      <IdInput value={d.faction} options={factions.map((f) => ({ id: f }))} width="140px" onCommit={(v) => ed((n) => { (n.displays[i] as { faction: string }).faction = v })} />
    {:else if d.kind === 'image'}
      <IdInput value={d.key} options={illus} width="140px" onCommit={(v) => ed((n) => { (n.displays[i] as { key: string }).key = v })} />
    {:else if d.kind === 'sound' || d.kind === 'music'}
      <IdInput value={d.id} options={(d.kind === 'sound' ? app.index?.sounds : app.index?.music)?.map((s) => ({ id: s })) ?? []} width="160px" onCommit={(v) => ed((n) => { (n.displays[i] as { id: string }).id = v })} />
    {/if}
    <select class="at" title="Where in the text" value={String(d.at ?? 'end')} onchange={(e) => { const v = e.currentTarget.value; ed((n) => { n.displays[i].at = v === 'end' ? undefined : Number(v) }) }}>
      <option value="end">after the text</option>
      {#each Array(paraCount - 1) as _, k (k)}<option value={String(k)}>after paragraph {k + 1}</option>{/each}
    </select>
    <button class="mini" onclick={() => ed((n) => { n.displays.splice(i, 1) })}>✕</button>
    <div class="f-help dh">{DISPLAY_HELP[d.kind]}</div>
  </div>
{/each}

<div class="sect">Options <span class="muted">one output each</span> <button class="mini" onclick={addOption}>+ Option</button></div>
<p class="f-help">The choices listed under the text, numbered 1–9 and 0 in game. Each one leads on from its dot on the chart. ⋯ opens its settings: id, tooltip, story-point cost, show once, conditions.</p>
<table class="opts">
  <tbody>
    {#each node.options as o, i (o.id)}
      {@const t = target(o.id)}
      <tr class:story={!!o.story}>
        <td class="num">{i + 1}</td>
        <td><input type="text" value={o.text} onchange={(e) => { const v = e.currentTarget.value; const oid = o.id; edOpt(oid, (x) => { x.text = v }); autoOptionId(oid, v) }} /></td>
        <td class="to muted">{t ? `→ ${t.type}` : '→ ?'}</td>
        <td class="btns"><button class="mini" onclick={() => (openOpt = openOpt === o.id ? null : o.id)} title="More settings">⋯</button><button class="mini" onclick={() => moveOption(o.id, -1)} disabled={i === 0}>↑</button><button class="mini" onclick={() => removeOption(o.id)}>✕</button></td>
      </tr>
      {#if o.story || o.showOnce || o.showIf?.length || o.tooltip || o.shortcut || o.disabledIf}
        <tr><td></td><td colspan="3" class="muted small">{[o.story ? `story point ×${o.story.cost}` : '', o.showOnce ? `once per ${o.showOnce === 'ever' ? 'playthrough' : 'conversation'}` : '', o.showIf?.length ? `only if ${o.showIf.join(', ')}` : '', o.tooltip ? 'tooltip' : '', o.shortcut ? `shortcut ${o.shortcut}` : '', o.disabledIf ? 'disabled when…' : ''].filter(Boolean).join(' · ')}</td></tr>
      {/if}
      {#if openOpt === o.id}
        <tr><td></td><td colspan="3">
          <div class="grid2 sub">
            <Field label="Option id" help={`Exported as ${qid}_${o.id}; conditions can test it. Never shown in game.`}>
              <input type="text" class="mono" value={o.id} onchange={(e) => renameOption(o.id, e.currentTarget.value)} />
            </Field>
            <Field label="Tooltip" help="Shown when the player hovers over the option.">
              <input type="text" value={o.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; edOpt(o.id, (x) => { x.tooltip = v || undefined }) }} />
            </Field>
            <Field label="Story points" help="Above 0: a green story option that costs this many story points, with vanilla's confirmation.">
              <input type="number" min="0" max="5" value={o.story?.cost ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edOpt(o.id, (x) => { x.story = v > 0 ? { cost: v } : undefined }) }} />
            </Field>
            <Field label="Shortcut" help="Esc picks this option (use it for leave or decline).">
              <select value={o.shortcut ?? ''} onchange={(e) => { const v = e.currentTarget.value; edOpt(o.id, (x) => { x.shortcut = v || undefined }) }}><option value="">—</option><option value="ESC">Esc</option></select>
            </Field>
            <Field label="Show once" help="Hides the option after it is picked: until the dialog closes, or for the rest of the playthrough.">
              <select value={o.showOnce ?? ''} onchange={(e) => { const v = e.currentTarget.value as '' | 'conversation' | 'ever'; edOpt(o.id, (x) => { x.showOnce = v || undefined }) }}><option value="">no</option><option value="conversation">once per conversation</option><option value="ever">once ever</option></select>
            </Field>
            <Field label="Only show if" help="Condition lines that must all be true for the option to be listed.">
              <LinesInput lines={o.showIf ?? []} {templates} onChange={(l) => edOpt(o.id, (x) => { x.showIf = l.length ? l : undefined })} />
            </Field>
            <Field label="Disabled if" help="Listed but greyed out (not pickable) while these conditions are true; empty = always.">
              <div><label class="chk"><input type="checkbox" checked={!!o.disabledIf} onchange={(e) => { const v = e.currentTarget.checked; edOpt(o.id, (x) => { x.disabledIf = v ? [] : undefined }) }} /> shown greyed out</label>{#if o.disabledIf}<LinesInput lines={o.disabledIf} {templates} placeholder="(always)" onChange={(l) => edOpt(o.id, (x) => { x.disabledIf = l })} />{/if}</div>
            </Field>
          </div>
        </td></tr>
      {/if}
    {/each}
  </tbody>
</table>
{#if !node.options.length}<div class="muted small">No options: the dialog continues to the next node by itself.</div>{/if}

<div class="sect">Extra conditions <span class="muted">added to this rule</span></div>
<p class="f-help">Condition lines (rules.csv syntax) that must also be true for this text to show. Most dialogs need none.</p>
<LinesInput lines={node.conditions} {templates} onChange={(l) => ed((n) => { n.conditions = l })} />
<div class="sect">Extra script lines</div>
<p class="f-help">rules.csv script commands run when this text shows, before the options. Prefer an Action node; this is for commands the editor has no form for.</p>
<LinesInput lines={node.script} onChange={(l) => ed((n) => { n.script = l })} placeholder="e.g. AdjustRep hegemony 5" />

<style>
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 2px 8px; align-items: center; margin-bottom: 6px; }
  p.f-help { margin: 0 0 4px; }
  .self { align-self: flex-start; }
  .grid2.sub { margin: 4px 0 6px; }
  .grid2 input, .grid2 select { width: 100%; padding: 3px 6px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 10px 0 4px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  textarea { width: 100%; resize: vertical; }
  .disp { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; font-size: 11px; flex-wrap: wrap; }
  .disp .dk { width: 100%; color: var(--text); font-size: 12px; }
  .disp .dh { width: 100%; }
  .disp input[type='number'] { width: 70px; }
  .disp input[type='text'] { flex: 1; min-width: 80px; }
  .disp .at { font-size: 11px; padding: 1px 4px; }
  .opts { width: 100%; border-collapse: collapse; font-size: 12px; }
  .opts td { padding: 2px 3px; vertical-align: middle; }
  .opts input { width: 100%; padding: 2px 6px; }
  .opts tr.story input { color: rgb(163,239,128); }
  .num { color: var(--muted); width: 14px; }
  .to { font-size: 11px; white-space: nowrap; width: 60px; }
  .btns { white-space: nowrap; width: 76px; }
  .mini { padding: 0 6px; font-size: 11px; }
  .chk { display: flex; gap: 4px; align-items: center; font-size: 11px; color: var(--muted); }
  .small { font-size: 11px; }
</style>
