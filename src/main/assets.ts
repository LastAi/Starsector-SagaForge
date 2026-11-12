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

/** Find a game path in the sources (a preferred source first, then last-loaded first). */
export async function findImage(cache: IndexCache, gamePath: string, preferSource?: string): Promise<ImageData | null> {
  const rel = safeRel(gamePath)
  if (!rel) return null
  const order = [...cache.sources].reverse()
  if (preferSource) order.sort((a, b) => (a.id === preferSource ? -1 : b.id === preferSource ? 1 : 0))
  for (const s of order) {
    const abs = path.join(s.dir, ...rel.split('/'))
    if (isFile(abs)) return readImageFile(abs, s.id, rel)
  }
  return null
}

/** A BMFont by settings.json key ("defaultFont") or by path. Reads the .fnt text and its page images. */
export async function findFont(cache: IndexCache, keyOrPath: string): Promise<FontData | null> {
  const fromSettings = cache.index.ui.fonts[keyOrPath]
  const rel = safeRel(fromSettings ?? keyOrPath)
  if (!rel || !/\.fnt$/i.test(rel)) return null
  for (const s of [...cache.sources].reverse()) {
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
