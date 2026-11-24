<script lang="ts">
  /**
   * #67 U43: the inspector of a placed node group: its fields (linked into the nodes inside), what
   * it stands for, a newer version to replace it with, and Expand into nodes (one way).
   */
  import type { GroupNode, QuestPlan } from '../../../shared/model'
  import { BUILTIN_GROUPS } from '../../../shared/groups'
  import { expandInstance, fieldDefault, groupValues, otherVersions, optionLabel, optionValue, ungroup, type GroupField, type GroupValue } from '../../../shared/nodegroups'
  import { fullName } from '../../../shared/personname'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { groupLib } from '../state/nodegroups.svelte'
  import { editNode, editQuest } from './edit'
  import Field from '../ui/Field.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ReplaceGroupDialog from './ReplaceGroupDialog.svelte'

  interface Props { quest: QuestPlan; node: GroupNode }
  let { quest, node }: Props = $props()
  const m = $derived(project.m!)
  const def = $derived((m.nodeGroups ?? []).find((d) => d.id === node.group))
  const vals = $derived(def ? groupValues(node, def) : {})
  const others = $derived(def ? otherVersions(def.id, m.nodeGroups ?? [], BUILTIN_GROUPS, groupLib.entries) : [])
  let replacing = $state<(typeof others)[number] | null>(null)
  /** What the group stands for here (its nodes as filled in). */
  const inside = $derived(def ? expandInstance(quest, node, def, m.project.prefix) : null)
  const uses = $derived(m.quests.reduce((k, q) => k + q.nodes.filter((n) => n.type === 'group' && n.group === node.group).length, 0))

  const ed = (fn: (n: GroupNode) => void) => editNode<GroupNode>(quest.id, node.id, fn)
  const setVal = (f: GroupField, v: GroupValue) => ed((n) => { n.values ??= {}; if (v === fieldDefault(f)) delete n.values[f.key]; else n.values[f.key] = v })

  const options = (f: GroupField): { id: string; name?: string; definedBy?: string }[] => {
    switch (f.type) {
      case 'faction': return [...m.factions.filter((x) => x.kind === 'addition').map((x) => ({ id: x.id })), ...(app.index?.factions.map((x) => ({ id: x.id, definedBy: x.definedBy })) ?? [])]
      case 'person': return [...m.people.map((p) => ({ id: p.id, name: fullName(p.name) })), ...(app.index?.people ?? [])]
      case 'encounter': return m.encounters.map((e) => ({ id: e.id, name: e.name }))
      case 'item': return [...m.items.map((i) => ({ id: i.id, name: i.name })), ...(app.index?.items ?? [])]
      case 'quest': return m.quests.map((q) => ({ id: q.id, name: q.title }))
      case 'place': return [...m.systems.flatMap((s) => s.entities.map((e) => ({ id: e.id, name: `${e.name} (${s.name})` }))), ...(app.index?.markets.flatMap((x) => x.entities.map((id) => ({ id, name: x.name, definedBy: x.definedBy }))) ?? [])]
      default: return []
    }
  }

  function expand() {
    if (!def) return
    if (!confirm(`Expand "${node.title || def.label}" into its ${inside?.nodes.length ?? 0} normal nodes?\n\nThis is one way: the nodes no longer follow the group's definition (Ctrl+Z undoes it). Rule ids stay close to what they were, but text that was translated gets new keys.`)) return
    let first: string | undefined
    const d = $state.snapshot(def)
    editQuest(quest.id, (q, mm) => { first = ungroup(q, node.id, [d], mm.project.prefix)[0] })
    if (first) app.selected.questNode = first
  }
  const describe = (n: { type: string; id: string } & Record<string, unknown>) => {
    if (n.type === 'action') return ((n.ops as { op: string; line?: string }[]) ?? []).map((o) => (o.op === 'line' ? o.line : o.op)).join(' · ') || '(nothing)'
    if (n.type === 'link') return n.mode === 'close' ? (n.toFleet ? 'cut the comm link (fleet screen)' : 'close the dialog') : `${n.mode} ${n.target ?? ''}`
    if (n.type === 'dialog') return String(n.text ?? '').slice(0, 80)
    return String(n.title ?? '')
  }
</script>

{#if !def}
  <p class="bad">This node is group <span class="mono">{node.group}</span>, which the mod doesn't have (sagaforge/nodegroups). Import it again (Node groups › Import…) or delete the node.</p>
{:else}
  <div class="ghead">
    <div><b>{def.label}</b> <span class="mono muted small">{def.id} v{def.version ?? 1}</span></div>
    {#if def.description}<p class="muted small">{def.description}</p>{/if}
    {#if def.requires?.sagalib}<p class="muted small">Needs SagaLib {def.requires.sagalib}{def.requires.game ? ` and Starsector ${def.requires.game}` : ''}.</p>{/if}
    <p class="muted small">Placed {uses} time{uses === 1 ? '' : 's'} in this mod; all follow the mod's copy of the group.</p>
  </div>
  {#each others as o (o.hash)}
    <div class="newer">{o.relation === 'newer' ? `A newer version (${o.def.version ?? 1})` : o.relation === 'older' ? `An older version (${o.def.version ?? 1})` : 'A modified copy (same version)'} is {o.source === 'builtin' ? 'in Saga Forge' : 'in your library'}{o.def.changes ? `: ${o.def.changes}` : '.'}
      <button class="mini" onclick={() => (replacing = o)}>Replace…</button></div>
  {/each}
  <div class="grid2">
    <Field label="Title" for="g-title" help="Shown on the chart only (default: the group's name).">
      <input id="g-title" type="text" value={node.title ?? ''} placeholder={def.label} onchange={(e) => { const v = e.currentTarget.value.trim(); ed((n) => { if (v) n.title = v; else delete n.title }) }} />
    </Field>
    {#each def.fields as f (f.key)}
      {@const v = vals[f.key]}
      <Field label={f.label + (f.required ? ' *' : '')} for={`g-${f.key}`} help={f.help ?? `Fills in {{${f.key}}} in the group's nodes.`}>
        {#if f.type === 'bool'}
          <label class="chk"><input id={`g-${f.key}`} type="checkbox" checked={!!v} onchange={(e) => setVal(f, e.currentTarget.checked)} /> {f.label}</label>
        {:else if f.type === 'choice'}
          <select id={`g-${f.key}`} value={String(v)} onchange={(e) => setVal(f, e.currentTarget.value)}>{#each f.options ?? [] as o (optionValue(o))}<option value={optionValue(o)}>{optionLabel(o)}</option>{/each}</select>
        {:else if f.type === 'number'}
          <input id={`g-${f.key}`} type="number" value={Number(v)} onchange={(e) => setVal(f, Number(e.currentTarget.value))} />
        {:else if f.type === 'longtext'}
          <textarea id={`g-${f.key}`} rows="3" value={String(v ?? '')} onchange={(e) => setVal(f, e.currentTarget.value)}></textarea>
        {:else if f.type === 'text'}
          <input id={`g-${f.key}`} type="text" value={String(v ?? '')} onchange={(e) => setVal(f, e.currentTarget.value)} />
        {:else}
          <IdInput value={String(v ?? '')} options={options(f)} placeholder={`${f.type} id`} onCommit={(x) => setVal(f, x)} />
        {/if}
      </Field>
    {/each}
  </div>
  {#if inside}
    <div class="sect">Inside (as exported)</div>
    <ul class="inside">
      {#each inside.nodes as n (n.id)}<li><span class="t">{n.type}</span> <span class="mono small">{describe(n as never)}</span></li>{/each}
      {#if def.exits.length}<li class="muted small">Exits: {def.exits.map((x) => x.label).join(', ')}</li>{/if}
    </ul>
  {/if}
  <div class="row">
    <button onclick={expand} title="Replace this node with the normal nodes it stands for, to change them by hand (one way)">Expand into nodes</button>
  </div>
  {#if replacing}<ReplaceGroupDialog from={def} to={replacing.def} source={replacing.source === 'builtin' ? 'Saga Forge' : 'your library'} onClose={() => (replacing = null)} />{/if}
{/if}

<style>
  .ghead { margin: 4px 0 8px; }
  .ghead p { margin: 2px 0; }
  .newer { border: 1px solid var(--accent-2); border-radius: 4px; padding: 4px 8px; margin: 6px 0; font-size: 12px; }
  .sect { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 10px 0 4px; }
  .inside { list-style: none; padding: 0; margin: 0; font-size: 12px; }
  .inside li { padding: 2px 0; border-bottom: 1px solid var(--border); }
  .inside .t { display: inline-block; min-width: 52px; color: var(--accent); }
  .row { margin-top: 10px; display: flex; gap: 6px; }
  .muted { color: var(--muted); } .small { font-size: 11px; } .mono { font-family: var(--mono); } .bad { color: var(--bad); }
  .mini { padding: 0 8px; font-size: 11px; margin-left: 6px; }
</style>
