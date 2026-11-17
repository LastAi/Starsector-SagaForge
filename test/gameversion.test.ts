/**
 * Game version detection (GAME-0.98.5a-ASSESSMENT R2): Version.class inside starfarer_obf.jar,
 * starsector.log as a fallback, and comparing Starsector version strings. Fake jars are built in
 * .userdata/test-version-tmp; the real installs are only read, when present.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { classStrings, readGameVersion, readZipEntry, versionFromClass, versionFromLog } from '../src/main/gameversion'
import { cmpGameVersions, gameVersionAtLeast, parseGameVersion } from '../src/shared/version'
import { defsFor, knownDefs, ruleCommand } from '../src/shared/defs'
import { realDir } from './realdir'

const tmp = path.resolve(__dirname, '..', '.userdata', 'test-version-tmp')

/** A class file with just enough of a constant pool (the parser stops after it). */
function classFile(strings: string[]): Buffer {
  const parts: Buffer[] = []
  let slots = 0
  const u2 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b }
  const utf8 = (s: string) => { slots++; return Buffer.concat([Buffer.from([1]), u2(Buffer.byteLength(s)), Buffer.from(s, 'utf8')]) }
  parts.push(utf8('com/fs/starfarer/Version'))
  parts.push(Buffer.from([7]), u2(1)); slots++ // Class -> #1
  parts.push(Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 42])); slots += 2 // a Long takes two slots
  parts.push(Buffer.from([3, 0, 0, 0, 7])); slots++ // Integer
  for (const s of strings) parts.push(utf8(s))
  parts.push(Buffer.from([8]), u2(5)); slots++ // String -> first of `strings`
  const head = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 50])
  return Buffer.concat([head, u2(slots + 1), ...parts, u2(0x21)])
}

/** A zip with the given entries (deflated unless `store`). */
function zipFile(entries: { name: string; data: Buffer; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const comp = e.store ? e.data : zlib.deflateRawSync(e.data)
    const name = Buffer.from(e.name, 'utf8')
    const crc = zlib.crc32(e.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.store ? 0 : 8, 8)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.store ? 0 : 8, 10)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    locals.push(lh, name, comp)
    central.push(ch, name)
    offset += 30 + name.length + comp.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const writeFile = (rel: string, data: string | Buffer) => {
  const f = path.join(tmp, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, data)
  return f
}

beforeAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('Starsector version strings', () => {
  it('parses release, patch and RC parts', () => {
    expect(parseGameVersion('0.98a-RC8')).toEqual({ nums: [0, 98], rc: 8 })
    expect(parseGameVersion('0.98.5a-RC5')).toEqual({ nums: [0, 98, 5], rc: 5 })
    expect(parseGameVersion('Starsector 0.97a')).toEqual({ nums: [0, 97], rc: null })
    expect(parseGameVersion('banana')).toBeNull()
    expect(parseGameVersion(null)).toBeNull()
  })

  it('orders 0.98a < 0.98.5a and RCs within a release', () => {
    expect(cmpGameVersions('0.98a-RC8', '0.98.5a-RC5')).toBeLessThan(0)
    expect(cmpGameVersions('0.98.5a-RC5', '0.98.5a-RC6')).toBeLessThan(0)
    expect(cmpGameVersions('0.97a-RC11', '0.98a-RC1')).toBeLessThan(0)
    expect(cmpGameVersions('0.98.5a-RC5', '0.98.5a')).toBe(0)
    expect(gameVersionAtLeast('0.98.5a-RC5', '0.98.5a')).toBe(true)
    expect(gameVersionAtLeast('0.98a-RC8', '0.98.5a')).toBe(false)
    expect(gameVersionAtLeast(null, '0.98.5a')).toBe(false)
  })

  it('reads the last "Starting Starsector" line of a log', () => {
    expect(versionFromLog('0 [main] INFO Starting Starsector 0.97a-RC11 launcher\n...\n9 [main] INFO Starting Starsector 0.98a-RC8 launcher\n')).toBe('0.98a-RC8')
    expect(versionFromLog('nothing here')).toBeNull()
  })
})

describe('Version.class in starfarer_obf.jar', () => {
  it('reads the constant pool strings, skipping two-slot constants', () => {
    const cls = classFile(['0.98.5a-RC5', 'Starsector 0.98.5a-RC5'])
    expect(classStrings(cls)).toEqual(['com/fs/starfarer/Version', '0.98.5a-RC5', 'Starsector 0.98.5a-RC5'])
    expect(versionFromClass(cls)).toBe('0.98.5a-RC5')
    expect(versionFromClass(classFile(['versionOnly', '0.98a-RC8']))).toBe('0.98a-RC8')
    expect(versionFromClass(Buffer.from('not a class'))).toBeNull()
  })

  it('reads a deflated or stored jar entry', () => {
    const cls = classFile(['0.98.5a-RC5', 'Starsector 0.98.5a-RC5'])
    const jar = writeFile('zip/a.jar', zipFile([{ name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\n') }, { name: 'com/fs/starfarer/Version.class', data: cls }]))
    expect(readZipEntry(jar, 'com/fs/starfarer/Version.class')?.equals(cls)).toBe(true)
    const stored = writeFile('zip/b.jar', zipFile([{ name: 'x.txt', data: Buffer.from('hello'), store: true }]))
    expect(readZipEntry(stored, 'x.txt')?.toString()).toBe('hello')
    expect(readZipEntry(stored, 'missing.txt')).toBeNull()
    expect(readZipEntry(writeFile('zip/c.jar', 'not a zip'), 'x.txt')).toBeNull()
  })

  it('prefers the jar over the log, and falls back to the log', () => {
    const core = path.join(tmp, 'game', 'starsector-core')
    writeFile('game/starsector-core/starsector.log', 'INFO Starting Starsector 0.98a-RC8 launcher\n')
    expect(readGameVersion([core])).toBe('0.98a-RC8')
    writeFile('game/starsector-core/starfarer_obf.jar', zipFile([{ name: 'com/fs/starfarer/Version.class', data: classFile(['0.98.5a-RC5', 'Starsector 0.98.5a-RC5']) }]))
    expect(readGameVersion([core])).toBe('0.98.5a-RC5')
    // a fresh 0.98.5a install has no log: the jar alone is enough
    fs.rmSync(path.join(core, 'starsector.log'))
    expect(readGameVersion([core])).toBe('0.98.5a-RC5')
    expect(readGameVersion([path.join(tmp, 'nothing')])).toBeNull()
  })

  it.skipIf(!realDir)('reads the real install\'s jar', () => {
    const v = readGameVersion([path.join(realDir!, 'starsector-core')])
    expect(parseGameVersion(v)).not.toBeNull()
  })

  it.skipIf(!fs.existsSync('D:/Starsector_98_5a/starsector-core/starfarer_obf.jar'))('reads 0.98.5a-RC5 from a fresh 0.98.5a install (no log)', () => {
    expect(readGameVersion(['D:/Starsector_98_5a/starsector-core'])).toBe('0.98.5a-RC5')
  })
})

describe('0.98.5a definitions', () => {
  it('picks the definitions by version', () => {
    expect(knownDefs()).toEqual(['0.98a-RC8', '0.98.5a-RC5'])
    expect(defsFor('0.98a-RC8').gameVersion).toBe('0.98a-RC8')
    expect(defsFor('0.98.5a-RC5').gameVersion).toBe('0.98.5a-RC5')
    expect(defsFor('0.98.5a-RC9').gameVersion).toBe('0.98.5a-RC5')
    // unknown or undetected: the newest
    expect(defsFor(null).gameVersion).toBe('0.98.5a-RC5')
  })

  it('adds the new commands, ids and tokens only for 0.98.5a', () => {
    const old = defsFor('0.98a-RC8'), d = defsFor('0.98.5a-RC5')
    for (const n of ['PersonCMD', 'HasContactFromFaction', 'MarketHasIndustry', 'PersonIsDefaultMarketPost', 'ShowPlayerPerson', 'FinishVisualFadeFast', 'SellToFleet', 'SDR_CMD']) {
      expect(ruleCommand(d, n)?.provider, n).toBe('vanilla')
      expect(ruleCommand(old, n), n).toBeUndefined()
    }
    expect(ruleCommand(d, 'SellToFleet')?.className).toBe('com.fs.starfarer.api.impl.campaign.rulecmd.salvage.SellToFleet')
    // changed parameters: one-argument RepIsAtWorst, SetPersonHidden <bool>, MovePersonToMarket's third argument
    expect(ruleCommand(d, 'RepIsAtWorst')!.forms.some((f) => f.length === 1 && f[0].type === 'repLevel')).toBe(true)
    expect(ruleCommand(old, 'RepIsAtWorst')!.forms).toHaveLength(1)
    expect(ruleCommand(d, 'SetPersonHidden')!.forms.some((f) => f.length === 1 && f[0].type === 'bool')).toBe(true)
    expect(ruleCommand(d, 'MovePersonToMarket')!.forms[0].map((p) => p.name)).toEqual(['person', 'market', 'forceAddToComms'])
    // new actions merge into the multi-purpose commands, and nothing else of them is lost
    const misc = ruleCommand(d, 'MiscCMD')!.forms[0][0].values!
    expect(misc).toContain('playerHasMilitaryBases')
    expect(misc).toEqual(expect.arrayContaining(ruleCommand(old, 'MiscCMD')!.forms[0][0].values!))
    expect(d.ruleCommands.length).toBe(old.ruleCommands.length + 8)
    expect(d.ruleCommands.filter((c) => c.provider === 'sagalib').length).toBe(old.ruleCommands.filter((c) => c.provider === 'sagalib').length)

    for (const id of ['artificialIntelligence', 'criminal', 'fugitive']) expect(d.ranks.some((r) => r.id === id), id).toBe(true)
    for (const id of ['personnelOfficer', 'underworldBoss', 'exile', 'associate_academician', 'assistant_academician', 'gammaCore', 'betaCore', 'alphaCore']) expect(d.posts.some((r) => r.id === id), id).toBe(true)
    expect(old.posts.some((r) => r.id === 'personnelOfficer')).toBe(false)
    for (const id of ['achilles_andrada', 'hector_andrada', 'hercules_andrada', 'bellamy_kanta', 'ko_jove', 'faro_inesis', 'benoit', 'lott', 'gallu_blanc', 'maeus_moroz', 'crasis', 'aureolin']) {
      expect(d.codePeople.some((p) => p.id === id), id).toBe(true)
    }
    expect(d.codePeople.length).toBe(old.codePeople.length + 12)
    expect(d.tokens.map((t) => t.token)).toEqual(expect.arrayContaining(['$PersonFirstName', '$PersonLastName', '$playerName']))
    expect(d.triggers.length).toBeGreaterThan(old.triggers.length)
    expect(d.factionKeys.find((k) => k.key === 'portraits')?.summary).toMatch(/player_male/)
    expect(d.factionKeys.length).toBe(old.factionKeys.length)
    // the rest is inherited unchanged
    expect(d.repLevels).toEqual(old.repLevels)
    expect(d.dialog).toEqual(old.dialog)
  })
})
