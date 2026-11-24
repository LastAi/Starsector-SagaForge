<script lang="ts">
  /** Placed inside <SvelteFlow>: hands the flow's viewport API to the page (screen → chart positions, fit to nodes). */
  import { useSvelteFlow } from '@xyflow/svelte'
  import { onMount } from 'svelte'

  export interface FlowHandle {
    toFlow(x: number, y: number): { x: number; y: number }
    fit(ids?: string[]): void
    /** Pan (same zoom) so the node is on screen, if it is off-screen or under the minimap. */
    reveal(id: string): void
    /**
     * #67 U10: the view a chart opens with. A chart that fits at 70% or more is fitted whole;
     * a longer one opens at 70% on its left end (the Start node), vertically on what is there.
     */
    opening(align?: 'center' | 'top'): void
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
    },
    // 'top' (#67 U19, the Saga board): a long board opens at its top-left corner
    opening: (align = 'center') => {
      const MIN = 0.7, PAD = 40
      const ns = flow.getNodes().filter((n) => !n.id.startsWith('frame:') && !n.hidden)
      const pane = document.querySelector('.svelte-flow')?.getBoundingClientRect()
      if (!ns.length || !pane || pane.width < 50) return
      const box = (n: (typeof ns)[number]) => ({ l: n.position.x, t: n.position.y, r: n.position.x + (n.measured?.width ?? 220), b: n.position.y + (n.measured?.height ?? 100) })
      const all = ns.map(box)
      const l = Math.min(...all.map((b) => b.l)), r = Math.max(...all.map((b) => b.r))
      const t = Math.min(...all.map((b) => b.t)), bt = Math.max(...all.map((b) => b.b))
      const fitZoom = Math.min((pane.width - 2 * PAD) / (r - l), (pane.height - 2 * PAD) / (bt - t), 1)
      if (fitZoom >= MIN) { flow.fitView({ maxZoom: 1, padding: 0.08 }); return }
      // what is visible at 70% from the left end: centre those vertically
      const span = (pane.width - 2 * PAD) / MIN
      const seen = all.filter((b) => b.l <= l + span)
      const st = Math.min(...seen.map((b) => b.t)), sb = Math.max(...seen.map((b) => b.b))
      const y = align === 'top' ? PAD - t * MIN : (sb - st) * MIN < pane.height - 2 * PAD ? PAD + ((pane.height - 2 * PAD) - (sb - st) * MIN) / 2 - st * MIN : PAD - st * MIN
      flow.setViewport({ x: PAD - l * MIN, y, zoom: MIN })
    }
  }))
</script>
