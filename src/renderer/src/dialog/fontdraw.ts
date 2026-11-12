/**
 * Draws text with the game's bitmap fonts on a canvas (PLAN.md Q6). The .fnt and its page image
 * are read from the game folder at runtime (read-only) and never copied. If a font is missing, a
 * system font is used and `fallback` is set so the panel can say so.
 */
import { parseFnt, layoutLine, measure, wrap, type BMFont } from '../../../shared/bmfont'
import type { FontData } from '../../../shared/api'

export interface GameFont {
  key: string
  fnt: BMFont | null
  pages: HTMLImageElement[]
  /** Tinted page canvases by color. */
  tinted: Map<string, HTMLCanvasElement[]>
  fallback: boolean
  /** CSS font used when fallback. */
  css: string
}

export async function makeFont(data: FontData | null, key: string, fallbackPx: number): Promise<GameFont> {
  const css = `${fallbackPx}px "Segoe UI", Tahoma, sans-serif`
  if (!data) return { key, fnt: null, pages: [], tinted: new Map(), fallback: true, css }
  const fnt = parseFnt(data.fnt)
  const pages = await Promise.all(data.pages.map((p) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/png' }))
  })))
  return { key, fnt, pages, tinted: new Map(), fallback: false, css }
}

function tintedPages(f: GameFont, color: string): HTMLCanvasElement[] {
  let t = f.tinted.get(color)
  if (t) return t
  t = f.pages.map((img) => {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
    return c
  })
  f.tinted.set(color, t)
  return t
}

export function lineHeight(f: GameFont): number {
  return f.fnt ? f.fnt.lineHeight : Math.round(parseInt(f.css) * 1.3)
}

export function textWidth(ctx: CanvasRenderingContext2D, f: GameFont, s: string): number {
  if (f.fnt) return measure(f.fnt, s)
  ctx.font = f.css
  return ctx.measureText(s).width
}

export function wrapText(ctx: CanvasRenderingContext2D, f: GameFont, s: string, width: number): string[] {
  if (f.fnt) return wrap(f.fnt, s, width)
  // system-font fallback: simple greedy wrap
  ctx.font = f.css
  const out: string[] = []
  for (const hard of s.split('\n')) {
    let line = ''
    for (const w of hard.split(' ')) {
      const cand = line ? `${line} ${w}` : w
      if (ctx.measureText(cand).width > width && line) { out.push(line); line = w } else line = cand
    }
    out.push(line)
  }
  return out
}

/**
 * Draw one line at (x, y = top of the line). `colorAt(i)` gives the color of character i
 * (for highlights). Alpha is applied with globalAlpha by the caller.
 */
export function drawLine(ctx: CanvasRenderingContext2D, f: GameFont, s: string, x: number, y: number, colorAt: (i: number) => string): void {
  if (!f.fnt) {
    ctx.font = f.css
    ctx.textBaseline = 'top'
    let cx = x
    let i = 0
    for (const ch of s) {
      ctx.fillStyle = colorAt(i++)
      ctx.fillText(ch, cx, y)
      cx += ctx.measureText(ch).width
    }
    return
  }
  let i = 0
  for (const { g, x: gx } of layoutLine(f.fnt, s)) {
    const pages = tintedPages(f, colorAt(i++))
    const page = pages[g.page]
    if (page && g.width && g.height) ctx.drawImage(page, g.x, g.y, g.width, g.height, Math.round(x + gx + g.xoffset), Math.round(y + g.yoffset), g.width, g.height)
  }
}
