<script lang="ts">
  /** #47 §5: replace every use of an id the target game version doesn't have (one undo step). */
  import Modal from './Modal.svelte'
  import IdInput from './IdInput.svelte'
  import Field from './Field.svelte'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { optionsFor, replacing } from '../state/versions.svelte'
  import { replaceRefs } from '../../../shared/versionrefs'

  const req = $derived(replacing.req!)
  let to = $state('')
  // the old id's name, from the other install, helps find its successor
  const oldName = $derived.by(() => {
    const o = app.otherIndex
    if (!o || !req) return ''
    const all = [...o.factions, ...o.hulls, ...o.variants, ...o.wings, ...o.weapons, ...o.hullmods, ...o.items, ...o.customEntityTypes, ...o.planetTypes]
    return all.find((x) => x.id === req.id)?.name ?? ''
  })
  function apply() {
    const v = to.trim()
    if (!v || !req) return
    let n = 0
    const r = req
    project.change((m) => { n = replaceRefs(m, r.cat, r.id, v) })
    app.flash(`Replaced ${n} use${n === 1 ? '' : 's'} of ${r.id} with ${v}.`)
    replacing.req = null
  }
</script>

{#if req}
  <Modal title="Pick a replacement" onClose={() => (replacing.req = null)}>
    <p>Every use of the {req.cat} <span class="mono">{req.id}</span>{oldName ? ` (${oldName})` : ''} is replaced, in one step you can undo.</p>
    <div class="grid2">
      <Field label="Replace with" help="Ids of the target game version (and the installed mods) only.">
        <IdInput value={to} options={optionsFor(req.cat)} strict onCommit={(v) => (to = v)} placeholder={oldName || req.id} />
      </Field>
    </div>
    {#snippet actions()}<button onclick={() => (replacing.req = null)}>Cancel</button><button class="primary" disabled={!to.trim()} onclick={apply}>Replace</button>{/snippet}
  </Modal>
{/if}

<style>
  .grid2 { display: grid; grid-template-columns: 110px 1fr; gap: 2px 10px; align-items: center; }
</style>
