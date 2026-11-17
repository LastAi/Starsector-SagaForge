<script lang="ts">
  /**
   * One form field: a visible label and a short help line under the control saying what it is and
   * where it shows in game. Renders two grid cells (label, control + help), so it drops into the
   * forms' two-column grids. Placeholders stay examples only; the label and help never disappear.
   * Optional: `later` adds the "Set later" mark (R9).
   */
  import type { Snippet } from 'svelte'
  import type { LaterSpec } from './later'
  import { openReference } from './reference'
  interface Props {
    label: string
    /** What the field is and where it shows in game (one or two short sentences). */
    help: string
    /** The control's id, so clicking the label focuses it. */
    for?: string
    /** Span both columns (label above the control), for wide controls in narrow panels. */
    wide?: boolean
    /** The reference section for this list (R8): an ⓘ button opens it. */
    ref?: string
    /** "Set later": mark the field as a to-do (R9). */
    later?: LaterSpec
    children: Snippet
  }
  let { label, help, for: forId, wide = false, ref, later, children }: Props = $props()
</script>

<div class="f-lbl" class:f-wide={wide}>
  <span class="f-name">{#if forId}<label for={forId}>{label}</label>{:else}<span>{label}</span>{/if}{#if ref}<button type="button" class="f-ref" title="What the options mean: opens the reference" onclick={() => openReference(ref!)}>ⓘ</button>{/if}</span>
  {#if later}<button type="button" class="f-later" class:on={later.active} title={later.active ? 'Marked "Set later": click to remove the mark' : 'Set later: mark this field as a to-do (listed under To do in Problems)'} onclick={later.toggle}>{later.active ? '✎ to do' : 'later'}</button>{/if}
</div>
<div class="f-ctl" class:f-wide={wide}>
  {@render children()}
  {#if later?.active}
    <div class="f-todo"><span>✎ Set later: listed under To do in Problems until this field changes. Mark as released waits for it.</span>
      <input type="text" placeholder="note (optional), e.g. made in step 6" value={later.note} onchange={(e) => later!.setNote(e.currentTarget.value)} />
    </div>
  {/if}
  <div class="f-help">{help}</div>
</div>
