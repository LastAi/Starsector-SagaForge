/**
 * AngelCode BMFont (text .fnt), the format of the game's fonts (graphics/fonts/*.fnt, PLAN.md Q6).
 * Parsing, measuring and word wrapping are pure; drawing is in the renderer (dialog/fontdraw.ts).
 */
export interface Glyph { id: number; x: number; y: number; width: number; height: number; xoffset: number; yoffset: number; xadvance: number; page: number }

export interface BMFont {
  face: string
  size: number
  lineHeight: number
  base: number
  scaleW: number
  scaleH: number
  pages: string[]
  chars: Map<number, Glyph>
  kerning: Map<number, number>
}

const kernKey = (a: number, b: number) => a * 65536 + b

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of line.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) out[m[1]] = m[3] ?? m[2]
  return out
}

export function parseFnt(text: string): BMFont {
  const f: BMFont = { face: '', size: 0, lineHeight: 0, base: 0, scaleW: 0, scaleH: 0, pages: [], chars: new Map(), kerning: new Map() }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const tag = line.split(/\s+/)[0]
    const a = attrs(line)
    const n = (k: string) => Number(a[k] ?? 0)
    if (tag === 'info') { f.face = a.face ?? ''; f.size = Math.abs(n('size')) }
    else if (tag === 'common') { f.lineHeight = n('lineHeight'); f.base = n('base'); f.scaleW = n('scaleW'); f.scaleH = n('scaleH') }
    else if (tag === 'page') f.pages[n('id')] = a.file ?? ''
    else if (tag === 'char') f.chars.set(n('id'), { id: n('id'), x: n('x'), y: n('y'), width: n('width'), height: n('height'), xoffset: n('xoffset'), yoffset: n('yoffset'), xadvance: n('xadvance'), page: n('page') })
    else if (tag === 'kerning') f.kerning.set(kernKey(n('first'), n('second')), n('amount'))
  }
  return f
}

export function glyphOf(f: BMFont, code: number): Glyph | undefined {
  return f.chars.get(code) ?? f.chars.get(63) // '?'
}

/** Width of a string in pixels (advances plus kerning). */
export function measure(f: BMFont, s: string): number {
  let w = 0
  let prev = -1
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const g = glyphOf(f, c)
    if (!g) continue
    if (prev >= 0) w += f.kerning.get(kernKey(prev, c)) ?? 0
    w += g.xadvance
    prev = c
  }
  return w
}

/** Positioned glyphs of one line, starting at x = 0. */
export function layoutLine(f: BMFont, s: string): { g: Glyph; x: number; ch: string }[] {
  const out: { g: Glyph; x: number; ch: string }[] = []
  let x = 0
  let prev = -1
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const g = glyphOf(f, c)
    if (!g) continue
    if (prev >= 0) x += f.kerning.get(kernKey(prev, c)) ?? 0
    out.push({ g, x, ch })
    x += g.xadvance
    prev = c
  }
  return out
}

/**
 * Word-wrap a paragraph to a width. Breaks at spaces; a word longer than the width is split.
 * Explicit line breaks are kept. Returns the lines (without trailing spaces).
 */
export function wrap(f: BMFont, text: string, width: number): string[] {
  const out: string[] = []
  for (const hard of text.split('\n')) {
    const words = hard.split(/( +)/)
    let line = ''
    for (const w of words) {
      if (!w) continue
      const cand = line + w
      if (measure(f, cand.trimEnd()) <= width || !line.trim()) {
        if (!line.trim() && measure(f, w) > width && !/^ +$/.test(w)) {
          // split a too-long word
          let part = ''
          for (const ch of w) {
            if (measure(f, part + ch) > width && part) { out.push(part); part = '' }
            part += ch
          }
          line = part
        } else line = cand
      } else {
        out.push(line.trimEnd())
        line = /^ +$/.test(w) ? '' : w
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

/** Character ranges [start, end) of `highlights` inside `text` (first occurrence of each, in order, like the game's highlighting). */
export function highlightRanges(text: string, highlights: string[]): [number, number][] {
  const out: [number, number][] = []
  let from = 0
  for (const h of highlights) {
    if (!h) continue
    let i = text.indexOf(h, from)
    if (i < 0) i = text.indexOf(h)
    if (i < 0) continue
    out.push([i, i + h.length])
    from = i + h.length
  }
  return out
}
