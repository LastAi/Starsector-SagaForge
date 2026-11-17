<script lang="ts">
  /** Placed inside <SvelteFlow>: hands the flow's viewport API to the page (screen → chart positions, fit to nodes). */
  import { useSvelteFlow } from '@xyflow/svelte'
  import { onMount } from 'svelte'

  export interface FlowHandle {
    toFlow(x: number, y: number): { x: number; y: number }
    fit(ids?: string[]): void
    /** Pan (same zoom) so the node is on screen, if it is off-screen or under the minimap. */
    reveal(id: string): void
  }
  interface Props { onReady: (api: FlowHandle) => void }
  let { onReady }: Props = $props()
  const flow = useSvelteFlow()
  onMount(() => onReady({
    toFlow: (x, y) => flow.screenToFlowPosition({ x, y }),
    fit: (ids) => { flow.fitView(ids?.length ? { nodes: ids.map((id) => ({ id })), maxZoom: 1, duration: 250 } : { maxZoom: 1, duration: 250 }) },
    reveal: (id) => {
      const n = flow.getNode(id)
      const pane = document.querySelector('.svelte-flow')?.getBoundingClientRect()
      if (!n || !pane) return
      const w = n.measured?.width ?? 220, h = n.measured?.height ?? 100
      const a = flow.flowToScreenPosition({ x: n.position.x, y: n.position.y })
      const b = flow.flowToScreenPosition({ x: n.position.x + w, y: n.position.y + h })
      const m = 16
      const inside = a.x >= pane.left + m && a.y >= pane.top + m && b.x <= pane.right - m && b.y <= pane.bottom - m
      // the minimap sits in the bottom-right corner (about 200×130)
      const underMap = b.x > pane.right - 200 && b.y > pane.bottom - 130
      if (inside && !underMap) return
      flow.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: flow.getViewport().zoom, duration: 250 })
    }
  }))
</script>
