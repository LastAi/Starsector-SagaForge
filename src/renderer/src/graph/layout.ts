/** Auto-layout with elkjs (layered, left to right, one port per handle), PLAN.md §2 and §5. */
import ELK from 'elkjs/lib/elk.bundled.js'

const elk = new ELK()

export interface LayoutNode { id: string; width: number; height: number; ports?: string[] }
export interface LayoutEdge { id: string; from: string; to: string; port?: string }

/** Positions (top-left) by node id. */
export async function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: { spacing?: number; direction?: 'RIGHT' | 'DOWN' } = {}): Promise<Map<string, { x: number; y: number }>> {
  const ids = new Set(nodes.map((n) => n.id))
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': opts.direction ?? 'RIGHT',
      'elk.spacing.nodeNode': String(opts.spacing ?? 40),
      'elk.layered.spacing.nodeNodeBetweenLayers': String((opts.spacing ?? 40) * 1.6),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.portConstraints': 'FIXED_ORDER'
    },
    children: nodes.map((n) => ({
      id: n.id, width: n.width, height: n.height,
      ports: (n.ports ?? []).map((p, i) => ({ id: `${n.id}::${p}`, layoutOptions: { 'elk.port.side': 'EAST', 'elk.port.index': String(i) } }))
    })),
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => {
      const n = nodes.find((x) => x.id === e.from)
      const src = e.port && n?.ports?.includes(e.port) ? `${e.from}::${e.port}` : e.from
      return { id: e.id, sources: [src], targets: [e.to] }
    })
  }
  const out = await elk.layout(graph)
  const pos = new Map<string, { x: number; y: number }>()
  for (const c of out.children ?? []) pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 })
  return pos
}
