/**
 * Phase 7b (DESIGN-PHASE7.md): Test-context place presets (RC-F3) against vanilla's own planet,
 * ruins and decivilised-world dialogs; the Raid node (RC-F4); bar scenes without a mission (RC-R6).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { compileRules, Engine } from '../src/shared/rules/engine'
import { parseRulesCsv } from '../src/main/gameindex'
import type { RuleRow } from '../src/shared/rules/types'
import { contextFrom, defaultTestContext, type PlacePreset, type Lookup } from '../src/shared/rules/context'
import { defsFor } from '../src/shared/defs'
import { realDir } from './realdir'
import { newQuest } from '../src/shared/quest'
import { compileQuest, nodeRuleId, startOptionId } from '../src/shared/export/questrules'
import { newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, raidOutcome, RAID_DONE, RAID_BACK } from '../src/shared/play'
import { barSceneProblems } from '../src/shared/checks/quests'
import { dlg } from './fixtures/testmod'
import type { DialogNode, QuestPlan } from '../src/shared/model'

const look: Lookup = { person: () => null, faction: () => null, market: () => null }

describe.skipIf(!realDir)('Test context place presets on vanilla dialogs (RC-F3)', () => {
  const rows: RuleRow[] = []
  if (realDir) parseRulesCsv(fs.readFileSync(`${realDir}/starsector-core/data/campaign/rules.csv`, 'utf8'), 'starsector-core', 'rules.csv', rows)
  const rs = compileRules(rows)
  const open = (place: PlacePreset) => {
    const ctx = contextFrom({ ...defaultTestContext(), place, entity: 'sfw_rock' }, defsFor('0.98a'), look)
    const e = new Engine(rs, ctx)
    e.fireBest('OpenInteractionDialog')
    return e
  }

  it('a planet with unexplored ruins opens like vanilla, with "Explore the ruins"', () => {
    const e = open('ruins')
    expect(e.fired).toContain('surveyOpen')
    expect(e.fired).toContain('salRuins_vast')
    expect(e.view.options.some((o) => o.id === 'salExplore')).toBe(true)
  })

  it('explored ruins have no explore option', () => {
    const e = open('ruinsExplored')
    expect(e.view.options.some((o) => o.id === 'salExplore')).toBe(false)
  })

  it('a decivilised world gets vanilla\'s collapse text', () => {
    const e = open('deciv')
    expect(e.fired).toContain('surveyOpenDeciv')
    expect(e.view.paragraphs.map((p) => p.text).join(' ')).toContain('chaos')
  })

  it('the place id is $id when no one is spoken to', () => {
    const e = open('planet')
    expect(e.ctx.memory.get('$id')).toBe('sfw_rock')
  })
})

// ---------------------------------------------------------------- raid and bar scene

function raidQuest(): QuestPlan {
  const q = newQuest('sfw_raid', 'Raid test', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sfw_rock'], optionText: 'Raid the compound' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.options = [{ id: 'go_raid', text: 'Send the marines' }]
  q.nodes.push(
    { id: 'raid', type: 'raid', x: 0, y: 0, title: 'Compound', text: 'The compound is quiet.', objective: 'Take the "relic"', danger: 'HIGH', difficulty: 200, xp: 3000, tooltip: 'Guarded', raidText: 'Shots echo.' },
    dlg('after', 0, 0, 'You have the relic.', [{ id: 'ok', text: 'Good' }]),
    { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }
  )
  q.edges.push({ id: 'a', from: 'offer', handle: 'go_raid', to: 'raid' }, { id: 'b', from: 'raid', handle: 'done', to: 'after' }, { id: 'c', from: 'after', handle: 'ok', to: 'menu' })
  return q
}

const VANILLA_RAID: RuleRow = { id: 'marketHostileRaidNonMarket', trigger: 'DialogOptionSelected', conditions: '$option == mktRaidNonMarket', script: 'MarketCMD raidNonMarket', text: '', options: '', notes: '', sourceId: 'starsector-core', file: 'rules.csv', line: 1 }

describe('Raid node (RC-F4)', () => {
  it('exports vanilla\'s story-raid pattern', () => {
    const c = compileQuest(raidQuest(), { sagalib: true, phrases: [] })
    const main = c.rows.find((r) => r.id === nodeRuleId(raidQuest(), 'raid'))!
    expect(main.options).toBe('mktRaidNonMarket:Continue')
    expect(main.script.split('\n')).toEqual([
      '$raidDifficulty = 200 0',
      '$raidGoBackTrigger = PopulateOptions 0',
      '$raidRestrictToTrigger = sfw_raid_raid_raid 0',
      '$raidContinueTrigger = sfw_raid_raid_done 0',
      "AddRaidObjective genericIcon \"Take the 'relic'\" HIGH 3000 sfw_raid_raid_raid true \"Guarded\""
    ])
    expect(c.rows.find((r) => r.trigger === 'sfw_raid_raid_raid')?.text).toBe('Shots echo.')
    expect(c.rows.find((r) => r.trigger === 'sfw_raid_raid_done')?.script).toContain('sfw_raid_after')
    expect(c.problems.filter((p) => p.level === 'error')).toEqual([])
  })

  it('plays: the raid menu asks how it went, then the quest continues', () => {
    const q = raidQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const sim = newSimState()
    const e = new Engine(compileRules([...c.rows, VANILLA_RAID]), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, sim))
    e.set('$id', 'sfw_rock')
    e.fireAll('PopulateOptions')
    e.select(startOptionId(q))
    e.select('sfw_raid_go_raid')
    expect(e.view.options.map((o) => o.id)).toEqual(['mktRaidNonMarket'])
    e.select('mktRaidNonMarket')
    expect(e.view.options.map((o) => o.id)).toEqual([RAID_DONE, RAID_BACK])
    raidOutcome(e, 'done')
    const text = e.view.paragraphs.map((p) => p.text).join(' | ')
    expect(text).toContain('Shots echo.')
    expect(text).toContain('You have the relic.')
  })
})

function barQuest(): QuestPlan {
  const q = newQuest('sfw_bar', 'Bar test', 'dialog')
  q.start = { kind: 'barScene', conditions: ['$market.id == jangala'], optionText: 'Talk to the spacer: carefully', blurb: 'A spacer waves.', probability: 0.5, once: 'playthrough' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = '"Buy me a drink?"'
  offer.options = [{ id: 'nod', text: 'Nod' }]
  // "back to the menu" in a bar scene means the bar's menu
  q.nodes.push({ id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' })
  q.edges.push({ id: 'n', from: 'offer', handle: 'nod', to: 'menu' })
  return q
}

describe('Bar scene start (RC-R6)', () => {
  it('exports AddBarEvents + AddBarEvent with the chance, and counts "once" when picked', () => {
    const q = barQuest()
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const start = c.rows.find((r) => r.id === 'sfw_bar_start')!
    expect(start.trigger).toBe('AddBarEvents')
    expect(start.conditions.split('\n')).toEqual(['$market.id == jangala', '!$global.sfw_bar_seen', 'RollProbability 0.5'])
    expect(start.script).toBe(`AddBarEvent ${startOptionId(q)} "Talk to the spacer: carefully" "A spacer waves."`)
    const go = c.rows.find((r) => r.id === 'sfw_bar_start_go')!
    expect(go.script.split('\n')[0]).toBe('$global.sfw_bar_seen = true')
    // its "back to the menu" goes back to the bar, not to the market menu
    expect(c.rows.some((r) => r.script.includes('BarCMD returnFromEvent true'))).toBe(true)
    expect(c.rows.some((r) => r.script.includes('SF_BackToMenu'))).toBe(false)
  })

  it('has no colon warning (AddBarEvent takes the label as a parameter) and warns when it is everywhere', () => {
    const q = barQuest()
    expect(barSceneProblems(q)).toEqual([])
    q.start = { kind: 'barScene', conditions: [], optionText: 'x', blurb: '' }
    expect(barSceneProblems(q).map((p) => p.key)).toEqual(['barblurb:sfw_bar', 'barevery:sfw_bar'])
  })
})
