/**
 * The editable model of the active mod and how it is saved (PLAN.md §3, "Two kinds of source of
 * truth"). Plan files are written as plain JSON; the mod's .faction files are patched in place,
 * keeping comments and formatting (Ship Editor's jsonedit); an override's file holds only the patch.
 */
import { updateLooseText, serialize, detectFormat } from './jsonedit'
import { parseLooseObject } from './loosejson'
import { parseCsvRecords, csvCell } from './csvedit'
import { jsonToPatch, patchToJson, clone, type FactionPatch } from './faction'
import {
  PLAN_FORMAT, newProjectFile, emptyNameLists, emptyModTypes, emptyFleetPlans,
  type Descriptions, type EncounterDef, type FactionsRuntime, type FleetPlans, type ItemDef, type ModTypes, type NameLists, type PoolPlan, type EventSchedulerPlan, type ProgressEventPlan, type ScatterPlan, type BountyPlan, type PersonDef, type Phrase, type ProjectFile,
  type QuestPlan, type StarSystemDef, type TestProfile, type TodoMap
} from './model'
import type { FileWrite, ProjectState } from './project'
import { pruneTodos } from './todo'
import { importNexFiles, NEX_PLAN } from './nexconfig'
import { SAGA_FORGE_VERSION } from './appinfo'
import { cmpVersionStrings } from './version'

export interface FactionAdditionEdit {
  kind: 'addition'
  id: string
  file: string
  /** The full faction document as edited (unknown keys kept). */
  raw: Record<string, unknown>
  listed: boolean
}
export interface FactionOverrideEdit {
  kind: 'override'
  /** Target faction id. */
  id: string
  file: string
  patch: FactionPatch
}
export type FactionEdit = FactionAdditionEdit | FactionOverrideEdit

export interface ModModel {
  project: ProjectFile
  quests: QuestPlan[]
  people: PersonDef[]
  items: ItemDef[]
  systems: StarSystemDef[]
  encounters: EncounterDef[]
  phrases: Phrase[]
  testProfiles: TestProfile[]
  factionsRuntime: FactionsRuntime
  descriptions: Descriptions
  /** Person name pools and ship name lists (R3). */
  names: NameLists
  /** The mod's own entity, planet and star types (R21). Optional: older models have none. */
  types?: ModTypes
  /** Named fleet templates and fleet type names (Phase 5). Optional: older models have none. */
  fleets?: FleetPlans
  /** Named random pools (Phase 7a). Optional: older models have none. */
  pools?: PoolPlan[]
  /** World event schedulers (Phase 8d). Optional: older models have none. */
  events?: EventSchedulerPlan[]
  /** Progress events (Phase 8d-3). Optional: older models have none. */
  progress?: ProgressEventPlan[]
  /** Scatter at new game (Phase 7e). Optional: older models have none. */
  scatter?: ScatterPlan[]
  /** MagicLib bounties (#27). Optional: older models have none. */
  bounties?: BountyPlan[]
  /** #63: Nexerelin faction configs of the mod's own factions (faction id → the document, unknown keys kept). Optional: older models have none. */
  nexerelin?: Record<string, Record<string, unknown>>
  /** #63: ready-made fleets the mod adds to the player faction (free start, own faction): Nexerelin's player.json, appended. */
  nexerelinPlayer?: Record<string, unknown>
  factions: FactionEdit[]
}

export function modelFromProject(p: ProjectState): ModModel {
  const m = modelOf(p)
  // #63: no plan file yet: the mod's own Nexerelin config files are read in (their relations join the faction's)
  if (p.nexerelin == null) importNexFiles(m, p.files)
  return m
}

function modelOf(p: ProjectState): ModModel {
  return clone({
    project: p.project,
    quests: p.quests,
    people: p.people,
    items: p.items,
    systems: p.systems,
    encounters: p.encounters,
    phrases: p.phrases,
    testProfiles: p.testProfiles,
    factionsRuntime: p.factionsRuntime,
    descriptions: p.descriptions,
    names: { people: p.names?.people ?? [], ships: p.names?.ships ?? [] },
    types: { entities: p.types?.entities ?? [], planets: p.types?.planets ?? [] },
    fleets: { templates: p.fleets?.templates ?? [], typeNames: p.fleets?.typeNames ?? {} },
    pools: p.pools ?? [],
    events: p.events ?? [],
    progress: p.progress ?? [],
    scatter: p.scatter ?? [],
    bounties: p.bounties ?? [],
    nexerelin: p.nexerelin ?? {},
    ...(p.nexerelinPlayer ? { nexerelinPlayer: p.nexerelinPlayer } : {}),
    factions: p.factions.map((f): FactionEdit => f.kind === 'addition'
      ? { kind: 'addition', id: f.id, file: f.file, raw: f.raw, listed: f.listed }
      : { kind: 'override', id: f.id, file: f.file, patch: jsonToPatch(f.raw) })
  })
}

export const emptyModel = (prefix = ''): ModModel => ({
  project: newProjectFile(prefix), quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [],
  factionsRuntime: { relations: {}, scripted: {} }, descriptions: {}, names: emptyNameLists(), types: emptyModTypes(), fleets: emptyFleetPlans(), pools: [], events: [], progress: [], scatter: [], bounties: [], nexerelin: {}, factions: []
})

export const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

export const questFile = (id: string) => `sagaforge/quests/${id}.quest.json`
export const systemFile = (id: string) => `sagaforge/locations/${id}.system.json`
export const encounterFile = (id: string) => `sagaforge/encounters/${id}.encounter.json`
export const releaseFile = (v: string) => `sagaforge/releases/${v}.json`

/** A copy of the model without the to-dos that are done (only copies what has some). */
function withoutDoneTodos(m: ModModel): ModModel {
  const has = (l: { todo?: unknown }[]) => l.some((x) => x.todo)
  if (![m.people, m.quests, m.items, m.encounters, m.systems].some(has)) return m
  const prune = <T extends { todo?: TodoMap }>(l: T[]): T[] => l.map((x) => { if (!x.todo) return x; const c = { ...x, todo: { ...x.todo } }; pruneTodos(c); return c })
  return { ...m, people: prune(m.people), quests: prune(m.quests), items: prune(m.items), encounters: prune(m.encounters), systems: prune(m.systems) }
}

/** Plan files (path → text) for a model. */
export function planTexts(model: ModModel): Record<string, string> {
  // to-dos whose field has changed since they were marked are done: not written (R9)
  const m = withoutDoneTodos(model)
  const out: Record<string, string> = {}
  // the version that saved it, unless a newer Saga Forge did (this one doesn't lower it)
  const savedWith = m.project.savedWith && cmpVersionStrings(m.project.savedWith, SAGA_FORGE_VERSION) > 0 ? m.project.savedWith : SAGA_FORGE_VERSION
  out['sagaforge/project.json'] = json({ ...m.project, format: Math.max(PLAN_FORMAT, m.project.format ?? 0), savedWith })
  for (const q of m.quests) out[questFile(q.id)] = json({ ...q, format: PLAN_FORMAT })
  for (const s of m.systems) out[systemFile(s.id)] = json({ ...s, format: PLAN_FORMAT })
  for (const e of m.encounters) out[encounterFile(e.id)] = json({ ...e, format: PLAN_FORMAT })
  const list = (key: string, v: unknown[]) => json({ format: PLAN_FORMAT, [key]: v })
  if (m.people.length) out['sagaforge/people.json'] = list('people', m.people)
  if (m.items.length) out['sagaforge/items.json'] = list('items', m.items)
  if (m.phrases.length) out['sagaforge/phrases.json'] = list('phrases', m.phrases)
  if (m.testProfiles.length) out['sagaforge/test-profiles.json'] = list('profiles', m.testProfiles)
  if (Object.keys(m.factionsRuntime.relations).length || Object.keys(m.factionsRuntime.scripted).length) {
    out['sagaforge/factions.json'] = json({ format: PLAN_FORMAT, ...m.factionsRuntime })
  }
  if (Object.keys(m.descriptions).length) out['sagaforge/descriptions.json'] = json({ format: PLAN_FORMAT, descriptions: m.descriptions })
  if (m.names.people.length || m.names.ships.length) out['sagaforge/names.json'] = json({ format: PLAN_FORMAT, ...m.names })
  if (m.types?.entities.length || m.types?.planets.length) out['sagaforge/types.json'] = json({ format: PLAN_FORMAT, ...m.types })
  if (m.fleets?.templates.length || Object.keys(m.fleets?.typeNames ?? {}).length) out['sagaforge/fleets.json'] = json({ format: PLAN_FORMAT, ...m.fleets })
  if (m.pools?.length) out['sagaforge/pools.json'] = list('pools', m.pools)
  if (m.events?.length) out['sagaforge/events.json'] = list('events', m.events)
  if (m.progress?.length) out['sagaforge/progress.json'] = list('progress', m.progress)
  if (m.scatter?.length) out['sagaforge/scatter.json'] = list('scatter', m.scatter)
  if (m.bounties?.length) out['sagaforge/bounties.json'] = list('bounties', m.bounties)
  if (Object.keys(m.nexerelin ?? {}).length || m.nexerelinPlayer) out[NEX_PLAN] = json({ format: PLAN_FORMAT, factions: m.nexerelin ?? {}, ...(m.nexerelinPlayer ? { player: m.nexerelinPlayer } : {}) })
  return out
}

/** Plan files Saga Forge manages (others under sagaforge/, like backups and releases, are left alone). */
const MANAGED = /^sagaforge\/(project\.json|people\.json|items\.json|phrases\.json|test-profiles\.json|factions\.json|descriptions\.json|names\.json|types\.json|fleets\.json|pools\.json|events\.json|progress\.json|scatter\.json|bounties\.json|nexerelin\.json|quests\/.+\.quest\.json|locations\/.+\.system\.json|encounters\/.+\.encounter\.json)$/

/** Text of a faction file for this edit, keeping the existing file's formatting where there is one. */
export function factionText(f: FactionEdit, oldText: string | undefined): string {
  const value = f.kind === 'addition' ? f.raw : patchToJson(f.patch)
  if (oldText != null) {
    try {
      return updateLooseText(oldText, value)
    } catch {
      /* the old file can't be patched in place (e.g. unparseable): write it fresh below */
    }
  }
  const fmt = { unit: '\t', eol: '\n' }
  const head = f.kind === 'override'
    ? `# Saga Forge override of ${f.id}: only this mod's changes. The game merges this file\n# into the original: objects key by key, lists appended. Edit it in Saga Forge to keep it a patch.\n`
    : ''
  return head + serialize(value, '', fmt) + '\n'
}

/** factions.csv text with a row for every listed addition (rows are only added, never removed by hand edits). */
export function factionsCsvText(old: string | undefined, additions: FactionAdditionEdit[]): string | null {
  const want = additions.filter((a) => a.listed).map((a) => a.file)
  const eol = old?.includes('\r\n') ? '\r\n' : '\n'
  let text = old ?? `faction${eol}`
  const have = new Set(parseCsvRecords(text).map((r) => (r.fields[0] ?? '').trim().replace(/\\/g, '/').toLowerCase()))
  const missing = want.filter((f) => !have.has(f.toLowerCase()))
  // rows of additions that are no longer listed (or deleted) are removed, but only ours (by path)
  const ours = new Set(additions.map((a) => a.file.toLowerCase()))
  const drop = new Set(additions.filter((a) => !a.listed).map((a) => a.file.toLowerCase()))
  if (!missing.length && ![...have].some((h) => drop.has(h))) return old ?? null
  if (drop.size) {
    const recs = parseCsvRecords(text)
    let out = ''
    let pos = 0
    for (const r of recs) {
      const v = (r.fields[0] ?? '').trim().replace(/\\/g, '/').toLowerCase()
      if (drop.has(v)) {
        out += text.slice(pos, r.start)
        pos = r.end
        if (text.startsWith('\r\n', pos)) pos += 2
        else if (text[pos] === '\n') pos += 1
      }
    }
    text = out + text.slice(pos)
  }
  void ours
  if (missing.length) {
    if (text.length && !text.endsWith('\n')) text += eol
    text += missing.map((m) => csvCell(m)).join(eol) + eol
  }
  return text
}

/**
 * The writes that save a model: changed plan files, removed plan files, changed faction files and
 * factions.csv. Unchanged files are not included. `expectedHash` guards against changes on disk.
 */
export function modelToWrites(m: ModModel, loaded: ProjectState, deletedFactionFiles: string[] = []): FileWrite[] {
  const writes: FileWrite[] = []
  const files = loaded.files
  const hashOf = (p: string) => (files[p] ? files[p].hash : null)
  const plans = planTexts(m)
  for (const [p, text] of Object.entries(plans)) {
    if (files[p]?.text === text) continue
    writes.push({ path: p, text, expectedHash: hashOf(p) })
  }
  for (const p of Object.keys(files)) {
    if (MANAGED.test(p) && !(p in plans)) writes.push({ path: p, text: '', remove: true, expectedHash: hashOf(p) })
  }
  const src = (id: string) => loaded.factions.find((f) => f.id === id)
  for (const f of m.factions) {
    const old = files[f.file]?.text
    const text = factionText(f, old)
    if (old === text) continue
    writes.push({ path: f.file, text, expectedHash: hashOf(f.file) })
  }
  for (const p of deletedFactionFiles) {
    if (files[p] && !m.factions.some((f) => f.file === p)) writes.push({ path: p, text: '', remove: true, expectedHash: hashOf(p) })
  }
  const csvPath = 'data/world/factions/factions.csv'
  const additions = m.factions.filter((f): f is FactionAdditionEdit => f.kind === 'addition')
  const removedAdditions = loaded.factions.filter((f) => f.kind === 'addition' && !additions.some((a) => a.file === f.file))
    .map((f): FactionAdditionEdit => ({ kind: 'addition', id: f.id, file: f.file, raw: {}, listed: false }))
  const csv = factionsCsvText(files[csvPath]?.text, [...additions, ...removedAdditions])
  if (csv != null && csv !== files[csvPath]?.text) writes.push({ path: csvPath, text: csv, expectedHash: hashOf(csvPath) })
  return writes
}

/** Parse text written by planTexts back (used by tests and by Reload). */
export function parsePlan<T>(text: string): T {
  return parseLooseObject(text).value as T
}

export { detectFormat }
