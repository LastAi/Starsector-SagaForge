/**
 * Task #64 (PLAN.md §10.6): checks of versions by installed mods. A version for a mod that isn't
 * optional, two versions setting a field differently where they combine (the combined cell must
 * decide), a path a version can't follow, what each version refers to (known, and only from mods
 * that are part of that version), and versioned names spelled out in texts.
 */
import type { Problem, ProblemRef } from '../api'
import type { CheckContext } from './index'
import type { ModModel } from '../serialize'
import { comboKey, mentionedMods, resolveItem, subsets } from '../itemversions'
import { lowerPlacesModel, resolveModel, versionables, VKIND_LABEL, type VKind } from '../modelversions'
import { scanItems, sourceLookup, type RefKind } from '../moduses'
import { CORE_ID, optionalMods, SAGALIB_ID, useOf } from '../modlist'

const PAGE: Record<VKind, ProblemRef['page']> = { person: 'people', quest: 'quests', encounter: 'encounters', system: 'locations', events: 'saga', pool: 'saga', factions: 'factions', item: 'items', description: 'locations' }
const refOf = (kind: VKind, id: string): ProblemRef => (kind === 'events' ? { page: 'saga', id: 'events', sub: id } : kind === 'pool' ? { page: 'saga', id: 'pools', sub: id } : kind === 'factions' ? { page: 'factions' } : { page: PAGE[kind], id })
const CHECKED: RefKind[] = ['person', 'entity', 'faction', 'system', 'quest']

export function versionCheckProblems(ctx: CheckContext): Problem[] {
  const { model: m, index, loaded } = ctx
  const out: Problem[] = []
  const all = versionables(m).filter((v) => v.item.versions?.length)
  if (!all.length) return out
  const optional = new Set(optionalMods(m.project).map((x) => x.id))
  const name = (id: string) => m.project.mods?.find((x) => x.id === id)?.name ?? index.sources.find((s) => s.id === id)?.name ?? id
  const cell = (c: string[]) => (c.length ? c.map(name).join(' + ') : 'Base')

  for (const v of all) {
    const label = `${VKIND_LABEL[v.kind]} "${v.label}"`
    const ref = refOf(v.kind, v.id)
    const ment = mentionedMods(v.item)
    for (const id of ment.filter((x) => !optional.has(x))) {
      out.push({ level: 'warning', area: 'Versions', message: `${label} has a version for ${name(id)}, which isn't an optional mod in Saga › Mods (${useOf(m.project, id) === 'none' ? 'not in the list' : useOf(m.project, id)}): that version never applies.`, ref, key: `vermod:${v.kind}:${v.id}:${id}` })
    }
    if (ment.length > 6) out.push({ level: 'error', area: 'Versions', message: `${label} has versions for ${ment.length} mods; SagaLib handles at most 6 per item.`, ref, key: `vermany:${v.kind}:${v.id}` })
    for (const c of subsets(ment.filter((x) => optional.has(x)))) {
      const r = resolveItem(v.item, c)
      if (c.length > 1) for (const p of r.conflicts) {
        out.push({ level: 'error', area: 'Versions', message: `${label}: the ${c.map(name).join(' and ')} versions set ${p} differently. Pick the value in the ${cell(c)} version (the versions strip asks).`, ref, key: `verconflict:${v.kind}:${v.id}:${comboKey(c)}:${p}` })
      }
      for (const p of r.errors) out.push({ level: 'warning', area: 'Versions', message: `${label}: the ${cell(c)} version changes ${p}, which isn't there (it was removed or renamed); that change is skipped.`, ref, key: `verpath:${v.kind}:${v.id}:${comboKey(c)}:${p}` })
    }
  }

  // ---- what each version refers to: known, and only from mods that are part of it
  const look = sourceLookup(index, m, loaded.sourceId)
  const keyed = new Set(all.map((v) => `${v.kind === 'events' ? 'events' : v.kind}:${v.id}`))
  const baseRefs = new Map(scanItems(lowerPlacesModel(resolveModel(m, []))).map((it) => [it.key, new Set(it.refs.map((r) => `${r.kind}:${r.id}`))]))
  const modsAll = [...new Set(all.flatMap((v) => mentionedMods(v.item)))].filter((x) => optional.has(x))
  const seen = new Set<string>()
  for (const c of subsets(modsAll, 4)) {
    if (!c.length) continue
    for (const it of scanItems(lowerPlacesModel(resolveModel(m, c)))) {
      if (!keyed.has(it.key)) continue
      const base = baseRefs.get(it.key) ?? new Set()
      for (const r of it.refs) {
        if (!CHECKED.includes(r.kind) || !r.id || base.has(`${r.kind}:${r.id}`) || r.id.startsWith('target:') || r.id.startsWith('$')) continue
        const k = `${it.key}|${r.kind}:${r.id}|${comboKey(c)}`
        if (seen.has(k)) continue
        seen.add(k)
        const src = look(r.kind, r.id)
        if (!src) {
          out.push({ level: 'warning', area: 'Versions', message: `${it.label}, ${cell(c)} version: ${r.kind} "${r.id}" (${r.where}) isn't known, so it isn't checked. If a mod makes it in its code, import a sector snapshot (Saga › Mods).`, ref: it.ref, key: `verunknown:${it.key}:${r.kind}:${r.id}` })
          continue
        }
        if (src === CORE_ID || src === loaded.sourceId || src === SAGALIB_ID) continue
        if (optional.has(src) && !c.includes(src)) {
          out.push({ level: 'error', area: 'Versions', message: `${it.label}, ${cell(c)} version: ${r.id} (${r.where}) belongs to ${name(src)}, which isn't part of this version. Set it in a version that includes ${name(src)}.`, ref: it.ref, key: `verforeign:${it.key}:${r.id}:${comboKey(c)}` })
        } else if (useOf(m.project, src) === 'none') {
          out.push({ level: 'warning', area: 'Versions', message: `${it.label}, ${cell(c)} version: ${r.id} (${r.where}) belongs to ${name(src)}, which isn't in Saga › Mods.`, ref: it.ref, key: `verunlisted:${it.key}:${r.id}` })
        }
      }
    }
  }

  out.push(...literalNameProblems(m))
  return out
}

/** The names a person has in any version (full and last), when versions change them. */
function versionedNames(m: ModModel): { id: string; names: string[] }[] {
  const out: { id: string; names: string[] }[] = []
  for (const p of m.people) {
    if (!p.versions?.some((v) => Object.keys(v.set).some((k) => k === 'name' || k.startsWith('name.')))) continue
    const names = new Set<string>()
    for (const c of subsets(mentionedMods(p))) {
      const r = resolveItem(p, c).value
      const full = `${r.name.first} ${r.name.last}`.trim()
      if (full) names.add(full)
      if (r.name.last.trim().length > 2) names.add(r.name.last.trim())
      else if (r.name.first.trim().length > 2 && !r.name.last.trim()) names.add(r.name.first.trim())
    }
    out.push({ id: p.id, names: [...names].sort((a, b) => b.length - a.length) })
  }
  return out
}

/**
 * PLAN.md §10.6: dialog should name a versioned person through their name token, so each version's
 * name shows. A text that spells one of their names out is a warning.
 */
export function literalNameProblems(m: ModModel): Problem[] {
  const out: Problem[] = []
  const people = versionedNames(m)
  if (!people.length) return out
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const res = people.map((p) => ({ id: p.id, re: new RegExp(`(^|[^\\w$])(${p.names.map(esc).join('|')})(?![\\w])`) }))
  const test = (text: string | undefined, where: string, ref: ProblemRef, key: string) => {
    if (!text) return
    for (const p of res) {
      const hit = p.re.exec(text)
      if (!hit) continue
      out.push({ level: 'warning', area: 'Versions', message: `${where} spells out "${hit[2]}", but ${p.id}'s name differs between versions. Use $${p.id}_name (or $${p.id}_firstName, $${p.id}_lastName) so each version's name shows.`, ref, key: `vername:${key}:${p.id}` })
    }
  }
  for (const q of m.quests) {
    // the quest as written and every version of it
    for (const c of subsets(mentionedMods(q))) {
      const rq = resolveItem(q, c).value
      const ref = (sub?: string): ProblemRef => ({ page: 'quests', id: q.id, sub })
      for (const n of rq.nodes) {
        if (n.type === 'dialog') {
          test(n.text, `"${q.title}", node "${n.title || n.id}"`, ref(n.id), `${q.id}/${n.id}`)
          for (const o of n.options) test(o.text, `"${q.title}", option "${o.id}"`, ref(n.id), `${q.id}/${n.id}/${o.id}`)
          for (const ph of n.phrases) for (const cs of ph.cases) test(cs.text, `"${q.title}", phrase ${ph.token}`, ref(n.id), `${q.id}/${ph.token}`)
        }
        if (n.type === 'raid') test(n.text, `"${q.title}", raid "${n.title || n.id}"`, ref(n.id), `${q.id}/${n.id}`)
        if (n.type === 'wait') test(n.arriveText, `"${q.title}", arrival`, ref(n.id), `${q.id}/${n.id}`)
      }
      for (const s of rq.stages) { test(s.journal, `"${q.title}", stage "${s.title || s.id}" journal`, ref(), `${q.id}/stage/${s.id}`); test(s.nextStep, `"${q.title}", stage "${s.title || s.id}"`, ref(), `${q.id}/next/${s.id}`) }
      const st = rq.start as { offerText?: string; blurb?: string }
      test(st.offerText, `"${q.title}", offer text`, ref(), `${q.id}/offer`)
      test(st.blurb, `"${q.title}", bar blurb`, ref(), `${q.id}/blurb`)
    }
  }
  for (const ph of m.phrases) for (const cs of ph.cases) test(cs.text, `Phrase ${ph.token}`, { page: 'saga' }, `phrase/${ph.token}`)
  // dedupe (a text in several versions)
  const seen = new Set<string>()
  return out.filter((p) => (seen.has(p.key!) ? false : (seen.add(p.key!), true)))
}
