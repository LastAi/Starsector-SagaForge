/**
 * Task #77: SagaLib's Vaults of Knowledge bridge is optional (src-optional/README.md). Builds SagaLib
 * twice into the workspace's .cache (never its own jars/SagaLib.jar): without VoK's jar the build skips
 * the bridge and the jar has none, with it the build says "built vok". Each build's jdeps step fails
 * when a class outside a bridge names another mod's class. Needs bash, a JDK and the game's jars; skipped
 * otherwise (and outside the workspace, where mods/SagaLib isn't next to the editor).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { realDir } from './realdir'

const LIB = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib')
const CACHE = path.resolve(__dirname, '..', '..', '..', '.cache')
const BASH = ['C:/Program Files/Git/bin/bash.exe', '/usr/bin/bash', '/bin/bash'].find((b) => fs.existsSync(b))
const JDK = ['C:/Program Files/Java', '/usr/lib/jvm'].some((d) => fs.existsSync(d))
const VOK_JAR = realDir ? fs.readdirSync(path.join(realDir, 'mods')).map((d) => path.join(realDir!, 'mods', d, 'jars', 'Vok.jar')).find((f) => fs.existsSync(f)) : undefined
const can = !!BASH && JDK && !!realDir && fs.existsSync(path.join(LIB, 'build.sh')) && fs.existsSync(CACHE)

/** Class names in a jar (its central directory; no unzip needed). */
function jarClasses(file: string): string[] {
  const b = fs.readFileSync(file)
  const out: string[] = []
  const i = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  let p = b.readUInt32LE(i + 16)
  const n = b.readUInt16LE(i + 10)
  for (let k = 0; k < n; k++) {
    const nameLen = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32)
    out.push(b.subarray(p + 46, p + 46 + nameLen).toString('utf8'))
    p += 46 + nameLen + extra + comment
  }
  return out.filter((x) => x.endsWith('.class'))
}

function build(name: string, mods: string): { log: string; jar: string } {
  const out = path.join(CACHE, 'sagalib77-test', name)
  fs.mkdirSync(out, { recursive: true })
  const jar = path.join(out, 'SagaLib.jar')
  const log = execFileSync(BASH!, ['build.sh', '--no-test'], {
    cwd: LIB, encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, STARSECTOR_CORE: path.join(realDir!, 'starsector-core'), STARSECTOR_MODS: mods, BUILD_DIR: path.join(out, 'build'), JAR_OUT: jar }
  })
  return { log, jar }
}

describe('#77 SagaLib\'s VoK bridge is optional', () => {
  it.skipIf(!can)('without Vok.jar the build skips the bridge; the rest of SagaLib has the commands', () => {
    const empty = path.join(CACHE, 'sagalib77-test', 'no-mods')
    fs.mkdirSync(empty, { recursive: true })
    const { log, jar } = build('without', empty)
    expect(log).toContain('skip vok (not found:')
    expect(log).not.toContain('built vok')
    expect(log).toContain('only the bridges name other mods\' classes')
    const cls = jarClasses(jar)
    expect(cls.some((c) => c.startsWith('lastai/sagalib/bridge/vok/'))).toBe(false)
    for (const c of ['lastai/sagalib/rulecmd/SF_GrantResearch.class', 'lastai/sagalib/rulecmd/SF_HasResearch.class', 'lastai/sagalib/core/Research.class', 'lastai/sagalib/game/VokResearch.class']) expect(cls).toContain(c)
  }, 300_000)

  it.skipIf(!can || !VOK_JAR)('with Vok.jar it says "built vok", and only the bridge names VoK\'s classes (jdeps)', () => {
    const { log, jar } = build('with', path.join(realDir!, 'mods'))
    expect(log).toContain('built vok')
    expect(log).toContain('only the bridges name other mods\' classes')
    expect(jarClasses(jar)).toContain('lastai/sagalib/bridge/vok/VokBridge.class')
    const deps = fs.readFileSync(path.join(path.dirname(jar), 'build', 'jdeps.txt'), 'utf8').split('\n').filter((l) => / -> data\.kaysaar\./.test(l))
    expect(deps.length).toBeGreaterThan(0)
    expect([...new Set(deps.map((l) => l.trim().split(/\s+/)[0]))]).toEqual(['lastai.sagalib.bridge.vok.VokBridge'])
  }, 300_000)
})
