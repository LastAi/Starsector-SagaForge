// Workflow walk driver (INGAME-CHECKS "Workflow checks"): runs the built app with its own settings
// folder (.userdata/walk) and Chrome DevTools on port 9333, and performs clicks, typing, selects and
// screenshots on the real UI from a small step file, as a modder would by hand. Native open dialogs
// answer from a queue (`pick`), see SF_WALK_PICKS in src/main/index.ts.
//   npm run build
//   node scripts/walk.mjs start [--fresh]        (--fresh: wipe .userdata/walk first = first launch)
//   node scripts/walk.mjs run <steps file>       (one step per line, see STEPS below)
//   node scripts/walk.mjs stop
// STEPS (text after the command; "#" starts a comment line):
//   click <text>[ #n]       mouse click on the visible element whose text is <text> (n-th match)
//   clicksel <css>          mouse click on the first visible element matching <css>
//   fill <label> = <value>  type into the form field with that label (Field label, label[for],
//                           placeholder or aria-label); blur afterwards so "change" fires
//   select <label> = <value or option text>
//   key <Key>               Enter, Escape, Tab, Delete, Backspace…
//   within <css>            look for elements only inside <css> (alone: everywhere again)
//   pick <path or JSON>     queue the answer for the next native open dialog (null = Cancel)
//   dialog accept|dismiss   how to answer the next confirm()/alert() (default accept)
//   wait <ms>
//   shot <name>             .userdata/walk/shots/<name>.png
//   text [css]              print the visible text (main area by default), shortened
//   eval <js>               print the result
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, '.userdata', 'walk')
const picks = path.join(dataDir, 'picks.json')
const shots = path.join(dataDir, 'shots')
const PORT = 9333
const [cmd, arg] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && /index\.html|localhost/.test(t.url) && !/reference/.test(t.url))
      if (page) return page
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('The app is not running (node scripts/walk.mjs start).')
}

function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const waiting = new Map()
  const handlers = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && waiting.has(msg.id)) { const { ok, bad } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result) }
    else for (const h of handlers) h(msg)
  }
  const ready = new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; waiting.set(i, { ok, bad }); ws.send(JSON.stringify({ id: i, method, params })) })
  return { ready, send, on: (h) => handlers.push(h), close: () => ws.close() }
}

if (cmd === 'start') {
  if (process.argv.includes('--fresh')) fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(shots, { recursive: true })
  if (!fs.existsSync(picks)) fs.writeFileSync(picks, '[]')
  // a hidden or covered window would stop painting, and input sent over DevTools waits for frames
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'], {
    cwd: root, detached: true, stdio: 'ignore',
    env: { ...process.env, SF_USERDATA: dataDir, SF_WALK_PICKS: picks }
  })
  child.unref()
  const t = await target()
  console.log(`walk: app running (pid ${child.pid}), ${t.url}`)
  process.exit(0)
}

if (cmd === 'stop') {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    const c = connect(v.webSocketDebuggerUrl)
    await c.ready
    await Promise.race([c.send('Browser.close').catch(() => {}), sleep(3000)])
    console.log('walk: closed')
  } catch { console.log('walk: not running') }
  process.exit(0)
}

if (cmd !== 'run' || !arg) { console.log('usage: walk.mjs start [--fresh] | run <steps file> | stop'); process.exit(1) }

const t = await target()
const c = connect(t.webSocketDebuggerUrl)
await c.ready
await c.send('Page.enable')
await c.send('Runtime.enable')
let dialogAnswer = true
c.on((m) => {
  if (m.method === 'Page.javascriptDialogOpening') {
    console.log(`  [${m.params.type}] ${m.params.message} → ${dialogAnswer ? 'accept' : 'dismiss'}`)
    c.send('Page.handleJavaScriptDialog', { accept: dialogAnswer }).catch(() => {})
    dialogAnswer = true
  }
  if (m.method === 'Runtime.exceptionThrown') console.log(`  [exception] ${m.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) console.log(`  [console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`)
})

const evaluate = async (expr) => {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}

// page-side helpers, installed once per run
await evaluate(`(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[inert]') }
  const norm = (s) => (s ?? '').replace(/\\s+/g, ' ').trim()
  const scopeEl = () => (window.__walkScope && document.querySelector(window.__walkScope)) || document
  // a modal on top limits the search to it
  const top = () => { const s = scopeEl(); if (s !== document) return s; const ms = [...document.querySelectorAll('.modal, [role=dialog], .menu')].filter(vis); return ms.length ? ms[ms.length - 1] : document }
  const CLICKABLE = 'button, a, [role=button], [role=tab], label, li, summary, option, td, th, .tab, [onclick], [tabindex], span, div'
  window.__walk = {
    vis, norm,
    byText(text, n, wide) {
      const all = [...(wide ? document : top()).querySelectorAll(CLICKABLE)].filter(vis)
      const own = (el) => norm(el.innerText)
      let hits = all.filter((el) => own(el) === text)
      // "● Save", "✓ Done": ignore a leading mark
      if (!hits.length) hits = all.filter((el) => own(el).replace(/^[●•✓✎⚠★◆✦·]\\s*/, '') === text)
      if (!hits.length) hits = all.filter((el) => own(el).startsWith(text))
      if (!hits.length) hits = all.filter((el) => (el.title && norm(el.title) === text) || el.getAttribute('aria-label') === text)
      // the innermost of nested matches; prefer real controls
      hits = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)))
      const ctl = hits.filter((el) => el.matches('button, a, [role=button], [role=tab], label, li, summary, option'))
      if (ctl.length) hits = ctl.concat(hits.filter((h) => !ctl.includes(h)))
      // nothing in the dialog on top: toasts and the like sit outside it
      if (!hits.length && !wide && top() !== document) return this.byText(text, n, true)
      return hits[(n || 1) - 1] || null
    },
    field(label) {
      const sc = top()
      for (const l of sc.querySelectorAll('.f-lbl')) if (vis(l) && norm(l.querySelector('.f-name')?.innerText) === label) {
        const ctl = l.nextElementSibling
        const el = ctl && ctl.querySelector('input:not([type=hidden]), textarea, select, [contenteditable=true]')
        if (el) return el
      }
      for (const l of sc.querySelectorAll('label[for]')) if (vis(l) && norm(l.innerText) === label) { const el = document.getElementById(l.htmlFor); if (el) return el }
      for (const el of sc.querySelectorAll('input, textarea, select')) if (vis(el) && (el.placeholder === label || el.getAttribute('aria-label') === label || el.title === label)) return el
      return null
    },
    describe(el) { return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '') + ' "' + norm(el.innerText || el.value || '').slice(0, 50) + '"' },
    center(el) { el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  }
})()`)

async function mouse(x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
const KEYS = { Enter: 13, Escape: 27, Tab: 9, Delete: 46, Backspace: 8, ArrowDown: 40, ArrowUp: 38 }
async function key(k, mods = 0) {
  const code = KEYS[k] ?? k.toUpperCase().charCodeAt(0)
  const text = k === 'Enter' ? '\r' : k.length === 1 && !mods ? k : undefined
  const kc = /^\d$/.test(k) ? `Digit${k}` : k.length === 1 ? `Key${k.toUpperCase()}` : k
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: kc, windowsVirtualKeyCode: code, modifiers: mods, text })
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: kc, windowsVirtualKeyCode: code, modifiers: mods })
}

const lines = fs.readFileSync(arg, 'utf8').split(/\r?\n/)
let failed = false
for (const raw of lines) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const sp = line.indexOf(' ')
  const op = sp < 0 ? line : line.slice(0, sp)
  const rest = sp < 0 ? '' : line.slice(sp + 1).trim()
  try {
    if (op === 'click') {
      const m = /^(.*?)(?: #(\d+))?$/.exec(rest)
      const pos = await evaluate(`(() => { const el = __walk.byText(${JSON.stringify(m[1])}, ${m[2] ?? 1}); if (!el) return null; return { ...__walk.center(el), d: __walk.describe(el) } })()`)
      if (!pos) throw new Error(`nothing visible says "${m[1]}"`)
      await mouse(pos.x, pos.y)
      console.log(`click ${pos.d}`)
    } else if (op === 'clicksel') {
      const pos = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(rest)})].find(__walk.vis); if (!el) return null; return { ...__walk.center(el), d: __walk.describe(el) } })()`)
      if (!pos) throw new Error(`no visible ${rest}`)
      await mouse(pos.x, pos.y)
      console.log(`click ${pos.d}`)
    } else if (op === 'fill' || op === 'select' || op === 'fillsel' || op === 'selectsel') {
      const eq = rest.indexOf(' = ')
      const label = eq < 0 ? rest : rest.slice(0, eq)
      // fillsel/selectsel: "<css>[ #n] = value" instead of a label
      if (op.endsWith('sel')) {
        // "#n" counts from the start, "#-n" from the end (#-1 = the last one)
        const m = /^(.*?)(?: #(-?\d+))?$/.exec(label)
        const n = Number(m[2]) || 1
        // "value:<text>": the input whose current value is <text> (Svelte sets values as properties)
        const byValue = m[1].startsWith('value:') ? m[1].slice(6) : null
        await evaluate(`(() => { const all = ${byValue !== null ? `[...document.querySelectorAll('input, textarea')].filter((x) => x.value === ${JSON.stringify(byValue)})` : `[...document.querySelectorAll(${JSON.stringify(m[1])})]`}.filter(__walk.vis); window.__walkSel = all[${n} < 0 ? all.length + ${n} : ${n} - 1] || null })()`)
      } else await evaluate(`window.__walkSel = undefined`)
      const value = eq < 0 ? '' : rest.slice(eq + 3).replace(/\\n/g, '\n')
      if (op.startsWith('select')) {
        const r = await evaluate(`(() => { const el = (window.__walkSel !== undefined ? window.__walkSel : __walk.field(${JSON.stringify(label)})); if (!el || el.tagName !== 'SELECT') return 'no select labelled'; const v = ${JSON.stringify(value)}; const o = [...el.options].find((o) => o.value === v) || [...el.options].find((o) => __walk.norm(o.text) === v) || [...el.options].find((o) => __walk.norm(o.text).startsWith(v)); if (!o) return 'no option ' + v + ' in [' + [...el.options].map((o) => __walk.norm(o.text)).join(' | ') + ']'; el.focus(); el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok ' + __walk.norm(o.text) })()`)
        if (!r.startsWith('ok')) throw new Error(`select ${label}: ${r}`)
        console.log(`select ${label} = ${r.slice(3)}`)
      } else {
        const pos = await evaluate(`(() => { const el = (window.__walkSel !== undefined ? window.__walkSel : __walk.field(${JSON.stringify(label)})); if (!el) return null; const p = __walk.center(el); el.focus(); if (el.select) el.select(); else document.execCommand('selectAll'); return { ...p, tag: el.tagName, type: el.type } })()`)
        if (!pos) throw new Error(`no field labelled "${label}"`)
        if (pos.type === 'checkbox') throw new Error(`"${label}" is a checkbox: use click`)
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] })
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
        if (value) await c.send('Input.insertText', { text: value })
        else await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, commands: ['deleteForward'] })
        const now = await evaluate(`document.activeElement && document.activeElement.value`)
        if (typeof now === 'string' && now !== value) throw new Error(`the field reads "${now}" after typing`)
        await evaluate(`document.activeElement && document.activeElement.blur()`)
        console.log(`fill ${label} = ${value.length > 60 ? value.slice(0, 60) + '…' : value}`)
      }
    } else if (op === 'drag') {
      const [x1, y1, x2, y2] = rest.split(/\s+/).map(Number)
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 })
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 })
      await sleep(80)
      for (let i = 1; i <= 25; i++) {
        await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 25, y: y1 + ((y2 - y1) * i) / 25, button: 'left', buttons: 1 })
        await sleep(30)
      }
      await sleep(80)
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 })
      console.log(`drag ${x1},${y1} → ${x2},${y2}`)
    } else if (op === 'link' || op === 'linknew') {
      // link <node> <handle> <target node>  |  linknew <node> <handle> <menu entry, e.g. Dialog>
      const [from, handle, ...restWords] = rest.split(/\s+/)
      const target = restWords.join(' ')
      const pos = await evaluate(`(() => {
        const h = document.querySelector('.svelte-flow__handle[data-nodeid="${from}"][data-handleid="${handle}"]')
        if (!h) return 'no handle ${from}.${handle}'
        const pane = document.querySelector('.svelte-flow').getBoundingClientRect()
        const r = h.getBoundingClientRect(); const s = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        if (s.x < pane.left || s.x > pane.right || s.y < pane.top || s.y > pane.bottom) return 'handle off-screen: use fit'
        let t
        if (${op === 'link'}) { const th = document.querySelector('.svelte-flow__handle[data-nodeid="${target}"].target, .svelte-flow__handle[data-nodeid="${target}"][data-handlepos="left"]'); if (!th) return 'no target ${target}'; const q = th.getBoundingClientRect(); t = { x: q.left + q.width / 2, y: q.top + q.height / 2 } }
        else {
          // the nearest empty canvas to the right of the handle (dropping on a node would link to it)
          const free = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.classList.contains('svelte-flow__pane') && ![...document.querySelectorAll('.svelte-flow__node')].some((n) => { const q = n.getBoundingClientRect(); return x > q.left - 30 && x < q.right + 30 && y > q.top - 30 && y < q.bottom + 30 }) }
          for (let dy = 0; dy < 400 && !t; dy += 20) for (const sy of [1, -1]) for (const dx of [120, 160, 200, 240, 280, 320, 360, 400, 60, 0, -60, -120, -200, -280]) { if (t) break; const x = s.x + dx, y = s.y + sy * dy; if (x < pane.right - 180 && y > pane.top + 20 && y < pane.bottom - 20 && free(x, y)) t = { x, y } }
          if (!t) return 'no empty canvas near the handle: use fit or wheel'
        }
        return { s, t }
      })()`)
      if (typeof pos === 'string') throw new Error(pos)
      const { s, t } = pos
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y })
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.x, y: s.y, button: 'left', buttons: 1, clickCount: 1 })
      for (let i = 1; i <= 12; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x + ((t.x - s.x) * i) / 12, y: s.y + ((t.y - s.y) * i) / 12, button: 'left', buttons: 1 }); await sleep(25) }
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', buttons: 0, clickCount: 1 })
      await sleep(400)
      if (op === 'linknew') {
        const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('.menu button')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(target)})); if (!b) return false; b.click(); return true })()`)
        if (!ok) throw new Error(`no "${target}" in the node menu`)
      }
      console.log(`${op} ${from}.${handle} → ${target}`)
    } else if (op === 'fit') {
      // zoom out with the wheel and pan by dragging empty canvas until every node is on screen
      const box = () => evaluate(`(() => { const p = document.querySelector('.svelte-flow').getBoundingClientRect(); const ns = [...document.querySelectorAll('.svelte-flow__node')].map(n => n.getBoundingClientRect()); if (!ns.length) return null; const b = { l: Math.min(...ns.map(r => r.left)), t: Math.min(...ns.map(r => r.top)), r: Math.max(...ns.map(r => r.right)), b: Math.max(...ns.map(r => r.bottom)) }; let empty = null; for (let y = p.top + 20; y < p.bottom - 20 && !empty; y += 23) for (let x = p.left + 60; x < p.right - 200 && !empty; x += 37) { const e = document.elementFromPoint(x, y); if (e && e.classList.contains('svelte-flow__pane')) empty = { x, y } } return { p: { l: p.left, t: p.top, r: p.right, b: p.bottom }, b, empty } })()`)
      for (let i = 0; i < 12; i++) {
        const s = await box()
        if (!s) break
        const tooBig = s.b.r - s.b.l > s.p.r - s.p.l - 80 || s.b.b - s.b.t > s.p.b - s.p.t - 140
        if (tooBig) { await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: (s.p.l + s.p.r) / 2, y: (s.p.t + s.p.b) / 2, deltaX: 0, deltaY: 250 }); await sleep(300); continue }
        const dx = (s.p.l + 40) - s.b.l, dy = (s.p.t + 30) - s.b.t
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) break
        if (!s.empty) break
        const { x, y } = s.empty
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
        for (let k = 1; k <= 8; k++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (dx * k) / 8, y: y + (dy * k) / 8, button: 'left', buttons: 1 }); await sleep(20) }
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', buttons: 0, clickCount: 1 })
        await sleep(300)
      }
      console.log('fit')
    } else if (op === 'release') {
      const [x, y] = rest.split(/\s+/).map(Number)
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
    } else if (op === 'wheel') {
      const [x, y, dy] = rest.split(/\s+/).map(Number)
      await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy })
    } else if (op === 'clickat') {
      const [x, y] = rest.split(/\s+/).map(Number)
      await mouse(x, y)
      console.log(`click at ${x},${y}`)
    } else if (op === 'type') {
      await c.send('Input.insertText', { text: rest.replace(/\\n/g, '\n') })
    } else if (op === 'key') {
      const parts = rest.split('+')
      const k = parts.pop()
      const mods = (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0) | (parts.includes('Alt') ? 1 : 0)
      await key(k, mods)
    } else if (op === 'within') {
      await evaluate(`window.__walkScope = ${JSON.stringify(rest || null)}`)
    } else if (op === 'pick') {
      const q = JSON.parse(fs.readFileSync(picks, 'utf8') || '[]')
      q.push(rest.startsWith('[') || rest === 'null' ? JSON.parse(rest) : rest)
      fs.writeFileSync(picks, JSON.stringify(q))
    } else if (op === 'dialog') {
      dialogAnswer = rest !== 'dismiss'
    } else if (op === 'wait') {
      await sleep(Number(rest) || 500)
    } else if (op === 'shot') {
      const r = await c.send('Page.captureScreenshot', { format: 'png' })
      fs.mkdirSync(shots, { recursive: true })
      const f = path.join(shots, `${rest || 'shot'}.png`)
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'))
      console.log(`shot ${path.relative(root, f)}`)
    } else if (op === 'text') {
      const s = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(rest || 'body')}); return el ? el.innerText : '(nothing matches)' })()`)
      console.log(String(s).replace(/\n{2,}/g, '\n').slice(0, 4000))
    } else if (op === 'eval') {
      console.log(JSON.stringify(await evaluate(rest))?.slice(0, 4000))
    } else throw new Error(`unknown step "${op}"`)
  } catch (e) {
    console.log(`FAILED at "${line}": ${e.message}`)
    failed = true
    break
  }
  await sleep(op === 'wait' ? 0 : 300)
}
c.close()
process.exit(failed ? 1 : 0)
