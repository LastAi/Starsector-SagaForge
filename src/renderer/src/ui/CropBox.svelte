<script lang="ts">
  /**
   * A crop frame over an image (R2): drag inside it to move it, drag its corner to resize it. The
   * frame keeps the target's shape (aspect = w / h) and stays inside the image. Coordinates are the
   * image's own pixels.
   */
  interface Crop { x: number; y: number; w: number; h: number }
  interface Props { url: string; natW: number; natH: number; aspect: number; crop: Crop; onChange: (c: Crop) => void; maxW?: number; maxH?: number }
  let { url, natW, natH, aspect, crop, onChange, maxW = 520, maxH = 340 }: Props = $props()

  const scale = $derived(Math.min(maxW / natW, maxH / natH, 1))
  let drag: { mode: 'move' | 'size'; x: number; y: number; start: Crop } | null = null

  function down(e: PointerEvent, mode: 'move' | 'size') {
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag = { mode, x: e.clientX, y: e.clientY, start: { ...crop } }
  }
  function move(e: PointerEvent) {
    if (!drag) return
    const dx = (e.clientX - drag.x) / scale, dy = (e.clientY - drag.y) / scale
    const s = drag.start
    if (drag.mode === 'move') {
      onChange({ ...s, x: Math.round(Math.max(0, Math.min(natW - s.w, s.x + dx))), y: Math.round(Math.max(0, Math.min(natH - s.h, s.y + dy))) })
    } else {
      // resize from the bottom-right corner, keeping the shape and staying inside the image
      let w = Math.max(16, s.w + Math.max(dx, dy * aspect))
      w = Math.min(w, natW - s.x, (natH - s.y) * aspect)
      onChange({ ...s, w: Math.round(w), h: Math.round(w / aspect) })
    }
  }
  const up = () => { drag = null }
</script>

<div class="cb" style="width:{natW * scale}px;height:{natH * scale}px" onpointermove={move} onpointerup={up} role="presentation">
  <img src={url} alt="" draggable="false" style="width:{natW * scale}px;height:{natH * scale}px" />
  <div class="shade" style="clip-path: polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, {crop.x * scale}px {crop.y * scale}px, {crop.x * scale}px {(crop.y + crop.h) * scale}px, {(crop.x + crop.w) * scale}px {(crop.y + crop.h) * scale}px, {(crop.x + crop.w) * scale}px {crop.y * scale}px, {crop.x * scale}px {crop.y * scale}px)"></div>
  <div class="frame" style="left:{crop.x * scale}px;top:{crop.y * scale}px;width:{crop.w * scale}px;height:{crop.h * scale}px" onpointerdown={(e) => down(e, 'move')} role="slider" aria-label="Crop area: drag to move" aria-valuenow={crop.x} tabindex="0">
    <span class="corner" onpointerdown={(e) => down(e, 'size')} role="slider" aria-label="Drag to resize the crop" aria-valuenow={crop.w} tabindex="0"></span>
  </div>
</div>

<style>
  .cb { position: relative; user-select: none; touch-action: none; background: #000; }
  .cb img { display: block; }
  .shade { position: absolute; inset: 0; background: rgba(0, 0, 0, .6); pointer-events: none; }
  .frame { position: absolute; border: 1px solid #e8a83c; box-shadow: 0 0 0 1px #000; cursor: move; }
  .corner { position: absolute; right: -6px; bottom: -6px; width: 12px; height: 12px; background: #e8a83c; border: 1px solid #000; cursor: nwse-resize; }
</style>
