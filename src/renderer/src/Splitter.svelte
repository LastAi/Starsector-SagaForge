<!-- Copied from Ship Editor (src/renderer/src/Splitter.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts">
  /**
   * A drag handle between two panels. Dragging changes `value` (pixels); sign = -1 when the panel
   * is on the right/bottom (dragging left/up makes it bigger). Double-click resets it.
   */
  interface Props {
    axis: 'x' | 'y'
    value: number
    min: number
    /** Upper limit, worked out when the drag starts (so it can depend on the window size). */
    max: () => number
    sign?: 1 | -1
    label: string
    onChange: (v: number) => void
    onDone: () => void
    onReset: () => void
    style?: string
  }
  let { axis, value, min, max, sign = 1, label, onChange, onDone, onReset, style = '' }: Props = $props()

  let drag: { at: number; v: number; max: number } | null = null
  let active = $state(false)

  function down(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag = { at: axis === 'x' ? e.clientX : e.clientY, v: value, max: Math.max(min, value, max()) }
    active = true
  }
  function move(e: PointerEvent) {
    if (!drag) return
    const d = (axis === 'x' ? e.clientX : e.clientY) - drag.at
    onChange(Math.round(Math.max(min, Math.min(drag.max, drag.v + sign * d))))
  }
  function up() {
    if (!drag) return
    drag = null
    active = false
    onDone()
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 10
    const dec = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const inc = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    if (e.key !== dec && e.key !== inc) return
    e.preventDefault()
    const d = (e.key === inc ? step : -step) * sign
    onChange(Math.max(min, Math.min(Math.max(value, max()), value + d)))
    onDone()
  }
</script>

<!-- a focusable separator is a widget (ARIA): it can be moved with the arrow keys -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="split {axis}" class:active {style} role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
  aria-label={label} aria-valuenow={value} tabindex="0" title={`${label}: drag to resize, double-click to reset`}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} ondblclick={onReset} onkeydown={key}></div>

<style>
  .split { z-index: 8; touch-action: none; outline: none; }
  .split.x { position: relative; width: 7px; margin: 0 -3px; cursor: col-resize; }
  .split.y { height: 6px; margin: -3px 0; position: relative; cursor: row-resize; flex: none; }
  .split::after { content: ''; position: absolute; background: transparent; transition: background 0.1s; }
  .split.x::after { left: 3px; top: 0; bottom: 0; width: 1px; }
  .split.y::after { top: 2px; left: 0; right: 0; height: 2px; }
  .split:hover::after, .split.active::after, .split:focus-visible::after { background: var(--accent); }
</style>
