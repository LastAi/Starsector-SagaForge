/**
 * Task #67: the user-experience pass (docs/UX-PASS.md). Helpers that replace workarounds found while
 * building Heliopolis and the mod tasks.
 */
import { describe, expect, it } from 'vitest'
import { newQuest } from '../src/shared/quest'
import { compileQuest } from '../src/shared/export/questrules'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { questProblems } from '../src/shared/checks/quests'
import { defsFor } from '../src/shared/defs'
import { vanguardModel } from './fixtures/vanguard'
import type { CheckContext } from '../src/shared/checks'
import { handlesOf, newNode, renameReward, setWaitMode } from '../src/shared/quest'
import { encounterRuntime, needsSagaLib14, questRuntime } from '../src/shared/export/runtime'
import { newSimState, sagaHooks, fightOutcome } from '../src/shared/play'
import { eventRules, eventsRuntime, quietOps } from '../src/shared/export/events'
import { progressRules, progressRuntime } from '../src/shared/export/progress'
import fs from 'node:fs'
import { realDir } from './realdir'
import { parseSystemsJava } from '../src/shared/javasystems'
import { referenceSections } from '../src/shared/reference'
import { CRITERIA } from '../src/shared/targets'
import { FACTION_TABS, factionFieldRef } from '../src/shared/factionform'
import { ruleOptions } from '../src/shared/ruleoptions'
import { centredCrop, imageKind, importName, importPath, kindPath, upscales } from '../src/shared/imagekinds'
import { leftOutOfRelease } from '../src/shared/releasepack'
import { imageUses } from '../src/shared/imageuses'
import { exportableModel, inactiveEncounters, inactiveProblems } from '../src/shared/inactive'
import { effectiveFleet } from '../src/shared/encounters'
import { factionKnows, knownVariants, knowsHull, ownKnownShips, pickShips } from '../src/shared/shipsets'
import { referenceHtml } from '../src/shared/reference'
import { indexView, mergeEntry } from '../src/shared/indexview'
import { modUses } from '../src/shared/moduses'
import { newSystem, newEntity, newMarket } from '../src/shared/locations'
import type { GameIndex } from '../src/shared/api'
import { emptyModel } from '../src/shared/serialize'
import { MAX_ROWS, storylines } from '../src/shared/storylines'
import { renameSetting, settingsRead } from '../src/shared/settings'
import { addGroup, addToGroup, deleteGroup, groupsOf, groupsWith, inFilter, removeFromGroup, renameGroup, UNGROUPED } from '../src/shared/imagegroups'
import type { DialogNode, EventSchedulerPlan, FightNode, ProgressEventPlan } from '../src/shared/model'

const dialog = (id: string, options: { id: string; text: string }[], text = 'Text.'): DialogNode => ({ id, type: 'dialog', x: 0, y: 0, visual: { kind: 'keep' }, displays: [], text, highlights: [], options, conditions: [], script: [], phrases: [] })

describe('U6: first-time and repeat text', () => {
  const hub = (scope: 'visit' | 'ever') => {
    const q = newQuest('vgc_hub', 'Hub', 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_station'] }
    const d = dialog('hub', [{ id: 'ask', text: 'Ask' }, { id: 'bye', text: 'Leave' }], 'A long scene.\n\nMore of it.')
    d.repeat = { text: 'She waits.', highlights: ['waits'], scope }
    q.nodes = [q.nodes[0], d, dialog('answer', [{ id: 'back', text: 'Back' }], 'An answer.'), { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'hub' }, { id: 'b', from: 'hub', handle: 'ask', to: 'answer' }, { id: 'c', from: 'answer', handle: 'back', to: 'hub' }, { id: 'd', from: 'hub', handle: 'bye', to: 'menu' }]
    return compileQuest(q, { sagalib: true, phrases: [] })
  }
  it('the first rule sets a per-visit flag; the repeat rule needs it, scores higher and keeps the options', () => {
    const out = hub('visit')
    const first = out.rows.filter((r) => r.text.startsWith('A long scene'))
    const again = out.rows.filter((r) => r.text === 'She waits.')
    expect(first).toHaveLength(1)
    expect(again).toHaveLength(1)
    expect(first[0].script).toContain('$vgc_hub_hub_seen = true 0')
    expect(again[0].conditions.split('\n')).toEqual([...first[0].conditions.split('\n').filter(Boolean), '$vgc_hub_hub_seen score:1000'])
    expect(again[0].options).toBe(first[0].options)
    expect(again[0].script).toContain('SetTextHighlights "waits"')
    expect(again[0].script).not.toContain('seen = true')
    expect(out.generatedFlags.find((f) => f.node === 'hub')).toMatchObject({ key: '$vgc_hub_hub_seen', scope: 'conversation' })
  })
  it('Play: the first visit shows the scene, Back from a question shows the repeat text', () => {
    const ctx = newContext()
    ctx.memory.set('$id', 'vgc_station')
    const e = new Engine(compileRules(hub('visit').rows), ctx)
    e.fireBest('OpenInteractionDialog')
    expect(e.view.paragraphs.map((p) => p.text).join(' ')).toContain('A long scene')
    e.select('vgc_hub_ask')
    e.select('vgc_hub_back')
    const last = e.view.paragraphs[e.view.paragraphs.length - 1].text
    expect(last).toBe('She waits.')
    expect(e.view.options.map((o) => o.text)).toEqual(['Ask', 'Leave'])
  })
  it('"once ever" uses a $global flag', () => {
    const out = hub('ever')
    expect(out.rows.find((r) => r.text.startsWith('A long scene'))!.script).toContain('$global.vgc_hub_hub_seen = true')
    expect(out.rows.find((r) => r.text === 'She waits.')!.conditions).toContain('$global.vgc_hub_hub_seen score:1000')
  })
})

describe('U5: a conversation that continues another', () => {
  it('nodes entered by another quest\'s Link › trigger are reachable; the entry node gets an info line', () => {
    const m = vanguardModel()
    const b = newQuest('vgc_b', 'Quest B', 'dialog')
    b.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_station'] }
    b.nodes = [b.nodes[0], dialog('first', [{ id: 'x', text: 'Leave' }]), dialog('later', [{ id: 'y', text: 'Go on' }]), dialog('after', [{ id: 'z', text: 'Leave' }]), { id: 'm1', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }]
    b.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'first' }, { id: 'b', from: 'first', handle: 'x', to: 'm1' }, { id: 'c', from: 'later', handle: 'y', to: 'after' }, { id: 'd', from: 'after', handle: 'z', to: 'm1' }]
    const a = newQuest('vgc_a', 'Won', 'dialog')
    a.start = { kind: 'trigger', trigger: 'BeatDefendersContinue', conditions: ['$id == vgc_vault'] }
    a.nodes = [a.nodes[0], { id: 'into', type: 'link', x: 0, y: 0, mode: 'trigger', target: 'vgc_b_later', fire: 'FireBest' }]
    a.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'into' }]
    m.quests.push(b)
    const about = () => questProblems({ model: m, index: { people: [], items: [], factions: [], markets: [], variants: [] }, defs: defsFor('0.98a') } as unknown as CheckContext, b)
      .filter((p) => p.key?.startsWith('unreach:') || p.key?.startsWith('xreach:')).map((p) => p.key)
    expect(about()).toEqual(['unreach:vgc_b:later', 'unreach:vgc_b:after'])
    m.quests.push(a)
    expect(about()).toEqual(['xreach:vgc_b:later'])
  })
})

describe('U3: the Fight node', () => {
  const vault = () => {
    const q = newQuest('vgc_vault', 'Vault', 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_vault'] }
    const f = newNode('fight', 'guards', 0, 0) as FightNode
    f.fleet = { faction: 'remnant', size: 'fp', points: 120, quality: 1, name: 'The Guardians' }
    f.engageText = 'Engage the guardians'
    q.nodes = [q.nodes[0], dialog('wake', [{ id: 'go', text: 'Go closer' }]), f, dialog('inside', [{ id: 'bye', text: 'Leave' }], 'The door opens.'), { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'wake' }, { id: 'b', from: 'wake', handle: 'go', to: 'guards' }, { id: 'c', from: 'guards', handle: 'won', to: 'inside' }, { id: 'd', from: 'inside', handle: 'bye', to: 'menu' }]
    return q
  }
  it('has Won and Left outputs and exports SF_Fight, the won rule, and the fleet in the quest JSON', () => {
    const q = vault()
    expect(handlesOf(q.nodes[2]).map((h) => h.id)).toEqual(['won', 'left'])
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.rows.find((r) => r.script === 'SF_Fight vgc_vault guards')).toBeTruthy()
    expect(c.rows.find((r) => r.trigger === 'vgc_vault_guards_won')!.script).toContain('FireBest')
    expect(c.rows.some((r) => r.trigger === 'vgc_vault_guards_left')).toBe(false)
    const j = questRuntime(q, c) as { fights: unknown[] }
    expect(j.fights).toEqual([{ node: 'guards', won: 'vgc_vault_guards_won', left: 'vgc_vault_guards_left', engage: 'Engage the guardians',
      fleet: { faction: 'remnant', type: 'patrolMedium', size: 'fp', points: 120, quality: 1, name: 'The Guardians' } }])
  })
  it('a named fleet is written out with its ships, names and captain (SagaLib has no templates)', () => {
    const q = vault()
    ;(q.nodes[2] as FightNode).fleet = { faction: '', size: 'template', template: 'vgc_wardens' }
    const t = { id: 'vgc_wardens', name: 'Wardens', faction: 'remnant', fleetType: 'patrolLarge', ships: [{ variant: 'radiant_Standard', name: 'Eye' }, { variant: 'fulgent_Assault' }], captain: 'vgc_warden', captainDiesOnDefeat: true }
    const j = questRuntime(q, compileQuest(q, { sagalib: true, phrases: [] }), undefined, null, [], null, [t]) as { fights: { fleet: unknown }[] }
    expect(j.fights[0].fleet).toEqual({ faction: 'remnant', type: 'patrolLarge', size: 'explicit', points: 0, variants: ['radiant_Standard', 'fulgent_Assault'], shipNames: ['Eye', ''], flagship: 0, template: 'vgc_wardens', flagshipCommander: 'vgc_warden', captainDiesOnDefeat: true, name: 'Wardens' })
  })
  it('needs SagaLib 1.4', () => {
    const m = vanguardModel()
    expect(needsSagaLib14(m)).toBe(false)
    m.quests.push(vault())
    expect(needsSagaLib14(m)).toBe(true)
  })
  it('Play: asks how the fight went; Won goes on, Left with nothing connected closes the dialog', () => {
    const q = vault()
    const run = () => {
      const ctx = newContext()
      ctx.memory.set('$id', 'vgc_vault')
      const e = new Engine(compileRules(compileQuest(q, { sagalib: true, phrases: [] }).rows), ctx, sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
      e.fireBest('OpenInteractionDialog')
      e.select('vgc_vault_go')
      return e
    }
    const e = run()
    expect(e.view.options.map((o) => o.text)).toEqual(['(Play) Engage the guardians: win the fight', '(Play) Leave (or lose)'])
    fightOutcome(e, e.view.options[0].id)
    expect(e.view.paragraphs[e.view.paragraphs.length - 1].text).toBe('The door opens.')
    const e2 = run()
    fightOutcome(e2, e2.view.options[1].id)
    expect(e2.view.ended).toBe(true)
  })
  it('a fleet SagaLib can\'t build is an error', () => {
    const m = vanguardModel()
    const q = vault()
    const f = q.nodes[2] as FightNode
    f.fleet = { faction: '', size: 'explicit', variants: [] }
    m.quests.push(q)
    const msgs = questProblems({ model: m, index: { people: [], items: [], factions: [{ id: 'remnant' }], markets: [], variants: [], illustrations: [] }, defs: defsFor('0.98a') } as unknown as CheckContext, q).filter((p) => p.message.startsWith('Fight')).map((p) => p.message)
    expect(msgs).toEqual(['Fight "Defenders": pick the fleet\'s faction.', 'Fight "Defenders": list at least one ship variant.'])
  })
})

describe('U12: event actions without a dialog', () => {
  const kind = (id: string) => (id === 'alpha_core' ? 'special' as const : 'commodity' as const)
  it('actions SagaLib can run itself go into the JSON and get no rule; a raw line keeps the rule', () => {
    const s: EventSchedulerPlan = { id: 'vgc_ev', name: 'Events', min: 0, max: 1, intervalDays: 30, events: [
      { id: 'vgc_boom', name: 'Boom', weight: 1, conditions: [], durationDays: 5,
        start: [{ op: 'credits', amount: 100 }, { op: 'item', item: 'alpha_core', qty: 1 }, { op: 'set', key: '$global.vgc_boom', value: 'true', days: 5 }, { op: 'rep', faction: 'hegemony', amount: 3 }],
        end: [{ op: 'line', line: 'SomeVanillaCommand' }] }
    ] }
    const j = eventsRuntime(s, kind) as { entries: Record<string, unknown>[] }
    expect(j.entries[0].start).toEqual([{ op: 'credits', amount: 100 }, { op: 'item', id: 'alpha_core', kind: 'special', qty: 1 }, { op: 'set', key: '$global.vgc_boom', value: 'true', days: 5 }, { op: 'rep', faction: 'hegemony', amount: 3 }])
    expect(j.entries[0].end).toBeUndefined()
    expect(eventRules([s], 'plan', kind).map((r) => r.trigger)).toEqual(['SF_event_vgc_boom_end'])
    expect(eventRules([s], 'plan', kind, true).map((r) => r.trigger)).toEqual(['SF_event_vgc_boom_start', 'SF_event_vgc_boom_end'])
  })
  it('a named person\'s reputation runs quietly; "the person you\'re talking to" has nobody here (nothing runs, a check says so)', () => {
    expect(quietOps([{ op: 'rep', person: '$person', amount: 1 }])).toEqual([])
    expect(quietOps([{ op: 'rep', person: 'vgc_reyes', amount: 1 }])).toEqual([{ op: 'rep', person: 'vgc_reyes', amount: 1 }])
  })
  it('progress stages and outcomes: actions in the JSON, no rules', () => {
    const p: ProgressEventPlan = { id: 'vgc_pe', name: 'PE', max: 300, startConditions: [], factors: [], stages: [
      { id: 's1', progress: 100, title: 'S1', text: '', actions: [{ op: 'xp', amount: 500 }] },
      { id: 's2', progress: 200, title: 'S2', text: '', actions: [], outcomes: [{ id: 'o', label: 'O', weight: 1, actions: [{ op: 'storyPoints', amount: 1 }] }] }
    ] }
    const j = progressRuntime(p) as { stages: Record<string, unknown>[] }
    expect(j.stages[0].actions).toEqual([{ op: 'xp', amount: 500 }])
    expect((j.stages[1].outcomes as Record<string, unknown>[])[0].actions).toEqual([{ op: 'storyPoints', amount: 1 }])
    expect(progressRules([p])).toEqual([])
  })
})

describe('U4: a picture by the player\'s gender', () => {
  it('exports a FireBest pair: the female picture when $player.gender == FEMALE, else the default; Play shows the right one', () => {
    const q = newQuest('vgc_pic', 'Pic', 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_station'] }
    const d = dialog('scene', [{ id: 'bye', text: 'Leave' }])
    d.visual = { kind: 'illustration', category: 'illustrations', key: 'vgc_scene', female: { category: 'illustrations', key: 'vgc_scene_f' } }
    q.nodes = [q.nodes[0], d, { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'scene' }, { id: 'b', from: 'scene', handle: 'bye', to: 'menu' }]
    const rows = compileQuest(q, { sagalib: true, phrases: [] }).rows
    expect(rows.find((r) => r.text === 'Text.')!.script).toContain('FireBest vgc_pic_scene_visual')
    expect(rows.filter((r) => r.trigger === 'vgc_pic_scene_visual').map((r) => [r.conditions, r.script])).toEqual([['', 'ShowImageVisual vgc_scene'], ['$player.gender == FEMALE', 'ShowImageVisual vgc_scene_f']])
    const shown = (gender: 'MALE' | 'FEMALE') => {
      const ctx = newContext()
      ctx.memory.set('$id', 'vgc_station')
      ctx.player.gender = gender
      ctx.memory.set('$player.gender', gender) // as contextFrom / applyProfile set it
      const e = new Engine(compileRules(rows), ctx)
      e.fireBest('OpenInteractionDialog')
      return (e.view.visual as { key?: string }).key
    }
    expect(shown('MALE')).toBe('vgc_scene')
    expect(shown('FEMALE')).toBe('vgc_scene_f')
  })
})

describe('U7: Link › close the dialog', () => {
  it('exports vanilla\'s EndConversation, with no "back to the menu" after it', () => {
    const q = newQuest('vgc_comm', 'Comm', 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenCommLink', conditions: ['$id == vgc_fleet'] }
    q.nodes = [q.nodes[0], dialog('hail', [{ id: 'bye', text: 'Cut the link' }]), { id: 'gone', type: 'link', x: 0, y: 0, mode: 'close', target: '' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'hail' }, { id: 'b', from: 'hail', handle: 'bye', to: 'gone' }]
    const out = compileQuest(q, { sagalib: true, phrases: [] })
    const go = out.rows.find((r) => r.conditions.includes('$option =='))!
    expect(go.script.split('\n')).toEqual(['EndConversation'])
    expect(out.rows.some((r) => r.script.includes('SF_BackToMenu'))).toBe(false)
  })
})

describe('U21: image groups', () => {
  it('adds, fills, filters, renames and deletes groups per kind (an image may be in several)', () => {
    const p = emptyModel('vgc_').project
    expect(addGroup(p, 'portrait', ' Cats ')).toBe(true)
    expect(addGroup(p, 'portrait', 'cats')).toBe(false) // taken, any case
    addToGroup(p, 'portrait', 'Cats', ['graphics/portraits/b.png', 'graphics/portraits/a.png'])
    addToGroup(p, 'portrait', 'Alpha', ['graphics/portraits/a.png']) // made on the fly
    expect(groupsOf(p, 'portrait').map((g) => [g.name, g.images])).toEqual([['Cats', ['graphics/portraits/a.png', 'graphics/portraits/b.png']], ['Alpha', ['graphics/portraits/a.png']]])
    expect(groupsWith(p, 'portrait', 'graphics/portraits/a.png')).toEqual(['Cats', 'Alpha'])
    expect(groupsOf(p, 'illustration')).toEqual([])
    expect(inFilter(p, 'portrait', 'Alpha', 'graphics/portraits/b.png')).toBe(false)
    expect(inFilter(p, 'portrait', UNGROUPED, 'graphics/portraits/c.png')).toBe(true)
    expect(inFilter(p, 'portrait', '', 'graphics/portraits/c.png')).toBe(true)
    removeFromGroup(p, 'portrait', 'Cats', ['graphics/portraits/b.png'])
    expect(renameGroup(p, 'portrait', 'Alpha', 'cats')).toBe(false)
    expect(renameGroup(p, 'portrait', 'Alpha', 'Alpha collars')).toBe(true)
    deleteGroup(p, 'portrait', 'Cats')
    deleteGroup(p, 'portrait', 'Alpha collars')
    expect(p.imageGroups).toBeUndefined()
  })
})

describe('U19: the Saga board as storylines', () => {
  const quest = (id: string, extra: Partial<ReturnType<typeof newQuest>> = {}) => Object.assign(newQuest(id, id.toUpperCase(), 'quest'), extra)
  it('joins quests by prerequisites, starts and flags their start needs; negative tests and lone quests stay apart', () => {
    const hub = quest('vgc_hub')
    hub.nodes.push({ id: 'go', type: 'action', x: 0, y: 0, ops: [{ op: 'startQuest', quest: 'vgc_next' }] })
    const next = quest('vgc_next')
    const a = quest('vgc_a', { start: { kind: 'option', trigger: 'PopulateOptions', conditions: ['$global.vgc_met', '!$global.vgc_busy'], optionText: 'A' } })
    const b = quest('vgc_b', { requires: [{ quest: 'vgc_a', ended: 'success' }] })
    const busy = quest('vgc_busy_setter')
    const lone = quest('vgc_lone')
    const setters = (k: string) => (k === '$global.vgc_met' ? ['vgc_hub'] : k === '$global.vgc_busy' ? ['vgc_busy_setter'] : [])
    const { lanes, links } = storylines([hub, next, a, b, busy, lone], setters)
    expect(links.map((l) => `${l.kind}:${l.from}>${l.to}`).sort()).toEqual(['requires:vgc_a>vgc_b', 'starts:vgc_hub>vgc_next', 'unlocks:vgc_hub>vgc_a'])
    expect(lanes.map((l) => [l.title, l.quests.map((q) => `${q.id}@${q.col}.${q.row}`)])).toEqual([
      ['VGC_HUB', ['vgc_hub@0.0', 'vgc_next@1.0', 'vgc_a@1.1', 'vgc_b@2.0']],
      ['On their own', ['vgc_busy_setter@0.0', 'vgc_lone@1.0']]
    ])
  })
  it('wraps a step with more than MAX_ROWS quests into more columns', () => {
    const hub = quest('vgc_hub')
    const kids = Array.from({ length: MAX_ROWS + 2 }, (_, i) => quest(`vgc_k${i}`, { requires: [{ quest: 'vgc_hub', ended: 'any' }] }))
    const lane = storylines([hub, ...kids]).lanes[0]
    expect(lane.rows).toBe(MAX_ROWS)
    expect(lane.quests.find((q) => q.id === `vgc_k${MAX_ROWS}`)).toMatchObject({ col: 2, row: 0 })
  })
})

describe('U25: renaming a setting renames what uses it', () => {
  const model = () => {
    const m = emptyModel('vgc_')
    m.project.settings = [{ id: 'vgc_option_a', label: 'Option A', type: 'Boolean', tooltip: '', default: 'true', versions: true } as never, { id: 'vgc_option_ab', label: 'Other', type: 'Boolean', tooltip: '', default: 'false' } as never]
    const q = newQuest('vgc_q', 'Q', 'quest')
    q.requires = [{ flag: '$global.vgc_option_a' }, { flag: '$global.vgc_option_ab' }]
    m.quests.push(q)
    m.people.push({ id: 'vgc_p', name: { first: '', last: 'P' }, gender: 'FEMALE', faction: 'x', rank: 'r', post: 'p', portrait: '', placement: { at: 'none' }, tags: [], phrases: [], versions: [{ mods: ['setting:vgc_option_a=true'], set: { gender: 'MALE' } }] } as never)
    m.testProfiles.push({ id: 't', name: 'T', quests: {}, flags: { '$global.vgc_option_a': 'false' }, player: {} })
    return m
  }
  it('a version that depends on it counts as reading it (its id no longer follows the label)', () => {
    expect(settingsRead(model()).get('vgc_option_a')).toContain('versions of person vgc_p')
  })
  it('conditions, version tokens and profile keys follow; a longer id that starts the same is left alone', () => {
    const m = model()
    m.project.settings![0].id = 'vgc_option_b'
    renameSetting(m, 'vgc_option_a', 'vgc_option_b')
    expect(m.quests[0].requires).toEqual([{ flag: '$global.vgc_option_b' }, { flag: '$global.vgc_option_ab' }])
    expect((m.people[0] as { versions: { mods: string[] }[] }).versions[0].mods).toEqual(['setting:vgc_option_b=true'])
    expect(m.testProfiles[0].flags).toEqual({ '$global.vgc_option_b': 'false' })
    expect(m.project.settings!.map((s) => s.id)).toEqual(['vgc_option_b', 'vgc_option_ab'])
  })
})

describe('U26: the core worlds\' stars and bodies', () => {
  it.skipIf(!realDir)('a system the script fetches (getStarSystem) is read like a created one; a mere lookup adds nothing', () => {
    const t = fs.readFileSync(`${realDir}/starsector-core/data/scripts/world/corvus/Corvus.java`, 'utf8')
    const s = parseSystemsJava(t, 'Corvus.java', 'starsector-core', () => true)
    expect(s.map((x) => [x.name, x.star?.type, x.bodies.length > 3])).toEqual([['Corvus', 'star_yellow', true]])
    expect(parseSystemsJava('void f(SectorAPI sector) { StarSystemAPI s = sector.getStarSystem("Corvus"); s.getStar(); }', 'X.java', 'mod')).toEqual([])
  })
})

describe('U32: the Colony conditions reference', () => {
  it.skipIf(!realDir)('the index reads each condition\'s description, icon and the planet types that roll it', async () => {
    const { buildIndex, detectInstall } = await import('../src/main/gameindex')
    const install = detectInstall(realDir!) as import('../src/shared/api').ValidInstall
    const { index } = await buildIndex(install, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const ore = index.conditions.find((c) => c.id === 'ore_moderate')!
    expect(ore).toMatchObject({ planetary: true, group: 'ore' })
    expect(ore.desc).toBeTruthy()
    expect(ore.icon).toMatch(/graphics\/.+\.png$/)
    expect(ore.onPlanets).toContain('barren')
    const hab = index.conditions.find((c) => c.id === 'habitable')!
    expect(hab.hazard).toBeCloseTo(-0.25)
    expect(hab.onPlanets).toContain('jungle')
  }, 60000)
  it('the reference lists them, planet conditions first, with icons, hazard and planet type names', () => {
    const html = referenceHtml(defsFor('0.98a'), { gameVersion: '0.98a', planetTypeName: (id) => (id === 'barren' ? 'Barren' : id), conditions: [
      { id: 'urbanized_polity', name: 'Urbanized Polity', definedBy: 'starsector-core', changedBy: [], desc: 'A dense center.' },
      { id: 'ore_moderate', name: 'Moderate ore deposits', definedBy: 'starsector-core', changedBy: [], planetary: true, group: 'ore', hazard: 0.25, onPlanets: ['barren'], iconUrl: 'file:///x/ore.png' }
    ] })
    expect(html).toContain('id="locations-conditions"')
    expect(html.indexOf('ore_moderate')).toBeLessThan(html.indexOf('urbanized_polity'))
    expect(html).toContain('<img class="ic" src="file:///x/ore.png" alt="">Moderate ore deposits')
    expect(html).toContain('<td>planet · ore</td><td>+25%</td><td class="mid">Barren</td>')
  })
})

describe('U33: the index as the active mod\'s game has it', () => {
  const core = 'starsector-core'
  const ix = (over: Record<string, unknown>) => ({ factions: [], planetTypes: [], customEntityTypes: [], ...over }) as unknown as GameIndex
  it('a market an unlisted mod changes keeps vanilla\'s owner; a listed mod\'s change counts', () => {
    const vanilla = { id: 'jangala', name: 'Jangala', faction: 'hegemony', size: 6, definedBy: core, changedBy: [] }
    const modded = { id: 'jangala', name: 'Jangala', faction: 'pirates', size: 7, definedBy: 'some_mod', changedBy: [] }
    const merged = { ...mergeEntry(vanilla as never, modded as never, true) as object, layers: [vanilla, modded], layerHow: true }
    const only = indexView(ix({ markets: [merged] }), new Set([core])).markets[0]
    expect([only.faction, only.size]).toEqual(['hegemony', 6])
    const listed = indexView(ix({ markets: [merged] }), new Set([core, 'some_mod'])).markets[0]
    expect([listed.faction, listed.size, listed.definedBy]).toEqual(['pirates', 7, core])
  })
  it('a CSV row an unlisted mod replaces keeps vanilla\'s name', () => {
    const a = { id: 'ore_moderate', name: 'Moderate ore deposits', definedBy: core, changedBy: [] }
    const b = { id: 'ore_moderate', name: 'Ore (modded)', definedBy: 'x_mod', changedBy: [] }
    const merged = { ...mergeEntry(a as never, b as never, 'csv') as object, layers: [a, b], layerHow: 'csv' }
    expect(indexView(ix({ conditions: [merged] }), new Set([core])).conditions[0].name).toBe('Moderate ore deposits')
  })
  it('faction name and colour, and a planet type\'s look, from the visible layers', () => {
    const f = { id: 'hegemony', name: 'Red Hegemony', color: [200, 40, 40, 255], colors: [{ sourceId: core, color: [255, 155, 0, 255] }, { sourceId: 'fmt', color: [200, 40, 40, 255] }], layerValues: [{ sourceId: core, name: 'Hegemony' }, { sourceId: 'fmt', name: 'Red Hegemony' }], definedBy: core, changedBy: ['fmt'] }
    const p = { id: 'jungle', name: 'Mod Jungle', isStar: false, texture: '', iconColor: [1, 2, 3, 255], raw: { name: 'Mod Jungle' }, rawLayers: [{ sourceId: core, raw: { name: 'Jungle', iconColor: [10, 200, 10, 255] } }, { sourceId: 'fmt', raw: { name: 'Mod Jungle', iconColor: [1, 2, 3, 255] } }], definedBy: core, changedBy: ['fmt'] }
    const v = indexView(ix({ factions: [f], planetTypes: [p] }), new Set([core]))
    expect([v.factions[0].name, v.factions[0].color]).toEqual(['Hegemony', [255, 155, 0, 255]])
    expect([v.planetTypes[0].name, v.planetTypes[0].iconColor]).toEqual(['Jungle', [10, 200, 10, 255]])
  })
  it.skipIf(!realDir)('the real index: Hegemony is vanilla\'s for a mod that lists no other mods', async () => {
    const { buildIndex, detectInstall } = await import('../src/main/gameindex')
    const { index } = await buildIndex(detectInstall(realDir!) as import('../src/shared/api').ValidInstall, { mode: 'workspace', workspaceDir: null, activeModDir: null })
    const heg = indexView(index, new Set([core])).factions.find((x) => x.id === 'hegemony')!
    const vanilla = index.factions.find((x) => x.id === 'hegemony')!.colors![0].color
    expect(heg.color).toEqual(vanilla)
    expect(heg.name).toBe('Hegemony')
  }, 60000)
})

describe('U33: uses of an unlisted mod\'s conditions, industries and hullmods are found', () => {
  it('a market condition and industry that only a mod defines count as using that mod', () => {
    const m = emptyModel('vgc_')
    const s = newSystem('vgc_sys', 'Sys', 0, 0)
    const st = newEntity('station', 'vgc_st', 'St', 'star', 2000, 0)
    st.market = { ...newMarket('vgc_st', 'St', 'independent'), conditions: ['x_rich_ore'], industries: ['x_refinery'] }
    s.entities.push(st)
    m.systems.push(s)
    const index = { factions: [], people: [], markets: [], codeSystems: [], systems: [], places: [], sagaQuests: [], hulls: [], variants: [], items: [], weapons: [], wings: [], portraits: [], illustrations: [], customEntityTypes: [], planetTypes: [],
      conditions: [{ id: 'x_rich_ore', name: 'Rich ore', definedBy: 'x_mod', changedBy: [] }], industries: [{ id: 'x_refinery', name: 'Refinery', definedBy: 'x_mod', changedBy: [] }], submarkets: [], hullmods: [], dropGroups: [], sources: [] } as unknown as GameIndex
    const uses = modUses(m, index, { sourceId: 'vgc', frameworkFiles: [] })
    expect(uses.get('x_mod')?.map((u) => `${u.kind}:${u.id}`)).toEqual(['condition:x_rich_ore', 'industry:x_refinery'])
  })
})

describe('U34: reference pages for fields that only show a name', () => {
  const o = (id: string, definedBy = 'starsector-core') => ({ id, definedBy, changedBy: [] as string[] })
  const ix = {
    sources: [{ id: 'starsector-core', name: 'Starsector' }, { id: 'modA', name: 'Mod A' }, { id: 'modB', name: 'Mod B' }],
    customEntityTypes: [
      { ...o('derelict_probe'), name: 'Derelict Probe', sprite: 'p.png', icon: '', sheet: '', tags: ['salvageable', 'has_interaction_dialog'], radius: 10, raw: { customDescriptionId: 'probe_desc' } },
      { ...o('comm_relay'), name: 'Comm Relay', sprite: 'r.png', icon: '', sheet: '', tags: ['objective'], radius: 10, raw: { pluginClass: 'a.b.CommRelayEntityPlugin' } },
      { ...o('base_constellation_label'), name: '<label>', sprite: '', icon: '', sheet: '', tags: [], radius: null, raw: {} },
      { ...o('b_thing', 'modB'), name: 'B thing', sprite: 'x.png', icon: '', sheet: '', tags: [], radius: null, raw: {} }
    ],
    salvageGen: [{ ...o('derelict_probe'), type: 'DISCOVERABLE', dropValue: 'basic:5000', dropRandom: 'ai_cores1:3, extended:1x3000', defFaction: 'derelict', probDefenders: 0.5, xpDiscover: 500, xpSalvage: 1500 }],
    typeDescs: [{ ...o('CUSTOM:probe_desc'), text: 'An old probe.' }],
    dropGroups: [
      { group: 'basic', item: 'metals', freq: 3, definedBy: 'starsector-core' }, { group: 'basic', item: 'nothing', freq: 1, definedBy: 'starsector-core' },
      { group: 'basic', item: 'nothing', freq: 0, definedBy: 'starsector-core' },
      { group: 'bp', item: 'item_ship_bp:{tags:[rare_bp, !no_drop]}', freq: 1, definedBy: 'modA' }
    ],
    items: [{ ...o('metals'), name: 'Metals' }], weapons: [{ ...o('lightmg'), name: 'Light MG', tags: ['base_bp'] }], wings: [], hullmods: [],
    hulls: [{ ...o('lasher'), name: 'Lasher', tags: ['lowtech_bp', 'base_bp'] }, { ...o('b_hull', 'modB'), name: 'B hull', tags: ['b_bp'] }],
    planetTypes: [], conditions: [], industries: [{ ...o('farming'), name: 'Farming', desc: 'Grows food.', tags: ['industry'], upkeep: 1 }], submarkets: [],
    skills: [{ ...o('helmsmanship'), name: 'Helmsmanship', tier: 1, officer: true, admiral: false, admin: false, desc: 'It sings.' }, { ...o('admin_only'), name: 'Admin', tier: 1, officer: false, admiral: false, admin: false }]
  } as unknown as GameIndex
  const facts = { ix, visible: new Set(['starsector-core', 'modA']) }
  const sec = (id: string) => referenceSections(defsFor('0.98a'), { gameVersion: '0.98a', index: facts }).find((s) => s.id === id)!

  it('entity types: dialog, salvage, code and description; labels and unlisted mods left out', () => {
    const s = sec('locations-entity-types')
    expect(s.rows.map((r) => r[0])).toEqual(['comm_relay', 'derelict_probe'])
    const probe = s.rows.find((r) => r[0] === 'derelict_probe')!
    expect(probe[2]).toBe('yes')
    expect(probe[3]).toBe('discovered by scanning; basic worth 5000; ai_cores1: 3 pick(s); extended: 1 roll(s) worth 3000; defenders (derelict) 50%; XP 500/1500')
    expect(probe[5]).toBe('An old probe.')
    expect(s.rows.find((r) => r[0] === 'comm_relay')![4]).toBe('objective; code: CommRelayEntityPlugin')
  })
  it('drop groups: chances by weight, filters in words, zero weights dropped, the mod named', () => {
    const s = sec('loot-drop-groups')
    expect(s.rows.find((r) => r[0] === 'basic')![1]).toBe('Metals 75%, nothing 25%')
    expect(s.rows.find((r) => r[0] === 'bp')).toEqual(['bp', 'any ship blueprint tagged rare_bp (not no_drop) 100%', 'Mod A'])
  })
  it('blueprint tags count hulls, weapons…; skills list officer and commander ones', () => {
    const s = sec('factions-blueprint-tags')
    expect(s.rows.map((r) => r[0])).toEqual(['base_bp', 'lowtech_bp'])
    expect(s.rows[0].slice(0, 4)).toEqual(['base_bp', '1', '', '1'])
    expect(sec('factions-skills').rows.map((r) => r[0])).toEqual(['helmsmanship'])
    expect(sec('locations-industries').rows[0]).toEqual(['farming', 'Farming', '1 / –', '', 'industry', 'Grows food.', ''])
  })
  it('the definitions pages and the editor pages are filled', () => {
    expect(sec('general-rep-levels').rows.map((r) => r[2])).toEqual(['-100 to -75', '-74 to -50', '-49 to -25', '-24 to -10', '-9 to 9', '10 to 24', '25 to 49', '50 to 74', '75 to 100'])
    expect(sec('rules-triggers').rows.length).toBeGreaterThan(500)
    expect(sec('people-importance').rows.every((r) => r[1])).toBe(true)
    expect(sec('quests-node-types').rows.length).toBeGreaterThan(10)
    // every random target criterion explains itself now
    expect(CRITERIA.filter((c) => !c.help)).toEqual([])
  })
  it('the pages exist without an index (fields link to them)', () => {
    const ids = referenceSections(defsFor('0.98a'), { gameVersion: '0.98a' }).map((s) => s.id)
    expect(ids).toContain('locations-entity-types')
    expect(ids).toContain('factions-blueprint-tags')
  })
  it('faction fields link their reference', () => {
    const f = FACTION_TABS.flatMap((t) => t.fields)
    expect(factionFieldRef(f.find((x) => x.path === 'knownShips.tags')!)).toBe('factions-blueprint-tags')
    expect(factionFieldRef(f.find((x) => x.path === 'factionDoctrine.officerSkills')!)).toBe('factions-skills')
    expect(factionFieldRef(f.find((x) => x.path === 'ranks.posts')!)).toBe('people-post')
    expect(factionFieldRef(f.find((x) => x.path === 'fleetTypeNames')!)).toBe('factions-fleet-types')
  })
})

describe('U34: option ids, raid and research icons', () => {
  const row = (id: string, trigger: string, conditions: string, options = '', script = '', sourceId = 'starsector-core') => ({ id, trigger, conditions, script, text: '', options, notes: '', sourceId, file: 'rules.csv', line: 1 })
  it('lists the options rules offer, with how many rules answer each', () => {
    const o = ruleOptions([
      row('salOpen', 'OpenInteractionDialog', '', '0:salExplore:Explore\nsalLeave:"Leave"\n#old:Old\n(dev)salDebug:Debug'),
      row('salAdd', 'PopulateOptions', '', '', 'AddOption 10 salScan "Scan it"'),
      row('salExp', 'DialogOptionSelected', '$option == salExplore'),
      row('salExp2', 'DialogOptionSelected', '$option == salExplore\n$x'),
      row('salLeaveSel', 'DialogOptionSelected', '$option == salLeave')
    ])
    expect(o).toEqual([
      { id: 'salDebug', text: 'Debug (dev mode only)', offeredIn: 'salOpen', answers: 0, sourceId: 'starsector-core' },
      { id: 'salExplore', text: 'Explore', offeredIn: 'salOpen', answers: 2, sourceId: 'starsector-core' },
      { id: 'salLeave', text: 'Leave', offeredIn: 'salOpen', answers: 1, sourceId: 'starsector-core' },
      { id: 'salScan', text: 'Scan it', offeredIn: 'salAdd', answers: 0, sourceId: 'starsector-core' }
    ])
  })
  it('the raid and research icon pages show each key with its picture; options follow the mod list', () => {
    const ix = { sources: [{ id: 'starsector-core', name: 'Starsector' }, { id: 'vok', name: 'VoK' }], graphicsIcons: [
      { id: 'raidObjectives/genericIcon', category: 'raidObjectives', key: 'genericIcon', path: 'graphics/icons/raid_objective.png', definedBy: 'starsector-core', changedBy: [] },
      { id: 'ui_icons_tech_tree/basic', category: 'ui_icons_tech_tree', key: 'basic', path: 'graphics/tech/basic.png', definedBy: 'vok', changedBy: [] }
    ] } as unknown as GameIndex
    const opts = [{ id: 'salExplore', text: 'Explore', offeredIn: 'salOpen', answers: 2, sourceId: 'starsector-core' }, { id: 'modOpt', text: 'X', offeredIn: 'm', answers: 1, sourceId: 'other' }]
    const s = referenceSections(defsFor('0.98a'), { gameVersion: '0.98a', index: { ix, visible: new Set(['starsector-core', 'vok']), iconUrl: (src, rel) => `file:///${src}/${rel}`, options: opts } })
    const raid = s.find((x) => x.id === 'quests-raid-icons')!
    expect(raid.rows).toEqual([['genericIcon', '', 'graphics/icons/raid_objective.png', '']])
    expect(raid.icons).toEqual(['file:///starsector-core/graphics/icons/raid_objective.png'])
    expect(s.find((x) => x.id === 'saga-research-icons')!.rows).toEqual([['basic', '', 'graphics/tech/basic.png', 'VoK']])
    expect(s.find((x) => x.id === 'rules-options')!.rows).toEqual([['salExplore', 'Explore', 'salOpen', '2', '']])
  })
})

describe('#67: what a form shows is what is stored', () => {
  it('a Wait switched to days stores the 7 days the form shows (it exported 0)', () => {
    const q = newQuest('t_q', 'Q')
    q.nodes.push({ ...newNode('wait', 'w', 0, 0) } as never)
    setWaitMode(q, 'w', 'days')
    expect((q.nodes.find((n) => n.id === 'w') as { days?: number }).days).toBe(7)
  })
  it('renaming a reward renames it in End nodes and "Give a reward" steps; a step without one is an error', () => {
    const m = vanguardModel()
    const q = newQuest('t_q', 'Q')
    q.rewards = [{ id: 'pay', credits: 100 } as never]
    q.nodes.push({ id: 'e', type: 'end', x: 0, y: 0, outcome: 'success', reward: 'pay' } as never, { id: 'a', type: 'action', x: 0, y: 0, ops: [{ op: 'reward', reward: 'pay' }, { op: 'reward', reward: '' }] } as never)
    renameReward(q, 'pay', 'big_pay')
    expect((q.nodes.find((n) => n.id === 'e') as { reward?: string }).reward).toBe('big_pay')
    expect((q.nodes.find((n) => n.id === 'a') as { ops: { reward: string }[] }).ops[0].reward).toBe('big_pay')
    m.quests.push(q)
    const msgs = questProblems({ model: m, index: { people: [], items: [], factions: [], markets: [], variants: [] }, defs: defsFor('0.98a') } as unknown as CheckContext, q).map((p) => p.message)
    expect(msgs).toContain('"a": "Give a reward" has no reward picked.')
  })
})

describe('#67 U38: image names, originals, upscaling, deleting', () => {
  const portrait = imageKind('portrait'), orig = imageKind('original')
  it('a typed name gets the prefix and the kind\'s folder; the path is only derived from it', () => {
    expect(importName(portrait, 'Jane', 'toc_')).toBe('toc_jane')
    expect(importName(portrait, 'toc_jane.png', 'toc_')).toBe('toc_jane')
    expect(kindPath(portrait, 'toc_jane', 'C:/x/Jane.JPG')).toBe('graphics/portraits/toc_jane.png')
    expect(importPath(portrait, 'C:/pics/Mainecoon Beta.jpg', 'sfw_')).toBe('graphics/portraits/sfw_mainecoon_beta.png')
  })
  it('originals keep their format, size and whole picture, in sagaforge/originals', () => {
    expect(importPath(orig, 'C:/pics/Jane Doe.jpeg', 'toc_')).toBe('sagaforge/originals/toc_jane_doe.jpg')
    expect(importPath(orig, 'C:/pics/cat.png', 'toc_')).toBe('sagaforge/originals/toc_cat.png')
    expect(centredCrop(1200, 896, orig)).toEqual({ x: 0, y: 0, w: 1200, h: 896 })
    expect(upscales({ w: 10, h: 10 }, orig)).toBe(false)
  })
  it('a crop smaller than the result is an upscale', () => {
    expect(upscales({ w: 100, h: 100 }, portrait)).toBe(true)
    expect(upscales({ w: 128, h: 128 }, portrait)).toBe(false)
    expect(upscales({ w: 896, h: 896 }, portrait)).toBe(false)
  })
  it('the release zip leaves the originals out unless asked', () => {
    expect(leftOutOfRelease('sagaforge/originals/toc_jane.jpg')).toBe('original images')
    expect(leftOutOfRelease('sagaforge/originals/toc_jane.jpg', { originals: true })).toBeNull()
    expect(leftOutOfRelease('sagaforge/project.json', { originals: true })).toBe('Saga Forge plans')
  })
  it('finds where an image is used before it is deleted', () => {
    const m = emptyModel()
    m.people.push({ id: 'toc_john', name: { first: 'John', last: 'Starsector' }, portrait: 'graphics/portraits/toc_john.png' } as never)
    m.project.illustrations = { toc_gala: 'graphics/illustrations/toc_gala.png' }
    m.quests.push({ id: 'toc_q', title: 'The Other Captain', nodes: [{ visual: { kind: 'illustration', key: 'toc_gala' } }] } as never)
    expect(imageUses(m, 'graphics/portraits/toc_john.png')).toEqual(['Person "John Starsector"'])
    expect(imageUses(m, 'graphics/illustrations/toc_gala.png')).toEqual(['Quest "The Other Captain"'])
    expect(imageUses(m, 'graphics/portraits/nobody.png')).toEqual([])
  })
})

describe('#67 U39: ships as a faction\'s fleets would have them', () => {
  const o = (id: string, definedBy = 'starsector-core') => ({ id, definedBy, changedBy: [] as string[] })
  const ix = {
    factions: [{ ...o('hegemony'), knownShips: [{ sourceId: 'starsector-core', hulls: ['lasher'], tags: ['hegemony'] }, { sourceId: 'modX', hulls: ['xship'], tags: [] }] }],
    hulls: [{ ...o('lasher'), name: 'Lasher', tags: [] }, { ...o('enforcer'), name: 'Enforcer', tags: ['hegemony'] }, { ...o('tempest'), name: 'Tempest', tags: ['tritachyon'] }, { ...o('xship', 'modX'), name: 'X', tags: [] }],
    variants: [{ ...o('lasher_CS'), name: 'lasher_CS', hull: 'lasher' }, { ...o('enforcer_Elite'), name: 'enforcer_Elite', hull: 'enforcer' }, { ...o('tempest_Attack'), name: 'tempest_Attack', hull: 'tempest' }, { ...o('xship_A', 'modX'), name: 'xship_A', hull: 'xship' }],
    shipRoles: [
      { role: 'combatSmall', variant: 'lasher_CS', weight: 10, definedBy: 'starsector-core' }, { role: 'combatSmall', variant: 'tempest_Attack', weight: 10, definedBy: 'starsector-core' },
      { role: 'combatMedium', variant: 'enforcer_Elite', weight: 5, definedBy: 'starsector-core' }, { role: 'combatMedium', variant: 'xship_A', weight: 5, definedBy: 'modX' }
    ]
  } as unknown as GameIndex
  const vis = new Set(['starsector-core'])
  it('the faction knows hulls by id and by tag, from the sources that count (and the mod\'s own edits)', () => {
    const k = factionKnows(ix, 'hegemony', vis)
    expect(knownVariants(ix, k, vis).map((v) => v.id)).toEqual(['lasher_CS', 'enforcer_Elite'])
    expect(knownVariants(ix, factionKnows(ix, 'hegemony', new Set(['starsector-core', 'modX'])), new Set(['starsector-core', 'modX'])).map((v) => v.id)).toContain('xship_A')
    const own = ownKnownShips([{ kind: 'override', id: 'hegemony', file: '', patch: { set: {}, add: { 'knownShips.hulls': ['tempest'] } } }], 'hegemony')
    expect(knowsHull(ix, factionKnows(ix, 'hegemony', vis, own), 'tempest')).toBe(true)
  })
  it('a patrol is drawn from the roles, only ships the faction knows; the same seed gives the same list', () => {
    const k = factionKnows(ix, 'hegemony', vis)
    const a = pickShips(ix, k, 'patrol', 'medium', vis, 7)
    expect(a.variants).toEqual(['lasher_CS', 'lasher_CS', 'lasher_CS', 'enforcer_Elite', 'enforcer_Elite'])
    expect(pickShips(ix, k, 'patrol', 'medium', vis, 7)).toEqual(a)
    expect(pickShips(ix, k, 'carrier', 'small', vis, 1).empty).toEqual(['carrierSmall'])
  })
})

describe('#67 U40: always-there ships, a random part and extra groups', () => {
  const m = () => {
    const mm = emptyModel()
    mm.encounters.push({ format: 1, id: 'toc_hunters', name: 'Bounty hunters', fleet: { faction: 'mercenary', type: 'mercBountyHunter', size: 'explicit', variants: ['eagle_Assault'], randomPoints: 40,
      extras: [{ chance: 0.3, pick: 'all', ships: [{ variant: 'hammerhead_Balanced' }, { variant: 'hammerhead_Elite' }] }, { chance: 0.5, pick: 1, ships: [{ variant: 'condor_Support', weight: 2 }, { variant: 'drover_Strike' }] }] },
      spawn: { when: 'quest-stage', at: 'jangala' }, behavior: 'intercept-player', hostile: true } as never)
    return mm
  }
  it('exports randomPoints and extras as SagaLib 1.4 reads them, and needs SagaLib 1.4', () => {
    const mm = m()
    const f = encounterRuntime(mm.encounters[0], mm).fleet as Record<string, unknown>
    expect(f.randomPoints).toBe(40)
    expect(f.extras).toEqual(mm.encounters[0].fleet.extras)
    expect(needsSagaLib14(mm)).toBe(true)
    // fleet points: no random part key
    mm.encounters[0].fleet = { faction: 'pirates', type: 'raider', size: 'fp', points: 60, randomPoints: 10 } as never
    expect((encounterRuntime(mm.encounters[0], mm).fleet as Record<string, unknown>).randomPoints).toBeUndefined()
  })
})

describe('#67 U41: inactive encounters and named fleets', () => {
  const model = () => {
    const mm = emptyModel()
    mm.fleets = { templates: [{ id: 'toc_hunters', name: 'Hunters', faction: 'mercenary', fleetType: 'mercBountyHunter', ships: [{ variant: 'eagle_Assault' }], inactive: true } as never], typeNames: {} }
    mm.encounters.push(
      { format: 1, id: 'toc_off', name: 'Off', inactive: true, fleet: { faction: 'pirates', type: 'raider', size: 'fp', points: 50 }, spawn: { when: 'quest-stage', at: 'x' }, behavior: 'patrol', flags: {} } as never,
      { format: 1, id: 'toc_byfleet', name: 'By fleet', fleet: { faction: 'mercenary', type: 'mercBountyHunter', size: 'template', template: 'toc_hunters' }, spawn: { when: 'quest-stage', at: 'x' }, behavior: 'patrol', flags: {} } as never,
      { format: 1, id: 'toc_on', name: 'On', fleet: { faction: 'pirates', type: 'raider', size: 'fp', points: 50 }, spawn: { when: 'quest-stage', at: 'x' }, behavior: 'patrol', flags: {} } as never)
    mm.pools = [{ id: 'toc_pool', name: 'Hunters', draw: 'pickOne', entries: [{ id: 'toc_off', weight: 1, conditions: [] }, { id: 'toc_on', weight: 1, conditions: [] }] } as never]
    const q = newQuest('toc_q', 'Q')
    q.nodes.push({ id: 'enc1', type: 'encounter', x: 0, y: 0, encounter: 'toc_off' } as never)
    mm.quests.push(q)
    return mm
  }
  it('are left out of the export, with what uses them; an encounter with an inactive named fleet too', () => {
    const mm = model()
    expect(inactiveEncounters(mm)).toEqual(new Map([['toc_off', 'flag'], ['toc_byfleet', 'fleet']]))
    const x = exportableModel(mm)
    expect(x.encounters.map((e) => e.id)).toEqual(['toc_on'])
    expect(x.fleets?.templates).toEqual([])
    expect(x.pools?.[0].entries.map((e) => e.id)).toEqual(['toc_on'])
  })
  it('Problems flags the Encounter node, the pool and the encounter left out by its fleet', () => {
    const msgs = inactiveProblems(model()).map((p) => p.message)
    expect(msgs.some((t) => t.includes('spawns Off, which is inactive'))).toBe(true)
    expect(msgs.some((t) => t.includes('By fleet is not exported: its named fleet Hunters is inactive'))).toBe(true)
    expect(msgs.some((t) => t.includes('Pool "Hunters" lists Off'))).toBe(true)
  })
})

describe('#67 U42: only the fields of the chosen Ships count', () => {
  const mm = () => {
    const m = emptyModel()
    m.fleets = { templates: [{ id: 'toc_tax', name: 'Tax Collector', faction: 'hegemony', fleetType: 'investigators', captain: 'toc_anselm', ships: [{ variant: 'enforcer_XIV_Elite' }] } as never], typeNames: {} }
    m.people.push({ id: 'toc_anselm', name: { first: 'Anselm', last: 'Varro' }, phrases: [] } as never)
    // fleet points first (type "t", 80 points, quality 1), then switched to the named fleet: the old fields stay in the plan
    m.encounters.push({ format: 1, id: 'toc_back_taxes', name: 'Back Taxes', fleet: { faction: 'hegemony', type: 't', size: 'template', template: 'toc_tax', points: 80, quality: 1, variants: ['x_bad'] }, spawn: { when: 'new-game', at: 'jangala' }, behavior: 'intercept-player', flags: {} } as never)
    return m
  }
  it('a named fleet brings its own faction, type, ships and captain; the hidden ones are ignored', () => {
    const m = mm()
    expect(effectiveFleet(m.encounters[0], m)).toEqual({ faction: 'hegemony', type: 'investigators', size: 'template', template: 'toc_tax', variants: ['enforcer_XIV_Elite'], flagshipCommander: 'toc_anselm', name: 'Tax Collector' })
    const f = encounterRuntime(m.encounters[0], m).fleet as Record<string, unknown>
    expect(f.type).toBe('investigators')
    expect(f.points).toBe(0)
    expect(f.variants).toEqual(['enforcer_XIV_Elite'])
  })
  it('fleet points export only their own fields (no variants or template left over)', () => {
    const m = mm()
    m.encounters[0].fleet.size = 'fp'
    const f = encounterRuntime(m.encounters[0], m).fleet as Record<string, unknown>
    expect(Object.keys(f)).toEqual(['faction', 'type', 'size', 'points', 'quality'])
  })
})
