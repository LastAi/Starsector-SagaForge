<script lang="ts">
  /**
   * #67 U43: replace the mod's copy of a node group with another version (newer, or a modified copy).
   * Placed nodes keep the values of fields with the same key and type; what is dropped, reset or
   * disconnected is listed first.
   */
  import Modal from '../ui/Modal.svelte'
  import { project } from '../state/project.svelte'
  import { applyReplace, replacePlan, type NodeGroupDef } from '../../../shared/nodegroups'

  interface Props { from: NodeGroupDef; to: NodeGroupDef; source: string; onClose: () => void }
  let { from, to, source, onClose }: Props = $props()
  const m = $derived(project.m!)
  const plan = $derived(replacePlan(m, from, to))
  const uses = $derived(m.quests.flatMap((q) => q.nodes.filter((n) => n.type === 'group' && n.group === from.id).map((n) => `${q.title} › ${n.id}`)))
  const label = (d: NodeGroupDef, k: string) => d.fields.find((f) => f.key === k)?.label ?? k
  function replace() {
    const def = $state.snapshot(to) as NodeGroupDef
    project.change((mm) => applyReplace(mm, def))
    onClose()
  }
</script>

<Modal title="Replace node group" {onClose} width={560} keepOpen>
  <p><b>{from.label}</b> <span class="mono">{from.id}</span>: the mod's copy is version {from.version ?? 1}; {source} has version {to.version ?? 1}{(to.version ?? 1) === (from.version ?? 1) ? ' with other content (a modified copy)' : ''}.</p>
  {#if to.changes}<p class="muted">What changed: {to.changes}</p>{/if}
  <p class="muted small">Placed in {uses.length} place{uses.length === 1 ? '' : 's'}{uses.length ? `: ${uses.join(', ')}` : ''}. They all use the new version.</p>
  <ul class="small">
    {#if plan.kept.length}<li>Kept: {plan.kept.map((k) => label(to, k)).join(', ')}</li>{/if}
    {#if plan.added.length}<li class="good">New fields (their defaults): {plan.added.map((k) => label(to, k)).join(', ')}</li>{/if}
    {#if plan.dropped.length}<li class="warn">Dropped (their values are lost): {plan.dropped.map((k) => label(from, k)).join(', ')}</li>{/if}
    {#if plan.reset.length}<li class="warn">Back to the default (the old value isn't one of the new choices): {plan.reset.map((k) => label(to, k)).join(', ')}</li>{/if}
    {#if plan.lostExits.length}<li class="bad">Connections removed (the exit is gone): {plan.lostExits.map((x) => `${x.node} › ${x.exit}`).join(', ')}</li>{/if}
    {#if !plan.dropped.length && !plan.reset.length && !plan.lostExits.length}<li class="muted">Nothing set on the placed nodes is lost.</li>{/if}
  </ul>
  {#snippet actions()}
    <button onclick={onClose}>Cancel</button>
    <button class="primary" onclick={replace}>Replace</button>
  {/snippet}
</Modal>

<style>
  .good { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  .muted { color: var(--muted); } .small { font-size: 12px; } .mono { font-family: var(--mono); }
  ul { margin: 6px 0; padding-left: 18px; } li { margin: 2px 0; }
</style>
