/**
 * Crop and resize images in the renderer, to PNG (R1, R2; docs/DESIGN-PHASE1.md §3). What the
 * import dialog previews is exactly what is written.
 */

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be read.'))
    img.src = url
  })
}

/**
 * The crop of `img` (source pixels) scaled to w×h. Big reductions are done in halving steps,
 * which keeps fine detail (fur, text) cleaner than one big step.
 */
export function renderCanvas(img: CanvasImageSource, crop: { x: number; y: number; w: number; h: number }, w: number, h: number): HTMLCanvasElement {
  let src: CanvasImageSource = img
  let sx = crop.x, sy = crop.y, sw = crop.w, sh = crop.h
  while (sw / 2 >= w * 1.5 && sh / 2 >= h * 1.5) {
    const c = document.createElement('canvas')
    c.width = Math.round(sw / 2); c.height = Math.round(sh / 2)
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height)
    src = c; sx = 0; sy = 0; sw = c.width; sh = c.height
  }
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const g = out.getContext('2d')!
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h)
  return out
}

export async function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('The image could not be converted to PNG.')
  return new Uint8Array(await blob.arrayBuffer())
}
