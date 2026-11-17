/**
 * #47 P3 (TARGET-VERSION-ASSESSMENT.md §5): every game id the mod's plans use, with a setter, so a
 * version check can say where each one is and a fix can replace or remove it. Also the rule lines
 * the mod types by hand, for command checks. Pure.
 */
import type { Problem, ProblemRef } from './api'
import type { ModModel } from './serialize'
import type { GameDefinitions, ParamDef } from './defs/types'
import type { DiffCategory, VersionDiff } from './versiondiff'
import { getPath, isObj, setPath } from './faction'
import { cmpGameVersions, versionFamily } from './version'

export interface RefSite {
  cat: DiffCategory
  id: string
  /** Where it is used, for messages ("Location Kestrel › Kestrel I"). */
  where: string
  ref: ProblemRef
  /** Replace it (a new id) or remove it (null). */
  set: (v: string | null) => void
}

/** Visit every reference; `fn` may call `set` (the model is changed in place). */
export function visitRefs(m: ModModel, fn: (r: RefSite) => void): void {
  const one = (cat: DiffCategory, id: string | undefined, where: string, ref: ProblemRef, set: (v: string | null) => void) => { if (id) fn({ cat, id, where, ref, set }) }
  const list = (cat: DiffCategory, arr: string[] | undefined, where: string, ref: ProblemRef) => {
    for (const id of [...(arr ?? [])]) one(cat, id, where, ref, (v) => {
      const i = arr!.indexOf(id)
      if (i < 0) return
      if (v) arr![i] = v; else arr!.splice(i, 1)
    })
  }
  for (const p of m.people) {
    const ref: ProblemRef = { page: 'people', id: p.id }
    const w = `Person ${`${p.name.first} ${p.name.last}`.trim() || p.id}`
    one('faction', p.faction, w, ref, (v) => { p.faction = v ?? '' })
    one('rank', p.rank, w, ref, (v) => { p.rank = v ?? '' })
    one('post', p.post, w, ref, (v) => { p.post = v ?? '' })
    one('portrait', p.portrait, w, ref, (v) => { p.portrait = v ?? '' })
  }
  for (const s of m.systems) {
    const ref: ProblemRef = { page: 'locations', id: s.id }
    if (s.star) one('planetType', s.star.type, `Location ${s.name} (star)`, ref, (v) => { if (s.star && v) s.star.type = v })
    one('music', s.music, `Location ${s.name}`, ref, (v) => { s.music = v ?? undefined })
    for (const e of s.entities) {
      const r: ProblemRef = { page: 'locations', id: s.id, sub: e.id }
      const w = `Location ${s.name} › ${e.name}`
      const cat: DiffCategory | null = e.kind === 'planet' || e.kind === 'moon' ? 'planetType' : e.kind === 'asteroidBelt' || e.kind === 'ring' || e.kind === 'jumpPoint' ? null : 'entityType'
      if (cat) one(cat, e.type, w, r, (v) => { e.type = v ?? '' })
      const mk = e.market
      if (mk) {
        one('faction', mk.faction, `${w} (market)`, r, (v) => { mk.faction = v ?? '' })
        list('condition', mk.conditions, `${w} (market)`, r)
        list('industry', mk.industries, `${w} (market)`, r)
        list('submarket', mk.submarkets, `${w} (market)`, r)
      }
    }
  }
  for (const e of m.encounters) {
    const ref: ProblemRef = { page: 'encounters', id: e.id }
    const w = `Encounter ${e.name}`
    one('faction', e.fleet.faction, w, ref, (v) => { e.fleet.faction = v ?? '' })
    one('fleetType', e.fleet.type, w, ref, (v) => { e.fleet.type = v ?? '' })
    list('variant', e.fleet.variants, w, ref)
  }
  // factions: additions edit their document, overrides their patch (set and added list entries)
  const FACTION_LISTS: [string, DiffCategory][] = [
    ['knownShips.hulls', 'hull'], ['priorityShips.hulls', 'hull'], ['knownFighters.fighters', 'wing'], ['knownWeapons.weapons', 'weapon'],
    ['priorityWeapons.weapons', 'weapon'], ['knownHullMods.hullMods', 'hullmod'], ['illegalCommodities', 'item'],
    ['portraits.standard_male', 'portrait'], ['portraits.standard_female', 'portrait'], ['portraits.player_male', 'portrait'], ['portraits.player_female', 'portrait']
  ]
  for (const f of m.factions) {
    const ref: ProblemRef = { page: 'factions', id: f.id }
    const w = `Faction ${f.id}`
    for (const [path, cat] of FACTION_LISTS) {
      const arr = f.kind === 'addition' ? getPath(f.raw, path) : f.patch.add[path]
      if (Array.isArray(arr)) list(cat, arr as string[], `${w} (${path})`, ref)
    }
    for (const k of ['theme', 'market_neutral', 'encounter_hostile']) {
      const doc = f.kind === 'addition' ? f.raw : f.patch.set
      const v = getPath(doc, `music.${k}`)
      if (typeof v === 'string') one('music', v, `${w} (music)`, ref, (nv) => setPath(doc, `music.${k}`, nv ?? undefined))
    }
    const ftn = getPath(f.kind === 'addition' ? f.raw : f.patch.set, 'fleetTypeNames')
    if (isObj(ftn)) for (const k of Object.keys(ftn)) one('fleetType', k, `${w} (fleet type names)`, ref, (nv) => { const o = ftn as Record<string, unknown>; const val = o[k]; delete o[k]; if (nv) o[nv] = val })
  }
  for (const q of m.quests) {
    for (const n of q.nodes) {
      const ref: ProblemRef = { page: 'quests', id: q.id, sub: n.id }
      const w = `Quest ${q.title} › ${n.id}`
      if (n.type === 'dialog') {
        const vis = n.visual
        if (vis.kind === 'illustration') one('illustration', vis.key, w, ref, (v) => { if (v) vis.key = v; else n.visual = { kind: 'none' } })
        if (vis.kind === 'ship') one('variant', vis.variant, w, ref, (v) => { if (v) vis.variant = v; else n.visual = { kind: 'none' } })
        for (const d of [...n.displays]) {
          const drop = () => { n.displays = n.displays.filter((x) => x !== d) }
          if (d.kind === 'commodity' || d.kind === 'specialItem') one('item', d.item, w, ref, (v) => { if (v) d.item = v; else drop() })
          else if (d.kind === 'weapon') one('weapon', d.id, w, ref, (v) => { if (v) d.id = v; else drop() })
          else if (d.kind === 'fighter') one('wing', d.id, w, ref, (v) => { if (v) d.id = v; else drop() })
          else if (d.kind === 'ship') one('variant', d.variant, w, ref, (v) => { if (v) d.variant = v; else drop() })
          else if (d.kind === 'shipList') list('variant', d.variants, w, ref)
          else if (d.kind === 'music') one('music', d.id, w, ref, (v) => { if (v) d.id = v; else drop() })
          else if (d.kind === 'image') one('illustration', d.key, w, ref, (v) => { if (v) d.key = v; else drop() })
          else if (d.kind === 'faction') one('faction', d.faction, w, ref, (v) => { if (v) d.faction = v; else drop() })
        }
      } else if (n.type === 'action') {
        for (const op of [...n.ops]) {
          const drop = () => { n.ops = n.ops.filter((x) => x !== op) }
          if (op.op === 'item') one('item', op.item, w, ref, (v) => { if (v) op.item = v; else drop() })
          if (op.op === 'rep' && op.faction) one('faction', op.faction, w, ref, (v) => { if (v) op.faction = v; else drop() })
        }
      }
    }
    for (const r of q.rewards ?? []) {
      const ref: ProblemRef = { page: 'quests', id: q.id }
      const w = `Quest ${q.title} (reward ${r.id})`
      for (const it of [...(r.items ?? [])]) one('item', it.item, w, ref, (v) => { if (v) it.item = v; else r.items = r.items!.filter((x) => x !== it) })
      list('variant', r.ships, w, ref)
      for (const rp of [...(r.rep ?? [])]) one('faction', rp.faction, w, ref, (v) => { if (v) rp.faction = v; else r.rep = r.rep!.filter((x) => x !== rp) })
    }
  }
  for (const t of m.types?.entities ?? []) one('entityType', t.behavesLike, `Type ${t.name}`, { page: 'locations' }, (v) => { if (v) t.behavesLike = v })
  for (const t of m.types?.planets ?? []) one('planetType', t.basedOn, `Type ${t.name}`, { page: 'locations' }, (v) => { if (v) t.basedOn = v })
}

/** The rule lines a modder typed (extra conditions and scripts, branch cases, action lines, start conditions). */
export function typedLines(m: ModModel): { line: string; where: string; ref: ProblemRef }[] {
  const out: { line: string; where: string; ref: ProblemRef }[] = []
  for (const q of m.quests) {
    const st = q.start
    if (st.kind === 'option' || st.kind === 'trigger') for (const l of st.conditions) out.push({ line: l, where: `Quest ${q.title} (start)`, ref: { page: 'quests', id: q.id } })
    for (const n of q.nodes) {
      const ref: ProblemRef = { page: 'quests', id: q.id, sub: n.id }
      const w = `Quest ${q.title} › ${n.id}`
      if (n.type === 'dialog') {
        for (const l of [...n.conditions, ...n.script]) out.push({ line: l, where: w, ref })
        for (const o of n.options) for (const l of o.showIf ?? []) out.push({ line: l, where: `${w} (option ${o.id})`, ref })
      } else if (n.type === 'branch') for (const c of n.cases) for (const l of c.conditions) out.push({ line: l, where: `${w} (${c.label || c.id})`, ref })
      else if (n.type === 'action') for (const op of n.ops) if (op.op === 'line') out.push({ line: op.line, where: w, ref })
    }
  }
  return out
}

/** The command a rule line calls ("!RepIsAtWorst x" → RepIsAtWorst), and its arguments. */
export function lineCommand(line: string): { name: string; args: string[] } | null {
  const t = line.trim().replace(/^!\s*/, '')
  const m = /^([A-Z][A-Za-z0-9_]*)\b(.*)$/.exec(t)
  if (!m) return null
  const args = (m[2].match(/"[^"]*"|\S+/g) ?? [])
  return { name: m[1], args }
}

/** Whether `n` arguments fit one of the command's forms. */
export function fitsForms(forms: ParamDef[][], n: number): boolean {
  if (!forms.length) return true
  return forms.some((f) => {
    const min = f.filter((p) => !p.optional && !p.rest).length
    const max = f.some((p) => p.rest) ? Infinity : f.length
    return n >= min && n <= max
  })
}

/**
 * Version problems (§5, §7.3 group 1): ids, commands, command forms and tokens the target doesn't
 * have. With the older version targeted they block Export (errors); with the newer targeted, the
 * removed ones are the migration's "Must change".
 */
export function versionProblems(m: ModModel, d: VersionDiff, targetIsNewer: boolean, targetDefs: GameDefinitions): Problem[] {
  const out: Problem[] = []
  const missing = targetIsNewer ? d.onlyOlder : d.onlyNewer
  const fam = versionFamily(targetIsNewer ? d.newer : d.older)
  const why = (id: string) => (targetIsNewer ? `removed in ${fam}` : `${versionFamily(d.newer)} only`)
  const sets = new Map(Object.entries(missing).map(([k, v]) => [k, new Set(v)]))
  visitRefs(m, (r) => {
    if (!sets.get(r.cat)?.has(r.id)) return
    out.push({
      level: 'error', area: 'Version', ref: r.ref, key: `version:${r.cat}:${r.id}:${r.where}`,
      message: `${r.where} uses ${r.cat} "${r.id}" (${why(r.id)}): Starsector ${fam} doesn't have it.`,
      fixes: [
        { label: 'Pick a replacement…', action: 'versionReplace', arg: { cat: r.cat, id: r.id } },
        { label: 'Remove', action: 'versionRemove', arg: { cat: r.cat, id: r.id } },
        ...(targetIsNewer ? [] : [{ label: `Target ${versionFamily(d.newer)} instead`, action: 'versionTarget', arg: 'newer' }])
      ]
    })
  })
  const cmds = sets.get('command')
  const forms = new Map(d.commandForms.map((c) => [c.name, c]))
  const toks = sets.get('token')
  for (const l of typedLines(m)) {
    const c = lineCommand(l.line)
    if (c && cmds?.has(c.name)) out.push({ level: 'error', area: 'Version', ref: l.ref, key: `version:cmdline:${c.name}:${l.where}`, message: `${l.where}: "${c.name}" (${why(c.name)}) isn't a command in Starsector ${fam}: ${l.line}` })
    else if (c && forms.has(c.name)) {
      const def = targetDefs.ruleCommands.find((x) => x.name === c.name)
      if (def && !fitsForms(def.forms, c.args.length)) out.push({ level: 'error', area: 'Version', ref: l.ref, key: `version:form:${c.name}:${l.where}`, message: `${l.where}: in Starsector ${fam}, ${c.name} takes ${def.forms.map((f) => f.map((p) => (p.optional ? `[${p.name}]` : `<${p.name}>`)).join(' ') || '(nothing)').join(' or ')}: ${l.line}` })
    }
    if (toks) for (const t of l.line.match(/\$[A-Za-z_][\w.]*/g) ?? []) if (toks.has(t.toLowerCase())) out.push({ level: 'error', area: 'Version', ref: l.ref, key: `version:token:${t}:${l.where}`, message: `${l.where}: token ${t} (${why(t)}) doesn't exist in Starsector ${fam}.` })
  }
  // the player faction's new-game portrait lists (0.98.5a's player_male / player_female keys)
  if (!targetIsNewer && cmpGameVersions(d.older, '0.98.5a') < 0 && cmpGameVersions(d.newer, '0.98.5a') >= 0) for (const f of m.factions) {
    for (const k of ['player_male', 'player_female']) {
      const v = f.kind === 'addition' ? getPath(f.raw, `portraits.${k}`) : f.patch.add[`portraits.${k}`]
      if (Array.isArray(v) && v.length) out.push({ level: 'error', area: 'Version', ref: { page: 'factions', id: f.id }, key: `version:factionKey:${f.id}:${k}`, message: `Faction ${f.id} lists portraits under ${k} (${versionFamily(d.newer)} only): Starsector ${fam} doesn't read that list. Use the standard lists for ${fam}.` })
    }
  }
  // tokens in dialog text
  if (toks) for (const q of m.quests) for (const n of q.nodes) {
    if (n.type !== 'dialog') continue
    for (const t of `${n.text} ${n.options.map((o) => o.text).join(' ')}`.match(/\$[A-Za-z_][\w.]*/g) ?? []) {
      if (toks.has(t.toLowerCase())) out.push({ level: 'error', area: 'Version', ref: { page: 'quests', id: q.id, sub: n.id }, key: `version:token:${t}:${q.id}:${n.id}`, message: `Quest ${q.title} › ${n.id}: token ${t} (${why(t)}) doesn't exist in Starsector ${fam}.` })
    }
  }
  return out
}

/** Replace (or with null remove) every use of an id of a category. Returns how many were changed. */
export function replaceRefs(m: ModModel, cat: DiffCategory, from: string, to: string | null): number {
  const sites: RefSite[] = []
  visitRefs(m, (r) => { if (r.cat === cat && r.id === from) sites.push(r) })
  for (const s of sites) s.set(to)
  return sites.length
}
