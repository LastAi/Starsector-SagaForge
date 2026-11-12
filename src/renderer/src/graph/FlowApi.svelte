<script lang="ts">
  /** Placed inside <SvelteFlow>: hands the flow's viewport API to the page (screen → chart positions, fit to nodes). */
  import { useSvelteFlow } from '@xyflow/svelte'
  import { onMount } from 'svelte'

  export interface FlowHandle {
    toFlow(x: number, y: number): { x: number; y: number }
    fit(ids?: string[]): void
  }
  interface Props { onReady: (api: FlowHandle) => void }
  let { onReady }: Props = $props()
  const flow = useSvelteFlow()
  onMount(() => onReady({
    toFlow: (x, y) => flow.screenToFlowPosition({ x, y }),
    fit: (ids) => { flow.fitView(ids?.length ? { nodes: ids.map((id) => ({ id })), maxZoom: 1, duration: 250 } : { maxZoom: 1, duration: 250 }) }
  }))
</script>
