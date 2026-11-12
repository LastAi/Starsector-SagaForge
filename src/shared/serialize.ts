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
  PLAN_FORMAT, newProjectFile,
  type Descriptions, type EncounterDef, type FactionsRuntime, type ItemDef, type PersonDef, type Phrase, type ProjectFile,
  type QuestPlan, type StarSystemDef, type TestProfile
} from './model'
import type { FileWrite, ProjectState } from './project'

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
  factions: FactionEdit[]
}

export function modelFromProject(p: ProjectState): ModModel {
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
    factions: p.factions.map((f): FactionEdit => f.kind === 'addition'
      ? { kind: 'addition', id: f.id, file: f.file, raw: f.raw, listed: f.listed }
      : { kind: 'override', id: f.id, file: f.file, patch: jsonToPatch(f.raw) })
  })
}

export const emptyModel = (prefix = ''): ModModel => ({
  project: newProjectFile(prefix), quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [],
  factionsRuntime: { relations: {}, scripted: {} }, descriptions: {}, factions: []
})

export const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

export const questFile = (id: string) => `sagaforge/quests/${id}.quest.json`
export const systemFile = (id: string) => `sagaforge/locations/${id}.system.json`
export const encounterFile = (id: string) => `sagaforge/encounters/${id}.encounter.json`
export const releaseFile = (v: string) => `sagaforge/releases/${v}.json`

/** Plan files (path → text) for a model. */
export function planTexts(m: ModModel): Record<string, string> {
  const out: Record<string, string> = {}
  out['sagaforge/project.json'] = json({ ...m.project, format: PLAN_FORMAT })
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
  return out
}

/** Plan files Saga Forge manages (others under sagaforge/, like backups and releases, are left alone). */
const MANAGED = /^sagaforge\/(project\.json|people\.json|items\.json|phrases\.json|test-profiles\.json|factions\.json|descriptions\.json|quests\/.+\.quest\.json|locations\/.+\.system\.json|encounters\/.+\.encounter\.json)$/

/** Text of a faction file for this edit, keeping the existing file's formatting where there is one. */
export function factionText(f: FactionEdit, oldText: string | undefined, sourceName = 'another mod'): string {
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
    ? `# Saga Forge override of ${f.id} (${sourceName}): only this mod's changes. The game merges this file\n# into the original: objects key by key, lists appended. Edit it in Saga Forge to keep it a patch.\n`
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
    const text = factionText(f, old, src(f.id)?.kind === 'override' ? 'vanilla or another mod' : undefined)
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
