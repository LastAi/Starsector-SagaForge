/**
 * Release snapshots and save warnings (PLAN.md §6 "Save-game safety across mod updates").
 * "Mark as released" stores every id saves can depend on; later changes are compared with the
 * last snapshot and shown as Problems of level "save", with the fix.
 */
import { PLAN_FORMAT, type ReleaseSnapshot } from './model'
import type { ModModel } from './serialize'
import type { Problem } from './api'
import type { CheckContext } from './checks'
import { buildRegistry } from './flags'
import { cmpVersionStrings } from './version'

export function makeSnapshot(m: ModModel, version: string, date = new Date()): ReleaseSnapshot {
  const reg = buildRegistry(m, [])
  return {
    format: PLAN_FORMAT,
    version,
    date: date.toISOString().slice(0, 10),
    quests: Object.fromEntries(m.quests.filter((q) => q.kind === 'quest').map((q) => [q.id, {
      stages: q.stages.map((s) => s.id),
      variables: q.variables.map((v) => v.name),
      renamed: Object.fromEntries(q.stages.filter((s) => s.renamedFrom.length).map((s) => [s.id, [...s.renamedFrom]]))
    }])),
    flags: [...reg.values()].filter((e) => e.setBy.length && e.key.startsWith('$global.')).map((e) => e.key).sort(),
    people: m.people.map((p) => p.id),
    markets: m.systems.flatMap((s) => s.entities.flatMap((e) => (e.market ? [e.market.id] : []))),
    systems: Object.fromEntries(m.systems.map((s) => [s.id, { addToExistingSaves: s.addToExistingSaves, entities: s.entities.map((e) => e.id) }])),
    factions: m.factions.filter((f) => f.kind === 'addition').map((f) => f.id),
    items: m.items.map((i) => i.id),
    encounters: m.encounters.map((e) => e.id)
  }
}

export function lastRelease(releases: ReleaseSnapshot[]): ReleaseSnapshot | null {
  return [...releases].sort((a, b) => cmpVersionStrings(a.version, b.version)).pop() ?? null
}

/** Save warnings: changes since the last release that affect players who update mid-campaign. */
export function saveWarnings(m: ModModel, rel: ReleaseSnapshot): Problem[] {
  const out: Problem[] = []
  const since = `since ${rel.version}`
  const save = (message: string, ref: Problem['ref'], key: string, fixes?: Problem['fixes']): void => { out.push({ level: 'save', area: 'Save', message, ref, key: `save:${rel.version}:${key}`, fixes }) }
  for (const [qid, old] of Object.entries(rel.quests)) {
    const q = m.quests.find((x) => x.id === qid)
    if (!q) { save(`Quest "${qid}" was removed ${since}. Players in the middle of it see it end quietly.`, { page: 'quests' }, `quest:${qid}`); continue }
    for (const sid of old.stages) {
      if (q.stages.some((s) => s.id === sid)) continue
      const aliased = q.stages.find((s) => s.renamedFrom.includes(sid))
      if (aliased) continue
      save(`${q.title}: stage "${sid}" is gone ${since}. Players at this stage lose their place.`, { page: 'quests', id: qid }, `stage:${qid}:${sid}`,
        q.stages.map((s) => ({ label: `Move them to "${s.title}"`, action: 'aliasStage', arg: { quest: qid, from: sid, to: s.id } })).slice(0, 4))
    }
    for (const v of old.variables) if (!q.variables.some((x) => x.name === v)) save(`${q.title}: variable "${v}" is gone ${since}. Saves keep the old value under the old key.`, { page: 'quests', id: qid }, `var:${qid}:${v}`)
  }
  const reg = buildRegistry(m, [])
  for (const f of rel.flags) if (!reg.get(f)?.setBy.length) save(`Flag ${f} is no longer set by the mod ${since}. Rules that read it in old saves still see the old value.`, { page: 'saga', id: 'flags', sub: f }, `flag:${f}`)
  for (const p of rel.people) if (!m.people.some((x) => x.id === p)) save(`Person "${p}" was removed or renamed ${since}. Saves still have the old one; quests that use it break.`, { page: 'people' }, `person:${p}`)
  for (const mk of rel.markets) if (!m.systems.some((s) => s.entities.some((e) => e.market?.id === mk))) save(`Market "${mk}" was removed or renamed ${since}. Saves still have the old one.`, { page: 'locations' }, `market:${mk}`)
  for (const [sid, s] of Object.entries(rel.systems)) {
    const now = m.systems.find((x) => x.id === sid)
    if (!now) { save(`System "${sid}" was removed or renamed ${since}. Saves still have the old one.`, { page: 'locations' }, `system:${sid}`); continue }
    for (const e of s.entities) if (!now.entities.some((x) => x.id === e)) save(`${now.name}: entity "${e}" was removed or renamed ${since}. Saves still have the old one.`, { page: 'locations', id: sid }, `entity:${e}`)
  }
  for (const s of m.systems) {
    if (!(s.id in rel.systems) && !s.addToExistingSaves) save(`"${s.name}" is new ${since} and only appears in new games. Tick "Existing saves" to have SagaLib add it to saves that don't have it.`, { page: 'locations', id: s.id }, `newsys:${s.id}`, [{ label: 'Add it to existing saves', action: 'addToExisting', arg: s.id }])
    const old = rel.systems[s.id]
    if (old && s.entities.some((e) => !old.entities.includes(e.id)) && !s.addToExistingSaves && s.kind === 'new') save(`${s.name}: new entities ${since} only appear in new games.`, { page: 'locations', id: s.id }, `newent:${s.id}`)
  }
  for (const p of m.people) if (!rel.people.includes(p.id) && p.placement.at === 'market') { /* new people are placed on load by SagaLib: fine */ }
  for (const f of rel.factions) if (!m.factions.some((x) => x.kind === 'addition' && x.id === f)) save(`Faction "${f}" was removed or renamed ${since}. Existing saves keep the old faction; this is strongly discouraged.`, { page: 'factions' }, `faction:${f}`)
  for (const i of rel.items) if (!m.items.some((x) => x.id === i)) save(`Item "${i}" was removed or renamed ${since}. Players who carry it will see it vanish or break.`, { page: 'items' }, `item:${i}`)
  for (const e of rel.encounters) if (!m.encounters.some((x) => x.id === e)) save(`Encounter "${e}" was removed or renamed ${since}. Fleets already spawned in saves lose their script.`, { page: 'encounters' }, `enc:${e}`)
  return out
}

export function saveChecker(ctx: CheckContext): Problem[] {
  const rel = lastRelease(ctx.loaded.releases)
  return rel ? saveWarnings(ctx.model, rel) : []
}

/** Apply a save-warning fix. */
export function applySaveFix(m: ModModel, action: string, arg: unknown): boolean {
  if (action === 'aliasStage') {
    const a = arg as { quest: string; from: string; to: string }
    const s = m.quests.find((q) => q.id === a.quest)?.stages.find((x) => x.id === a.to)
    if (s && !s.renamedFrom.includes(a.from)) s.renamedFrom.push(a.from)
    return true
  }
  if (action === 'addToExisting') { const s = m.systems.find((x) => x.id === arg); if (s) s.addToExistingSaves = true; return true }
  return false
}

/** Rename a stage id: 'alias' keeps the old id in renamedFrom (players move), 'drop' forgets it. Nodes follow. */
export function renameStage(m: ModModel, quest: string, from: string, to: string, how: 'alias' | 'drop'): void {
  const q = m.quests.find((x) => x.id === quest)
  const s = q?.stages.find((x) => x.id === from)
  if (!q || !s) return
  s.id = to
  if (how === 'alias' && !s.renamedFrom.includes(from)) s.renamedFrom.push(from)
  for (const n of q.nodes) if (n.type === 'stage' && n.stage === from) n.stage = to
  const swap = (l: string) => l.replace(new RegExp(`(SF_AtStep ${quest} )${from}\\b`), `$1${to}`).replace(new RegExp(`(\\$global\\.${quest}_step == )${from}\\b`), `$1${to}`)
  for (const n of q.nodes) {
    if (n.type === 'dialog') { n.conditions = n.conditions.map(swap); for (const o of n.options) if (o.showIf) o.showIf = o.showIf.map(swap) }
    if (n.type === 'branch') for (const c of n.cases) c.conditions = c.conditions.map(swap)
  }
  for (const e of m.encounters) if (e.spawn.quest === quest && e.spawn.stage === from) e.spawn.stage = to
  for (const p of m.testProfiles) if (p.quests[quest]?.step === from) p.quests[quest].step = to
}

export const releaseFile = (v: string) => `sagaforge/releases/${v}.json`
