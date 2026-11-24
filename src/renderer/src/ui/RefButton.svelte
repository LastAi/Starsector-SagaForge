<script lang="ts">
  /** #67 U34: the reference's ⓘ for a list that isn't a labelled Field (chips, op rows, section titles). */
  import { openReference } from './reference'
  let { ref, title = 'What the options mean: opens the reference' }: { ref: string; title?: string } = $props()
</script>

<button type="button" class="f-ref" {title} onclick={() => openReference(ref)}>ⓘ</button>
