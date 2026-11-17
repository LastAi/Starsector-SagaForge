/**
 * Which Starsector version is installed (docs/FORMATS.md, "Game version"). The game jar is the
 * source: starfarer_obf.jar holds com/fs/starfarer/Version.class, whose constants are
 * "0.98.5a-RC5" (versionOnly) and "Starsector 0.98.5a-RC5" (versionString). starsector.log is
 * only a fallback: a fresh install has none until the game has run once. Reading only; no
 * Electron imports.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const JAR = 'starfarer_obf.jar'
const VERSION_CLASS = 'com/fs/starfarer/Version.class'
/** A Starsector version string: 0.98a-RC8, 0.98.5a-RC5, 0.97a, 0.95.1a-RC6 ... */
const VERSION_RE = /^\d+\.\d+(?:\.\d+)*[a-z]?(?:-RC\d+)?$/i

const isFile = (p: string): boolean => { try { return fs.statSync(p).isFile() } catch { return false } }

/**
 * One entry of a zip/jar file, or null if it isn't there or can't be read. Minimal reader: central
 * directory lookup, stored or deflated entries, no zip64 (the game's jars are a few MB).
 */
export function readZipEntry(file: string, name: string): Buffer | null {
  let fd: number
  try { fd = fs.openSync(file, 'r') } catch { return null }
  try {
    const size = fs.fstatSync(fd).size
    const read = (pos: number, len: number) => {
      const b = Buffer.alloc(len)
      const n = fs.readSync(fd, b, 0, len, pos)
      return n === len ? b : b.subarray(0, n)
    }
    // end of central directory: last 22 bytes + up to 64 KB of comment
    const tailLen = Math.min(size, 22 + 0xffff)
    const tail = read(size - tailLen, tailLen)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    if (eocd < 0) return null
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (cdOffset + cdSize > size) return null
    const cd = read(cdOffset, cdSize)
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
      const method = cd.readUInt16LE(p + 10)
      const compSize = cd.readUInt32LE(p + 20)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const entryName = cd.toString('utf8', p + 46, p + 46 + nameLen)
      p += 46 + nameLen + extraLen + commentLen
      if (entryName !== name) continue
      const local = read(localOffset, 30)
      if (local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) return null
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      const data = read(dataStart, compSize)
      if (method === 0) return data
      if (method === 8) return zlib.inflateRawSync(data)
      return null
    }
    return null
  } catch {
    return null
  } finally {
    fs.closeSync(fd)
  }
}

/** The UTF-8 strings of a Java class file's constant pool (ASCII-safe; enough for version strings). */
export function classStrings(buf: Buffer): string[] {
  if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) return []
  const out: string[] = []
  const count = buf.readUInt16BE(8)
  let p = 10
  for (let i = 1; i < count; i++) {
    if (p >= buf.length) break
    const tag = buf[p]
    switch (tag) {
      case 1: { const len = buf.readUInt16BE(p + 1); out.push(buf.toString('utf8', p + 3, p + 3 + len)); p += 3 + len; break }
      case 3: case 4: p += 5; break
      case 5: case 6: p += 9; i++; break // longs and doubles take two slots
      case 7: case 8: case 16: case 19: case 20: p += 3; break
      case 9: case 10: case 11: case 12: case 17: case 18: p += 5; break
      case 15: p += 4; break
      default: return out // unknown tag: stop rather than misread
    }
  }
  return out
}

/** The game version held in Version.class ("Starsector 0.98.5a-RC5" → "0.98.5a-RC5"). */
export function versionFromClass(buf: Buffer): string | null {
  const strings = classStrings(buf)
  for (const s of strings) {
    const m = /^Starsector (\S+)$/.exec(s)
    if (m && VERSION_RE.test(m[1])) return m[1]
  }
  return strings.find((s) => VERSION_RE.test(s)) ?? null
}

/** The game writes "Starting Starsector 0.98a-RC8 launcher" at every start; the last run counts. */
export function versionFromLog(text: string): string | null {
  const all = [...text.matchAll(/Starting Starsector (\S+)/g)]
  return all.length ? all[all.length - 1][1] : null
}

/** The installed version: from starfarer_obf.jar, else from starsector.log, else null. */
export function readGameVersion(dirs: string[]): string | null {
  for (const d of dirs) {
    const jar = path.join(d, JAR)
    if (!isFile(jar)) continue
    const cls = readZipEntry(jar, VERSION_CLASS)
    const v = cls && versionFromClass(cls)
    if (v) return v
  }
  for (const d of dirs) {
    const f = path.join(d, 'starsector.log')
    if (!isFile(f)) continue
    try {
      if (fs.statSync(f).size > 64 * 1024 * 1024) continue
      const v = versionFromLog(fs.readFileSync(f, 'latin1'))
      if (v) return v
    } catch { /* ignore */ }
  }
  return null
}
