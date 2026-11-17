/**
 * Release zips (R32, Phase 8b): Mark as released packs the active mod into
 * "<releases folder>/[0.98a] Mod Name 1.1.0.zip" (one folder named after the mod, without the
 * editor's plans and dev files) and writes the forum post draft next to it. The releases folder is
 * Saga Forge's own (data/releases) or one chosen in Settings; never inside a mod or a game folder.
 * No Electron imports, so this can be tested with plain Node.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { isInside, realpathLoose, type WriteRules } from './workspace'
import { makeZip, type ZipEntry } from './zipwrite'
import { leftOutOfRelease, releaseFolder, releaseName, releaseText } from '../shared/releasepack'
import { parseLooseObject } from '../shared/loosejson'
import { versionString } from './install'
import type { PackResult } from '../shared/api'

/** Why a folder can't hold release zips, or null if it can. */
export function releaseDirProblem(dir: string, rules: WriteRules): string | null {
  const real = realpathLoose(dir)
  for (const g of [rules.gameRoot, ...(rules.otherGameRoots ?? [])]) {
    if (g && (isInside(real, realpathLoose(g)) || isInside(realpathLoose(g), real))) return 'The releases folder can\'t be inside a Starsector folder (the game would see the zips as clutter in its folders).'
  }
  if (rules.modsRoot) {
    const root = realpathLoose(rules.modsRoot)
    const rel = path.relative(root, real)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return 'The releases folder can\'t be inside a mod: the next release would pack the older zips.'
    if (isInside(root, real)) return 'The releases folder can\'t contain your mods folder.'
  }
  return null
}

async function walkFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = []
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue // a link inside a mod isn't part of it
    if (e.isDirectory()) out.push(...(await walkFiles(abs, base)))
    else if (e.isFile()) out.push(path.relative(base, abs).replace(/\\/g, '/'))
  }
  return out
}

const TEXT = /\.(csv|json|faction|version|txt|md|ini)$/i

export interface PackRequest { modDir: string; releasesDir: string; version: string; forumPost: string; overwrite: boolean; rules: WriteRules }

export async function packRelease(req: PackRequest): Promise<PackResult> {
  const problem = releaseDirProblem(req.releasesDir, req.rules)
  if (problem) throw new Error(problem)
  const infoText = await fsp.readFile(path.join(req.modDir, 'mod_info.json'), 'utf8')
  const v = parseLooseObject(infoText).value
  const info = { id: String(v.id ?? ''), name: String(v.name ?? v.id ?? ''), gameVersion: String(v.gameVersion ?? '') }
  const modVersion = versionString(v.version)
  if (modVersion !== req.version) throw new Error(`mod_info.json says version ${modVersion || '(none)'}, not ${req.version}. Export with version ${req.version} first, so the zip holds what you release.`)
  const name = releaseName(info, req.version)
  const zip = path.join(req.releasesDir, `${name}.zip`)
  const post = path.join(req.releasesDir, `${name} - forum post.txt`)
  if (!req.overwrite && fs.existsSync(zip)) return { exists: zip }
  const folder = releaseFolder(info)
  const entries: ZipEntry[] = []
  const leftOut: { path: string; why: string }[] = []
  for (const rel of (await walkFiles(req.modDir)).sort()) {
    const why = leftOutOfRelease(rel)
    if (why) { leftOut.push({ path: rel, why }); continue }
    let data = await fsp.readFile(path.join(req.modDir, rel))
    if (TEXT.test(rel)) data = Buffer.from(releaseText(rel, data.toString('utf8')), 'utf8')
    entries.push({ name: `${folder}/${rel}`, data })
  }
  await fsp.mkdir(req.releasesDir, { recursive: true })
  const tmp = `${zip}.tmp`
  await fsp.writeFile(tmp, makeZip(entries))
  await fsp.rename(tmp, zip)
  // the forum post draft is switched off until post templates exist (user, 2026-11-17); written only when given
  if (req.forumPost.trim()) await fsp.writeFile(post, req.forumPost.replace(/\r?\n/g, '\r\n'), 'utf8')
  return { zip, post: req.forumPost.trim() ? post : '', folder, files: entries.length, leftOut }
}
