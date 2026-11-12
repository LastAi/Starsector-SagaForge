/**
 * ModProject: reads the active mod (plan files in sagaforge/, its .faction files and the shared
 * files Saga Forge may write) and writes files into it through the write guard.
 * No Electron imports, so it can be tested with plain Node.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseLooseObject } from '../shared/loosejson'
import { parseCsv, csvObjects } from '../shared/csv'
import { newProjectFile, PLAN_FORMAT } from '../shared/model'
import type { FactionFile, ProjectFile, QuestPlan, StarSystemDef, EncounterDef, ReleaseSnapshot } from '../shared/model'
import type { ModInfo, ModText, PlanError, ProjectState, WriteRequest, WriteResult } from '../shared/project'
import { errText, hashText, isDir, isFile, versionString, walk } from './install'
import { checkWritable, isInside, realpathLoose, writeNewBytes, writeText, type WriteRules } from './workspace'
import type { IndexCache } from './gameindex'
import type { SourceInfo } from '../shared/api'

const slash = (p: string) => p.replace(/\\/g, '/')

/** Shared files the exporter may change (owned blocks / merged keys), read so the UI can plan writes. */
export const SHARED_FILES = [
  'mod_info.json',
  'data/campaign/rules.csv',
  'data/campaign/person_missions.csv',
  'data/campaign/bar_events.csv',
  'data/campaign/commodities.csv',
  'data/campaign/special_items.csv',
  'data/strings/descriptions.csv',
  'data/config/settings.json',
  'data/config/sagaforge/content.csv',
  'data/world/factions/factions.csv'
]

const readIf = async (f: string): Promise<string | null> => (isFile(f) ? fsp.readFile(f, 'utf8') : null)

export async function loadProject(cache: IndexCache, src: SourceInfo): Promise<ProjectState> {
  const dir = src.dir
  const files: Record<string, ModText> = {}
  const errors: PlanError[] = []
  const remember = (rel: string, text: string) => { files[rel] = { text, hash: hashText(text) } }

  const readJson = async <T>(rel: string): Promise<T | null> => {
    const text = await readIf(path.join(dir, rel))
    if (text == null) return null
    remember(rel, text)
    try { return parseLooseObject(text).value as T } catch (e) {
      errors.push({ file: rel, message: errText(e) })
      return null
    }
  }
  const readDirJson = async <T>(sub: string, suffix: string): Promise<T[]> => {
    const out: T[] = []
    for (const f of await walk(path.join(dir, sub), ['.json'])) {
      if (!f.endsWith(suffix)) continue
      const v = await readJson<T>(slash(path.relative(dir, f)))
      if (v) out.push(v)
    }
    return out
  }

  // mod_info.json
  const infoText = (await readIf(path.join(dir, 'mod_info.json'))) ?? '{}'
  remember('mod_info.json', infoText)
  let info: Record<string, unknown> = {}
  try { info = parseLooseObject(infoText).value } catch (e) { errors.push({ file: 'mod_info.json', message: errText(e) }) }
  const modInfo: ModInfo = {
    id: String(info.id ?? src.id), name: String(info.name ?? src.name), version: versionString(info.version),
    gameVersion: String(info.gameVersion ?? ''),
    dependencies: (Array.isArray(info.dependencies) ? info.dependencies : []).map((d) => {
      const o = d as Record<string, unknown>
      return { id: String(o?.id ?? ''), name: o?.name == null ? undefined : String(o.name) }
    }).filter((d) => d.id)
  }

  const projectRaw = await readJson<ProjectFile>('sagaforge/project.json')
  const project: ProjectFile = { ...newProjectFile(''), ...(projectRaw ?? {}) }
  project.saga = { ...(project.saga ?? {}), positions: project.saga?.positions ?? {} }
  const listOf = async <T>(rel: string, key: string): Promise<T[]> => {
    const v = await readJson<Record<string, unknown>>(rel)
    return (v && Array.isArray(v[key]) ? v[key] : []) as T[]
  }

  const quests = await readDirJson<QuestPlan>('sagaforge/quests', '.quest.json')
  const systems = await readDirJson<StarSystemDef>('sagaforge/locations', '.system.json')
  const encounters = await readDirJson<EncounterDef>('sagaforge/encounters', '.encounter.json')
  const releases = (await readDirJson<ReleaseSnapshot>('sagaforge/releases', '.json')).sort((a, b) => cmpVersion(a.version, b.version))
  const factionsRuntimeRaw = await readJson<Record<string, unknown>>('sagaforge/factions.json')
  const descriptionsRaw = await readJson<Record<string, unknown>>('sagaforge/descriptions.json')

  // The mod's own faction files: a path that an earlier source defines is an override.
  const factions: FactionFile[] = []
  const listed = new Set<string>()
  const csvText = await readIf(path.join(dir, 'data/world/factions/factions.csv'))
  if (csvText != null) for (const r of csvObjects(parseCsv(csvText))) listed.add(slash((r.faction ?? '').trim()).toLowerCase())
  for (const f of await walk(path.join(dir, 'data', 'world', 'factions'), ['.faction'])) {
    const rel = slash(path.relative(dir, f))
    const text = await fsp.readFile(f, 'utf8')
    remember(rel, text)
    let raw: Record<string, unknown> = {}
    try { raw = parseLooseObject(text).value } catch (e) { errors.push({ file: rel, message: errText(e) }) }
    const layers = cache.factionLayers.get(rel.toLowerCase()) ?? []
    const first = layers[0]
    const isOverride = !!first && first.sourceId !== src.id
    const baseId = isOverride ? String(layers.reduce((id, l) => (l.raw.id ? String(l.raw.id) : id), '') || path.basename(rel, '.faction')) : ''
    factions.push({
      kind: isOverride ? 'override' : 'addition',
      id: isOverride ? baseId : String(raw.id ?? path.basename(rel, '.faction')),
      file: rel, text, hash: hashText(text), raw, listed: listed.has(rel.toLowerCase())
    })
  }

  for (const rel of SHARED_FILES) {
    if (files[rel]) continue
    const t = await readIf(path.join(dir, rel))
    if (t != null) remember(rel, t)
  }
  for (const f of await walk(path.join(dir, 'data', 'sagaforge'), ['.json', '.csv'])) {
    const rel = slash(path.relative(dir, f))
    remember(rel, await fsp.readFile(f, 'utf8'))
  }

  const fr = factionsRuntimeRaw ?? {}
  return {
    sourceId: src.id, modDir: dir, modInfo, isNew: !projectRaw, project,
    quests: quests.sort((a, b) => a.title.localeCompare(b.title)),
    people: await listOf('sagaforge/people.json', 'people'),
    items: await listOf('sagaforge/items.json', 'items'),
    systems, encounters,
    phrases: await listOf('sagaforge/phrases.json', 'phrases'),
    testProfiles: await listOf('sagaforge/test-profiles.json', 'profiles'),
    factionsRuntime: { relations: (fr.relations ?? {}) as never, scripted: (fr.scripted ?? {}) as never },
    descriptions: ((descriptionsRaw?.descriptions ?? {}) as never),
    factions, releases, files, errors
  }
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? ''
    const nx = Number(x), ny = Number(y)
    const c = Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '' ? nx - ny : x.localeCompare(y)
    if (c) return c
  }
  return 0
}

const KEEP_BACKUPS = 10

/** Resolve a mod-relative path, refusing anything that leaves the mod folder. */
export function modPath(modDir: string, rel: string): string {
  const clean = slash(rel).replace(/^\/+/, '')
  if (!clean || clean.split('/').some((p) => p === '..' || p === '')) throw new Error(`Bad path in mod: ${rel}`)
  const abs = path.resolve(modDir, clean)
  if (!isInside(abs, path.resolve(modDir))) throw new Error(`Refusing to write outside the mod: ${rel}`)
  return abs
}

/**
 * Write files into the active mod. All-or-nothing for the changed-on-disk check: if any file
 * changed since it was read, nothing is written and the conflicts are returned.
 */
export async function writeFiles(modDir: string, req: WriteRequest, rules: WriteRules, now = new Date()): Promise<WriteResult> {
  const conflicts: string[] = []
  const plan: { abs: string; w: WriteRequest['writes'][number]; old: string | null }[] = []
  for (const w of req.writes) {
    const abs = modPath(modDir, w.path)
    checkWritable(abs, rules)
    if (w.remove && !slash(w.path).startsWith('sagaforge/') && !/^data\/world\/factions\/[^/]+\.faction$/.test(slash(w.path))) throw new Error(`Only plan files and the mod's own faction files can be removed: ${w.path}`)
    const old = isFile(abs) ? await fsp.readFile(abs, 'utf8') : null
    if (w.expectedHash !== undefined) {
      const cur = old == null ? null : hashText(old)
      if (cur !== w.expectedHash) conflicts.push(w.path)
    }
    plan.push({ abs, w, old })
  }
  if (conflicts.length) return { written: [], hashes: {}, conflicts }

  let backupDir: string | undefined
  const changed = plan.filter((p) => p.old != null && (p.w.remove || p.old !== p.w.text))
  if (req.backup && changed.length) {
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    backupDir = path.join(modDir, 'sagaforge', 'backups', stamp)
    for (const p of changed) {
      const rel = slash(path.relative(modDir, p.abs))
      if (rel.startsWith('sagaforge/backups/')) continue
      writeText(path.join(backupDir, ...rel.split('/')), p.old!, rules)
    }
    pruneBackups(path.join(modDir, 'sagaforge', 'backups'), rules)
  }

  const written: string[] = []
  const hashes: Record<string, string> = {}
  for (const p of plan) {
    if (p.w.remove) {
      if (p.old != null) { checkWritable(p.abs, rules); fs.rmSync(p.abs); written.push(p.w.path) }
      continue
    }
    if (p.old === p.w.text) { hashes[p.w.path] = hashText(p.w.text); continue }
    writeText(p.abs, p.w.text, rules)
    written.push(p.w.path)
    hashes[p.w.path] = hashText(p.w.text)
  }
  for (const c of req.copies ?? []) {
    const abs = modPath(modDir, c.to)
    if (isFile(abs)) continue
    writeNewBytes(abs, await fsp.readFile(c.from), rules)
    written.push(c.to)
  }
  return { written, hashes, conflicts: [], backupDir }
}

function pruneBackups(root: string, rules: WriteRules): void {
  if (!isDir(root)) return
  const dirs = fs.readdirSync(root).filter((d) => isDir(path.join(root, d))).sort()
  for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP_BACKUPS))) {
    const abs = path.join(root, d)
    // only ever delete inside <mod>/sagaforge/backups, checked through the write guard rules
    if (!isInside(realpathLoose(abs), realpathLoose(root))) continue
    checkWritable(path.join(abs, 'x.json'), rules)
    fs.rmSync(abs, { recursive: true, force: true })
  }
}

export { PLAN_FORMAT }
