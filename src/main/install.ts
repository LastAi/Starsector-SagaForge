/**
 * Finding the game and its mods. Adapted from Ship Editor's src/main/gamedata.ts (detectInstall,
 * scanSources, walk); may drift, see docs/PLAN.md §2. Reading only. No Electron imports, so this
 * can be tested with plain Node.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseLooseObject, LooseJsonError } from '../shared/loosejson'
import { isInside, realpathLoose, workspaceProblem } from './workspace'
import type { InstallInfo, ValidInstall, SourceInfo, Problem, ModsMode } from '../shared/api'

export const isFile = (p: string): boolean => { try { return fs.statSync(p).isFile() } catch { return false } }
export const isDir = (p: string): boolean => { try { return fs.statSync(p).isDirectory() } catch { return false } }
export const hashText = (t: string) => crypto.createHash('sha1').update(t).digest('hex')

/**
 * Accepts the install folder (the one with starsector.exe / starsector.sh), or the
 * starsector-core folder inside it. Windows keeps game data in <root>/starsector-core,
 * Linux keeps it directly in <root>, macOS in Starsector.app/Contents/Resources/Java.
 */
export function detectInstall(input: string): InstallInfo {
  const given = path.resolve(input.trim())
  if (!isDir(given)) return { ok: false, root: given, error: 'That folder does not exist.' }
  let root = given
  if (path.basename(root).toLowerCase() === 'starsector-core') root = path.dirname(root)
  for (const sub of ['starsector-core', '.', path.join('Contents', 'Resources', 'Java')]) {
    const coreDir = path.resolve(root, sub)
    if (isFile(path.join(coreDir, 'data', 'campaign', 'rules.csv'))) {
      const modsDir = path.join(root, 'mods')
      return { ok: true, root, coreDir, modsDir: isDir(modsDir) ? modsDir : null, gameVersion: readGameVersion([coreDir, root]) }
    }
  }
  return {
    ok: false,
    root: given,
    error: 'No Starsector game data found here. Choose the folder that contains starsector.exe (Windows) or starsector.sh (Linux).'
  }
}

/** The game writes "Starting Starsector 0.98a-RC8 launcher" at the top of its log. */
function readGameVersion(dirs: string[]): string | null {
  for (const d of dirs) {
    const f = path.join(d, 'starsector.log')
    if (!isFile(f)) continue
    try {
      // the line is written at every start; the log may hold several runs, so take the last one
      const size = fs.statSync(f).size
      if (size > 64 * 1024 * 1024) continue
      const text = fs.readFileSync(f, 'latin1')
      const all = [...text.matchAll(/Starting Starsector (\S+)/g)]
      if (all.length) return all[all.length - 1][1]
    } catch { /* ignore */ }
  }
  return null
}

export function versionString(v: unknown): string {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return [o.major, o.minor, o.patch].filter((x) => x != null && x !== '').join('.')
  }
  return v == null ? '' : String(v)
}

export async function readLoose(file: string) {
  return parseLooseObject(await fsp.readFile(file, 'utf8'))
}

export function errText(e: unknown): string {
  return e instanceof LooseJsonError ? e.message : e instanceof Error ? e.message : String(e)
}

type ModBase = Omit<SourceInfo, 'enabled' | 'writable' | 'writeDir' | 'inGameMods'>

async function readMod(dir: string, folder: string, problems: Problem[]): Promise<ModBase | null> {
  const infoFile = path.join(dir, 'mod_info.json')
  if (!isFile(infoFile)) return null
  try {
    const { value } = await readLoose(infoFile)
    const id = String(value.id ?? folder)
    const deps = Array.isArray(value.dependencies)
      ? value.dependencies.map((d) => String((d as Record<string, unknown>)?.id ?? '')).filter(Boolean)
      : []
    return {
      id, name: String(value.name ?? id), version: versionString(value.version), folder, dir,
      realDir: realpathLoose(dir), isCore: false, isLink: fs.lstatSync(dir).isSymbolicLink(),
      dependencies: deps, gameVersion: String(value.gameVersion ?? ''), utility: value.utility === true,
      sortString: value.sortString == null ? '' : String(value.sortString)
    }
  } catch (e) {
    problems.push({ level: 'error', area: 'index', sourceId: folder, file: 'mod_info.json', message: errText(e) })
    return null
  }
}

export interface ModsOptions {
  /** 'workspace' = the user's mods are in workspaceDir; 'game' = in <Starsector>/mods. */
  mode: ModsMode
  workspaceDir: string | null
}

/** The folder holding the user's mods for these options, or null if not usable. */
export function modsRootFor(install: ValidInstall, opts: ModsOptions): string | null {
  if (opts.mode === 'game') return install.modsDir
  return opts.workspaceDir && !workspaceProblem(opts.workspaceDir, install.root) ? path.resolve(opts.workspaceDir) : null
}

/**
 * The game's mod order (docs/FORMATS.md, "Load order"): mods sorted by mod_info "sortString", else
 * by "name", with Java's case-sensitive String.compareTo; dependencies don't change it. Index 0 has
 * the highest priority: for merged CSVs (rules, commodities, ...) its row wins; merged JSON files are
 * applied in this order, so for a single value the LAST mod wins.
 */
export function sortLikeGame<T extends { name: string; sortString?: string }>(mods: T[]): T[] {
  const key = (m: T) => m.sortString || m.name
  return [...mods].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

export async function scanSources(install: ValidInstall, opts: ModsOptions, problems: Problem[]): Promise<SourceInfo[]> {
  const gameReal = realpathLoose(install.root)
  const coreReal = realpathLoose(install.coreDir)
  const modsRoot = modsRootFor(install, opts)
  const wsReal = opts.mode === 'workspace' && modsRoot ? realpathLoose(modsRoot) : null

  /** Where the editor would write for a mod folder, or '' if it isn't one of the user's mods. */
  const writeDirFor = (dir: string, real: string): string => {
    if (!modsRoot) return ''
    if (opts.mode === 'game') {
      const inMods = path.relative(path.resolve(modsRoot), path.resolve(dir)).split(/[\\/]+/).length === 1 && isInside(dir, modsRoot)
      const realOk = !isInside(real, coreReal) && (!isInside(real, gameReal) || isInside(real, realpathLoose(modsRoot)))
      return inMods && realOk ? path.resolve(dir) : ''
    }
    const rel = path.relative(wsReal!, real)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.split(/[\\/]+/).length !== 1) return ''
    if (isInside(real, gameReal)) return ''
    return path.join(modsRoot, rel)
  }

  const sources: SourceInfo[] = [{
    id: 'starsector-core', name: 'Starsector (base game)', version: install.gameVersion ?? '', folder: '', dir: install.coreDir,
    realDir: coreReal, isCore: true, enabled: true, isLink: false, writable: false, writeDir: '', inGameMods: true,
    dependencies: [], gameVersion: install.gameVersion ?? '', utility: false, sortString: ''
  }]

  let enabled = new Set<string>()
  if (install.modsDir) {
    const enabledFile = path.join(install.modsDir, 'enabled_mods.json')
    if (isFile(enabledFile)) {
      try {
        const { value } = await readLoose(enabledFile)
        enabled = new Set((Array.isArray(value.enabledMods) ? value.enabledMods : []).map(String))
      } catch (e) {
        problems.push({ level: 'warning', area: 'index', sourceId: 'mods', file: 'enabled_mods.json', message: errText(e) })
      }
    }
  }

  const listMods = async (root: string, inGameMods: boolean): Promise<SourceInfo[]> => {
    const out: SourceInfo[] = []
    for (const ent of await fsp.readdir(root, { withFileTypes: true })) {
      const dir = path.join(root, ent.name)
      if (!isDir(dir)) continue // follows junctions/symlinks
      const m = await readMod(dir, ent.name, problems)
      if (m) {
        const writeDir = writeDirFor(dir, m.realDir)
        out.push({ ...m, enabled: inGameMods && enabled.has(m.id), writable: !!writeDir, writeDir, inGameMods })
      }
    }
    return sortLikeGame(out)
  }

  if (install.modsDir) {
    const mods = await listMods(install.modsDir, true)
    // enabled mods first (the game loads only those), then the rest, marked "not enabled"
    sources.push(...mods.filter((m) => m.enabled), ...mods.filter((m) => !m.enabled))
  }
  if (wsReal && modsRoot) {
    const seen = (real: string) => sources.some((s) => path.relative(s.realDir, real) === '')
    sources.push(...(await listMods(modsRoot, false)).filter((m) => !seen(m.realDir)))
  }

  const used = new Set<string>()
  for (const s of sources) {
    if (used.has(s.id)) s.id = `${s.id}@${s.folder}`
    used.add(s.id)
  }
  return sources
}

export async function walk(dir: string, exts: string[], out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 12) return out
  let ents: fs.Dirent[]
  try { ents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() || (e.isSymbolicLink() && isDir(p))) await walk(p, exts, out, depth + 1)
    else if (exts.includes(path.extname(e.name).toLowerCase())) out.push(p)
  }
  return out
}
