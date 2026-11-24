/**
 * Reading game images and fonts for the UI (portraits, illustrations, icons, logos, BMFonts).
 * Read-only: files are looked up in the sources in reverse load order (the last source that has
 * a file wins, as in the game) and sent as bytes. Nothing is copied.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { isFile } from './install'
import type { IndexCache } from './gameindex'
import type { FontData, ImageData } from '../shared/api'

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** Game paths use forward slashes and are relative to a source folder. */
function safeRel(p: string): string | null {
  const rel = p.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel.split('/').some((s) => s === '..')) return null
  return rel
}

export async function readImageFile(abs: string, sourceId: string, gamePath = abs): Promise<ImageData | null> {
  const mime = MIME[path.extname(abs).toLowerCase()]
  if (!mime || !isFile(abs)) return null
  const bytes = await fsp.readFile(abs)
  if (bytes.length > 32 * 1024 * 1024) return null
  return { path: gamePath, bytes: new Uint8Array(bytes), sourceId, mime }
}

/**
 * #67 U33: sources in the order a file is looked for: the ones that count for the active mod (vanilla,
 * it, its listed mods; last-loaded first), then the others (so a file only an unlisted mod has still shows).
 */
const lookupOrder = <T extends { id: string }>(sources: T[], visible?: Set<string>): T[] => {
  const rev = [...sources].reverse()
  return visible ? [...rev.filter((s) => visible.has(s.id)), ...rev.filter((s) => !visible.has(s.id))] : rev
}

/** Find a game path in the sources (a preferred source first, then the visible ones last-loaded first, then the rest). */
export async function findImage(cache: IndexCache, gamePath: string, preferSource?: string, visible?: Set<string>): Promise<ImageData | null> {
  const rel = safeRel(gamePath)
  if (!rel) return null
  const order = lookupOrder(cache.sources, visible)
  if (preferSource) order.sort((a, b) => (a.id === preferSource ? -1 : b.id === preferSource ? 1 : 0))
  for (const s of order) {
    const abs = path.join(s.dir, ...rel.split('/'))
    if (isFile(abs)) return readImageFile(abs, s.id, rel)
  }
  return null
}

/** Image files in a folder of a directory, recursively (paths relative to `root`, forward slashes). */
async function walkImages(root: string, folder: string, out: string[], limit: number): Promise<void> {
  const start = path.join(root, ...folder.split('/'))
  const stack = [start]
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!
    let entries: import('node:fs').Dirent[]
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(abs)
      else if (MIME[path.extname(e.name).toLowerCase()]) out.push(path.relative(root, abs).replace(/\\/g, '/'))
    }
  }
}

/**
 * Every image under a game folder (e.g. "graphics/portraits"), in the game and every source,
 * the last-loaded source winning for a path, as in the game (the Images page and its pickers).
 */
export async function listImages(cache: IndexCache, folder: string, visible?: Set<string>): Promise<{ path: string; sourceId: string }[]> {
  const rel = safeRel(folder)
  if (!rel) return []
  const byPath = new Map<string, string>()
  for (const s of cache.sources) {
    const found: string[] = []
    await walkImages(s.dir, rel, found, 5000)
    // #67 U33: a path belongs to the last source that counts for the active mod (an unlisted mod replacing a vanilla image doesn't hide it)
    for (const p of found) { const cur = byPath.get(p); if (!visible || !cur || visible.has(s.id) || !visible.has(cur)) byPath.set(p, s.id) }
  }
  return [...byPath].map(([p, sourceId]) => ({ path: p, sourceId })).sort((a, b) => a.path.localeCompare(b.path))
}

/** Image files directly in a folder chosen by the user (for importing a whole folder). */
export async function imagesInFolder(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return [] }
  return entries.filter((e) => e.isFile() && MIME[path.extname(e.name).toLowerCase()]).map((e) => path.join(dir, e.name)).sort()
}

/** A BMFont by settings.json key ("defaultFont") or by path. Reads the .fnt text and its page images. */
export async function findFont(cache: IndexCache, keyOrPath: string, visible?: Set<string>): Promise<FontData | null> {
  // #67 U33: the key as the visible sources' settings.json set it
  const layers = cache.index.ui.layers?.filter((l) => !visible || visible.has(l.sourceId))
  const fromSettings = layers?.length ? [...layers].reverse().find((l) => l.fonts[keyOrPath])?.fonts[keyOrPath] ?? cache.index.ui.fonts[keyOrPath] : cache.index.ui.fonts[keyOrPath]
  const rel = safeRel(fromSettings ?? keyOrPath)
  if (!rel || !/\.fnt$/i.test(rel)) return null
  for (const s of lookupOrder(cache.sources, visible)) {
    const abs = path.join(s.dir, ...rel.split('/'))
    if (!isFile(abs)) continue
    const fnt = await fsp.readFile(abs, 'utf8')
    const pages: FontData['pages'] = []
    for (const m of fnt.matchAll(/^page\s+id=(\d+)\s+file="([^"]+)"/gm)) {
      const file = m[2]
      const pabs = path.join(path.dirname(abs), ...file.split('/'))
      if (isFile(pabs)) pages[Number(m[1])] = { file, bytes: new Uint8Array(await fsp.readFile(pabs)) }
    }
    return { key: keyOrPath, path: rel, fnt, pages, sourceId: s.id }
  }
  return null
}
