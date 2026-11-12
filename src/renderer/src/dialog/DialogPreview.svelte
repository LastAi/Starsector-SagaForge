<script lang="ts">
  /**
   * The in-game dialog mock-up (PLAN.md §5, "Dialog mock-up"): visual panel on the left, text with
   * highlights and "Gained" lines, numbered options, drawn with the game's bitmap fonts and colors
   * from settings.json at the game's dialog size, with a ruler for overflow.
   */
  import { onMount } from 'svelte'
  import type { DialogView, Para, ViewOption, VisualState } from '../../../shared/rules/engine'
  import { highlightRanges } from '../../../shared/bmfont'
  import { app, loadFont, images } from '../state/app.svelte'
  import { makeFont, drawLine, lineHeight, wrapText, textWidth, type GameFont } from './fontdraw'

  export interface PersonLook { name: string; rank: string; faction: string; factionColor?: number[]; portrait: string; crest?: string }

  interface Props {
    view: DialogView
    /** Who a person id on the visual panel is. */
    person: (id: string) => PersonLook | null
    /** Icon game path for a "Gained" line's item id. */
    icon?: (id: string) => string | null
    /** Illustration path for a category/key. */
    illustration?: (category: string, key: string) => string | null
    onSelect?: (id: string) => void
    scale?: number
  }
  let { view, person, icon = () => null, illustration = () => null, onSelect, scale = 1 }: Props = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let textFont = $state<GameFont | null>(null)
  let optFont = $state<GameFont | null>(null)
  let imgs = $state<Record<string, HTMLImageElement | null>>({})
  let hover = $state<number>(-1)
  let tip = $state<{ x: number; y: number; text: string } | null>(null)
  let overflow = $state(0)
  /** Canvas size in use (full window, or compact: narrow visual column and no empty gap). */
  let CW = $state(1000)
  let CH = $state(650)
  let boxW = $state(0)
  let boxH = $state(0)
  let exact = $state(false)
  const fitScale = $derived(exact ? 1 : Math.max(0.35, Math.min(1, (boxW - 4) / CW)))
  /** Option hit boxes in canvas pixels. */
  let boxes: { x: number; y: number; w: number; h: number; o: ViewOption }[] = []

  const D = $derived(app.defs.dialog)
  const W = $derived(D.width)
  const H = $derived(D.height)
  const col = (k: string, d: number[]) => app.index?.ui.colors[k] ?? d
  const rgba = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${((c[3] ?? 255) / 255) * a})`
  const C = $derived({
    text: col('standardTextColor', [220, 220, 220, 255]),
    h: col('hColor', [255, 210, 0, 255]),
    btn: col('buttonText', [170, 222, 255, 255]),
    btnBg: col('buttonBg', [70, 222, 255, 255]),
    btnDark: col('buttonBgDark', [31, 94, 112, 175]),
    key: col('buttonShortcut', [255, 210, 0, 255]),
    story: col('storyOptionColor', [163, 239, 128, 255]),
    good: col('textFriendColor', [155, 255, 0, 255]),
    bad: col('textEnemyColor', [255, 100, 0, 255]),
    gray: col('textGrayColor', [175, 175, 175, 180])
  })

  onMount(async () => {
    textFont = await makeFont(await loadFont('defaultFont'), 'defaultFont', 15)
    optFont = await makeFont(await loadFont('graphics/fonts/insignia21LTaa.fnt'), 'options', 17)
  })

  function needImage(path: string | null | undefined) {
    if (!path || path in imgs) return
    imgs[path] = null
    images.url(path).then((u) => {
      if (!u) return
      const im = new Image()
      im.onload = () => { imgs[path] = im }
      im.src = u
    })
  }

  function colorOf(p: Para): number[] {
    const c = p.color
    if (Array.isArray(c)) return c
    switch (c) {
      case 'h': case 'highlight': return C.h
      case 'good': return C.good
      case 'bad': return C.bad
      case 'gray': case 'grey': return C.gray
      case 'story': return C.story
      case 'option': return C.btn
    }
    // AddText may name any settings.json color (textGrayColor, ...)
    if (typeof c === 'string' && app.index?.ui.colors[c]) return app.index.ui.colors[c]
    return C.text
  }

  function draw() {
    const cv = canvas
    if (!cv || !textFont || !optFont) return
    const ctx = cv.getContext('2d')!
    // The game's interaction dialog (0.98a screenshot): the text column on the LEFT, the visual on
    // the RIGHT, no frame; options are plain numbered lines under "You decide to...".
    const pad = 12
    const compact = !exact
    const tx = pad
    const tw = D.textWidth
    const gap = 14
    const hasPicture = view.visual.kind === 'image' || view.visual.kind === 'planet' || view.visual.kind === 'fleets' || view.visual.kind === 'ship'
    const vw = compact && view.visual.kind === 'none' ? 0 : compact && !hasPicture ? 180 : D.visualWidth
    const vx = tx + tw + gap

    // ---- measure
    const lh = lineHeight(textFont)
    const olh = lineHeight(optFont)
    const laid: { para: Para; lines: string[]; h: number }[] = []
    for (const p of view.paragraphs) {
      const pl = p.placeholder ? [] : wrapText(ctx, textFont, p.text, tw)
      laid.push({ para: p, lines: pl, h: p.placeholder ? p.placeholder.height : Math.max(lh, pl.length * lh) })
    }
    const pgap = Math.round(lh * 0.6)
    const total = laid.reduce((a, b) => a + b.h + pgap, 0)
    const opts = view.options
    const oh = olh + 4
    const optsH = opts.length ? olh + 8 + opts.length * oh : 0
    const avail = D.height - 2 * pad - optsH - 16
    const currentH = laid.filter((x) => !x.para.previous).reduce((a, b) => a + b.h + pgap, 0)
    overflow = Math.max(0, currentH - avail)
    const textH = Math.min(avail, total)
    const visualH = view.visual.kind === 'person' ? 210 : hasPicture ? 320 : 0
    CW = compact ? vx + vw + pad : pad + tw + gap + D.visualWidth + pad
    CH = compact ? Math.max(pad + textH + 16 + optsH + pad, visualH + 2 * pad) : D.height
    cv.width = CW
    cv.height = CH
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CW, CH)

    // ---- visual (right)
    if (vw) drawVisual(ctx, view.visual, vx, pad, vw, CH - 2 * pad)

    // ---- text (left, from the top; when longer than the area, the latest text stays visible)
    const area = compact ? textH : avail
    let y = pad + Math.min(0, area - total)
    ctx.save()
    ctx.beginPath(); ctx.rect(tx, pad, tw + 4, area + 2); ctx.clip()
    for (const blk of laid) {
      const p = blk.para
      ctx.globalAlpha = p.previous ? 0.45 : 1
      if (p.placeholder) {
        ctx.strokeStyle = 'rgba(120,140,160,0.6)'; ctx.setLineDash([4, 3])
        ctx.strokeRect(tx + 0.5, y + 0.5, tw - 1, p.placeholder.height - 1); ctx.setLineDash([])
        drawLine(ctx, textFont, p.placeholder.label, tx + 8, y + (p.placeholder.height - lh) / 2, () => rgba(C.gray))
        y += p.placeholder.height + pgap
        continue
      }
      const base = colorOf(p)
      const ranges = highlightRanges(p.text, p.highlights)
      const hcols = p.highlightColors
      let offs = 0
      for (const s of blk.lines) {
        const lineStart = p.text.indexOf(s, offs)
        offs = lineStart >= 0 ? lineStart + s.length : offs
        drawLine(ctx, textFont, s, tx, y, (i) => {
          const at = (lineStart >= 0 ? lineStart : 0) + i
          const r = ranges.findIndex(([a, b]) => at >= a && at < b)
          if (r < 0) return rgba(base)
          const hc = hcols?.[r]
          return hc === 'good' ? rgba(C.good) : hc === 'bad' ? rgba(C.bad) : rgba(C.h)
        })
        y += lh
      }
      if (!blk.lines.length) y += lh
      y += pgap
    }
    ctx.restore()
    ctx.globalAlpha = 1

    // ---- options under the text: "You decide to..." then "1. Text [Esc]"
    boxes = []
    if (opts.length) {
      let oy = compact ? pad + textH + 16 : CH - pad - optsH
      drawLine(ctx, optFont, 'You decide to...', tx, oy, () => rgba(C.text))
      oy += olh + 8
      opts.forEach((o, i) => {
        const hov = i === hover && o.enabled
        const textCol = !o.enabled ? rgba(C.gray, 0.8) : o.story || o.color === 'story' ? rgba(C.story) : hov ? 'rgb(235,250,255)' : rgba(C.btn)
        const num = i < 9 ? `${i + 1}. ` : i === 9 ? '0. ' : ''
        const ox = tx + 18
        const nw = textWidth(ctx, optFont!, num)
        drawLine(ctx, optFont!, num, ox, oy, () => (o.enabled ? rgba(C.key) : textCol))
        let label = o.text + (o.story ? ` [${o.story.cost} story point${o.story.cost === 1 ? '' : 's'}]` : '')
        const sc = o.shortcut ? (o.shortcut === 'ESCAPE' || o.shortcut === 'ESC' ? 'Esc' : o.shortcut) : ''
        drawLine(ctx, optFont!, label, ox + nw, oy, () => textCol)
        let w = nw + textWidth(ctx, optFont!, label)
        if (sc) {
          label = ` [${sc}]`
          drawLine(ctx, optFont!, label, ox + w, oy, (k) => (k === 1 || k === label.length - 1 ? textCol : rgba(C.key)))
          w += textWidth(ctx, optFont!, label)
        }
        boxes.push({ x: ox, y: oy, w: Math.max(w, 40), h: oh, o })
        oy += oh
      })
    }

    // ---- ruler: the right edge of the text column, red when the text is too long for the window
    ctx.strokeStyle = overflow ? 'rgba(255,107,107,0.9)' : 'rgba(80,90,130,0.5)'
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(tx + tw + 4.5, pad); ctx.lineTo(tx + tw + 4.5, pad + area); ctx.stroke()
    ctx.setLineDash([])
  }

  function drawVisual(ctx: CanvasRenderingContext2D, v: VisualState, x: number, y: number, w: number, h: number) {
    const people = v.kind === 'person' ? [v.person, v.second, v.third].filter(Boolean) as string[] : []
    if (people.length) {
      const size = people.length > 1 ? 96 : 128
      people.forEach((id, i) => {
        const look = person(id)
        const px = x + 8 + i * (size + 10)
        needImage(look?.portrait)
        const im = look?.portrait ? imgs[look.portrait] : null
        ctx.strokeStyle = 'rgba(58,111,127,1)'
        ctx.strokeRect(px + 0.5, y + 0.5, size, size)
        if (im) ctx.drawImage(im, px + 1, y + 1, size - 1, size - 1)
        else { ctx.fillStyle = '#0d1820'; ctx.fillRect(px + 1, y + 1, size - 1, size - 1) }
        if (i === 0 && look && textFont) {
          let ty = y + size + 8
          drawLine(ctx, textFont, look.name, px, ty, () => rgba(C.text)); ty += lineHeight(textFont) + 2
          if (look.rank) { for (const l of wrapText(ctx, textFont, look.rank, w - 16)) { drawLine(ctx, textFont, l, px, ty, () => rgba(C.gray)); ty += lineHeight(textFont) } }
          if (look.faction) {
            needImage(look.crest)
            const cr = look.crest ? imgs[look.crest] : null
            if (cr) ctx.drawImage(cr, px, ty + 2, 16, 16)
            drawLine(ctx, textFont, look.faction, px + 22, ty + 3, () => rgba(look.factionColor ?? C.btn))
          }
        }
      })
      return
    }
    const label = (s: string) => { if (textFont) drawLine(ctx, textFont, s, x + 8, y + 8, () => rgba(C.gray)) }
    if (v.kind === 'image') {
      const p = illustration(v.category, v.key)
      needImage(p)
      const im = p ? imgs[p] : null
      if (im) { const s = Math.min(w / im.width, (h * 0.75) / im.height); ctx.drawImage(im, x, y, im.width * s, im.height * s) }
      else label(`illustration ${v.key}${p ? '' : ' (not found)'}`)
    } else if (v.kind === 'planet') {
      const r = Math.min(w, h) * 0.32
      const g = ctx.createRadialGradient(x + w / 2 - r / 3, y + r * 1.2 - r / 3, r / 6, x + w / 2, y + r * 1.2, r)
      g.addColorStop(0, '#5a7d8c'); g.addColorStop(1, '#0d1a22')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + w / 2, y + r * 1.2, r, 0, Math.PI * 2); ctx.fill()
      label(`${v.entity}${v.info ? ' · planet info' : ''}`)
    } else if (v.kind !== 'none') {
      ctx.strokeStyle = 'rgba(120,140,160,0.5)'; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 200); ctx.setLineDash([])
      label(v.kind === 'mapMarker' ? `map marker: ${v.entity}` : v.kind === 'fleets' ? `fleets: ${v.key}` : v.kind === 'ship' ? `ship: ${v.variant}` : 'default visual (the entity)')
    }
  }

  $effect(() => {
    // redraw when anything drawn changes
    void [view, view.paragraphs.length, view.options.length, textFont, optFont, imgs, hover, scale, W, H, exact]
    JSON.stringify(view)
    draw()
  })

  function at(e: MouseEvent): number {
    const r = canvas!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * CW, y = ((e.clientY - r.top) / r.height) * CH
    return boxes.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
  }
  function move(e: MouseEvent) {
    const i = at(e)
    hover = i
    const o = boxes[i]?.o
    tip = o?.tooltip ? { x: e.offsetX + 12, y: e.offsetY - 10, text: o.tooltip } : null
  }
  function click(e: MouseEvent) {
    const i = at(e)
    const o = boxes[i]?.o
    if (o?.enabled && onSelect) onSelect(o.id)
  }
  function key(e: KeyboardEvent) {
    if (!onSelect) return
    const n = e.key === '0' ? 9 : Number(e.key) - 1
    const o = view.options[n]
    if (o?.enabled) onSelect(o.id)
    if (e.key === 'Escape') { const esc = view.options.find((x) => x.shortcut === 'ESCAPE' || x.shortcut === 'ESC'); if (esc?.enabled) onSelect(esc.id) }
  }
</script>

<div class="wrap">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="cv" tabindex="0" role="application" aria-label="Dialog preview" onkeydown={key} bind:clientWidth={boxW} bind:clientHeight={boxH}>
    <canvas bind:this={canvas} style="width:{CW * fitScale * scale}px;height:{CH * fitScale * scale}px" class:click={!!onSelect && hover >= 0}
      onmousemove={move} onmouseleave={() => { hover = -1; tip = null }} onclick={click}></canvas>
    {#if tip}<div class="tip" style="left:{tip.x}px;top:{tip.y}px">{tip.text}</div>{/if}
  </div>
  <div class="status">
    <span>{textFont?.fallback ? 'game font missing: system font (line breaks may differ)' : 'game font'} · dialog {W}×{H}</span><button class="lnk" onclick={() => (exact = !exact)}>{exact ? 'compact' : 'whole window 1:1'}</button><span>{Math.round(fitScale * 100)}%</span>
    {#if overflow}<span class="bad">text overflows the window by {Math.round(overflow)} px</span>{/if}
    {#if view.options.length > 10}<span class="warn">{view.options.length} options: only the first 10 get a number key</span>{/if}
  </div>
</div>

<style>
  .wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .cv { position: relative; overflow: auto; flex: 1; min-height: 0; background: #000; outline: none; }
  canvas { display: block; image-rendering: pixelated; }
  canvas.click { cursor: pointer; }
  .tip { position: absolute; max-width: 280px; background: #0d1a20; border: 1px solid #3a6f7f; padding: 6px 8px; font-size: 12px; color: #dce; pointer-events: none; z-index: 2; }
  .status { display: flex; gap: 12px; font-size: 11px; color: var(--muted); padding: 2px 8px; background: var(--panel); border-top: 1px solid var(--border); }
  .bad { color: var(--bad); }
  .lnk { border: none; background: none; padding: 0; font-size: 11px; color: var(--accent); }
  .warn { color: var(--warn); }
</style>
