/** Phase 6 (DESIGN-PHASE6.md): writing tools (R29) and quest templates (R30). */
import { describe, expect, it } from 'vitest'
import { QUEST_TEMPLATES, markTemplateBlanks, fromSavedTemplate } from '../src/shared/templates'
import { questScript, scriptMarkdown } from '../src/shared/script'
import { punctuation, styleChecks } from '../src/shared/checks/style'
import { checkModel, type CheckContext } from '../src/shared/checks'
import { compileQuest } from '../src/shared/export/questrules'
import { activeTodos } from '../src/shared/todo'
import { defsFor } from '../src/shared/defs'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { buildIndex, detectInstall } from '../src/main/gameindex'
import { realDir } from './realdir'
import type { GameIndex, ValidInstall } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'

const index = { factions: [], items: [], people: [], markets: [], codeSystems: [], planetTypes: [], customEntityTypes: [] } as unknown as GameIndex
function ctx(m: ModModel, styleChecks = false): CheckContext {
  const loaded = {
    sourceId: 'vgc', modDir: '/x', isNew: false, modInfo: { id: 'vgc', name: 'V', version: '1', gameVersion: '0.98a-RC8', dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime, descriptions: {}, factions: [], releases: [], files: {}, errors: []
  } as unknown as ProjectState
  return { model: m, index, defs: defsFor('0.98a'), loaded, rules: null, styleChecks }
}

describe('quest templates (R30)', () => {
  for (const t of QUEST_TEMPLATES) {
    it(`${t.id}: builds a connected chart whose blanks are to-dos, not errors`, () => {
      const m = emptyModel('vgc_')
      const q = markTemplateBlanks(t.build('vgc_t', 'T'))
      m.quests = [q]
      expect(q.id).toBe('vgc_t')
      // every edge joins two existing nodes
      const ids = new Set(q.nodes.map((n) => n.id))
      for (const e of q.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true) }
      // every stage node names a stage of the quest
      for (const n of q.nodes) if (n.type === 'stage') expect(q.stages.some((s) => s.id === n.stage)).toBe(true)
      // the blanks are listed as to-dos (contact, places, fleets)
      const todos = activeTodos(m).map((x) => x.path)
      expect(todos).toContain('start.person')
      for (const n of q.nodes) {
        if (n.type === 'wait' && n.mode === 'arrive') expect(todos).toContain(`nodes#${n.id}.entity`)
        if (n.type === 'encounter') expect(todos).toContain(`nodes#${n.id}.encounter`)
      }
      // the rules compile
      const compiled = compileQuest(q, { sagalib: true, phrases: [] })
      expect(compiled.rows.length).toBeGreaterThan(0)
      expect(compiled.problems.filter((p) => p.level === 'error').map((p) => p.message)).toEqual([])
      // every path reaches the end of the quest: the script reaches every node
      expect(questScript(q, m).some((b) => b.text === '(not reached from the start)')).toBe(false)
    })
  }
  it.skipIf(!realDir)('every template has no errors against the game (blanks are to-dos)', async () => {
    const install = detectInstall(realDir!) as ValidInstall
    const cache = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const m = emptyModel('vgc_')
    m.quests = QUEST_TEMPLATES.map((t) => markTemplateBlanks(t.build(`vgc_${t.id}`, t.label)))
    const c = { ...ctx(m), index: cache.index, rules: cache.rules }
    const errors = checkModel(c).filter((p) => p.level === 'error')
    expect(errors.map((p) => p.message)).toEqual([])
  }, 120_000)
})

describe('saved templates', () => {
  it('replaces the old quest id everywhere and drops to-dos and the inactive mark', () => {
    const old = newQuest('vgc_old', 'Old')
    old.stages = [{ id: 'go', title: 'Go', journal: 'Talk about $vgc_old_name.', kind: 'normal', renamedFrom: [] }]
    old.inactive = true
    const q = fromSavedTemplate(old, 'vgc_new', 'New')
    expect(q.id).toBe('vgc_new')
    expect(q.title).toBe('New')
    expect(q.inactive).toBeUndefined()
    expect(JSON.stringify(q)).not.toContain('vgc_old')
    expect(q.stages[0].journal).toBe('Talk about $vgc_new_name.')
  })
})

describe('script view (R29)', () => {
  it('lists the scenes in the order the player meets them, with choices and notes', () => {
    const m = emptyModel('vgc_')
    const q = QUEST_TEMPLATES.find((t) => t.id === 'delivery')!.build('vgc_d', 'Delivery')
    const blocks = questScript(q, m)
    const scenes = blocks.filter((b) => b.kind === 'scene').map((b) => b.text)
    expect(scenes).toEqual(['Offer', 'Handover'])
    const offer = blocks.findIndex((b) => b.kind === 'scene' && b.text === 'Offer')
    expect(blocks[offer + 1]).toMatchObject({ kind: 'line' })
    expect(blocks.filter((b) => b.kind === 'choice').map((b) => b.text)).toEqual(['Accept the delivery', 'Not interested', 'Continue'])
    // the accept branch comes before the decline branch (handle order)
    const journal = blocks.findIndex((b) => b.kind === 'note' && b.text.startsWith('Journal: Deliver'))
    const back = blocks.findIndex((b) => b.kind === 'note' && b.text === 'Back to the menu.')
    expect(journal).toBeGreaterThan(offer)
    expect(back).toBeGreaterThan(journal)
    const md = scriptMarkdown(q, blocks)
    expect(md.startsWith('# Delivery\n')).toBe(true)
    expect(md).toContain('## Offer')
    expect(md).toContain('- **Accept the delivery** → ')
    expect(md).not.toMatch(/\n{3,}/)
  })
  it('puts nodes no path reaches at the end', () => {
    const m = emptyModel('vgc_')
    const q = newQuest('vgc_q', 'Q')
    q.nodes.push({ id: 'lost', type: 'dialog', x: 0, y: 0, title: 'Lost', visual: { kind: 'none' }, displays: [], text: 'Hello.', highlights: [], options: [], conditions: [], script: [], phrases: [] } as never)
    const blocks = questScript(q, m)
    const i = blocks.findIndex((b) => b.text === '(not reached from the start)')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(blocks[i + 1]).toMatchObject({ kind: 'scene', text: 'Lost' })
  })
})

describe('punctuation checks (R29)', () => {
  it('finds each kind of problem', () => {
    const keys = (t: string, prose = true) => punctuation(t, prose).map(([, k]) => k)
    expect(keys('"Hello, you said.')).toContain('quote')
    expect(keys('A (note.')).toContain('bracket')
    expect(keys('Two  spaces.')).toContain('spaces')
    expect(keys('“Curly” and "straight".')).toContain('curly')
    expect(keys('Hello$playerName.')).toContain('glued')
    expect(keys('No end')).toContain('punct')
    expect(keys('No end', false)).toEqual([])
    expect(keys('"Fine." You nod.')).toEqual([])
  })
  it('checks options, stages and descriptions too, only when style checks are on', () => {
    const m = emptyModel('vgc_')
    const q = QUEST_TEMPLATES.find((t) => t.id === 'delivery')!.build('vgc_d', 'Delivery')
    q.stages[0].journal = 'Deliver the cargo  quickly.'
    const offer = q.nodes.find((n) => n.id === 'offer')!
    if (offer.type === 'dialog') offer.options[0].text = 'Accept (the delivery'
    m.quests = [q]
    const keys = styleChecks(ctx(m, true)).map((p) => p.key)
    expect(keys).toContain('style:vgc_d:st:deliver:spaces')
    expect(keys).toContain('style:vgc_d:offer:accept:bracket')
    expect(styleChecks(ctx(m, false))).toEqual([])
  })
})
