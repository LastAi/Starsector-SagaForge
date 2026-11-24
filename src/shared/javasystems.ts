/**
 * Read-only star systems from the Java source the game (data/scripts/world/systems/*.java) and some
 * mods ship (R14; DESIGN-PHASE3.md §2). Only calls whose arguments are literal (strings, numbers,
 * simple arithmetic, StarTypes constants, local variables, getEntityById) are read; anything else
 * is counted as skipped, never guessed. Pure: no file access.
 */
import type { CodeBody, CodeSystem } from './api'

/** StarTypes constants (com.fs.starfarer.api.impl.campaign.ids.StarTypes, 0.98a). */
const STAR_TYPES: Record<string, string> = {
  YELLOW: 'star_yellow', WHITE_DWARF: 'star_white', BLUE_GIANT: 'star_blue_giant', BLUE_SUPERGIANT: 'star_blue_supergiant',
  ORANGE: 'star_orange', ORANGE_GIANT: 'star_orange_giant', RED_SUPERGIANT: 'star_red_supergiant', RED_GIANT: 'star_red_giant',
  RED_DWARF: 'star_red_dwarf', BROWN_DWARF: 'star_browndwarf', NEUTRON_STAR: 'star_neutron', BLACK_HOLE: 'black_hole',
  GAS_GIANT: 'gas_giant', ICE_GIANT: 'ice_giant'
}

/** Remove // and /* *\/ comments, keeping string literals intact. */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (c === '"' || c === '\'') {
      let j = i + 1
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1); i = j + 1
    } else if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++ }
    else if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2 }
    else { out += c; i++ }
  }
  return out
}

/** Split on `sep` at nesting depth 0, outside strings (`parensOnly`: braces don't nest, for statements). */
export function splitTop(s: string, sep: string, parensOnly = false): string[] {
  const out: string[] = []
  let depth = 0, cur = '', q = ''
  const open = parensOnly ? '(' : '({[', close = parensOnly ? ')' : ')}]'
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { cur += c; if (c === '\\') { cur += s[++i] ?? '' } else if (c === q) q = ''; continue }
    if (c === '"' || c === '\'') { q = c; cur += c; continue }
    if (open.includes(c)) depth++
    if (close.includes(c)) depth--
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** A number from simple arithmetic ("230 + 60", "500f", "-60"); NaN otherwise. */
export function evalNumber(expr: string): number {
  const e = expr.trim().replace(/(\d)[fFdD]\b/g, '$1')
  if (!/^[\d\s.+\-*/()]+$/.test(e) || !e) return NaN
  // a tiny recursive-descent evaluator (no eval)
  let i = 0
  const ws = () => { while (e[i] === ' ' || e[i] === '\t' || e[i] === '\n' || e[i] === '\r') i++ }
  const atom = (): number => {
    ws()
    if (e[i] === '(') { i++; const v = sum(); ws(); if (e[i] !== ')') return NaN; i++; return v }
    if (e[i] === '-') { i++; return -atom() }
    if (e[i] === '+') { i++; return atom() }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(e.slice(i))
    if (!m) return NaN
    i += m[0].length
    return Number(m[0])
  }
  const prod = (): number => { let v = atom(); for (;;) { ws(); if (e[i] === '*') { i++; v *= atom() } else if (e[i] === '/') { i++; v /= atom() } else return v } }
  const sum = (): number => { let v = prod(); for (;;) { ws(); if (e[i] === '+') { i++; v += prod() } else if (e[i] === '-') { i++; v -= prod() } else return v } }
  const v = sum()
  ws()
  return i === e.length ? v : NaN
}

const str = (expr: string | undefined): string | null => {
  const t = (expr ?? '').trim()
  if (t === 'null') return ''
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(t)
  return m ? m[1].replace(/\\(.)/g, '$1') : null
}

/** The system id the game index uses (starmap.json key) for a parsed system: file name, then name. */
export function codeSystemId(file: string, name: string, known: (id: string) => boolean): string {
  const base = file.replace(/^.*[\\/]/, '').replace(/\.java$/i, '').toLowerCase()
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const first = name.toLowerCase().split(/[^a-z0-9]/)[0] ?? ''
  return [base, n, first].find((c) => c && known(c)) ?? n
}

/**
 * Every system a Java file creates. `known` tells which system ids the game index has (to match
 * starmap.json's keys).
 */
export function parseSystemsJava(text: string, file: string, sourceId: string, known: (id: string) => boolean = () => false): CodeSystem[] {
  /** #67 U26: systems a script fetched (getStarSystem) rather than created. */
  const fetched = new Set<CodeSystem>()
  const out: CodeSystem[] = []
  const src = stripComments(text)
  let sys: CodeSystem | null = null
  const vars = new Map<string, string>() // variable → entity id
  const orbits = new Map<string, string[]>() // variable → createCircularOrbit args
  const pending = new Map<string, CodeBody>() // variable → body waiting for its orbit
  const call = (stmt: string, name: string): string[] | null => {
    const at = stmt.search(new RegExp(`\\.${name}\\s*\\(`))
    if (at < 0) return null
    const open = stmt.indexOf('(', at)
    const close = stmt.lastIndexOf(')')
    return close > open ? splitTop(stmt.slice(open + 1, close), ',').map((a) => a.trim()) : null
  }
  const assigned = (stmt: string): string | null => /^\s*(?:[\w.<>]+\s+)?(\w+)\s*=/.exec(stmt)?.[1] ?? null
  const focusOf = (expr: string): string | null => {
    const t = expr.trim()
    const byId = /getEntityById\s*\(\s*"([^"]+)"\s*\)/.exec(t)
    if (byId) return byId[1]
    if (/^\w+$/.test(t) && vars.has(t)) return vars.get(t)!
    return null
  }
  const numVars = new Map<string, number>() // float x = <literal arithmetic>
  const num = (expr: string) => evalNumber(expr.replace(/\b([A-Za-z_]\w*)\b/g, (w) => (numVars.has(w) ? `(${numVars.get(w)})` : w)))
  const nums = (args: string[], from: number, n: number) => { const r = args.slice(from, from + n).map(num); return r.length === n && r.every((x) => Number.isFinite(x)) ? r : null }
  const setOrbit = (body: CodeBody, args: string[]): boolean => {
    const f = focusOf(args[0] ?? '')
    const n = nums(args, 1, 3)
    if (f == null || !n) return false
    body.focus = f; body.angle = n[0]; body.orbitRadius = n[1]; body.days = n[2]
    return true
  }

  for (const raw of splitTop(src, ';', true)) {
    // a statement starts after the last block brace before it ("… generate(SectorAPI s) { StarSystemAPI system = …")
    const stmt = raw.replace(/\s+/g, ' ').replace(/^[^"]*[{}]\s*/, '').trim()
    if (!stmt) continue
    // #67 U26: the core worlds exist already (starmap.json); their scripts fetch them with getStarSystem("…")
    const created = /(?:createStarSystem|getStarSystem)\s*\(\s*"([^"]+)"/.exec(stmt)
    if (created) {
      sys = { id: codeSystemId(file, created[1], known), name: created[1], file, sourceId, star: null, bodies: [], skipped: 0 }
      out.push(sys)
      if (stmt.includes("getStarSystem")) fetched.add(sys)
      vars.clear(); orbits.clear(); pending.clear(); numVars.clear()
      continue
    }
    if (!sys) continue
    const v = assigned(stmt)
    let a: string[] | null
    const numDecl = /^(?:final\s+)?(?:float|int|double|long)\s+(\w+)\s*=\s*(.+)$/.exec(stmt)
    if (numDecl) {
      const n = num(numDecl[2])
      if (Number.isFinite(n)) numVars.set(numDecl[1], n); else numVars.delete(numDecl[1])
      continue
    }
    if ((a = call(stmt, 'initStar'))) {
      const id = str(a[0]); const t = a[1]?.trim() ?? ''
      const type = str(t) ?? STAR_TYPES[t.replace(/^StarTypes\./, '')] ?? null
      const n = nums(a, 2, 2)
      if (id && type && n) { sys.star = { id, type, radius: n[0], corona: n[1] }; if (v) vars.set(v, id) } else sys.skipped++
    } else if ((a = call(stmt, 'addPlanet'))) {
      const id = str(a[0]), focus = focusOf(a[1] ?? ''), name = str(a[2]), type = str(a[3]) ?? STAR_TYPES[(a[3] ?? '').replace(/^StarTypes\./, '')]
      const n = nums(a, 4, 4)
      if (id != null && focus != null && type && n) {
        sys.bodies.push({ id, name: name || id, kind: 'planet', type, focus, angle: n[0], radius: n[1], orbitRadius: n[2], days: n[3], width: 0 })
        if (v && id) vars.set(v, id)
      } else sys.skipped++
    } else if ((a = call(stmt, 'addCustomEntity'))) {
      const id = str(a[0]), name = str(a[1]), type = str(a[2])
      if (id != null && type) {
        const b: CodeBody = { id, name: name || '', kind: 'custom', type, focus: '', angle: 0, orbitRadius: 0, days: 0, radius: 0, width: 0 }
        if (v) { pending.set(v, b); if (id) vars.set(v, id) }
        sys.bodies.push(b)
      } else sys.skipped++
    } else if ((a = call(stmt, 'createJumpPoint'))) {
      const id = str(a[0]), name = str(a[1])
      if (id != null && v) { const b: CodeBody = { id, name: name || id, kind: 'jumpPoint', type: 'jump_point', focus: '', angle: 0, orbitRadius: 0, days: 0, radius: 0, width: 0 }; pending.set(v, b); if (id) vars.set(v, id); sys.bodies.push(b) } else sys.skipped++
    } else if ((a = call(stmt, 'createCircularOrbit'))) {
      if (v) orbits.set(v, a)
    } else if ((a = call(stmt, 'addAsteroidBelt'))) {
      const focus = focusOf(a[0] ?? ''), n = nums(a, 2, 3)
      if (focus != null && n) sys.bodies.push({ id: '', name: str(a[7]) || 'Asteroid belt', kind: 'asteroidBelt', type: 'asteroid_belt', focus, angle: 0, orbitRadius: n[0], width: n[1], days: n[2], radius: 0 })
      else sys.skipped++
    } else if ((a = call(stmt, 'addRingBand'))) {
      const focus = focusOf(a[0] ?? ''), n = nums(a, 6, 3)
      if (focus != null && n) sys.bodies.push({ id: '', name: str(a[10]) || '', kind: 'ring', type: str(a[2]) ?? 'ring', focus, angle: 0, width: n[0], orbitRadius: n[1], days: n[2], radius: 0 })
      else sys.skipped++
    } else if ((a = call(stmt, 'addTerrain'))) {
      const strs = splitTop(stmt, ',').map((x) => /"((?:[^"\\]|\\.)*)"/.exec(x)?.[1]).filter((x): x is string => !!x)
      const b: CodeBody = { id: '', name: strs[strs.length - 1] ?? '', kind: 'terrain', type: (a[0] ?? '').replace(/^Terrain\./, '').toLowerCase(), focus: '', angle: 0, orbitRadius: 0, days: 0, radius: 0, width: 0 }
      if (v) pending.set(v, b)
      sys.bodies.push(b)
    } else {
      // an orbit for a body made earlier: x.setCircularOrbit…(focus, angle, radius, days…) or x.setOrbit(orbitVar)
      const who = /^(\w+)\.(setCircularOrbit\w*|setOrbit)\s*\(/.exec(stmt)
      if (who && pending.has(who[1])) {
        const b = pending.get(who[1])!
        const args = who[2] === 'setOrbit' ? orbits.get((call(stmt, 'setOrbit') ?? [])[0] ?? '') ?? null : call(stmt, who[2])
        // the last orbit call wins, as in game (Askonia's jump point is moved after setOrbit)
        if (args) setOrbit(b, args)
      }
    }
  }
  // bodies whose orbit was never read (e.g. set in a helper) are dropped, and counted
  for (const s of out) {
    const before = s.bodies.length
    s.bodies = s.bodies.filter((b) => b.focus !== '')
    s.skipped += before - s.bodies.length
  }
  // #67 U26: a script that only looks a system up (getStarSystem, nothing added) is no system of its own
  return out.filter((s) => !fetched.has(s) || s.star || s.bodies.length)
}
