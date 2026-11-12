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

  async function addIllustration() {
    const abs = await window.api.pickFile({ title: 'Choose an illustration (vanilla ones are about 480×300)', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
    if (!abs) return
    const base = abs.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
    const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
    const key = `${project.prefix}${base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(new RegExp(`^${project.prefix}`), '')}`
    const to = project.copyIn(abs, `graphics/illustrations/${key}${ext}`)
    project.change((mm) => { (mm.project.illustrations ??= {})[key] = to })
    ed((n) => { if (n.visual.kind === 'illustration') n.visual.key = key })
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

  function addOption() {
    ed((n) => { n.options.push({ id: uniqueId('option', n.options.map((o) => o.id)), text: 'New option' }) })
  }
  const edOpt = (oid: string, fn: (o: OptionDef) => void) => ed((n) => { const o = n.options.find((x) => x.id === oid); if (o) fn(o) })
  function renameOption(oid: string, to: string) {
    const t = to.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    if (!t || t === oid || node.options.some((o) => o.id === t)) return
    editNode<DialogNode>(qid, nid, (n, q) => {
      const o = n.options.find((x) => x.id === oid)
      if (o) o.id = t
      for (const e of q.edges) if (e.from === nid && e.handle === oid) e.handle = t
    })
  }
  function moveOption(oid: string, d: number) {
    ed((n) => { const i = n.options.findIndex((o) => o.id === oid); const j = i + d; if (i < 0 || j < 0 || j >= n.options.length) return; const [o] = n.options.splice(i, 1); n.options.splice(j, 0, o) })
  }
  function removeOption(oid: string) {
    editNode<DialogNode>(qid, nid, (n, q) => { n.options = n.options.filter((o) => o.id !== oid); q.edges = q.edges.filter((e) => !(e.from === nid && e.handle === oid)) })
  }
  const target = (oid: string) => { const e = quest.edges.find((x) => x.from === nid && x.handle === oid); return e ? quest.nodes.find((x) => x.id === e.to) : undefined }
  let openOpt = $state<string | null>(null)
</script>

<div class="grid2">
  <label for="dn-title">Title</label><input id="dn-title" type="text" value={node.title ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((n) => { n.title = v }) }} placeholder="shown on the chart" />
  <span class="lbl">Speaker</span><IdInput value={node.speaker ?? ''} options={people} strict placeholder="(none)" onCommit={(v) => ed((n) => { n.speaker = v || undefined; if (n.visual.kind === 'person' && v) n.visual.person = v })} />
  <label for="dn-vis">Visual</label>
  <select id="dn-vis" value={node.visual.kind === 'none' ? 'keep' : node.visual.kind} onchange={(e) => setVisual(e.currentTarget.value as Visual['kind'])}>
    {#each VISUALS as v (v.kind)}<option value={v.kind}>{v.label}</option>{/each}
  </select>
  {#if node.visual.kind === 'person'}
    {@const v = node.visual}
    <span class="lbl">Person</span><IdInput value={v.person} options={people} strict onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.person = x })} />
    <span class="lbl">2nd / 3rd</span>
    <span class="row"><IdInput value={v.second ?? ''} options={people} placeholder="second person" onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.second = x || undefined })} /><IdInput value={v.third ?? ''} options={people} placeholder="third" onCommit={(x) => ed((n) => { if (n.visual.kind === 'person') n.visual.third = x || undefined })} /></span>
  {:else if node.visual.kind === 'illustration'}
    <span class="lbl">Illustration</span><IdInput value={node.visual.key} options={illus} strict onCommit={(x) => ed((n) => { if (n.visual.kind === 'illustration') n.visual.key = x })} />
    <span></span><button class="mini" onclick={addIllustration} title="Copied into the mod's graphics/illustrations and registered in its settings.json on Export">+ Use my own image…</button>
  {:else if node.visual.kind === 'planet' || node.visual.kind === 'mapMarker'}
    <span class="lbl">Entity</span><input type="text" class="mono" value={node.visual.entity} onchange={(e) => { const x = e.currentTarget.value; ed((n) => { if (n.visual.kind === 'planet' || n.visual.kind === 'mapMarker') n.visual.entity = x }) }} />
    {#if node.visual.kind === 'planet'}<span></span><label class="chk"><input type="checkbox" checked={!!node.visual.info} onchange={(e) => { const x = e.currentTarget.checked; ed((n) => { if (n.visual.kind === 'planet') n.visual.info = x }) }} /> planet info panel (SagaLib)</label>{/if}
  {:else if node.visual.kind === 'fleets'}
    <span class="lbl">Encounter</span><IdInput value={node.visual.encounter} options={m.encounters.map((e) => ({ id: e.id, name: e.name }))} onCommit={(x) => ed((n) => { if (n.visual.kind === 'fleets') n.visual.encounter = x })} />
  {:else if node.visual.kind === 'ship'}
    <span class="lbl">Variant</span><input type="text" class="mono" value={node.visual.variant} onchange={(e) => { const x = e.currentTarget.value; ed((n) => { if (n.visual.kind === 'ship') n.visual.variant = x }) }} />
  {/if}
</div>

<div class="sect">Text <span class="row">
  <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) insertToken(v) }}><option value="">+ token…</option>{#each tokens as t (t.token)}<option value={t.token}>{t.label}</option>{/each}</select>
  <button class="mini" onclick={addVariation} title="Wording that changes with the situation (an inline phrase)">+ variation</button>
</span></div>
<textarea bind:this={textArea} rows="7" bind:value={text} onblur={commitText} spellcheck="true" placeholder={'"Speech in quotes," narration in second person.\n\nA blank line starts a new paragraph. A line with only OR starts a random variant.'}></textarea>
{#if node.phrases.length}
  {#each node.phrases as p, i (p.token)}
    <PhraseEditor phrase={p} {templates} onChange={(np) => ed((n) => { n.phrases[i] = np })} onRemove={() => ed((n) => { n.phrases.splice(i, 1); n.text = n.text.split(p.token).join('') })} />
  {/each}
{/if}
<div class="grid2">
  <span class="lbl">Highlights</span>
  <input type="text" value={node.highlights.join(' | ')} placeholder="words to highlight, separated by |" onchange={(e) => { const v = e.currentTarget.value.split('|').map((s) => s.trim()).filter(Boolean); ed((n) => { n.highlights = v }) }} />
</div>

<div class="sect">Displays <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) addDisplay(v as Display['kind']) }}><option value="">+ display…</option>{#each DISPLAYS as d (d.kind)}<option value={d.kind}>{d.label}{d.lib ? ' (SagaLib)' : ''}</option>{/each}</select></div>
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
  </div>
{/each}

<div class="sect">Options <span class="muted">one output each</span> <button class="mini" onclick={addOption}>+ Option</button></div>
<table class="opts">
  <tbody>
    {#each node.options as o, i (o.id)}
      {@const t = target(o.id)}
      <tr class:story={!!o.story}>
        <td class="num">{i + 1}</td>
        <td><input type="text" value={o.text} onchange={(e) => { const v = e.currentTarget.value; edOpt(o.id, (x) => { x.text = v }) }} /></td>
        <td class="to muted">{t ? `→ ${t.type}` : '→ ?'}</td>
        <td class="btns"><button class="mini" onclick={() => (openOpt = openOpt === o.id ? null : o.id)} title="More settings">⋯</button><button class="mini" onclick={() => moveOption(o.id, -1)} disabled={i === 0}>↑</button><button class="mini" onclick={() => removeOption(o.id)}>✕</button></td>
      </tr>
      {#if o.story || o.showOnce || o.showIf?.length || o.tooltip || o.shortcut || o.disabledIf}
        <tr><td></td><td colspan="3" class="muted small">{[o.story ? `story point ×${o.story.cost}` : '', o.showOnce ? `once per ${o.showOnce === 'ever' ? 'playthrough' : 'conversation'}` : '', o.showIf?.length ? `only if ${o.showIf.join(', ')}` : '', o.tooltip ? 'tooltip' : '', o.shortcut ? `shortcut ${o.shortcut}` : '', o.disabledIf ? 'disabled when…' : ''].filter(Boolean).join(' · ')}</td></tr>
      {/if}
      {#if openOpt === o.id}
        <tr><td></td><td colspan="3">
          <div class="grid2 sub">
            <span class="lbl">Option id</span><input type="text" class="mono" value={o.id} onchange={(e) => renameOption(o.id, e.currentTarget.value)} title="Exported as {qid}_{o.id}" />
            <span class="lbl">Tooltip</span><input type="text" value={o.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; edOpt(o.id, (x) => { x.tooltip = v || undefined }) }} />
            <span class="lbl">Story points</span><input type="number" min="0" max="5" value={o.story?.cost ?? 0} onchange={(e) => { const v = Number(e.currentTarget.value); edOpt(o.id, (x) => { x.story = v > 0 ? { cost: v } : undefined }) }} />
            <span class="lbl">Shortcut</span><select value={o.shortcut ?? ''} onchange={(e) => { const v = e.currentTarget.value; edOpt(o.id, (x) => { x.shortcut = v || undefined }) }}><option value="">—</option><option value="ESC">Esc</option></select>
            <span class="lbl">Show once</span><select value={o.showOnce ?? ''} onchange={(e) => { const v = e.currentTarget.value as '' | 'conversation' | 'ever'; edOpt(o.id, (x) => { x.showOnce = v || undefined }) }}><option value="">no</option><option value="conversation">once per conversation</option><option value="ever">once ever</option></select>
            <span class="lbl">Only show if</span><LinesInput lines={o.showIf ?? []} {templates} onChange={(l) => edOpt(o.id, (x) => { x.showIf = l.length ? l : undefined })} />
            <span class="lbl">Disabled if</span><div><label class="chk"><input type="checkbox" checked={!!o.disabledIf} onchange={(e) => { const v = e.currentTarget.checked; edOpt(o.id, (x) => { x.disabledIf = v ? [] : undefined }) }} /> shown greyed out</label>{#if o.disabledIf}<LinesInput lines={o.disabledIf} {templates} placeholder="(always)" onChange={(l) => edOpt(o.id, (x) => { x.disabledIf = l })} />{/if}</div>
          </div>
        </td></tr>
      {/if}
    {/each}
  </tbody>
</table>
{#if !node.options.length}<div class="muted small">No options: the dialog continues to the next node by itself.</div>{/if}

<div class="sect">Extra conditions <span class="muted">added to this rule</span></div>
<LinesInput lines={node.conditions} {templates} onChange={(l) => ed((n) => { n.conditions = l })} />
<div class="sect">Extra script lines</div>
<LinesInput lines={node.script} onChange={(l) => ed((n) => { n.script = l })} placeholder="e.g. AdjustRep hegemony 5" />

<style>
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 4px 8px; align-items: center; margin-bottom: 6px; }
  .grid2.sub { margin: 4px 0 6px; }
  .grid2 input, .grid2 select { width: 100%; padding: 3px 6px; }
  .lbl, .grid2 label { color: var(--muted); font-size: 12px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .sect { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 10px 0 4px; }
  .sect select, .sect button { text-transform: none; letter-spacing: 0; font-size: 11px; padding: 1px 6px; }
  textarea { width: 100%; resize: vertical; }
  .disp { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; font-size: 11px; flex-wrap: wrap; }
  .disp .dk { width: 100%; color: var(--muted); }
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
