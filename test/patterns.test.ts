/**
 * Vanilla-safe patterns the editor points to (task #36): a protected quest wreck, "back to the menu"
 * as the ending of a branch, and a quest's fleet placed where the quest sends the player.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { vanguardModel } from './fixtures/vanguard'
import { compileQuest } from '../src/shared/export/questrules'
import { compileRules, emptyView, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks } from '../src/shared/play'
import { newNode } from '../src/shared/quest'
import { newSystem, newEntity } from '../src/shared/locations'
import { encounterProblems } from '../src/shared/encounters'
import {
  applyPatternFix, conversationPlaces, defaultLockUntil, guardsOf, linkToMenu, populateLinkProblems, protectWreck, spawnSuggestions,
  encounterPlacementProblems, unguardedWreckProblems, lockedEntityIds
} from '../src/shared/patterns'
import { FACTION_TABS } from '../src/shared/factionform'
import type { CheckContext } from '../src/shared/checks'
import type { DialogNode } from '../src/shared/model'

const withoutLock = () => { const m = vanguardModel(); m.quests = m.quests.filter((q) => q.id !== 'vgc_wreck_lock'); return m }

describe('protected quest wreck', () => {
  it('Protect this wreck adds a lock that answers at the wreck until the last quest succeeds', () => {
    const m = withoutLock()
    expect(unguardedWreckProblems(m).map((p) => p.fixes?.[0].action)).toEqual(['protectWreck'])
    expect(defaultLockUntil(m.quests, 'vgc_convoy_wreck')).toBe('vgc_salvage_rights')
    expect(applyPatternFix(m, 'protectWreck', 'vgc_convoy_wreck')).toBe(true)
    expect(unguardedWreckProblems(m)).toEqual([])
    const lock = guardsOf(m.quests, 'vgc_convoy_wreck')[0]
    expect(lock.id).toBe('vgc_convoy_wreck_lock')
    expect(lock.kind).toBe('dialog')
    expect(lock.start).toEqual({ kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_convoy_wreck score:500', '!SF_QuestDone vgc_salvage_rights success'] })
  })

  it('the lock wins at the wreck, the quest\'s own arrival still wins at its step, and Leave closes the dialog', () => {
    const m = withoutLock()
    protectWreck(m, 'vgc_convoy_wreck')
    const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
    // RC-F2: the lock owns the wreck's arrival, so the quest's Arrive there stays a takeover
    const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib: true, phrases, lockedEntities: lockedEntityIds(m.quests) }).rows)
    const e = new Engine(compileRules(rows), newContext(), sagaHooks({ quests: m.quests, phrases: new Map(phrases.map((p) => [p.token, p])) }, newSimState()))
    e.set('$id', 'vgc_convoy_wreck')
    expect(e.fireBest('OpenInteractionDialog')?.row.id).toBe('vgc_convoy_wreck_lock_offer')
    expect(e.view.options.map((o) => o.id)).toEqual(['defaultLeave'])
    // at the Lost Convoy's "search" step its arrival rule (score 1000) answers instead
    e.view = emptyView()
    e.set('$global.vgc_lost_convoy_state', 'active')
    e.set('$global.vgc_lost_convoy_step', 'search')
    expect(e.fireBest('OpenInteractionDialog')?.row.id).toMatch(/^vgc_lost_convoy_/)
  })

  it('a lock with no quest to wait for stays for good', () => {
    const m = withoutLock()
    protectWreck(m, 'vgc_convoy_wreck', null)
    expect(guardsOf(m.quests, 'vgc_convoy_wreck')[0].start).toMatchObject({ conditions: ['$id == vgc_convoy_wreck score:500'] })
  })
})

describe('back to the menu', () => {
  it('new Link nodes end the branch the vanilla-safe way: SF_BackToMenu with SagaLib, FireAll PopulateOptions without', () => {
    expect(newNode('link', 'l', 0, 0)).toMatchObject({ type: 'link', mode: 'menu' })
    const m = vanguardModel()
    const lc = m.quests.find((q) => q.id === 'vgc_lost_convoy')!
    linkToMenu(m, lc.id, 'no')
    const decline = (sagalib: boolean) => compileQuest(lc, { sagalib, phrases: [] }).rows.find((r) => r.id === 'vgc_lost_convoy_decline_go')!.script
    expect(decline(true)).toBe('SF_BackToMenu')
    expect(decline(false)).toBe('FireAll PopulateOptions')
  })

  it('a Link that fires PopulateOptions: a warning where the dialog can happen at a wreck, a hint elsewhere, with a fix', () => {
    const m = vanguardModel()
    const markets = new Set(['vgc_haven'])
    // the decline link is only reached at Reyes (a contact: there is a menu), even though the quest also arrives at the wreck
    const hint = populateLinkProblems(m, markets, true).find((p) => p.key === 'populate:vgc_lost_convoy:no')!
    expect(hint.level).toBe('info')
    expect(hint.fixes).toEqual([{ label: 'Use back to the menu', action: 'linkToMenu', arg: { quest: 'vgc_lost_convoy', node: 'no' } }])
    // the wreck's Leave also leads there: that conversation was opened by the arrival at the wreck
    const lc = m.quests.find((q) => q.id === 'vgc_lost_convoy')!
    lc.edges.find((e) => e.from === 'wreck' && e.handle === 'leave_wreck')!.to = 'no'
    const warn = populateLinkProblems(m, markets, true).find((p) => p.key === 'populate:vgc_lost_convoy:no')!
    expect(warn.level).toBe('warning')
    expect(warn.message).toContain('vgc_convoy_wreck')
    // after an encounter's outcome SagaLib opens its own dialog: no menu either
    expect(conversationPlaces(lc, 'arrive')).toEqual(['a dialog SagaLib opens (after a battle or a timer)'])
    // fixed: nothing left
    applyPatternFix(m, 'linkToMenu', { quest: 'vgc_lost_convoy', node: 'no' })
    applyPatternFix(m, 'linkToMenu', { quest: 'vgc_salvage_rights', node: 'no' })
    expect(populateLinkProblems(m, markets, true)).toEqual([])
  })

  it('Play mode: back to the menu at a wreck closes the dialog', () => {
    const m = vanguardModel()
    const q = m.quests.find((x) => x.id === 'vgc_wreck_lock')!
    // replace the lock's Leave with a back-to-the-menu link
    const close = q.nodes.find((n) => n.id === 'close')!
    Object.assign(close, { mode: 'menu', target: '' })
    const rows = compileQuest(q, { sagalib: true, phrases: [] }).rows
    const e = new Engine(compileRules(rows), newContext(), sagaHooks({ quests: m.quests, phrases: new Map() }, newSimState()))
    e.set('$id', 'vgc_convoy_wreck')
    e.fireBest('OpenInteractionDialog')
    e.select((q.nodes.find((n) => n.id === 'offer') as DialogNode).options.map((o) => `vgc_wreck_lock_${o.id}`)[0])
    expect(e.view.ended).toBe(true)
  })
})

describe('where a quest\'s fleet waits', () => {
  it('suggests the places the spawning quest sends the player, and warns when the fleet waits in another system', () => {
    const m = vanguardModel()
    expect(spawnSuggestions(m, 'vgc_belt_ambush')).toEqual(['vgc_convoy_wreck', 'vgc_haven'])
    expect(encounterPlacementProblems(m)).toEqual([])
    // the ambush in a second system the quest never sends the player to
    const other = newSystem('vgc_other', 'Other', 0, 0)
    other.entities.push(newEntity('asteroidBelt', 'vgc_other_belt', 'Other Belt', 'star', 3000, 0))
    m.systems.push(other)
    m.encounters[0].spawn.at = 'vgc_other_belt'
    const w = encounterPlacementProblems(m)
    expect(w.map((p) => p.key)).toEqual(['placement:vgc_belt_ambush'])
    expect(w[0].fixes?.[0]).toEqual({ label: 'Spawn at vgc_convoy_wreck', action: 'spawnAt', arg: { encounter: 'vgc_belt_ambush', at: 'vgc_convoy_wreck' } })
    // it is part of the encounter checks
    const ctx = { model: m, index: { factions: [{ id: 'pirates' }], markets: [], variants: [] }, defs: { fleetTypes: [{ id: m.encounters[0].fleet.type }] } } as unknown as CheckContext
    expect(encounterProblems(ctx).some((p) => p.key === 'placement:vgc_belt_ambush')).toBe(true)
    applyPatternFix(m, 'spawnAt', w[0].fixes![0].arg)
    expect(encounterPlacementProblems(m)).toEqual([])
  })

  it('a fleet spawned by an Action (not fought) counts as spawned by a quest', () => {
    const m = vanguardModel()
    const lc = m.quests.find((q) => q.id === 'vgc_lost_convoy')!
    lc.nodes = lc.nodes.filter((n) => n.id !== 'ambush')
    lc.edges = lc.edges.filter((e) => e.from !== 'ambush' && e.to !== 'ambush')
    const ctx = { model: m, index: { factions: [{ id: 'pirates' }], markets: [], variants: [] }, defs: { fleetTypes: [{ id: m.encounters[0].fleet.type }] } } as unknown as CheckContext
    const noQuest = (c: CheckContext) => encounterProblems(c).filter((p) => p.message.includes('no quest or world event spawns it'))
    expect(noQuest(ctx)).toHaveLength(1)
    lc.nodes.push({ id: 'escort', type: 'action', x: 0, y: 0, title: 'Escort', ops: [{ op: 'spawn', encounter: 'vgc_belt_ambush' }] })
    expect(noQuest(ctx)).toHaveLength(0)
  })
})

describe('a person\'s market (task #36)', () => {
  it('placement and the market\'s people list stay in step, and a mismatch is a warning', async () => {
    const { setPersonMarket, locationProblems } = await import('../src/shared/locations')
    const m = vanguardModel()
    const haven = () => m.systems[0].entities.find((e) => e.id === 'vgc_haven')!.market!
    setPersonMarket(m, 'vgc_reyes', null)
    expect(haven().people).toEqual([])
    expect(m.people[0].placement).toEqual({ at: 'none' })
    setPersonMarket(m, 'vgc_reyes', 'vgc_haven')
    expect(haven().people).toEqual(['vgc_reyes'])
    expect(m.people[0].placement).toEqual({ at: 'market', market: 'vgc_haven', inCommDirectory: true })
    // a vanilla market: only the placement
    setPersonMarket(m, 'vgc_reyes', 'jangala')
    expect(haven().people).toEqual([])
    expect(m.people[0].placement).toMatchObject({ market: 'jangala' })
    // edited by hand into a mismatch
    haven().people.push('vgc_reyes')
    const ctx = { model: m, index: { markets: [{ id: 'jangala', entities: [] }], systems: [], planetTypes: [{ id: 'barren' }], customEntityTypes: [], conditions: [], industries: [] }, loaded: { sourceId: 'vgc' } } as unknown as CheckContext
    expect(locationProblems(ctx).filter((p) => p.key === 'twomarkets:vgc_reyes')).toHaveLength(1)
  })
})

describe('labels and help on every field (task #36)', () => {
  it('every faction field has help', () => {
    const missing = FACTION_TABS.flatMap((t) => t.fields.filter((f) => !f.help?.trim()).map((f) => `${t.id}: ${f.path}`))
    expect(missing).toEqual([])
  })

  // the forms that edit the mod: every field goes through ui/Field.svelte (a visible label and help)
  const FORMS = [
    'pages/QuestsPage.svelte', 'quests/QuestSettings.svelte', 'quests/NodeInspector.svelte', 'quests/DialogInspector.svelte',
    'pages/PeoplePage.svelte', 'pages/ItemsPage.svelte', 'pages/LocationsPage.svelte', 'pages/EncountersPage.svelte',
    'pages/FactionsPage.svelte', 'pages/SagaPage.svelte', 'CreateModForm.svelte', 'export/ExportDialog.svelte'
  ]
  const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'src', f), 'utf8')

  it('every Field has a label and non-empty help', () => {
    for (const f of FORMS) {
      // each Field opens on one line; its attributes may hold arrows (=>), so read the whole line
      for (const tag of src(f).match(/<Field\b[^\n]*/g) ?? []) {
        expect(tag, f).toMatch(/\blabel="[^"]+"/)
        expect(tag, f).toMatch(/\bhelp=("[^"]{8,}"|\{)/)
      }
    }
  })

  it('no form keeps the old bare-label pattern (a grid label next to a control, with no help)', () => {
    for (const f of FORMS) {
      const s = src(f).replace(/<style>[\s\S]*$/, '')
      expect(s.match(/<span class="lbl[^"]*">[^<]+<\/span>\s*<(input|select|textarea|IdInput|LinesInput)/g) ?? [], f).toEqual([])
      expect(s.match(/<label for="[^"]+">[^<]+<\/label>\s*<(input|select|textarea)/g) ?? [], f).toEqual([])
    }
  })
})
