/** Reference pages (R8): the sections the info buttons open, built from the definitions. */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { referenceHtml, referenceSections, referencePages } from '../src/shared/reference'
import { defsFor } from '../src/shared/defs'

describe('reference pages (R8)', () => {
  const defs = defsFor('0.98a')
  it('has a section for each People list, with every option of the definitions', () => {
    const s = referenceSections(defs, { gameVersion: '0.98a-RC8', voiceRules: { soldier: 7 } })
    expect(s.map((x) => x.id)).toEqual(['people-rank', 'people-post', 'people-voice', 'people-personality', 'people-contact-type', 'people-importance', 'factions-fleet-types', 'factions-other-keys', 'locations-conditions',
      // #67 U34: pages for the fields that pick a game thing by name
      'locations-entity-types', 'locations-entity-tags', 'locations-planet-types', 'locations-star-types', 'locations-industries', 'locations-submarkets',
      'loot-drop-groups', 'factions-blueprint-tags', 'factions-skills', 'quests-raid-icons', 'saga-research-icons', 'rules-options', 'general-rep-levels', 'rules-commands', 'rules-conditions', 'rules-condition-scopes', 'rules-triggers', 'rules-memory-keys', 'rules-tokens',
      'quests-node-types', 'quests-start-kinds', 'quests-variables', 'quests-target-criteria', 'quests-ruins-sizes', 'quests-visuals', 'quests-raid-danger',
      'encounters-spawn', 'encounters-behaviour', 'locations-surveyed', 'items-presets', 'saga-intel-tabs', 'saga-achievement-rarity', 'quests-bounty-board',
      'factions-nex-alignments', 'factions-nex-start-fleets', 'general-music'])
    expect(s[0].rows.length).toBe(defs.ranks.length)
    expect(s[2].rows.find((r) => r[0] === 'soldier')).toEqual(['soldier', '7'])
    // staff posts are marked
    expect(s[1].rows.find((r) => r[0] === 'stationCommander')![2]).toBe('Staff post; offers commissions')
  })

  it('every ref used by a form points at a section, and the HTML escapes its text', () => {
    const ids = new Set(referenceSections(defs, { gameVersion: 'x' }).map((x) => x.id))
    const dir = path.join(__dirname, '..', 'src', 'renderer', 'src')
    const used = new Set<string>()
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.svelte')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bref="([a-z0-9-]+)"/g)) used.add(m[1]) } }
    walk(dir)
    expect([...used].filter((u) => !ids.has(u))).toEqual([])
    expect(used.size).toBeGreaterThanOrEqual(6)
    expect(referenceHtml(defs, { gameVersion: '<0.98a>' })).toContain('&lt;0.98a&gt;')
  })
})

describe('#67 U34: one page per group', () => {
  it('a page per group, each with its own sections, the whole sidebar, and links to the other pages', () => {
    const { pages, fileOf } = referencePages(defsFor('0.98a'), { gameVersion: '0.98a' })
    expect(pages.map((p) => p.file)).toContain('reference-rules.html')
    expect(fileOf('people-rank')).toBe('reference-people.html')
    expect(fileOf('rules-triggers')).toBe('reference-rules.html')
    const people = pages.find((p) => p.file === 'reference-people.html')!.html
    expect(people).toContain('id="people-rank"')
    expect(people).not.toContain('id="rules-triggers"')
    expect(people).toContain('href="reference-rules.html#rules-triggers"')
    expect(people).toContain('href="#people-rank"')
  })
})
