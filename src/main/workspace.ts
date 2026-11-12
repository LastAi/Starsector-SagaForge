// Copied from Ship Editor (src/main/workspace.ts); may drift, see docs/PLAN.md §2.
/**
 * Everything that WRITES files lives here, behind one guard.
 *
 * The user's mods live in a "mods root": either a separate workspace folder or, if the user
 * chose to work directly in the game's mods folder, <Starsector>/mods. Rules:
 *  - the target must be inside a mod folder directly under the mods root (never a file in the
 *    mods root itself, such as enabled_mods.json)
 *  - after resolving junctions/symlinks it must still be inside that mod's real folder
 *  - it must not be inside the Starsector folder, except inside the game's mods folder when the
 *    user chose to work there; starsector-core is never writable
 *  - only known data-file types are written
 * Callers additionally restrict saves to the ACTIVE mod (see gamedata.saveEdits).
 * No Electron imports, so this can be tested with plain Node.
 */
import fs from 'node:fs'
import path from 'node:path'

export type ModsMode = 'workspace' | 'game'

export interface WriteRules {
  /** Folder holding the user's mods: the workspace, or the game's mods folder. */
  modsRoot: string | null
  /** The Starsector folder. */
  gameRoot: string | null
  /** True when modsRoot is the game's own mods folder (the user chose to work there). */
  gameMods: boolean
}

// Saga Forge writes faction files, CSV/JSON data and copied images; never code or game executables.
const WRITABLE_EXTS = new Set(['.faction', '.csv', '.json', '.png', '.jpg', '.jpeg', '.ogg'])

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export const samePath = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === ''

/** Real path of `p`, resolving links in the part of the path that exists. */
export function realpathLoose(p: string): string {
  const abs = path.resolve(p)
  let cur = abs
  const rest: string[] = []
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest.reverse())
    } catch {
      const parent = path.dirname(cur)
      if (parent === cur) return abs
      rest.push(path.basename(cur))
      cur = parent
    }
  }
}

/** Why a folder can't be used as the separate workspace, or null if it can. */
export function workspaceProblem(dir: string, starsectorRoot: string | null): string | null {
  let st: fs.Stats
  try { st = fs.statSync(dir) } catch { return 'That folder does not exist.' }
  if (!st.isDirectory()) return 'That is not a folder.'
  if (starsectorRoot) {
    const real = realpathLoose(dir)
    const ss = realpathLoose(starsectorRoot)
    if (isInside(real, ss)) return 'The workspace can\'t be inside the Starsector folder. To work there, choose "Work directly in the game\'s mods folder" instead.'
    if (isInside(ss, real)) return 'The workspace can\'t contain the Starsector folder.'
  }
  return null
}

/** Throws unless `target` may be written. Returns the resolved real path. */
export function checkWritable(target: string, rules: WriteRules): string {
  if (!rules.modsRoot) throw new Error('No mods folder is set. Choose one in Settings.')
  const root = path.resolve(rules.modsRoot)
  const abs = path.resolve(target)
  const rel = path.relative(root, abs)
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || parts.length < 2) {
    throw new Error(`Refusing to write outside a mod folder in ${root}: ${abs}`)
  }
  const real = realpathLoose(abs)
  const modReal = realpathLoose(path.join(root, parts[0]))
  if (!isInside(real, modReal) || real === modReal) throw new Error(`Refusing to write outside its mod folder (through a link): ${real}`)
  if (rules.gameRoot) {
    const game = realpathLoose(rules.gameRoot)
    if (isInside(real, game) && !(rules.gameMods && isInside(real, realpathLoose(root)))) {
      throw new Error(`Refusing to write inside the Starsector folder: ${real}`)
    }
  }
  if (!WRITABLE_EXTS.has(path.extname(real).toLowerCase())) throw new Error(`Refusing to write this file type: ${real}`)
  return real
}

/** Write a text file atomically (temp file + rename) after checking the rules. */
export function writeText(target: string, text: string, rules: WriteRules): string {
  const real = checkWritable(target, rules)
  fs.mkdirSync(path.dirname(real), { recursive: true })
  const tmp = `${real}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, real)
  return real
}

/** Write a binary file (e.g. a sprite copied into the mod) atomically, after checking the rules. Never overwrites. */
export function writeNewBytes(target: string, bytes: Uint8Array, rules: WriteRules): string {
  const real = checkWritable(target, rules)
  if (fs.existsSync(real)) throw new Error(`${real} already exists.`)
  fs.mkdirSync(path.dirname(real), { recursive: true })
  const tmp = `${real}.${process.pid}.tmp`
  fs.writeFileSync(tmp, bytes)
  fs.renameSync(tmp, real)
  return real
}

export interface NewMod { id: string; name: string; author?: string; gameVersion: string }

export const MOD_ID_PATTERN = /^[A-Za-z0-9_.-]{2,64}$/

/** Create <mods root>/<id>/mod_info.json. Returns the mod folder. */
export function createMod(mod: NewMod, rules: WriteRules): string {
  if (!rules.modsRoot) throw new Error('No mods folder is set. Choose one in Settings.')
  if (!MOD_ID_PATTERN.test(mod.id)) throw new Error('Mod id: use 2–64 letters, digits, _ . or -')
  if (!mod.name.trim()) throw new Error('Mod name is empty.')
  const dir = path.join(path.resolve(rules.modsRoot), mod.id)
  if (fs.existsSync(dir)) throw new Error(`A folder named "${mod.id}" already exists in ${rules.modsRoot}.`)
  const info = {
    id: mod.id,
    name: mod.name.trim(),
    author: mod.author ?? '',
    version: '0.1.0',
    description: '',
    gameVersion: mod.gameVersion
  }
  const text = '{\n' + Object.entries(info).map(([k, v]) => `\t${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n'
  writeText(path.join(dir, 'mod_info.json'), text, rules)
  return dir
}
