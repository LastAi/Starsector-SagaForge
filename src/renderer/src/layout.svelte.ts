// Copied from Ship Editor (src/renderer/src/layout.svelte.ts); may drift, see docs/PLAN.md §2.
/** Panel sizes (dragged by the user), kept in localStorage. */
const KEY = 'sf.layout'

export interface Layout { left: number; right: number; sheet: number; dock: number; ctx: number }
export const DEFAULT_LAYOUT: Layout = { left: 280, right: 340, sheet: 270, dock: 330, ctx: 320 }
export const LIMITS: Record<keyof Layout, [number, number]> = { left: [160, 700], right: [300, 1100], sheet: [120, 900], dock: [140, 900], ctx: [220, 700] }

function load(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Layout>
    const out = { ...DEFAULT_LAYOUT }
    for (const k of Object.keys(out) as (keyof Layout)[]) {
      const n = Number(v[k])
      if (Number.isFinite(n)) out[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], n))
    }
    return out
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export const layout = $state<Layout>(load())

export function saveLayout(): void {
  try { localStorage.setItem(KEY, JSON.stringify(layout)) } catch { /* private mode etc. */ }
}
