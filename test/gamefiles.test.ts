/**
 * Reads a real Starsector install (read-only) and checks that everything Saga Forge reads can be
 * parsed and re-written unchanged (PLAN.md §8, round-trip). Runs when STARSECTOR_DIR is set, or
 * when D:\Starsector exists. Nothing is written.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseLoose } from '../src/shared/loosejson'
import { updateLooseText } from '../src/shared/jsonedit'
import { parseCsvRecords } from '../src/shared/csvedit'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import { scanSources } from '../src/main/install'

import { realDir } from './realdir'

function walk(d: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

describe.skipIf(!realDir)('real game files', () => {
  const install = detectInstall(realDir ?? '')

  it('detects the install', () => {
    expect(install.ok).toBe(true)
  })

  it('re-saves every .faction and campaign JSON file unchanged', async () => {
    if (!install.ok) return
    const sources = await scanSources(install, { mode: 'workspace', workspaceDir: null }, [])
    const failures: string[] = []
    let count = 0
    for (const s of sources) {
      const data = path.join(s.dir, 'data')
      if (!fs.existsSync(data)) continue
      for (const f of walk(data)) {
        const rel = path.relative(s.dir, f).replace(/\\/g, '/')
        const isJson = /\.faction$/i.test(f) || /^data\/(campaign\/econ\/.*|campaign\/starmap|config\/(settings|custom_entities|planets))\.json$/i.test(rel)
        if (!isJson) continue
        count++
        const text = fs.readFileSync(f, 'utf8')
        try {
          const v = parseLoose(text).value
          if (updateLooseText(text, v) !== text) failures.push(`${s.id}/${rel}: no-op save changed the text`)
        } catch (e) {
          failures.push(`${s.id}/${rel}: ${(e as Error).message}`)
        }
      }
    }
    console.log(`re-saved ${count} JSON files, ${failures.length} failures`)
    expect(failures).toEqual([])
  }, 180_000)

  it('reads every campaign CSV back to identical bytes', async () => {
    if (!install.ok) return
    const sources = await scanSources(install, { mode: 'workspace', workspaceDir: null }, [])
    let count = 0
    const failures: string[] = []
    for (const s of sources) {
      for (const rel of ['data/campaign/rules.csv', 'data/campaign/person_missions.csv', 'data/campaign/bar_events.csv', 'data/campaign/commodities.csv',
        'data/campaign/special_items.csv', 'data/strings/descriptions.csv', 'data/world/factions/factions.csv']) {
        const f = path.join(s.dir, rel)
        if (!fs.existsSync(f)) continue
        count++
        const text = fs.readFileSync(f, 'utf8')
        const recs = parseCsvRecords(text)
        // rebuild the file from the records' raw cells and the separators between them
        let out = text.charCodeAt(0) === 0xfeff ? '\ufeff' : ''
        let pos = out.length
        for (const r of recs) {
          out += text.slice(pos, r.start) + r.raw.join(',')
          pos = r.end
        }
        out += text.slice(pos)
        if (out !== text) failures.push(`${s.id}/${rel}`)
      }
    }
    console.log(`round-tripped ${count} CSV files`)
    expect(failures).toEqual([])
  }, 120_000)

  it('builds the game index: factions, people, markets, rules, items, hulls', async () => {
    if (!install.ok) return
    const c = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const ix = c.index
    console.log(`index: ${ix.sources.length} sources, ${ix.factions.length} factions, ${ix.people.length} people, ${ix.markets.length} markets, ` +
      `${ix.systems.length} systems, ${c.rules.length} rules, ${ix.items.length} items, ${ix.hulls.length} hulls, ${ix.illustrations.length} illustrations, ` +
      `${ix.portraits.length} portraits, ${ix.stats.filesRead} files in ${ix.stats.ms} ms, ${ix.problems.length} problems`)
    const heg = ix.factions.find((f) => f.id === 'hegemony')!
    expect(heg.definedBy).toBe('starsector-core')
    expect(heg.listed).toBe(true)
    expect(heg.name).toBe('Hegemony')
    expect(ix.markets.find((m) => m.id === 'jangala')?.faction).toBe('hegemony')
    expect(ix.systems.find((s) => s.id === 'corvus')).toBeTruthy()
    expect(ix.items.find((i) => i.id === 'supplies')?.kind).toBe('commodity')
    expect(ix.items.find((i) => i.id === 'modspec')?.kind).toBe('special')
    expect(ix.hulls.find((h) => h.id === 'onslaught')?.hullSize).toBe('CAPITAL_SHIP')
    expect(ix.illustrations.some((i) => i.key === 'space_wreckage')).toBe(true)
    expect(ix.ui.fonts.defaultFont).toMatch(/\.fnt$/)
    expect(ix.ui.colors.hColor).toEqual([255, 210, 0, 255])
    expect(c.rules.length).toBeGreaterThan(1000)
    const ga = c.rules.find((r) => r.id === 'gaData_blurb' || r.id.startsWith('gaData'))
    expect(ga?.sourceId).toBe('starsector-core')
    expect(ix.people.find((p) => p.id === 'baird')?.kind).toBe('code')
    // Who changes vanilla factions (e.g. a mod's player.faction / hegemony.faction patch) is recorded
    const patched = ix.factions.filter((f) => f.changedBy.length)
    console.log(`factions changed by mods: ${patched.map((f) => `${f.id} <- ${f.changedBy.join('+')}`).join(', ')}`)
  }, 180_000)
})
