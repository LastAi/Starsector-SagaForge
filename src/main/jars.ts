/**
 * #79: the classes in the jars a mod's mod_info.json lists under "jars", for the Plugin node's class
 * picker and Problems. Read from each jar's zip central directory and the class files' headers (no
 * Java needed): a class is a plugin when it implements lastai.sagalib.api.SagaPlugin, directly or
 * through a superclass or interface in the same jars. Reading only; no Electron imports.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { parseLooseObject } from '../shared/loosejson'
import type { JarInfo } from '../shared/project'

const SAGA_PLUGIN = 'lastai/sagalib/api/SagaPlugin'
const ACC_PUBLIC = 0x0001, ACC_INTERFACE = 0x0200, ACC_ABSTRACT = 0x0400

/** A class file's header: its name, superclass, interfaces and access flags (internal names, with /). */
export interface ClassHeader { name: string; super: string | null; interfaces: string[]; access: number }

/** Reads a class file's constant pool and header; null if it isn't one. */
export function classHeader(buf: Buffer): ClassHeader | null {
  try {
    if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) return null
    const count = buf.readUInt16BE(8)
    const utf: (string | undefined)[] = []
    const cls: (number | undefined)[] = []
    let p = 10
    for (let i = 1; i < count; i++) {
      const tag = buf[p]
      switch (tag) {
        case 1: { const len = buf.readUInt16BE(p + 1); utf[i] = buf.toString('utf8', p + 3, p + 3 + len); p += 3 + len; break }
        case 7: cls[i] = buf.readUInt16BE(p + 1); p += 3; break
        case 8: case 16: case 19: case 20: p += 3; break
        case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: p += 5; break
        case 5: case 6: p += 9; i++; break
        case 15: p += 4; break
        default: return null
      }
    }
    const name = (idx: number): string | null => { const u = cls[idx]; return u === undefined ? null : utf[u] ?? null }
    const access = buf.readUInt16BE(p)
    const thisName = name(buf.readUInt16BE(p + 2))
    const superIdx = buf.readUInt16BE(p + 4)
    const n = buf.readUInt16BE(p + 6)
    const interfaces: string[] = []
    for (let k = 0; k < n; k++) { const x = name(buf.readUInt16BE(p + 8 + 2 * k)); if (x) interfaces.push(x) }
    return thisName ? { name: thisName, super: superIdx ? name(superIdx) : null, interfaces, access } : null
  } catch {
    return null
  }
}

/** Every .class entry of a zip/jar (name → bytes); null if the file can't be read as a zip. No zip64. */
export function jarClassFiles(file: string): Map<string, Buffer> | null {
  let b: Buffer
  try { b = fs.readFileSync(file) } catch { return null }
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) return null
  const cdSize = b.readUInt32LE(eocd + 12), cdOffset = b.readUInt32LE(eocd + 16)
  if (cdOffset + cdSize > b.length) return null
  const out = new Map<string, Buffer>()
  for (let p = cdOffset; p + 46 <= cdOffset + cdSize && b.readUInt32LE(p) === 0x02014b50;) {
    const method = b.readUInt16LE(p + 10)
    const compSize = b.readUInt32LE(p + 20)
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const name = b.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (!name.endsWith('.class') || local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) continue
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const data = b.subarray(start, start + compSize)
    try {
      if (method === 0) out.set(name, data)
      else if (method === 8) out.set(name, zlib.inflateRawSync(data))
    } catch { /* a broken entry: skipped */ }
  }
  return out
}

/** The jars' classes, with which are plugins (the SagaPlugin interface through the jars' own superclasses and interfaces). */
export function jarsInfo(files: { path: string; abs: string }[]): JarInfo[] {
  const headers = new Map<string, ClassHeader>()
  const perJar: { path: string; found: boolean; names: string[]; error?: string }[] = []
  for (const f of files) {
    if (!fs.existsSync(f.abs)) { perJar.push({ path: f.path, found: false, names: [] }); continue }
    const entries = jarClassFiles(f.abs)
    if (!entries) { perJar.push({ path: f.path, found: false, names: [], error: "can't be read as a jar" }); continue }
    const names: string[] = []
    for (const buf of entries.values()) {
      const h = classHeader(buf)
      if (!h) continue
      headers.set(h.name, h)
      names.push(h.name)
    }
    perJar.push({ path: f.path, found: true, names })
  }
  const memo = new Map<string, boolean>()
  const isPlugin = (name: string, depth = 0): boolean => {
    if (name === SAGA_PLUGIN) return true
    if (memo.has(name)) return memo.get(name)!
    const h = headers.get(name)
    if (!h || depth > 30) return false
    memo.set(name, false)
    const r = h.interfaces.some((i) => isPlugin(i, depth + 1)) || (!!h.super && isPlugin(h.super, depth + 1))
    memo.set(name, r)
    return r
  }
  return perJar.map((j) => ({
    path: j.path, found: j.found, ...(j.error ? { error: j.error } : {}),
    classes: j.names
      // anonymous and local classes, module and package infos are never plugins
      .filter((n) => !/\$\d/.test(n) && !/(^|\/)(module|package)-info$/.test(n))
      .map((n) => {
        const h = headers.get(n)!
        const concrete = (h.access & ACC_PUBLIC) !== 0 && (h.access & (ACC_INTERFACE | ACC_ABSTRACT)) === 0
        return { name: n.replace(/\//g, '.'), plugin: concrete && isPlugin(n) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }))
}

/** The jars the mod's mod_info.json lists under "jars", read (paths relative to the mod folder). */
export function modJars(modDir: string, modInfoText?: string): JarInfo[] {
  let text = modInfoText
  if (text === undefined) { try { text = fs.readFileSync(path.join(modDir, 'mod_info.json'), 'utf8') } catch { return [] } }
  let list: unknown
  try { list = parseLooseObject(text).value.jars } catch { return [] }
  const rels = (Array.isArray(list) ? list : []).map((x) => String(x ?? '').trim()).filter(Boolean)
  const root = path.resolve(modDir)
  return jarsInfo(rels.map((rel) => {
    const abs = path.resolve(root, rel)
    // only jars inside the mod (a "jars" entry can't point anywhere else for the game either)
    return { path: rel.replace(/\\/g, '/'), abs: abs.startsWith(root) ? abs : path.join(root, '__outside__') }
  }))
}
